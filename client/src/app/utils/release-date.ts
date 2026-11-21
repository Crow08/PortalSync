/**
 * The release date of a song or an album is a text, as exact as it is known: a year ("1998"), a month ("1998-10") or
 * a day ("1998-10-12"); the server checks it the same way (ReleaseDates). The texts sort like the dates.
 */
const FORMAT = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/** Whether the text is a release date; an empty text is none and allowed (the date is optional). */
export function isReleaseDate(text: string | null | undefined): boolean {
  const value = (text ?? '').trim();
  if (value === '') {
    return true;
  }
  const match = FORMAT.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = match[2] === undefined ? 1 : Number(match[2]);
  const day = match[3] === undefined ? 1 : Number(match[3]);
  // the Date rolls over an impossible day (30 February) into the next month
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1000 && month >= 1 && month <= 12 && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** What is sent to the server: the date without spaces around it, null for none. */
export function toReleaseDate(text: string | null | undefined): string | null {
  return (text ?? '').trim() || null;
}

/** The release date shown for a song: its own, else the one of its album; empty if neither is known. */
export function releaseDateOf(song: { releaseDate?: string | null; album?: { releaseDate?: string | null } | null }): string {
  return song.releaseDate || song.album?.releaseDate || '';
}
