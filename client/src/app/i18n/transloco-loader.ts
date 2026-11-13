import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { from, Observable } from 'rxjs';

/**
 * The translation files are bundled by the build (hashed chunks, loaded on demand), so a deployment never serves a stale
 * catalog. Add a language here and in LANGUAGES (language.service.ts).
 */
const FILES: Record<string, () => Promise<{ default: Translation }>> = {
  en: () => import('./en.json'),
  'en-casual': () => import('./en-casual.json'),
  anime: () => import('./anime.json'),
};

/** The language that has every key: all other files only contain what they change. */
export const BASE_LANGUAGE = 'en';

/** Separates the language from the overlays in an active language id, e.g. 'en-casual+anime'. */
export const OVERLAY_SEPARATOR = '+';

function isObject(value: unknown): value is Translation {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep merge: values of `top` win, objects are merged, arrays are replaced as a whole. */
function merge(base: Translation, top: Translation): Translation {
  const result: Translation = { ...base };
  for (const [key, value] of Object.entries(top)) {
    result[key] = isObject(value) && isObject(base[key]) ? merge(base[key], value) : value;
  }
  return result;
}

/**
 * Loads an active language id: the base language (en), the chosen language on top of it and every overlay (a layer of a
 * theme, e.g. anime) on top of that. A key that a file leaves out falls back to the layer below.
 */
@Injectable({ providedIn: 'root' })
export class LayeredTranslocoLoader implements TranslocoLoader {
  getTranslation(id: string): Observable<Translation> {
    const layers = [BASE_LANGUAGE, ...id.split(OVERLAY_SEPARATOR)].filter(
      (layer, index, all) => FILES[layer] && all.indexOf(layer) === index
    );
    return from(
      Promise.all(layers.map((layer) => FILES[layer]())).then((files) =>
        files.reduce<Translation>((result, file) => merge(result, file.default), {})
      )
    );
  }
}
