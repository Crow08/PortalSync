import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

export function toneBuffer(): Buffer {
  return readFileSync(TONE_FILE);
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
