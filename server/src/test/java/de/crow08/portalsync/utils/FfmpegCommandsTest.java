package de.crow08.portalsync.utils;

import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** What ffprobe reports, which streams a conversion takes from it, and the ffmpeg arguments that follow. */
class FfmpegCommandsTest {

  private static final FfmpegCommands.Quality QUALITY = new FfmpegCommands.Quality("medium", 20);
  private static final Path OUT = Path.of("out.mp4");
  private static final Path SPRITE = Path.of("out.thumbs.jpg");

  private static String stream(String type, String codec, String more) {
    return "{\"codec_type\":\"" + type + "\",\"codec_name\":\"" + codec + "\"" + (more.isEmpty() ? "" : "," + more) + "}";
  }

  /** ffprobe numbers the streams in the order of the file. */
  private static VideoProbe probe(String duration, String... streams) {
    StringBuilder json = new StringBuilder("{\"streams\":[");
    for (int i = 0; i < streams.length; i++) {
      json.append(i == 0 ? "" : ",").append("{\"index\":").append(i).append(',').append(streams[i].substring(1));
    }
    return VideoProbe.parse(json + "],\"format\":{\"duration\":\"" + duration + "\"}}");
  }

  private static String graph(List<String> args) {
    return args.get(args.indexOf("-filter_complex") + 1);
  }

  @Test
  void theProbeReadsLengthAndStreams() {
    VideoProbe probe = probe("61.5",
        stream("video", "mjpeg", "\"disposition\":{\"attached_pic\":1}"),
        stream("video", "hevc", ""),
        stream("audio", "opus", "\"tags\":{\"language\":\"jpn\"}"),
        stream("audio", "aac", "\"disposition\":{\"default\":1}"),
        stream("subtitle", "ass", "\"disposition\":{\"forced\":1,\"default\":1}"),
        stream("subtitle", "ass", "\"tags\":{\"language\":\"ger\"}"));

    assertThat(probe.duration()).isEqualTo(61.5);
    assertThat(probe.streams()).hasSize(6);
    // the cover picture is no video; the default audio wins; full subtitles before forced ones
    assertThat(probe.video().orElseThrow().index()).isEqualTo(1);
    assertThat(probe.audio().orElseThrow().index()).isEqualTo(3);
    assertThat(probe.streams().get(2).language()).isEqualTo("jpn");
    assertThat(probe.subtitle().orElseThrow().index()).isEqualTo(5);
    assertThat(probe.subtitle().orElseThrow().typeIndex()).isEqualTo(1);
  }

  @Test
  void aProbeWithoutFormatOrStreamsIsEmpty() {
    VideoProbe probe = VideoProbe.parse("{}");

    assertThat(probe.duration()).isZero();
    assertThat(probe.video()).isEmpty();
    assertThat(VideoProbe.parse("{\"format\":{\"duration\":\"N/A\"}}").duration()).isZero();
  }

  @Test
  void theSpriteHasOneTileEveryTwoSecondsInRowsOfTen() {
    assertThat(FfmpegCommands.thumbnailFilter(30).orElseThrow()).startsWith("fps=1/2,scale=160:90:").endsWith("tile=10x2");
    assertThat(FfmpegCommands.thumbnailFilter(1).orElseThrow()).endsWith("tile=10x1");
    assertThat(FfmpegCommands.thumbnailFilter(19.9).orElseThrow()).endsWith("tile=10x1");
    assertThat(FfmpegCommands.thumbnailFilter(20).orElseThrow()).endsWith("tile=10x2");
  }

  @Test
  void noSpriteWithoutALengthOrForAVideoTooLongForOnePicture() {
    assertThat(FfmpegCommands.thumbnailFilter(0)).isEmpty();
    // 727 rows of 90 pixels still fit into a JPEG, 728 do not
    assertThat(FfmpegCommands.thumbnailFilter(727 * 20 - 1)).isPresent();
    assertThat(FfmpegCommands.thumbnailFilter(727 * 20)).isEmpty();
  }

  @Test
  void aPlainConversionEncodesVideoAndAudioAndKeepsTheChapters() {
    VideoProbe probe = probe("30", stream("video", "hevc", ""), stream("audio", "opus", ""));

    List<String> args = FfmpegCommands.convert(probe, "in.mkv", OUT, null, true, QUALITY).orElseThrow();

    assertThat(graph(args)).isEqualTo("[0:0]format=yuv420p[v]");
    assertThat(args).containsSubsequence("-i", "in.mkv", "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-map", "0:1", "-c:a", "aac", "-map_chapters", "0", "-movflags", "+faststart", "out.mp4");
    assertThat(args).doesNotContain("[t]");
    assertThat(args.get(args.size() - 1)).isEqualTo("out.mp4");
  }

  @Test
  void aacAudioIsCopiedAndAVideoWithoutAudioHasNone() {
    List<String> copied = FfmpegCommands
        .convert(probe("30", stream("video", "h264", ""), stream("audio", "aac", "")), "in.mp4", OUT, null, false, QUALITY)
        .orElseThrow();
    assertThat(copied).containsSubsequence("-map", "0:1", "-c:a", "copy");

    List<String> silent = FfmpegCommands.convert(probe("30", stream("video", "h264", "")), "in.mp4", OUT, null, false, QUALITY)
        .orElseThrow();
    assertThat(silent).doesNotContain("-c:a");
  }

  @Test
  void textSubtitlesAreRenderedAfterTheThumbnailsAreSplitOff() {
    VideoProbe probe = probe("30", stream("video", "hevc", ""), stream("audio", "aac", ""), stream("subtitle", "ass", ""));

    List<String> args = FfmpegCommands.convert(probe, "in.mkv", OUT, SPRITE, true, QUALITY).orElseThrow();

    assertThat(graph(args)).startsWith("[0:0]format=yuv420p,split[main][th];[main]subtitles=filename=in.mkv:si=0[v];[th]fps=1/2,")
        .endsWith("tile=10x2[t]");
    assertThat(args).containsSubsequence("out.mp4", "-map", "[t]", "-frames:v", "1");
    assertThat(args.get(args.size() - 1)).isEqualTo("out.thumbs.jpg");
  }

  @Test
  void pictureSubtitlesAreLaidOver() {
    VideoProbe probe = probe("30", stream("video", "hevc", ""), stream("subtitle", "hdmv_pgs_subtitle", ""));

    assertThat(graph(FfmpegCommands.convert(probe, "in.mkv", OUT, null, true, QUALITY).orElseThrow()))
        .isEqualTo("[0:0][0:1]overlay=eof_action=pass,format=yuv420p[v]");
    assertThat(graph(FfmpegCommands.convert(probe, "in.mkv", OUT, SPRITE, true, QUALITY).orElseThrow()))
        .startsWith("[0:0]split[main][th];[main][0:1]overlay=eof_action=pass,format=yuv420p[v];[th]");
  }

  @Test
  void subtitlesStayOutWhenTheyAreNotWanted() {
    VideoProbe probe = probe("30", stream("video", "hevc", ""), stream("subtitle", "ass", ""));

    assertThat(graph(FfmpegCommands.convert(probe, "in.mkv", OUT, SPRITE, false, QUALITY).orElseThrow()))
        .startsWith("[0:0]format=yuv420p,split[v][th];[th]");
  }

  @Test
  void aFileWithoutVideoIsNotConverted() {
    VideoProbe probe = probe("30", stream("audio", "aac", ""));

    assertThat(FfmpegCommands.convert(probe, "in.mp3", OUT, SPRITE, true, QUALITY)).isEmpty();
    assertThat(FfmpegCommands.thumbnails(probe, Path.of("in.mp3"), SPRITE)).isEmpty();
  }

  @Test
  void theNameOfTheSourceMustBeHarmlessInAFilter() {
    VideoProbe probe = probe("30", stream("video", "hevc", ""));

    for (String name : List.of("a b.mkv", "a'b.mkv", "a:b.mkv", "dir/a.mkv", "a,b.mkv", "")) {
      assertThatThrownBy(() -> FfmpegCommands.convert(probe, name, OUT, null, true, QUALITY))
          .isInstanceOf(IllegalArgumentException.class);
    }
  }

  @Test
  void thumbnailsAloneTakeTheVideoStream() {
    VideoProbe probe = probe("30", stream("audio", "aac", ""), stream("video", "h264", ""));

    List<String> args = FfmpegCommands.thumbnails(probe, Path.of("film.mp4"), SPRITE).orElseThrow();

    assertThat(graph(args)).startsWith("[0:1]fps=1/2,").endsWith("tile=10x2[t]");
    assertThat(args).containsSubsequence("-i", "film.mp4", "-map", "[t]", "-frames:v", "1", "-update", "1", "out.thumbs.jpg");
  }
}
