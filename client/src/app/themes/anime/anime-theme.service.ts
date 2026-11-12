import { DOCUMENT, Injectable, NgZone, inject } from '@angular/core';
import { SettingsService } from '../../services/settings.service';

/*
 * ======================================================================================================================
 * ANIME THEME · SCRIPT BLOCK
 * ======================================================================================================================
 * Everything of the anime theme that CSS can not do. It only runs while the theme 'anime' is chosen; switching to another
 * theme removes every listener, element and class and puts the original texts back. The styles (and the Easter Egg Index)
 * are in anime.scss next to this file.
 *
 *   1. Fonts         loads the display fonts (Google Fonts, like the rest of the app) only while the theme is active
 *   2. Copy          rewrites visible texts and tooltips in anime voice (a MutationObserver keeps up with Angular; the
 *                    aria labels stay plain for screen readers)
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

type Replacement = string | ((...match: string[]) => string);
type Rule = [RegExp, Replacement];

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
function syncRatio(drift: number): string {
  if (drift === 0) {
    return '400 %';
  }
  if (drift > 2000) {
    return '???%';
  }
  return `${Math.max(0, 100 - drift / 20).toFixed(1)} %`;
}

/** Visible texts (the whole trimmed text of a text node has to match). */
const TEXT_RULES: Rule[] = [
  [/^Nothing playing$/, 'See you, Space Cowboy…'],
  [/^Add something to the queue$/, 'The stage is empty. Summon a track from the library!'],
  [/^Unknown artist$/, 'A mysterious stranger (??? arc)'],
  [/^Session is empty$/, 'No enemies in sight… yet.'],
  [/^All ready$/, 'Power level: stable'],
  [/^(\d+) of (\d+) ready$/, '$1 / $2 fighters charged'],
  [/^max drift (\d+) ms$/, (_, drift) => `sync ratio ${syncRatio(Number(drift))} · drift ${drift} ms`],
  [/^Live · (\d+) here$/, 'On air · $1 nakama'],
  [/^Connecting…$/, 'Charging ki…'],
  [/^Offline, reconnecting$/, 'Signal lost… reconnecting, dattebayo'],
  [/^Playing muted\. Click anywhere to unmute\.$/, 'Muted like a shinobi. Click anywhere to break the silence!'],
  [/^No lobbies yet\. Start one on the right\.$/, 'No battlefields yet. Open one on the right. Plus Ultra!'],
  [/^No lobby matches\.$/, 'Your Log Pose points nowhere.'],
  [/^(\d+) listening$/, '$1 nakama'],
  [/^Now: (.*)$/, 'Now fighting: $1'],
  [/^Join$/, 'Fight!'],
  [/^This playlist is empty\.$/, "This playlist is as empty as Saitama's hairline."],
  [
    /^The library is empty\. Upload something first\.$/,
    'Not even Index has anything to read. Summon something on the upload page!',
  ],
  [/^Nothing matches\.$/, 'Nothing matches. Not even the Byakugan sees it.'],
  [
    /^No playlists yet\. Add media to a playlist and it shows up here\.$/,
    'No crew yet. Every crew starts with one nakama: add media to a playlist.',
  ],
  [/^Something went wrong$/, 'NANI?! Something went wrong'],
  [/^Success$/, 'Mission complete! (S-rank)'],
  [/^OK$/, 'OK.'],
  [/^Log out$/, 'Log out (El Psy Kongroo)'],
  [/^(\d+) songs? added$/, "$&. Gotta catch 'em all!"],
  [/^(.+): (\d+) songs imported$/, '$1: $2 songs imported. Nakama acquired!'],
  [/^Account created\.$/, 'Account created. Welcome to the crew!'],
  [/^Drop songs here or choose files$/, 'Drop songs into the summoning circle (or choose files)'],
  [/^Watch and listen together, on the same beat\.$/, 'Watch and listen together, at a perfect sync ratio.'],
  [/^No account yet\? Ask for an invite link\.$/, 'No account yet? Every hero needs an invitation: ask for a link.'],
];

/** Tooltips (title attributes). */
const TITLE_RULES: Rule[] = [
  [/^Previous$/, 'Previous: Return by Death'],
  [/^Next$/, 'Next episode!'],
  [/^Play$/, 'Play: KA-ME-HA-ME-HA!'],
  [/^Pause$/, 'Pause: ZA WARUDO! Toki wo tomare!'],
  [/^Chapters$/, 'Episode list'],
  [/^Next chapter: (.*)$/, 'Next arc: $1'],
  [/^Skip (\d+) s$/, 'King Crimson: erase $1 s'],
  [/^Volume$/, 'Power level'],
  [/^Fullscreen$/, 'Gear 5 (fullscreen)'],
  [/^Exit fullscreen$/, 'Power down (exit fullscreen)'],
  [/^Shuffle queue$/, 'Shuffle: Rasengan!'],
  [/^Loop: on$/, 'Loop: on (the Endless Eight)'],
  [/^Loop: off$/, 'Loop: off (no time leap)'],
  [/^Fair queue: on/, 'Fair queue: on. Equivalent exchange: everyone takes a turn to duel'],
  [/^Fair queue: off/, 'Fair queue: off. Added titles go to the end of the line'],
  [/^Scroll to the current (\w+)$/, 'Log Pose: point to the current $1'],
  [/^Add from the library$/, 'Summon from the library: pierce the heavens!'],
  [/^Remove$/, 'Write its name in the Death Note (remove)'],
  [/^Drag to resize, double click to reset$/, 'Gum-Gum stretch: drag to resize, double click to reset'],
  [/^Latency \(round trip to the server\)$/, 'Ki delay (round trip to the server)'],
  [/^Drift from the session position/, 'Sync ratio drift (+: behind, -: ahead)'],
  [/^Average rating$/, 'Average power level'],
  [/^Rate this$/, 'Rate this: collect the Dragon Balls'],
  [/^Rate (\d) of (\d)$/, 'The $1-star Dragon Ball'],
  [/^Remove your rating$/, 'Turn the Dragon Ball back to stone'],
  [/^Delete lobby$/, 'Delete lobby: EXPLOSION!'],
  [/^Owner: (.*)$/, 'Captain: $1'],
  [/^Position of the current media \/ length of the playlist$/, 'Episode / length of the season'],
  [/^Back to the player$/, 'Back to the cockpit'],
];

/** The rewritten text, or null if no rule matches. */
function rewrite(rules: Rule[], value: string): string | null {
  for (const [pattern, replacement] of rules) {
    const match = value.match(pattern);
    if (match) {
      return typeof replacement === 'string' ? value.replace(pattern, replacement) : replacement(...match);
    }
  }
  return null;
}

/** The console greeting is shown once per page load. */
let greeted = false;

const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];

/** Elements whose texts are never rewritten. */
const SKIP = 'input, textarea, select, script, style, [contenteditable], .anime-fx-root';

@Injectable({ providedIn: 'root' })
export class AnimeThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);

  private active = false;
  private fxRoot: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private originalTitle = '';
  private konami = 0;
  private typed = '';
  private logoClicks: number[] = [];
  private settingsClicks: number[] = [];
  /** rewritten nodes with their original and shown text, to put the originals back */
  private readonly texts = new Map<Text, { original: string; shown: string }>();
  private readonly titles = new Map<Element, { original: string; shown: string }>();

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

    // 2. Copy
    this.rewriteTree(doc.body);
    this.observer = new MutationObserver((records) => this.mutated(records));
    this.observer.observe(doc.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      // aria-valuetext: the seek slider writes its value there (8. Kamehameha)
      attributeFilter: ['title', 'aria-valuetext'],
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
    for (const [node, text] of this.texts) {
      if (node.data === text.shown) {
        node.data = text.original;
      }
    }
    for (const [element, title] of this.titles) {
      if (element.getAttribute('title') === title.shown) {
        element.setAttribute('title', title.original);
      }
    }
    this.texts.clear();
    this.titles.clear();
    doc.querySelectorAll(`${TRACK} > .kamehameha`).forEach((beam) => beam.remove());
    doc.querySelectorAll<HTMLElement>(TRACK).forEach((track) => track.style.removeProperty('--ani-progress'));
    doc.getElementById('anime-theme-fonts')?.remove();
    this.fxRoot?.remove();
    this.fxRoot = null;
    doc.title = this.originalTitle;
    doc.documentElement.classList.remove('anime-ssj', 'anime-wish');
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // 2. Copy
  // ----------------------------------------------------------------------------------------------------------------------
  private mutated(records: MutationRecord[]): void {
    for (const record of records) {
      if (record.type === 'characterData') {
        this.rewriteText(record.target as Text);
      } else if (record.attributeName === 'aria-valuetext') {
        this.followSlider(record.target as Element);
      } else if (record.type === 'attributes') {
        this.rewriteTitle(record.target as Element);
      } else {
        record.addedNodes.forEach((node) => this.rewriteTree(node));
      }
    }
    // nodes that left the page (virtual scroll rows, closed menus) are not kept
    if (this.texts.size + this.titles.size > 500) {
      this.texts.forEach((_, node) => {
        if (!node.isConnected) {
          this.texts.delete(node);
        }
      });
      this.titles.forEach((_, element) => {
        if (!element.isConnected) {
          this.titles.delete(element);
        }
      });
    }
  }

  private rewriteTree(node: Node): void {
    if (node instanceof Text) {
      this.rewriteText(node);
      return;
    }
    if (!(node instanceof Element) || node.closest(SKIP)) {
      return;
    }
    this.addBeams(node);
    if (node.hasAttribute('title')) {
      this.rewriteTitle(node);
    }
    node.querySelectorAll('[title]').forEach((element) => this.rewriteTitle(element));
    const walker = this.document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      this.rewriteText(text as Text);
    }
  }

  private rewriteText(node: Text): void {
    const value = node.data;
    const known = this.texts.get(node);
    if (known?.shown === value) {
      return; // our own change
    }
    const trimmed = value.trim();
    const rewritten = trimmed && trimmed.length < 200 ? rewrite(TEXT_RULES, trimmed) : null;
    if (rewritten === null || node.parentElement?.closest(SKIP)) {
      this.texts.delete(node);
      return;
    }
    const shown = value.replace(trimmed, () => rewritten);
    this.texts.set(node, { original: value, shown });
    node.data = shown;
  }

  private rewriteTitle(element: Element): void {
    const value = element.getAttribute('title') ?? '';
    const known = this.titles.get(element);
    if (known?.shown === value) {
      return;
    }
    const rewritten = value ? rewrite(TITLE_RULES, value) : null;
    if (rewritten === null) {
      this.titles.delete(element);
      return;
    }
    this.titles.set(element, { original: value, shown: rewritten });
    element.setAttribute('title', rewritten);
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
