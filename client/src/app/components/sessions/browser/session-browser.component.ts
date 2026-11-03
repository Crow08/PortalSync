import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Session } from '../../../models/session';
import { User } from '../../../models/user';
import { HttpHelperService } from '../../../services/http-helper.service';
import { AuthenticationService } from '../../../services/authentication.service';
import { WsService } from '../../../services/ws.service';
import { YesNoDialogComponent } from '../../dialog/yes-no-dialog/yes-no-dialog.component';

export type RoomFilter = 'all' | 'mine' | 'video' | 'song';

/** Pastel colors of the user avatars and the gradients of the room cards, picked by id. */
const AVATAR_COLORS = ['#86dbc2', '#ffbe5c', '#8fa8ff', '#f59bb0', '#c7e39b', '#e39a6b'];
const CARD_GRADIENTS = [
  'linear-gradient(160deg, #1b2447, #4b3a7a 55%, #f2a078)',
  'linear-gradient(150deg, #7a3a5e, #ffbe5c)',
  'linear-gradient(160deg, #2a5e7a, #c98a5e)',
  'linear-gradient(160deg, #243b55, #8fa8ff)',
  'linear-gradient(160deg, #355c4a, #c7e39b)',
  'linear-gradient(160deg, #4b3a3a, #e39a6b)',
];
/** Rooms are polled so the playing state and the listeners stay current. */
const REFRESH_INTERVAL = 10000;
const MAX_AVATARS = 4;

@Component({
    selector: 'app-browser',
    templateUrl: './session-browser.component.html',
    styleUrls: ['./session-browser.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class SessionBrowserComponent implements OnInit, OnDestroy {
  sessions: Session[] = [];
  filter: RoomFilter = 'all';
  query = '';
  loaded = false;
  /** The names of the users by id, to show who owns a lobby (the session only knows the id of its creator). */
  private userNames = new Map<number, string>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private httpHelperService: HttpHelperService,
    private router: Router,
    private authenticationService: AuthenticationService,
    private wsService: WsService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.httpHelperService
      .getArray('/api/v1/users/all', User)
      .then((users) => (this.userNames = new Map(users.map((user) => [user.id, user.username]))))
      .catch(console.error);
    this.loadSessions();
    this.refreshTimer = setInterval(() => this.loadSessions(), REFRESH_INTERVAL);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
    }
  }

  private loadSessions(): void {
    this.httpHelperService
      .getArray('/api/v1/sessions/all', Session)
      .then((value) => (this.sessions = value))
      .catch(console.error)
      .finally(() => (this.loaded = true));
  }

  get visibleSessions(): Session[] {
    const query = this.query.trim().toLowerCase();
    return this.sessions.filter(
      (session) => this.matchesFilter(session) && (!query || session.name.toLowerCase().includes(query))
    );
  }

  private matchesFilter(session: Session): boolean {
    switch (this.filter) {
      case 'mine':
        return session.creatorId === this.authenticationService.currentUserValue?.id;
      case 'video':
        return session.queue?.currentMedia?.type === 'VIDEO';
      case 'song':
        return session.queue?.currentMedia?.type === 'SONG';
      default:
        return true;
    }
  }

  /** Only the creator and admins may delete a session, the server checks that as well. */
  canDelete(session: Session): boolean {
    const user = this.authenticationService.currentUserValue;
    return !!user && (user.admin || user.id === session.creatorId);
  }

  deleteSession(session: Session, event: Event): void {
    // the click must not open the session
    event.stopPropagation();
    this.dialog
      .open(YesNoDialogComponent, {
        width: '420px',
        maxWidth: '92vw',
        data: {
          title: `Delete lobby "${session.name}"?`,
          message: 'Everyone still in it is kicked.',
          yesButton: 'Delete',
          noButton: 'Keep',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }
        this.httpHelperService
          .delete(`/api/v1/sessions/${session.id}`)
          .catch((error) =>
            this.wsService.errors.next({ message: error?.error?.message ?? 'Deleting the session failed', destination: '' })
          )
          .finally(() => this.loadSessions());
      });
  }

  openSession(id: number): void {
    // joining is done by the lobby, which also handles the required user interaction
    this.router.navigateByUrl(`/sessions/${id}/lobby`).catch(console.error);
  }

  kind(session: Session): string {
    const type = session.queue?.currentMedia?.type;
    return type === 'VIDEO' ? 'Video' : type === 'SONG' ? 'Music' : 'Empty';
  }

  /** The icon of the media that is playing: a video, a song, or nothing yet. */
  kindIcon(session: Session): string {
    switch (this.kind(session)) {
      case 'Video':
        return 'local_movies';
      case 'Music':
        return 'music_note';
      default:
        return 'hourglass_empty';
    }
  }

  stateLabel(session: Session): string {
    switch (session.sessionState) {
      case 'PLAY':
      case 'SYNC_PLAY':
        return 'Playing';
      case 'PAUSE':
      case 'SYNC_PAUSE':
        return 'Paused';
      default:
        return 'Idle';
    }
  }

  /** The name of the user who created the lobby, empty if it is not known. */
  owner(session: Session): string {
    return this.userNames.get(session.creatorId) ?? '';
  }

  nowPlaying(session: Session): string {
    return session.queue?.currentMedia?.title ?? 'Waiting for the first title';
  }

  gradient(session: Session): string {
    return CARD_GRADIENTS[session.id % CARD_GRADIENTS.length];
  }

  listeners(session: Session): { initials: string; color: string }[] {
    return (session.users ?? []).slice(0, MAX_AVATARS).map((user) => ({
      initials: user.username.slice(0, 2).toUpperCase(),
      color: AVATAR_COLORS[user.id % AVATAR_COLORS.length],
    }));
  }
}
