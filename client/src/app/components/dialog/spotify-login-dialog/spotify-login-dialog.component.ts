import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Router } from '@angular/router';
import { SPOTIFY_RETURN_URL_KEY, SpotifyService } from '../../../services/spotify.service';

/** Asks for the Spotify login when the user runs a function that needs it; the login is the same as in the settings. */
@Component({
  selector: 'app-spotify-login-dialog',
  templateUrl: './spotify-login-dialog.component.html',
  styleUrls: ['./spotify-login-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SpotifyLoginDialogComponent {
  /** The Spotify login URL; null while it is loaded and when the server has no Spotify client id. */
  authUrl: string | null = null;
  /** Whether the server told whether Spotify is set up. */
  checked = false;

  constructor(spotifyService: SpotifyService, private router: Router) {
    spotifyService
      .getAuthUrl()
      .then((url) => (this.authUrl = url))
      .catch(() => (this.authUrl = null))
      .finally(() => (this.checked = true));
  }

  /** The login leaves the app: remember the page so that the user comes back to it afterwards. */
  rememberPage(): void {
    try {
      sessionStorage.setItem(SPOTIFY_RETURN_URL_KEY, this.router.url);
    } catch {
      // without storage the login ends in the settings
    }
  }
}
