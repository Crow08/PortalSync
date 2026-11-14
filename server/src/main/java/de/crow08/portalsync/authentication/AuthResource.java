package de.crow08.portalsync.authentication;

import de.crow08.portalsync.model.users.User;
import de.crow08.portalsync.model.users.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Login and logout of the client. The password is only sent once, with the login: the browser then holds a login
 * token in a cookie (see {@link LoginCookie}) that logs in every further request and the WebSocket.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthResource {

  private static final PasswordEncoder PASSWORD_ENCODER = PasswordEncoderFactories.createDelegatingPasswordEncoder();

  /** Checked instead of the password of a user that does not exist, so both answers take the same time. */
  private static final String NO_USER_HASH = PASSWORD_ENCODER.encode("no such user");

  private final UserRepository userRepository;
  private final LoginTokenService tokens;
  private final LoginCookie cookie;

  public AuthResource(UserRepository userRepository, LoginTokenService tokens, LoginCookie cookie) {
    this.userRepository = userRepository;
    this.tokens = tokens;
    this.cookie = cookie;
  }

  public record LoginRequest(String username, String password) {
  }

  /** Checks the password and logs the browser in. Answers with the user (id, name, admin), 401 if the login is wrong. */
  @PostMapping("/login")
  public User login(@RequestBody LoginRequest login, HttpServletRequest request, HttpServletResponse response) {
    User user = login.username() != null ? userRepository.findByUsername(login.username()) : null;
    String password = login.password() != null ? login.password() : "";
    boolean matches = PASSWORD_ENCODER.matches(password, user != null ? user.getPassword() : NO_USER_HASH);
    if (user == null || !matches) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Wrong user name or password");
    }
    cookie.set(request, response, tokens.create(user));
    return new User(user.getId(), user.getUsername(), user.isAdmin());
  }

  /** Ends the login of the browser. Works without a (valid) login as well: the cookie is removed in any case. */
  @PostMapping("/logout")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void logout(HttpServletRequest request, HttpServletResponse response) {
    tokens.revoke(cookie.read(request));
    cookie.clear(request, response);
  }
}
