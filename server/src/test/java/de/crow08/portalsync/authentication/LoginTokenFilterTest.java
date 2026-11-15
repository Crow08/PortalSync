package de.crow08.portalsync.authentication;

import de.crow08.portalsync.authentication.LoginTokenService.Login;
import de.crow08.portalsync.model.users.AuthenticatedUser;
import de.crow08.portalsync.model.users.User;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LoginTokenFilterTest {

  private final LoginTokenService tokens = mock(LoginTokenService.class);
  private final LoginTokenFilter filter = new LoginTokenFilter(tokens, new LoginCookie("portalsync_login"));

  private final AtomicReference<Authentication> seenByTheRequest = new AtomicReference<>();
  private final AtomicBoolean requestWentOn = new AtomicBoolean();
  private final FilterChain chain = (request, response) -> {
    requestWentOn.set(true);
    seenByTheRequest.set(SecurityContextHolder.getContext().getAuthentication());
  };

  @BeforeEach
  @AfterEach
  void clearTheSecurityContext() {
    SecurityContextHolder.clearContext();
  }

  private static MockHttpServletRequest requestWithToken(String token) {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setCookies(new Cookie("portalsync_login", token));
    return request;
  }

  @Test
  void aValidCookieLogsTheRequestInAsItsUser() throws Exception {
    when(tokens.find("the-token")).thenReturn(Optional.of(new Login(new User(3, "anna", true), false)));
    MockHttpServletResponse response = new MockHttpServletResponse();

    filter.doFilter(requestWithToken("the-token"), response, chain);

    Authentication authentication = seenByTheRequest.get();
    assertThat(authentication).isNotNull();
    assertThat(authentication.isAuthenticated()).isTrue();
    assertThat(authentication.getName()).isEqualTo("anna");
    // the controllers read the user from the principal
    assertThat(authentication.getPrincipal()).isInstanceOf(AuthenticatedUser.class);
    AuthenticatedUser principal = (AuthenticatedUser) authentication.getPrincipal();
    assertThat(principal.getId()).isEqualTo(3);
    assertThat(principal.isAdmin()).isTrue();
    assertThat(authentication.getAuthorities()).extracting(GrantedAuthority::getAuthority).contains("ROLE_USER", "ROLE_ADMIN");
    assertThat(authentication.getCredentials()).isNull();
    assertThat(response.getHeader(HttpHeaders.SET_COOKIE)).isNull();
  }

  @Test
  void anExtendedLoginSendsTheCookieAgain() throws Exception {
    when(tokens.find("the-token")).thenReturn(Optional.of(new Login(new User(3, "anna", false), true)));
    MockHttpServletResponse response = new MockHttpServletResponse();

    filter.doFilter(requestWithToken("the-token"), response, chain);

    assertThat(response.getHeader(HttpHeaders.SET_COOKIE)).startsWith("portalsync_login=the-token;").contains("Max-Age=");
  }

  @Test
  void aRequestWithoutACookieStaysAnonymousAndGoesOn() throws Exception {
    filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), chain);

    assertThat(requestWentOn).isTrue();
    assertThat(seenByTheRequest.get()).isNull();
    verify(tokens, never()).find(anyString());
  }

  @Test
  void anUnknownTokenStaysAnonymousAndGoesOn() throws Exception {
    when(tokens.find("made-up")).thenReturn(Optional.empty());

    filter.doFilter(requestWithToken("made-up"), new MockHttpServletResponse(), chain);

    assertThat(requestWentOn).isTrue();
    assertThat(seenByTheRequest.get()).isNull();
  }

  @Test
  void aRequestThatIsLoggedInAlreadyKeepsItsLogin() throws Exception {
    Authentication existing = new TestingAuthenticationToken("someone", null, "ROLE_USER");
    SecurityContextHolder.getContext().setAuthentication(existing);

    filter.doFilter(requestWithToken("the-token"), new MockHttpServletResponse(), chain);

    assertThat(seenByTheRequest.get()).isSameAs(existing);
    verify(tokens, never()).find(anyString());
  }
}
