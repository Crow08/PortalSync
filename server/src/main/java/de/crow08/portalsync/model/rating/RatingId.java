package de.crow08.portalsync.model.rating;

import de.crow08.portalsync.model.media.Media;
import de.crow08.portalsync.model.users.User;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Embeddable;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import java.io.Serializable;

@Embeddable
public class RatingId implements Serializable {
  @ManyToOne(cascade = CascadeType.ALL)
  @JoinColumn(name = "user_id", insertable = false, updatable = false)
  private User user;

  @ManyToOne(cascade = CascadeType.ALL)
  @JoinColumn(name = "song_id", insertable = false, updatable = false)
  private Media media;

  public RatingId() {
  }

  public RatingId(User user, Media media) {
    this.user = user;
    this.media = media;
  }

  public User getUser() {
    return user;
  }

  public void setUser(User user) {
    this.user = user;
  }

  public Media getSong() {
    return media;
  }

  public void setSong(Media media) {
    this.media = media;
  }

  @Override
  public boolean equals(Object obj) {
    if (obj instanceof RatingId ratingId) {
      return ratingId.user.getId() == this.user.getId() && ratingId.media.getId() == media.getId();
    }
    return false;
  }
}
