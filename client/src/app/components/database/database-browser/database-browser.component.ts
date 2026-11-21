import { Component, OnDestroy, OnInit, ViewChild, ChangeDetectionStrategy, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
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
import { GenericDataObject } from 'src/app/models/genericDataObject';
import { WsService } from 'src/app/services/ws.service';
import { SessionService } from 'src/app/services/session.service';
import { AuthenticationService } from 'src/app/services/authentication.service';
import { coverUrl, hideCover, showCover } from 'src/app/utils/cover';
import { isReleaseDate, releaseDateOf, toReleaseDate } from 'src/app/utils/release-date';

export type TypeFilter = 'all' | 'VIDEO' | 'SONG';

/**
 * What the detail panel shows in its edit mode: the fields of the media being edited. The pickers work with lists, a
 * single choice (artist, album, series, season) is a list of at most one entry.
 */
export interface MediaEdit {
  media: Media;
  title: string;
  /** The release date of a song as it is typed, empty for none. */
  releaseDate: string;
  /** The release date of the album the song had when the edit began, as it is typed. */
  albumReleaseDate: string;
  artist: GenericDataObject[];
  album: GenericDataObject[];
  genres: GenericDataObject[];
  series: GenericDataObject[];
  season: GenericDataObject[];
  tags: GenericDataObject[];
}

const toOptions = (entities: { id: number; name: string }[] | null | undefined): GenericDataObject[] =>
  (entities ?? []).filter((entity) => !!entity).map((entity) => new GenericDataObject(entity.id, entity.name));
export type SortMode = 'title' | 'recent' | 'released' | 'playlist';

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
  protected readonly tl = inject(TranslocoService);
  readonly rowHeight = ROW_HEIGHT;
  @ViewChild(CdkVirtualScrollViewport) viewport: CdkVirtualScrollViewport | undefined;
  isLoadingResults = false;
  loadFailed = false;
  items: Media[] = [];
  playlists: Playlist[] = [];
  /** The playlist whose media are shown, null for all media. */
  activePlaylist: Playlist | null = null;
  /** All users: to show who owns a media and to choose the owners of a playlist from. */
  users: User[] = [];
  private userNames = new Map<number, string>();
  typeFilter: TypeFilter = 'all';
  /** Only the media the logged in user owns are listed. */
  onlyOwnMedia = false;
  /** Only the playlists the logged in user owns are listed. */
  onlyOwnPlaylists = false;
  sortMode: SortMode = 'title';
  query = '';
  /** The item shown in the detail panel. */
  detail: Media | null = null;
  /** The detail panel is in its edit mode for this media, null while it only shows the media. */
  edit: MediaEdit | null = null;
  /** The changes are being saved. */
  saving = false;
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
    this.loadUsers();
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

  /** The playlists listed in the side bar: all of them, or only those the logged in user is an owner of. */
  get shownPlaylists(): Playlist[] {
    const user = this.authenticationService.currentUserValue;
    return this.onlyOwnPlaylists ? this.playlists.filter((playlist) => !!user && playlist.isOwnedBy(user)) : this.playlists;
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
    const key = [this.items, this.typeFilter, this.sortMode, query, this.onlyOwnMedia];
    if (key.some((value, i) => value !== this.filteredKey[i])) {
      this.filteredKey = key;
      const matching = this.items.filter(
        (item) =>
          (this.typeFilter === 'all' || item.type === this.typeFilter) &&
          (!this.onlyOwnMedia || this.isOwn(item)) &&
          (!query || this.searchText(item).includes(query))
      );
      switch (this.sortMode) {
        case 'title':
          matching.sort((a, b) => a.title.localeCompare(b.title));
          break;
        case 'recent':
          matching.sort((a, b) => b.id - a.id);
          break;
        case 'released':
          // the newest first; what has no date (also all videos) comes last, by title
          matching.sort(
            (a, b) => this.released(b).localeCompare(this.released(a)) || a.title.localeCompare(b.title)
          );
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

  /**
   * The name of the owner of the media (who uploaded or imported it). Empty for a media without an owner, and as long
   * as the users are not loaded.
   */
  ownerName(media: Media): string {
    return media.ownerId != null ? (this.userNames.get(media.ownerId) ?? '') : '';
  }

  /** Whether the media belongs to the logged in user. */
  isOwn(media: Media): boolean {
    return media.ownerId != null && media.ownerId === this.authenticationService.currentUserValue?.id;
  }

  /** Artist of a song, series of a video. */
  subtitle(media: Media): string {
    return this.isVideo(media) ? ((media as Video).series?.name ?? this.tl.translate('common.video'))
      : ((media as Song).artist?.name ?? this.tl.translate('common.song'));
  }

  /** The picture of the media, null if it has none: the gradient with the icon stays. */
  coverUrl(media: Media): string | null {
    return coverUrl(media);
  }

  readonly hideCover = hideCover;
  readonly showCover = showCover;

  gradient(media: Media): string {
    return TILE_GRADIENTS[media.id % TILE_GRADIENTS.length];
  }

  /** The file format shown in the detail panel, e.g. "MP4". */
  format(media: Media): string {
    const extension = media.uri?.split('.').pop();
    return extension && extension !== media.uri ? extension.toUpperCase() : this.tl.translate('library.details.spotify');
  }

  /** The rows of the detail panel; the labels are translation keys. */
  details(media: Media): { label: string; value: string }[] {
    const song = media as Song;
    const video = media as Video;
    const rows: { label: string; value: string }[] = [
      { label: 'library.details.type', value: this.tl.translate(this.isVideo(media) ? 'common.video' : 'common.song') },
      { label: 'library.details.format', value: this.format(media) },
    ];
    if (this.isVideo(media)) {
      rows.push(
        { label: 'library.details.series', value: video.series?.name ?? '' },
        { label: 'library.details.season', value: video.season?.name ?? '' }
      );
    } else {
      rows.push(
        { label: 'common.artist', value: song.artist?.name ?? '' },
        { label: 'common.album', value: song.album?.name ?? '' },
        { label: 'library.details.released', value: releaseDateOf(song) },
        { label: 'common.genres', value: (song.genres ?? []).map((genre) => genre.name).join(', ') }
      );
    }
    rows.push({ label: 'common.tags', value: (media.tags ?? []).map((tag) => tag.name).join(', ') });
    rows.push({ label: 'library.details.owner', value: this.ownerDetail(media) });
    return rows.filter((row) => row.value !== '');
  }

  /** Who owns the media, as the detail panel says it; a media without an owner can only be changed by admins. */
  private ownerDetail(media: Media): string {
    if (media.ownerId == null) {
      return this.tl.translate('library.details.noOwner');
    }
    const name = this.ownerName(media);
    return name && this.isOwn(media) ? this.tl.translate('library.details.ownerYou', { name }) : name;
  }

  showDetail(media: Media): void {
    if (this.detail?.id !== media.id) {
      // another media: the changes of the one being edited are dropped
      this.edit = null;
    }
    this.detail = media;
  }

  /** Switches the detail panel into its edit mode for the media. */
  startEdit(media: Media): void {
    const song = media as Song;
    const video = media as Video;
    this.edit = {
      media,
      title: media.title,
      releaseDate: song.releaseDate ?? '',
      albumReleaseDate: song.album?.releaseDate ?? '',
      artist: toOptions([song.artist]),
      album: toOptions([song.album]),
      genres: toOptions(song.genres),
      series: toOptions([video.series]),
      season: toOptions([video.season]),
      tags: toOptions(media.tags),
    };
  }

  cancelEdit(): void {
    this.edit = null;
  }

  /** A media needs a title, and a release date has to be one. */
  get canSaveEdit(): boolean {
    const edit = this.edit;
    return (
      !!edit &&
      edit.title.trim() !== '' &&
      isReleaseDate(edit.releaseDate) &&
      (!this.editsAlbumDate || isReleaseDate(edit.albumReleaseDate)) &&
      !this.saving
    );
  }

  /** Whether the text is a release date (an empty one is none), for the hints of the edit mode. */
  isReleaseDate(text: string): boolean {
    return isReleaseDate(text);
  }

  /**
   * Whether the edit mode offers the release date of the album: for the album the song had when the edit began (the
   * date of another album chosen there is not known here), not for the fallback "Unknown Album" (id 1).
   */
  get editsAlbumDate(): boolean {
    const edit = this.edit;
    const album = edit && !this.isVideo(edit.media) ? (edit.media as Song).album : null;
    return !!album && album.id !== 1 && edit?.album[0]?.id === album.id;
  }

  /** The release date of a media as the list sorts by it, empty for none. */
  private released(media: Media): string {
    return this.isVideo(media) ? '' : releaseDateOf(media as Song);
  }

  /** Saves the changes of the edit mode and shows the media as it is now. */
  saveEdit(): void {
    const edit = this.edit;
    if (!edit || !this.canSaveEdit) {
      return;
    }
    const title = edit.title.trim();
    const request = this.isVideo(edit.media)
      ? this.httpHelperService.put('/api/v1/media/editVideo', {
          id: edit.media.id,
          title,
          seriesId: edit.series[0]?.id ?? null,
          seasonId: edit.season[0]?.id ?? null,
          tagIds: edit.tags.map((tag) => tag.id),
        })
      : this.httpHelperService.put('/api/v1/media/editSong', {
          id: edit.media.id,
          type: 'SONG',
          title,
          releaseDate: toReleaseDate(edit.releaseDate),
          artist: edit.artist[0] ?? null,
          album: edit.album[0] ?? null,
          genres: edit.genres,
          tags: edit.tags,
        });
    // the date of the album is a property of the album, shared by its songs: it has its own request
    const albumDate = toReleaseDate(edit.albumReleaseDate);
    const album = (edit.media as Song).album;
    const saveAlbum = this.editsAlbumDate && albumDate !== (album?.releaseDate ?? null);
    this.saving = true;
    request
      .then(() =>
        saveAlbum
          ? this.httpHelperService.put(`/api/v1/albums/${album.id}/releaseDate`, { releaseDate: albumDate })
          : undefined
      )
      .then(() => {
        this.edit = null;
        this.load();
        this.showMessage('library.edit.saved');
      })
      .catch((error) => {
        this.showMessage(error?.status === 403 ? 'library.changeForbidden' : 'library.edit.failed');
      })
      .finally(() => (this.saving = false));
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

  /** Whether the user may add media to the shown playlist and remove media from it: owners, admins, all if it is public. */
  get canEditPlaylist(): boolean {
    return !!this.activePlaylist?.canEdit(this.authenticationService.currentUserValue);
  }

  /** Whether the user may edit and delete the media: its owner and admins, the server checks that as well. */
  canChangeMedia(media: Media): boolean {
    const user = this.authenticationService.currentUserValue;
    return !!user && (user.admin || (media.ownerId != null && media.ownerId === user.id));
  }

  /** Whether the user may delete all of the media, e.g. the selection. */
  canChangeAll(mediaList: Media[]): boolean {
    return mediaList.every((media) => this.canChangeMedia(media));
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
      .then((users) => {
        this.users = users.sort((a, b) => a.username.localeCompare(b.username));
        this.userNames = new Map(users.map((user) => [user.id, user.username]));
      })
      .catch(console.error);
  }

  addOwner(user: User): void {
    this.changeOwnership(
      (id) => this.httpHelperService.put(`/api/v1/playlists/${id}/owners/${user.id}`, null),
      'library.ownerAdded'
    );
  }

  removeOwner(owner: PlaylistOwner): void {
    this.changeOwnership(
      (id) => this.httpHelperService.delete(`/api/v1/playlists/${id}/owners/${owner.id}`),
      'library.ownerRemoved'
    );
  }

  setPublicOwnership(isPublic: boolean): void {
    // choosing the current setting in the menu changes nothing
    if (this.activePlaylist?.publicOwnership === isPublic) {
      return;
    }
    this.changeOwnership(
      (id) => this.httpHelperService.put(`/api/v1/playlists/${id}/public/${isPublic}`, null),
      isPublic ? 'library.nowPublic' : 'library.nowOwnersOnly'
    );
  }

  /** Whether the shown playlist can be deleted: by its owners and admins. */
  get canDeletePlaylist(): boolean {
    return this.canManagePlaylist;
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
        title: this.tl.translate('library.deletePlaylistConfirm', { name: playlist.name }),
        yesButton: this.tl.translate('common.delete'),
        noButton: this.tl.translate('common.keep'),
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
          this.showMessage('library.playlistDeleted');
        })
        .catch((error) => {
          this.loadPlaylists();
          this.showMessage(error?.status === 403 ? 'library.deletePlaylistForbidden' : 'library.deletePlaylistFailed');
        });
    });
  }

  /** Changes the owners of the shown playlist or whether it is public, then shows its new state. */
  private changeOwnership(request: (playlistId: number) => Promise<unknown>, messageKey: string): void {
    const playlist = this.activePlaylist;
    if (!playlist) {
      return;
    }
    request(playlist.id)
      .then(() => {
        this.loadPlaylists();
        this.showMessage(messageKey);
      })
      .catch((error) => {
        // the state shown may be outdated
        this.loadPlaylists();
        this.showMessage(
          error?.status === 403
            ? 'library.forbidden'
            : error?.status === 409
              ? 'library.lastOwner'
              : 'library.changeFailed'
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
        this.showMessage(media.length === 1 ? 'library.removed.one' : 'library.removed.other', { count: media.length });
      })
      .catch((error) => {
        this.showMessage(error?.status === 403 ? 'library.changeForbidden' : 'library.removeFailed');
      });
  }

  deleteSong(media: Media): void {
    this.confirmDelete('library.deleteOne', () =>
      this.httpHelperService.put(`/api/v1/media/deleteSongById/${media.id}`, null)
    );
  }

  deleteSongs(mediaList: Media[]): void {
    this.confirmDelete('library.deleteMany', () =>
      this.httpHelperService.put(`/api/v1/media/deleteSongs`, mediaList)
    );
  }

  /** Asks before deleting; `texts` is the translation key of the title and the buttons (title, yes, no). */
  private confirmDelete(texts: string, remove: () => Promise<unknown>): void {
    const dialogRef = this.dialog.open(YesNoDialogComponent, {
      width: '420px',
      maxWidth: '92vw',
      data: {
        title: this.tl.translate(`${texts}.title`),
        yesButton: this.tl.translate(`${texts}.yes`),
        noButton: this.tl.translate(`${texts}.no`),
      },
    });
    dialogRef.afterClosed().subscribe((dialogResult) => {
      if (!dialogResult) {
        return;
      }
      remove()
        .then(() => {
          this.selection.clear();
          this.load();
          // a random text of messages.deleted
          this.snackBar.openFromComponent(CustomSnackBarComponent, { data: { message: 'deleteMessage' }, duration: 2000 });
        })
        .catch(() => this.snackBar.openFromComponent(ServerResultErrorSnackBarComponent, { duration: 2000 }));
    });
  }

  addMediaToQueue(media: Media): void {
    this.publishWithFeedback(`addMediaToQueue`, JSON.stringify(media), 'library.addedToQueue');
  }

  addMediaListToQueue(mediaList: Media[]): void {
    // only the ids: the server reads nothing else, and a long list of whole media exceeds its message size limit,
    // which closes the connection
    const ids = mediaList.map((media) => ({ id: media.id }));
    this.publishWithFeedback(`addMediaListToQueue`, JSON.stringify(ids), 'library.addedToQueue');
  }

  playMediaNext(media: Media): void {
    this.publishWithFeedback(`playMediaNext`, JSON.stringify(media), 'library.playingNext');
  }

  playMediaNow(media: Media): void {
    this.publishWithFeedback(`playMediaNow`, JSON.stringify(media), 'library.playingNow');
  }

  /** Errors are shown app-wide (see AppComponent), so only success needs to be shown here. */
  private publishWithFeedback(command: string, body: string, messageKey: string): void {
    this.wsService.publishSessionCommandWithResult(command, body).then((success) => {
      if (success) {
        this.showMessage(messageKey);
      }
    });
  }

  /** Shows the text of a translation key. */
  private showMessage(key: string, params?: Record<string, unknown>): void {
    const message = this.tl.translate(key, params);
    this.snackBar.openFromComponent(CustomSnackBarComponent, { data: { message }, duration: 2000 });
  }
}
