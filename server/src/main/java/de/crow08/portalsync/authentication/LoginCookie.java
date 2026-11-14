package de.crow08.portalsync.authentication;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * The cookie that holds the login token of a browser (see {@link LoginTokenService}).
 * <ul>
 * <li>HttpOnly: scripts of the page can not read it, so a script injected into the client can not steal the login.</li>
 * <li>SameSite=Strict: the browser does not send it with requests that other sites make, so another site can not act
 * as the logged in user (CSRF). Requests with a foreign Origin header are rejected by the CORS configuration as
 * well.</li>
 * <li>Secure whenever the request came over HTTPS.</li>
 * </ul>
 * Cookies belong to a host, not to a port: two servers on the same host (e.g. the dev server and a Docker stack on
 * 127.0.0.1) need different names ({@code client.login-cookie}), otherwise a login at one ends the login at the other.
 */
@Component
public class LoginCookie {

  private final String name;

  public LoginCookie(@Value("${client.login-cookie:portalsync_login}") String name) {
    this.name = name;
  }

  /** The token of the request, null if the browser sent none. */
  public String read(HttpServletRequest request) {
    if (request.getCookies() != null) {
      for (Cookie cookie : request.getCookies()) {
        if (name.equals(cookie.getName())) {
          return cookie.getValue();
        }
      }
    }
    return null;
  }

  /** Gives the browser the token; also extends the life of the cookie of a login that is used. */
  public void set(HttpServletRequest request, HttpServletResponse response, String token) {
    write(request, response, token, LoginTokenService.LIFETIME);
  }

  /** Makes the browser forget the token. */
  public void clear(HttpServletRequest request, HttpServletResponse response) {
    write(request, response, "", Duration.ZERO);
  }

  private void write(HttpServletRequest request, HttpServletResponse response, String value, Duration maxAge) {
    ResponseCookie cookie = ResponseCookie.from(name, value)
        .httpOnly(true)
        .secure(request.isSecure())
        .sameSite("Strict")
        .path("/")
        .maxAge(maxAge)
        .build();
    response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
  }
}
