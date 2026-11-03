import { Component, Inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { HttpHelperService } from '../../../services/http-helper.service';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ServerResultSuccessSnackBarComponent } from '../../messages/server-result-success-snack-bar.component';
import { CustomSnackBarComponent } from '../../messages/custom-snack-bar.component';
import { HttpCodeMessageGenerator } from '../../messages/http-code-message-generator';
import { AuthenticationService } from '../../../services/authentication.service';
import { Playlist } from '../../../models/playlist';

/** Adds the given songs to a playlist the user may change: one of the list, or a new one. */
@Component({
    selector: 'app-add-to-playlist-dialog',
    templateUrl: './add-to-playlist-dialog.component.html',
    styleUrls: ['./add-to-playlist-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AddToPlaylistDialogComponent implements OnInit {
  songIds: number[] = [];
  /** The playlists the user may change, the others are read only. */
  playlists: Playlist[] = [];
  selected: Playlist | null = null;
  filter = '';
  newName = '';
  loaded = false;
  busy = false;

  constructor(
    private httpHelperService: HttpHelperService,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<AddToPlaylistDialogComponent>,
    private messageHandler: HttpCodeMessageGenerator,
    private authenticationService: AuthenticationService,
    @Inject(MAT_DIALOG_DATA) public data: { songIds: number[] }
  ) {}

  ngOnInit(): void {
    this.songIds = this.data.songIds;
    this.httpHelperService
      .getArray('/api/v1/playlists/all', Playlist)
      .then((playlists) => {
        const user = this.authenticationService.currentUserValue;
        // playlist 1 stands for no playlist
        this.playlists = playlists
          .filter((playlist) => playlist.id > 1 && playlist.canEdit(user))
          .sort((a, b) => a.name.localeCompare(b.name));
      })
      .catch((error) => {
        console.error(error);
        this.snackBar.openFromComponent(CustomSnackBarComponent, {
          data: { message: 'The playlists could not be loaded' },
          duration: 3000,
        });
      })
      .finally(() => (this.loaded = true));
  }

  get visiblePlaylists(): Playlist[] {
    const filter = this.filter.trim().toLowerCase();
    return filter ? this.playlists.filter((playlist) => playlist.name.toLowerCase().includes(filter)) : this.playlists;
  }

  get itemsLabel(): string {
    return this.songIds.length === 1 ? '1 item' : `${this.songIds.length} items`;
  }

  select(playlist: Playlist): void {
    this.selected = playlist;
  }

  /** Creates a playlist with the name, which makes the user its owner, and selects it. */
  createPlaylist(): void {
    const name = this.newName.trim();
    if (!name || this.busy) {
      return;
    }
    this.busy = true;
    this.httpHelperService
      .post<number>('/api/v1/playlists/', name)
      .then((id) => {
        const user = this.authenticationService.currentUserValue;
        const playlist = new Playlist(Number(id), name);
        playlist.owners = user ? [{ id: user.id, username: user.username }] : [];
        this.playlists = [...this.playlists, playlist].sort((a, b) => a.name.localeCompare(b.name));
        this.newName = '';
        this.filter = '';
        this.selected = playlist;
      })
      .catch((error) => {
        console.error(error);
        this.snackBar.openFromComponent(CustomSnackBarComponent, {
          data: { message: 'Creating the playlist failed' },
          duration: 3000,
        });
      })
      .finally(() => (this.busy = false));
  }

  add(): void {
    if (!this.selected || this.busy) {
      return;
    }
    this.busy = true;
    const playlistId = this.selected.id;
    const request =
      this.songIds.length === 1
        ? this.addSongToPlaylist(this.songIds[0], playlistId)
        : this.addSongsToPlaylist(this.songIds, playlistId);
    request.finally(() => (this.busy = false));
  }

  private addSongToPlaylist(songId: number, playlistId: number): Promise<void> {
    return this.httpHelperService
      .put(`/api/v1/playlists/${playlistId}/addSongToPlaylist/${songId}`, null)
      .then(() => {
        this.snackBar.openFromComponent(ServerResultSuccessSnackBarComponent, { duration: 2000 });
        this.dialogRef.close(true);
      })
      .catch((e) => this.showError(e.status, 'Duplicate Song! Try for more variety!'));
  }

  private addSongsToPlaylist(songIds: number[], playlistId: number): Promise<void> {
    return this.httpHelperService
      .putPlain(`/api/v1/playlists/${playlistId}/addSongsToPlaylist/`, songIds)
      .then((result) => {
        this.messageHandler.customMessage(result);
        this.dialogRef.close(true);
      })
      .catch((e) => this.showError(e.status, 'All selected songs are already in the playlist!'));
  }

  private showError(status: number, conflictMessage: string): void {
    if (status === 403) {
      this.snackBar.openFromComponent(CustomSnackBarComponent, {
        data: { message: 'Only an owner or an admin can change this playlist' },
        duration: 3000,
      });
      return;
    }
    this.messageHandler.calculateReturnCodeMessage(status, { e409: conflictMessage, e404: 'Playlist not found!' });
  }
}
