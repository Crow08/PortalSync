import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ServerResultSuccessSnackBarComponent } from '../messages/server-result-success-snack-bar.component';
import { ServerResultErrorSnackBarComponent } from '../messages/server-result-error-snack-bar.component';
import { HttpHelperService } from '../../services/http-helper.service';
import { GenericDataObject } from '../../models/genericDataObject';

/** Uploads songs, with the artist, album, genres, tags and playlists they get. */
@Component({
    selector: 'app-import',
    templateUrl: './upload.component.html',
    styleUrls: ['./upload.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class UploadComponent {
  loading = false;
  files: File[] = [];
  /** Whether files are dragged over the drop zone. */
  dragOver = false;

  selectedArtist: GenericDataObject[] = [];
  selectedAlbum: GenericDataObject[] = [];
  selectedGenres: GenericDataObject[] = [];
  selectedTags: GenericDataObject[] = [];
  selectedPlaylists: GenericDataObject[] = [];

  constructor(private httpHelperService: HttpHelperService, private snackBar: MatSnackBar) {}

  get totalSize(): number {
    return this.files.reduce((sum, file) => sum + file.size, 0);
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
    return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;
  }

  upload(): void {
    if (this.files.length === 0) {
      return;
    }

    this.loading = true;

    const formData: FormData = new FormData();
    this.files.forEach((file) => formData.append('files', file, file.name));
    formData.append(
      'data',
      JSON.stringify({
        artistId: this.selectedArtist.map((value) => value.id)[0],
        albumId: this.selectedAlbum.map((value) => value.id)[0],
        playlists: this.selectedPlaylists.map((value) => value.id),
        genres: this.selectedGenres.map((value) => value.id),
        tags: this.selectedTags.map((value) => value.id),
      })
    );

    this.httpHelperService
      .post('/api/v1/media/upload/', formData)
      .then(() => {
        this.loading = false;
        this.files = [];
        this.snackBar.openFromComponent(ServerResultSuccessSnackBarComponent, {
          duration: 2000,
        });
      })
      .catch((error) => {
        this.loading = false;
        this.snackBar.openFromComponent(ServerResultErrorSnackBarComponent, {
          duration: 2000,
        });
        console.error(error);
      });
  }

  private addFiles(added: File[]): void {
    const same = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
    const isNew = (file: File) => !this.files.some((known) => same(known, file));
    this.files = [...this.files, ...added.filter(isNew)];
  }
}
