package de.crow08.portalsync.model.media;

import de.crow08.portalsync.model.media.song.Song;
import de.crow08.portalsync.model.media.video.Video;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Which files go when a media is deleted from the library: the uploaded songs, and nothing else. */
class MediaFileRemoverTest {

  @TempDir
  Path dir;

  private Path storage;
  private MediaRepository repository;
  private MediaFileRemover remover;

  @BeforeEach
  void setUp() throws IOException {
    storage = Files.createDirectories(dir.resolve("media"));
    repository = mock(MediaRepository.class);
    remover = new MediaFileRemover(repository, storage);
  }

  private Path file(String relative) throws IOException {
    Path file = storage.resolve(relative);
    Files.createDirectories(file.getParent());
    return Files.writeString(file, "content");
  }

  @Test
  void theFileOfADeletedSongIsRemoved() throws IOException {
    Path file = file("songs/1/title.mp3");

    assertThat(remover.removeFileOf(new Song("title.mp3", "/songs/1/title.mp3"))).isTrue();

    assertThat(file).doesNotExist();
    // the directory of the artist stays for the next upload
    assertThat(file.getParent()).isDirectory();
  }

  @Test
  void aFileAnotherMediaStillUsesStays() throws IOException {
    Path file = file("songs/1/title.mp3");
    when(repository.countByUri("/songs/1/title.mp3")).thenReturn(1L);

    assertThat(remover.removeFileOf(new Song("title.mp3", "/songs/1/title.mp3"))).isFalse();

    assertThat(file).exists();
  }

  @Test
  void aSpotifySongHasNoFile() throws IOException {
    // a file that happens to have the name of the Spotify uri must not be touched either
    Path file = file("spotify-track");
    Song song = new Song("a track", "spotify-track");
    song.setSpotify(true);

    assertThat(remover.removeFileOf(song)).isFalse();

    assertThat(file).exists();
  }

  @Test
  void videosArePutThereByHandAndStay() throws IOException {
    Path video = file("videos/film.mp4");
    Path thumbnails = file("videos/film.thumbs.jpg");
    assertThat(remover.removeFileOf(new Video("film", "/videos/film.mp4"))).isFalse();

    assertThat(video).exists();
    assertThat(thumbnails).exists();
  }

  @Test
  void anUploadedVideoGoesWithItsThumbnails() throws IOException {
    Path video = file("videos/uploaded/film.mp4");
    Path thumbnails = file("videos/uploaded/film.thumbs.jpg");
    Path other = file("videos/uploaded/film2.mp4");

    assertThat(remover.removeFileOf(new Video("film", "/videos/uploaded/film.mp4"))).isTrue();

    assertThat(video).doesNotExist();
    assertThat(thumbnails).doesNotExist();
    assertThat(other).exists();
  }

  @Test
  void aVideoThatOnlyNamesTheUploadDirectoryInBetweenStays() throws IOException {
    Path video = file("videos/film.mp4");

    assertThat(remover.removeFileOf(new Video("film", "/videos/uploaded/../film.mp4"))).isFalse();

    assertThat(video).exists();
  }

  @Test
  void nothingOutsideTheStorageIsRemoved() throws IOException {
    Path outside = Files.writeString(dir.resolve("outside.mp3"), "content");

    assertThat(remover.removeFileOf(new Song("evil", "../outside.mp3"))).isFalse();
    assertThat(remover.removeFileOf(new Song("evil", "/songs/../../outside.mp3"))).isFalse();

    assertThat(outside).exists();
  }

  @Test
  void aSongWhoseFileIsMissingIsNoProblem() {
    assertThat(remover.removeFileOf(new Song("gone", "/songs/1/gone.mp3"))).isFalse();
    assertThat(remover.removeFileOf(new Song("no uri", null))).isFalse();
  }

  @Test
  void aDirectoryIsNeverRemoved() throws IOException {
    file("songs/1/title.mp3");

    assertThat(remover.removeFileOf(new Song("dir", "/songs/1"))).isFalse();

    assertThat(storage.resolve("songs/1/title.mp3")).exists();
  }
}
