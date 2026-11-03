import { Component, ChangeDetectionStrategy } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ServerResultSuccessSnackBarComponent } from '../messages/server-result-success-snack-bar.component';
import { AuthenticationService } from '../../services/authentication.service';
import {
  Background,
  SettingsService,
  SPOTIFY_DEFAULT_LATENCY,
  THEMES,
  Theme,
} from '../../services/settings.service';
import { SpotifyService } from '../../services/spotify.service';
import { SpotifyPlayerService } from '../../services/spotify-player.service';

@Component({
    selector: 'app-settings',
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class SettingsComponent {
  readonly spotifyDefaultLatency = SPOTIFY_DEFAULT_LATENCY;
  readonly themes = THEMES;
  /** The Spotify login URL; null while it is loaded and when the server has no Spotify client id. */
  spotifyAuthUrl: string | null = null;
  /** Whether the server told whether Spotify is set up. */
  spotifyChecked = false;

  constructor(
    private settingsService: SettingsService,
    private spotifyService: SpotifyService,
    public spotifyPlayer: SpotifyPlayerService,
    private authenticationService: AuthenticationService,
    private snackBar: MatSnackBar
  ) {
    this.spotifyService
      .getAuthUrl()
      .then((url) => (this.spotifyAuthUrl = url))
      .catch(() => (this.spotifyAuthUrl = null))
      .finally(() => (this.spotifyChecked = true));
  }

  currentPassword = '';
  newPassword = '';
  repeatPassword = '';
  passwordBusy = false;
  passwordError = '';
  passwordChanged = false;

  get passwordFormValid(): boolean {
    return !!this.currentPassword && !!this.newPassword && this.newPassword === this.repeatPassword;
  }

  changePassword(): void {
    if (!this.passwordFormValid || this.passwordBusy) {
      return;
    }
    this.passwordBusy = true;
    this.passwordError = '';
    this.passwordChanged = false;
    this.authenticationService.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.currentPassword = this.newPassword = this.repeatPassword = '';
        this.passwordChanged = true;
        this.snackBar.openFromComponent(ServerResultSuccessSnackBarComponent, { duration: 2000 });
        this.passwordBusy = false;
      },
      error: (error: HttpErrorResponse) => {
        this.passwordError =
          error.status === 403
            ? 'The current password is wrong.'
            : error.status === 400
              ? 'The new password is not valid (empty or longer than 72 bytes).'
              : 'The password could not be changed.';
        this.passwordBusy = false;
      },
    });
  }

  get spotifyLoggedIn(): boolean {
    return this.spotifyService.loggedIn || this.spotifyService.canRestore;
  }

  /** Connects the Spotify player of this browser; has to be called by a click, browsers only play after a gesture. */
  connectSpotify(): void {
    this.spotifyPlayer.connect().then((connected) => connected && this.spotifyPlayer.activateElement());
  }

  disconnectSpotify(): void {
    this.spotifyPlayer.disconnect();
    this.spotifyService.logout();
  }

  getSpotifyLatencyCorrection(): number {
    return this.settingsService.spotifyLatencyCorrection;
  }

  getSpotifyLatency(): number {
    return this.settingsService.spotifyLatency;
  }

  setSpotifyLatencyCorrection(target: EventTarget | null): void {
    if (target instanceof HTMLInputElement && target.value !== '' && isFinite(Number(target.value))) {
      this.settingsService.spotifyLatencyCorrection = Number(target.value);
    }
  }

  getTheme(): Theme {
    return this.settingsService.theme;
  }

  setTheme(value: Theme): void {
    this.settingsService.theme = value;
  }

  get backgrounds(): { value: Background; label: string }[] {
    return this.settingsService.backgrounds;
  }

  getBackground(): Background {
    return this.settingsService.background;
  }

  setBackground(value: Background): void {
    this.settingsService.background = value;
  }

  volumeLabel(value: number): string {
    return Math.round((value / 0.4) * 100) + '%';
  }

  setVolume(value: number): void {
    this.settingsService.defaultVolume = value;
  }

  getDefaultVolume(): number {
    return this.settingsService.defaultVolume;
  }
  getCurrentTimeSkipLength(): number {
    return this.settingsService.defaultTimeSkipLength;
  }
  setCurrentTimeSkipLength(target: EventTarget | null): void {
    if (target != null && target instanceof HTMLInputElement) {
      this.settingsService.defaultTimeSkipLength = Number(target.value);
    }
  }

  getVolumePercent(value: string) {
    return Math.round(Number(value) * 2 * 100);
  }
}
