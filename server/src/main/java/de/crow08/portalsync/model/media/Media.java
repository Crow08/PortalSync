package de.crow08.portalsync.model.media;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import de.crow08.portalsync.model.tag.Tag;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Inheritance;
import jakarta.persistence.InheritanceType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import java.util.Set;

@Entity
@Inheritance(strategy = InheritanceType.JOINED)
public class Media {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private long id;

  @Column(nullable = false)
  private String title;

  @Column(nullable = false)
  @Enumerated(EnumType.STRING)
  private MediaType type;

  @Column(nullable = false)
  private String uri;

  // the user who uploaded or imported the media, null if unknown (e.g. media added by SQL). Read only: it is set by the
  // server and never taken from a request
  @JsonProperty(access = JsonProperty.Access.READ_ONLY)
  @Column(name = "owner_id")
  private Long ownerId;

  // the picture shown for the media, null for none: a file in the storage (e.g. "/songs/artist/album/cover.jpg",
  // several media can share one: the songs of an album) or, for a Spotify song, the URL of the picture at Spotify (see
  // CoverUrls). Of a file clients only learn that there is one (hasCover) and load it from /api/v1/media/cover/{id},
  // a URL they get as coverUrl. Files are set by SQL only (the import of a music collection), URLs by the import of
  // Spotify songs
  @JsonIgnore
  @Column(name = "cover")
  private String cover;

  @ManyToMany(fetch = FetchType.EAGER)
  @JoinTable(name = "media_tag",
      joinColumns = @JoinColumn(name = "media_id", referencedColumnName = "id"),
      inverseJoinColumns = @JoinColumn(name = "tag_id", referencedColumnName = "id"))
  private Set<Tag> tags;

  @Deprecated
  public Media() {
  }

  public Media(long id) {
    this.id = id;
  }

  public Media(String title, String uri) {
    this.title = title;
    this.uri = uri;
  }

  public long getId() {
    return id;
  }

  public void setId(long id) {
    this.id = id;
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public MediaType getType() {
    return type;
  }

  public void setType(MediaType type) {
    this.type = type;
  }

  public String getUri() {
    return uri;
  }

  public void setUri(String path) {
    this.uri = path;
  }

  public Long getOwnerId() {
    return ownerId;
  }

  public void setOwnerId(Long ownerId) {
    this.ownerId = ownerId;
  }

  public String getCover() {
    return cover;
  }

  public void setCover(String cover) {
    this.cover = cover;
  }

  /** Whether the media has a picture, so clients do not ask for the covers of all the media without one. */
  @JsonProperty(value = "hasCover", access = JsonProperty.Access.READ_ONLY)
  public boolean hasCover() {
    return cover != null && !cover.isBlank();
  }

  /** The cover if it is a picture on another server (Spotify), which clients load from there; null otherwise. */
  @JsonProperty(value = "coverUrl", access = JsonProperty.Access.READ_ONLY)
  public String coverUrl() {
    return CoverUrls.isExternal(cover) ? cover : null;
  }

  public Set<Tag> getTags() {
    return tags;
  }

  public void setTags(Set<Tag> tags) {
    this.tags = tags;
  }
}
