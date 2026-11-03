import { readFileSync } from 'node:fs';
import { BASE_URL, STATE_FILE } from '../env';
import { toneBuffer } from '../media-setup';
import { Account, basic } from './api';

export interface MediaRef {
  id: number;
  title: string;
}

/** Media seeded once by the global setup: three songs and one video. Do not modify or delete them in tests. */
export function sharedMedia(): { songs: MediaRef[]; video: MediaRef } {
  const { songs, video } = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  return { songs, video };
}

export async function api(as: Account, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE_URL}/api/v1${path}`, {
    ...init,
    headers: { Authorization: basic(as.username, as.password), ...init.headers },
  });
}

export async function createPlaylist(as: Account, name: string): Promise<number> {
  const res = await api(as, '/playlists/', { method: 'POST', body: name, headers: { 'Content-Type': 'text/plain' } });
  if (!res.ok) {
    throw new Error(`createPlaylist failed: HTTP ${res.status}`);
  }
  return Number(await res.text());
}

export async function playlistMedia(as: Account, playlistId: number): Promise<MediaRef[]> {
  const res = await api(as, `/playlists/${playlistId}/media`);
  return res.json();
}

/** Uploads a short generated song; the title of a song is its file name. */
export async function uploadSong(as: Account, name: string, playlists: number[] = []): Promise<MediaRef> {
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(toneBuffer())], { type: 'audio/mpeg' }), name);
  form.append('data', JSON.stringify({ playlists, genres: [], tags: [] }));
  const res = await api(as, '/media/upload/', { method: 'POST', body: form });
  if (!res.ok) {
    throw new Error(`uploadSong ${name} failed: HTTP ${res.status}`);
  }
  const all: MediaRef[] = (await (await api(as, '/media/all')).json()).content;
  return all.find((m) => m.title === name)!;
}

export async function addSongToPlaylist(as: Account, playlistId: number, songId: number): Promise<void> {
  const res = await api(as, `/playlists/${playlistId}/addSongToPlaylist/${songId}`, { method: 'PUT' });
  if (!res.ok) {
    throw new Error(`addSongToPlaylist failed: HTTP ${res.status}`);
  }
}

export function toneFile(name: string): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: 'audio/mpeg', buffer: toneBuffer() };
}
