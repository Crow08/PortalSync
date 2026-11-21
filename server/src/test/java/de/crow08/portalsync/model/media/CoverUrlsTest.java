package de.crow08.portalsync.model.media;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CoverUrlsTest {

  private static final String IMAGE = "https://i.scdn.co/image/ab67616d00001e02ff9ca10b55ce82ae553c8228";

  @Test
  void aPictureOfSpotifyIsTaken() {
    assertThat(CoverUrls.spotifyImage(IMAGE)).contains(IMAGE);
  }

  @Test
  void everythingElseIsRefused() {
    assertThat(CoverUrls.spotifyImage(null)).isEmpty();
    assertThat(CoverUrls.spotifyImage("")).isEmpty();
    assertThat(CoverUrls.spotifyImage("http://i.scdn.co/image/abc")).isEmpty();
    assertThat(CoverUrls.spotifyImage("https://example.org/image/abc")).isEmpty();
    assertThat(CoverUrls.spotifyImage("https://i.scdn.co.example.org/image/abc")).isEmpty();
    assertThat(CoverUrls.spotifyImage("https://i.scdn.co@example.org/image/abc")).isEmpty();
    assertThat(CoverUrls.spotifyImage("https://user@i.scdn.co/image/abc")).isEmpty();
    assertThat(CoverUrls.spotifyImage("https://i.scdn.co:8443/image/abc")).isEmpty();
    assertThat(CoverUrls.spotifyImage("https://i.scdn.co/image/abc?x=1")).isEmpty();
    assertThat(CoverUrls.spotifyImage("https://i.scdn.co/image/abc#x")).isEmpty();
    assertThat(CoverUrls.spotifyImage("https://i.scdn.co/image/../other")).isEmpty();
    assertThat(CoverUrls.spotifyImage("https://i.scdn.co/other/abc")).isEmpty();
    assertThat(CoverUrls.spotifyImage("/videos/secret.mp4")).isEmpty();
    assertThat(CoverUrls.spotifyImage("javascript:alert(1)")).isEmpty();
    assertThat(CoverUrls.spotifyImage("https://i.scdn.co/image/" + "a".repeat(300))).isEmpty();
  }

  @Test
  void aCoverIsAFileOrAUrl() {
    assertThat(CoverUrls.isExternal(IMAGE)).isTrue();
    assertThat(CoverUrls.isExternal("/songs/artist/album/cover.jpg")).isFalse();
    assertThat(CoverUrls.isExternal(null)).isFalse();
  }
}
