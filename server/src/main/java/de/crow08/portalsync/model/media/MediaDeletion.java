package de.crow08.portalsync.model.media;

import de.crow08.portalsync.model.playlists.Playlist;
import de.crow08.portalsync.model.playlists.PlaylistRepository;
import de.crow08.portalsync.model.rating.RatingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Deletes media from the library together with what refers to them: their entries in playlists and their ratings. The
 * database refuses to delete a media that is still referred to, so these go first, in the same transaction: either all
 * of it is deleted or nothing.
 * <p>
 * Tags and genres are links the media (and songs) own, Hibernate removes them with the media. The files are not touched
 * here (see {@link MediaFileRemover}): they are removed once the transaction has committed.
 */
@Service
public class MediaDeletion {

  private final MediaRepository mediaRepository;
  private final PlaylistRepository playlistRepository;
  private final RatingRepository ratingRepository;

  public MediaDeletion(MediaRepository mediaRepository, PlaylistRepository playlistRepository,
                       RatingRepository ratingRepository) {
    this.mediaRepository = mediaRepository;
    this.playlistRepository = playlistRepository;
    this.ratingRepository = ratingRepository;
  }

  @Transactional
  public void delete(Collection<Media> media) {
    if (media.isEmpty()) {
      return;
    }
    Set<Long> ids = media.stream().map(Media::getId).collect(Collectors.toSet());
    // the playlists own their entries: taking the media out of the list removes the rows of media_playlist
    for (Playlist playlist : playlistRepository.findContainingAny(ids)) {
      playlist.getSongs().removeIf(entry -> ids.contains(entry.getId()));
    }
    ratingRepository.deleteBySongIds(ids);
    mediaRepository.deleteAll(media);
  }
}
