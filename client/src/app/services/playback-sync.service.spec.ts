import { BehaviorSubject } from 'rxjs';
import { User } from '../models/user';
import { AuthenticationService } from './authentication.service';
import { AutoplayService } from './autoplay.service';
import { ClockSyncService } from './clock-sync.service';
import { MediaService } from './media.service';
import { PlaybackSyncService } from './playback-sync.service';
import { UserStatusService } from './user-status.service';
import { WsService } from './ws.service';

const NOW = 1_000_000;
const MEDIA = 7;

/** A media element that plays in real time once started, like the one of the browser. */
class FakeMedia {
  startLatency = 0;
  supportsPlaybackRate = true;
  duration = 600;
  paused = true;
  muted = false;
  rate = 1;
  /** Fails the next calls of play() with errors of these names, like a browser that blocks autoplay. */
  playErrors: string[] = [];
  seeks: number[] = [];
  private position = 0;
  private playingSince = 0;

  play = vi.fn(() => {
    const error = this.playErrors.shift();
    if (error) {
      return Promise.reject(Object.assign(new Error(error), { name: error }));
    }
    this.playingSince = Date.now();
    this.paused = false;
    return Promise.resolve();
  });

  getCurrentTime(): number {
    return this.paused ? this.position : this.position + (Date.now() - this.playingSince) / 1000;
  }

  setCurrentTime(seconds: number): void {
    this.seeks.push(seconds);
    this.position = seconds;
    this.playingSince = Date.now();
  }

  /** Lets the playback fall behind (negative: run ahead) without a seek, like buffering does. */
  fallBehind(ms: number): void {
    this.position -= ms / 1000;
  }

  getDuration = () => this.duration;
  isPaused = () => this.paused;
  setPlaybackRate = (rate: number) => (this.rate = rate);
  setMuted = (muted: boolean) => (this.muted = muted);
}

describe('PlaybackSyncService', () => {
  let media: FakeMedia;
  let blocked: BehaviorSubject<boolean>;
  let retries: (() => void)[];
  let drifts: (number | null)[];
  let published: string[];
  let serverTimeOffset: BehaviorSubject<number>;
  let service: PlaybackSyncService;
  let started: number;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    media = new FakeMedia();
    blocked = new BehaviorSubject(false);
    retries = [];
    drifts = [];
    published = [];
    started = 0;
    serverTimeOffset = new BehaviorSubject(0);
    service = new PlaybackSyncService(
      media as unknown as MediaService,
      { blocked, reportBlocked: (retry: () => void) => retries.push(retry) } as unknown as AutoplayService,
      { setDrift: (drift: number | null) => drifts.push(drift) } as unknown as UserStatusService,
      { currentUserValue: new User(3, 'anna') } as AuthenticationService,
      { publishSessionCommand: (command: string) => published.push(command) } as unknown as WsService,
      { serverTimeOffset } as unknown as ClockSyncService
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const onStart = () => started++;
  const lastDrift = () => drifts[drifts.length - 1];

  /** Schedules a start in 500 ms at the given position and lets it happen. */
  function play(mediaTime = 0): void {
    media.setCurrentTime(mediaTime / 1000);
    media.seeks = [];
    service.schedule(NOW + 500, mediaTime, MEDIA, onStart);
    vi.advanceTimersByTime(500);
  }

  describe('the scheduled start', () => {
    it('plays at the time the session starts, not before', () => {
      service.schedule(NOW + 500, 0, MEDIA, onStart);

      vi.advanceTimersByTime(499);
      expect(media.play).not.toHaveBeenCalled();
      expect(started).toBe(0);

      vi.advanceTimersByTime(1);
      expect(media.play).toHaveBeenCalledTimes(1);
      expect(started).toBe(1);
      expect(media.seeks).toEqual([]);
    });

    it('does not happen when the session paused or changed in the meantime', () => {
      service.schedule(NOW + 500, 0, MEDIA, onStart);
      vi.advanceTimersByTime(200);

      // e.g. a pause within the lead time of a resume
      service.clear();
      vi.advanceTimersByTime(5000);

      expect(media.play).not.toHaveBeenCalled();
      expect(started).toBe(0);
    });

    it('is replaced by a newer one', () => {
      service.schedule(NOW + 500, 0, MEDIA, onStart);
      service.schedule(NOW + 3000, 0, MEDIA, onStart);

      vi.advanceTimersByTime(2999);
      expect(media.play).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(media.play).toHaveBeenCalledTimes(1);
      expect(started).toBe(1);
    });

    it('starts further into the media when the command came late', () => {
      // the session started 2 s ago at 10 s
      service.schedule(NOW - 2000, 10_000, MEDIA, onStart);
      vi.advanceTimersByTime(0);

      expect(media.seeks).toEqual([12]);
      expect(media.play).toHaveBeenCalledTimes(1);
    });

    it('calls a player that starts audibly later ahead of time', () => {
      media.startLatency = 300;
      service.schedule(NOW + 500, 0, MEDIA, onStart);

      vi.advanceTimersByTime(199);
      expect(media.play).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(media.play).toHaveBeenCalledTimes(1);
      expect(media.seeks).toEqual([]);
    });
  });

  describe('browsers that block playback with sound', () => {
    it('plays muted while blocked and unmutes with the first interaction', () => {
      blocked.next(true);

      play();

      expect(media.muted).toBe(true);
      expect(media.play).toHaveBeenCalledTimes(1);
      expect(started).toBe(1);

      retries.forEach((retry) => retry());
      expect(media.muted).toBe(false);
    });

    it('falls back to muted playback when the browser refuses the sound', async () => {
      media.playErrors = ['NotAllowedError'];

      play();
      await vi.advanceTimersByTimeAsync(0);

      expect(media.play).toHaveBeenCalledTimes(2);
      expect(media.muted).toBe(true);
      expect(media.paused).toBe(false);
    });

    it('joins again after the interaction when not even muted playback is allowed', async () => {
      media.playErrors = ['NotAllowedError', 'NotAllowedError'];

      play();
      await vi.advanceTimersByTimeAsync(0);
      expect(published).toEqual([]);

      retries.forEach((retry) => retry());
      expect(published).toEqual(['join/3']);
    });
  });

  describe('drift correction', () => {
    it('leaves a playback that is in time alone', () => {
      play();
      vi.advanceTimersByTime(5000);

      service.correctDrift(MEDIA);

      expect(lastDrift()).toBeCloseTo(0, 5);
      expect(media.rate).toBe(1);
      expect(media.seeks).toEqual([]);
    });

    it('speeds up slightly when the playback is a little behind', () => {
      play();
      vi.advanceTimersByTime(5000);
      media.fallBehind(90);

      service.correctDrift(MEDIA);

      expect(lastDrift()).toBeCloseTo(90, 5);
      expect(media.rate).toBeCloseTo(1.03, 5);
      expect(media.seeks).toEqual([]);
    });

    it('slows down when the playback is ahead, by 5 % at most', () => {
      play();
      vi.advanceTimersByTime(5000);
      media.fallBehind(-600);

      service.correctDrift(MEDIA);

      expect(media.rate).toBeCloseTo(0.95, 5);
    });

    it('goes back to normal speed once the drift is gone', () => {
      play();
      vi.advanceTimersByTime(5000);
      media.fallBehind(90);
      service.correctDrift(MEDIA);

      media.fallBehind(-90);
      service.correctDrift(MEDIA);

      expect(media.rate).toBe(1);
    });

    it('seeks when the playback is far off', () => {
      play(60_000);
      vi.advanceTimersByTime(5000);
      media.fallBehind(4000);

      service.correctDrift(MEDIA);

      expect(media.seeks).toEqual([65]);
      expect(media.rate).toBe(1);
    });

    it('gives a seek time to buffer before it seeks again', () => {
      play();
      vi.advanceTimersByTime(5000);
      media.fallBehind(4000);
      service.correctDrift(MEDIA);

      vi.advanceTimersByTime(1000);
      media.fallBehind(4000);
      service.correctDrift(MEDIA);
      expect(media.seeks).toHaveLength(1);

      vi.advanceTimersByTime(2500);
      service.correctDrift(MEDIA);
      expect(media.seeks).toHaveLength(2);
    });

    it('only seeks a player that can not change its speed, and sooner', () => {
      media.supportsPlaybackRate = false;
      play();
      vi.advanceTimersByTime(5000);

      media.fallBehind(300);
      service.correctDrift(MEDIA);
      expect(media.rate).toBe(1);
      expect(media.seeks).toEqual([]);

      media.fallBehind(400);
      service.correctDrift(MEDIA);
      expect(media.seeks).toEqual([5]);
    });

    it('does nothing before the start, for another media, while paused or past the end', () => {
      service.schedule(NOW + 500, 0, MEDIA, onStart);
      media.fallBehind(4000);
      service.correctDrift(MEDIA);
      expect(drifts).toEqual([]);

      vi.advanceTimersByTime(5500);
      service.correctDrift(MEDIA + 1);
      expect(drifts).toEqual([]);

      media.paused = true;
      service.correctDrift(MEDIA);
      expect(drifts).toEqual([]);

      media.paused = false;
      media.duration = 3;
      service.correctDrift(MEDIA);
      expect(drifts).toEqual([]);
      expect(media.seeks).toEqual([]);
    });

    it('stops with the playback of the session', () => {
      play();
      vi.advanceTimersByTime(5000);
      media.fallBehind(90);
      service.correctDrift(MEDIA);

      service.clear();

      expect(media.rate).toBe(1);
      expect(lastDrift()).toBeNull();
      const reported = drifts.length;
      service.correctDrift(MEDIA);
      expect(drifts).toHaveLength(reported);
    });

    it('follows a better measurement of the clock offset', () => {
      play();
      vi.advanceTimersByTime(5000);

      // the server is found to be 200 ms further than assumed: the session started 200 ms earlier on the client clock
      serverTimeOffset.next(-200);
      service.correctDrift(MEDIA);

      expect(lastDrift()).toBeCloseTo(200, 5);
      expect(media.rate).toBeGreaterThan(1);
    });
  });
});
