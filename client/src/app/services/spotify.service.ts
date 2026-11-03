///<reference types="@types/spotify-web-playback-sdk"/>
import { Injectable } from '@angular/core';
import { HttpHelperService } from './http-helper.service';
import { AuthenticationService } from './authentication.service';
import { HttpParams } from '@angular/common/http';

const API_URL = 'https://api.spotify.com/v1';
/** Development Mode apps get at most 10 search results per request. */
const SEARCH_LIMIT = 10;
const PAGE_LIMIT = 50;
/** How often a request is repeated when Spotify answers 429 (too many requests). */
const MAX_RETRIES = 3;

/** A song of Spotify, as far as the library needs it. */
export interface SpotifyTrack {
  uri: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
}

export interface SpotifyArtist {
  id: string;
  name: string;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  artist: string;
  /** The year of the release, empty when it is not known. */
  year: string;
  /** Number of songs, -1 when it is not known. */
  totalTracks: number;
  /** Spotify's group of the album for an artist: album, single, compilation or appears_on. */
  group: string;
}

/** The groups of the albums of an artist that Spotify can list. */
export type SpotifyAlbumGroup = 'album' | 'single' | 'compilation' | 'appears_on';

export interface SpotifyPlaylist {
  id: string;
  name: string;
  owner: string;
  /** Number of songs, -1 when it is not known. */
  total: number;
  /** Whether the songs can be read: Development Mode apps only get them for playlists the user owns or collaborates on. */
  readable: boolean;
}

/** An answer of the Spotify Web API that is no success. */
export class SpotifyApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** What the server knows about the Spotify app: the client id (empty when Spotify is not set up) and the redirect URI. */
export class SpotifyConfig {
  clientId = '';
  redirectUri = '';
}

/** sessionStorage key: the page to return to after the Spotify login (the redirect URI itself can not carry it). */
export const SPOTIFY_RETURN_URL_KEY = 'msc_spotifyReturnUrl';

/** Before the token was kept per user of the app. */
const LEGACY_REFRESH_TOKEN_KEY = 'msc_spotifyRefreshToken';

interface LoginToken {
  token: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable({
  providedIn: 'root',
})
export class SpotifyService {
  private static refreshJob: number;
  redirectPath = '/spotify/redirect';
  spotifyAuthUrl = 'https://accounts.spotify.com/authorize';
  private config: Promise<SpotifyConfig> | null = null;

  constructor(private httpHelper: HttpHelperService, private authenticationService: AuthenticationService) {}

  /** The refresh token belongs to the user of the app: another user of the same browser must not get the Spotify login. */
  private get refreshTokenKey(): string {
    return `${LEGACY_REFRESH_TOKEN_KEY}_${this.authenticationService.currentUserValue?.id ?? 'anonymous'}`;
  }

  private get storedRefreshToken(): string | null {
    const stored = localStorage.getItem(this.refreshTokenKey);
    const legacy = localStorage.getItem(LEGACY_REFRESH_TOKEN_KEY);
    if (stored === null && legacy !== null && this.authenticationService.currentUserValue) {
      // the login of an earlier version belongs to the user who is logged in now
      localStorage.setItem(this.refreshTokenKey, legacy);
      localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
      return legacy;
    }
    return stored;
  }

  private static _loginToken: LoginToken = {
    token: '',
    refreshToken: '',
    expiresIn: 0,
  };

  get loginToken(): LoginToken {
    return SpotifyService._loginToken;
  }

  set loginToken(loginToken: LoginToken) {
    SpotifyService._loginToken.token = loginToken.token;
    SpotifyService._loginToken.expiresIn = loginToken.expiresIn;
    if (!!loginToken.refreshToken) {
      SpotifyService._loginToken.refreshToken = loginToken.refreshToken;
      // lets the connection survive a reload of the page (the login itself needs a redirect to Spotify)
      localStorage.setItem(this.refreshTokenKey, loginToken.refreshToken);
    }
    if (!!SpotifyService.refreshJob) {
      clearTimeout(SpotifyService.refreshJob);
    }
    SpotifyService.refreshJob = setTimeout(() => {
      this.refreshToken();
    }, (loginToken.expiresIn - 60) * 1000);
  }

  private static _deviceId: string;

  get deviceId(): string {
    return SpotifyService._deviceId;
  }

  set deviceId(value: string) {
    SpotifyService._deviceId = value;
  }

  exchangeAuthCodeForToken(authCode: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpHelper
        .post('/api/v1/spotify/login', authCode)
        .then((loginToken) => {
          this.loginToken = loginToken as LoginToken;
          resolve();
        })
        .catch(reject);
    });
  }

  get loggedIn(): boolean {
    return !!SpotifyService._loginToken.token;
  }

  /** Whether a login of an earlier visit can be restored without a redirect to Spotify. */
  get canRestore(): boolean {
    return !!this.storedRefreshToken;
  }

  /** Gets an access token with the refresh token of an earlier visit. Resolves to whether the client is logged in. */
  restore(): Promise<boolean> {
    const stored = this.storedRefreshToken;
    if (this.loggedIn || !stored) {
      return Promise.resolve(this.loggedIn);
    }
    return this.httpHelper
      .post('/api/v1/spotify/refresh', stored)
      .then((loginToken) => {
        this.loginToken = loginToken as LoginToken;
        return true;
      })
      .catch((error) => {
        console.error('Spotify login could not be restored', error);
        localStorage.removeItem(this.refreshTokenKey);
        return false;
      });
  }

  /** Forgets the login of the current user for good. */
  logout(): void {
    localStorage.removeItem(this.refreshTokenKey);
    this.forgetSession();
  }

  /** Drops the access token of this page, e.g. when the user of the app logs out. The stored login stays. */
  forgetSession(): void {
    clearTimeout(SpotifyService.refreshJob);
    SpotifyService._loginToken.token = '';
    SpotifyService._loginToken.refreshToken = '';
  }

  refreshToken() {
    this.httpHelper
      .post('/api/v1/spotify/refresh', this.loginToken.refreshToken)
      .then((loginToken) => {
        this.loginToken = loginToken as LoginToken;
      })
      .catch(console.error);
  }

  /** The settings of the Spotify app, read from the server once. */
  getConfig(): Promise<SpotifyConfig> {
    if (this.config === null) {
      this.config = this.httpHelper.get('/api/v1/spotify/config', SpotifyConfig);
      // a failed request is tried again next time
      this.config.catch(() => (this.config = null));
    }
    return this.config;
  }

  /** The URL of the Spotify login, null when the server has no Spotify client id. */
  async getAuthUrl(): Promise<string | null> {
    const config = await this.getConfig();
    if (!config.clientId) {
      return null;
    }
    const scopes = [
      'app-remote-control',
      'streaming',
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      'user-read-private',
      'user-read-email',
      // to import the playlists of the user
      'playlist-read-private',
      'playlist-read-collaborative',
    ];
    const params = new HttpParams()
      .set('client_id', config.clientId)
      .set('response_type', 'code')
      .set('redirect_uri', config.redirectUri)
      .set('scope', scopes.join(' '));
    return this.spotifyAuthUrl + '?' + params.toString();
  }

  createPlayer(): Promise<string> {
    return new Promise((resolve, reject) => {
      const player = new Spotify.Player({
        name: 'Spotify delegate Player',
        getOAuthToken: (cb) => {
          cb(this.loginToken.token);
        },
        volume: 0.5,
      });
      player
        .connect()
        .then((success) => {
          if (success) {
            console.log('The Web Playback SDK successfully connected to Spotify!');
            return;
          }
        })
        .catch(reject);
      player.addListener('ready', ({ device_id }) => {
        resolve(`Ready with Device ID: ${device_id}`);
        this.deviceId = device_id;
      });
      player.addListener('initialization_error', reject);
    });
  }

  testPlay() {
    this.play('spotify:track:0gkVD2tr14wCfJhqhdE94L').catch(console.error);
  }

  play(uri: string, positionMs = 0) {
    let body = JSON.stringify({
      uris: [uri],
      position_ms: positionMs,
    });

    return fetch(`https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`, {
      body,
      headers: {
        Authorization: `Bearer ${this.loginToken.token}`,
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    });
  }

  /** Searches songs, ten per request; resolves to the songs and the total number of hits. */
  async searchTracks(query: string, offset = 0): Promise<{ tracks: SpotifyTrack[]; total: number }> {
    const result = await this.api('/search', { q: query, type: 'track', limit: SEARCH_LIMIT, offset });
    return { tracks: this.toTracks(result.tracks.items), total: result.tracks.total };
  }

  /** Searches artists, ten per request; resolves to the artists and the total number of hits. */
  async searchArtists(query: string, offset = 0): Promise<{ artists: SpotifyArtist[]; total: number }> {
    const result = await this.api('/search', { q: query, type: 'artist', limit: SEARCH_LIMIT, offset });
    return {
      artists: result.artists.items.filter((item: any) => item).map((item: any) => ({ id: item.id, name: item.name })),
      total: result.artists.total,
    };
  }

  /** Searches albums, ten per request; resolves to the albums and the total number of hits. */
  async searchAlbums(query: string, offset = 0): Promise<{ albums: SpotifyAlbum[]; total: number }> {
    const result = await this.api('/search', { q: query, type: 'album', limit: SEARCH_LIMIT, offset });
    return {
      albums: result.albums.items.filter((item: any) => item).map((item: any) => this.toAlbum(item)),
      total: result.albums.total,
    };
  }

  /** The albums of an artist in the given groups. */
  async getArtistAlbums(artistId: string, groups: SpotifyAlbumGroup[]): Promise<SpotifyAlbum[]> {
    const albums: SpotifyAlbum[] = [];
    for (let offset = 0; ; offset += PAGE_LIMIT) {
      const page = await this.api(`/artists/${artistId}/albums`, {
        include_groups: groups.join(','),
        limit: PAGE_LIMIT,
        offset,
      });
      page.items.filter((item: any) => item).forEach((item: any) => albums.push(this.toAlbum(item)));
      if (!page.next) {
        return albums;
      }
    }
  }

  /** The artist with the id, uri or url. */
  async getArtist(idOrUrl: string): Promise<SpotifyArtist> {
    const id = SpotifyService.parseId(idOrUrl, 'artist');
    if (!id) {
      throw new SpotifyApiError(400, 'This is no Spotify artist link');
    }
    const artist = await this.api(`/artists/${id}`);
    return { id: artist.id, name: artist.name };
  }

  /** The album with the id, uri or url. */
  async getAlbum(idOrUrl: string): Promise<SpotifyAlbum> {
    const id = SpotifyService.parseId(idOrUrl, 'album');
    if (!id) {
      throw new SpotifyApiError(400, 'This is no Spotify album link');
    }
    return this.toAlbum(await this.api(`/albums/${id}`));
  }

  /**
   * The songs of an album. The songs of an album carry no album of their own, so they get the one of the album. With an
   * artist id only the songs that artist plays on are returned (compilations hold songs of many artists).
   */
  async getAlbumTracks(album: SpotifyAlbum, onlyArtistId?: string): Promise<SpotifyTrack[]> {
    const tracks: SpotifyTrack[] = [];
    for (let offset = 0; ; offset += PAGE_LIMIT) {
      const page = await this.api(`/albums/${album.id}/tracks`, { limit: PAGE_LIMIT, offset });
      const items = onlyArtistId
        ? page.items.filter((item: any) => item?.artists?.some((artist: any) => artist.id === onlyArtistId))
        : page.items;
      tracks.push(...this.toTracks(items).map((track) => ({ ...track, album: album.name })));
      if (!page.next) {
        return tracks;
      }
    }
  }

  /** The playlists of the user, with whether their songs can be read. */
  async getMyPlaylists(): Promise<SpotifyPlaylist[]> {
    const me = await this.api('/me');
    const playlists: SpotifyPlaylist[] = [];
    for (let offset = 0; ; offset += PAGE_LIMIT) {
      const page = await this.api('/me/playlists', { limit: PAGE_LIMIT, offset });
      page.items.filter((item: any) => item).forEach((item: any) => playlists.push(this.toPlaylist(item, me.id)));
      if (!page.next) {
        return playlists;
      }
    }
  }

  /** The playlist with the id, uri or url. Its songs may not be readable, see SpotifyPlaylist.readable. */
  async getPlaylist(idOrUrl: string): Promise<SpotifyPlaylist> {
    const id = SpotifyService.parsePlaylistId(idOrUrl);
    if (!id) {
      throw new SpotifyApiError(400, 'This is no Spotify playlist link');
    }
    const [me, playlist] = await Promise.all([
      this.api('/me'),
      this.api(`/playlists/${id}`, { fields: 'id,name,owner(id,display_name),collaborative,items(total)' }),
    ]);
    return this.toPlaylist(playlist, me.id);
  }

  /** All songs of a playlist (episodes and local files are left out). */
  async getPlaylistTracks(id: string, onProgress?: (loaded: number, total: number) => void): Promise<SpotifyTrack[]> {
    const tracks: SpotifyTrack[] = [];
    for (let offset = 0; ; offset += PAGE_LIMIT) {
      const page = await this.api(`/playlists/${id}/items`, { limit: PAGE_LIMIT, offset });
      // the field of the song was called track before
      tracks.push(...this.toTracks(page.items.map((entry: any) => entry?.item ?? entry?.track)));
      onProgress?.(Math.min(offset + PAGE_LIMIT, page.total), page.total);
      if (!page.next) {
        return tracks;
      }
    }
  }

  /** The id of a playlist from its url (https://open.spotify.com/playlist/...), uri (spotify:playlist:...) or id. */
  static parsePlaylistId(input: string): string | null {
    return SpotifyService.parseId(input, 'playlist');
  }

  /** The id of a playlist, album or artist from its url (https://open.spotify.com/album/...), uri or plain id. */
  static parseId(input: string, kind: 'playlist' | 'album' | 'artist'): string | null {
    const text = input.trim();
    const match = text.match(new RegExp(`${kind}[/:]([A-Za-z0-9]+)`)) ?? text.match(/^([A-Za-z0-9]{22})$/);
    return match ? match[1] : null;
  }

  /** The kind of Spotify item a link points to, null for anything else. */
  static linkKind(input: string): 'playlist' | 'album' | 'artist' | null {
    return input.match(/(playlist|album|artist)[/:][A-Za-z0-9]+/)?.[1] as 'playlist' | 'album' | 'artist' | null ?? null;
  }

  /** Calls the Web API with the login of the user. */
  private async api(path: string, params: Record<string, string | number> = {}): Promise<any> {
    if (!(await this.restore())) {
      throw new SpotifyApiError(401, 'Not logged in to Spotify');
    }
    const url = new URL(API_URL + path);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    let response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${this.loginToken.token}` } });
    // too many requests: wait as long as Spotify asks and try again, an import of an artist makes many requests
    for (let retry = 0; response.status === 429 && retry < MAX_RETRIES; retry++) {
      const wait = Number(response.headers.get('Retry-After'));
      await new Promise((resolve) => setTimeout(resolve, (Number.isFinite(wait) && wait > 0 ? Math.min(wait, 30) : 2) * 1000));
      response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${this.loginToken.token}` } });
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new SpotifyApiError(response.status, body?.error?.message ?? `Spotify answered ${response.status}`);
    }
    return response.json();
  }

  private toTracks(items: any[]): SpotifyTrack[] {
    return items
      .filter((track) => track?.type === 'track' && typeof track.uri === 'string' && track.uri.startsWith('spotify:track:'))
      .map((track) => ({
        uri: track.uri,
        title: track.name,
        artist: track.artists?.[0]?.name ?? 'Unknown Artist',
        album: track.album?.name ?? 'Unknown Album',
        durationMs: track.duration_ms ?? 0,
      }));
  }

  private toAlbum(album: any): SpotifyAlbum {
    return {
      id: album.id,
      name: album.name,
      artist: album.artists?.[0]?.name ?? 'Unknown Artist',
      year: typeof album.release_date === 'string' ? album.release_date.substring(0, 4) : '',
      totalTracks: album.total_tracks ?? -1,
      group: album.album_group ?? album.album_type ?? '',
    };
  }

  private toPlaylist(playlist: any, myId: string): SpotifyPlaylist {
    const total = playlist.items?.total ?? playlist.tracks?.total;
    return {
      id: playlist.id,
      name: playlist.name,
      owner: playlist.owner?.display_name ?? playlist.owner?.id ?? '',
      total: total ?? -1,
      readable: playlist.owner?.id === myId || playlist.collaborative === true,
    };
  }
}
