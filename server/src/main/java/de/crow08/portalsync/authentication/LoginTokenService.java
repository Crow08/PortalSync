package de.crow08.portalsync.authentication;

import de.crow08.portalsync.model.users.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;

/**
 * The logins of the users (see {@link LoginToken}). A login ends {@link #LIFETIME} after its last use, with the
 * logout, or when the user changes the password in another browser.
 */
@Service
public class LoginTokenService {

  /** A login that is not used for this long ends. */
  public static final Duration LIFETIME = Duration.ofDays(30);

  /** A used login is extended at most this often, so not every request writes to the database. */
  private static final Duration RENEW_INTERVAL = Duration.ofDays(1);

  /** Longer values can not be a token; they are not even hashed. */
  private static final int MAX_TOKEN_LENGTH = 100;

  private final LoginTokenRepository repository;
  private final SecureRandom random = new SecureRandom();

  public LoginTokenService(LoginTokenRepository repository) {
    this.repository = repository;
  }

  /** A login found by its token. */
  public record Login(User user, boolean renewed) {
  }

  /**
   * Starts a login of the user.
   *
   * @return the token for the cookie of the browser; it is not stored and can not be read again
   */
  @Transactional
  public String create(User user) {
    Instant now = Instant.now();
    repository.deleteByExpiresAtBefore(now);
    byte[] bytes = new byte[32];
    random.nextBytes(bytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    repository.save(new LoginToken(hash(token), user, now.plus(LIFETIME)));
    return token;
  }

  /**
   * Looks up the login of a token and extends it when it is used.
   *
   * @return the user of the login and whether it was extended (the cookie has to live longer as well), empty if the
   * token is unknown or the login has ended
   */
  @Transactional
  public Optional<Login> find(String token) {
    if (!isPossibleToken(token)) {
      return Optional.empty();
    }
    Instant now = Instant.now();
    Optional<LoginToken> found = repository.findByTokenHash(hash(token));
    if (found.isEmpty()) {
      return Optional.empty();
    }
    LoginToken login = found.get();
    if (!login.getExpiresAt().isAfter(now)) {
      repository.delete(login);
      return Optional.empty();
    }
    boolean renew = needsRenewal(login.getExpiresAt(), now);
    if (renew) {
      login.setExpiresAt(now.plus(LIFETIME));
      repository.save(login);
    }
    return Optional.of(new Login(login.getUser(), renew));
  }

  /** Ends the login of the token (logout). */
  @Transactional
  public void revoke(String token) {
    if (isPossibleToken(token)) {
      repository.deleteByTokenHash(hash(token));
    }
  }

  /**
   * Ends all logins of the user except the one of the given token, e.g. after a change of the password: whoever
   * knows the old password is logged out everywhere else.
   *
   * @param keepToken the token of the login to keep, null to end all logins
   */
  @Transactional
  public void revokeOthers(long userId, String keepToken) {
    if (isPossibleToken(keepToken)) {
      repository.deleteByUserIdAndTokenHashNot(userId, hash(keepToken));
    } else {
      repository.deleteByUserId(userId);
    }
  }

  /** A login is extended once less than the lifetime minus the renew interval is left of it. */
  static boolean needsRenewal(Instant expiresAt, Instant now) {
    return Duration.between(now, expiresAt).compareTo(LIFETIME.minus(RENEW_INTERVAL)) < 0;
  }

  static boolean isPossibleToken(String token) {
    return token != null && !token.isBlank() && token.length() <= MAX_TOKEN_LENGTH;
  }

  static String hash(String token) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
