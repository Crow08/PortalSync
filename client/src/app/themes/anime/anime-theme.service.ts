import { DOCUMENT, Injectable, NgZone, inject } from '@angular/core';
import { TranslocoTranspilerFunction } from '@jsverse/transloco';
import { LanguageService } from '../../services/language.service';
import { SettingsService } from '../../services/settings.service';

/*
 * ======================================================================================================================
 * ANIME THEME · SCRIPT BLOCK
 * ======================================================================================================================
 * Everything of the anime theme that CSS can not do. It only runs while the theme 'anime' is chosen; switching to another
 * theme removes every listener, element and class and the translation layer. The styles (and the Easter Egg Index)
 * are in anime.scss next to this file.
 *
 *   1. Fonts         loads the display fonts (Google Fonts, like the rest of the app) only while the theme is active
 *   2. Copy          switches the translation layer 'anime' on (src/app/i18n/anime.json, on top of the chosen language):
 *                    visible texts and tooltips in anime voice; the aria labels have their own keys and stay plain for
 *                    screen readers. Its function syncRatio is SyncRatioTranspiler below.
 *   3. Konami code   ↑ ↑ ↓ ↓ ← → ← → B A toggles the Super Saiyan mode (class anime-ssj on <html>)
 *   4. Logo          seven clicks summon the eternal dragon and grant a wish (class anime-wish on <html>)
 *   5. Settings      three quick clicks on the Settings icon transmute
 *   6. Secret words  typed anywhere outside a text field, see SECRET_WORDS
 *   7. Console       a greeting for whoever opens the dev tools
 *   8. Kamehameha    adds the beam elements to every seek bar (app-player-track) and keeps --ani-progress and the
 *                    milestone in step with the slider, which writes its value into aria-valuetext; the player track
 *                    itself knows nothing about the theme
 *
 * Nothing here changes the behaviour of the app: no event is cancelled, no state is touched. The listeners run outside of
 * Angular, so they do not cause change detection.
 */

/** The seek bars that get a Kamehameha. */
const TRACK = 'app-player-track .progress-wrapper';

/** The milestone of a position (0..100) that the shouts of _kamehameha.scss react to. */
function milestone(position: number): string {
  return position >= 90 ? '90' : position >= 50 ? '50' : position >= 25 ? '25' : '0';
}

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Bangers&family=Dela+Gothic+One&family=Orbitron:wght@500;700;900' +
  '&family=Rajdhani:wght@500;600;700&family=Russo+One&family=Noto+Sans+JP:wght@700;900&display=swap';

/** Evangelion: the sync ratio from the largest drift. Zero drift is Shinji's 400 %, a huge drift is Mob's ???%. */
export function syncRatio(drift: number): string {
  if (drift === 0) {
    return '400 %';
  }
  if (drift > 2000) {
    return '???%';
  }
  return `${Math.max(0, 100 - drift / 20).toFixed(1)} %`;
}

/**
 * [[ syncRatio(drift) ]] in a translation (anime.json: player.maxDrift). Transloco looks the function up by its provider
 * name 'syncRatio' (AppModule).
 */
@Injectable()
export class SyncRatioTranspiler implements TranslocoTranspilerFunction {
  transpile(drift: string): string {
    return syncRatio(Number(drift));
  }
}

/** The console greeting is shown once per page load. */
let greeted = false;

const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];

@Injectable({ providedIn: 'root' })
export class AnimeThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private readonly language = inject(LanguageService);

  private active = false;
  private fxRoot: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private originalTitle = '';
  private konami = 0;
  private typed = '';
  private logoClicks: number[] = [];
  private settingsClicks: number[] = [];

  /** 6. Secret words: typed letters, matched at the end of the typed text. */
  private readonly secretWords: Record<string, () => void> = {
    kamehameha: () => this.effect('beam', 'KA-ME-HA-ME-HA!!', 'Dragon Ball'),
    bankai: () => this.effect('bankai', '卍解', 'Bankai!', 2400),
    domain: () => this.effect('void', '領域展開', 'Domain Expansion: Infinite Void', 3200),
    elpsykongroo: () => this.effect('divergence', '1.048596', 'El Psy Kongroo.', 3200),
    tuturu: () => this.effect('impact', 'Tuturu~ ♪', 'Mayushii is here'),
    dattebayo: () => this.effect('impact', 'BELIEVE IT!', 'dattebayo!'),
    plusultra: () => this.effect('impact', 'PLUS ULTRA!!', 'Go beyond!'),
    nani: () => this.effect('impact', 'お前はもう死んでいる', 'NANI?!', 2800),
    oraora: () => this.rush('ORA'),
    mudamuda: () => this.rush('MUDA'),
    zura: () => this.effect('impact', 'ZURA JA NAI!', 'KATSURA DA!'),
    geass: () => this.effect('geass', 'GEASS', 'Lelouch vi Britannia commands you!', 2800),
    flcl: () => this.effect('impact', 'FOOLY COOLY', 'Nothing amazing happens here.'),
    kaneda: () => this.effect('impact', 'TETSUOOOOO!!', 'KANEDAAAA!'),
    shinzou: () => this.effect('impact', '心臓を捧げよ!', 'Dedicate your hearts!'),
    pochita: () => this.effect('impact', 'ヴィィィン!!', 'Woof!', 2200, true),
    peanuts: () => this.effect('impact', 'WAKU WAKU!', 'Anya likes peanuts'),
    yareyare: () => this.effect('impact', 'やれやれだぜ', 'Yare yare daze.'),
    traceon: () => this.effect('impact', 'TRACE ON', 'Unlimited Blade Works'),
    onepunch: () => this.effect('impact', 'OK.', 'One punch.', 2200, true),
    gomugomu: () => this.effect('impact', 'GOMU GOMU NO…', 'PISTOL!!', 2400, true),
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => this.keyDown(event);
  private readonly onClick = (event: MouseEvent): void => this.click(event);

  constructor() {
    inject(SettingsService).themeChanges.subscribe((theme) => this.setActive(theme === 'anime'));
  }

  private setActive(active: boolean): void {
    if (active === this.active) {
      return;
    }
    this.active = active;
    // 2. Copy: inside Angular, the new texts have to be rendered
    this.language.setOverlay('anime', active);
    this.zone.runOutsideAngular(() => (active ? this.start() : this.stop()));
  }

  private start(): void {
    const doc = this.document;
    // 1. Fonts
    const fonts = doc.createElement('link');
    fonts.id = 'anime-theme-fonts';
    fonts.rel = 'stylesheet';
    fonts.href = FONTS_URL;
    doc.head.append(fonts);

    this.fxRoot = doc.createElement('div');
    this.fxRoot.className = 'anime-fx-root';
    this.fxRoot.setAttribute('aria-hidden', 'true');
    doc.body.append(this.fxRoot);

    // Lyrical Nanoha: full power
    this.originalTitle = doc.title;
    doc.title = `${this.originalTitle} · 全力全開!`;

    // 8. Kamehameha: new seek bars and the value of the sliders
    this.addBeams(doc.body);
    this.observer = new MutationObserver((records) => this.mutated(records));
    this.observer.observe(doc.body, {
      subtree: true,
      childList: true,
      attributes: true,
      // the seek slider writes its value there
      attributeFilter: ['aria-valuetext'],
    });

    doc.addEventListener('keydown', this.onKeyDown, true);
    doc.addEventListener('click', this.onClick, true);
    this.greet();
  }

  private stop(): void {
    const doc = this.document;
    doc.removeEventListener('keydown', this.onKeyDown, true);
    doc.removeEventListener('click', this.onClick, true);
    this.observer?.disconnect();
    this.observer = null;
    doc.querySelectorAll(`${TRACK} > .kamehameha`).forEach((beam) => beam.remove());
    doc.querySelectorAll<HTMLElement>(TRACK).forEach((track) => track.style.removeProperty('--ani-progress'));
    doc.getElementById('anime-theme-fonts')?.remove();
    this.fxRoot?.remove();
    this.fxRoot = null;
    doc.title = this.originalTitle;
    doc.documentElement.classList.remove('anime-ssj', 'anime-wish');
  }

  private mutated(records: MutationRecord[]): void {
    for (const record of records) {
      if (record.type === 'attributes') {
        this.followSlider(record.target as Element);
      } else {
        record.addedNodes.forEach((node) => node instanceof Element && this.addBeams(node));
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // 8. Kamehameha
  // ---------------------------------------------------------------------------------------------------------------------
  /** Gives every seek bar in (or at) the node its beam, behind the segments (the loading state selects .segments ~). */
  private addBeams(node: Element): void {
    const tracks = node.matches(TRACK) ? [node] : Array.from(node.querySelectorAll(TRACK));
    for (const track of tracks) {
      const segments = track.querySelector(':scope > .segments');
      if (!segments || track.querySelector(':scope > .kamehameha')) {
        continue;
      }
      const beam = this.document.createElement('div');
      beam.className = 'kamehameha';
      beam.setAttribute('aria-hidden', 'true');
      for (const part of ['ki-fighter', 'ki-beam', 'ki-ball', 'ki-shout']) {
        const span = this.document.createElement('span');
        span.className = part;
        if (part === 'ki-beam') {
          span.append(Object.assign(this.document.createElement('span'), { className: 'ki-flow' }));
        }
        beam.append(span);
      }
      segments.after(beam);
      const slider = track.querySelector('input[aria-valuetext]');
      if (slider) {
        this.followSlider(slider);
      }
    }
  }

  /** The slider changed its value (playback, seeking, dragging): the beam follows. */
  private followSlider(input: Element): void {
    const track = input.closest<HTMLElement>(TRACK);
    const beam = track?.querySelector<HTMLElement>(':scope > .kamehameha');
    const position = Number((input as HTMLInputElement).value);
    if (!track || !beam || Number.isNaN(position)) {
      return;
    }
    track.style.setProperty('--ani-progress', String(position / 100));
    beam.dataset['milestone'] = milestone(position);
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // 3. Konami code and 6. secret words
  // ----------------------------------------------------------------------------------------------------------------------
  private keyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (event.ctrlKey || event.metaKey || event.altKey || target?.closest('input, textarea, select, [contenteditable]')) {
      return;
    }
    const key = event.key.toLowerCase();

    this.konami = key === KONAMI[this.konami] ? this.konami + 1 : key === KONAMI[0] ? 1 : 0;
    if (this.konami === KONAMI.length) {
      this.konami = 0;
      this.toggleSuperSaiyan();
    }

    if (/^[a-z]$/.test(key)) {
      this.typed = (this.typed + key).slice(-16);
      const word = Object.keys(this.secretWords).find((secret) => this.typed.endsWith(secret));
      if (word) {
        this.typed = '';
        this.secretWords[word]();
      }
    }
  }

  private toggleSuperSaiyan(): void {
    const on = this.document.documentElement.classList.toggle('anime-ssj');
    if (on) {
      this.effect('ssj', 'SUPER SAIYAN!', 'Power level: over 9000', 2600, true);
      console.log('%c ⚡ AAAAAAAAAAAAAH! ⚡ ', 'background:#ffd21f;color:#111;font:900 16px sans-serif');
    } else {
      this.effect('impact', 'POWER DOWN…', 'Back to base form');
    }
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // 4. Logo and 5. Settings: click counters
  // ----------------------------------------------------------------------------------------------------------------------
  private click(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    const now = Date.now();
    if (target?.closest('#header .brand')) {
      this.logoClicks = [...this.logoClicks.filter((time) => now - time < 5000), now];
      if (this.logoClicks.length >= 7) {
        this.logoClicks = [];
        this.summonShenron();
      }
    } else if (target?.closest('.rail-settings')) {
      this.settingsClicks = [...this.settingsClicks.filter((time) => now - time < 1200), now];
      if (this.settingsClicks.length >= 3) {
        this.settingsClicks = [];
        this.effect('transmute', '等価交換', 'Equivalent Exchange', 3000);
      }
    }
  }

  private summonShenron(): void {
    this.effect('shenron', 'SPEAK YOUR WISH', 'The seven Dragon Balls are gathered', 4600);
    setTimeout(() => {
      const granted = this.document.documentElement.classList.toggle('anime-wish');
      this.effect('impact', granted ? 'WISH GRANTED' : 'WISH UNDONE', granted ? 'Sakura storm!' : 'The petals settle', 2200);
    }, 4700);
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // Effects: a full screen layer for a moment (styles: _eggs.scss)
  // ----------------------------------------------------------------------------------------------------------------------
  private effect(kind: string, text: string, sub = '', ms = 2600, shake = false): HTMLElement | null {
    if (!this.fxRoot) {
      return null;
    }
    const doc = this.document;
    const fx = doc.createElement('div');
    fx.className = `anime-fx anime-fx--${kind}`;
    fx.style.setProperty('--fx-ms', `${ms}ms`);
    const title = doc.createElement('div');
    title.className = 'anime-fx-text';
    title.textContent = text;
    const subtitle = doc.createElement('div');
    subtitle.className = 'anime-fx-sub';
    subtitle.textContent = sub;
    fx.append(title, subtitle);
    this.fxRoot.append(fx);
    setTimeout(() => fx.remove(), ms);

    const container = doc.getElementById('app-theme-container');
    if (shake && container && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      container.classList.add('anime-shake');
      setTimeout(() => container.classList.remove('anime-shake'), 500);
    }
    return fx;
  }

  /** JoJo: a rush of words all over the screen. */
  private rush(word: string): void {
    const fx = this.effect('ora', '', '', 2400, true);
    fx?.querySelector('.anime-fx-text')?.remove();
    for (let i = 0; i < 16; i++) {
      const span = this.document.createElement('span');
      span.className = 'anime-fx-ora';
      span.textContent = `${word}!`;
      span.style.left = `${5 + Math.random() * 80}%`;
      span.style.top = `${5 + Math.random() * 80}%`;
      span.style.rotate = `${Math.round(Math.random() * 40 - 20)}deg`;
      span.style.setProperty('--delay', `${i * 0.07}s`);
      fx?.append(span);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // 7. Console
  // ----------------------------------------------------------------------------------------------------------------------
  private greet(): void {
    if (greeted) {
      return;
    }
    greeted = true;
    console.log(
      '%cPortalSync%c 全力全開 ',
      'background:#ff6a13;color:#111;font:900 22px Bangers,Impact,sans-serif;padding:4px 10px',
      'background:#111;color:#36d6ff;font:700 22px sans-serif;padding:4px 10px'
    );
    console.log('%cYou opened the dev tools. Scanning your power level…', 'color:#7dff6a;font:600 13px monospace');
    console.log("%cIT'S OVER 9000!!", 'color:#ffd21f;font:900 18px Impact,sans-serif;text-shadow:2px 2px 0 #111');
    console.log(
      '%cPresent day. Present time. The secrets are in src/app/themes/anime/anime.scss (Easter Egg Index). ' +
        'Hint: ↑ ↑ ↓ ↓ ← → ← → B A, and the Jolly Roger likes to be clicked. El Psy Kongroo.',
      'color:#a9afdc;font:12px monospace'
    );
  }
}
