import { Injectable } from '@angular/core';
import { Chapter } from '../models/chapter';
import { Media } from '../models/media';
import { MinimalMedia } from '../models/minimalMedia';
import { Song } from '../models/song';
import { Video } from '../models/video';
import { HttpHelperService } from './http-helper.service';

const NO_MEDIA = () => new Media(-1, 'SONG', '', '', []);

const typeOf = (media: MinimalMedia): 'SONG' | 'VIDEO' => (media.type.toUpperCase() === 'VIDEO' ? 'VIDEO' : 'SONG');

/**
 * What the player shows about the current media of the session: its details (title, artist, ...), its ratings and, for
 * a video, what the seek bar needs (thumbnail sprite, chapters). It only loads this information; loading and playing
 * the media itself is the business of the PlayerEngineService.
 * <p>
 * The media changes while requests are running: every answer is only applied if it still belongs to the current media.
 */
@Injectable({
  providedIn: 'root',
})
export class MediaInfoService {
  currentMedia: Media = NO_MEDIA();
  songRating = 0;
  userSongRating = 0;
  /** Pre-signed URL of the thumbnail sprite of the current video (seek bar preview), null if there is none. */
  thumbnailUrl: string | null = null;
  /** Chapters of the current video (seek bar markers), empty if there are none. */
  chapters: Chapter[] = [];

  private mediaInfoRequest = 0;
  /** Media whose thumbnails and chapters were requested. */
  private seekBarMediaId = -1;

  constructor(private httpHelperService: HttpHelperService) {}

  /** Forgets everything, e.g. when the session is left. */
  reset(): void {
    this.mediaInfoRequest++;
    this.clear();
    this.thumbnailUrl = null;
    this.chapters = [];
    this.seekBarMediaId = -1;
  }

  /** Nothing is playing any more (e.g. the queue ended); what the seek bar shows stays until the next media. */
  clear(): void {
    this.currentMedia = NO_MEDIA();
    this.songRating = 0;
    this.userSongRating = 0;
  }

  /** Shows the media with what the session knows about it (id, title, type), until its details are loaded. */
  showPlaceholder(media: MinimalMedia): void {
    this.currentMedia = new Media(media.id, typeOf(media), media.title, '', []);
    this.songRating = 0;
    this.userSongRating = 0;
  }

  /** Shows the new title right away; the details of the media replace the rest when they are loaded. */
  showTitle(title: string): void {
    this.currentMedia.title = title;
  }

  /** Loads the details and ratings of the media, without loading the media itself. */
  load(media: MinimalMedia): void {
    this.fetch(media).catch(console.error);
  }

  /** Like load, resolves to the details (also when a newer request has replaced them in the state). */
  fetch(media: MinimalMedia): Promise<Media> {
    // responses may arrive out of order when the media changes quickly: only the latest request is applied
    const request = ++this.mediaInfoRequest;
    const request$: Promise<Media> =
      typeOf(media) === 'VIDEO'
        ? this.httpHelperService.get(`/api/v1/media/video/${media.id}`, Video)
        : this.httpHelperService.get(`/api/v1/media/song/${media.id}`, Song);
    return request$
      .then((details) => {
        // e.g. a media without the row of its type in the database: the server answers without details
        if (!details) {
          throw new Error(`The details of media ${media.id} are missing`);
        }
        if (request === this.mediaInfoRequest) {
          this.currentMedia = details;
          // do not show the ratings of the previous media until the new ones are loaded
          this.songRating = 0;
          this.userSongRating = 0;
          this.loadRating();
          this.loadUserRating();
        }
        return details;
      })
      .catch((error) => {
        if (request === this.mediaInfoRequest) {
          // the media is played anyway: the state needs a media with the id and title of the session
          this.showPlaceholder(media);
        }
        throw error;
      });
  }

  /**
   * Loads the URL of the thumbnail sprite shown when hovering over the seek bar of a video and the chapters of the
   * video (read by the server from the MP4, browsers do not expose them).
   */
  loadSeekBarInfo(media: MinimalMedia): void {
    if (media.id === this.seekBarMediaId) {
      return;
    }
    this.seekBarMediaId = media.id;
    this.thumbnailUrl = null;
    this.chapters = [];
    if (typeOf(media) !== 'VIDEO') {
      return;
    }
    this.httpHelperService
      .getPlain(`/api/v1/media/thumbnails/${media.id}?X-NPE-PSU-Duration=PT1H`)
      .then((url) => {
        // the media may have changed while the request was running
        // the plain text response ends with a line break, which is not allowed in a CSS url()
        if (this.seekBarMediaId === media.id) {
          this.thumbnailUrl = url.trim();
        }
      })
      // thumbnails are optional: without them the seek bar shows no preview
      .catch(() => undefined);
    this.httpHelperService
      .getArray(`/api/v1/media/video/${media.id}/chapters`, Chapter)
      .then((chapters) => {
        if (this.seekBarMediaId === media.id) {
          this.chapters = chapters;
        }
      })
      // chapters are optional as well
      .catch(() => undefined);
  }

  /** Rates the current media as the logged in user. */
  rate(rating: number): void {
    const mediaId = this.currentMedia.id;
    if (mediaId === -1) {
      return;
    }
    this.userSongRating = rating;
    this.httpHelperService
      .put(`/api/v1/ratings/${mediaId}/addUserRating/${rating}`, null)
      .then(() => {
        this.loadRating();
        this.loadUserRating();
      })
      .catch(console.error);
  }

  private loadRating(): void {
    const mediaId = this.currentMedia.id;
    this.httpHelperService
      .getPlain(`/api/v1/ratings/getSongRating/${mediaId}`)
      .then((rating) => {
        // the response may arrive after the media changed
        if (this.currentMedia.id === mediaId) {
          this.songRating = Number(rating);
        }
      })
      .catch(console.error);
  }

  private loadUserRating(): void {
    const mediaId = this.currentMedia.id;
    this.httpHelperService
      .getPlain(`/api/v1/ratings/getUserRating/${mediaId}`)
      .then((rating) => {
        // the response may arrive after the media changed
        if (this.currentMedia.id === mediaId) {
          this.userSongRating = Number(rating);
        }
      })
      .catch(console.error);
  }
}
