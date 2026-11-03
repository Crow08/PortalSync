import { Component, OnDestroy, OnInit, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { Media } from 'src/app/models/media';
import { Song } from 'src/app/models/song';
import { Video } from 'src/app/models/video';
import { Playlist, PlaylistOwner } from 'src/app/models/playlist';
import { User } from 'src/app/models/user';
import { HttpHelperService } from '../../../services/http-helper.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SelectionModel } from '@angular/cdk/collections';
import { Subscription } from 'rxjs';
import { ServerResultErrorSnackBarComponent } from '../../messages/server-result-error-snack-bar.component';
import { MatDialog } from '@angular/material/dialog';
import { AddToPlaylistDialogComponent } from '../../dialog/add-to-playlist-dialog/add-to-playlist-dialog.component';
import { YesNoDialogComponent } from '../../dialog/yes-no-dialog/yes-no-dialog.component';
import { CustomSnackBarComponent } from '../../messages/custom-snack-bar.component';
import { EditSongDialogComponent } from '../../dialog/edit-song-dialog/edit-song-dialog.component';
import { WsService } from 'src/app/services/ws.service';
import { SessionService } from 'src/app/services/session.service';
import { AuthenticationService } from 'src/app/services/authentication.service';

export type TypeFilter = 'all' | 'VIDEO' | 'SONG';
export type SortMode = 'title' | 'recent' | 'playlist';

/** Height (px) of a row of the list, all rows must have this height (virtual scrolling). */
const ROW_HEIGHT = 56;
const TILE_GRADIENTS = [
  'linear-gradient(160deg, #4b3a7a, #f2a078)',
  'linear-gradient(160deg, #2a5e7a, #9fd6d0)',
  'linear-gradient(160deg, #7a3a5e, #ffbe5c)',
  'linear-gradient(160deg, #243b55, #8fa8ff)',
  'linear-gradient(160deg, #355c4a, #c7e39b)',
  'linear-gradient(160deg, #4b3a3a, #e39a6b)',
  'linear-gradient(160deg, #1b2447, #6c5ce7)',
  'linear-gradient(160deg, #5e3a7a, #f59bb0)',
];

/** The media library: search, filter and page through all media, act on one item or on a selection. */
@Component({
    selector: 'app-database-browser',
    templateUrl: './database-browser.component.html',
    styleUrls: ['./database-browser.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class DatabaseBrowserComponent implements OnInit, OnDestroy {
  readonly rowHeight = ROW_HEIGHT;
  @ViewChild(CdkVirtualScrollViewport) viewport: CdkVirtualScrollViewport | undefined;
  isLoadingResults = false;
  loadFailed = false;
  items: Media[] = [];
  playlists: Playlist[] = [];
  /** The playlist whose media are shown, null for all media. */
  activePlaylist: Playlist | null = null;
  /** All users, to choose the owners of a playlist from; loaded when needed. */
  users: User[] = [];
  typeFilter: TypeFilter = 'all';
  sortMode: SortMode = 'title';
  query = '';
  /** The item shown in the detail panel. */
  detail: Media | null = null;
  selection = new SelectionModel<Media>(true, []);
  inSession = false;
  private sessionSubscription: Subscription | null = null;

  constructor(
    private httpHelperService: HttpHelperService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private wsService: WsService,
    private sessionService: SessionService,
    private authenticationService: AuthenticationService
  ) {}

  ngOnInit(): void {
    this.sessionSubscription = this.sessionService.sessionId.subscribe((id) => (this.inSession = !!id));
    this.loadPlaylists();
    this.load();
  }

  ngOnDestroy(): void {
    this.sessionSubscription?.unsubscribe();
  }

  loadPlaylists(): void {
    this.httpHelperService
      .getArray('/api/v1/playlists/all', Playlist)
      .then((playlists) => {
        this.playlists = playlists.sort((a, b) => a.name.localeCompare(b.name));
        // the shown playlist is replaced by its current state (owners), a playlist that is gone is left
        if (this.activePlaylist) {
          const id = this.activePlaylist.id;
          const current = this.playlists.find((playlist) => playlist.id === id);
          current ? (this.activePlaylist = current) : this.selectCollection(null);
        }
      })
      .catch(console.error);
  }

  /** Shows all media (null) or the media of a playlist. */
  selectCollection(playlist: Playlist | null): void {
    this.activePlaylist = playlist;
    this.sortMode = playlist ? 'playlist' : 'title';
    this.query = '';
    this.typeFilter = 'all';
    this.selection.clear();
    this.items = [];
    this.load();
  }

  /** Loads all media or those of the playlist, filtering, sorting and paging happen here. */
  load(): void {
    this.isLoadingResults = true;
    this.loadFailed = false;
    const playlist = this.activePlaylist;
    const request: Promise<Media[]> = playlist
      ? this.httpHelperService.getArray(`/api/v1/playlists/${playlist.id}/media`, Media)
      : this.httpHelperService.getPage('/api/v1/media/all', Media).then((page) => page.content);
    request
      .then((media) => {
        // the answer of a collection that was left meanwhile is dropped
        if (this.activePlaylist?.id !== playlist?.id) {
          return;
        }
        this.items = media;
        // keep the detail panel and the selection on items that still exist
        const byId = new Map(this.items.map((item) => [item.id, item]));
        this.detail = this.detail ? (byId.get(this.detail.id) ?? null) : null;
        const kept = this.selection.selected.filter((item) => byId.has(item.id)).map((item) => byId.get(item.id)!);
        this.selection.clear();
        this.selection.select(...kept);
      })
      .catch((error) => {
        console.error(error);
        this.loadFailed = true;
      })
      .finally(() => (this.isLoadingResults = false));
  }

  /**
   * The items matching search and type, in the chosen order. The list is only rebuilt when one of these changed: the
   * getter runs with every change detection and the library can hold thousands of items.
   */
  get filtered(): Media[] {
    const query = this.query.trim().toLowerCase();
    const key = [this.items, this.typeFilter, this.sortMode, query];
    if (key.some((value, i) => value !== this.filteredKey[i])) {
      this.filteredKey = key;
      const matching = this.items.filter(
        (item) =>
          (this.typeFilter === 'all' || item.type === this.typeFilter) && (!query || this.searchText(item).includes(query))
      );
      switch (this.sortMode) {
        case 'title':
          matching.sort((a, b) => a.title.localeCompare(b.title));
          break;
        case 'recent':
          matching.sort((a, b) => b.id - a.id);
          break;
      }
      this.filteredCache = matching;
    }
    return this.filteredCache;
  }

  private filteredKey: unknown[] = [];
  private filteredCache: Media[] = [];

  trackById(_: number, media: Media): number {
    return media.id;
  }

  /** Called after the search, the type or the sort changed: the list starts at the top again. */
  resetScroll(): void {
    this.viewport?.scrollToIndex(0);
  }

  private searchText(media: Media): string {
    const song = media as Song;
    const video = media as Video;
    const genres = (song.genres ?? []).map((genre) => genre.name);
    return [media.title, song.artist?.name, song.album?.name, video.series?.name, ...genres].join(' ').toLowerCase();
  }

  isVideo(media: Media): boolean {
    return media.type === 'VIDEO';
  }

  /** Artist of a song, series of a video; empty if the media has none. */
  creator(media: Media): string {
    return (this.isVideo(media) ? (media as Video).series?.name : (media as Song).artist?.name) ?? '';
  }

  /** Artist of a song, series of a video. */
  subtitle(media: Media): string {
    return this.isVideo(media) ? ((media as Video).series?.name ?? 'Video') : ((media as Song).artist?.name ?? 'Song');
  }

  gradient(media: Media): string {
    return TILE_GRADIENTS[media.id % TILE_GRADIENTS.length];
  }

  /** The file format shown in the detail panel, e.g. "MP4". */
  format(media: Media): string {
    const extension = media.uri?.split('.').pop();
    return extension && extension !== media.uri ? extension.toUpperCase() : 'Spotify';
  }

  details(media: Media): { label: string; value: string }[] {
    const song = media as Song;
    const video = media as Video;
    const rows: { label: string; value: string }[] = [
      { label: 'Type', value: this.isVideo(media) ? 'Video' : 'Song' },
      { label: 'Format', value: this.format(media) },
    ];
    if (this.isVideo(media)) {
      rows.push({ label: 'Series', value: video.series?.name ?? '' }, { label: 'Season', value: video.season?.name ?? '' });
    } else {
      rows.push(
        { label: 'Artist', value: song.artist?.name ?? '' },
        { label: 'Album', value: song.album?.name ?? '' },
        { label: 'Genres', value: (song.genres ?? []).map((genre) => genre.name).join(', ') }
      );
    }
    rows.push({ label: 'Tags', value: (media.tags ?? []).map((tag) => tag.name).join(', ') });
    return rows.filter((row) => row.value !== '');
  }

  showDetail(media: Media): void {
    this.detail = media;
  }

  toggleSelected(media: Media): void {
    this.selection.toggle(media);
  }

  /** Whether all items of the list (with the search and the type applied) are selected. */
  get allSelected(): boolean {
    return this.filtered.length > 0 && this.filtered.every((item) => this.selection.isSelected(item));
  }

  toggleAll(): void {
    this.allSelected ? this.selection.deselect(...this.filtered) : this.selection.select(...this.filtered);
  }

  openPlaylistDialog(media: Media[]): void {
    const dialogRef = this.dialog.open(AddToPlaylistDialogComponent, {
      width: '440px',
      maxWidth: '92vw',
      data: { songIds: media.map((item) => item.id) },
    });
    dialogRef.afterClosed().subscribe(() => {
      this.loadPlaylists();
      // the playlist that was added to may be the one shown
      this.activePlaylist && this.load();
    });
  }

  openEditSongDialog(song: Media): void {
    const dialogRef = this.dialog.open(EditSongDialogComponent, { width: '520px', maxWidth: '92vw', data: { song } });
    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.load();
      }
    });
  }

  /** Whether the user may add media to the shown playlist and remove media from it: owners, admins, all if it is public. */
  get canEditPlaylist(): boolean {
    return !!this.activePlaylist?.canEdit(this.authenticationService.currentUserValue);
  }

  /** Whether the user may change the owners of the shown playlist and whether it is public: owners and admins. */
  get canManagePlaylist(): boolean {
    return !!this.activePlaylist?.canManage(this.authenticationService.currentUserValue);
  }

  /** The users who are not an owner of the shown playlist yet. */
  get ownerCandidates(): User[] {
    const owners = this.activePlaylist?.owners ?? [];
    return this.users.filter((user) => !owners.some((owner) => owner.id === user.id));
  }

  loadUsers(): void {
    this.httpHelperService
      .getArray('/api/v1/users/all', User)
      .then((users) => (this.users = users.sort((a, b) => a.username.localeCompare(b.username))))
      .catch(console.error);
  }

  addOwner(user: User): void {
    this.changeOwnership((id) => this.httpHelperService.put(`/api/v1/playlists/${id}/owners/${user.id}`, null), 'Owner added');
  }

  removeOwner(owner: PlaylistOwner): void {
    this.changeOwnership((id) => this.httpHelperService.delete(`/api/v1/playlists/${id}/owners/${owner.id}`), 'Owner removed');
  }

  setPublicOwnership(isPublic: boolean): void {
    this.changeOwnership(
      (id) => this.httpHelperService.put(`/api/v1/playlists/${id}/public/${isPublic}`, null),
      isPublic ? 'Everyone can change this playlist now' : 'Only the owners can change this playlist now'
    );
  }

  /** Whether the shown playlist can be deleted: by its owners and admins; id 1 stands for no playlist and stays. */
  get canDeletePlaylist(): boolean {
    return this.canManagePlaylist && (this.activePlaylist?.id ?? 0) > 1;
  }

  /** Deletes the shown playlist after a confirmation. The media stay in the library. */
  deletePlaylist(): void {
    const playlist = this.activePlaylist;
    if (!playlist) {
      return;
    }
    const dialogRef = this.dialog.open(YesNoDialogComponent, {
      width: '420px',
      maxWidth: '92vw',
      data: {
        title: `Delete the playlist "${playlist.name}"? The media stay in the library.`,
        yesButton: 'Delete',
        noButton: 'Keep',
      },
    });
    dialogRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.httpHelperService
        .delete(`/api/v1/playlists/${playlist.id}`)
        .then(() => {
          this.selectCollection(null);
          this.loadPlaylists();
          this.showMessage('Playlist deleted');
        })
        .catch((error) => {
          this.loadPlaylists();
          const forbidden = 'Only an owner or an admin can delete this playlist';
          this.showMessage(error?.status === 403 ? forbidden : 'Deleting the playlist failed');
        });
    });
  }

  /** Changes the owners of the shown playlist or whether it is public, then shows its new state. */
  private changeOwnership(request: (playlistId: number) => Promise<unknown>, message: string): void {
    const playlist = this.activePlaylist;
    if (!playlist) {
      return;
    }
    request(playlist.id)
      .then(() => {
        this.loadPlaylists();
        this.showMessage(message);
      })
      .catch((error) => {
        // the state shown may be outdated
        this.loadPlaylists();
        this.showMessage(
          error?.status === 403
            ? 'Only an owner or an admin can do that'
            : error?.status === 409
              ? 'A playlist needs at least one owner'
              : 'The change failed'
        );
      });
  }

  /** Takes the media out of the shown playlist, they stay in the library. Owners, admins and, if public, everyone may. */
  removeFromPlaylist(media: Media[]): void {
    const playlist = this.activePlaylist;
    if (!playlist) {
      return;
    }
    this.httpHelperService
      // the answer is plain text ("Removed 1 of 1 songs"), not JSON
      .putPlain(`/api/v1/playlists/${playlist.id}/removeSongsFromPlaylist/`, media.map((item) => item.id))
      .then(() => {
        this.selection.clear();
        this.load();
        this.showMessage(media.length === 1 ? 'Removed from the playlist' : `${media.length} removed from the playlist`);
      })
      .catch((error) => {
        const forbidden = 'Only an owner or an admin can change this playlist';
        this.showMessage(error?.status === 403 ? forbidden : 'Removing from the playlist failed');
      });
  }

  deleteSong(media: Media): void {
    this.confirmDelete('Send this item into oblivion?', 'Hell yeah!', 'God, no!', () =>
      this.httpHelperService.put(`/api/v1/media/deleteSongById/${media.id}`, null)
    );
  }

  deleteSongs(mediaList: Media[]): void {
    this.confirmDelete('Delete all selected items?', 'With pleasure!', 'Nah!', () =>
      this.httpHelperService.put(`/api/v1/media/deleteSongs`, mediaList)
    );
  }

  private confirmDelete(title: string, yesButton: string, noButton: string, remove: () => Promise<unknown>): void {
    const dialogRef = this.dialog.open(YesNoDialogComponent, {
      width: '420px',
      maxWidth: '92vw',
      data: { title, yesButton, noButton },
    });
    dialogRef.afterClosed().subscribe((dialogResult) => {
      if (!dialogResult) {
        return;
      }
      remove()
        .then(() => {
          this.selection.clear();
          this.load();
          this.showMessage('Deleted');
        })
        .catch(() => this.snackBar.openFromComponent(ServerResultErrorSnackBarComponent, { duration: 2000 }));
    });
  }

  addMediaToQueue(media: Media): void {
    this.publishWithFeedback(`addMediaToQueue`, JSON.stringify(media), 'Added to the queue');
  }

  addMediaListToQueue(mediaList: Media[]): void {
    this.publishWithFeedback(`addMediaListToQueue`, JSON.stringify(mediaList), 'Added to the queue');
  }

  playMediaNext(media: Media): void {
    this.publishWithFeedback(`playMediaNext`, JSON.stringify(media), 'Playing next');
  }

  playMediaNow(media: Media): void {
    this.publishWithFeedback(`playMediaNow`, JSON.stringify(media), 'Playing now');
  }

  /** Errors are shown app-wide (see AppComponent), so only success needs to be shown here. */
  private publishWithFeedback(command: string, body: string, message: string): void {
    this.wsService.publishSessionCommandWithResult(command, body).then((success) => {
      if (success) {
        this.showMessage(message);
      }
    });
  }

  private showMessage(message: string): void {
    this.snackBar.openFromComponent(CustomSnackBarComponent, { data: { message }, duration: 2000 });
  }
}
