package de.crow08.portalsync.model.album;

import de.crow08.portalsync.model.media.Media;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import java.util.List;

@Entity
public class Album {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private long id;

  @Column(nullable = false, unique = true)
  private String name;

  @OneToMany()
  private List<Media> songs;

  // when it was released, as exact as it is known: "1998", "1998-10" or "1998-10-12" (see ReleaseDates); null if unknown
  @Column(name = "release_date", length = 10)
  private String releaseDate;

  @Deprecated
  public Album() {
  }

  public Album(String name) {
    this.name = name;
  }

  public long getId() {
    return id;
  }

  public void setId(long id) {
    this.id = id;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getReleaseDate() {
    return releaseDate;
  }

  public void setReleaseDate(String releaseDate) {
    this.releaseDate = releaseDate;
  }
}
