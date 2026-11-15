package de.crow08.portalsync.config;

import de.crow08.portalsync.model.users.User;
import de.crow08.portalsync.sessions.Session;
import de.crow08.portalsync.sessions.SessionRepository;
import de.crow08.portalsync.wscommunication.commands.ErrorCommand;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.SimpMessageSendingOperations;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.TestingAuthenticationToken;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** Only members of a session may send commands to it; joining is how one becomes a member. */
class SessionMembershipInterceptorTest {

  private final SessionRepository sessions = new SessionRepository();
  private final SimpMessageSendingOperations messaging = mock(SimpMessageSendingOperations.class);
  private SessionMembershipInterceptor interceptor;
  private long sessionId;

  @BeforeEach
  @SuppressWarnings("unchecked")
  void setUp() {
    ObjectProvider<SimpMessageSendingOperations> provider = mock(ObjectProvider.class);
    when(provider.getObject()).thenReturn(messaging);
    interceptor = new SessionMembershipInterceptor(sessions, provider);

    Session session = new Session("lobby");
    session.getUsers().add(new User(1, "anna", false));
    sessions.save(session);
    sessionId = session.getId();
  }

  private static Message<byte[]> message(StompCommand command, String destination, String username) {
    StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
    accessor.setDestination(destination);
    if (username != null) {
      accessor.setUser(new TestingAuthenticationToken(username, null, "ROLE_USER"));
    }
    accessor.setLeaveMutable(true);
    return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
  }

  private Message<byte[]> command(String name, String username) {
    return message(StompCommand.SEND, "/app/sessions/" + sessionId + "/commands/" + name, username);
  }

  private ErrorCommand errorSentTo(String username, String destination) {
    ArgumentCaptor<Object> error = ArgumentCaptor.forClass(Object.class);
    verify(messaging).convertAndSendToUser(eq(username), eq("/queue/errors"), error.capture());
    assertThat(error.getValue()).isInstanceOf(ErrorCommand.class);
    ErrorCommand command = (ErrorCommand) error.getValue();
    assertThat(command.getDestination()).isEqualTo(destination);
    return command;
  }

  @Test
  void aMemberSendsCommands() {
    Message<byte[]> skip = command("skip", "anna");

    assertThat(interceptor.preSend(skip, null)).isSameAs(skip);
    assertThat(interceptor.preSend(command("movedMedia/1/to/2/5", "anna"), null)).isNotNull();
    verifyNoInteractions(messaging);
  }

  @Test
  void theCommandOfANonMemberIsDroppedAndAnsweredWithAnError() {
    Message<byte[]> skip = command("skip", "ben");

    assertThat(interceptor.preSend(skip, null)).isNull();

    ErrorCommand error = errorSentTo("ben", "/app/sessions/" + sessionId + "/commands/skip");
    assertThat(error.getMessage()).isEqualTo("You are not a member of this session");
  }

  @Test
  void joiningIsAllowedForEveryone() {
    Message<byte[]> join = command("join/2", "ben");

    assertThat(interceptor.preSend(join, null)).isSameAs(join);
    verifyNoInteractions(messaging);
  }

  @Test
  void aCommandForASessionThatDoesNotExistIsDropped() {
    Message<byte[]> skip = message(StompCommand.SEND, "/app/sessions/999/commands/skip", "anna");

    assertThat(interceptor.preSend(skip, null)).isNull();

    assertThat(errorSentTo("anna", "/app/sessions/999/commands/skip").getMessage()).isEqualTo("Session not found");
  }

  @Test
  void aCommandWithoutAUserIsDroppedSilently() {
    assertThat(interceptor.preSend(command("skip", null), null)).isNull();
    verifyNoInteractions(messaging);
  }

  @Test
  void whatIsNoSessionCommandPassesThrough() {
    Message<byte[]> ping = message(StompCommand.SEND, "/app/util/latency/1", "ben");
    Message<byte[]> subscribe = message(StompCommand.SUBSCRIBE, "/topic/sessions/" + sessionId, "ben");
    Message<byte[]> connect = message(StompCommand.CONNECT, null, "ben");

    assertThat(interceptor.preSend(ping, null)).isSameAs(ping);
    assertThat(interceptor.preSend(subscribe, null)).isSameAs(subscribe);
    assertThat(interceptor.preSend(connect, null)).isSameAs(connect);
    verifyNoInteractions(messaging);
  }
}
