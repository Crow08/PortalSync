package de.crow08.portalsync.authentication;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class LoginCookieTest {

  private final LoginCookie cookie = new LoginCookie("portalsync_login");

  private static String setCookie(MockHttpServletResponse response) {
    return response.getHeader(HttpHeaders.SET_COOKIE);
  }

  @Test
  void theCookieIsHiddenFromScriptsAndFromOtherSites() {
    MockHttpServletResponse response = new MockHttpServletResponse();

    cookie.set(new MockHttpServletRequest(), response, "the-token");

    assertThat(setCookie(response))
        .startsWith("portalsync_login=the-token;")
        .contains("HttpOnly")
        .contains("SameSite=Strict")
        .contains("Path=/")
        .contains("Max-Age=" + LoginTokenService.LIFETIME.toSeconds());
  }

  @Test
  void theCookieIsSecureWhenTheRequestCameOverHttps() {
    MockHttpServletRequest https = new MockHttpServletRequest();
    https.setSecure(true);
    MockHttpServletResponse secure = new MockHttpServletResponse();
    cookie.set(https, secure, "the-token");
    assertThat(setCookie(secure)).contains("Secure");

    // a development server without TLS: a Secure cookie would never come back
    MockHttpServletResponse plain = new MockHttpServletResponse();
    cookie.set(new MockHttpServletRequest(), plain, "the-token");
    assertThat(setCookie(plain)).doesNotContain("Secure");
  }

  @Test
  void clearingMakesTheBrowserForgetTheToken() {
    MockHttpServletResponse response = new MockHttpServletResponse();

    cookie.clear(new MockHttpServletRequest(), response);

    assertThat(setCookie(response)).startsWith("portalsync_login=;").contains("Max-Age=0").contains("Path=/").contains("HttpOnly");
  }

  @Test
  void readsTheTokenOfItsOwnCookieOnly() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    assertThat(cookie.read(request)).isNull();

    request.setCookies(new Cookie("other", "x"), new Cookie("portalsync_login_dev", "dev-token"));
    assertThat(cookie.read(request)).isNull();

    request.setCookies(new Cookie("other", "x"), new Cookie("portalsync_login", "the-token"));
    assertThat(cookie.read(request)).isEqualTo("the-token");
  }

  @Test
  void theNameComesFromTheConfiguration() {
    MockHttpServletResponse response = new MockHttpServletResponse();

    new LoginCookie("portalsync_login_dev").set(new MockHttpServletRequest(), response, "t");

    assertThat(setCookie(response)).startsWith("portalsync_login_dev=t;");
  }
}
