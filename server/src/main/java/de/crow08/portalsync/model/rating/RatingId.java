package de.crow08.portalsync.model.rating;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;

/**
 * The key holds the plain ids, not the entities: with detached entities in the key, Hibernate 7 fails in
 * <code>merge</code> (NullPointerException in the persistence context), so no rating could be saved.
 */
@Embeddable
public class RatingId implements Serializable {
  @Column(name = "user_id")
  private long userId;

  @Column(name = "song_id")
  private long songId;

  public RatingId() {
  }

  public RatingId(long userId, long songId) {
    this.userId = userId;
    this.songId = songId;
  }

  public long getUserId() {
    return userId;
  }

  public void setUserId(long userId) {
    this.userId = userId;
  }

  public long getSongId() {
    return songId;
  }

  public void setSongId(long songId) {
    this.songId = songId;
  }

  @Override
  public boolean equals(Object obj) {
    if (obj instanceof RatingId ratingId) {
      return ratingId.userId == userId && ratingId.songId == songId;
    }
    return false;
  }

  @Override
  public int hashCode() {
    return Objects.hash(userId, songId);
  }
}
