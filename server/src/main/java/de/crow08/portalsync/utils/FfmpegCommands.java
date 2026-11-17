package de.crow08.portalsync.utils;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * The arguments of the ffmpeg runs for uploaded videos, the same conversion as tools/convert-video.ps1: H.264 High
 * profile in 8-bit 4:2:0 (browsers do not decode 10-bit H.264), AAC audio, the moov atom at the front (fast start,
 * seeking), chapters kept, at most one subtitle track burned in. The thumbnail sprite of the seek bar is one 160x90
 * tile every 2 s, 10 per row; the client (player-track.component.ts) and the script use the same constants.
 * <p>
 * The arguments do not start with the program and say nothing about logging: the caller adds both.
 */
public final class FfmpegCommands {

  static final int THUMBNAIL_INTERVAL = 2;
  static final int THUMBNAIL_WIDTH = 160;
  static final int THUMBNAIL_HEIGHT = 90;
  static final int THUMBNAIL_COLUMNS = 10;
  /** A JPEG is at most 65535 pixels high. */
  static final int MAX_SPRITE_HEIGHT = 65500;

  private FfmpegCommands() {
  }

  /** Quality of the conversion: the x264 preset (speed against size) and the constant rate factor (lower is better). */
  public record Quality(String preset, int crf) {
  }

  /**
   * The filter chain that turns a video of that length into one sprite picture.
   *
   * @return empty if the length is unknown or the video is too long for a single picture
   */
  public static Optional<String> thumbnailFilter(double seconds) {
    if (seconds <= 0) {
      return Optional.empty();
    }
    long tiles = (long) Math.floor(seconds / THUMBNAIL_INTERVAL) + 1;
    long rows = (tiles + THUMBNAIL_COLUMNS - 1) / THUMBNAIL_COLUMNS;
    if (rows * THUMBNAIL_HEIGHT > MAX_SPRITE_HEIGHT) {
      return Optional.empty();
    }
    String size = THUMBNAIL_WIDTH + ":" + THUMBNAIL_HEIGHT;
    return Optional.of("fps=1/" + THUMBNAIL_INTERVAL + ",scale=" + size + ":force_original_aspect_ratio=decrease,"
        + "pad=" + size + ":(ow-iw)/2:(oh-ih)/2,setsar=1,tile=" + THUMBNAIL_COLUMNS + "x" + rows);
  }

  private static List<String> spriteOutput(Path sprite) {
    return List.of("-map", "[t]", "-frames:v", "1", "-q:v", "5", "-update", "1", sprite.toString());
  }

  /**
   * Only the thumbnail sprite of a video.
   *
   * @return empty if the file has no video stream or no sprite is possible for its length
   */
  public static Optional<List<String>> thumbnails(VideoProbe probe, Path video, Path sprite) {
    Optional<VideoProbe.Stream> stream = probe.video();
    Optional<String> filter = thumbnailFilter(probe.duration());
    if (stream.isEmpty() || filter.isEmpty()) {
      return Optional.empty();
    }
    List<String> args = new ArrayList<>(List.of("-y", "-i", video.toString(),
        "-filter_complex", "[0:" + stream.get().index() + "]" + filter.get() + "[t]"));
    args.addAll(spriteOutput(sprite));
    return Optional.of(args);
  }

  /**
   * Converts a video into a browser playable MP4, with the sprite in the same run if one is asked for and possible.
   *
   * @param sourceName    the name of the source in the working directory of ffmpeg. It ends up inside a filter
   *                      description, so only letters, digits, dots, dashes and underscores are accepted: a name
   *                      chosen by the server, never the name of the uploaded file.
   * @param sprite        where the sprite goes, null for none
   * @param burnSubtitles whether the subtitles the probe picks are burned into the picture
   * @return empty if the file has no video stream
   */
  public static Optional<List<String>> convert(VideoProbe probe, String sourceName, Path output, Path sprite,
                                               boolean burnSubtitles, Quality quality) {
    if (!sourceName.matches("[A-Za-z0-9._-]+")) {
      throw new IllegalArgumentException("Unsafe name of the source file");
    }
    Optional<VideoProbe.Stream> video = probe.video();
    if (video.isEmpty()) {
      return Optional.empty();
    }
    Optional<String> thumbnailFilter = sprite == null ? Optional.empty() : thumbnailFilter(probe.duration());
    boolean thumbnails = thumbnailFilter.isPresent();
    Optional<VideoProbe.Stream> subtitle = burnSubtitles ? probe.subtitle() : Optional.empty();

    // the thumbnails are split off before the subtitles are burned in: they are unreadable at that size
    String source = "[0:" + video.get().index() + "]";
    String graph;
    if (subtitle.isPresent() && subtitle.get().isBitmapSubtitle()) {
      String overlay = "[0:" + subtitle.get().index() + "]overlay=eof_action=pass,format=yuv420p[v]";
      graph = thumbnails ? source + "split[main][th];[main]" + overlay : source + overlay;
    } else if (subtitle.isPresent()) {
      // si = index among the subtitle streams; libass also loads the fonts attached to the file
      String subtitles = "subtitles=filename=" + sourceName + ":si=" + subtitle.get().typeIndex() + "[v]";
      graph = source + "format=yuv420p," + (thumbnails ? "split[main][th];[main]" : "") + subtitles;
    } else {
      graph = source + "format=yuv420p" + (thumbnails ? ",split[v][th]" : "[v]");
    }
    if (thumbnails) {
      graph += ";[th]" + thumbnailFilter.get() + "[t]";
    }

    List<String> args = new ArrayList<>(List.of("-y", "-i", sourceName, "-filter_complex", graph, "-map", "[v]",
        "-c:v", "libx264", "-preset", quality.preset(), "-crf", String.valueOf(quality.crf()), "-profile:v", "high"));
    probe.audio().ifPresent(audio -> {
      args.addAll(List.of("-map", "0:" + audio.index()));
      // AAC is copied unchanged, everything else is encoded
      args.addAll(audio.codec().equals("aac") ? List.of("-c:a", "copy") : List.of("-c:a", "aac", "-b:a", "256k"));
    });
    args.addAll(List.of("-map_chapters", "0", "-movflags", "+faststart", output.toString()));
    if (thumbnails) {
      args.addAll(spriteOutput(sprite));
    }
    return Optional.of(args);
  }
}
