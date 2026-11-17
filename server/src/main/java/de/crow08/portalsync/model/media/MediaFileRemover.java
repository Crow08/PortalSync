package de.crow08.portalsync.model.media;

import de.crow08.portalsync.model.media.song.Song;
import de.crow08.portalsync.model.media.video.Video;
import de.crow08.portalsync.model.media.video.VideoUploadResource;
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
 * Only the files the app wrote itself are removed: the songs and videos that were uploaded (a video with its
 * thumbnail sprite). Videos that were put into the storage by hand (converted with tools/convert-video.ps1, often
 * large) stay, as does everything outside the storage: the uploaded videos have their own directory.
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
      if (media instanceof Video) {
        // the thumbnail sprite lies next to the video
        String name = file.get().getFileName().toString();
        Files.deleteIfExists(file.get().resolveSibling(name.replaceFirst("\\.[^.]*$", "") + ".thumbs.jpg"));
      }
      return Files.deleteIfExists(file.get());
    } catch (IOException e) {
      // the media is gone from the library either way; a file that stays only costs space
      LOG.warn("Could not remove the file of the deleted media {}: {}", media.getId(), e.toString());
      return false;
    }
  }

  /** Whether the file lies in the directory of the uploaded videos, however the uri spells the path. */
  private boolean isUploadedVideo(String uri) {
    Optional<Path> uploads = MediaFiles.resolve(storage, VideoUploadResource.DIRECTORY);
    return uploads.isPresent() && MediaFiles.resolve(storage, uri).filter(file -> file.startsWith(uploads.get())).isPresent();
  }

  private Optional<Path> fileToRemove(Media media) {
    if (media.getUri() == null) {
      return Optional.empty();
    }
    // a Spotify song has no file, its uri is a Spotify uri; of the videos only the uploaded ones were written by the app
    if (media instanceof Song song ? song.isSpotify() : !(media instanceof Video && isUploadedVideo(media.getUri()))) {
      return Optional.empty();
    }
    if (mediaRepository.countByUri(media.getUri()) > 0) {
      return Optional.empty();
    }
    return MediaFiles.resolve(storage, media.getUri()).filter(Files::isRegularFile);
  }
}
