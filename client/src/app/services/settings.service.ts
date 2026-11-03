import { Injectable } from '@angular/core';

/**
 * Delay (ms) between the resume() call of the Spotify player and the audible start. Measured on one device with a
 * recording of the loudspeakers (mean 103 ms, standard deviation 7 ms); it differs per device, see spotifyLatencyCorrection.
 */
export const SPOTIFY_DEFAULT_LATENCY = 100;

/**
 * A picture behind the pages (not the player). The pictures are not part of the repository: they are listed in
 * assets/backgrounds/backgrounds.json (see the README there); without that file only the gradient is offered.
 */
export interface BackgroundPicture {
  value: string;
  label: string;
  /** File name in assets/backgrounds. */
  file: string;
}
/** The id of the gradient of the theme, always available. */
export type Background = string;
export const NO_BACKGROUND = 'none';
const BACKGROUND_LIST_URL = 'assets/backgrounds/backgrounds.json';

/** The color theme; ids and colors: src/app/themes/themes.scss (class theme-<id>), the colors here only draw the choice. */
export type Theme = 'ocean' | 'mint' | 'violet' | 'amber' | 'mono';
export const DEFAULT_THEME: Theme = 'ocean';
export const THEMES: { value: Theme; label: string; accent: string; surface: string }[] = [
  { value: 'ocean', label: 'Ocean', accent: '#3fb4ff', surface: '#101826' },
  { value: 'mint', label: 'Mint', accent: '#86dbc2', surface: '#121a18' },
  { value: 'violet', label: 'Violet', accent: '#b794ff', surface: '#19171e' },
  { value: 'amber', label: 'Amber', accent: '#ffbe5c', surface: '#1c1711' },
  { value: 'mono', label: 'Mono', accent: '#cfcfcf', surface: '#181818' },
];

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  /** The background is read by the app shell on every change detection: it is kept here instead of read from the storage. */
  private currentBackground: Background | null = SettingsService.readBackground();
  private pictures: BackgroundPicture[] = [];

  constructor() {
    this.loadBackgroundPictures();
  }

  private static readBackground(): Background | null {
    try {
      return localStorage.getItem('msc_background');
    } catch {
      return null;
    }
  }

  private loadBackgroundPictures(): void {
    fetch(BACKGROUND_LIST_URL)
      .then((response) => (response.ok ? response.json() : []))
      .then((list: unknown) => {
        if (!Array.isArray(list)) {
          return;
        }
        // the list is a local file: only well formed entries with a plain file name are used
        this.pictures = list.filter(
          (entry): entry is BackgroundPicture =>
            typeof entry?.value === 'string' &&
            entry.value !== NO_BACKGROUND &&
            typeof entry.label === 'string' &&
            typeof entry.file === 'string' &&
            /^[\w.-]+$/.test(entry.file)
        );
      })
      .catch(() => {
        // no pictures: only the gradient is offered
      });
  }

  /** Read by the app shell on every change detection, like the background. */
  private currentTheme: Theme = SettingsService.readTheme();

  private static readTheme(): Theme {
    try {
      const value = localStorage.getItem('msc_theme');
      return THEMES.some((theme) => theme.value === value) ? (value as Theme) : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  }

  get theme(): Theme {
    return this.currentTheme;
  }

  set theme(value: Theme) {
    this.currentTheme = value;
    try {
      localStorage.setItem('msc_theme', value);
    } catch {
      // the choice is only not remembered
    }
  }

  /** The pictures that exist plus the gradient. */
  get backgrounds(): BackgroundPicture[] {
    return [...this.pictures, { value: NO_BACKGROUND, label: 'Gradient', file: '' }];
  }

  /** The chosen picture if it exists, else the first picture, else the gradient. */
  get background(): Background {
    const chosen = this.currentBackground;
    if (chosen === NO_BACKGROUND) {
      return NO_BACKGROUND;
    }
    return (this.pictures.find((picture) => picture.value === chosen) ?? this.pictures[0])?.value ?? NO_BACKGROUND;
  }

  set background(value: Background) {
    this.currentBackground = value;
    try {
      localStorage.setItem('msc_background', value);
    } catch {
      // the choice is only not remembered
    }
  }

  /** File name of the picture in assets/backgrounds, null for the gradient. */
  get backgroundFile(): string | null {
    const background = this.background;
    return this.pictures.find((picture) => picture.value === background)?.file ?? null;
  }

  /** Width (px) of the side panel of the room that the user chose by dragging its border, null for the default. */
  get roomSideWidth(): number | null {
    try {
      const value = localStorage.getItem('msc_roomSideWidth');
      return value === null || !isFinite(Number(value)) ? null : Number(value);
    } catch {
      return null;
    }
  }

  set roomSideWidth(value: number | null) {
    try {
      value === null ? localStorage.removeItem('msc_roomSideWidth') : localStorage.setItem('msc_roomSideWidth', String(value));
    } catch {
      // the width is only not remembered
    }
  }

  get defaultVolume(): number {
    const value = localStorage.getItem('msc_defaultVolume');
    return value === null ? 0.1 : Number(value);
  }

  set defaultVolume(value: number) {
    localStorage.setItem('msc_defaultVolume', String(value));
  }

  /** Correction (ms) of the Spotify latency for this user's device, e.g. positive for a Bluetooth loudspeaker. */
  get spotifyLatencyCorrection(): number {
    const value = localStorage.getItem('msc_spotifyLatencyCorrection');
    return value === null ? 0 : Number(value);
  }

  set spotifyLatencyCorrection(value: number) {
    localStorage.setItem('msc_spotifyLatencyCorrection', String(value));
  }

  /** The delay (ms) between the resume() call of the Spotify player and the audible start on this device. */
  get spotifyLatency(): number {
    return Math.max(0, SPOTIFY_DEFAULT_LATENCY + this.spotifyLatencyCorrection);
  }

  get defaultTimeSkipLength(): number {
    const value = localStorage.getItem('msc_defaultTimeSkipLength');
    return value === null ? 85 : Number(value);
  }

  set defaultTimeSkipLength(value: number) {
    localStorage.setItem('msc_defaultTimeSkipLength', String(value));
  }
}
