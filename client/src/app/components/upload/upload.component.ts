import { CdkScrollable } from '@angular/cdk/scrolling';
import { Component, ChangeDetectionStrategy, OnDestroy, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ServerResultSuccessSnackBarComponent } from '../messages/server-result-success-snack-bar.component';
import { ServerResultErrorSnackBarComponent } from '../messages/server-result-error-snack-bar.component';
import { HttpHelperService } from '../../services/http-helper.service';
import { GenericDataObject } from '../../models/genericDataObject';
import { isActive, VideoJob, VideoUploadInfo } from '../../models/video-job';
import { TransferProgress } from '../../models/transfer-progress';

export type UploadMode = 'SONG' | 'VIDEO';

/** How often the jobs of the server are asked for while one is waiting or running. */
const JOB_POLL_INTERVAL = 2000;

/**
 * Uploads songs, with the artist, album, genres, tags and playlists they get, or videos with their series, season,
 * tags and playlists. A video is stored as it is (an MP4 browsers play) or, with the switches, converted by the server
 * first and given the thumbnails of the seek bar; the server does that in jobs, listed here with their progress.
 */
@Component({
    selector: 'app-import',
    templateUrl: './upload.component.html',
    styleUrls: ['./upload.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
    // the page scrolls in this element: dropdowns that are open follow their field
    hostDirectives: [CdkScrollable],
})
export class UploadComponent implements OnInit, OnDestroy {
  mode: UploadMode = 'SONG';
  loading = false;
  /** How far the running upload is and how fast it goes; undefined while nothing is uploaded. */
  progress?: TransferProgress;
  files: File[] = [];
  /** Whether files are dragged over the drop zone. */
  dragOver = false;

  selectedArtist: GenericDataObject[] = [];
  selectedAlbum: GenericDataObject[] = [];
  selectedGenres: GenericDataObject[] = [];
  selectedSeries: GenericDataObject[] = [];
  selectedSeason: GenericDataObject[] = [];
  selectedTags: GenericDataObject[] = [];
  selectedPlaylists: GenericDataObject[] = [];

  /** Whether the server has ffmpeg: without it the switches below are off and disabled. */
  ffmpeg = false;
  /** Convert the videos on the server into MP4 files every browser plays. */
  preprocess = false;
  /** With a conversion: render the subtitles of the file into the picture. */
  burnSubtitles = true;
  /** Let the server create the preview pictures of the seek bar. */
  thumbnails = false;

  /** The conversions and thumbnail runs of the user on the server, also the ones that finished in the last hour. */
  jobs: VideoJob[] = [];
  private jobTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  constructor(private httpHelperService: HttpHelperService, private snackBar: MatSnackBar) {}

  ngOnInit(): void {
    this.httpHelperService
      .get('/api/v1/media/videoUpload/info', VideoUploadInfo)
      .then((info) => {
        this.ffmpeg = info.ffmpeg;
        // both are what one usually wants; they stay off where the server can not do them
        this.preprocess = info.ffmpeg;
        this.thumbnails = info.ffmpeg;
      })
      .catch((error) => console.error(error));
    this.loadJobs();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    clearTimeout(this.jobTimer);
  }

  get isVideo(): boolean {
    return this.mode === 'VIDEO';
  }

  /** The prefix of the texts that differ between songs and videos. */
  get texts(): string {
    return this.isVideo ? 'upload.video.' : 'upload.';
  }

  get totalSize(): number {
    return this.files.reduce((sum, file) => sum + file.size, 0);
  }

  /** Whether a chosen video can not be stored as it is: without the conversion the server only takes MP4 files. */
  get needsMp4(): boolean {
    return this.isVideo && !this.preprocess && this.files.some((file) => !this.isMp4(file));
  }

  get canUpload(): boolean {
    return !this.loading && this.files.length > 0 && !this.needsMp4;
  }

  isMp4(file: File): boolean {
    return file.name.toLowerCase().endsWith('.mp4');
  }

  /** Songs and videos are separate uploads: the chosen files do not move over. */
  setMode(mode: UploadMode): void {
    if (mode !== this.mode) {
      this.mode = mode;
      this.files = [];
    }
  }

  /** Adds the chosen files, a file that is already in the list is not added twice. */
  onFilesSelected(input: HTMLInputElement): void {
    this.addFiles(Array.from(input.files ?? []));
    // the same files can be chosen again after they were removed
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = false;
    this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = true;
  }

  removeFile(file: File): void {
    this.files = this.files.filter((candidate) => candidate !== file);
  }

  formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;
  }

  /** The time an upload still takes, like "1:05" or "2:03:04"; empty while it can not be told. */
  formatRemaining(seconds: number | undefined): string {
    if (seconds === undefined) {
      return '';
    }
    const two = (value: number) => String(value).padStart(2, '0');
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds % 60)}` : `${minutes}:${two(seconds % 60)}`;
  }

  percent(job: VideoJob): number {
    return Math.round(job.progress * 100);
  }

  upload(): void {
    if (!this.canUpload) {
      return;
    }

    this.loading = true;
    const progress = new TransferProgress();
    this.progress = progress;

    const first = (values: GenericDataObject[]) => values.map((value) => value.id)[0];
    const ids = (values: GenericDataObject[]) => values.map((value) => value.id);
    const formData: FormData = new FormData();
    this.files.forEach((file) => formData.append('files', file, file.name));
    const data = this.isVideo
      ? {
          seriesId: first(this.selectedSeries),
          seasonId: first(this.selectedSeason),
          playlists: ids(this.selectedPlaylists),
          tags: ids(this.selectedTags),
          preprocess: this.ffmpeg && this.preprocess,
          burnSubtitles: this.burnSubtitles,
          thumbnails: this.ffmpeg && this.thumbnails,
        }
      : {
          artistId: first(this.selectedArtist),
          albumId: first(this.selectedAlbum),
          playlists: ids(this.selectedPlaylists),
          genres: ids(this.selectedGenres),
          tags: ids(this.selectedTags),
        };
    formData.append('data', JSON.stringify(data));

    this.httpHelperService
      .postWithProgress(this.isVideo ? '/api/v1/media/videoUpload' : '/api/v1/media/upload/', formData, (loaded, total) =>
        progress.update(loaded, total, Date.now())
      )
      .then(() => {
        this.loading = false;
        this.progress = undefined;
        this.files = [];
        this.snackBar.openFromComponent(ServerResultSuccessSnackBarComponent, {
          duration: 2000,
        });
        if (this.isVideo) {
          this.loadJobs();
        }
      })
      .catch((error) => {
        this.loading = false;
        this.progress = undefined;
        this.snackBar.openFromComponent(ServerResultErrorSnackBarComponent, {
          duration: 2000,
        });
        console.error(error);
        // of several videos the ones before the failed one are stored, and their jobs run
        if (this.isVideo) {
          this.loadJobs();
        }
      });
  }

  /** Loads the jobs, and again after a while as long as one of them is not finished. */
  private loadJobs(): void {
    clearTimeout(this.jobTimer);
    this.httpHelperService
      .getArray('/api/v1/media/videoUpload/jobs', VideoJob)
      .then((jobs) => {
        this.jobs = jobs;
        if (!this.destroyed && jobs.some(isActive)) {
          this.jobTimer = setTimeout(() => this.loadJobs(), JOB_POLL_INTERVAL);
        }
      })
      .catch((error) => console.error(error));
  }

  private addFiles(added: File[]): void {
    const same = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
    const isNew = (file: File) => !this.files.some((known) => same(known, file));
    this.files = [...this.files, ...added.filter(isNew)];
  }
}
