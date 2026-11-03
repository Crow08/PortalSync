import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SpotifyLoginDialogComponent } from '../dialog/spotify-login-dialog/spotify-login-dialog.component';
import {
  SpotifyAlbum,
  SpotifyAlbumGroup,
  SpotifyApiError,
  SpotifyArtist,
  SpotifyPlaylist,
  SpotifyService,
  SpotifyTrack,
} from '../../services/spotify.service';
import { HttpHelperService } from '../../services/http-helper.service';
import { GenericDataObject } from '../../models/genericDataObject';

/** Songs per request to the server. */
const IMPORT_CHUNK = 100;

/** Searches Spotify songs and imports them, or whole playlists of the user, into the library. */
@Component({
    selector: 'app-spotify-import',
    templateUrl: './spotify-import.component.html',
    styleUrls: ['./spotify-import.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class SpotifyImportComponent {
  query = '';
  results: SpotifyTrack[] = [];
  total = 0;
  searching = false;
  searchError = '';
  /** The songs selected for the import, by uri: a new search keeps the selection. */
  selected = new Map<string, SpotifyTrack>();
  selectedPlaylists: GenericDataObject[] = [];
  adding = false;

  playlists: SpotifyPlaylist[] = [];
  playlistsLoaded = false;
  loadingPlaylists = false;
  playlistLink = '';
  linkedPlaylist: SpotifyPlaylist | null = null;
  playlistError = '';
  /** What the import of a playlist is doing right now, empty when it is idle. */
  importing = '';

  // artists and albums
  catalogKind: 'artists' | 'albums' = 'artists';
  catalogQuery = '';
  artistResults: SpotifyArtist[] = [];
  albumResults: SpotifyAlbum[] = [];
  catalogTotal = 0;
  catalogSearching = false;
  catalogLink = '';
  catalogError = '';
  /** What the import of artists and albums is doing right now, empty when it is idle. */
  catalogImporting = '';
  chosenArtist: SpotifyArtist | null = null;
  artistAlbums: SpotifyAlbum[] = [];
  loadingAlbums = false;
  readonly albumGroups: { value: SpotifyAlbumGroup; label: string }[] = [
    { value: 'album', label: 'Albums' },
    { value: 'single', label: 'Singles' },
    { value: 'compilation', label: 'Compilations' },
    { value: 'appears_on', label: 'Appears on' },
  ];
  selectedGroups = new Set<SpotifyAlbumGroup>(['album', 'single']);
  selectedAlbums = new Set<string>();
  /** Only the songs of the chosen artist: albums such as compilations hold songs of other artists too. */
  onlyChosenArtist = true;
  createCatalogPlaylist = false;
  catalogPlaylists: GenericDataObject[] = [];

  constructor(
    private spotifyService: SpotifyService,
    private httpHelperService: HttpHelperService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  get loggedIn(): boolean {
    return this.spotifyService.loggedIn || this.spotifyService.canRestore;
  }

  get hasMore(): boolean {
    return this.results.length < this.total;
  }

  /** Opens the Spotify login dialog and returns false when the user is not logged in. */
  private requireLogin(): boolean {
    if (this.loggedIn) {
      return true;
    }
    this.dialog.open(SpotifyLoginDialogComponent);
    return false;
  }

  async search(): Promise<void> {
    if (!this.query.trim() || !this.requireLogin()) {
      return;
    }
    this.results = [];
    this.total = 0;
    await this.loadResults(0);
  }

  async loadMore(): Promise<void> {
    await this.loadResults(this.results.length);
  }

  isSelected(track: SpotifyTrack): boolean {
    return this.selected.has(track.uri);
  }

  toggle(track: SpotifyTrack): void {
    this.isSelected(track) ? this.selected.delete(track.uri) : this.selected.set(track.uri, track);
  }

  formatDuration(ms: number): string {
    const seconds = Math.round(ms / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  async addSelected(): Promise<void> {
    const tracks = [...this.selected.values()];
    this.adding = true;
    try {
      await this.importTracks(
        tracks,
        this.selectedPlaylists.map((playlist) => playlist.id)
      );
      this.selected.clear();
      this.notify(`${tracks.length} song${tracks.length === 1 ? '' : 's'} added`);
    } catch (error) {
      this.searchError = this.describe(error);
    } finally {
      this.adding = false;
    }
  }

  async loadPlaylists(): Promise<void> {
    if (!this.requireLogin()) {
      return;
    }
    this.loadingPlaylists = true;
    this.playlistError = '';
    try {
      this.playlists = await this.spotifyService.getMyPlaylists();
      this.playlistsLoaded = true;
    } catch (error) {
      this.playlistError = this.describe(error);
    } finally {
      this.loadingPlaylists = false;
    }
  }

  async lookUpPlaylist(): Promise<void> {
    if (!this.requireLogin()) {
      return;
    }
    this.playlistError = '';
    this.linkedPlaylist = null;
    try {
      this.linkedPlaylist = await this.spotifyService.getPlaylist(this.playlistLink);
    } catch (error) {
      this.playlistError = this.describe(error);
    }
  }

  /** Creates a playlist of the library with the name of the Spotify playlist and imports all its songs into it. */
  async importPlaylist(playlist: SpotifyPlaylist): Promise<void> {
    if (!this.requireLogin()) {
      return;
    }
    this.playlistError = '';
    this.importing = `Reading ${playlist.name}`;
    try {
      const tracks = await this.spotifyService.getPlaylistTracks(playlist.id, (loaded, total) => {
        this.importing = `Reading ${playlist.name}: ${loaded} of ${total}`;
      });
      if (tracks.length === 0) {
        this.playlistError = `${playlist.name} has no songs that can be imported.`;
        return;
      }
      this.importing = `Creating the playlist ${playlist.name}`;
      const playlistId = await this.httpHelperService.post<number>('/api/v1/playlists/', playlist.name);
      await this.importTracks(tracks, [playlistId], (done) => {
        this.importing = `Importing ${playlist.name}: ${done} of ${tracks.length}`;
      });
      this.notify(`${playlist.name}: ${tracks.length} songs imported`);
    } catch (error) {
      this.playlistError = this.describe(error);
    } finally {
      this.importing = '';
    }
  }

  get catalogHasMore(): boolean {
    return (this.catalogKind === 'artists' ? this.artistResults.length : this.albumResults.length) < this.catalogTotal;
  }

  get catalogBusy(): boolean {
    return !!this.catalogImporting || this.loadingAlbums;
  }

  get selectedAlbumSongs(): number {
    return this.artistAlbums
      .filter((album) => this.selectedAlbums.has(album.id))
      .reduce((sum, album) => sum + Math.max(album.totalTracks, 0), 0);
  }

  setCatalogKind(kind: 'artists' | 'albums'): void {
    this.catalogKind = kind;
    this.artistResults = [];
    this.albumResults = [];
    this.catalogTotal = 0;
    this.catalogError = '';
  }

  async searchCatalog(): Promise<void> {
    if (!this.catalogQuery.trim() || !this.requireLogin()) {
      return;
    }
    this.artistResults = [];
    this.albumResults = [];
    this.catalogTotal = 0;
    await this.loadCatalogResults(0);
  }

  async loadMoreCatalog(): Promise<void> {
    await this.loadCatalogResults(this.catalogKind === 'artists' ? this.artistResults.length : this.albumResults.length);
  }

  /** Looks up a link to an artist or an album and shows it like a search result. */
  async lookUpCatalogLink(): Promise<void> {
    if (!this.requireLogin()) {
      return;
    }
    this.catalogError = '';
    try {
      switch (SpotifyService.linkKind(this.catalogLink)) {
        case 'artist':
          this.setCatalogKind('artists');
          await this.chooseArtist(await this.spotifyService.getArtist(this.catalogLink));
          break;
        case 'album':
          this.setCatalogKind('albums');
          this.albumResults = [await this.spotifyService.getAlbum(this.catalogLink)];
          this.catalogTotal = 1;
          break;
        case 'playlist':
          this.catalogError = 'This is a playlist: import it in the panel for playlists.';
          break;
        default:
          this.catalogError = 'This is no link to a Spotify artist or album.';
      }
    } catch (error) {
      this.catalogError = this.describe(error);
    }
  }

  async chooseArtist(artist: SpotifyArtist): Promise<void> {
    this.chosenArtist = artist;
    await this.loadArtistAlbums();
  }

  closeArtist(): void {
    this.chosenArtist = null;
    this.artistAlbums = [];
    this.selectedAlbums.clear();
  }

  async toggleGroup(group: SpotifyAlbumGroup): Promise<void> {
    this.selectedGroups.has(group) ? this.selectedGroups.delete(group) : this.selectedGroups.add(group);
    await this.loadArtistAlbums();
  }

  toggleAlbum(album: SpotifyAlbum): void {
    this.selectedAlbums.has(album.id) ? this.selectedAlbums.delete(album.id) : this.selectedAlbums.add(album.id);
  }

  toggleAllAlbums(): void {
    if (this.selectedAlbums.size === this.artistAlbums.length) {
      this.selectedAlbums.clear();
    } else {
      this.artistAlbums.forEach((album) => this.selectedAlbums.add(album.id));
    }
  }

  async importChosenAlbums(): Promise<void> {
    const artist = this.chosenArtist;
    if (artist) {
      const albums = this.artistAlbums.filter((album) => this.selectedAlbums.has(album.id));
      await this.importAlbums(albums, artist.name, this.onlyChosenArtist ? artist.id : undefined);
    }
  }

  async importAlbum(album: SpotifyAlbum): Promise<void> {
    await this.importAlbums([album], album.name);
  }

  /** Reads the songs of the albums (every song once) and imports them, into a new playlist if that is chosen. */
  private async importAlbums(albums: SpotifyAlbum[], name: string, onlyArtistId?: string): Promise<void> {
    if (albums.length === 0 || !this.requireLogin()) {
      return;
    }
    this.catalogError = '';
    try {
      const tracks = new Map<string, SpotifyTrack>();
      for (const [index, album] of albums.entries()) {
        this.catalogImporting = `Reading ${album.name} (${index + 1} of ${albums.length})`;
        (await this.spotifyService.getAlbumTracks(album, onlyArtistId)).forEach(
          (track) => tracks.has(track.uri) || tracks.set(track.uri, track)
        );
      }
      if (tracks.size === 0) {
        this.catalogError = `${name} has no songs that can be imported.`;
        return;
      }
      const playlistIds = this.catalogPlaylists.map((playlist) => playlist.id);
      if (this.createCatalogPlaylist) {
        this.catalogImporting = `Creating the playlist ${name}`;
        playlistIds.push(await this.httpHelperService.post<number>('/api/v1/playlists/', name));
      }
      const list = [...tracks.values()];
      await this.importTracks(list, playlistIds, (done) => {
        this.catalogImporting = `Importing ${name}: ${done} of ${list.length}`;
      });
      this.notify(`${name}: ${list.length} songs imported`);
    } catch (error) {
      this.catalogError = this.describe(error);
    } finally {
      this.catalogImporting = '';
    }
  }

  private async loadArtistAlbums(): Promise<void> {
    const artist = this.chosenArtist;
    if (!artist) {
      return;
    }
    this.loadingAlbums = true;
    this.catalogError = '';
    try {
      const groups = this.albumGroups.map((group) => group.value).filter((group) => this.selectedGroups.has(group));
      this.artistAlbums = groups.length > 0 ? await this.spotifyService.getArtistAlbums(artist.id, groups) : [];
      // all albums are chosen, the user takes out what is not wanted
      this.selectedAlbums = new Set(this.artistAlbums.map((album) => album.id));
    } catch (error) {
      this.catalogError = this.describe(error);
    } finally {
      this.loadingAlbums = false;
    }
  }

  private async loadCatalogResults(offset: number): Promise<void> {
    this.catalogSearching = true;
    this.catalogError = '';
    try {
      const query = this.catalogQuery.trim();
      if (this.catalogKind === 'artists') {
        const result = await this.spotifyService.searchArtists(query, offset);
        this.artistResults = [...this.artistResults, ...result.artists];
        this.catalogTotal = result.total;
      } else {
        const result = await this.spotifyService.searchAlbums(query, offset);
        this.albumResults = [...this.albumResults, ...result.albums];
        this.catalogTotal = result.total;
      }
    } catch (error) {
      this.catalogError = this.describe(error);
    } finally {
      this.catalogSearching = false;
    }
  }

  private async loadResults(offset: number): Promise<void> {
    this.searching = true;
    this.searchError = '';
    try {
      const result = await this.spotifyService.searchTracks(this.query.trim(), offset);
      this.results = [...this.results, ...result.tracks];
      this.total = result.total;
    } catch (error) {
      this.searchError = this.describe(error);
    } finally {
      this.searching = false;
    }
  }

  private async importTracks(
    tracks: SpotifyTrack[],
    playlistIds: number[],
    onProgress?: (done: number) => void
  ): Promise<void> {
    for (let start = 0; start < tracks.length; start += IMPORT_CHUNK) {
      const songs = tracks.slice(start, start + IMPORT_CHUNK).map((track) => ({
        title: track.title,
        uri: track.uri,
        spotify: true,
        artist: { name: track.artist },
        album: { name: track.album },
        genres: [],
        tags: [],
      }));
      await this.httpHelperService.post('/api/v1/media/import/', { songs, playlists: playlistIds });
      onProgress?.(Math.min(start + IMPORT_CHUNK, tracks.length));
    }
  }

  private describe(error: unknown): string {
    if (error instanceof SpotifyApiError) {
      switch (error.status) {
        case 401:
          return 'You are not logged in to Spotify. Log in to Spotify again.';
        case 403:
          return (
            'Spotify refused the request. The account has to be one of the allowed users of the app, and for ' +
            'playlists the login needs a new permission: log in to Spotify again in the settings.'
          );
        case 404:
          return 'Spotify does not know this playlist.';
        default:
          return error.message;
      }
    }
    return 'The server could not import the songs.';
  }

  private notify(message: string): void {
    this.snackBar.open(message, 'OK', { duration: 4000 });
  }
}
