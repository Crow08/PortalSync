package de.crow08.portalsync.wscommunication;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import de.crow08.portalsync.model.media.Media;
import de.crow08.portalsync.model.media.MediaRepository;
import de.crow08.portalsync.model.media.MinimalMedia;
import de.crow08.portalsync.model.queue.Queue;
import de.crow08.portalsync.model.queue.QueueEntry;
import de.crow08.portalsync.model.users.User;
import de.crow08.portalsync.model.users.UserRepository;
import de.crow08.portalsync.sessions.Session;
import de.crow08.portalsync.sessions.SessionController;
import de.crow08.portalsync.sessions.SessionRepository;
import de.crow08.portalsync.sessions.UserStatus;
import de.crow08.portalsync.wscommunication.commands.Command;
import de.crow08.portalsync.wscommunication.commands.ErrorCommand;
import de.crow08.portalsync.wscommunication.commands.JoinCommand;
import de.crow08.portalsync.wscommunication.commands.JumpCommand;
import de.crow08.portalsync.wscommunication.commands.LeaveCommand;
import de.crow08.portalsync.wscommunication.commands.NopCommand;
import de.crow08.portalsync.wscommunication.commands.PauseCommand;
import de.crow08.portalsync.wscommunication.commands.QueueSnapshot;
import de.crow08.portalsync.wscommunication.commands.ResumeCommand;
import de.crow08.portalsync.wscommunication.commands.SetMediaCommand;
import de.crow08.portalsync.wscommunication.commands.StopCommand;
import de.crow08.portalsync.wscommunication.commands.UpdateFairQueueCommand;
import de.crow08.portalsync.wscommunication.commands.UpdateHistoryCommand;
import de.crow08.portalsync.wscommunication.commands.UpdateLoopModeCommand;
import de.crow08.portalsync.wscommunication.commands.UpdateQueueAndHistoryCommand;
import de.crow08.portalsync.wscommunication.commands.UpdateQueueCommand;
import de.crow08.portalsync.wscommunication.commands.UpdateUserStatusCommand;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Controller
public class PlayerControlsController {

  private static final long JOIN_DELAY = 3000L;
  /** Minimum playback time before an end report is accepted, see {@link #end}. */
  private static final long END_GRACE_PERIOD = 2000L;
  private static final String QUEUE_CHANGED = "The queue has changed, please try again";
  private final SessionRepository sessionRepository;
  private final SessionController sessionController;
  private final UserRepository userRepository;
  private final MediaRepository mediaRepository;
  private final WebSocketSessionController webSocketSessionController;
  private final JsonMapper objectMapper = new JsonMapper();

  @Autowired
  public PlayerControlsController(SessionRepository sessionRepository,
                                  SessionController sessionController,
                                  UserRepository userRepository,
                                  MediaRepository mediaRepository,
                                  WebSocketSessionController webSocketSessionController) {
    this.sessionRepository = sessionRepository;
    this.sessionController = sessionController;
    this.userRepository = userRepository;
    this.mediaRepository = mediaRepository;
    this.webSocketSessionController = webSocketSessionController;
  }

  @MessageMapping("/sessions/{sessionId}/commands/start")
  @SendTo("/topic/sessions/{sessionId}")
  public Command start(@DestinationVariable long sessionId, String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    synchronized (session.getLock()) {
      sessionController.start(session);
      return setMedia(session);
    }
  }

  @MessageMapping("/sessions/{sessionId}/commands/jump/{offset}")
  @SendTo("/topic/sessions/{sessionId}")
  public Command jump(@DestinationVariable long sessionId, @DestinationVariable long offset, String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    synchronized (session.getLock()) {
      Duration startOffsetDuration = sessionController.moveMediaStartOffset(session, offset);
      long round = sessionController.enterSyncState(session);
      return new JumpCommand(startOffsetDuration.toMillis(), round);
    }
  }

  @MessageMapping("/sessions/{sessionId}/commands/skip")
  @SendTo("/topic/sessions/{sessionId}")
  public Command skip(@DestinationVariable long sessionId, String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    synchronized (session.getLock()) {
      sessionController.nextMedia(session);
      return setMedia(session);
    }
  }

  @MessageMapping("/sessions/{sessionId}/commands/previous")
  @SendTo("/topic/sessions/{sessionId}")
  public Command previous(@DestinationVariable long sessionId, String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    synchronized (session.getLock()) {
      sessionController.previousMedia(session);
      return setMedia(session);
    }
  }

  @MessageMapping("/sessions/{sessionId}/commands/pause")
  @SendTo("/topic/sessions/{sessionId}")
  public Command pause(@DestinationVariable long sessionId, String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    long pausePosition = sessionController.pause(session).toMillis();
    return new PauseCommand(pausePosition);
  }

  @MessageMapping("/sessions/{sessionId}/commands/resume")
  @SendTo("/topic/sessions/{sessionId}")
  public Command resume(@DestinationVariable long sessionId, String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    Instant startTime = sessionController.resume(session);
    if (startTime != null) {
      return new ResumeCommand(startTime.toEpochMilli());
    } else {
      return new NopCommand();
    }
  }

  @MessageMapping("/sessions/{sessionId}/commands/stop")
  @SendTo("/topic/sessions/{sessionId}")
  public Command stop(@DestinationVariable long sessionId, String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    sessionController.stop(session);
    return new StopCommand();
  }

  @MessageMapping("/sessions/{sessionId}/commands/join/{userId}")
  @SendTo("/topic/sessions/{sessionId}")
  public Command join(@DestinationVariable long sessionId, @DestinationVariable long userId, Principal principal,
                      @Header(SimpMessageHeaderAccessor.SESSION_ID_HEADER) String wsSessionId, String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    synchronized (session.getLock()) {
      // read without side effects: sessionController.getCurrentMedia() would move the first queued media into place
      Media currentMedia = session.getQueue().getCurrentMedia();
      MinimalMedia minMedia = null;
      if (currentMedia != null) {
        minMedia = new MinimalMedia(currentMedia.getId(), currentMedia.getTitle(), currentMedia.getType());
      }
      long startTime = Instant.now().plus(JOIN_DELAY, ChronoUnit.MILLIS).toEpochMilli();
      long startOffset = session.getSessionState().equals(Session.SessionState.PLAY) ?
          sessionController.getMediaStartOffset(session).plus(JOIN_DELAY, ChronoUnit.MILLIS).toMillis() :
          sessionController.getMediaStartOffset(session).toMillis();
      Optional<User> connectedUser = getConnectedUser(principal, userId);
      if (connectedUser.isPresent()) {
        webSocketSessionController.joinMusicSession(wsSessionId, sessionId);
        sessionController.addUserToSession(connectedUser.get(), session);
        return new JoinCommand(userId, minMedia, QueueSnapshot.of(session.getQueue()), session.syncRound(),
            session.getSessionState(), session.isLoopMode(), session.isFairQueue(), startTime, startOffset, session.getUsers(),
            new ArrayList<>(session.getUserStatuses()));
      }
    }
    return new NopCommand();
  }

  @MessageMapping("/sessions/{sessionId}/commands/leave/{userId}")
  @SendTo("/topic/sessions/{sessionId}")
  public Command leave(@DestinationVariable long sessionId, @DestinationVariable long userId, Principal principal,
                       @Header(SimpMessageHeaderAccessor.SESSION_ID_HEADER) String wsSessionId, String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    if (getConnectedUser(principal, userId).isEmpty()) {
      return new NopCommand();
    }
    // the user stays in the session as long as another connection (e.g. browser tab) of it is still in there
    if (!webSocketSessionController.leaveMusicSession(wsSessionId, userId, sessionId)) {
      return new NopCommand();
    }
    Optional<User> disconnectedUser = session.getUsers().stream().filter(user -> user.getId() == userId).findFirst();
    if (disconnectedUser.isPresent()) {
      sessionController.removeUserFromSession(disconnectedUser.get(), session);
      return new LeaveCommand(userId);
    }
    return new NopCommand();
  }

  @MessageMapping("/sessions/{sessionId}/commands/shuffle")
  @SendTo("/topic/sessions/{sessionId}")
  public Command shuffle(@DestinationVariable long sessionId, String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    synchronized (session.getLock()) {
      sessionController.shuffleQueue(session);
      return new UpdateQueueCommand(QueueSnapshot.of(session.getQueue()));
    }
  }

  /**
   * Moves media within the combined list of history, current media and queue (as displayed by the client).
   * The indices refer to the client's view, which may be outdated: the moved media is identified by its id.
   */
  @MessageMapping("/sessions/{sessionId}/commands/movedMedia/{requestedPreviousIndex}/to/{currentIndex}/{mediaId}")
  @SendTo("/topic/sessions/{sessionId}")
  public Command movedMedia(@DestinationVariable long sessionId, @DestinationVariable int requestedPreviousIndex,
                            @DestinationVariable int currentIndex, @DestinationVariable long mediaId, String message) throws Exception {

    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    synchronized (session.getLock()) {
      Queue queue = session.getQueue();
      int previousIndex = queue.findInHistoryAndQueue(requestedPreviousIndex, mediaId);
      // the current media can not be moved, a move of it changes nothing
      if (previousIndex < 0) {
        throw new Exception(QUEUE_CHANGED);
      }
      queue.move(previousIndex, currentIndex);
      return new UpdateQueueAndHistoryCommand(QueueSnapshot.of(queue));
    }
  }

  /**
   * Jumps to a media in the history or queue. The index refers to the client's view, which may be outdated: the media
   * is identified by its id, the index selects one of several occurrences.
   */
  @MessageMapping("/sessions/{sessionId}/commands/skipTo/{requestedIndex}/{mediaId}")
  @SendTo("/topic/sessions/{sessionId}")
  public Command skipTo(@DestinationVariable long sessionId, @DestinationVariable int requestedIndex,
                        @DestinationVariable long mediaId, String message) throws Exception {

    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    synchronized (session.getLock()) {
      int index = session.getQueue().findInHistoryAndQueue(requestedIndex, mediaId);
      if (index < 0) {
        throw new Exception(QUEUE_CHANGED);
      }
      sessionController.skipTo(session, index);
      return setMedia(session);
    }
  }


  @MessageMapping("/sessions/{sessionId}/commands/loop/{loopMode}")
  @SendTo("/topic/sessions/{sessionId}")
  public Command loop(@DestinationVariable long sessionId, @DestinationVariable boolean loopMode, String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    synchronized (session.getLock()) {
      session.setLoopMode(loopMode);
      return new UpdateLoopModeCommand(session.isLoopMode());
    }
  }

  @MessageMapping("/sessions/{sessionId}/commands/fairQueue/{fairQueue}")
  @SendTo("/topic/sessions/{sessionId}")
  public Command fairQueue(@DestinationVariable long sessionId, @DestinationVariable boolean fairQueue, String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    synchronized (session.getLock()) {
      // only changes where media are added from now on, the queue stays as it is
      session.setFairQueue(fairQueue);
      return new UpdateFairQueueCommand(session.isFairQueue());
    }
  }

  @MessageMapping("/sessions/{sessionId}/commands/end/{mediaId}")
  @SendTo("/topic/sessions/{sessionId}")
  public Command end(@DestinationVariable long sessionId, @DestinationVariable long mediaId, String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    synchronized (session.getLock()) {
      // only the first report for a playback that actually ran is accepted, see Session.hasPlayed
      if (session.hasPlayed(mediaId, END_GRACE_PERIOD, Instant.now())) {
        sessionController.nextMedia(session);
        return setMedia(session);
      }
    }
    return new NopCommand();
  }

  /**
   * Deletes media from the queue or history. The index refers to the client's view, which may be outdated: the media
   * is identified by its id.
   */
  @MessageMapping("/sessions/{sessionId}/commands/deleteMediaFromQueue/{queueIndex}/{type}/{mediaId}")
  @SendTo("/topic/sessions/{sessionId}")
  public Command deleteMediaFromQueue(@DestinationVariable long sessionId, @DestinationVariable int queueIndex,
                                      @DestinationVariable String type, @DestinationVariable long mediaId, String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    synchronized (session.getLock()) {
      switch (type) {
        case "queue" -> {
          int index = session.getQueue().findQueued(queueIndex, mediaId);
          if (index < 0) {
            throw new Exception(QUEUE_CHANGED);
          }
          sessionController.deleteMediaFromQueue(session, index);
          return new UpdateQueueCommand(QueueSnapshot.of(session.getQueue()));
        }
        case "history" -> {
          int index = session.getQueue().findHistory(queueIndex, mediaId);
          if (index < 0) {
            throw new Exception(QUEUE_CHANGED);
          }
          sessionController.deleteMediaFromHistory(session, index);
          return new UpdateHistoryCommand(QueueSnapshot.of(session.getQueue()));
        }
        default -> throw new Exception("Unknown list: " + type);
      }
    }
  }

  /**
   * A client has loaded the media of a sync round. The round is the one the command that started it named (SetMedia,
   * Jump, or the Join of a client that joined while it was running).
   */
  @MessageMapping("/sessions/{sessionId}/commands/ready/{userId}/{mediaId}/{duration}/{round}")
  @SendTo("/topic/sessions/{sessionId}")
  public Command ready(@DestinationVariable long sessionId, @DestinationVariable long userId, @DestinationVariable long mediaId,
                       @DestinationVariable long duration, @DestinationVariable long round, Principal principal, String message)
      throws Exception {
    Optional<User> connectedUser = getConnectedUser(principal, userId);
    Optional<Session> session = sessionRepository.findById(sessionId);
    if (connectedUser.isPresent() && session.isPresent()) {
      // duration is not compared: browsers snap the media position differently, the server offset is authoritative
      return sessionController.userIsReady(connectedUser.get(), session.get(), mediaId, round).orElseGet(NopCommand::new);
    }
    return new NopCommand();
  }

  /**
   * Stores the playback status reported by a client (loading/ready, latency, drift) and shows it to the session.
   * Reported regularly while playing, so the message is not logged.
   */
  @MessageMapping("/sessions/{sessionId}/commands/status/{userId}")
  @SendTo("/topic/sessions/{sessionId}")
  public Command status(@DestinationVariable long sessionId, @DestinationVariable long userId, Principal principal,
                        String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    if (getConnectedUser(principal, userId).isEmpty()) {
      return new NopCommand();
    }
    UserStatus status = UserStatus.fromReport(userId, objectMapper.readValue(message, UserStatus.class));
    synchronized (session.getLock()) {
      // a late report must not bring back the status of a user that already left the session
      if (session.getUsers().stream().noneMatch(user -> user.getId() == userId)) {
        return new NopCommand();
      }
      session.setUserStatus(status);
    }
    return new UpdateUserStatusCommand(status);
  }

  @MessageMapping("/sessions/{sessionId}/commands/addMediaToQueue")
  @SendTo("/topic/sessions/{sessionId}")
  public Command addMediaToPlaylist(@DestinationVariable long sessionId, Principal principal, String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    Media media = findMedia(objectMapper.readTree(message)).orElseThrow(() -> new Exception("Media not found"));
    Long userId = getUserId(principal);
    synchronized (session.getLock()) {
      sessionController.addMedia(session, List.of(media), userId);
      return new UpdateQueueCommand(QueueSnapshot.of(session.getQueue()));
    }
  }

  @MessageMapping("/sessions/{sessionId}/commands/addMediaListToQueue")
  @SendTo("/topic/sessions/{sessionId}")
  public Command addMediaListToPlaylist(@DestinationVariable long sessionId, Principal principal, String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    List<Media> media = new ArrayList<>();
    for (JsonNode node : objectMapper.readTree(message)) {
      findMedia(node).ifPresent(media::add);
    }
    if (media.isEmpty()) {
      throw new Exception("Media not found");
    }
    Long userId = getUserId(principal);
    synchronized (session.getLock()) {
      sessionController.addMedia(session, media, userId);
      return new UpdateQueueCommand(QueueSnapshot.of(session.getQueue()));
    }
  }

  @MessageMapping("/sessions/{sessionId}/commands/playMediaNext")
  @SendTo("/topic/sessions/{sessionId}")
  public Command playMediaNext(@DestinationVariable long sessionId, Principal principal, String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    Media media = findMedia(objectMapper.readTree(message)).orElseThrow(() -> new Exception("Media not found"));
    Long userId = getUserId(principal);
    synchronized (session.getLock()) {
      session.getQueue().addNext(new QueueEntry(media, userId));
      return new UpdateQueueCommand(QueueSnapshot.of(session.getQueue()));
    }
  }

  /**
   * Resolves the user of the WebSocket connection. The user id in the destination is only accepted if it matches, so a
   * client can not act on behalf of another user.
   */
  private Optional<User> getConnectedUser(Principal principal, long userId) {
    User user = principal != null ? userRepository.findByUsername(principal.getName()) : null;
    if (user == null || user.getId() != userId) {
      return Optional.empty();
    }
    return Optional.of(user);
  }

  /**
   * Id of the user of the WebSocket connection, null if unknown. Remembered with the media a user adds to the queue.
   */
  private Long getUserId(Principal principal) {
    User user = principal != null ? userRepository.findByUsername(principal.getName()) : null;
    return user != null ? user.getId() : null;
  }

  /**
   * Resolves media sent by a client via its id. The remaining client data is not trusted.
   */
  private Optional<Media> findMedia(JsonNode mediaNode) {
    JsonNode id = mediaNode.get("id");
    if (id == null || !id.canConvertToLong()) {
      return Optional.empty();
    }
    return mediaRepository.findById(id.asLong());
  }

  @MessageMapping("/sessions/{sessionId}/commands/playMediaNow")
  @SendTo("/topic/sessions/{sessionId}")
  public Command playMediaNow(@DestinationVariable long sessionId, Principal principal, String message) throws Exception {
    Session session = sessionRepository.findById(sessionId).orElseThrow(() -> new Exception("Session not found"));
    Media media = findMedia(objectMapper.readTree(message)).orElseThrow(() -> new Exception("Media not found"));
    Long userId = getUserId(principal);
    synchronized (session.getLock()) {
      session.getQueue().addNext(new QueueEntry(media, userId));
      sessionController.nextMedia(session);
      return setMedia(session);
    }
  }

  /**
   * Reports a failed command only to the connection that sent it, instead of failing silently.
   */
  @MessageExceptionHandler
  @SendToUser(destinations = "/queue/errors", broadcast = false)
  public Command handleException(Exception exception,
                                 @Header(SimpMessageHeaderAccessor.DESTINATION_HEADER) String destination) {
    String reason = exception.getMessage() != null ? exception.getMessage() : exception.getClass().getSimpleName();
    // only the deliberate, short messages ("Session not found") are meant for the user; the text of anything else
    // (parsing errors, stack details) stays in the server log
    boolean deliberate = exception.getClass() == Exception.class || exception instanceof IllegalArgumentException
        || exception instanceof IllegalStateException;
    String message = deliberate && exception.getMessage() != null && exception.getMessage().length() <= 100
        ? exception.getMessage() : "That did not work. Please try again.";
    return new ErrorCommand(message, destination);
  }

  /**
   * Announces the current media. The queue and history are sent along: clients can not derive them from the media,
   * which may occur several times in the queue and history.
   */
  private Command setMedia(Session session) {
    synchronized (session.getLock()) {
      Optional<Media> currentMedia = sessionController.getCurrentMedia(session);
      if (currentMedia.isPresent()) {
        MinimalMedia minimalMedia = new MinimalMedia(currentMedia.get().getId(), currentMedia.get().getTitle(), currentMedia.get().getType());
        long round = sessionController.enterSyncState(session);
        return new SetMediaCommand(minimalMedia, QueueSnapshot.of(session.getQueue()), round);
      }
      // the queue ended: nothing is playing any more, a running sync round must not start playback
      sessionController.stop(session);
      return new StopCommand(QueueSnapshot.of(session.getQueue()));
    }
  }
}
