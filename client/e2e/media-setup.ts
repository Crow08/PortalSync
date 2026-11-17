import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MEDIA_DIR, SOURCE_DIR } from './env';

function ffmpeg(args: string[]): void {
  try {
    execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
  } catch (e) {
    throw new Error(`ffmpeg is required for the e2e media fixtures (https://ffmpeg.org): ${(e as Error).message}`);
  }
}

export const TONE_FILE = join(SOURCE_DIR, 'tone.mp3');
export const VIDEO_TITLE = 'e2e-shared-video';
export const VIDEO_URI = '/videos/e2e-shared-video.mp4';
export const SHARED_SONGS = ['e2e-shared-song-a.mp3', 'e2e-shared-song-b.mp3', 'e2e-shared-song-c.mp3'];

/** A video no browser plays as it is (MKV, MPEG-4 Part 2, MP3) with a subtitle track: the source of a conversion. */
export const VIDEO_SOURCE_FILE = join(SOURCE_DIR, 'source.mkv');

export function toneBuffer(): Buffer {
  return readFileSync(TONE_FILE);
}

/** The shared video: a small MP4 the browsers play, for uploads that store a video as it is. */
export function videoBuffer(): Buffer {
  return readFileSync(join(MEDIA_DIR, VIDEO_URI));
}

export function videoSourceBuffer(): Buffer {
  return readFileSync(VIDEO_SOURCE_FILE);
}

/**
 * What the uploads of videos need, also with a stack that is reused: the 6 s source of the conversions, and a videos
 * directory the app in the container may write to (it creates videos/uploaded there; on Linux a bind mount keeps the
 * owner and mode of the host, see the global setup).
 */
export function prepareVideoUploads(): void {
  mkdirSync(SOURCE_DIR, { recursive: true });
  mkdirSync(join(MEDIA_DIR, 'videos'), { recursive: true });
  chmodSync(join(MEDIA_DIR, 'videos'), 0o777);
  if (existsSync(VIDEO_SOURCE_FILE)) {
    return;
  }
  const subtitles = join(SOURCE_DIR, 'source.srt');
  writeFileSync(subtitles, '1\n00:00:00,500 --> 00:00:05,000\nHello\n');
  ffmpeg([
    '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=10:duration=6',
    '-f', 'lavfi', '-i', 'sine=frequency=330:duration=6',
    '-i', subtitles,
    '-map', '0:v', '-map', '1:a', '-map', '2:s', '-c:v', 'mpeg4', '-c:a', 'libmp3lame', '-c:s', 'srt',
    VIDEO_SOURCE_FILE,
  ]);
}

/** Generates a 60 s tone and a 30 s fast-start video with two chapters and a thumbnail sprite (160x90, one tile per 2 s). */
export function generateMediaFiles(): void {
  mkdirSync(SOURCE_DIR, { recursive: true });
  mkdirSync(join(MEDIA_DIR, 'videos'), { recursive: true });

  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=60', '-q:a', '9', TONE_FILE]);

  const chapters = join(SOURCE_DIR, 'chapters.ffmeta');
  writeFileSync(
    chapters,
    [
      ';FFMETADATA1',
      '[CHAPTER]',
      'TIMEBASE=1/1000',
      'START=0',
      'END=15000',
      'title=Intro',
      '[CHAPTER]',
      'TIMEBASE=1/1000',
      'START=15000',
      'END=30000',
      'title=Second',
      '',
    ].join('\n')
  );
  const video = join(MEDIA_DIR, VIDEO_URI);
  ffmpeg([
    '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=30',
    '-f', 'lavfi', '-i', 'sine=frequency=330:duration=30',
    '-i', chapters,
    '-map', '0:v', '-map', '1:a', '-map_chapters', '2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', '-shortest',
    video,
  ]);
  ffmpeg(['-i', video, '-vf', 'fps=1/2,scale=160:90,tile=10x2', '-frames:v', '1', video.replace(/\.mp4$/, '.thumbs.jpg')]);
}
