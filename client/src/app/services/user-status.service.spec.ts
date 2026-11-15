import { User } from '../models/user';
import { AuthenticationService } from './authentication.service';
import { UserStatusService } from './user-status.service';
import { WsService } from './ws.service';

describe('UserStatusService', () => {
  let reports: { command: string; status: { state: string; latency: number | null; drift: number | null } }[];
  let service: UserStatusService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    reports = [];
    const ws = {
      publishSessionCommand: (command: string, body: string) => reports.push({ command, status: JSON.parse(body) }),
    };
    const authentication = { currentUserValue: new User(3, 'anna') };
    service = new UserStatusService(ws as unknown as WsService, authentication as AuthenticationService);
  });

  afterEach(() => vi.useRealTimers());

  const last = () => reports[reports.length - 1].status;

  it('reports nothing before the session is joined: the server only takes reports of members', () => {
    service.setState('LOADING');
    service.setLatency(20);
    service.setDrift(300);
    vi.advanceTimersByTime(10_000);

    expect(reports).toHaveLength(0);
  });

  it('reports the current status with the join', () => {
    service.setState('LOADING');
    service.setLatency(20);

    service.setJoined(true);

    expect(reports).toEqual([{ command: 'status/3', status: { state: 'LOADING', latency: 20, drift: null } }]);
  });

  it('reports a new state right away, the same state not again', () => {
    service.setJoined(true);

    service.setState('LOADING');
    service.setState('LOADING');
    service.setState('READY');

    expect(reports.map((report) => report.status.state)).toEqual(['IDLE', 'LOADING', 'READY']);
  });

  it('reports the first latency right away and later only changes that matter', () => {
    service.setJoined(true);
    service.setLatency(20);
    expect(last().latency).toBe(20);
    const count = reports.length;

    service.setLatency(23);
    vi.advanceTimersByTime(10_000);
    expect(reports).toHaveLength(count);

    service.setLatency(30);
    vi.advanceTimersByTime(2000);
    expect(reports).toHaveLength(count + 1);
    expect(last().latency).toBe(30);
  });

  it('reports the start and the end of the playback right away', () => {
    service.setJoined(true);

    service.setDrift(12.4);
    expect(last().drift).toBe(12);

    service.setDrift(null);
    expect(last().drift).toBeNull();
    expect(reports).toHaveLength(3);
  });

  it('reports a changing drift at most every two seconds, with the latest value', () => {
    service.setJoined(true);
    service.setDrift(0);
    const count = reports.length;

    service.setDrift(100);
    service.setDrift(200);
    service.setDrift(300);
    expect(reports).toHaveLength(count);

    vi.advanceTimersByTime(1999);
    expect(reports).toHaveLength(count);
    vi.advanceTimersByTime(1);
    expect(reports).toHaveLength(count + 1);
    expect(last().drift).toBe(300);
  });

  it('does not report a drift that hardly changed', () => {
    service.setJoined(true);
    service.setDrift(100);
    const count = reports.length;

    service.setDrift(120);
    service.setDrift(140);
    vi.advanceTimersByTime(10_000);

    expect(reports).toHaveLength(count);
  });

  it('sends a report that is due together with a state change, not twice', () => {
    service.setJoined(true);
    service.setDrift(0);
    service.setDrift(500);
    const count = reports.length;

    service.setState('LOADING');
    vi.advanceTimersByTime(10_000);

    expect(reports).toHaveLength(count + 1);
    expect(last()).toEqual({ state: 'LOADING', latency: null, drift: 500 });
  });

  it('starts the next session idle and without a drift', () => {
    service.setJoined(true);
    service.setState('READY');
    service.setDrift(0);
    service.setDrift(500);

    service.setJoined(false);
    vi.advanceTimersByTime(10_000);
    const count = reports.length;
    service.setJoined(true);

    expect(reports).toHaveLength(count + 1);
    expect(last().state).toBe('IDLE');
    expect(last().drift).toBeNull();
  });

  it('reports nothing without a user', () => {
    const ws = { publishSessionCommand: vi.fn() };
    const loggedOut = new UserStatusService(ws as unknown as WsService, { currentUserValue: null } as AuthenticationService);

    loggedOut.setJoined(true);
    loggedOut.setState('READY');

    expect(ws.publishSessionCommand).not.toHaveBeenCalled();
  });
});
