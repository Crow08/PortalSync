import { describe, expect, it } from 'vitest';
import { environment } from '../../environments/environment';
import { coverUrl, pickSpotifyCover } from './cover';

describe('coverUrl', () => {
  it('is the cover of the media on the server', () => {
    expect(coverUrl({ id: 7, hasCover: true })).toBe(`${environment.dbServer}/api/v1/media/cover/7`);
  });

  it('is null for a media without a cover, so nothing is requested for it', () => {
    expect(coverUrl({ id: 7, hasCover: false })).toBeNull();
    expect(coverUrl({ id: 7 })).toBeNull();
    expect(coverUrl(null)).toBeNull();
  });

  it('is the picture at Spotify for a Spotify song', () => {
    expect(coverUrl({ id: 7, hasCover: true, coverUrl: 'https://i.scdn.co/image/abc' })).toBe('https://i.scdn.co/image/abc');
    expect(coverUrl({ id: 7, hasCover: true, coverUrl: null })).toBe(`${environment.dbServer}/api/v1/media/cover/7`);
  });
});

describe('pickSpotifyCover', () => {
  const image = (width: number | null) => ({ url: `https://i.scdn.co/image/w${width}`, width, height: width });

  it('takes the smallest picture that is wide enough for the player', () => {
    expect(pickSpotifyCover([image(640), image(300), image(64)])).toBe('https://i.scdn.co/image/w300');
    expect(pickSpotifyCover([image(64), image(640)])).toBe('https://i.scdn.co/image/w640');
  });

  it('takes the largest when all are small, and one of unknown size when there is nothing else', () => {
    expect(pickSpotifyCover([image(64), image(160)])).toBe('https://i.scdn.co/image/w160');
    expect(pickSpotifyCover([image(null)])).toBe('https://i.scdn.co/image/wnull');
  });

  it('is undefined without a usable picture', () => {
    expect(pickSpotifyCover([])).toBeUndefined();
    expect(pickSpotifyCover(undefined)).toBeUndefined();
    expect(pickSpotifyCover([{ url: 'http://example.org/a.jpg', width: 300 }, { width: 300 }, null])).toBeUndefined();
  });
});
