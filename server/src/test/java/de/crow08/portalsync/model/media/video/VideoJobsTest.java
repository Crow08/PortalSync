package de.crow08.portalsync.model.media.video;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * The jobs with the real ffmpeg: the arguments of FfmpegCommands have to be accepted by it. Skipped where ffmpeg is
 * not installed (the CI job of the server); the e2e tests run the same in the Docker image.
 */
class VideoJobsTest {

  @TempDir
  Path dir;

  private VideoJobs jobs;

  @BeforeEach
  void setUp() {
    jobs = new VideoJobs("ffmpeg", "ffprobe", "ultrafast", 30);
    assumeTrue(jobs.available(), "ffmpeg is not installed");
  }

  @AfterEach
  void tearDown() {
    jobs.stop();
  }

  /** A 4 s MKV with a subtitle track, in a codec browsers do not play. */
  private Path source(String name) throws IOException, InterruptedException {
    Path subtitles = Files.writeString(dir.resolve("subtitles.srt"), "1\n00:00:00,500 --> 00:00:03,000\nHello\n");
    Path source = dir.resolve(name);
    Process process = new ProcessBuilder("ffmpeg", "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10:duration=4",
        "-f", "lavfi", "-i", "sine=frequency=330:duration=4",
        "-i", subtitles.toString(),
        "-map", "0:v", "-map", "1:a", "-map", "2:s", "-c:v", "mpeg4", "-c:a", "libmp3lame", "-c:s", "srt",
        source.toString()).inheritIO().start();
    assertThat(process.waitFor()).isZero();
    return source;
  }

  private static void await(VideoJob job) throws InterruptedException {
    Instant end = Instant.now().plus(Duration.ofMinutes(2));
    while (job.getFinished() == null && Instant.now().isBefore(end)) {
      Thread.sleep(50);
    }
    assertThat(job.getFinished()).as("job finished").isNotNull();
  }

  @Test
  void aConversionWritesTheVideoAndTheSpriteAndRemovesTheSource() throws Exception {
    Path source = source("source.mkv");
    Path output = dir.resolve("out.mp4");
    Path sprite = dir.resolve("out.thumbs.jpg");
    // the upload keeps the name with an empty file
    Files.createFile(output);
    AtomicBoolean registered = new AtomicBoolean();

    VideoJob job = jobs.convert(7, "out", source, output, sprite, true, () -> registered.set(true));
    await(job);

    assertThat(job.getState()).isEqualTo(VideoJob.State.DONE);
    assertThat(job.getProgress()).isEqualTo(1);
    assertThat(registered).isTrue();
    assertThat(Files.size(output)).isPositive();
    assertThat(Files.size(sprite)).isPositive();
    assertThat(source).doesNotExist();
    assertThat(jobs.jobsOf(7)).containsExactly(job);
    assertThat(jobs.jobsOf(8)).isEmpty();
  }

  @Test
  void aFailedConversionLeavesNothingBehind() throws Exception {
    Path source = Files.writeString(dir.resolve("broken.mkv"), "this is no video");
    Path output = Files.createFile(dir.resolve("out.mp4"));
    AtomicBoolean registered = new AtomicBoolean();

    VideoJob job = jobs.convert(7, "out", source, output, dir.resolve("out.thumbs.jpg"), true, () -> registered.set(true));
    await(job);

    assertThat(job.getState()).isEqualTo(VideoJob.State.FAILED);
    assertThat(registered).isFalse();
    assertThat(output).doesNotExist();
    assertThat(source).doesNotExist();
  }

  @Test
  void aVideoThatCanNotBeAddedToTheLibraryIsRemovedAgain() throws Exception {
    Path source = source("source.mkv");
    Path output = dir.resolve("out.mp4");

    VideoJob job = jobs.convert(7, "out", source, output, null, false, () -> {
      throw new IllegalStateException("no database");
    });
    await(job);

    assertThat(job.getState()).isEqualTo(VideoJob.State.FAILED);
    assertThat(output).doesNotExist();
  }

  @Test
  void thumbnailsForAVideoThatIsStoredAsItIs() throws Exception {
    Path video = source("film.mkv");
    Path sprite = dir.resolve("film.thumbs.jpg");

    VideoJob job = jobs.thumbnails(7, "film", video, sprite);
    await(job);

    assertThat(job.getState()).isEqualTo(VideoJob.State.DONE);
    assertThat(Files.size(sprite)).isPositive();
    assertThat(video).exists();
  }
}
