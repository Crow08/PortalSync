package de.crow08.portalsync.model.users;

import com.neverpile.urlcrypto.PreSignedUrlEnabled;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.Serial;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.StreamSupport;

@RestController
@RequestMapping("/api/v1/users")
public class UserResource {

  private static final PasswordEncoder PASSWORD_ENCODER = PasswordEncoderFactories.createDelegatingPasswordEncoder();

  private final UserRepository userRepository;

  public UserResource(UserRepository userRepository) {
    this.userRepository = userRepository;
  }

  @GetMapping("/login")
  public User getUser() {
    return this.getDTO((AuthenticatedUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal());
  }

  /** The id and the name of all users, e.g. to choose the owners of a playlist. */
  @GetMapping("/all")
  public List<UserSummary> getUsers() {
    return StreamSupport.stream(userRepository.findAll().spliterator(), false)
        .map(user -> new UserSummary(user.getId(), user.getUsername()))
        .toList();
  }

  public record UserSummary(long id, String username) {
  }

  @PutMapping("/register")
  @PreSignedUrlEnabled
  public User register(@RequestBody User newUser) {
    if (newUser.getUsername() == null
        || newUser.getUsername().equals("")
        || newUser.getPassword() == null
        || newUser.getPassword().equals("")) {
      throw new InvalidUserDetailsException("The provided user information is not valid.");
    }
    User existingUser = userRepository.findByUsername(newUser.getUsername());
    if (existingUser != null) {
      throw new UserAlreadyExistException("There is already an account with that username " + newUser.getUsername());
    }

    User user = new User(newUser.getUsername(),
        PasswordEncoderFactories.createDelegatingPasswordEncoder().encode(newUser.getPassword()));
    return userRepository.save(user);
  }

  public record ChangePasswordRequest(String currentPassword, String newPassword) {
  }

  /** Lets the logged in user change the own password; the current password has to be confirmed. */
  @PutMapping("/password")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void changePassword(@RequestBody ChangePasswordRequest request) {
    if (request.currentPassword() == null || request.newPassword() == null || request.newPassword().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The provided password is not valid.");
    }
    // bcrypt only accepts up to 72 bytes
    if (request.newPassword().getBytes(StandardCharsets.UTF_8).length > 72) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The new password is too long (at most 72 bytes).");
    }
    long userId = ((AuthenticatedUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal()).getId();
    User user = userRepository.findById(userId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
    if (!PASSWORD_ENCODER.matches(request.currentPassword(), user.getPassword())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "The current password is wrong.");
    }
    user.setPassword(PASSWORD_ENCODER.encode(request.newPassword()));
    userRepository.save(user);
  }

  private User getDTO(User user) {
    return new User(user.getId(), user.getUsername(), user.isAdmin());
  }

  public static final class UserAlreadyExistException extends RuntimeException {
    @Serial
    private static final long serialVersionUID = 1L;

    public UserAlreadyExistException(final String message) {
      super(message);
    }
  }

  public static final class InvalidUserDetailsException extends RuntimeException {
    @Serial
    private static final long serialVersionUID = 1L;

    public InvalidUserDetailsException(final String message) {
      super(message);
    }
  }
}
