package de.crow08.portalsync.model.media;

import com.fasterxml.jackson.annotation.JsonIgnore;
import de.crow08.portalsync.model.playlists.Playlist;
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

  @ManyToMany(fetch = FetchType.EAGER)
  @JoinTable(name = "media_tag",
      joinColumns = @JoinColumn(name = "media_id", referencedColumnName = "id"),
      inverseJoinColumns = @JoinColumn(name = "tag_id", referencedColumnName = "id"))
  private Set<Tag> tags;

  @ManyToMany(fetch = FetchType.LAZY)
  @JsonIgnore
  private Set<Playlist> playlists;

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

  public Set<Tag> getTags() {
    return tags;
  }

  public void setTags(Set<Tag> tags) {
    this.tags = tags;
  }

  public Set<Playlist> getPlaylists() {
    return playlists;
  }

  public void setPlaylists(Set<Playlist> playlists) {
    this.playlists = playlists;
  }
}
