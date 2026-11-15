package de.crow08.portalsync.wscommunication;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Which music sessions the WebSocket connections are in; a user can have several connections (browser tabs). */
class WebSocketSessionControllerTest {

  private static final long ANNA = 1;
  private static final long BEN = 2;

  private WebSocketSessionController controller;
  private final List<String> events = new ArrayList<>();

  @BeforeEach
  void setUp() {
    // the user repository is not used by the connection tracking
    controller = new WebSocketSessionController(null);
    controller.addConnectListener((userId, sessionId) -> events.add("connect " + userId + " to " + sessionId));
    controller.addDisconnectListener((userId, sessionId) -> events.add("disconnect " + userId + " from " + sessionId));
  }

  @Test
  void aNewConnectionIsAnnouncedWithItsSession() {
    controller.registerConnection(ANNA, "ws-1", 7);
    controller.registerConnection(BEN, "ws-2", 0);

    assertThat(events).containsExactly("connect 1 to 7", "connect 2 to 0");
  }

  @Test
  void closingTheOnlyConnectionTakesTheUserOutOfItsSessions() {
    controller.registerConnection(ANNA, "ws-1", 7);
    controller.joinMusicSession("ws-1", 8);
    events.clear();

    controller.disconnectSession("ws-1");

    assertThat(events).containsExactlyInAnyOrder("disconnect 1 from 7", "disconnect 1 from 8");
  }

  @Test
  void theUserStaysInASessionAsLongAsAnotherTabIsInIt() {
    controller.registerConnection(ANNA, "tab-1", 7);
    controller.registerConnection(ANNA, "tab-2", 7);
    events.clear();

    controller.disconnectSession("tab-1");
    assertThat(events).isEmpty();

    controller.disconnectSession("tab-2");
    assertThat(events).containsExactly("disconnect 1 from 7");
  }

  @Test
  void theConnectionOfAnotherUserDoesNotKeepTheUserInTheSession() {
    controller.registerConnection(ANNA, "ws-1", 7);
    controller.registerConnection(BEN, "ws-2", 7);
    events.clear();

    controller.disconnectSession("ws-1");

    assertThat(events).containsExactly("disconnect 1 from 7");
  }

  @Test
  void aConnectionWithoutASessionLeavesNothing() {
    controller.registerConnection(ANNA, "ws-1", 0);
    events.clear();

    controller.disconnectSession("ws-1");
    controller.disconnectSession("ws-1");
    controller.disconnectSession("never-connected");

    assertThat(events).isEmpty();
  }

  @Test
  void leavingTellsWhetherTheUserIsGoneFromTheSession() {
    controller.registerConnection(ANNA, "tab-1", 0);
    controller.registerConnection(ANNA, "tab-2", 0);
    controller.joinMusicSession("tab-1", 7);
    controller.joinMusicSession("tab-2", 7);

    assertThat(controller.leaveMusicSession("tab-1", ANNA, 7)).isFalse();
    assertThat(controller.leaveMusicSession("tab-2", ANNA, 7)).isTrue();

    // a session that was left is not left again when the connection closes
    events.clear();
    controller.disconnectSession("tab-1");
    controller.disconnectSession("tab-2");
    assertThat(events).isEmpty();
  }

  @Test
  void aDeletedSessionIsForgottenByAllConnections() {
    controller.registerConnection(ANNA, "ws-1", 7);
    controller.registerConnection(BEN, "ws-2", 7);
    controller.joinMusicSession("ws-2", 8);
    events.clear();

    controller.forgetMusicSession(7);
    controller.disconnectSession("ws-1");
    controller.disconnectSession("ws-2");

    assertThat(events).containsExactly("disconnect 2 from 8");
  }

  @Test
  void joiningThroughAnUnknownConnectionIsIgnored() {
    controller.joinMusicSession("unknown", 7);

    assertThat(controller.leaveMusicSession("unknown", ANNA, 7)).isTrue();
    assertThat(events).isEmpty();
  }
}
