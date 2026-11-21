package de.crow08.portalsync.model.album;

import de.crow08.portalsync.model.media.song.SongRepository;
import de.crow08.portalsync.model.playlists.PlaylistAccess;
import de.crow08.portalsync.model.users.AuthenticatedUser;
import de.crow08.portalsync.utils.ReleaseDates;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/albums")
public class AlbumResource {

  private final AlbumRepository albumRepository;
  private final SongRepository songRepository;

  public AlbumResource(AlbumRepository albumRepository, SongRepository songRepository) {
    this.albumRepository = albumRepository;
    this.songRepository = songRepository;
  }

  @GetMapping("/all")
  public @ResponseBody Iterable<Album> getAlbum() {
    return albumRepository.findAll();
  }

  @PostMapping(path = "/")
  public @ResponseBody long createNewAlbum(@RequestBody String name) {
    Album album = new Album(name);
    albumRepository.save(album);
    return album.getId();
  }

  /** The release date of an album: a year, a month or a day (see ReleaseDates), null or blank for none. */
  public record ReleaseDateRequest(String releaseDate) {
  }

  /**
   * Sets the release date of an album. An album has no owner: admins may do that and everyone who owns a song of the
   * album, the users who may also change those songs.
   */
  @PutMapping("/{id}/releaseDate")
  public @ResponseBody Album setReleaseDate(@PathVariable long id, @RequestBody ReleaseDateRequest request) {
    Album album = albumRepository.findById(id)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Album not found"));
    AuthenticatedUser user = PlaylistAccess.currentUser();
    if (!user.isAdmin() && !songRepository.existsByAlbum_IdAndOwnerId(id, user.getId())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only an admin or the owner of a song of the album can change it");
    }
    try {
      album.setReleaseDate(ReleaseDates.normalize(request.releaseDate()));
    } catch (IllegalArgumentException e) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
    }
    return albumRepository.save(album);
  }
}
