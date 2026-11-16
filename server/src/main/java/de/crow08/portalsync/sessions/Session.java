package de.crow08.portalsync.sessions;

import com.fasterxml.jackson.annotation.JsonIgnore;
import de.crow08.portalsync.model.media.Media;
import de.crow08.portalsync.model.playlists.Playlist;
import de.crow08.portalsync.model.queue.Queue;
import de.crow08.portalsync.model.queue.QueueEntry;
import de.crow08.portalsync.model.users.User;

import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * A lobby: its users, its queue and the state of its playback. The rules of the playback (which state follows which,
 * where the playback is at a given time) live in the methods at the end of this class. They take the current time as a
 * parameter and know nothing about Spring or the WebSocket, so they can be tested directly.
 * <p>
 * Not thread safe: callers hold {@link #getLock()} while they read or change the session.
 */
public class Session {

  /**
   * Guards all state of this session (playback state, timing, queue, users). Commands of a session are handled
   * concurrently by the WebSocket message handlers.
   */
  private final Object lock = new Object();
  private final SessionUserSynchronization sessionUserSynchronization = new SessionUserSynchronization();
  /** Playback status reported by the clients, by user id. */
  private final Map<Long, UserStatus> userStatuses = new ConcurrentHashMap<>();
  private long id;
  private List<User> users;
  private String name;
  /** Id of the user who created the session, 0 if unknown. Together with admins the only one who may delete it. */
  private long creatorId;
  private SessionState sessionState = SessionState.STOP;
  private Instant mediaStarted = null;
  private Duration savedProgression = Duration.ZERO;
  private Queue queue = new Queue();
  private boolean loopMode;
  /** Media are added to the queue in fair order (the users take turns) instead of at the end. */
  private boolean fairQueue;

  @Deprecated
  public Session() {
  }

  public Session(String name) {
    // read and modified by concurrently handled WebSocket messages
    this.users = new CopyOnWriteArrayList<>();
    this.name = name;
  }

  public Session(String name, Playlist playlist) {
    this(name);
    this.queue = new Queue(playlist);
  }

  @JsonIgnore
  public Object getLock() {
    return lock;
  }

  public long getId() {
    return id;
  }

  public void setId(long id) {
    this.id = id;
  }

  public List<User> getUsers() {
    return users;
  }

  public void setUsers(List<User> users) {
    this.users = users;
  }

  @JsonIgnore
  public Collection<UserStatus> getUserStatuses() {
    return userStatuses.values();
  }

  public void setUserStatus(UserStatus userStatus) {
    userStatuses.put(userStatus.getUserId(), userStatus);
  }

  public void removeUserStatus(long userId) {
    userStatuses.remove(userId);
  }

  public SessionUserSynchronization getSessionUserSynchronization() {
    return sessionUserSynchronization;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public long getCreatorId() {
    return creatorId;
  }

  public void setCreatorId(long creatorId) {
    this.creatorId = creatorId;
  }

  public Queue getQueue() {
    return queue;
  }

  public SessionState getSessionState() {
    return sessionState;
  }

  public Instant getMediaStarted() {
    return mediaStarted;
  }

  public Duration getSavedProgression() {
    return savedProgression;
  }

  public boolean isLoopMode() {
    return loopMode;
  }

  public void setLoopMode(boolean loopMode) {
    this.loopMode = loopMode;
  }

  public boolean isFairQueue() {
    return fairQueue;
  }

  public void setFairQueue(boolean fairQueue) {
    this.fairQueue = fairQueue;
  }

  // --- playback: state and timing -----------------------------------------------------------------------------------

  /** A sync round is running: the users load the media, the playback waits for them (see {@link #enterSync()}). */
  public boolean inSyncState() {
    return sessionState == SessionState.SYNC_PLAY || sessionState == SessionState.SYNC_PAUSE
        || sessionState == SessionState.SYNC_STOP;
  }

  /**
   * The position of the playback in the current media, without the pauses. A playback that is planned for the future
   * (a resume has a lead time) has not started yet: that counts as no progress instead of a negative one.
   */
  public Duration playbackOffset(Instant now) {
    Duration running = mediaStarted != null && now.isAfter(mediaStarted) ? Duration.between(mediaStarted, now) : Duration.ZERO;
    return savedProgression.plus(running);
  }

  /** Keeps the position reached so far and stops the clock. */
  private void holdProgress(Instant now) {
    savedProgression = playbackOffset(now);
    mediaStarted = null;
  }

  private void resetProgress() {
    savedProgression = Duration.ZERO;
    mediaStarted = null;
  }

  /**
   * Moves the position by the given offset. The clock stops at the new position: the users have to load it first
   * (the caller enters the sync state).
   *
   * @return the new position
   */
  public Duration seekBy(long offsetMillis, Instant now) {
    holdProgress(now);
    savedProgression = savedProgression.plusMillis(offsetMillis);
    return savedProgression;
  }

  /** Starts over: the playback of a media begins at its start, the state is playing (after a running sync round). */
  public void startPlayback() {
    resetProgress();
    sessionState = inSyncState() ? SessionState.SYNC_PLAY : SessionState.PLAY;
  }

  /**
   * Pauses the playback at the position reached so far.
   *
   * @return the position the playback is paused at
   */
  public Duration pausePlayback(Instant now) {
    holdProgress(now);
    sessionState = SessionState.PAUSE;
    return savedProgression;
  }

  /**
   * Resumes a paused playback {@code leadMillis} in the future, so the command reaches all clients in time. Only a
   * paused session resumes: one that plays already keeps its clock (two users pressing play at the same time), a
   * stopped one has nothing to resume. During a sync round the playback is only marked to start when the round ends.
   *
   * @return the time the playback starts at, null if nothing starts now
   */
  public Instant resumePlayback(Instant now, long leadMillis) {
    if (inSyncState()) {
      sessionState = SessionState.SYNC_PLAY;
      return null;
    }
    if (sessionState != SessionState.PAUSE) {
      return null;
    }
    return runFrom(now.plusMillis(leadMillis));
  }

  private Instant runFrom(Instant start) {
    mediaStarted = start;
    sessionState = SessionState.PLAY;
    return start;
  }

  /** Stops the playback and forgets its position. */
  public void stopPlayback() {
    resetProgress();
    sessionState = SessionState.STOP;
  }

  /**
   * Moves the session into its sync state and starts a new sync round for the current media: the playback waits until
   * the users are ready (or the caller ends the round after a timeout). A running round is replaced.
   *
   * @return the id of the new round, -1 without a current media (nothing to wait for)
   */
  public long enterSync() {
    Media currentMedia = queue.getCurrentMedia();
    if (currentMedia == null) {
      return -1;
    }
    switch (sessionState) {
      case PLAY -> sessionState = SessionState.SYNC_PLAY;
      case PAUSE -> sessionState = SessionState.SYNC_PAUSE;
      case STOP -> sessionState = SessionState.SYNC_STOP;
      default -> {
        // already in a sync state: the new round keeps what happens when it ends
      }
    }
    return sessionUserSynchronization.startRound(currentMedia.getId());
  }

  /**
   * Marks a user as ready for the sync round it names. A report for an earlier round does not count: the client has
   * not seen the command that started the current one yet, so a start now would reach it before that command.
   *
   * @return true if this completed the round: all users of the session are ready (see {@link #finishSync})
   */
  public boolean userReady(long userId, long mediaId, long round) {
    return inSyncState() && sessionUserSynchronization.addReadyUser(userId, mediaId, round) && allUsersReady();
  }

  /** The id of the running sync round, 0 if none is running (see {@link #enterSync()}). */
  public long syncRound() {
    return sessionUserSynchronization.currentRound();
  }

  /** All users of the session are ready for the running sync round, e.g. after the one it waited for left. */
  public boolean allUsersReady() {
    return inSyncState() && sessionUserSynchronization.allReady(users.stream().map(User::getId).toList());
  }

  /**
   * Ends the sync round and leaves the sync state. A session that was about to play starts {@code leadMillis} in the
   * future.
   *
   * @return the time the playback starts at, null if the session stays paused or stopped
   */
  public Instant finishSync(Instant now, long leadMillis) {
    sessionUserSynchronization.completeRound();
    switch (sessionState) {
      case SYNC_PLAY -> {
        return runFrom(now.plusMillis(leadMillis));
      }
      case SYNC_PAUSE -> sessionState = SessionState.PAUSE;
      case SYNC_STOP -> sessionState = SessionState.STOP;
      default -> {
        // not in a sync state (paused or stopped in the meantime): nothing to leave
      }
    }
    return null;
  }

  /**
   * Whether the current media is the given one and has been playing for at least {@code minMillis}. Every client reports
   * the end of a media: only the first report for a playback that actually ran counts, so a slow client can not skip
   * the next media, even if it is the same media again (loop mode with one media).
   */
  public boolean hasPlayed(long mediaId, long minMillis, Instant now) {
    Media currentMedia = queue.getCurrentMedia();
    return currentMedia != null && currentMedia.getId() == mediaId && sessionState == SessionState.PLAY
        && playbackOffset(now).toMillis() >= minMillis;
  }

  // --- queue: changes of the current media reset the position ---------------------------------------------------------

  /** Moves on to the next media of the queue (see {@link Queue#next}). */
  public void nextMedia() {
    resetProgress();
    queue.next(loopMode);
  }

  /** Goes back to the latest media of the history (see {@link Queue#previous}). */
  public void previousMedia() {
    resetProgress();
    queue.previous(loopMode);
  }

  /** Makes the media at the index in the combined list the current one (see {@link Queue#skipTo}). */
  public void skipTo(int index) {
    resetProgress();
    queue.skipTo(index);
  }

  /** Adds media to the queue: at the end, or with the fair queue mode in fair order (see {@link Queue#addFair}). */
  public void addMedia(List<Media> media, Long addedBy) {
    media.forEach(added -> queue.add(new QueueEntry(added, addedBy), fairQueue));
  }

  /** Shuffles the queue, with the fair queue mode in fair order. */
  public void shuffleQueue() {
    queue.shuffle(fairQueue);
  }

  public enum SessionState {
    PLAY, STOP, SYNC_PLAY, SYNC_STOP, SYNC_PAUSE, PAUSE
  }
}
