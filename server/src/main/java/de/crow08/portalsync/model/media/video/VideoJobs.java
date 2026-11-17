package de.crow08.portalsync.model.media.video;

import de.crow08.portalsync.utils.FfmpegCommands;
import de.crow08.portalsync.utils.VideoProbe;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Runs ffmpeg for uploaded videos, one job after the other: a conversion takes all the processor there is. The jobs
 * and their progress live in memory, a restart of the server loses the ones that were not done (the upload page then
 * shows nothing and the video does not appear; the leftovers are removed at the next start, see VideoUploadResource).
 * <p>
 * ffmpeg and ffprobe are optional ({@code client.ffmpeg}, {@code client.ffprobe}, by default from the PATH; the Docker
 * image has them): without them {@link #available()} is false and videos are stored as they are.
 */
@Component
public class VideoJobs {

  private static final Logger LOG = LoggerFactory.getLogger(VideoJobs.class);

  /** How long a finished job is still listed. */
  private static final Duration KEEP_FINISHED = Duration.ofHours(1);

  private final String ffmpeg;
  private final String ffprobe;
  private final FfmpegCommands.Quality quality;

  private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
    Thread thread = new Thread(runnable, "video-jobs");
    thread.setDaemon(true);
    return thread;
  });
  private final List<VideoJob> jobs = new CopyOnWriteArrayList<>();
  private final AtomicLong ids = new AtomicLong();
  private volatile Boolean available;
  private volatile Process running;

  @Autowired
  public VideoJobs(@Value("${client.ffmpeg:ffmpeg}") String ffmpeg,
                   @Value("${client.ffprobe:ffprobe}") String ffprobe,
                   @Value("${client.ffmpeg-preset:medium}") String preset,
                   @Value("${client.ffmpeg-crf:20}") int crf) {
    this.ffmpeg = ffmpeg;
    this.ffprobe = ffprobe;
    this.quality = new FfmpegCommands.Quality(preset, crf);
  }

  /** What a job does; the job is done when it returns and failed when it throws. */
  private interface Task {
    void run(VideoJob job) throws Exception;
  }

  /** Whether ffmpeg and ffprobe can be run. Checked once: installing them needs a restart of the server. */
  public boolean available() {
    Boolean known = available;
    if (known == null) {
      known = runs(ffmpeg) && runs(ffprobe);
      available = known;
      if (!known) {
        LOG.info("ffmpeg or ffprobe not found: uploaded videos are neither converted nor do they get thumbnails");
      }
    }
    return known;
  }

  private static boolean runs(String program) {
    try {
      Process process = new ProcessBuilder(program, "-version")
          .redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
      if (!process.waitFor(10, TimeUnit.SECONDS)) {
        process.destroyForcibly();
        return false;
      }
      return process.exitValue() == 0;
    } catch (IOException e) {
      return false;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return false;
    }
  }

  /** The jobs of a user, oldest first; finished ones are listed for an hour. */
  public List<VideoJob> jobsOf(long ownerId) {
    Instant limit = Instant.now().minus(KEEP_FINISHED);
    jobs.removeIf(job -> job.getFinished() != null && job.getFinished().isBefore(limit));
    return jobs.stream().filter(job -> job.getOwnerId() == ownerId).toList();
  }

  /**
   * Converts the uploaded source into the output (and the sprite, if not null), then calls {@code onSuccess}, which
   * adds the video to the library. The source is deleted in the end, the output and the sprite if anything failed.
   */
  public VideoJob convert(long ownerId, String title, Path source, Path output, Path sprite, boolean burnSubtitles,
                          Runnable onSuccess) {
    return submit(new VideoJob(ids.incrementAndGet(), ownerId, title, VideoJob.Kind.CONVERT), job -> {
      boolean done = false;
      try {
        VideoProbe probe = probe(source);
        List<String> args = FfmpegCommands
            .convert(probe, source.getFileName().toString(), output, sprite, burnSubtitles, quality)
            .orElseThrow(() -> new IOException("The file has no video stream"));
        // ffmpeg runs in the directory of the source, so the subtitle filter gets a plain name without escaping
        ffmpeg(args, source.getParent(), probe.duration(), job);
        onSuccess.run();
        done = true;
      } finally {
        delete(source);
        if (!done) {
          delete(output);
          delete(sprite);
        }
      }
    });
  }

  /** Writes the thumbnail sprite of a video. The video is in the library either way: a failure only means no preview. */
  public VideoJob thumbnails(long ownerId, String title, Path video, Path sprite) {
    return submit(new VideoJob(ids.incrementAndGet(), ownerId, title, VideoJob.Kind.THUMBNAILS), job -> {
      boolean done = false;
      try {
        VideoProbe probe = probe(video);
        List<String> args = FfmpegCommands.thumbnails(probe, video, sprite)
            .orElseThrow(() -> new IOException("No thumbnails possible: no video stream, or unknown or too long"));
        ffmpeg(args, video.getParent(), probe.duration(), job);
        done = true;
      } finally {
        if (!done) {
          delete(sprite);
        }
      }
    });
  }

  private VideoJob submit(VideoJob job, Task task) {
    jobs.add(job);
    executor.execute(() -> {
      job.running();
      boolean success = false;
      try {
        task.run(job);
        success = true;
      } catch (Exception e) {
        // the details (paths, output of ffmpeg) stay in the log, the client only learns that it failed
        LOG.warn("Video job {} ({}, \"{}\") failed: {}", job.getId(), job.getKind(), job.getTitle(), e.toString());
      } finally {
        job.finish(success, Instant.now());
      }
    });
    return job;
  }

  private VideoProbe probe(Path file) throws IOException, InterruptedException {
    Process process = new ProcessBuilder(ffprobe, "-v", "error", "-show_streams", "-show_format", "-of", "json",
        file.toString()).redirectError(ProcessBuilder.Redirect.DISCARD).start();
    running = process;
    try {
      String json = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
      if (process.waitFor() != 0) {
        throw new IOException("ffprobe can not read the file");
      }
      return VideoProbe.parse(json);
    } finally {
      running = null;
    }
  }

  private void ffmpeg(List<String> args, Path directory, double duration, VideoJob job)
      throws IOException, InterruptedException {
    List<String> command = new ArrayList<>(List.of(ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-nostats",
        "-progress", "pipe:1"));
    command.addAll(args);
    Process process = new ProcessBuilder(command).directory(directory.toFile()).redirectErrorStream(true).start();
    running = process;
    try {
      // the progress report is lines of key=value, everything else is an error message
      Deque<String> messages = new ArrayDeque<>();
      try (BufferedReader reader = process.inputReader(StandardCharsets.UTF_8)) {
        for (String line = reader.readLine(); line != null; line = reader.readLine()) {
          if (line.startsWith("out_time_us=")) {
            if (duration > 0) {
              try {
                job.progress(Long.parseLong(line.substring("out_time_us=".length()).trim()) / 1e6 / duration);
              } catch (NumberFormatException e) {
                // "N/A" before the first frame
              }
            }
          } else if (!line.matches("[a-z_0-9]+=.*")) {
            messages.addLast(line);
            if (messages.size() > 10) {
              messages.removeFirst();
            }
          }
        }
      }
      int exitCode = process.waitFor();
      if (exitCode != 0) {
        throw new IOException("ffmpeg failed with exit code " + exitCode + ": " + String.join(" | ", messages));
      }
    } finally {
      running = null;
    }
  }

  private static void delete(Path file) {
    if (file == null) {
      return;
    }
    try {
      Files.deleteIfExists(file);
    } catch (IOException e) {
      LOG.warn("Could not remove {}: {}", file, e.toString());
    }
  }

  @PreDestroy
  void stop() {
    executor.shutdownNow();
    Process process = running;
    if (process != null) {
      process.destroyForcibly();
    }
  }
}
