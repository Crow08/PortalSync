package de.crow08.portalsync.model.media.video;

import com.fasterxml.jackson.annotation.JsonIgnore;

import java.time.Instant;

/**
 * One ffmpeg run for an uploaded video and how far it is. Jobs live in memory only (see {@link VideoJobs}); the client
 * shows the jobs of its user on the upload page.
 */
public class VideoJob {

  public enum Kind {
    /** Converts the upload into a browser playable MP4, the video appears in the library when it is done. */
    CONVERT,
    /** Only writes the thumbnail sprite of a video that is in the library already. */
    THUMBNAILS
  }

  public enum State {
    QUEUED, RUNNING, DONE, FAILED
  }

  private final long id;
  private final long ownerId;
  private final String title;
  private final Kind kind;
  private volatile State state = State.QUEUED;
  private volatile double progress;
  private volatile Instant finished;

  VideoJob(long id, long ownerId, String title, Kind kind) {
    this.id = id;
    this.ownerId = ownerId;
    this.title = title;
    this.kind = kind;
  }

  public long getId() {
    return id;
  }

  @JsonIgnore
  public long getOwnerId() {
    return ownerId;
  }

  public String getTitle() {
    return title;
  }

  public Kind getKind() {
    return kind;
  }

  public State getState() {
    return state;
  }

  /** From 0 to 1; stays 0 while running if the length of the video is unknown. */
  public double getProgress() {
    return progress;
  }

  @JsonIgnore
  public Instant getFinished() {
    return finished;
  }

  void running() {
    state = State.RUNNING;
  }

  void progress(double value) {
    progress = Math.max(0, Math.min(1, value));
  }

  void finish(boolean success, Instant now) {
    if (success) {
      progress = 1;
    }
    finished = now;
    state = success ? State.DONE : State.FAILED;
  }
}
