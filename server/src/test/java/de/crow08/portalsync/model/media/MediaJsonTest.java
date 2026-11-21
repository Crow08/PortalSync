package de.crow08.portalsync.model.media;

import de.crow08.portalsync.model.media.song.Song;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

/** What clients learn about the cover of a media, and that they can not set it. */
class MediaJsonTest {

  private static final JsonMapper MAPPER = new JsonMapper();

  @Test
  void aMediaSaysWhetherItHasACoverButNotWhereItIs() {
    Song song = new Song("a song", "/songs/artist/album/song.mp3");
    assertThat(MAPPER.valueToTree(song).get("hasCover").asBoolean()).isFalse();

    song.setCover("/songs/artist/album/cover.jpg");
    JsonNode json = MAPPER.valueToTree(song);
    assertThat(json.get("hasCover").asBoolean()).isTrue();
    assertThat(json.has("cover")).isFalse();
    assertThat(json.get("coverUrl").isNull()).isTrue();
  }

  @Test
  void aCoverAtSpotifyIsGivenAsItsUrl() {
    Song song = new Song("a song", "spotify:track:abc");
    song.setCover("https://i.scdn.co/image/abc");
    JsonNode json = MAPPER.valueToTree(song);
    assertThat(json.get("hasCover").asBoolean()).isTrue();
    assertThat(json.get("coverUrl").asString()).isEqualTo("https://i.scdn.co/image/abc");
  }

  @Test
  void aBlankCoverIsNone() {
    Song song = new Song("a song", "/songs/artist/album/song.mp3");
    song.setCover(" ");
    assertThat(song.hasCover()).isFalse();
  }

  @Test
  void aClientCanNotSetTheCover() {
    Song song = MAPPER.readValue("{\"id\":1,\"title\":\"a song\",\"hasCover\":true,\"coverUrl\":\"https://i.scdn.co/image/abc\",\"cover\":\"/videos/secret.mp4\"}", Song.class);
    assertThat(song.getCover()).isNull();
    assertThat(song.hasCover()).isFalse();
  }
}
