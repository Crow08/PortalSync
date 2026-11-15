import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { BehaviorSubject, Subject } from 'rxjs';
import { Album } from '../models/album';
import { Artist } from '../models/artist';
import { Media } from '../models/media';
import { MinimalMedia } from '../models/minimalMedia';
import { PlayerState } from '../models/playerState';
import { JoinCommand, SessionState } from '../models/session-command';
import { Song } from '../models/song';
import { User } from '../models/user';
import { AuthenticationService } from './authentication.service';
import { AutoplayService } from './autoplay.service';
import { ClockSyncService } from './clock-sync.service';
import { HttpHelperService } from './http-helper.service';
import { MediaInfoService } from './media-info.service';
import { MediaService } from './media.service';
import { PlaybackSyncService } from './playback-sync.service';
import { PlayerEngineService } from './player-engine.service';
import { SessionService } from './session.service';
import { SpotifyLoginPrompt } from './spotify-login-prompt';
import { SpotifyPlayerService } from './spotify-player.service';
import { SpotifyService } from './spotify.service';
import { UserStatusService } from './user-status.service';
import { WsService } from './ws.service';

const ME = 3;
/** Client clock minus server clock. */
const OFFSET = 100;

const songA = new MinimalMedia(7, 'song a', 'SONG');
const songB = new MinimalMedia(8, 'song b', 'SONG');
const video = new MinimalMedia(20, 'a video', 'VIDEO');

const fileSong = (media: MinimalMedia) =>
  new Song(
    media.id,
    'SONG',
    media.title,
    `/songs/${media.id}.mp3`,
    [],
    null as unknown as Artist,
    null as unknown as Album,
    [],
    false
  );
const spotifySong = (media: MinimalMedia) =>
  new Song(
    media.id,
    'SONG',
    media.title,
    'spotify:track:abc',
    [],
    null as unknown as Artist,
    null as unknown as Album,
    [],
    true
  );

describe('PlayerEngineService', () => {
  let engine: PlayerEngineService;
  /** Sends a message of the session topic to the engine. */
  let receive: (command: object | string) => void;
  let commands: string[];
  let sessionId: BehaviorSubject<number | null>;
  let details: (media: MinimalMedia) => Promise<Media>;

  const media = {
    mediaEndedSubject: new Subject<void>(),
    mediaCanPlayThrough: new Subject<void>(),
    timeUpdate: new Subject<void>(),
    mediaWaiting: new Subject<void>(),
    mediaPlaying: new Subject<void>(),
    currentTime: 0,
    getCurrentTime: () => media.currentTime,
    stop: vi.fn(),
    setSrc: vi.fn(),
    prepareAt: vi.fn(),
    pauseAtPosition: vi.fn(),
    activateAudioMode: vi.fn(),
    activateVideoMode: vi.fn(),
    activateSpotifyMode: vi.fn(),
    loadSpotify: vi.fn(() => Promise.resolve(true)),
  };
  const mediaInfo = {
    currentMedia: new Media(-1, 'SONG', '', '', []),
    songRating: 0,
    userSongRating: 0,
    thumbnailUrl: null,
    chapters: [],
    fetch: vi.fn((minimal: MinimalMedia) => details(minimal)),
    load: vi.fn(),
    loadSeekBarInfo: vi.fn(),
    showTitle: vi.fn(),
    showPlaceholder: vi.fn(),
    clear: vi.fn(),
    reset: vi.fn(),
    rate: vi.fn(),
  };
  const sync = {
    schedule: vi.fn((_startTime: number, _mediaTime: number, _mediaId: number, _onStart: () => void) => undefined),
    clear: vi.fn(),
    correctDrift: vi.fn(),
  };
  const session = {
    sessionId: null as unknown as BehaviorSubject<number | null>,
    acknowledgeJoin: vi.fn(),
    sessionDeleted: vi.fn(),
  };
  const ws = {
    errors: new Subject<{ message: string; destination: string }>(),
    publishSessionCommand: (command: string) => commands.push(command),
    subscribeToSessionTopic: vi.fn((callback: (body: string) => void) => {
      receive = (command) => callback(typeof command === 'string' ? command : JSON.stringify(command));
    }),
    unsubscribeFromSessionTopic: vi.fn(),
  };
  const userStatus = { setState: vi.fn(), setJoined: vi.fn(), setLatency: vi.fn(), setDrift: vi.fn() };
  const autoplay = { blocked: new BehaviorSubject(false), reportBlocked: vi.fn() };
  const clockSync = { serverTimeOffset: new BehaviorSubject(OFFSET), latency: new BehaviorSubject<number | null>(null) };
  const spotifyPlayer = {
    autoplayFailed: new Subject<void>(),
    error: new BehaviorSubject('No Spotify account connected'),
    connect: vi.fn(() => Promise.resolve(false)),
    activateElement: vi.fn(),
  };
  const spotify = { loggedIn: false, canRestore: false };
  const dialog = { open: vi.fn() };
  const http = { getPlain: vi.fn((path: string) => Promise.resolve(`http://server${path.split('?')[0]}?signed`)) };

  /** Lets the promises of the engine (details, signed URL) run. */
  const settle = async () => {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
  };

  function join(overrides: Partial<JoinCommand> = {}): JoinCommand {
    return {
      type: 'Join',
      userId: ME,
      currentMedia: songA,
      queue: [songB],
      history: [],
      queueVersion: 5,
      sessionUsers: [new User(ME, 'anna'), new User(4, 'ben')],
      userStatuses: [{ userId: 4, state: 'READY', latency: 20, drift: 0 }],
      sessionState: 'STOP' as SessionState,
      loopMode: false,
      fairQueue: false,
      startServerTime: 50_000,
      startMediaTime: 0,
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    commands = [];
    sessionId = new BehaviorSubject<number | null>(null);
    session.sessionId = sessionId;
    details = (minimal) => Promise.resolve(fileSong(minimal));
    // fresh streams: the engines of earlier tests must not hear the events of this one
    media.mediaEndedSubject = new Subject<void>();
    media.mediaCanPlayThrough = new Subject<void>();
    media.timeUpdate = new Subject<void>();
    media.mediaWaiting = new Subject<void>();
    media.mediaPlaying = new Subject<void>();
    ws.errors = new Subject<{ message: string; destination: string }>();
    spotifyPlayer.autoplayFailed = new Subject<void>();
    clockSync.serverTimeOffset = new BehaviorSubject(OFFSET);
    clockSync.latency = new BehaviorSubject<number | null>(null);
    autoplay.blocked = new BehaviorSubject(false);
    media.currentTime = 0;
    spotify.loggedIn = false;
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });

    TestBed.configureTestingModule({
      providers: [
        { provide: HttpHelperService, useValue: http },
        { provide: AuthenticationService, useValue: { currentUserValue: new User(ME, 'anna') } },
        { provide: MediaService, useValue: media },
        { provide: WsService, useValue: ws },
        { provide: SessionService, useValue: session },
        { provide: AutoplayService, useValue: autoplay },
        { provide: UserStatusService, useValue: userStatus },
        { provide: ClockSyncService, useValue: clockSync },
        { provide: SpotifyPlayerService, useValue: spotifyPlayer },
        { provide: SpotifyService, useValue: spotify },
        { provide: SpotifyLoginPrompt, useValue: dialog },
        { provide: MediaInfoService, useValue: mediaInfo },
        { provide: PlaybackSyncService, useValue: sync },
        { provide: TranslocoService, useValue: { translate: (key: string) => key } },
      ],
    });
    engine = TestBed.inject(PlayerEngineService);
    sessionId.next(12);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('joining', () => {
    it('listens to the session as soon as the client is in one', () => {
      expect(ws.subscribeToSessionTopic).toHaveBeenCalledTimes(1);
    });

    it('takes the whole state of the session from the own join', () => {
      receive(join({ loopMode: true, fairQueue: true, history: [video] }));

      expect(engine.queue).toEqual([songB]);
      expect(engine.history).toEqual([video]);
      expect(engine.loopMode).toBe(true);
      expect(engine.fairQueue).toBe(true);
      expect(engine.sessionUsers.map((user) => user.username)).toEqual(['anna', 'ben']);
      expect(engine.userStatuses.get(4)?.state).toBe('READY');
      expect(session.acknowledgeJoin).toHaveBeenCalled();
      expect(userStatus.setJoined).toHaveBeenCalledWith(true);
    });

    it('takes only the users from the join of someone else', () => {
      receive(join());
      vi.clearAllMocks();

      receive(join({ userId: 4, queue: [], sessionUsers: [new User(ME, 'anna'), new User(4, 'ben'), new User(5, 'cleo')] }));

      expect(engine.sessionUsers).toHaveLength(3);
      expect(engine.queue).toEqual([songB]);
      expect(session.acknowledgeJoin).not.toHaveBeenCalled();
      expect(media.stop).not.toHaveBeenCalled();
    });

    it('shows a stopped session without loading its media', async () => {
      receive(join({ sessionState: 'STOP' }));
      await settle();

      expect(engine.playerState).toBe(PlayerState.STOP);
      expect(mediaInfo.showPlaceholder).toHaveBeenCalledWith(songA);
      expect(mediaInfo.load).toHaveBeenCalledWith(songA);
      expect(media.setSrc).not.toHaveBeenCalled();
      expect(userStatus.setState).toHaveBeenLastCalledWith('IDLE');
    });

    it('shows nothing playing in a session that has not played yet', () => {
      receive(join({ currentMedia: null, queue: [] }));

      expect(mediaInfo.clear).toHaveBeenCalled();
      expect(engine.playerState).toBe(PlayerState.STOP);
    });

    it('loads the media of a paused session at its position', async () => {
      receive(join({ sessionState: 'PAUSE', startMediaTime: 42_000 }));
      await settle();

      expect(engine.playerState).toBe(PlayerState.PAUSE);
      expect(media.activateAudioMode).toHaveBeenCalled();
      expect(media.setSrc).toHaveBeenCalledWith('http://server/api/v1/media/data/7?signed');
      expect(media.prepareAt).toHaveBeenCalledWith(42);
      expect(sync.schedule).not.toHaveBeenCalled();
    });

    it('catches up with a playing session at the time the server names', async () => {
      receive(join({ sessionState: 'PLAY', startServerTime: 50_000, startMediaTime: 42_000 }));
      await settle();

      expect(engine.playerState).toBe(PlayerState.WAITING);
      expect(media.prepareAt).toHaveBeenCalledWith(42);
      // server time on the clock of the client, and the position passed on: the media element is still loading
      expect(sync.schedule).toHaveBeenCalledWith(50_000 + OFFSET, 42_000, 7, expect.any(Function));

      sync.schedule.mock.calls[0][3]();
      expect(engine.playerState).toBe(PlayerState.PLAY);
    });

    it('does not start a sync round by reporting ready after joining a playing session', async () => {
      receive(join({ sessionState: 'PLAY', startMediaTime: 42_000 }));
      await settle();

      media.currentTime = 42;
      media.mediaCanPlayThrough.next();

      expect(commands).toEqual([]);
    });

    it('takes part in a sync round that is running', async () => {
      receive(join({ sessionState: 'SYNC_PLAY', startMediaTime: 0 }));
      await settle();
      expect(engine.playerState).toBe(PlayerState.WAITING);

      media.mediaCanPlayThrough.next();

      expect(commands).toEqual(['ready/3/7/0']);
    });

    it('keeps a session that waits paused or stopped in that state', () => {
      receive(join({ sessionState: 'SYNC_PAUSE' }));
      expect(engine.playerState).toBe(PlayerState.PAUSE);

      receive(join({ sessionState: 'SYNC_STOP' }));
      expect(engine.playerState).toBe(PlayerState.STOP);
    });
  });

  describe('playback commands', () => {
    beforeEach(async () => {
      receive(join({ sessionState: 'PAUSE', startMediaTime: 42_000 }));
      await settle();
      vi.clearAllMocks();
      commands = [];
    });

    it('starts at the server time of a Start or Resume, from where the media is', () => {
      media.currentTime = 42;

      receive({ type: 'Resume', startServerTime: 60_000 });

      expect(engine.playerState).toBe(PlayerState.WAITING);
      expect(sync.schedule).toHaveBeenCalledWith(60_000 + OFFSET, 42_000, 7, expect.any(Function));

      receive({ type: 'Start', startServerTime: 70_000 });
      expect(sync.schedule).toHaveBeenLastCalledWith(70_000 + OFFSET, 42_000, 7, expect.any(Function));
    });

    it('pauses at the position of the session and cancels a start that is still pending', () => {
      receive({ type: 'Resume', startServerTime: 60_000 });

      receive({ type: 'Pause', mediaStopTime: 43_500 });

      expect(sync.clear).toHaveBeenCalled();
      expect(media.pauseAtPosition).toHaveBeenCalledWith(43_500);
      expect(engine.playerState).toBe(PlayerState.PAUSE);
    });

    it('seeks to a new position and reports ready when it is loaded', () => {
      receive({ type: 'Jump', startMediaTime: 90_000 });

      expect(sync.clear).toHaveBeenCalled();
      expect(media.prepareAt).toHaveBeenCalledWith(90);
      expect(userStatus.setState).toHaveBeenCalledWith('LOADING');

      media.currentTime = 90;
      media.mediaCanPlayThrough.next();
      expect(commands).toEqual(['ready/3/7/90000']);
    });

    it('reports ready once for a position, however often the browser says it could play', () => {
      receive({ type: 'Jump', startMediaTime: 90_000 });
      media.currentTime = 90;

      media.mediaCanPlayThrough.next();
      media.mediaCanPlayThrough.next();

      expect(commands).toHaveLength(1);
    });

    it('loads a new media, shows its title right away and takes the queue that came with it', async () => {
      receive({ type: 'SetMedia', currentMedia: songB, queue: [], history: [songA], queueVersion: 6 });
      await settle();

      expect(sync.clear).toHaveBeenCalled();
      expect(media.stop).toHaveBeenCalled();
      expect(mediaInfo.showTitle).toHaveBeenCalledWith('song b');
      expect(engine.queue).toEqual([]);
      expect(engine.history).toEqual([songA]);
      expect(media.setSrc).toHaveBeenCalledWith('http://server/api/v1/media/data/8?signed');
      expect(media.prepareAt).toHaveBeenCalledWith(0);
      expect(engine.preparedMediaId).toBe(8);
    });

    it('reports ready for the same media again when it is set again: every SetMedia is a new sync round', async () => {
      receive({ type: 'SetMedia', currentMedia: songB, queue: [], history: [], queueVersion: 6 });
      await settle();
      media.mediaCanPlayThrough.next();

      receive({ type: 'SetMedia', currentMedia: songB, queue: [], history: [], queueVersion: 7 });
      await settle();
      media.mediaCanPlayThrough.next();

      expect(commands).toEqual(['ready/3/8/0', 'ready/3/8/0']);
    });

    it('loads a video into the video element with what its seek bar needs', async () => {
      receive({ type: 'SetMedia', currentMedia: video, queue: [], history: [], queueVersion: 6 });
      await settle();

      expect(media.activateVideoMode).toHaveBeenCalled();
      expect(mediaInfo.loadSeekBarInfo).toHaveBeenCalledWith(video);
      expect(mediaInfo.load).toHaveBeenCalledWith(video);
      expect(media.setSrc).toHaveBeenCalledWith('http://server/api/v1/media/data/20?signed');
    });

    it('does not load a media that was replaced while its details were on their way', async () => {
      let answerFirst!: (song: Media) => void;
      details = (minimal) =>
        minimal.id === songB.id ? new Promise((resolve) => (answerFirst = resolve)) : Promise.resolve(fileSong(minimal));

      receive({ type: 'SetMedia', currentMedia: songB, queue: [], history: [], queueVersion: 6 });
      receive({ type: 'SetMedia', currentMedia: songA, queue: [], history: [], queueVersion: 7 });
      await settle();
      answerFirst(fileSong(songB));
      await settle();

      expect(media.setSrc).toHaveBeenCalledTimes(1);
      expect(media.setSrc).toHaveBeenCalledWith('http://server/api/v1/media/data/7?signed');
    });

    it('plays a song as a file when its details can not be loaded', async () => {
      details = () => Promise.reject(new Error('gone'));

      receive({ type: 'SetMedia', currentMedia: songB, queue: [], history: [], queueVersion: 6 });
      await settle();

      expect(media.setSrc).toHaveBeenCalledWith('http://server/api/v1/media/data/8?signed');
    });

    it('stops and keeps the queue on a plain stop', () => {
      receive({ type: 'Stop', queue: null, history: null, queueVersion: null });

      expect(sync.clear).toHaveBeenCalled();
      expect(media.stop).toHaveBeenCalled();
      expect(engine.playerState).toBe(PlayerState.STOP);
      expect(engine.queue).toEqual([songB]);
      expect(mediaInfo.clear).not.toHaveBeenCalled();
    });

    it('shows nothing playing when the queue ended', () => {
      receive({ type: 'Stop', queue: [], history: [songA, songB], queueVersion: 9 });

      expect(engine.queue).toEqual([]);
      expect(engine.history).toEqual([songA, songB]);
      expect(mediaInfo.clear).toHaveBeenCalled();
    });

    it('reports the end of the media to the session', () => {
      mediaInfo.currentMedia = new Media(7, 'SONG', 'song a', '', []);

      media.mediaEndedSubject.next();

      expect(commands).toEqual(['end/7']);
      mediaInfo.currentMedia = new Media(-1, 'SONG', '', '', []);
    });

    it('lets the sync service correct the drift of the loaded media while it plays', () => {
      media.timeUpdate.next();

      expect(sync.correctDrift).toHaveBeenCalledWith(7);
    });

    it('does nothing on the answer to a command that changed nothing', () => {
      receive({ type: 'Nop' });

      expect(sync.clear).not.toHaveBeenCalled();
      expect(engine.playerState).toBe(PlayerState.PAUSE);
    });
  });

  describe('queue and history', () => {
    beforeEach(() => {
      receive(join({ queue: [songB], history: [], queueVersion: 5 }));
    });

    it('takes a newer copy of the queue', () => {
      receive({ type: 'Update', updateType: 'Queue', queue: [songB, video], queueVersion: 6 });

      expect(engine.queue).toEqual([songB, video]);
    });

    it('drops a copy that is older than the one it shows: commands can overtake each other', () => {
      receive({ type: 'Update', updateType: 'Queue', queue: [songB, video], queueVersion: 7 });
      receive({ type: 'Update', updateType: 'Queue', queue: [video], queueVersion: 6 });

      expect(engine.queue).toEqual([songB, video]);
    });

    it('keeps the versions of queue and history apart: a newer history says nothing about the queue', () => {
      receive({ type: 'Update', updateType: 'History', history: [songA], queueVersion: 8 });
      receive({ type: 'Update', updateType: 'Queue', queue: [video], queueVersion: 7 });

      expect(engine.history).toEqual([songA]);
      expect(engine.queue).toEqual([video]);

      receive({ type: 'Update', updateType: 'History', history: [], queueVersion: 6 });
      expect(engine.history).toEqual([songA]);
    });

    it('takes both from an update of both', () => {
      receive({ type: 'Update', updateType: 'QueueAndHistory', queue: [], history: [songB], queueVersion: 6 });

      expect(engine.queue).toEqual([]);
      expect(engine.history).toEqual([songB]);
    });

    it('takes the queue of a SetMedia only if it is not older', () => {
      receive({ type: 'Update', updateType: 'Queue', queue: [video], queueVersion: 9 });

      receive({ type: 'SetMedia', currentMedia: songB, queue: [], history: [songA], queueVersion: 8 });

      expect(engine.queue).toEqual([video]);
      expect(engine.history).toEqual([songA]);
    });

    it('starts over with the own join, e.g. after the server was restarted and counts from the start again', () => {
      receive({ type: 'Update', updateType: 'Queue', queue: [video], queueVersion: 40 });

      receive(join({ queue: [songA], queueVersion: 1 }));
      expect(engine.queue).toEqual([songA]);

      receive({ type: 'Update', updateType: 'Queue', queue: [songB], queueVersion: 2 });
      expect(engine.queue).toEqual([songB]);
    });
  });

  describe('session state', () => {
    beforeEach(() => receive(join()));

    it('follows the loop and fair queue switches', () => {
      receive({ type: 'Update', updateType: 'LoopMode', loopMode: true });
      receive({ type: 'Update', updateType: 'FairQueue', fairQueue: true });

      expect(engine.loopMode).toBe(true);
      expect(engine.fairQueue).toBe(true);
    });

    it('keeps the playback status of the other users', () => {
      receive({
        type: 'Update',
        updateType: 'UserStatus',
        userStatus: { userId: 4, state: 'LOADING', latency: 35, drift: null },
      });

      expect(engine.userStatuses.get(4)).toEqual({ userId: 4, state: 'LOADING', latency: 35, drift: null });
    });

    it('forgets a user who left', () => {
      receive({ type: 'Leave', userId: 4 });

      expect(engine.sessionUsers.map((user) => user.id)).toEqual([ME]);
      expect(engine.userStatuses.has(4)).toBe(false);

      receive({ type: 'Leave', userId: 99 });
      expect(engine.sessionUsers).toHaveLength(1);
    });

    it('leaves a deleted session and says why', () => {
      const errors: string[] = [];
      ws.errors.subscribe((error) => errors.push(error.message));

      receive({ type: 'SessionDeleted' });

      expect(session.sessionDeleted).toHaveBeenCalled();
      expect(errors).toEqual(['player.sessionDeleted']);
    });

    it('ignores a message it does not know instead of taking it for another command', () => {
      receive({ type: 'Teleport', queue: [], history: [], queueVersion: 99 });
      receive('not json');

      expect(engine.queue).toEqual([songB]);
      expect(console.warn).toHaveBeenCalledTimes(2);
    });

    it('passes the latency on to the status the others see', () => {
      clockSync.latency.next(25);

      expect(userStatus.setLatency).toHaveBeenCalledWith(25);
    });

    it('passes on what is shown about the current media and the rating of the user', () => {
      mediaInfo.songRating = 4;

      expect(engine.songRating).toBe(4);
      expect(engine.currentMedia).toBe(mediaInfo.currentMedia);

      engine.onRating(5);
      expect(mediaInfo.rate).toHaveBeenCalledWith(5);
      mediaInfo.songRating = 0;
    });

    it('forgets everything and stops the playback when the session is left', () => {
      receive({ type: 'Update', updateType: 'LoopMode', loopMode: true });
      vi.clearAllMocks();

      sessionId.next(null);

      expect(ws.unsubscribeFromSessionTopic).toHaveBeenCalled();
      expect(sync.clear).toHaveBeenCalled();
      expect(media.stop).toHaveBeenCalled();
      expect(mediaInfo.reset).toHaveBeenCalled();
      expect(userStatus.setJoined).toHaveBeenCalledWith(false);
      expect(engine.queue).toEqual([]);
      expect(engine.sessionUsers).toEqual([]);
      expect(engine.loopMode).toBe(false);
      expect(engine.playerState).toBe(PlayerState.STOP);
      expect(engine.preparedMediaId).toBe(-1);
    });

    it('starts the next session without the versions of the previous one', () => {
      receive({ type: 'Update', updateType: 'Queue', queue: [video], queueVersion: 40 });
      sessionId.next(null);
      sessionId.next(13);

      receive({ type: 'Update', updateType: 'Queue', queue: [songA], queueVersion: 1 });

      expect(engine.queue).toEqual([songA]);
    });
  });

  describe('clients that can not load the media', () => {
    it('reports ready right away from a hidden tab the user never touched: browsers load nothing there', () => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      autoplay.blocked.next(true);
      receive(join());
      commands = [];

      receive({ type: 'SetMedia', currentMedia: songB, queue: [], history: [], queueVersion: 6 });
      expect(commands).toEqual(['ready/3/8/0']);

      receive({ type: 'Jump', startMediaTime: 30_000 });
      expect(commands).toEqual(['ready/3/8/0', 'ready/3/8/30000']);
    });

    it('waits for the media in a visible tab', () => {
      autoplay.blocked.next(true);
      receive(join());
      commands = [];

      receive({ type: 'SetMedia', currentMedia: songB, queue: [], history: [], queueVersion: 6 });

      expect(commands).toEqual([]);
    });

    it('tells the session it is ready when it can not play a Spotify song, and offers the login once', async () => {
      details = (minimal) => Promise.resolve(spotifySong(minimal));
      receive(join());
      commands = [];

      receive({ type: 'SetMedia', currentMedia: songB, queue: [], history: [], queueVersion: 6 });
      await settle();

      expect(media.activateSpotifyMode).toHaveBeenCalled();
      expect(media.setSrc).not.toHaveBeenCalled();
      expect(commands).toEqual(['ready/3/8/0']);
      expect(userStatus.setState).toHaveBeenLastCalledWith('UNAVAILABLE');
      expect(engine.playbackHint).toBe('player.spotify.unplayable');
      expect(dialog.open).toHaveBeenCalledTimes(1);

      receive({ type: 'SetMedia', currentMedia: songA, queue: [], history: [], queueVersion: 7 });
      await settle();
      expect(dialog.open).toHaveBeenCalledTimes(1);
    });

    it('plays a Spotify song through the Spotify player when it is connected', async () => {
      details = (minimal) => Promise.resolve(spotifySong(minimal));
      spotifyPlayer.connect.mockImplementation(() => Promise.resolve(true));
      receive(join());
      commands = [];

      receive({ type: 'SetMedia', currentMedia: songB, queue: [], history: [], queueVersion: 6 });
      await settle();
      await settle();

      expect(media.loadSpotify).toHaveBeenCalledWith('spotify:track:abc', 0);
      expect(engine.playbackHint).toBe('');
      expect(dialog.open).not.toHaveBeenCalled();
      expect(commands).toEqual([]);
      spotifyPlayer.connect.mockImplementation(() => Promise.resolve(false));
    });

    it('joins again after the first interaction when the Spotify player was blocked', () => {
      spotifyPlayer.autoplayFailed.next();
      expect(commands).toEqual([]);

      autoplay.reportBlocked.mock.calls[0][0]();

      expect(spotifyPlayer.activateElement).toHaveBeenCalled();
      expect(commands).toEqual(['join/3']);
    });
  });
});
