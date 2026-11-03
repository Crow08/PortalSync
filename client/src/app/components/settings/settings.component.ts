import { Component, ChangeDetectionStrategy } from '@angular/core';
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
    public spotifyPlayer: SpotifyPlayerService
  ) {
    this.spotifyService
      .getAuthUrl()
      .then((url) => (this.spotifyAuthUrl = url))
      .catch(() => (this.spotifyAuthUrl = null))
      .finally(() => (this.spotifyChecked = true));
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
