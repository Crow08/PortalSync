package de.crow08.portalsync.model.playlists;

import de.crow08.portalsync.model.media.Media;
import de.crow08.portalsync.model.users.AuthenticatedUser;
import de.crow08.portalsync.model.users.User;
import de.crow08.portalsync.model.users.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@RestController
@RequestMapping("/api/v1/playlists")
public class PlaylistResource {

  private final PlaylistRepository playlistRepository;
  private final UserRepository userRepository;
  private final PlaylistAccess playlistAccess;

  @Autowired
  public PlaylistResource(PlaylistRepository playlistRepository, UserRepository userRepository,
                          PlaylistAccess playlistAccess) {
    this.playlistRepository = playlistRepository;
    this.userRepository = userRepository;
    this.playlistAccess = playlistAccess;
  }

  @GetMapping("/all")
  public @ResponseBody Iterable<Playlist> getPlaylists() {
    return playlistRepository.findAll();
  }

  @GetMapping("/{id}")
  public @ResponseBody Optional<Playlist> getSong(@PathVariable String id) {
    return playlistRepository.findById(Long.parseLong(id));
  }

  /**
   * The media of a playlist in the order of the playlist, an empty list for an empty playlist. The media list of the
   * playlist is lazy, it is read inside the transaction.
   */
  @GetMapping("/{id}/media")
  @Transactional(readOnly = true)
  public ResponseEntity<List<Media>> getPlaylistMedia(@PathVariable long id) {
    Optional<Playlist> playlist = playlistRepository.findById(id);
    if (playlist.isEmpty()) {
      return new ResponseEntity<>(HttpStatus.NOT_FOUND);
    }
    List<Media> media = playlist.get().getSongs();
    return ResponseEntity.ok(media == null ? List.of() : new ArrayList<>(media));
  }

  @PutMapping(path = "/{playlistId}/addSongToPlaylist/{songId}")
  public ResponseEntity<Resource> addSongToPlaylist(@PathVariable Long songId, @PathVariable Long playlistId) {
    Playlist playlist = playlistAccess.requireEditable(playlistId);
    if (playlist.getSongs().stream().anyMatch(song -> song.getId() == songId)) {
      return new ResponseEntity<>(HttpStatus.CONFLICT);
    }
    Media media = new Media(songId);
    playlist.getSongs().add(media);
    playlistRepository.save(playlist);
    return new ResponseEntity<>(HttpStatus.OK);
  }


  @PutMapping(path = "/{playlistId}/addSongsToPlaylist/")
  public ResponseEntity<String> addSongsToPlaylist(@RequestBody Long[] song_ids, @PathVariable Long playlistId) {
    Playlist playlist = playlistAccess.requireEditable(playlistId);
    ArrayList<Media> songsToAdd = new ArrayList<>();
    for (Long song_id : song_ids) {
      if (playlist.getSongs().stream().noneMatch(plSong -> song_id == plSong.getId())) {
        songsToAdd.add(new Media(song_id));
      }
    }
    if (songsToAdd.isEmpty()) {
      return new ResponseEntity<>(HttpStatus.CONFLICT);
    }
    playlist.getSongs().addAll(songsToAdd);
    playlistRepository.save(playlist);
    if (song_ids.length != songsToAdd.size()) {
      return ResponseEntity.ok().body(songsToAdd.size() + " of " + song_ids.length + " songs added");
    }
    return ResponseEntity.ok().body("Successfully added " + song_ids.length + " songs");
  }

  /**
   * Removes one media from a playlist. Only an owner of the playlist and admins may do that. The media itself stays in
   * the library.
   */
  @DeleteMapping("/{playlistId}/media/{mediaId}")
  @Transactional
  public ResponseEntity<Void> removeSongFromPlaylist(@PathVariable long playlistId, @PathVariable long mediaId) {
    Playlist playlist = playlistAccess.requireEditable(playlistId);
    if (!removeFromPlaylist(playlist, Set.of(mediaId))) {
      return new ResponseEntity<>(HttpStatus.NOT_FOUND);
    }
    return new ResponseEntity<>(HttpStatus.OK);
  }

  /**
   * Removes several media from a playlist, like {@link #addSongsToPlaylist}. Ids that are not in the playlist are
   * ignored; the answer is 404 if none of them was in it.
   */
  @PutMapping(path = "/{playlistId}/removeSongsFromPlaylist/")
  @Transactional
  public ResponseEntity<String> removeSongsFromPlaylist(@RequestBody Long[] song_ids, @PathVariable long playlistId) {
    Playlist playlist = playlistAccess.requireEditable(playlistId);
    int before = playlist.getSongs() == null ? 0 : playlist.getSongs().size();
    if (!removeFromPlaylist(playlist, new HashSet<>(Arrays.asList(song_ids)))) {
      return new ResponseEntity<>(HttpStatus.NOT_FOUND);
    }
    int removed = before - playlist.getSongs().size();
    return ResponseEntity.ok().body("Removed " + removed + " of " + song_ids.length + " songs");
  }

  /** Makes a user an owner of the playlist. Only the owners and admins may do that. */
  @PutMapping("/{playlistId}/owners/{userId}")
  @Transactional
  public ResponseEntity<Void> addOwner(@PathVariable long playlistId, @PathVariable long userId) {
    Playlist playlist = playlistAccess.requireManageable(playlistId);
    User user = userRepository.findById(userId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
    if (playlist.isOwnedBy(userId)) {
      return new ResponseEntity<>(HttpStatus.CONFLICT);
    }
    playlist.getOwners().add(user);
    playlistRepository.save(playlist);
    return new ResponseEntity<>(HttpStatus.OK);
  }

  /**
   * Takes a user out of the owners of the playlist. Only the owners and admins may do that. The last owner can not be
   * removed, a playlist without owners could only be changed by admins.
   */
  @DeleteMapping("/{playlistId}/owners/{userId}")
  @Transactional
  public ResponseEntity<Void> removeOwner(@PathVariable long playlistId, @PathVariable long userId) {
    Playlist playlist = playlistAccess.requireManageable(playlistId);
    if (!playlist.isOwnedBy(userId)) {
      return new ResponseEntity<>(HttpStatus.NOT_FOUND);
    }
    if (playlist.getOwners().size() == 1) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "The last owner of a playlist can not be removed");
    }
    playlist.getOwners().removeIf(owner -> owner.getId() == userId);
    playlistRepository.save(playlist);
    return new ResponseEntity<>(HttpStatus.OK);
  }

  /**
   * Deletes a playlist. Only the owners and admins may do that, a public playlist does not change that. The media in
   * the playlist stay in the library. The playlist with the id 1 ("no playlist") stands for no playlist and stays.
   */
  @DeleteMapping("/{playlistId}")
  @Transactional
  public ResponseEntity<Void> deletePlaylist(@PathVariable long playlistId) {
    Playlist playlist = playlistAccess.requireManageable(playlistId);
    if (playlist.getId() <= 1) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "This playlist can not be deleted");
    }
    playlistRepository.delete(playlist);
    return new ResponseEntity<>(HttpStatus.OK);
  }

  /**
   * Makes the ownership of the playlist public (everyone may change its songs) or private (only the owners and admins).
   * Only the owners and admins may do that.
   */
  @PutMapping("/{playlistId}/public/{value}")
  @Transactional
  public ResponseEntity<Void> setPublicOwnership(@PathVariable long playlistId, @PathVariable boolean value) {
    Playlist playlist = playlistAccess.requireManageable(playlistId);
    playlist.setPublicOwnership(value);
    playlistRepository.save(playlist);
    return new ResponseEntity<>(HttpStatus.OK);
  }

  /** Removes the media with these ids from the playlist and saves it, false if none of them was in the playlist. */
  private boolean removeFromPlaylist(Playlist playlist, Set<Long> mediaIds) {
    List<Media> songs = playlist.getSongs();
    if (songs == null || !songs.removeIf(song -> mediaIds.contains(song.getId()))) {
      return false;
    }
    playlistRepository.save(playlist);
    return true;
  }

  @PostMapping(path = "/")
  public @ResponseBody long createNewPlaylist(@RequestBody String name) throws Exception {
    AuthenticatedUser authUser = (AuthenticatedUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    User user = userRepository.findById(authUser.getId()).orElseThrow(() -> new Exception("User Not found!"));
    Playlist playlist = new Playlist(name, user);
    playlistRepository.save(playlist);
    return playlist.getId();
  }
}
