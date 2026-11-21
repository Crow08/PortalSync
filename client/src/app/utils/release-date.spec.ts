import { describe, expect, it } from 'vitest';
import { isReleaseDate, releaseDateOf, toReleaseDate } from './release-date';

describe('isReleaseDate', () => {
  it('takes a year, a month or a day', () => {
    for (const date of ['1998', '1998-10', '1998-10-12', '2000-02-29', ' 1998 ']) {
      expect(isReleaseDate(date), date).toBe(true);
    }
  });

  it('takes no date at all: it is optional', () => {
    expect(isReleaseDate('')).toBe(true);
    expect(isReleaseDate('  ')).toBe(true);
    expect(isReleaseDate(null)).toBe(true);
  });

  it('refuses everything else', () => {
    const wrong = ['98', '19980', '1998-1', '1998-13', '1998-00', '1998-02-30', '2001-02-29', '12.10.1998', '0999', 'soon'];
    for (const date of wrong) {
      expect(isReleaseDate(date), date).toBe(false);
    }
  });
});

describe('toReleaseDate', () => {
  it('is the trimmed text, null for none', () => {
    expect(toReleaseDate(' 1998-10 ')).toBe('1998-10');
    expect(toReleaseDate('  ')).toBeNull();
    expect(toReleaseDate(null)).toBeNull();
  });
});

describe('releaseDateOf', () => {
  it('is the date of the song, else the one of its album', () => {
    expect(releaseDateOf({ releaseDate: '1998-10-12', album: { releaseDate: '1998' } })).toBe('1998-10-12');
    expect(releaseDateOf({ releaseDate: null, album: { releaseDate: '1998' } })).toBe('1998');
    expect(releaseDateOf({ album: null })).toBe('');
    expect(releaseDateOf({})).toBe('');
  });
});
