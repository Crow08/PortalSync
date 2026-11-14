package de.crow08.portalsync.authentication;

import de.crow08.portalsync.model.users.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToOne;

import java.time.Instant;

/**
 * A login of a user in one browser. The browser holds a random token in a cookie that scripts can not read; the
 * database only holds the hash of it, so a copy of the table does not log anyone in.
 */
@Entity
public class LoginToken {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private long id;

  /** SHA-256 of the token as hex. */
  @Column(nullable = false, unique = true, length = 64)
  private String tokenHash;

  @ManyToOne(optional = false)
  private User user;

  @Column(nullable = false)
  private Instant expiresAt;

  @Deprecated
  public LoginToken() {
  }

  public LoginToken(String tokenHash, User user, Instant expiresAt) {
    this.tokenHash = tokenHash;
    this.user = user;
    this.expiresAt = expiresAt;
  }

  public long getId() {
    return id;
  }

  public String getTokenHash() {
    return tokenHash;
  }

  public User getUser() {
    return user;
  }

  public Instant getExpiresAt() {
    return expiresAt;
  }

  public void setExpiresAt(Instant expiresAt) {
    this.expiresAt = expiresAt;
  }
}
