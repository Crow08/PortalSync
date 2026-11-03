import { MatSnackBar } from '@angular/material/snack-bar';
import { WsService } from './services/ws.service';
import { CustomSnackBarComponent } from './components/messages/custom-snack-bar.component';
import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { AuthenticationService } from './services/authentication.service';
import { SessionService } from './services/session.service';
import { PlayerEngineService } from './services/player-engine.service';
import { SpotifyService } from './services/spotify.service';
import { SpotifyPlayerService } from './services/spotify-player.service';
import { HttpHelperService } from './services/http-helper.service';
import { Session } from './models/session';
import { RxStompService } from './services/rx-stomp.service';
import { RxStompState } from '@stomp/rx-stomp';
import { SettingsService } from './services/settings.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AppComponent implements OnInit {
  inSession = false;
  sessionInfo = '';
  sessionId: number | null = null;
  connectionState: RxStompState = RxStompState.CLOSED;
  private readonly sessionNames = new Map<number, string>();

  constructor(
    private router: Router,
    private authenticationService: AuthenticationService,
    private settingsDialog: MatDialog,
    private sessionService: SessionService,
    private wsService: WsService,
    private snackBar: MatSnackBar,
    // the playback of the session lives in this service: it has to exist as long as the app
    private playerEngine: PlayerEngineService,
    private spotifyService: SpotifyService,
    private spotifyPlayer: SpotifyPlayerService,
    private httpHelperService: HttpHelperService,
    private rxStompService: RxStompService,
    private settingsService: SettingsService
  ) {}

  ngOnInit(): void {
    this.wsService.errors.subscribe((error) =>
      this.snackBar.openFromComponent(CustomSnackBarComponent, {
        data: { message: error.message },
        panelClass: ['http-error-notification'],
        duration: 4000,
      })
    );
    // the Spotify player of a user who connected it once is connected again with every start of the app
    this.authenticationService.currentUserChanges.subscribe((user) => {
      if (user) {
        this.spotifyService.canRestore && this.spotifyPlayer.connect();
      } else {
        this.spotifyPlayer.disconnect();
        this.spotifyService.forgetSession();
      }
    });
    this.rxStompService.connectionState$.subscribe((state) => (this.connectionState = state));
    this.sessionService.sessionId.subscribe((id) => {
      if (id) {
        this.inSession = true;
        // the session id is emitted again by every join: the name is only loaded when the session changed
        if (id !== this.sessionId) {
          this.sessionId = id;
          this.loadSessionName(id);
        }
      } else {
        this.inSession = false;
        this.sessionId = null;
        this.sessionInfo = '';
      }
    });
  }

  /**
   * Loads the name of the room. Nothing is shown meanwhile, so the id does not flash in; if loading fails the id is shown
   * instead. A room that was entered before shows its remembered name at once while the name is loaded again: session
   * ids start at 1 again after a restart of the server, so the name may belong to another room by now.
   */
  private loadSessionName(id: number): void {
    this.sessionInfo = this.sessionNames.get(id) ?? '';
    this.httpHelperService
      .get(`/api/v1/sessions/${id}`, Session)
      .then((session) => session?.name || `Session ${id}`)
      .catch((error) => {
        console.error(error);
        return `Session ${id}`;
      })
      .then((name) => {
        this.sessionNames.set(id, name);
        if (this.sessionId === id) {
          this.sessionInfo = name;
        }
      });
  }

  /** The badge next to the room name: whether the connection to the session is up, and how many people are in it. */
  get connectionBadge(): { text: string; live: boolean } {
    switch (this.connectionState) {
      case RxStompState.OPEN:
        return { text: `Live · ${this.playerEngine.sessionUsers.length} here`, live: true };
      case RxStompState.CONNECTING:
        return { text: 'Connecting…', live: false };
      default:
        return { text: 'Offline, reconnecting', live: false };
    }
  }

  /** Classes of the theme container: the Material scheme plus the colors of the chosen theme. */
  get themeClass(): string {
    return `graphite-theme theme-${this.settingsService.theme}`;
  }

  /** The picture behind the pages as a CSS value, null for none; the player covers it with its own stage. */
  get backgroundImage(): string | null {
    const file = this.settingsService.backgroundFile;
    return file === null ? null : `url("assets/backgrounds/${file}")`;
  }

  get username(): string {
    return this.authenticationService.currentUserValue?.username ?? '';
  }

  /** Two letters for the avatar in the header. */
  get initials(): string {
    return this.username.slice(0, 2).toUpperCase();
  }

  /** Login and register are standalone pages without header and navigation. */
  get isAuthPage(): boolean {
    const url = this.router.url.split('?')[0];
    return url.endsWith('/login') || url.endsWith('/register');
  }

  /**
   * Whether the page of the navigation entry is shown. Evaluated by the template instead of routerLinkActive: the
   * room entry appears only after the navigation into the room, and routerLinkActive missed that.
   */
  isActive(page: 'room' | 'rooms' | 'library' | 'spotify' | 'settings'): boolean {
    const url = this.router.url.split('?')[0];
    switch (page) {
      case 'room':
        return /^\/sessions\/[^/]+\/lobby/.test(url);
      case 'rooms':
        return url === '/';
      case 'library':
        return url.startsWith('/library');
      case 'spotify':
        return url.startsWith('/spotify');
      case 'settings':
        return url.startsWith('/settings');
    }
  }

  /** The controls of the session are shown on every page but the room, which has the full controls. */
  get showMiniPlayer(): boolean {
    const url = this.router.url.split('?')[0];
    return this.inSession && !url.endsWith('lobby') && !this.isAuthPage;
  }

  logout(): void {
    // stops the playback of the session
    this.sessionService.leaveSession();
    this.authenticationService.logout();
    this.router.navigate(['/login']).catch((reason) => console.error(reason));
  }
}
