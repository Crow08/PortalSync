package de.crow08.portalsync.sessions;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ScheduledFuture;

/**
 * State of a single synchronization round of a session. A round is started by the server whenever the session enters
 * a sync state and is finished either when all users reported ready for the target media or when its timeout expires.
 * Each round has its own id so that a timeout of an outdated round can not interfere with a newer one.
 */
public class SessionUserSynchronization {

  private final Set<Long> readyUsers = new HashSet<>();
  private long round = 0;
  private boolean active = false;
  private long targetMediaId = -1;
  private ScheduledFuture<?> timeout;

  /**
   * Starts a new round and discards the previous one including its timeout.
   *
   * @param mediaId the media all users have to be ready for.
   * @return the id of the new round.
   */
  public synchronized long startRound(long mediaId) {
    cancelTimeout();
    readyUsers.clear();
    targetMediaId = mediaId;
    active = true;
    return ++round;
  }

  public synchronized void setTimeout(long round, ScheduledFuture<?> timeout) {
    if (this.round == round && active) {
      this.timeout = timeout;
    } else {
      timeout.cancel(false);
    }
  }

  /**
   * Marks a user as ready. The client names the round it is ready for: a late message of an outdated round is
   * ignored, also when the new round is for the same media (e.g. the media was set again before everyone had loaded it).
   *
   * @return true if the user was accepted for the current round.
   */
  public synchronized boolean addReadyUser(long userId, long mediaId, long round) {
    if (!active || round != this.round || mediaId != targetMediaId) {
      return false;
    }
    readyUsers.add(userId);
    return true;
  }

  public synchronized boolean allReady(Collection<Long> userIds) {
    return active && readyUsers.containsAll(userIds);
  }

  /** The id of the running round, 0 if none is running. Clients send it back with their ready message. */
  public synchronized long currentRound() {
    return active ? round : 0;
  }

  public synchronized boolean isActive() {
    return active;
  }

  public synchronized boolean isCurrentRound(long round) {
    return active && this.round == round;
  }

  public synchronized void completeRound() {
    cancelTimeout();
    readyUsers.clear();
    targetMediaId = -1;
    active = false;
  }

  private void cancelTimeout() {
    if (timeout != null) {
      timeout.cancel(false);
      timeout = null;
    }
  }
}
