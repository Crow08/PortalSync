import { Injectable } from '@angular/core';
import { pairwise } from 'rxjs';
import { AuthenticationService } from './authentication.service';
import { AutoplayService } from './autoplay.service';
import { ClockSyncService } from './clock-sync.service';
import { MediaService } from './media.service';
import { UserStatusService } from './user-status.service';
import { WsService } from './ws.service';

/** A start later than this (ms) is compensated by starting further into the media. */
const LATE_START_TOLERANCE = 30;
/** Drift (ms) between the actual and the expected position that is tolerated during playback. */
const DRIFT_TOLERANCE = 40;
/** Drift (ms) up to which the playback rate is adjusted; a larger drift is corrected by seeking. */
const MAX_RATE_CORRECTED_DRIFT = 1000;
/** Maximum deviation of the playback rate from 1 when correcting a drift. */
const MAX_RATE_CORRECTION = 0.05;
/** Minimum time (ms) between two corrections by seeking, which need time to buffer. */
const SEEK_CORRECTION_COOLDOWN = 3000;
/** Drift (ms) from which a player that can not change its speed (Spotify) seeks: a seek is audible. */
const NO_RATE_SEEK_DRIFT = 500;

/**
 * Keeps the playback of this client in time with the session: it starts the loaded media at the client time the
 * session starts and then corrects the drift between the actual position and the one the session is at.
 * <p>
 * It knows when to play, not what: the PlayerEngineService loads the media, tells this service when the session starts
 * ({@link schedule}) and when that is over (pause, stop, jump, another media: {@link clear}).
 */
@Injectable({
  providedIn: 'root',
})
export class PlaybackSyncService {
  /** Client time at which the playback started at the given media position: where the session is at any time. */
  private anchor: { mediaId: number; startTime: number; mediaTime: number } | null = null;
  /** The pending start of the playback, null if none is scheduled. */
  private playTimer: ReturnType<typeof setTimeout> | null = null;
  /** The scheduled start has happened: the media is playing and its drift is corrected. */
  private started = false;
  private lastSeekCorrection = 0;

  constructor(
    private mediaService: MediaService,
    private autoplayService: AutoplayService,
    private userStatusService: UserStatusService,
    private authenticationService: AuthenticationService,
    private wsService: WsService,
    clockSyncService: ClockSyncService
  ) {
    // The anchor was derived from the server start time with the previous clock offset: a better offset moves it, and
    // the drift correction then moves the playback to the corrected position.
    clockSyncService.serverTimeOffset.pipe(pairwise()).subscribe(([previous, current]) => {
      if (this.anchor) {
        this.anchor.startTime += current - previous;
      }
    });
  }

  /**
   * Starts the playback at the given client time. A start that is already pending is replaced.
   *
   * @param startTime client time in ms at which the playback starts
   * @param mediaTime media position in ms at the start time
   * @param mediaId the media that is loaded, to tell a playback of another media apart (see correctDrift)
   * @param onStart called when the playback is started
   */
  schedule(startTime: number, mediaTime: number, mediaId: number, onStart: () => void): void {
    this.cancelStart();
    this.started = false;
    this.anchor = { mediaId, startTime, mediaTime };
    // the Spotify player starts audibly later than the call: the call is made ahead, the position is corrected if it is late
    const latency = this.mediaService.startLatency;
    this.playTimer = setTimeout(() => {
      this.playTimer = null;
      // the start command may arrive late, or the timeout fires late: start where the others already are
      const lateness = new Date().getTime() - (startTime - this.mediaService.startLatency);
      if (lateness > LATE_START_TOLERANCE) {
        console.log(`Late start by ${lateness}ms: starting further into the media`);
        this.mediaService.setCurrentTime((mediaTime + lateness) / 1000);
      }
      if (this.autoplayService.blocked.value) {
        this.playMuted();
      } else {
        this.mediaService.play().catch((reason) => {
          if (reason?.name === 'NotAllowedError') {
            this.playMuted();
          } else {
            console.error(reason);
          }
        });
      }
      this.started = true;
      onStart();
    }, startTime - latency - new Date().getTime());
  }

  /**
   * The session does not play (at this position) any more: a start that is still pending must not happen (e.g. a pause
   * within the lead time of a resume or a join), and there is no position to correct the drift to.
   */
  clear(): void {
    this.cancelStart();
    this.started = false;
    this.anchor = null;
    this.mediaService.setPlaybackRate(1);
    this.userStatusService.setDrift(null);
  }

  /**
   * Compares the playback position with the position expected from the scheduled start and corrects the drift, e.g.
   * after buffering: small drifts by slightly changing the playback rate, large ones by seeking. Called continuously
   * while the media plays.
   *
   * @param mediaId the media that is loaded now
   */
  correctDrift(mediaId: number): void {
    const anchor = this.anchor;
    const now = new Date().getTime();
    if (!anchor || !this.started || anchor.mediaId !== mediaId || this.mediaService.isPaused() || now < anchor.startTime) {
      return;
    }
    const expected = anchor.mediaTime + (now - anchor.startTime);
    if (expected >= this.mediaService.getDuration() * 1000) {
      return;
    }
    const drift = expected - this.mediaService.getCurrentTime() * 1000; // positive: behind the session
    this.userStatusService.setDrift(drift);
    // without a changeable speed (Spotify) only a large drift is corrected, by an audible seek
    const rateCorrectable = this.mediaService.supportsPlaybackRate;
    if (Math.abs(drift) > (rateCorrectable ? MAX_RATE_CORRECTED_DRIFT : NO_RATE_SEEK_DRIFT)) {
      if (now - this.lastSeekCorrection > SEEK_CORRECTION_COOLDOWN) {
        this.lastSeekCorrection = now;
        console.log(`Drift of ${Math.round(drift)}ms: seeking`);
        this.mediaService.setPlaybackRate(1);
        this.mediaService.setCurrentTime(expected / 1000);
      }
    } else if (rateCorrectable && Math.abs(drift) > DRIFT_TOLERANCE) {
      const correction = Math.max(-MAX_RATE_CORRECTION, Math.min(MAX_RATE_CORRECTION, drift / 3000));
      this.mediaService.setPlaybackRate(1 + correction);
    } else {
      this.mediaService.setPlaybackRate(1);
    }
  }

  private cancelStart(): void {
    if (this.playTimer !== null) {
      clearTimeout(this.playTimer);
      this.playTimer = null;
    }
  }

  /**
   * Browsers only allow playback with sound after a user interaction. Muted playback is allowed and keeps the client in
   * sync; the sound is enabled with the next interaction.
   */
  private playMuted(): void {
    this.mediaService.setMuted(true);
    this.autoplayService.reportBlocked(() => this.mediaService.setMuted(false));
    this.mediaService.play().catch((reason) => {
      if (reason?.name === 'NotAllowedError') {
        // not even muted playback is allowed: join again after the interaction to catch up with the session
        this.autoplayService.reportBlocked(() => {
          const id = this.authenticationService.currentUserValue?.id;
          !!id && this.wsService.publishSessionCommand(`join/${id}`, 'join');
        });
      } else {
        console.error(reason);
      }
    });
  }
}
