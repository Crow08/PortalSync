import { Router } from '@angular/router';
import { RxStompState } from '@stomp/rx-stomp';
import { BehaviorSubject, Subject } from 'rxjs';
import { User } from '../models/user';
import { AuthenticationService } from './authentication.service';
import { RxStompService } from './rx-stomp.service';
import { SessionService } from './session.service';
import { WsConfigService } from './ws-config.service';
import { WsService } from './ws.service';

describe('SessionService', () => {
  let user: BehaviorSubject<User | null>;
  let connectionState: Subject<RxStompState>;
  let rxStomp: {
    configure: ReturnType<typeof vi.fn>;
    activate: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
  };
  let commands: string[];
  let navigations: string[];
  let config: WsConfigService;

  function create(loggedIn: User | null = new User(3, 'anna')): SessionService {
    user = new BehaviorSubject<User | null>(loggedIn);
    const authentication = {
      currentUserChanges: user,
      get currentUserValue() {
        return user.value;
      },
    };
    const router = {
      navigateByUrl: (url: string) => {
        navigations.push(url);
        return Promise.resolve(true);
      },
    };
    return new SessionService(
      router as unknown as Router,
      config,
      { ...rxStomp, connectionState$: connectionState } as unknown as RxStompService,
      authentication as unknown as AuthenticationService,
      { publishSessionCommand: (command: string) => commands.push(command) } as unknown as WsService
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    connectionState = new Subject();
    rxStomp = { configure: vi.fn(), activate: vi.fn(), deactivate: vi.fn(() => Promise.resolve()) };
    commands = [];
    navigations = [];
    config = new WsConfigService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('the WebSocket', () => {
    it('is open while a user is logged in', () => {
      create();

      expect(rxStomp.activate).toHaveBeenCalledTimes(1);
      expect(rxStomp.deactivate).not.toHaveBeenCalled();
    });

    it('stays closed without a login: the server would refuse the handshake', () => {
      create(null);

      expect(rxStomp.activate).not.toHaveBeenCalled();
    });

    it('opens with the login and closes with the logout', () => {
      create(null);
      // a client that starts logged out makes sure the socket is closed
      rxStomp.deactivate.mockClear();

      user.next(new User(3, 'anna'));
      expect(rxStomp.activate).toHaveBeenCalledTimes(1);
      expect(rxStomp.deactivate).not.toHaveBeenCalled();

      user.next(null);
      expect(rxStomp.deactivate).toHaveBeenCalledTimes(1);
    });

    it('is not opened again when the same user is announced again', () => {
      create();

      user.next(new User(3, 'anna'));

      expect(rxStomp.activate).toHaveBeenCalledTimes(1);
    });

    it('carries the session of the client, not its user, in the connect headers', () => {
      const service = create();

      service.init(12);

      expect(config.myRxStompConfig().connectHeaders).toEqual({ session: '12' });
      expect(rxStomp.configure).toHaveBeenCalledTimes(2);
    });
  });

  describe('joining', () => {
    it('opens the lobby of the session', () => {
      const service = create();

      service.joinSession(12);

      expect(service.sessionId.value).toBe(12);
      expect(navigations).toEqual(['/sessions/12/lobby']);
      // the lobby asks for the join once it listens to the session
      expect(commands).toEqual([]);
    });

    it('asks for the join and repeats it until the server answers', () => {
      const service = create();
      service.joinSession(12);

      service.ensureJoined();
      vi.advanceTimersByTime(0);
      expect(commands).toEqual(['join/3']);

      vi.advanceTimersByTime(2000);
      expect(commands).toEqual(['join/3', 'join/3']);

      service.acknowledgeJoin();
      vi.advanceTimersByTime(10_000);
      expect(commands).toHaveLength(2);
    });

    it('gives up after three attempts', () => {
      const service = create();
      service.joinSession(12);

      service.ensureJoined();
      vi.advanceTimersByTime(60_000);

      expect(commands).toEqual(['join/3', 'join/3', 'join/3']);
    });

    it('does not join again when the lobby of a joined session is opened again: that would interrupt the playback', () => {
      const service = create();
      service.joinSession(12);
      service.ensureJoined();
      vi.advanceTimersByTime(0);
      service.acknowledgeJoin();

      service.joinSession(12);
      service.ensureJoined();
      vi.advanceTimersByTime(10_000);

      expect(commands).toEqual(['join/3']);
    });

    it('joins again after the connection was lost, once the subscription is back', () => {
      const service = create();
      connectionState.next(RxStompState.OPEN);
      service.joinSession(12);
      service.ensureJoined();
      vi.advanceTimersByTime(0);
      service.acknowledgeJoin();

      connectionState.next(RxStompState.CLOSED);
      connectionState.next(RxStompState.OPEN);
      vi.advanceTimersByTime(499);
      expect(commands).toHaveLength(1);
      vi.advanceTimersByTime(1);

      expect(commands).toEqual(['join/3', 'join/3']);
    });

    it('does not join anything on the first connect or without a session', () => {
      create();

      connectionState.next(RxStompState.OPEN);
      connectionState.next(RxStompState.CLOSED);
      connectionState.next(RxStompState.OPEN);
      vi.advanceTimersByTime(10_000);

      expect(commands).toEqual([]);
    });
  });

  describe('leaving', () => {
    it('tells the server and forgets the session', () => {
      const service = create();
      service.joinSession(12);
      service.ensureJoined();

      service.leaveSession();
      vi.advanceTimersByTime(10_000);

      expect(commands).toEqual(['leave/3']);
      expect(service.sessionId.value).toBeNull();
    });

    it('leaves the session before entering another one', () => {
      const service = create();
      service.joinSession(12);

      service.joinSession(13);

      expect(commands).toEqual(['leave/3']);
      expect(service.sessionId.value).toBe(13);
    });

    it('joins a session again after it was left', () => {
      const service = create();
      service.joinSession(12);
      service.ensureJoined();
      vi.advanceTimersByTime(0);
      service.acknowledgeJoin();
      service.leaveSession();
      commands.length = 0;

      service.joinSession(12);
      service.ensureJoined();
      vi.advanceTimersByTime(0);

      expect(commands).toEqual(['join/3']);
    });

    it('goes back to the lobbies when the session was deleted, without a leave: everyone was kicked', () => {
      const service = create();
      service.joinSession(12);
      navigations.length = 0;

      service.sessionDeleted();

      expect(service.sessionId.value).toBeNull();
      expect(navigations).toEqual(['/']);
      expect(commands).toEqual([]);
    });

    it('forgets the session when the login ends, also without a logout', () => {
      const service = create();
      service.joinSession(12);
      service.ensureJoined();

      user.next(null);
      vi.advanceTimersByTime(10_000);

      expect(service.sessionId.value).toBeNull();
      expect(commands).toEqual([]);
      expect(rxStomp.deactivate).toHaveBeenCalledTimes(1);
    });
  });
});
