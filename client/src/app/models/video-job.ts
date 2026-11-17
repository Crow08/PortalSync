export type VideoJobKind = 'CONVERT' | 'THUMBNAILS';
export type VideoJobState = 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';

/** One ffmpeg run of the server for an uploaded video (server: VideoJob): a conversion or only its thumbnails. */
export class VideoJob {
  id = 0;
  /** The title of the video. */
  title = '';
  kind: VideoJobKind = 'CONVERT';
  state: VideoJobState = 'QUEUED';
  /** From 0 to 1; stays 0 while running if the server does not know the length of the video. */
  progress = 0;
}

/** What the server can do with uploaded videos: without ffmpeg it stores them as they are. */
export class VideoUploadInfo {
  ffmpeg = false;
}

export function isActive(job: VideoJob): boolean {
  return job.state === 'QUEUED' || job.state === 'RUNNING';
}
