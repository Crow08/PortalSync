package de.crow08.portalsync.model.media.video;

import de.crow08.portalsync.model.media.MediaAccess;
import de.crow08.portalsync.model.playlists.PlaylistAccess;
import de.crow08.portalsync.utils.MediaFiles;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Upload of videos. A video is stored as it is, which needs an MP4 the browsers play (H.264, AAC, fast start), or with
 * {@code preprocess} converted into one by ffmpeg first (any format, see {@link VideoJobs}); {@code thumbnails} lets
 * ffmpeg write the sprite of the seek bar preview. Both need ffmpeg on the server ({@code GET info}).
 * <p>
 * The files go to {@link #DIRECTORY}, apart from the videos that are put into the storage by hand: what lies there was
 * written by the app and is removed with its video (MediaFileRemover). A converted video appears in the library when
 * its job is done; {@code GET jobs} lists the jobs of the user.
 */
@RestController
@RequestMapping("/api/v1/media/videoUpload")
public class VideoUploadResource {

  /** The uris of uploaded videos start with this directory of the storage. */
  public static final String DIRECTORY = "/videos/uploaded";

  private static final Logger LOG = LoggerFactory.getLogger(VideoUploadResource.class);

  private final VideoJobs videoJobs;
  private final VideoRegistration registration;
  private final MediaAccess mediaAccess;
  private final PlaylistAccess playlistAccess;
  private final Path storagePath;

  public VideoUploadResource(VideoJobs videoJobs, VideoRegistration registration, MediaAccess mediaAccess,
                             PlaylistAccess playlistAccess, @Value("${client.storage-path}") String storagePath) {
    this.videoJobs = videoJobs;
    this.registration = registration;
    this.mediaAccess = mediaAccess;
    this.playlistAccess = playlistAccess;
    this.storagePath = Paths.get(storagePath);
  }

  /** The "data" part of an upload. Everything is optional, the ids are looked up on the server. */
  public record UploadRequest(Long seriesId, Long seasonId, List<Long> tags, List<Long> playlists, boolean preprocess,
                              boolean burnSubtitles, boolean thumbnails) {
  }

  public record Info(boolean ffmpeg) {
  }

  /** One file of an upload: its name is checked before anything is written. */
  private record Upload(MultipartFile file, String title, String extension) {
  }

  /** What the server can do with a video: without ffmpeg the client switches the two options off. */
  @GetMapping("/info")
  public Info info() {
    return new Info(videoJobs.available());
  }

  /** The conversions and thumbnail runs of the current user, oldest first; finished ones are listed for an hour. */
  @GetMapping("/jobs")
  public List<VideoJob> jobs() {
    return videoJobs.jobsOf(mediaAccess.currentUserId());
  }

  /**
   * Stores the videos; the title of a video is its file name without the extension.
   *
   * @return the jobs that were started (empty without preprocessing and thumbnails)
   */
  @PostMapping
  public List<VideoJob> upload(@RequestParam("files") MultipartFile[] files, @RequestParam("data") String data)
      throws IOException {
    UploadRequest request;
    try {
      // a switch that is not named is off (Jackson 3 refuses a missing primitive by default)
      request = JsonMapper.builder().disable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES).build()
          .readValue(data, UploadRequest.class);
    } catch (JacksonException e) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid upload data");
    }
    if ((request.preprocess() || request.thumbnails()) && !videoJobs.available()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ffmpeg is not available on the server");
    }
    VideoRegistration.Details details = new VideoRegistration.Details(request.seriesId(), request.seasonId(),
        request.tags() == null ? List.of() : request.tags(),
        request.playlists() == null ? List.of() : request.playlists());
    // videos are only added to playlists the user may change; one that is not allowed fails the whole request
    details.playlistIds().forEach(playlistAccess::requireEditable);
    long ownerId = mediaAccess.currentUserId();

    List<Upload> uploads = new ArrayList<>();
    for (MultipartFile file : files) {
      // only the plain name is used: a path in the name must not place the file outside the directory
      String fileName = MediaFiles.fileName(file.getOriginalFilename())
          .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid file name"));
      int dot = fileName.lastIndexOf('.');
      String extension = dot > 0 ? fileName.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
      if (!request.preprocess() && !extension.equals("mp4")) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Without preprocessing only MP4 files are accepted");
      }
      uploads.add(new Upload(file, dot > 0 ? fileName.substring(0, dot) : fileName, extension));
    }

    List<VideoJob> started = new ArrayList<>();
    for (Upload upload : uploads) {
      String title = upload.title();
      String uri = DIRECTORY + "/" + title + ".mp4";
      Path target = MediaFiles.resolve(storagePath, uri)
          .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid file name"));
      Path sprite = target.resolveSibling(title + ".thumbs.jpg");
      Files.createDirectories(target.getParent());
      try {
        // also for a conversion: the name is taken from now on, ffmpeg overwrites the empty file
        Files.createFile(target);
      } catch (FileAlreadyExistsException e) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, "A video with this file name exists already");
      }

      if (request.preprocess()) {
        // the server names the source: the name ends up in a filter description of ffmpeg
        String suffix = upload.extension().matches("[a-z0-9]{1,5}") ? "." + upload.extension() : "";
        Path source = Files.createDirectories(incoming()).resolve(UUID.randomUUID() + suffix);
        try {
          upload.file().transferTo(source);
        } catch (IOException | RuntimeException e) {
          Files.deleteIfExists(source);
          Files.deleteIfExists(target);
          throw e;
        }
        started.add(videoJobs.convert(ownerId, title, source, target, request.thumbnails() ? sprite : null,
            request.burnSubtitles(), () -> registration.register(title, uri, ownerId, details)));
      } else {
        try {
          upload.file().transferTo(target);
          registration.register(title, uri, ownerId, details);
        } catch (IOException | RuntimeException e) {
          Files.deleteIfExists(target);
          throw e;
        }
        if (request.thumbnails()) {
          started.add(videoJobs.thumbnails(ownerId, title, target, sprite));
        }
      }
    }
    return started;
  }

  private Path incoming() {
    return MediaFiles.resolve(storagePath, DIRECTORY + "/.incoming").orElseThrow();
  }

  /**
   * Removes what a stop of the server in the middle of a conversion left behind: the uploaded sources and the empty
   * files that kept the names of the outputs. No job survives a restart, so nothing here is in use.
   */
  @PostConstruct
  void removeLeftovers() {
    try {
      Path incoming = incoming();
      if (Files.isDirectory(incoming)) {
        try (DirectoryStream<Path> sources = Files.newDirectoryStream(incoming)) {
          for (Path source : sources) {
            Files.deleteIfExists(source);
          }
        }
      }
      Path directory = incoming.getParent();
      if (Files.isDirectory(directory)) {
        try (DirectoryStream<Path> videos = Files.newDirectoryStream(directory, "*.mp4")) {
          for (Path video : videos) {
            if (Files.isRegularFile(video) && Files.size(video) == 0) {
              Files.deleteIfExists(video);
            }
          }
        }
      }
    } catch (IOException | RuntimeException e) {
      LOG.warn("Could not remove the leftovers of video uploads: {}", e.toString());
    }
  }
}
