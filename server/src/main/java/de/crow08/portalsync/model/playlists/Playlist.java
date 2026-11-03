package de.crow08.portalsync.model.playlists;

import com.fasterxml.jackson.annotation.JsonIgnore;
import de.crow08.portalsync.model.media.Media;
import de.crow08.portalsync.model.users.User;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import java.util.ArrayList;
import java.util.List;

@Entity
public class Playlist {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private long id;

  @Column(nullable = false)
  private String name;

  /** The user who created the playlist. Who may change it is decided by the owners. */
  @ManyToOne
  private User author;

  /** The users who may change the playlist (add and remove songs, manage the owners); for everyone else it is read only, unless the playlist is public. */
  @ManyToMany(fetch = FetchType.EAGER)
  @JoinTable(name = "playlist_owner",
      joinColumns = @JoinColumn(name = "playlist_id", referencedColumnName = "id"),
      inverseJoinColumns = @JoinColumn(name = "user_id", referencedColumnName = "id"))
  private List<User> owners = new ArrayList<>();

  /** Everyone may add songs to and remove songs from the playlist. Only the owners manage the owners and this flag. */
  @Column(nullable = false, columnDefinition = "boolean default false")
  private boolean publicOwnership;

  @ManyToMany(fetch = FetchType.LAZY)
  @JoinTable(name = "media_playlist",
      joinColumns = @JoinColumn(name = "playlist_id", referencedColumnName = "id"),
      inverseJoinColumns = @JoinColumn(name = "media_id", referencedColumnName = "id"))
  private List<Media> media;

  public Playlist() {
  }

  /** A new playlist, its author is its first owner. */
  public Playlist(String name, User author) {
    this.name = name;
    this.author = author;
    if (author != null) {
      this.owners.add(author);
    }
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

  public User getAuthor() {
    return author;
  }

  public void setAuthor(User author) {
    this.author = author;
  }

  public List<User> getOwners() {
    return owners;
  }

  public void setOwners(List<User> owners) {
    this.owners = owners;
  }

  public boolean isPublicOwnership() {
    return publicOwnership;
  }

  public void setPublicOwnership(boolean publicOwnership) {
    this.publicOwnership = publicOwnership;
  }

  /** Whether the user is one of the owners. */
  public boolean isOwnedBy(long userId) {
    return owners != null && owners.stream().anyMatch(owner -> owner.getId() == userId);
  }

  @JsonIgnore
  public List<Media> getSongs() {
    return media;
  }

  @JsonIgnore
  public void setSongs(List<Media> songs) {
    this.media = songs;
  }
}
