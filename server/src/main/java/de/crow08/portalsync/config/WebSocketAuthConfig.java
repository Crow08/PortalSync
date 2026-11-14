package de.crow08.portalsync.config;

import de.crow08.portalsync.model.users.AuthenticatedUser;
import de.crow08.portalsync.sessions.SessionRepository;
import de.crow08.portalsync.wscommunication.WebSocketSessionController;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.SimpMessageSendingOperations;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@Order(Ordered.HIGHEST_PRECEDENCE + 99)
public class WebSocketAuthConfig implements WebSocketMessageBrokerConfigurer {

  private final WebSocketSessionController webSocketSessionController;
  private final SessionRepository sessionRepository;
  private final ObjectProvider<SimpMessageSendingOperations> messagingTemplate;

  @Autowired
  public WebSocketAuthConfig(final WebSocketSessionController webSocketSessionController,
                             final SessionRepository sessionRepository,
                             final ObjectProvider<SimpMessageSendingOperations> messagingTemplate) {
    this.webSocketSessionController = webSocketSessionController;
    this.sessionRepository = sessionRepository;
    this.messagingTemplate = messagingTemplate;
  }

  @Override
  public void configureClientInboundChannel(final ChannelRegistration registration) {
    // clock sync first: it records the receive time of commands
    registration.interceptors(new ClockSyncInterceptors.Inbound(),
        new WebSocketAuthInterceptor(this.webSocketSessionController),
        new SessionMembershipInterceptor(this.sessionRepository, this.messagingTemplate));
  }

  /**
   * Registers a new connection with its user. The user comes from the WebSocket handshake, an HTTP request that is
   * logged in like every other one (login cookie, see SecurityConfig): the STOMP frames carry no credentials.
   */
  static class WebSocketAuthInterceptor implements ChannelInterceptor {
    private static final String SESSION_HEADER = "session";
    private final WebSocketSessionController webSocketSessionController;

    public WebSocketAuthInterceptor(final WebSocketSessionController webSocketSessionController) {
      this.webSocketSessionController = webSocketSessionController;
    }

    @Override
    public Message<?> preSend(final Message<?> message, final MessageChannel channel) throws AuthenticationException {
      final StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
      if (accessor != null && StompCommand.CONNECT == accessor.getCommand()) {
        if (!(accessor.getUser() instanceof Authentication authentication) || !authentication.isAuthenticated()
            || !(authentication.getPrincipal() instanceof AuthenticatedUser user)) {
          throw new AuthenticationCredentialsNotFoundException("The WebSocket connection is not logged in");
        }
        String wsSessionId = (String) accessor.getHeader("simpSessionId");
        webSocketSessionController.registerConnection(user.getId(), wsSessionId,
            parseSession(accessor.getFirstNativeHeader(SESSION_HEADER)));
      }
      return message;
    }

    /** The music session of the CONNECT header, 0 (none) if it is missing or no number. */
    private static long parseSession(String musicSessionId) {
      try {
        return musicSessionId != null ? Long.parseLong(musicSessionId) : 0;
      } catch (NumberFormatException e) {
        return 0;
      }
    }
  }
}
