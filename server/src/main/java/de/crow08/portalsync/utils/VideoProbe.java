package de.crow08.portalsync.utils;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * What ffprobe tells about a video file ({@code ffprobe -show_streams -show_format -of json}): its length and its
 * streams. Picks the streams a conversion uses, like tools/convert-video.ps1 does when nothing is chosen by hand.
 */
public record VideoProbe(double duration, List<Stream> streams) {

  /** Subtitles that are pictures: they are laid over the video, text subtitles are rendered. */
  private static final List<String> BITMAP_SUBTITLES = List.of("hdmv_pgs_subtitle", "dvd_subtitle", "dvb_subtitle", "xsub");

  /**
   * @param index     index among all streams of the file
   * @param typeIndex index among the streams of the same type
   */
  public record Stream(int index, String type, String codec, int typeIndex, String language, boolean isDefault,
                       boolean forced, boolean attachedPicture) {

    public boolean isBitmapSubtitle() {
      return BITMAP_SUBTITLES.contains(codec);
    }
  }

  /** Reads the JSON output of ffprobe. Fields that are missing count as unknown (length 0, no streams). */
  public static VideoProbe parse(String json) {
    JsonNode root = new JsonMapper().readTree(json);
    double duration;
    try {
      duration = Double.parseDouble(root.path("format").path("duration").asString("0"));
    } catch (NumberFormatException e) {
      duration = 0;
    }
    List<Stream> streams = new ArrayList<>();
    Map<String, Integer> counts = new HashMap<>();
    for (JsonNode node : root.path("streams")) {
      String type = node.path("codec_type").asString("");
      JsonNode disposition = node.path("disposition");
      streams.add(new Stream(
          node.path("index").asInt(streams.size()),
          type,
          node.path("codec_name").asString(""),
          counts.merge(type, 1, Integer::sum) - 1,
          node.path("tags").path("language").asString(""),
          disposition.path("default").asInt(0) == 1,
          disposition.path("forced").asInt(0) == 1,
          disposition.path("attached_pic").asInt(0) == 1));
    }
    return new VideoProbe(Double.isFinite(duration) ? Math.max(0, duration) : 0, List.copyOf(streams));
  }

  private List<Stream> ofType(String type) {
    return streams.stream().filter(stream -> stream.type().equals(type)).toList();
  }

  /** The video stream: the first one that is no cover picture. */
  public Optional<Stream> video() {
    return ofType("video").stream().filter(stream -> !stream.attachedPicture()).findFirst();
  }

  /** The audio stream: the default one, else the first. */
  public Optional<Stream> audio() {
    List<Stream> audio = ofType("audio");
    return audio.stream().filter(Stream::isDefault).findFirst().or(() -> audio.stream().findFirst());
  }

  /** The subtitles to burn in: full subtitles before forced ones (signs only), the default track first. */
  public Optional<Stream> subtitle() {
    List<Stream> subtitles = ofType("subtitle");
    return subtitles.stream().filter(stream -> stream.isDefault() && !stream.forced()).findFirst()
        .or(() -> subtitles.stream().filter(stream -> !stream.forced()).findFirst())
        .or(() -> subtitles.stream().findFirst());
  }
}
