import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SpotifyApiError, SpotifyPlaylist, SpotifyService, SpotifyTrack } from '../../services/spotify.service';
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

  constructor(
    private spotifyService: SpotifyService,
    private httpHelperService: HttpHelperService,
    private snackBar: MatSnackBar
  ) {}

  get loggedIn(): boolean {
    return this.spotifyService.loggedIn || this.spotifyService.canRestore;
  }

  get hasMore(): boolean {
    return this.results.length < this.total;
  }

  async search(): Promise<void> {
    if (!this.query.trim()) {
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
          return 'You are not logged in to Spotify. Log in in the settings first.';
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
