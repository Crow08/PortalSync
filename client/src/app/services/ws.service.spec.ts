import { Subject } from 'rxjs';
import { ClockSyncService } from './clock-sync.service';
import { RxStompService } from './rx-stomp.service';
import { WsConfigService } from './ws-config.service';
import { CommandError, WsService } from './ws.service';

interface Published {
  destination: string;
  body: string;
  headers: { [key: string]: string };
}

describe('WsService', () => {
  let topics: Map<string, Subject<{ body: string; headers: { [key: string]: string } }>>;
  let published: Published[];
  let config: WsConfigService;
  let responses: { [key: string]: string }[];
  let service: WsService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    topics = new Map();
    published = [];
    responses = [];
    config = new WsConfigService();
    const rxStomp = {
      publish: (message: Published) => published.push(message),
      watch: (destination: string) => {
        topics.set(destination, new Subject());
        return topics.get(destination)!;
      },
    };
    const clockSync = {
      tagCommand: (command: string) => (command === 'pause' ? { 'sync-id': 'tag-1' } : {}),
      onResponse: (headers: { [key: string]: string }) => responses.push(headers),
    };
    service = new WsService(config, rxStomp as unknown as RxStompService, clockSync as unknown as ClockSyncService);
    service.unsubscribeFromSessionTopic();
  });

  afterEach(() => {
    service.unsubscribeFromSessionTopic();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const sendError = (error: CommandError) =>
    topics.get('/user/queue/errors')!.next({ body: JSON.stringify(error), headers: {} });

  it('sends a command to the session of the connection', () => {
    config.updateWsConfig({ session: 12 });

    service.publishSessionCommand('skip', 'skip');

    expect(published).toEqual([{ destination: '/app/sessions/12/commands/skip', body: 'skip', headers: {} }]);
  });

  it('tags the commands the clock sync times', () => {
    config.updateWsConfig({ session: 12 });

    service.publishSessionCommand('pause', 'pause');

    expect(published[0].headers).toEqual({ 'sync-id': 'tag-1' });
  });

  it('sends nothing without a session', () => {
    config.configParameter.session = '';

    service.publishSessionCommand('skip', 'skip');

    expect(published).toEqual([]);
  });

  it('passes the commands of the session on and lets the clock sync see their headers', () => {
    config.updateWsConfig({ session: 12 });
    const received: string[] = [];
    service.subscribeToSessionTopic((body) => received.push(body));

    topics.get('/topic/sessions/12')!.next({ body: '{"type":"Nop"}', headers: { 'sync-id': 'tag-1' } });

    expect(received).toEqual(['{"type":"Nop"}']);
    expect(responses).toEqual([{ 'sync-id': 'tag-1' }]);
  });

  it('listens to one session only', () => {
    config.updateWsConfig({ session: 12 });
    const received: string[] = [];
    service.subscribeToSessionTopic((body) => received.push(`first ${body}`));
    const first = topics.get('/topic/sessions/12')!;
    config.updateWsConfig({ session: 13 });
    service.subscribeToSessionTopic((body) => received.push(`second ${body}`));

    first.next({ body: 'a', headers: {} });
    topics.get('/topic/sessions/13')!.next({ body: 'b', headers: {} });
    service.unsubscribeFromSessionTopic();
    topics.get('/topic/sessions/13')!.next({ body: 'c', headers: {} });

    expect(received).toEqual(['second b']);
  });

  it('passes the errors of the server on', () => {
    const errors: CommandError[] = [];
    service.errors.subscribe((error) => errors.push(error));

    sendError({ message: 'Session not found', destination: '/app/sessions/9/commands/skip' });

    expect(errors).toEqual([{ message: 'Session not found', destination: '/app/sessions/9/commands/skip' }]);
  });

  describe('a command with a result', () => {
    beforeEach(() => config.updateWsConfig({ session: 12 }));

    it('succeeded when no error arrives within a second', async () => {
      const result = service.publishSessionCommandWithResult('addMediaToQueue', '{"id":7}');
      expect(published).toHaveLength(1);

      vi.advanceTimersByTime(1000);

      await expect(result).resolves.toBe(true);
    });

    it('failed when the server answers with an error for it', async () => {
      const result = service.publishSessionCommandWithResult('addMediaToQueue', '{"id":7}');

      sendError({ message: 'Media not found', destination: '/app/sessions/12/commands/addMediaToQueue' });

      await expect(result).resolves.toBe(false);
    });

    it('is not failed by the error of another command', async () => {
      const result = service.publishSessionCommandWithResult('addMediaToQueue', '{"id":7}');

      sendError({ message: 'The queue has changed', destination: '/app/sessions/12/commands/skipTo/3/9' });
      vi.advanceTimersByTime(1000);

      await expect(result).resolves.toBe(true);
    });
  });
});
