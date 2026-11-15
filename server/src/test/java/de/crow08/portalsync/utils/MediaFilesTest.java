package de.crow08.portalsync.utils;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class MediaFilesTest {

  @TempDir
  Path storage;

  @Test
  void aUriIsRelativeToTheStorageAlsoWithALeadingSlash() {
    assertThat(MediaFiles.resolve(storage, "/songs/1/title.mp3")).contains(storage.resolve("songs").resolve("1").resolve("title.mp3"));
    assertThat(MediaFiles.resolve(storage, "videos/film.mp4")).contains(storage.resolve("videos").resolve("film.mp4"));
    assertThat(MediaFiles.resolve(storage, "//songs/a.mp3")).contains(storage.resolve("songs").resolve("a.mp3"));
  }

  @Test
  void dotsInsideTheStorageAreFine() {
    assertThat(MediaFiles.resolve(storage, "/songs/1/../2/a.mp3")).contains(storage.resolve("songs").resolve("2").resolve("a.mp3"));
    assertThat(MediaFiles.resolve(storage, "/songs/a..b.mp3")).contains(storage.resolve("songs").resolve("a..b.mp3"));
  }

  @ParameterizedTest
  @ValueSource(strings = {"../secret.txt", "/../secret.txt", "/songs/../../secret.txt", "songs/../../../etc/passwd", "..", "/"})
  void aUriThatLeavesTheStorageIsRefused(String uri) {
    assertThat(MediaFiles.resolve(storage, uri)).isEmpty();
  }

  @Test
  void anAbsolutePathOutsideTheStorageIsRefused() {
    Path outside = storage.getParent().resolve("outside.txt").toAbsolutePath();
    assertThat(MediaFiles.resolve(storage.resolve("media"), outside.toString())).isEmpty();
  }

  @ParameterizedTest
  @NullAndEmptySource
  @ValueSource(strings = {"   ", "songs/\u0000.mp3"})
  void whatIsNoPathIsRefused(String uri) {
    assertThat(MediaFiles.resolve(storage, uri)).isEmpty();
  }

  @Test
  void theStorageItselfIsNoFile() {
    assertThat(MediaFiles.resolve(storage, "songs/..")).isEmpty();
  }

  @Test
  void theFileNameOfAnUploadIsItsLastSegment() {
    assertThat(MediaFiles.fileName("title.mp3")).contains("title.mp3");
    assertThat(MediaFiles.fileName("../../evil.mp3")).contains("evil.mp3");
    assertThat(MediaFiles.fileName("C:\\Users\\someone\\title.mp3")).contains("title.mp3");
    assertThat(MediaFiles.fileName("/tmp/title.mp3")).contains("title.mp3");
    assertThat(MediaFiles.fileName("  spaced name.mp3 ")).contains("spaced name.mp3");
  }

  @ParameterizedTest
  @NullAndEmptySource
  @ValueSource(strings = {"..", ".", "dir/", "a:b.mp3", "line\nbreak.mp3", "   "})
  void aFileNameThatIsNoNameIsRefused(String name) {
    assertThat(MediaFiles.fileName(name)).isEmpty();
  }
}
