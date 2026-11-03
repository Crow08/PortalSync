import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DoCheck,
  ElementRef,
  HostBinding,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { PlayerComponent } from '../player.component';
import { ActivatedRoute } from '@angular/router';
import { MediaService } from '../../../services/media.service';
import { SessionService } from '../../../services/session.service';
import { SettingsService } from '../../../services/settings.service';
import { AutoplayService } from '../../../services/autoplay.service';
import { PlayerEngineService } from '../../../services/player-engine.service';

/** Height (px) of a playlist row, all rows must have this height (virtual scrolling). */
const PLAYLIST_ROW_HEIGHT = 48;
/** Number of history rows shown above the current media when scrolling to it. */
const PLAYLIST_ROWS_BEFORE_CURRENT = 2;

export type RoomTab = 'queue' | 'people';

/** Width (px) of the side panel without a choice of the user, and the limits of the choice. */
const SIDE_WIDTH_DEFAULT = 360;
const SIDE_WIDTH_MIN = 280;
const SIDE_WIDTH_MAX = 720;
/** The side panel never takes more than this share of the window, the stage keeps the rest. */
const SIDE_WIDTH_MAX_SHARE = 0.6;
/** Width change (px) of one arrow key press on the handle of the side panel. */
const SIDE_WIDTH_KEY_STEP = 24;

const COVER_GRADIENTS = [
  'linear-gradient(150deg, #7a3a5e, #ffbe5c)',
  'linear-gradient(150deg, #243b55, #8fa8ff)',
  'linear-gradient(150deg, #355c4a, #c7e39b)',
  'linear-gradient(150deg, #5e3a7a, #f59bb0)',
  'linear-gradient(150deg, #2a5e7a, #9fd6d0)',
];
const AVATAR_COLORS = ['#86dbc2', '#ffbe5c', '#8fa8ff', '#f59bb0', '#c7e39b', '#e39a6b'];

/** A row of the playlist: history, current media and queue in one list. */
interface PlaylistRow {
  type: 'history' | 'current' | 'queue';
  media: { id: number; title: string };
  /** Index in the history or the queue. */
  index: number;
}

/**
 * The room (lobby) of a session: the stage with the video or the cover, the transport bar and the side panel with the
 * queue and the people. The playback itself is handled by the app-wide {@link PlayerEngineService}.
 */
@Component({
    selector: 'app-room',
    templateUrl: './room.component.html',
    styleUrls: ['./room.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class RoomComponent extends PlayerComponent implements AfterViewInit, DoCheck, OnDestroy {
  tab: RoomTab = 'queue';
  /** Width of the side panel in px, the user changes it with the handle on its border. */
  sideWidth = SIDE_WIDTH_DEFAULT;
  readonly sideWidthMin = SIDE_WIDTH_MIN;
  /** Whether the handle of the side panel is dragged right now. */
  @HostBinding('class.resizing') resizing = false;
  private resizeStartX = 0;
  private resizeStartWidth = 0;

  @ViewChild('videoWrapper') videoWrapper: ElementRef | undefined;
  @ViewChild('playlistViewport') playlistViewport: CdkVirtualScrollViewport | undefined;
  readonly playlistRowHeight = PLAYLIST_ROW_HEIGHT;
  private playlistRowsCache: PlaylistRow[] = [];
  /** State the playlist rows were built from: history and queue are partly changed in place. */
  private playlistRowsSource: unknown[] = [];
  /** Current media (id and title) the playlist was last scrolled to, null before the first scroll. */
  private followedMedia: string | null = null;
  /** Row index of the followed media at the time it became current. */
  private followedRow = 0;
  private hideCursorTimeout: number | null = null;
  private singleVideoClickTimeout: number | null = null;
  private playlistResizeObserver: ResizeObserver | undefined;
  private readonly videoClickListener = () => this.onVideoClick();

  constructor(
    route: ActivatedRoute,
    engine: PlayerEngineService,
    mediaService: MediaService,
    settingsService: SettingsService,
    private sessionService: SessionService,
    private autoplayService: AutoplayService
  ) {
    super(engine, mediaService, settingsService);
    this.autoplayService.check();
    sessionService.joinSession(Number(route.snapshot.paramMap.get('sessionId')));
    this.sideWidth = this.clampSideWidth(settingsService.roomSideWidth ?? SIDE_WIDTH_DEFAULT);
  }

  @HostBinding('style.--side-width.px')
  get sideWidthStyle(): number {
    return this.sideWidth;
  }

  /** The largest width of the side panel: a share of the window, so the stage keeps its space. */
  get sideWidthMax(): number {
    return Math.max(SIDE_WIDTH_MIN, Math.min(SIDE_WIDTH_MAX, Math.round(window.innerWidth * SIDE_WIDTH_MAX_SHARE)));
  }

  startResize(event: PointerEvent): void {
    this.resizing = true;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.sideWidth;
    // the pointer is followed even when it leaves the handle or the window
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  /** The panel sits on the right, so dragging to the left makes it wider. */
  resize(event: PointerEvent): void {
    if (this.resizing) {
      this.sideWidth = this.clampSideWidth(this.resizeStartWidth + (this.resizeStartX - event.clientX));
    }
  }

  endResize(): void {
    if (this.resizing) {
      this.resizing = false;
      this.settingsService.roomSideWidth = this.sideWidth;
    }
  }

  /** Arrow left makes the panel wider, arrow right narrower, home restores the default width. */
  onResizeKey(event: KeyboardEvent): void {
    const change = event.key === 'ArrowLeft' ? SIDE_WIDTH_KEY_STEP : event.key === 'ArrowRight' ? -SIDE_WIDTH_KEY_STEP : 0;
    if (change === 0 && event.key !== 'Home') {
      return;
    }
    event.preventDefault();
    this.sideWidth = event.key === 'Home' ? SIDE_WIDTH_DEFAULT : this.clampSideWidth(this.sideWidth + change);
    this.settingsService.roomSideWidth = event.key === 'Home' ? null : this.sideWidth;
  }

  resetSideWidth(): void {
    this.sideWidth = SIDE_WIDTH_DEFAULT;
    this.settingsService.roomSideWidth = null;
  }

  private clampSideWidth(width: number): number {
    return Math.min(Math.max(Math.round(width), SIDE_WIDTH_MIN), this.sideWidthMax);
  }

  get hasMedia(): boolean {
    return this.currentMedia.id !== -1;
  }

  /** The video is shown for a video; a song or no media shows the cover. */
  get showVideo(): boolean {
    return this.hasMedia && this.isVideoMode();
  }

  /** "video" or "song", for the labels that name the current media. */
  get mediaNoun(): string {
    return this.currentMedia.type === 'VIDEO' ? 'video' : 'song';
  }

  get coverGradient(): string {
    return COVER_GRADIENTS[Math.abs(this.currentMedia.id) % COVER_GRADIENTS.length];
  }

  avatarColor(userId: number): string {
    return AVATAR_COLORS[userId % AVATAR_COLORS.length];
  }

  initials(username: string): string {
    return username.slice(0, 2).toUpperCase();
  }

  /** One line about the readiness of the listeners, e.g. "3 of 4 ready". */
  get readySummary(): string {
    const users = this.sessionUsers;
    const ready = users.filter((user) => this.getUserStatus(user.id)?.state === 'READY').length;
    return users.length > 0 && ready === users.length ? 'All ready' : `${ready} of ${users.length} ready`;
  }

  /** The largest drift (ms) of the listeners, null while nobody is playing. */
  get maxDrift(): number | null {
    const drifts = this.sessionUsers
      .map((user) => this.getUserStatus(user.id)?.drift)
      .filter((drift): drift is number => drift != null)
      .map(Math.abs);
    return drifts.length > 0 ? Math.max(...drifts) : null;
  }

  /** Playlist rows, rebuilt only when the history, the queue or the current media changed. */
  get playlistRows(): PlaylistRow[] {
    const history = this.history;
    const queue = this.queue;
    const current = this.currentMedia;
    const source = [history, history.length, queue, queue.length, current, current.title];
    if (source.some((value, i) => value !== this.playlistRowsSource[i])) {
      this.playlistRowsSource = source;
      this.playlistRowsCache = [
        ...history.map((media, index) => ({ type: 'history' as const, media, index })),
        { type: 'current' as const, media: current, index: 0 },
        ...queue.map((media, index) => ({ type: 'queue' as const, media, index })),
      ];
    }
    return this.playlistRowsCache;
  }

  trackByIndex(index: number): number {
    return index;
  }

  ngDoCheck(): void {
    // follow the current media, unless the user scrolled away from it
    const media = `${this.currentMedia.id}|${this.currentMedia.title}`;
    if (this.currentMedia.id !== -1 && media !== this.followedMedia) {
      const follow = this.followedMedia === null || this.isNearCurrent();
      this.followedMedia = media;
      this.followedRow = this.history.length;
      // scroll after the rows were rendered
      follow && setTimeout(() => this.scrollToCurrent());
    }
  }

  scrollToCurrent(): void {
    this.playlistViewport?.scrollToIndex(Math.max(0, this.history.length - PLAYLIST_ROWS_BEFORE_CURRENT));
  }

  dropPlaylistRow(event: CdkDragDrop<unknown, unknown, PlaylistRow>): void {
    // the drop index refers to the rendered rows
    const currentIndex = (this.playlistViewport?.getRenderedRange().start ?? 0) + event.currentIndex;
    this.moveMedia(this.combinedIndex(event.item.data), currentIndex);
  }

  /** Index of the row in the combined list of history, current media and queue. */
  combinedIndex(row: PlaylistRow): number {
    switch (row.type) {
      case 'history':
        return row.index;
      case 'current':
        return this.history.length;
      case 'queue':
        return this.history.length + 1 + row.index;
    }
  }

  /** Whether the viewport shows the current media or the rows around it. */
  private isNearCurrent(): boolean {
    const viewport = this.playlistViewport;
    if (!viewport) {
      return true;
    }
    const firstVisible = Math.floor(viewport.measureScrollOffset() / PLAYLIST_ROW_HEIGHT);
    const visibleRows = Math.ceil(viewport.getViewportSize() / PLAYLIST_ROW_HEIGHT);
    return this.followedRow >= firstVisible - 1 && this.followedRow <= firstVisible + visibleRows;
  }

  get autoplayBlocked(): boolean {
    return this.autoplayService.blocked.value;
  }

  ngOnDestroy(): void {
    // the session and its playback continue without the lobby, only the video element returns to its hidden host
    this.mediaService.videoElement.removeEventListener('click', this.videoClickListener);
    this.mediaService.detachVideo();
    this.playlistResizeObserver?.disconnect();
    if (!!this.hideCursorTimeout) {
      clearTimeout(this.hideCursorTimeout);
    }
  }

  get isFullscreen(): boolean {
    return document.fullscreenElement != null;
  }

  ngAfterViewInit(): void {
    // the session topic is listened to by the PlayerEngineService, the join is only needed if the session is not joined yet
    this.sessionService.ensureJoined();
    if (this.videoWrapper) {
      this.mediaService.attachVideo(this.videoWrapper.nativeElement);
      this.mediaService.videoElement.addEventListener('click', this.videoClickListener);
    }
    const viewport = this.playlistViewport;
    if (viewport) {
      // the playlist height depends on the space left in the card (e.g. a loaded video), not only on the window size
      this.playlistResizeObserver = new ResizeObserver(() => viewport.checkViewportSize());
      this.playlistResizeObserver.observe(viewport.elementRef.nativeElement);
    }
  }

  fullscreen() {
    if (!this.videoWrapper) {
      console.error('Page not loaded properly!');
      return;
    }
    this.videoWrapper.nativeElement.requestFullscreen();
    document.onmousemove = () => {
      if (!!this.hideCursorTimeout) {
        clearTimeout(this.hideCursorTimeout);
      }
      if (!!this.videoWrapper) {
        this.videoWrapper.nativeElement.style.cursor = 'default';
      }
      this.hideCursorTimeout = setTimeout(() => {
        if (!!this.videoWrapper) {
          this.videoWrapper.nativeElement.style.cursor = 'none';
        }
      }, 1000);
    };
  }

  exitFullscreen() {
    document.onmousemove = () => undefined;
    if (!!this.hideCursorTimeout) {
      clearTimeout(this.hideCursorTimeout);
    }
    if (!!this.videoWrapper) {
      this.videoWrapper.nativeElement.style.cursor = 'default';
    }
    document.exitFullscreen().catch(console.error);
  }

  onVideoClick() {
    if (!!this.singleVideoClickTimeout) {
      // double click
      clearTimeout(this.singleVideoClickTimeout);
      this.singleVideoClickTimeout = null;
      this.isFullscreen ? this.exitFullscreen() : this.fullscreen();
    } else {
      // single click
      this.singleVideoClickTimeout = setTimeout(() => {
        this.togglePlayback();
        this.singleVideoClickTimeout = null;
      }, 250);
    }
  }
}
