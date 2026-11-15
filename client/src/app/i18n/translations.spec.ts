import { firstValueFrom } from 'rxjs';
import anime from './anime.json';
import casual from './en-casual.json';
import en from './en.json';
import { LayeredTranslocoLoader } from './transloco-loader';

type Texts = { [key: string]: unknown };

const isGroup = (value: unknown): value is Texts => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The keys of all texts, e.g. 'player.queue'. A list (random messages) is one text. */
function keys(texts: Texts, prefix = ''): string[] {
  return Object.entries(texts).flatMap(([key, value]) =>
    isGroup(value) ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`]
  );
}

function text(texts: Texts, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => (isGroup(value) ? value[part] : undefined), texts);
}

/** The placeholders of a text, e.g. {{ count }}; references to other keys ({{ player.previous }}) are none. */
function parameters(value: unknown): string[] {
  const found = typeof value === 'string' ? [...value.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)].map((match) => match[1]) : [];
  return [...new Set(found)].sort();
}

describe('the translation files', () => {
  const base = keys(en);

  it.each([
    ['en-casual', casual as Texts],
    ['anime', anime as Texts],
  ])('%s only changes texts that exist in en, the file with all keys', (_name, layer) => {
    const unknown = keys(layer).filter((key) => !base.includes(key));

    expect(unknown).toEqual([]);
  });

  it.each([
    ['en-casual', casual as Texts],
    ['anime', anime as Texts],
  ])('%s keeps the kind of every text: a list stays a list, a group a group', (_name, layer) => {
    const changed = keys(layer).filter((key) => Array.isArray(text(layer, key)) !== Array.isArray(text(en, key)));

    expect(changed).toEqual([]);
  });

  it.each([
    ['en-casual', casual as Texts],
    ['anime', anime as Texts],
  ])('%s uses no placeholder the text in en does not offer', (_name, layer) => {
    const wrong = keys(layer).filter((key) =>
      parameters(text(layer, key)).some((name) => !parameters(text(en, key)).includes(name))
    );

    expect(wrong).toEqual([]);
  });

  it('has no empty text', () => {
    const empty = [en, casual, anime].flatMap((file) =>
      keys(file as Texts).filter((key) => {
        const value = text(file as Texts, key);
        return Array.isArray(value) ? value.length === 0 || value.some((entry) => !entry) : value === '';
      })
    );

    expect(empty).toEqual([]);
  });
});

describe('LayeredTranslocoLoader', () => {
  const loader = new LayeredTranslocoLoader();
  const load = (id: string) => firstValueFrom(loader.getTranslation(id)) as Promise<Texts>;

  const changedBy = (layer: Texts, below: Texts) =>
    keys(layer).find((key) => JSON.stringify(text(layer, key)) !== JSON.stringify(text(below, key)))!;

  it('loads the base language as it is', async () => {
    expect(await load('en')).toEqual(en);
  });

  it('lays a language over the base: its texts win, the others stay', async () => {
    const texts = await load('en-casual');
    const changed = changedBy(casual as Texts, en);
    const untouched = base().find((key) => !keys(casual as Texts).includes(key))!;

    expect(text(texts, changed)).toEqual(text(casual as Texts, changed));
    expect(text(texts, untouched)).toEqual(text(en, untouched));
    expect(keys(texts).sort()).toEqual(base().sort());
  });

  it('lays the overlay of a theme over the chosen language', async () => {
    const texts = await load('en-casual+anime');
    const byAnime = changedBy(anime as Texts, en);
    const byCasualOnly = keys(casual as Texts).find((key) => !keys(anime as Texts).includes(key))!;

    expect(text(texts, byAnime)).toEqual(text(anime as Texts, byAnime));
    expect(text(texts, byCasualOnly)).toEqual(text(casual as Texts, byCasualOnly));
  });

  it('replaces a list as a whole instead of mixing two lists', async () => {
    const list = keys(casual as Texts).find((key) => Array.isArray(text(casual as Texts, key)));
    if (list) {
      expect(text(await load('en-casual'), list)).toEqual(text(casual as Texts, list));
    }
  });

  it('ignores a layer it does not know and loads none twice', async () => {
    expect(await load('en+en')).toEqual(en);
    expect(await load('klingon')).toEqual(en);
    expect(await load('en+nonsense+anime')).toEqual(await load('anime'));
  });

  function base(): string[] {
    return keys(en);
  }
});
