package de.crow08.portalsync.model.playlists;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Playlists had a single author before they had owners: at the start, the author of a playlist without owners becomes
 * its owner, so nobody loses the right to change their playlists. Playlists that already have owners are not touched.
 */
@Component
public class PlaylistOwnerMigration implements ApplicationRunner {

  private final PlaylistRepository playlistRepository;

  public PlaylistOwnerMigration(PlaylistRepository playlistRepository) {
    this.playlistRepository = playlistRepository;
  }

  @Override
  @Transactional
  public void run(ApplicationArguments args) {
    for (Playlist playlist : playlistRepository.findAll()) {
      if (playlist.getAuthor() != null && (playlist.getOwners() == null || playlist.getOwners().isEmpty())) {
        playlist.getOwners().add(playlist.getAuthor());
        playlistRepository.save(playlist);
      }
    }
  }
}
