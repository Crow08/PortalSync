package de.crow08.portalsync.config;

import de.crow08.portalsync.wscommunication.WebSocketSessionController;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Bean;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.security.config.annotation.web.socket.EnableWebSocketSecurity;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.messaging.access.intercept.MessageMatcherDelegatingAuthorizationManager;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;
import org.springframework.web.socket.handler.WebSocketHandlerDecoratorFactory;

@Configuration
@EnableWebSocketMessageBroker
@EnableWebSocketSecurity
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
  private final WebSocketSessionController webSocketSessionController;
  private final ClientProperties clientProperties;

  @Autowired
  public WebSocketConfig(final WebSocketSessionController webSocketSessionController, final ClientProperties clientProperties) {
    this.webSocketSessionController = webSocketSessionController;
    this.clientProperties = clientProperties;
  }

  @Override
  public void configureMessageBroker(MessageBrokerRegistry config) {
    // "/queue" is used for messages to a single user, e.g. "/user/queue/errors"
    config.enableSimpleBroker("/topic", "/queue");
    config.setApplicationDestinationPrefixes("/app");
    config.configureBrokerChannel().interceptors(new ClockSyncInterceptors.Outbound());
  }

  @Bean
  AuthorizationManager<Message<?>> messageAuthorizationManager(final MessageMatcherDelegatingAuthorizationManager.Builder messages) {
    messages.anyMessage().authenticated();
    return messages.build();
  }

  /** The client is served from another origin and sends no CSRF token, so the CSRF check of the STOMP channel is off. */
  @Bean
  ChannelInterceptor csrfChannelInterceptor() {
    return new ChannelInterceptor() {
    };
  }

  @Override
  public void registerStompEndpoints(StompEndpointRegistry registry) {
    registry.addEndpoint("/ws")
        .setAllowedOrigins(clientProperties.getAllowedOrigin());
  }

  @Override
  public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
    registration.addDecoratorFactory(new WebSocketHandlerDecoratorFactory() {
      @Override
      public WebSocketHandler decorate(WebSocketHandler handler) {
        return new WebSocketHandlerDecorator(handler) {
          @Override
          public void afterConnectionEstablished(WebSocketSession session) throws Exception {
            super.afterConnectionEstablished(session);
          }

          @Override
          public void afterConnectionClosed(WebSocketSession session, CloseStatus closeStatus) throws Exception {
            super.afterConnectionClosed(session, closeStatus);
            webSocketSessionController.disconnectSession(session.getId());
          }
        };
      }
    });
  }
}
