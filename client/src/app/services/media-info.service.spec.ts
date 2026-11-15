import { Chapter } from '../models/chapter';
import { MinimalMedia } from '../models/minimalMedia';
import { HttpHelperService } from './http-helper.service';
import { MediaInfoService } from './media-info.service';

/** A request whose answer the test gives when it wants to, to play through answers that arrive late or out of order. */
interface Pending {
  path: string;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

describe('MediaInfoService', () => {
  let requests: Pending[];
  let puts: string[];
  let service: MediaInfoService;

  const song = new MinimalMedia(7, 'a song', 'SONG');
  const otherSong = new MinimalMedia(8, 'another song', 'SONG');
  const video = new MinimalMedia(20, 'a video', 'VIDEO');

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    requests = [];
    puts = [];
    const request = (path: string) => new Promise((resolve, reject) => requests.push({ path, resolve, reject }));
    const http = {
      get: request,
      getPlain: request,
      getArray: request,
      put: (path: string) => {
        puts.push(path);
        return request(path);
      },
    };
    service = new MediaInfoService(http as unknown as HttpHelperService);
  });

  afterEach(() => vi.restoreAllMocks());

  const pending = (part: string) => requests.filter((candidate) => candidate.path.includes(part));
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  async function answer(part: string, value: unknown): Promise<void> {
    const found = pending(part);
    found[found.length - 1].resolve(value);
    await settle();
  }

  it('shows nothing before a media is loaded', () => {
    expect(service.currentMedia.id).toBe(-1);
    expect(service.songRating).toBe(0);
    expect(service.thumbnailUrl).toBeNull();
    expect(service.chapters).toEqual([]);
  });

  it('loads the details of a song and then its ratings', async () => {
    service.load(song);
    expect(requests.map((request) => request.path)).toEqual(['/api/v1/media/song/7']);

    await answer('/media/song/7', { id: 7, type: 'SONG', title: 'A Song (remastered)', artist: { id: 1, name: 'Someone' } });
    expect(service.currentMedia.title).toBe('A Song (remastered)');

    await answer('getSongRating/7', '4.5');
    await answer('getUserRating/7', '3');
    expect(service.songRating).toBe(4.5);
    expect(service.userSongRating).toBe(3);
  });

  it('asks for a video where the server keeps videos', () => {
    service.load(video);

    expect(requests[0].path).toBe('/api/v1/media/video/20');
  });

  it('gives the details to the caller', async () => {
    const details = service.fetch(song);
    await answer('/media/song/7', { id: 7, type: 'SONG', title: 'a song', spotify: true });

    await expect(details).resolves.toMatchObject({ id: 7, spotify: true });
  });

  it('drops an answer that arrives after the media changed', async () => {
    const first = service.fetch(song);
    service.load(otherSong);

    await answer('/media/song/8', { id: 8, type: 'SONG', title: 'another song' });
    pending('/media/song/7')[0].resolve({ id: 7, type: 'SONG', title: 'a song' });
    await settle();

    expect(service.currentMedia.id).toBe(8);
    // the caller still gets what it asked for
    await expect(first).resolves.toMatchObject({ id: 7 });
  });

  it('does not show the ratings of the previous media while the new ones load', async () => {
    service.load(song);
    await answer('/media/song/7', { id: 7, type: 'SONG', title: 'a song' });
    await answer('getSongRating/7', '5');

    service.load(otherSong);
    await answer('/media/song/8', { id: 8, type: 'SONG', title: 'another song' });

    expect(service.songRating).toBe(0);
  });

  it('drops a rating that arrives after the media changed', async () => {
    service.load(song);
    await answer('/media/song/7', { id: 7, type: 'SONG', title: 'a song' });
    service.load(otherSong);
    await answer('/media/song/8', { id: 8, type: 'SONG', title: 'another song' });

    pending('getSongRating/7')[0].resolve('5');
    await settle();

    expect(service.songRating).toBe(0);
  });

  it('shows what the session knows about a media whose details can not be loaded', async () => {
    const details = service.fetch(video);
    pending('/media/video/20')[0].reject(new Error('gone'));

    await expect(details).rejects.toThrow('gone');
    expect(service.currentMedia).toMatchObject({ id: 20, title: 'a video', type: 'VIDEO' });
  });

  it('treats an empty answer like a failure: the media has no row of its type', async () => {
    const details = service.fetch(song);
    pending('/media/song/7')[0].resolve(null);

    await expect(details).rejects.toThrow('missing');
    expect(service.currentMedia).toMatchObject({ id: 7, title: 'a song', type: 'SONG' });
  });

  it('shows a placeholder and a new title until the details are there', () => {
    service.showPlaceholder(new MinimalMedia(20, 'a video', 'video'));
    expect(service.currentMedia).toMatchObject({ id: 20, title: 'a video', type: 'VIDEO' });

    service.showTitle('next title');
    expect(service.currentMedia.title).toBe('next title');
  });

  describe('seek bar', () => {
    it('loads the thumbnails and chapters of a video', async () => {
      service.loadSeekBarInfo(video);

      // the plain text answer ends with a line break, which a CSS url() does not allow
      await answer('/media/thumbnails/20', 'http://server/thumbs?signature=abc\r\n');
      await answer('/media/video/20/chapters', [new Chapter(0, 'Opening'), new Chapter(90, 'Ending')]);

      expect(service.thumbnailUrl).toBe('http://server/thumbs?signature=abc');
      expect(service.chapters.map((chapter) => chapter.title)).toEqual(['Opening', 'Ending']);
    });

    it('asks for a signed thumbnail URL', () => {
      service.loadSeekBarInfo(video);

      expect(pending('/media/thumbnails/20')[0].path).toContain('X-NPE-PSU-Duration=');
    });

    it('has neither for a song', () => {
      service.loadSeekBarInfo(song);

      expect(requests).toEqual([]);
      expect(service.thumbnailUrl).toBeNull();
    });

    it('does not ask again for the same video, e.g. when it is joined again', () => {
      service.loadSeekBarInfo(video);
      service.loadSeekBarInfo(video);

      expect(pending('/media/thumbnails/20')).toHaveLength(1);
    });

    it('works without thumbnails and chapters: both are optional', async () => {
      service.loadSeekBarInfo(video);
      pending('/media/thumbnails/20')[0].reject({ status: 404 });
      pending('/chapters')[0].reject({ status: 404 });
      await settle();

      expect(service.thumbnailUrl).toBeNull();
      expect(service.chapters).toEqual([]);
    });

    it('forgets the thumbnails of the previous video and drops their late answer', async () => {
      service.loadSeekBarInfo(video);
      await answer('/media/thumbnails/20', 'http://server/first');
      service.loadSeekBarInfo(song);
      expect(service.thumbnailUrl).toBeNull();

      service.loadSeekBarInfo(video);
      service.loadSeekBarInfo(new MinimalMedia(21, 'next video', 'VIDEO'));
      pending('/media/thumbnails/20')[1].resolve('http://server/late');
      await settle();

      expect(service.thumbnailUrl).toBeNull();
    });
  });

  describe('rating', () => {
    it('sends the rating of the user and loads the new ratings', async () => {
      service.load(song);
      await answer('/media/song/7', { id: 7, type: 'SONG', title: 'a song' });

      service.rate(4);
      expect(service.userSongRating).toBe(4);
      expect(puts).toEqual(['/api/v1/ratings/7/addUserRating/4']);

      await answer('addUserRating', null);
      await answer('getSongRating/7', '3.5');
      expect(service.songRating).toBe(3.5);
    });

    it('rates nothing while nothing is playing', () => {
      service.rate(4);

      expect(puts).toEqual([]);
      expect(service.userSongRating).toBe(0);
    });
  });

  it('forgets everything when the session is left, also answers that are still on their way', async () => {
    service.loadSeekBarInfo(video);
    await answer('/media/thumbnails/20', 'http://server/thumbs');
    const details = service.fetch(video);

    service.reset();
    // not the request for the chapters of the same video
    requests.find((request) => request.path.endsWith('/media/video/20'))!.resolve({ id: 20, type: 'VIDEO', title: 'a video' });
    await details;

    expect(service.currentMedia.id).toBe(-1);
    expect(service.thumbnailUrl).toBeNull();
    expect(service.chapters).toEqual([]);
  });

  it('keeps the seek bar until the next media when the queue ends', async () => {
    service.loadSeekBarInfo(video);
    await answer('/media/thumbnails/20', 'http://server/thumbs');
    service.showPlaceholder(video);

    service.clear();

    expect(service.currentMedia.id).toBe(-1);
    expect(service.thumbnailUrl).toBe('http://server/thumbs');
  });
});
