package de.crow08.portalsync.utils;

import de.crow08.portalsync.utils.Mp4ChapterReader.Chapter;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class Mp4ChapterReaderTest {

  @TempDir
  Path dir;

  /** An MP4 box: size (with the header), type, content. */
  private static byte[] box(String type, byte[]... contents) throws IOException {
    ByteArrayOutputStream content = new ByteArrayOutputStream();
    for (byte[] part : contents) {
      content.write(part);
    }
    ByteArrayOutputStream box = new ByteArrayOutputStream();
    DataOutputStream out = new DataOutputStream(box);
    out.writeInt(8 + content.size());
    out.write(type.getBytes(StandardCharsets.ISO_8859_1));
    out.write(content.toByteArray());
    return box.toByteArray();
  }

  /** The content of a Nero chapter box as ffmpeg writes it: version 1, start times in units of 100 ns. */
  private static byte[] chpl(Object... startSecondsAndTitle) throws IOException {
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    DataOutputStream out = new DataOutputStream(bytes);
    out.writeInt(0x01000000); // version 1, flags 0
    out.writeInt(0); // reserved
    out.writeByte(startSecondsAndTitle.length / 2);
    for (int i = 0; i < startSecondsAndTitle.length; i += 2) {
      out.writeLong(Math.round(((Number) startSecondsAndTitle[i]).doubleValue() * 10_000_000d));
      byte[] title = ((String) startSecondsAndTitle[i + 1]).getBytes(StandardCharsets.UTF_8);
      out.writeByte(title.length);
      out.write(title);
    }
    return bytes.toByteArray();
  }

  private Path file(byte[]... boxes) throws IOException {
    ByteArrayOutputStream content = new ByteArrayOutputStream();
    for (byte[] box : boxes) {
      content.write(box);
    }
    return Files.write(dir.resolve("video.mp4"), content.toByteArray());
  }

  @Test
  void readsTheChaptersOrderedByTheirStart() throws IOException {
    Path video = file(
        box("ftyp", new byte[12]),
        box("mdat", new byte[100]),
        box("moov",
            box("mvhd", new byte[20]),
            box("udta", box("chpl", chpl(90.5, "Ending", 0, "Opening", 12, "Part one – „Übung“")))));

    assertThat(Mp4ChapterReader.read(video)).containsExactly(
        new Chapter(0, "Opening"),
        new Chapter(12, "Part one – „Übung“"),
        new Chapter(90.5, "Ending"));
  }

  @Test
  void aFileWithoutChaptersHasNone() throws IOException {
    assertThat(Mp4ChapterReader.read(file(box("ftyp", new byte[12]), box("moov", box("mvhd", new byte[20]))))).isEmpty();
    assertThat(Mp4ChapterReader.read(file(box("ftyp", new byte[12]), box("moov", box("udta", box("meta", new byte[4])))))).isEmpty();
    assertThat(Mp4ChapterReader.read(file(box("ftyp", new byte[12])))).isEmpty();
  }

  @Test
  void whatIsNoMp4HasNoChapters() throws IOException {
    assertThat(Mp4ChapterReader.read(Files.write(dir.resolve("empty.mp4"), new byte[0]))).isEmpty();
    assertThat(Mp4ChapterReader.read(Files.writeString(dir.resolve("text.mp4"), "this is not a video at all"))).isEmpty();
  }

  @Test
  void aChapterListThatIsCutOffKeepsTheCompleteChapters() throws IOException {
    byte[] complete = chpl(0, "Opening", 30, "Second");
    byte[] cut = new byte[complete.length - 3];
    System.arraycopy(complete, 0, cut, 0, cut.length);

    assertThat(Mp4ChapterReader.read(file(box("moov", box("udta", box("chpl", cut)))))).containsExactly(new Chapter(0, "Opening"));
  }

  @Test
  void anEmptyChapterBoxHasNoChapters() throws IOException {
    assertThat(Mp4ChapterReader.read(file(box("moov", box("udta", box("chpl", new byte[0])))))).isEmpty();
    assertThat(Mp4ChapterReader.read(file(box("moov", box("udta", box("chpl", chpl())))))).isEmpty();
  }
}
