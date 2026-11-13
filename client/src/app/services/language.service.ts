import { DOCUMENT, Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { OVERLAY_SEPARATOR } from '../i18n/transloco-loader';

/** A language the user can choose; the texts are in src/app/i18n/<value>.json. */
export type Language = 'en' | 'en-casual';
export const DEFAULT_LANGUAGE: Language = 'en';
/** The labels are shown in their own language and are not translated. */
export const LANGUAGES: { value: Language; label: string; htmlLang: string }[] = [
  { value: 'en', label: 'English', htmlLang: 'en' },
  { value: 'en-casual', label: 'English (fun)', htmlLang: 'en' },
];

/** The translation layers of themes (src/app/i18n/<overlay>.json), see LanguageService.setOverlay. */
export const OVERLAYS = ['anime'] as const;
export type Overlay = (typeof OVERLAYS)[number];

/**
 * Every active language id: each language alone and with each combination of overlays (sorted, as apply() builds them).
 * Transloco needs them all in availableLangs, an id that is not listed there is taken for a scope.
 */
export const ACTIVE_LANGUAGE_IDS: string[] = LANGUAGES.flatMap((language) =>
  OVERLAYS.reduce<string[][]>((sets, overlay) => [...sets, ...sets.map((set) => [...set, overlay])], [[]]).map((set) =>
    [language.value, ...[...set].sort()].join(OVERLAY_SEPARATOR)
  )
);

/**
 * The language of the texts (Transloco). The active Transloco language is the chosen language plus the active overlays,
 * e.g. 'en-casual+anime': an overlay is a translation file of a theme that changes some texts on top of any language
 * (AnimeThemeService). The loader (LayeredTranslocoLoader) merges the layers.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly tl = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);

  private currentLanguage: Language = LanguageService.readLanguage();
  private readonly overlays = new Set<Overlay>();
  private requested = '';

  private static readLanguage(): Language {
    try {
      const value = localStorage.getItem('msc_language');
      return LANGUAGES.some((language) => language.value === value) ? (value as Language) : DEFAULT_LANGUAGE;
    } catch {
      return DEFAULT_LANGUAGE;
    }
  }

  get language(): Language {
    return this.currentLanguage;
  }

  set language(value: Language) {
    this.currentLanguage = value;
    try {
      localStorage.setItem('msc_language', value);
    } catch {
      // the choice is only not remembered
    }
    void this.apply();
  }

  /** Puts a theme's translation layer on top of the language or removes it. */
  setOverlay(overlay: Overlay, active: boolean): void {
    if (active === this.overlays.has(overlay)) {
      return;
    }
    if (active) {
      this.overlays.add(overlay);
    } else {
      this.overlays.delete(overlay);
    }
    void this.apply();
  }

  /** Loads the texts of the current language and overlays and activates them once they are there (no flash of keys). */
  apply(): Promise<void> {
    const id = [this.currentLanguage, ...[...this.overlays].sort()].join(OVERLAY_SEPARATOR);
    this.requested = id;
    this.document.documentElement.lang =
      LANGUAGES.find((language) => language.value === this.currentLanguage)?.htmlLang ?? 'en';
    return firstValueFrom(this.tl.load(id)).then(
      () => {
        // a later choice may have finished loading first
        if (this.requested === id) {
          this.tl.setActiveLang(id);
        }
      },
      (error) => console.error('Loading the texts failed', error)
    );
  }
}
