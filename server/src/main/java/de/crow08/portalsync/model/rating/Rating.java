package de.crow08.portalsync.model.rating;

import de.crow08.portalsync.model.media.Media;
import de.crow08.portalsync.model.users.User;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;


@Entity
public class Rating {

  @EmbeddedId
  private RatingId id;

  // read only views of the key columns: they keep the foreign keys in the schema
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id", insertable = false, updatable = false)
  private User user;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "song_id", insertable = false, updatable = false)
  private Media media;

  private short ratingValue;

  @Deprecated
  public Rating() {
  }

  public Rating(User user, Media media, short ratingValue) {
    this.id = new RatingId(user.getId(), media.getId());
    this.ratingValue = ratingValue;
  }

  public RatingId getId() {
    return id;
  }

  public void setId(RatingId id) {
    this.id = id;
  }

  public short getRatingValue() {
    return ratingValue;
  }

  public void setRatingValue(short ratingValue) {
    this.ratingValue = ratingValue;
  }
}
