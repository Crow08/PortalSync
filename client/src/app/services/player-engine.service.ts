import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { distinctUntilChanged } from 'rxjs';
import { AuthenticationService } from './authentication.service';
import { Media } from '../models/media';
import { MediaService } from './media.service';
import { HttpHelperService } from './http-helper.service';
import { User } from '../models/user';
import { WsService } from './ws.service';
import { MinimalMedia } from '../models/minimalMedia';
import { Song } from '../models/song';
import { AutoplayService } from './autoplay.service';
import { Chapter } from '../models/chapter';
import { UserStatusService } from './user-status.service';
import { UserStatus } from '../models/userStatus';
import { ClockSyncService } from './clock-sync.service';
import { SessionService } from './session.service';
import { SpotifyPlayerService } from './spotify-player.service';
import { SpotifyService } from './spotify.service';
import { SpotifyLoginPrompt } from './spotify-login-prompt';
import { PlayerState } from '../models/playerState';
import { JoinCommand, QueueCopy, SessionCommand, UpdateCommand, parseSessionCommand } from '../models/session-command';
import { MediaInfoService } from './media-info.service';
import { PlaybackSyncService } from './playback-sync.service';

/** Fails to compile when a switch over a union misses a case. */
const unreachable = (value: never): void => console.warn('Unhandled command', value);

/**
 * The playback of the session this client is in. It lives as long as the app, not as long as a page: the playback
 * continues when the user switches between the lobby and the other pages. The components (full player, mini player) only
 * display its state and send commands.
 * <p>
 * It holds the state of the session (queue, users, ...), applies the commands of the server (see
 * `models/session-command.ts`) and loads the media. Two parts have their own services: when to play and how to stay in
 * time ({@link PlaybackSyncService}), and what is shown about the current media ({@link MediaInfoService}).
 */
@Injectable({
  providedIn: 'root',
})
export class PlayerEngineService {
  protected readonly tl = inject(TranslocoService);
  playerState: PlayerState = PlayerState.STOP;
  loopMode = false;
  /** Media are added to the queue in fair order (the users take turns) instead of at the end. */
  fairQueue = false;
  queue: MinimalMedia[] = [];
  history: MinimalMedia[] = [];
  sessionUsers: User[] = [];
  /** Playback status of the session users reported by their clients, by user id. */
  userStatuses = new Map<number, UserStatus>();
  /** Id of the media currently loaded into the media element. The details of the media are loaded asynchronously. */
  preparedMediaId = -1;
  lastReadyEvent: { mediaId: number; time: number } | null = null;
  /** Why the current media can not be played by this client (e.g. no Spotify Premium), empty while it can. */
  playbackHint = '';

  /**
   * Versions of the queue and history this client shows. Commands may arrive in another order than the server made the
   * changes: a copy older than the shown one is dropped (see applyQueue).
   */
  private queueVersion = -1;
  private historyVersion = -1;
  private inSession = false;
  /** The Spotify login dialog was shown in this session: it is not shown again for every Spotify song. */
  private spotifyLoginPrompted = false;

  constructor(
    private httpHelperService: HttpHelperService,
    private authenticationService: AuthenticationService,
    private mediaService: MediaService,
    private wsService: WsService,
    private sessionService: SessionService,
    private autoplayService: AutoplayService,
    private userStatusService: UserStatusService,
    private clockSyncService: ClockSyncService,
    private spotifyPlayer: SpotifyPlayerService,
    private spotifyService: SpotifyService,
    private spotifyLoginPrompt: SpotifyLoginPrompt,
    private mediaInfo: MediaInfoService,
    private sync: PlaybackSyncService
  ) {
    this.mediaService.mediaEndedSubject.subscribe(() => this.publishCommand(`end/${this.currentMedia.id}`));
    this.mediaService.timeUpdate.subscribe(() => this.sync.correctDrift(this.preparedMediaId));
    this.clockSyncService.latency.subscribe((latency) => latency !== null && this.userStatusService.setLatency(latency));
    // buffering counts as loading: in both cases the media can not be played right now
    this.mediaService.mediaWaiting.subscribe(() => this.userStatusService.setState('LOADING'));
    this.mediaService.mediaPlaying.subscribe(() => this.userStatusService.setState('READY'));
    this.mediaService.mediaCanPlayThrough.subscribe(() => {
      this.userStatusService.setState('READY');
      const id = this.authenticationService.currentUserValue?.id;
      const time = Math.round(this.mediaService.getCurrentTime() * 1000);
      !!id && this.indicateReadyFor(this.preparedMediaId, time);
    });

    // browsers only play the Spotify player after an interaction: then it is activated and the session joined again
    this.spotifyPlayer.autoplayFailed.subscribe(() =>
      this.autoplayService.reportBlocked(() => {
        this.spotifyPlayer.activateElement();
        const id = this.authenticationService.currentUserValue?.id;
        !!id && this.wsService.publishSessionCommand(`join/${id}`, 'join');
      })
    );

    // the session topic is listened to as long as the client is in a session, not only while the lobby is open
    this.sessionService.sessionId.pipe(distinctUntilChanged()).subscribe((id) => {
      if (this.inSession) {
        this.resetSession();
      }
      this.inSession = id !== null;
      if (id !== null) {
        this.wsService.subscribeToSessionTopic((body) => this.processMessage(body));
      }
    });
  }

  // --- what the player shows about the current media (see MediaInfoService) -------------------------------------------

  get currentMedia(): Media {
    return this.mediaInfo.currentMedia;
  }

  get songRating(): number {
    return this.mediaInfo.songRating;
  }

  get userSongRating(): number {
    return this.mediaInfo.userSongRating;
  }

  /** Pre-signed URL of the thumbnail sprite of the current video (seek bar preview), null if there is none. */
  get thumbnailUrl(): string | null {
    return this.mediaInfo.thumbnailUrl;
  }

  /** Chapters of the current video (seek bar markers), empty if there are none. */
  get chapters(): Chapter[] {
    return this.mediaInfo.chapters;
  }

  onRating(rating: number): void {
    this.mediaInfo.rate(rating);
  }

  publishCommand(name: string): void {
    this.wsService.publishSessionCommand(name, name);
  }

  /** Forgets the state of the session that was left and stops the playback. */
  private resetSession(): void {
    this.wsService.unsubscribeFromSessionTopic();
    this.userStatusService.setJoined(false);
    this.spotifyLoginPrompted = false;
    this.sync.clear();
    this.mediaService.stop();
    this.playerState = PlayerState.STOP;
    this.loopMode = false;
    this.fairQueue = false;
    this.queue = [];
    this.history = [];
    this.queueVersion = -1;
    this.historyVersion = -1;
    this.sessionUsers = [];
    this.userStatuses = new Map();
    this.mediaInfo.reset();
    this.preparedMediaId = -1;
    this.lastReadyEvent = null;
    this.playbackHint = '';
  }

  // --- loading the media --------------------------------------------------------------------------------------------

  private loadNewMedia(media: MinimalMedia | null, startMediaTime: number): void {
    if (!media || media.id === -1) {
      this.playerState = PlayerState.STOP;
      this.userStatusService.setState('IDLE');
      return;
    }
    this.userStatusService.setState('LOADING');
    const isVideo = media.type.toUpperCase() == 'VIDEO';
    this.preparedMediaId = media.id;
    this.playbackHint = '';

    this.mediaInfo.loadSeekBarInfo(media);
    if (isVideo) {
      this.loadFile(media, true, startMediaTime);
      this.mediaInfo.load(media);
      return;
    }
    // a song may be a Spotify track, which is not played from a file: its details tell (without them it is a file)
    this.mediaInfo
      .fetch(media)
      .catch((error) => {
        console.error(error);
        return null;
      })
      .then((details) => {
        // the media may have changed while the details were loaded
        if (this.preparedMediaId !== media.id) {
          return;
        }
        return details instanceof Song && details.spotify
          ? this.loadSpotifyTrack(media, details, startMediaTime)
          : this.loadFile(media, false, startMediaTime);
      })
      .catch(console.error);
  }

  private loadFile(media: MinimalMedia, isVideo: boolean, startMediaTime: number): Promise<void> {
    return this.httpHelperService
      .getPlain(`/api/v1/media/data/${media.id}?X-NPE-PSU-Duration=PT1H`)
      .then((url) => {
        isVideo ? this.mediaService.activateVideoMode() : this.mediaService.activateAudioMode();
        this.prepareMediaStart(url, startMediaTime);
      })
      .catch(console.error);
  }

  /** Loads a Spotify track into the player of this client, or tells the session that this client can not play it. */
  private async loadSpotifyTrack(media: MinimalMedia, song: Song, startMediaTime: number): Promise<void> {
    // from now on the commands of the session go to the Spotify player (and fail without it)
    this.mediaService.activateSpotifyMode();
    if (!(await this.spotifyPlayer.connect())) {
      this.promptSpotifyLogin();
      return this.spotifyUnavailable(media, startMediaTime, this.spotifyPlayer.error.value);
    }
    if (this.autoplayService.blocked.value) {
      this.autoplayService.reportBlocked(() => this.spotifyPlayer.activateElement());
    }
    if (this.preparedMediaId !== media.id) {
      return;
    }
    if (!(await this.mediaService.loadSpotify(song.uri, startMediaTime / 1000))) {
      return this.spotifyUnavailable(media, startMediaTime, this.tl.translate('player.spotify.trackFailed'));
    }
  }

  /** Offers the Spotify login (once per session) when the track can not be played because the user is not logged in. */
  private promptSpotifyLogin(): void {
    if (this.spotifyLoginPrompted || this.spotifyService.loggedIn || this.spotifyService.canRestore) {
      return;
    }
    this.spotifyLoginPrompted = true;
    this.spotifyLoginPrompt.open();
  }

  /** The others must not wait for a client that can not play the media: it reports ready right away. */
  private spotifyUnavailable(media: MinimalMedia, startMediaTime: number, reason: string): void {
    console.error(`Spotify is not available: ${reason}`);
    this.playbackHint = this.tl.translate('player.spotify.unplayable', {
      reason: reason || this.tl.translate('player.spotify.unavailable'),
      title: media.title,
    });
    this.userStatusService.setState('UNAVAILABLE');
    this.indicateReadyFor(media.id, startMediaTime);
  }

  private prepareMediaStart(url: string | null, startMediaTime: number): void {
    if (!!url) {
      this.mediaService.setSrc(url);
    }
    this.mediaService.prepareAt(startMediaTime / 1000);
  }

  // --- commands of the session --------------------------------------------------------------------------------------

  private processMessage(json: string): void {
    const command = parseSessionCommand(json);
    if (command) {
      this.processCommand(command);
    } else {
      console.warn('Ignored an unknown message of the session', json);
    }
  }

  private processCommand(command: SessionCommand): void {
    switch (command.type) {
      case 'Start':
      case 'Resume':
        this.schedulePlay(command.startServerTime + this.clockSyncService.serverTimeOffset.value);
        break;
      case 'SetMedia':
        // every SetMedia starts a new sync round on the server, even for the same media at the same position
        this.lastReadyEvent = null;
        this.sync.clear();
        this.mediaService.stop();
        this.loadNewMedia(command.currentMedia, 0);
        this.reportReadyIfUnableToLoad(command.currentMedia.id, 0);
        // the details of the media are loaded asynchronously, the title is shown right away
        this.mediaInfo.showTitle(command.currentMedia.title);
        // the server sends the queue and history along: they can not be derived from the media id, which may occur
        // several times in both
        this.applyQueue(command);
        break;
      case 'Pause':
        this.sync.clear();
        this.mediaService.pauseAtPosition(command.mediaStopTime);
        this.playerState = PlayerState.PAUSE;
        break;
      case 'Stop':
        this.sync.clear();
        this.mediaService.stop();
        this.userStatusService.setState('IDLE');
        this.playerState = PlayerState.STOP;
        // at the end of the queue the server sends the new queue and history: there is no current media any more
        if (command.history) {
          this.applyQueue(command);
          this.mediaInfo.clear();
        }
        break;
      case 'Leave': {
        const userIndex = this.sessionUsers.findIndex((value) => value.id === command.userId);
        if (userIndex != -1) {
          this.sessionUsers.splice(userIndex, 1);
        }
        this.userStatuses.delete(command.userId);
        break;
      }
      case 'SessionDeleted':
        this.sessionService.sessionDeleted();
        this.wsService.errors.next({ message: this.tl.translate('player.sessionDeleted'), destination: '' });
        break;
      case 'Jump':
        this.lastReadyEvent = null;
        this.sync.clear();
        this.userStatusService.setState('LOADING');
        this.prepareMediaStart(null, command.startMediaTime);
        this.reportReadyIfUnableToLoad(this.preparedMediaId, command.startMediaTime);
        break;
      case 'Join':
        this.sessionUsers = command.sessionUsers;
        this.userStatuses = new Map(command.userStatuses.map((status) => [status.userId, status]));
        if (command.userId === this.authenticationService.currentUserValue?.id) {
          this.joined(command);
        }
        break;
      case 'Update':
        this.processUpdate(command);
        break;
      case 'Nop':
        break;
      default:
        unreachable(command);
    }
  }

  /** The own join: the state of the session replaces whatever this client showed before. */
  private joined(command: JoinCommand): void {
    this.sessionService.acknowledgeJoin();
    this.userStatusService.setJoined(true);
    // also the versions: they may be those of a server that was restarted in the meantime
    this.applyQueue(command, true);
    this.loopMode = command.loopMode;
    this.fairQueue = command.fairQueue;
    const media = command.currentMedia;
    switch (command.sessionState) {
      case 'PLAY': {
        // set join event as last ready object to not trigger a new sync on join.
        this.lastReadyEvent = { mediaId: media?.id ?? -1, time: command.startMediaTime };
        this.loadNewMedia(media, command.startMediaTime);
        const startTime = command.startServerTime + this.clockSyncService.serverTimeOffset.value;
        // the media element is still loading here, so pass the position instead of reading it
        this.schedulePlay(startTime, command.startMediaTime);
        break;
      }
      case 'STOP':
        this.mediaService.stop();
        this.userStatusService.setState('IDLE');
        if (media) {
          // the media is not loaded while stopped, but its details and ratings are shown
          this.mediaInfo.showPlaceholder(media);
          this.mediaInfo.load(media);
        } else {
          // nothing has been played in this session yet
          this.mediaInfo.clear();
        }
        this.playerState = PlayerState.STOP;
        break;
      case 'PAUSE':
        this.loadNewMedia(media, command.startMediaTime);
        this.playerState = PlayerState.PAUSE;
        break;
      case 'SYNC_PLAY':
      case 'SYNC_PAUSE':
      case 'SYNC_STOP':
        // a sync round is running: load the media and report ready so the round can include this user
        this.lastReadyEvent = null;
        this.loadNewMedia(media, command.startMediaTime);
        if (media) {
          this.reportReadyIfUnableToLoad(media.id, command.startMediaTime);
        }
        this.playerState =
          command.sessionState === 'SYNC_PLAY'
            ? PlayerState.WAITING
            : command.sessionState === 'SYNC_PAUSE'
            ? PlayerState.PAUSE
            : PlayerState.STOP;
        break;
      default:
        unreachable(command.sessionState);
    }
  }

  private processUpdate(command: UpdateCommand): void {
    switch (command.updateType) {
      case 'LoopMode':
        this.loopMode = command.loopMode;
        break;
      case 'FairQueue':
        this.fairQueue = command.fairQueue;
        break;
      case 'Queue':
      case 'History':
      case 'QueueAndHistory':
        this.applyQueue(command);
        break;
      case 'UserStatus':
        this.userStatuses.set(command.userStatus.userId, command.userStatus);
        break;
      default:
        unreachable(command);
    }
  }

  /**
   * Takes over the queue and the history a command carries (one of them or both), unless this client already shows a
   * newer copy: the server counts the changes (queueVersion), and its commands can overtake each other.
   */
  private applyQueue(command: QueueCopy, force = false): void {
    const version = command.queueVersion ?? -1;
    if (command.queue && (force || version >= this.queueVersion)) {
      this.queue = command.queue;
      this.queueVersion = version;
    }
    if (command.history && (force || version >= this.historyVersion)) {
      this.history = command.history;
      this.historyVersion = version;
    }
  }

  // --- synchronized start (see PlaybackSyncService) -----------------------------------------------------------------

  /**
   * Browsers do not load media in hidden tabs before the user interacted with the page. Such a tab would never report
   * ready, so the others would wait for the sync timeout: it reports ready right away instead and catches up (drift
   * correction) once the user returns to the tab and interacts with it.
   */
  private reportReadyIfUnableToLoad(mediaId: number, time: number): void {
    if (document.hidden && this.autoplayService.blocked.value) {
      console.log('Hidden tab without user interaction can not load media: reporting ready');
      this.indicateReadyFor(mediaId, time);
    }
  }

  private indicateReadyFor(mediaId: number, time: number): boolean {
    if (this.lastReadyEvent?.time == time && this.lastReadyEvent?.mediaId == mediaId) {
      return false;
    } else {
      this.lastReadyEvent = { mediaId, time };
      const id = this.authenticationService.currentUserValue?.id;
      this.publishCommand(`ready/${id}/${mediaId}/${time}`);
      return true;
    }
  }

  /**
   * Starts the playback at the given client time.
   *
   * @param startTime client time in ms at which the playback starts.
   * @param mediaTime media position in ms at the start time, defaults to the position the media is prepared at.
   */
  private schedulePlay(startTime: number, mediaTime = Math.round(this.mediaService.getCurrentTime() * 1000)): void {
    this.playerState = PlayerState.WAITING;
    this.sync.schedule(startTime, mediaTime, this.preparedMediaId, () => (this.playerState = PlayerState.PLAY));
  }
}
