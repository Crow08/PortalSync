package de.crow08.portalsync.model.media;

import de.crow08.portalsync.model.media.song.Song;
import de.crow08.portalsync.utils.MediaFiles;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Optional;

/**
 * Removes the file of a media that was deleted from the library, so the storage does not fill up with files nobody can
 * reach any more and the name of a deleted song is free for a new upload.
 * <p>
 * Only the files the app wrote itself are removed: the songs that were uploaded. Videos are put into the storage by
 * hand (converted with tools/convert-video.ps1, often large) and stay, as does everything outside the storage.
 */
@Component
public class MediaFileRemover {

  private static final Logger LOG = LoggerFactory.getLogger(MediaFileRemover.class);

  private final MediaRepository mediaRepository;
  private final Path storage;

  @Autowired
  public MediaFileRemover(MediaRepository mediaRepository, @Value("${client.storage-path}") String storagePath) {
    this(mediaRepository, Paths.get(storagePath));
  }

  MediaFileRemover(MediaRepository mediaRepository, Path storage) {
    this.mediaRepository = mediaRepository;
    this.storage = storage;
  }

  /**
   * Removes the file of the media. Call it after the media was deleted from the library: a file that another media
   * still uses stays.
   *
   * @return true if a file was removed
   */
  public boolean removeFileOf(Media media) {
    Optional<Path> file = fileToRemove(media);
    if (file.isEmpty()) {
      return false;
    }
    try {
      return Files.deleteIfExists(file.get());
    } catch (IOException e) {
      // the media is gone from the library either way; a file that stays only costs space
      LOG.warn("Could not remove the file of the deleted media {}: {}", media.getId(), e.toString());
      return false;
    }
  }

  private Optional<Path> fileToRemove(Media media) {
    // a Spotify song has no file, its uri is a Spotify uri
    if (!(media instanceof Song song) || song.isSpotify() || media.getUri() == null) {
      return Optional.empty();
    }
    if (mediaRepository.countByUri(media.getUri()) > 0) {
      return Optional.empty();
    }
    return MediaFiles.resolve(storage, media.getUri()).filter(Files::isRegularFile);
  }
}
