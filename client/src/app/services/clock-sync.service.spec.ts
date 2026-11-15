import { RxStompState } from '@stomp/rx-stomp';
import { Subject } from 'rxjs';
import { User } from '../models/user';
import { AuthenticationService } from './authentication.service';
import { ClockSyncService } from './clock-sync.service';
import { RxStompService } from './rx-stomp.service';

interface Published {
  destination: string;
  body: string;
  headers: { [key: string]: string };
}

describe('ClockSyncService', () => {
  let connectionState: Subject<RxStompState>;
  let latencyTopic: Subject<{ headers: { [key: string]: string } }>;
  let published: Published[];
  let currentUser: User | null;
  let service: ClockSyncService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    connectionState = new Subject();
    latencyTopic = new Subject();
    published = [];
    currentUser = new User(3, 'anna');
    const rxStomp = {
      connectionState$: connectionState,
      publish: (message: Published) => published.push(message),
      watch: () => latencyTopic,
    };
    const authentication = {
      get currentUserValue() {
        return currentUser;
      },
    };
    service = new ClockSyncService(rxStomp as unknown as RxStompService, authentication as AuthenticationService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Answers the latest ping like the server: `latency` ms each way, the clock of the client is `clientAhead` ms ahead. */
  function answerPing(latency: number, clientAhead: number): void {
    const ping = published[published.length - 1];
    const sent = Date.now();
    vi.advanceTimersByTime(2 * latency);
    latencyTopic.next({
      headers: {
        'sync-id': ping.headers['sync-id'],
        'server-received': String(sent + latency - clientAhead),
        'server-sent': String(sent + latency - clientAhead),
      },
    });
  }

  describe('samples', () => {
    it('finds the offset of the clocks and the round trip without the time the server needed', () => {
      // the client clock is 1000 ms ahead; 20 ms on the network each way, 5 ms in the server
      service.addSample(11_000, 10_020, 10_025, 11_045);

      expect(service.serverTimeOffset.value).toBe(1000);
      expect(service.latency.value).toBe(40);
    });

    it('trusts the sample with the shortest round trip', () => {
      // a slow answer: its 300 ms were not spent evenly, the offset is off
      service.addSample(11_000, 10_250, 10_250, 11_300);
      expect(service.serverTimeOffset.value).toBe(900);

      service.addSample(12_000, 11_010, 11_010, 12_020);
      expect(service.serverTimeOffset.value).toBe(1000);

      // a slower sample afterwards does not replace the better one
      service.addSample(13_000, 12_190, 12_190, 13_200);
      expect(service.serverTimeOffset.value).toBe(1000);
    });

    it('reports the median round trip as latency', () => {
      service.addSample(1000, 1005, 1005, 1010);
      service.addSample(2000, 2015, 2015, 2030);
      service.addSample(3000, 3100, 3100, 3200);

      expect(service.latency.value).toBe(30);
    });

    it('forgets samples older than two minutes, so a changed clock is picked up', () => {
      service.addSample(1000, 1005, 1005, 1010);
      expect(service.serverTimeOffset.value).toBe(0);

      // the best sample is gone, the clock of the client was set forward by 500 ms meanwhile
      const later = 1010 + 2 * 60 * 1000 + 1;
      service.addSample(later, later - 500 + 20, later - 500 + 20, later + 40);

      expect(service.serverTimeOffset.value).toBe(500);
      expect(service.latency.value).toBe(40);
    });

    it('never reports a negative round trip', () => {
      service.addSample(1000, 1000, 1002, 1001);

      expect(service.latency.value).toBe(0);
    });
  });

  describe('timed commands', () => {
    it('tags the small, fast commands only', () => {
      expect(service.tagCommand('pause')['sync-id']).toBeTruthy();
      expect(service.tagCommand('jump/5000')['sync-id']).toBeTruthy();
      expect(service.tagCommand('status/3')['sync-id']).toBeTruthy();
      // answers with lists take longer than the network
      expect(service.tagCommand('join/3')).toEqual({});
      expect(service.tagCommand('addMediaToQueue')).toEqual({});
    });

    it('gives every command its own tag', () => {
      expect(service.tagCommand('pause')['sync-id']).not.toBe(service.tagCommand('pause')['sync-id']);
    });

    it('takes the answer to an own command as a sample, once', () => {
      const tag = service.tagCommand('pause')['sync-id'];
      vi.advanceTimersByTime(30);
      const answer = { 'sync-id': tag, 'server-received': String(Date.now() - 15), 'server-sent': String(Date.now() - 15) };

      expect(service.onResponse(answer)).toBe(tag);
      expect(service.latency.value).toBe(30);

      // the same broadcast again (or to another tab) is no second sample
      vi.advanceTimersByTime(500);
      expect(service.onResponse(answer)).toBeNull();
      expect(service.latency.value).toBe(30);
    });

    it('ignores the answers to commands of others', () => {
      expect(service.onResponse({ 'sync-id': 'someone-else-1', 'server-received': '1', 'server-sent': '2' })).toBeNull();
      expect(service.onResponse({})).toBeNull();
      expect(service.latency.value).toBeNull();
    });

    it('forgets a command that was never answered', () => {
      const tag = service.tagCommand('pause')['sync-id'];
      vi.advanceTimersByTime(11_000);
      service.tagCommand('resume');

      expect(service.onResponse({ 'sync-id': tag, 'server-received': '1', 'server-sent': '2' })).toBeNull();
    });

    it('takes no sample from an answer without the times of the server', () => {
      const tag = service.tagCommand('pause')['sync-id'];

      expect(service.onResponse({ 'sync-id': tag })).toBe(tag);
      expect(service.latency.value).toBeNull();
    });
  });

  describe('measuring after a connect', () => {
    it('sends ten pings, each after the answer to the one before', () => {
      connectionState.next(RxStompState.OPEN);
      expect(published).toHaveLength(1);
      expect(published[0].destination).toBe('/app/util/latency/3');

      for (let i = 0; i < 10; i++) {
        answerPing(10, 250);
      }

      expect(published).toHaveLength(10);
      expect(service.serverTimeOffset.value).toBe(250);
      expect(service.latency.value).toBe(20);
    });

    it('sends the next ping when an answer does not come', () => {
      connectionState.next(RxStompState.OPEN);

      vi.advanceTimersByTime(2000);

      expect(published).toHaveLength(2);
    });

    it('ignores a late answer to an earlier ping', () => {
      connectionState.next(RxStompState.OPEN);
      const first = published[0].headers['sync-id'];
      vi.advanceTimersByTime(2000);

      latencyTopic.next({ headers: { 'sync-id': first, 'server-received': '1', 'server-sent': '1' } });

      expect(published).toHaveLength(2);
    });

    it('measures again after a reconnect and stops the burst that was running', () => {
      connectionState.next(RxStompState.OPEN);
      connectionState.next(RxStompState.CLOSED);
      connectionState.next(RxStompState.OPEN);
      expect(published).toHaveLength(2);

      // only the new burst goes on
      vi.advanceTimersByTime(2000);
      expect(published).toHaveLength(3);
    });

    it('does not measure without a user', () => {
      currentUser = null;

      connectionState.next(RxStompState.OPEN);

      expect(published).toHaveLength(0);
    });
  });
});
