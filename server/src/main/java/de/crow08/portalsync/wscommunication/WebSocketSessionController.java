package de.crow08.portalsync.wscommunication;

import de.crow08.portalsync.model.users.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class WebSocketSessionController {

  final UserRepository userRepository;
  private final List<DisconnectObserver> dcListeners = new ArrayList<>();
  private final List<ConnectObserver> cListeners = new ArrayList<>();
  private final Map<String, Connection> connections = new ConcurrentHashMap<>();

  @Autowired
  public WebSocketSessionController(UserRepository userRepository) {
    this.userRepository = userRepository;
  }

  /**
   * Records a new WebSocket connection of a user. The user was logged in by the handshake (login cookie), so there is
   * nothing to check here.
   *
   * @param musicSessionId the music session the connection starts in, 0 for none
   */
  public void registerConnection(final long userId, final String wsSessionId, final long musicSessionId) {
    Connection connection = new Connection(userId);
    if (musicSessionId != 0) {
      connection.musicSessions.add(musicSessionId);
    }
    this.connections.put(wsSessionId, connection);
    for (final ConnectObserver listener : this.cListeners) {
      listener.observeConnect(userId, musicSessionId);
    }
  }

  /**
   * Records that the user of the given WebSocket connection joined a music session through this connection.
   */
  public void joinMusicSession(final String wsSessionId, final long musicSessionId) {
    Connection connection = this.connections.get(wsSessionId);
    if (connection != null) {
      connection.musicSessions.add(musicSessionId);
    }
  }

  /**
   * Records that the given WebSocket connection left a music session.
   *
   * @return true if the user has no other connection in that music session and should be removed from it.
   */
  public boolean leaveMusicSession(final String wsSessionId, final long userId, final long musicSessionId) {
    Connection connection = this.connections.get(wsSessionId);
    if (connection != null) {
      connection.musicSessions.remove(musicSessionId);
    }
    return !isUserConnectedToMusicSession(userId, musicSessionId);
  }

  /**
   * Records that the music session does not exist any more, so no connection counts as part of it.
   */
  public void forgetMusicSession(final long musicSessionId) {
    this.connections.values().forEach(connection -> connection.musicSessions.remove(musicSessionId));
  }

  /**
   * Handles a closed WebSocket connection. The user is only reported as disconnected from the music sessions no other
   * connection of the same user (e.g. another browser tab) is still part of.
   */
  public void disconnectSession(final String wsSessionId) {
    Connection connection = this.connections.remove(wsSessionId);
    if (connection == null) {
      return;
    }
    for (final long musicSessionId : connection.musicSessions) {
      if (!isUserConnectedToMusicSession(connection.userId, musicSessionId)) {
        for (final DisconnectObserver listener : this.dcListeners) {
          listener.observeDisconnect(connection.userId, musicSessionId);
        }
      }
    }
  }

  private boolean isUserConnectedToMusicSession(final long userId, final long musicSessionId) {
    return this.connections.values().stream()
        .anyMatch(c -> c.userId == userId && c.musicSessions.contains(musicSessionId));
  }

  public void addDisconnectListener(DisconnectObserver newListener) {
    dcListeners.add(newListener);
  }

  public void addConnectListener(ConnectObserver newListener) {
    cListeners.add(newListener);
  }

  public interface DisconnectObserver {
    void observeDisconnect(long userId, long sessionId);
  }

  public interface ConnectObserver {
    void observeConnect(long userId, long sessionId);
  }

  private static final class Connection {
    private final long userId;
    private final Set<Long> musicSessions = ConcurrentHashMap.newKeySet();

    private Connection(long userId) {
      this.userId = userId;
    }
  }
}
