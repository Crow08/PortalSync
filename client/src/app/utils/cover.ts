import { environment } from '../../environments/environment';

/** What coverUrl needs of a media. */
export interface WithCover {
  id: number;
  hasCover?: boolean;
  coverUrl?: string | null;
}

/**
 * The URL of the picture of a media (the cover of its album), null if it has none: the views then keep their
 * placeholder. A file of the server is loaded as an image with the login cookie (several media can share one), the
 * cover of a Spotify song from Spotify.
 */
export function coverUrl(media: WithCover | null | undefined): string | null {
  if (!media?.hasCover) {
    return null;
  }
  return media.coverUrl || `${environment.dbServer}/api/v1/media/cover/${media.id}`;
}

/** Width (px) of the album picture of Spotify that is kept: the stage of the player shows it 300 px wide. */
const SPOTIFY_COVER_WIDTH = 300;

/**
 * The picture to keep of the ones Spotify offers for an album (usually 640, 300 and 64 px wide): the smallest that is
 * wide enough for the player, else the largest. Undefined without a usable one.
 */
export function pickSpotifyCover(images: unknown): string | undefined {
  const usable = (Array.isArray(images) ? images : []).filter(
    (image): image is { url: string; width?: number | null } =>
      typeof image?.url === 'string' && image.url.startsWith('https://')
  );
  const byWidth = [...usable].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (byWidth.find((image) => (image.width ?? 0) >= SPOTIFY_COVER_WIDTH) ?? byWidth[byWidth.length - 1])?.url;
}

/**
 * For the error event of a cover image: a picture that does not load (its file is gone) is hidden, so the placeholder
 * behind it shows instead of the broken image of the browser.
 */
export function hideCover(event: Event): void {
  (event.target as HTMLElement).hidden = true;
}

/** For the load event: the image element is reused for the next media, whose picture may load. */
export function showCover(event: Event): void {
  (event.target as HTMLElement).hidden = false;
}
