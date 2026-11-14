package de.crow08.portalsync.utils;

import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.Optional;

/**
 * Paths of media files. The uri of a media and the name of an uploaded file come from clients, so they must never
 * lead out of the storage directory (e.g. by "../").
 */
public final class MediaFiles {

  private MediaFiles() {
  }

  /**
   * Resolves the uri of a media against the storage directory.
   *
   * @return the file, empty if the uri is no path (e.g. a Spotify uri) or does not lie inside the storage directory.
   */
  public static Optional<Path> resolve(Path storage, String uri) {
    if (uri == null || uri.isBlank()) {
      return Optional.empty();
    }
    // the uris start with a slash ("/songs/1/title.mp3") but are relative to the storage directory
    String relative = uri.replaceFirst("^[/\\\\]+", "");
    try {
      Path root = storage.toAbsolutePath().normalize();
      Path file = root.resolve(relative).normalize();
      return file.startsWith(root) && !file.equals(root) ? Optional.of(file) : Optional.empty();
    } catch (InvalidPathException e) {
      return Optional.empty();
    }
  }

  /**
   * The plain file name of an uploaded file: browsers may send a path, and a client can send anything.
   *
   * @return the last path segment, empty if there is no usable name.
   */
  public static Optional<String> fileName(String originalFilename) {
    if (originalFilename == null) {
      return Optional.empty();
    }
    String name = originalFilename.substring(Math.max(originalFilename.lastIndexOf('/'), originalFilename.lastIndexOf('\\')) + 1)
        .trim();
    boolean usable = !name.isEmpty() && !name.equals(".") && !name.equals("..") && name.chars().noneMatch(c -> c < 0x20 || c == ':');
    return usable ? Optional.of(name) : Optional.empty();
  }
}
