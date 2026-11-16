package de.crow08.portalsync.sessions;

import de.crow08.portalsync.model.media.Media;
import de.crow08.portalsync.model.media.MediaType;
import de.crow08.portalsync.model.users.User;
import de.crow08.portalsync.model.users.UserRepository;
import de.crow08.portalsync.wscommunication.WebSocketSessionController;
import de.crow08.portalsync.wscommunication.commands.Command;
import de.crow08.portalsync.wscommunication.commands.LeaveCommand;
import de.crow08.portalsync.wscommunication.commands.SessionDeletedCommand;
import de.crow08.portalsync.wscommunication.commands.StartCommand;
import de.crow08.portalsync.wscommunication.commands.UpdateFairQueueCommand;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;

/**
 * Runs the sessions: it takes the lock of a session, applies a change with the current time and does what the rules
 * can not do themselves (the sync timeout, messages to the session, the users of the WebSocket connections). The rules
 * of the playback and the queue live in {@link Session} and {@link de.crow08.portalsync.model.queue.Queue}; user
 * commands go through this controller instead of changing a session directly.
 */
@Controller
public class SessionController {
  private static final Logger LOG = LoggerFactory.getLogger(SessionController.class);

  // lead time for resuming, so the resume command reaches all clients in time (late clients compensate)
  private final static long SYNC_DELAY = 500;

  private final static long SYNC_TIMEOUT = 5000;

  private final ScheduledExecutorService syncTimeoutScheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
    Thread thread = new Thread(runnable, "session-sync-timeout");
    thread.setDaemon(true);
    return thread;
  });

  private final WebSocketSessionController webSocketSessionController;

  private final SimpMessagingTemplate simpMessagingTemplate;

  private final UserRepository userRepository;
  private final SessionRepository sessionRepository;

  @Autowired
  public SessionController(final WebSocketSessionController webSocketSessionController,
                           SimpMessagingTemplate simpMessagingTemplate,
                           UserRepository userRepository,
                           SessionRepository sessionRepository) {
    this.simpMessagingTemplate = simpMessagingTemplate;
    this.webSocketSessionController = webSocketSessionController;
    this.userRepository = userRepository;
    this.sessionRepository = sessionRepository;
    setUpListeners();

  }

  @PreDestroy
  public void shutdown() {
    syncTimeoutScheduler.shutdownNow();
  }

  private void setUpListeners() {
    webSocketSessionController.addDisconnectListener((userId, sessionId) ->
        sessionRepository.findById(sessionId).ifPresent(session -> {
          Optional<User> disconnectedUser = session.getUsers().stream().filter(user -> user.getId() == userId).findFirst();
          disconnectedUser.ifPresent(user -> {
            this.removeUserFromSession(user, session);
            // this message has to be fired here to inform other Users about an unexpected disconnect
            simpMessagingTemplate.convertAndSend("/topic/sessions/" + session.getId(), new LeaveCommand(userId));
          });
        }));
    webSocketSessionController.addConnectListener((userId, sessionId) -> {
      Optional<Session> session = getSessionsAsStream().filter(ses -> sessionId == ses.getId()).findFirst();
      if (session.isPresent()) {
        Optional<User> user = userRepository.findById(userId);
        user.ifPresent(value -> {
          this.addUserToSession(user.get(), session.get());
        });

      }
    });
  }

  private Stream<Session> getSessionsAsStream() {
    return StreamSupport.stream(sessionRepository.findAll().spliterator(), false);
  }

  /**
   * Gets the current media being played. If no media is being played {@link #nextMedia(Session)} is called
   * automatically to move an element in the current position.
   *
   * @param session to get the media for.
   * @return the current media.
   */
  public Optional<Media> getCurrentMedia(Session session) {
    synchronized (session.getLock()) {
      if (session.getQueue().getCurrentMedia() == null) {
        session.nextMedia();
      }
      return Optional.ofNullable(session.getQueue().getCurrentMedia());
    }
  }

  /**
   * Gets the time the media has been played for. This time excludes pauses.
   * If the media is currently playing this represents a snapshot of the time at the moment of execution.
   */
  public Duration getMediaStartOffset(Session session) {
    synchronized (session.getLock()) {
      return session.playbackOffset(Instant.now());
    }
  }

  /**
   * Moves the current media play position by the defined offset and pauses the playback at the new position.
   *
   * @param offset the amount in ms by which the current offset should be moved.
   * @return new current media offset see {@link #getMediaStartOffset(Session)}
   */
  public Duration moveMediaStartOffset(Session session, long offset) {
    synchronized (session.getLock()) {
      return session.seekBy(offset, Instant.now());
    }
  }

  /** Moves on to the next media of the queue, see {@link Session#nextMedia()}. */
  public void nextMedia(Session session) {
    synchronized (session.getLock()) {
      session.nextMedia();
    }
  }

  /**
   * Makes the media at the given index the current media, see {@link Session#skipTo(int)}.
   *
   * @param index index in the combined list of history, current media and queue
   */
  public void skipTo(Session session, int index) {
    synchronized (session.getLock()) {
      session.skipTo(index);
    }
  }

  /** Goes back to the latest media of the history, see {@link Session#previousMedia()}. */
  public void previousMedia(Session session) {
    synchronized (session.getLock()) {
      session.previousMedia();
    }
  }

  /**
   * Adds the media of a playlist like {@link #addMedia}. If it is the first content of the lobby (nothing queued,
   * playing or played yet) and the playlist begins with a song, the fair queue mode is switched on.
   *
   * @param session for the media to be added to
   * @param media   media of the playlist
   * @param addedBy id of the user who adds the media, null if unknown
   */
  public void addPlaylist(Session session, List<Media> media, Long addedBy) {
    synchronized (session.getLock()) {
      boolean initialPlaylist = session.getQueue().hasNoMedia();
      // a lobby that starts with music is a party: everybody's songs take turns. Video lobbies keep the plain order
      if (initialPlaylist && !media.isEmpty() && media.getFirst().getType() == MediaType.SONG && !session.isFairQueue()) {
        session.setFairQueue(true);
        sendToSession(session, new UpdateFairQueueCommand(true));
      }
      session.addMedia(media, addedBy);
    }
  }

  /**
   * Adds a list of media to the queue of the session, see {@link Session#addMedia}.
   *
   * @param addedBy id of the user who adds the media, null if unknown
   */
  public void addMedia(Session session, List<Media> media, Long addedBy) {
    synchronized (session.getLock()) {
      session.addMedia(media, addedBy);
    }
  }

  /** Marks the start of a media, see {@link Session#startPlayback()}. */
  public void start(Session session) {
    synchronized (session.getLock()) {
      session.startPlayback();
    }
  }

  /**
   * Pauses the playback, see {@link Session#pausePlayback}.
   *
   * @return the position the playback is paused at.
   */
  public Duration pause(Session session) {
    synchronized (session.getLock()) {
      return session.pausePlayback(Instant.now());
    }
  }

  /**
   * Resumes a paused playback within {@value #SYNC_DELAY}ms, see {@link Session#resumePlayback}.
   *
   * @return server time of the media start, null if nothing starts now (not paused, or a sync round is running).
   */
  public Instant resume(Session session) {
    synchronized (session.getLock()) {
      return session.resumePlayback(Instant.now(), SYNC_DELAY);
    }
  }

  /** Stops the playback, see {@link Session#stopPlayback()}. */
  public void stop(Session session) {
    synchronized (session.getLock()) {
      session.stopPlayback();
    }
  }

  /** Shuffles the queue, see {@link Session#shuffleQueue()}. */
  public void shuffleQueue(Session session) {
    synchronized (session.getLock()) {
      session.shuffleQueue();
    }
  }

  public void deleteMediaFromQueue(Session session, int queueIndex) {
    synchronized (session.getLock()) {
      session.getQueue().removeQueued(queueIndex);
    }
  }

  public void deleteMediaFromHistory(Session session, int historyIndex) {
    synchronized (session.getLock()) {
      session.getQueue().removeHistory(historyIndex);
    }
  }

  public Session createNewSession(String name, long creatorId) {
    Session session = new Session(name);
    session.setCreatorId(creatorId);
    sessionRepository.save(session);
    return session;
  }

  /**
   * Deletes the session. Everyone still in it is kicked: they get a {@link SessionDeletedCommand} and the session is
   * gone, so further commands for it are dropped.
   */
  public void deleteSession(Session session) {
    synchronized (session.getLock()) {
      sessionRepository.delete(session);
      // a pending sync timeout must not start the playback of a deleted session
      session.getSessionUserSynchronization().completeRound();
      session.stopPlayback();
      sendToSession(session, new SessionDeletedCommand());
      session.getUsers().clear();
    }
    webSocketSessionController.forgetMusicSession(session.getId());
  }

  public void addUserToSession(User newUser, Session session) {
    // check and add atomically: joins of different users can be handled at the same time
    synchronized (session.getLock()) {
      if (session.getUsers().stream().noneMatch(user -> user.getId() == newUser.getId())) {
        session.getUsers().add(newUser);
        sessionRepository.save(session);
      }
    }
  }

  public void removeUserFromSession(User oldUser, Session session) {
    synchronized (session.getLock()) {
      // removed together, so a status report checking the membership under the lock can not bring the status back
      session.getUsers().remove(oldUser);
      session.removeUserStatus(oldUser.getId());
      sessionRepository.save(session);
      // the removed user might have been the last one the current sync round was waiting for
      if (session.allUsersReady()) {
        sendToSession(session, finishSync(session));
      }
    }
  }

  /**
   * Coordinates Users to perform a synchronized start. This method has to be called for every user once to mark it as
   * ready for the start of the current sync round (see {@link #enterSyncState(Session)}).
   * When the last user of the session is ready the round is finished and the resulting command is returned.
   *
   * @param user    User who indicates its ready state
   * @param session session the user is in.
   * @param mediaId Id of the media the user marks its readiness for.
   * @param round   Id of the sync round the user is ready for, as the command that started the round named it.
   * @return the command to broadcast if the round is finished ({@link StartCommand} for a pending playback),
   * empty otherwise.
   */
  public Optional<Command> userIsReady(User user, Session session, long mediaId, long round) {
    synchronized (session.getLock()) {
      if (!session.userReady(user.getId(), mediaId, round)) {
        return Optional.empty();
      }
      return Optional.ofNullable(finishSync(session));
    }
  }

  /**
   * Moves the session into its sync state and starts a new sync round for the current media (see
   * {@link Session#enterSync()}). If not all users are ready within {@value #SYNC_TIMEOUT}ms the round is finished
   * anyway.
   *
   * @return the id of the round, which the command that tells the clients about it has to carry; 0 if there is no
   * current media and so no round
   */
  public long enterSyncState(Session session) {
    synchronized (session.getLock()) {
      long round = session.enterSync();
      if (round < 0) {
        return 0;
      }
      session.getSessionUserSynchronization().setTimeout(round,
          syncTimeoutScheduler.schedule(() -> onSyncTimeout(session, round), SYNC_TIMEOUT, TimeUnit.MILLISECONDS));
      return round;
    }
  }

  private void onSyncTimeout(Session session, long round) {
    synchronized (session.getLock()) {
      SessionUserSynchronization sync = session.getSessionUserSynchronization();
      if (!sync.isCurrentRound(round)) {
        return;
      }
      if (!session.inSyncState()) {
        // session has been paused or stopped in the meantime
        sync.completeRound();
        return;
      }
      LOG.info("Sync timeout in session {}: starting without all users being ready", session.getId());
      sendToSession(session, finishSync(session));
    }
  }

  /**
   * Finishes the current sync round. Must be called while holding the session lock ({@link Session#getLock()}).
   *
   * @return a {@link StartCommand} if playback is pending, null otherwise.
   */
  private Command finishSync(Session session) {
    Instant start = session.finishSync(Instant.now(), SYNC_DELAY);
    return start != null ? new StartCommand(start.toEpochMilli()) : null;
  }

  private void sendToSession(Session session, Command command) {
    if (command != null) {
      simpMessagingTemplate.convertAndSend("/topic/sessions/" + session.getId(), command);
    }
  }
}
