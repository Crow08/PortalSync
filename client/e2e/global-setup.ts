import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { ADMIN, BASE_URL, COMPOSE_FILE, MEDIA_DIR, PORT, STATE_FILE } from './env';
import { generateMediaFiles, SHARED_SONGS, toneBuffer, VIDEO_TITLE, VIDEO_URI } from './media-setup';

function compose(args: string[], opts: { input?: string } = {}): string {
  return execFileSync('docker', ['compose', '-f', COMPOSE_FILE, ...args], {
    env: { ...process.env, MEDIA_DIR, E2E_PORT: PORT },
    encoding: 'utf8',
    input: opts.input,
    stdio: ['pipe', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

export default async function globalSetup(): Promise<void> {
  if (process.env['E2E_SKIP_STACK'] !== '1') {
    rmSync(MEDIA_DIR, { recursive: true, force: true });
    mkdirSync(MEDIA_DIR, { recursive: true });
    compose(['down', '-v', '--remove-orphans']);
    compose(['up', '-d', '--build', '--wait', '--wait-timeout', '600']);
  }

  // The first user can only be created in the database; everything else goes through the REST API.
  const hash = '{bcrypt}' + bcrypt.hashSync(ADMIN.password, 10);
  const sql = `INSERT INTO user (username, password, admin) VALUES ('${ADMIN.username}', '${hash}', true)
    ON DUPLICATE KEY UPDATE password = VALUES(password), admin = true;`;
  compose(['exec', '-T', 'db', 'mysql', '-u', 'root', '-pe2e-root-password', 'portalsync_e2e'], { input: sql });

  const res = await fetch(`${BASE_URL}/api/v1/users/login`, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${ADMIN.username}:${ADMIN.password}`).toString('base64') },
  });
  if (!res.ok) {
    throw new Error(`Admin login against ${BASE_URL} failed: HTTP ${res.status}`);
  }
  const admin = await res.json();
  const auth = 'Basic ' + Buffer.from(`${ADMIN.username}:${ADMIN.password}`).toString('base64');
  const api = (path: string, init: RequestInit = {}) =>
    fetch(`${BASE_URL}/api/v1${path}`, { ...init, headers: { Authorization: auth, ...init.headers } });

  let media: { id: number; title: string }[] = (await (await api('/media/all')).json()).content;
  if (!media.some((m) => m.title === VIDEO_TITLE)) {
    generateMediaFiles();
    // Playlist id 1 stands for "no playlist" (the upload skips it), so burn it with a placeholder.
    await api('/playlists/', { method: 'POST', body: 'e2e-placeholder', headers: { 'Content-Type': 'text/plain' } });
    const tone = toneBuffer();
    for (const name of SHARED_SONGS) {
      const form = new FormData();
      form.append('files', new Blob([new Uint8Array(tone)], { type: 'audio/mpeg' }), name);
      form.append('data', JSON.stringify({ playlists: [], genres: [], tags: [] }));
      const up = await api('/media/upload/', { method: 'POST', body: form });
      if (!up.ok) {
        throw new Error(`Seeding ${name} failed: HTTP ${up.status}`);
      }
    }
    // Videos have no upload endpoint; the file is already in the media volume.
    compose(['exec', '-T', 'db', 'mysql', '-u', 'root', '-pe2e-root-password', 'portalsync_e2e'], {
      input: `INSERT INTO media (title, uri, type) VALUES ('${VIDEO_TITLE}', '${VIDEO_URI}', 'VIDEO');
        INSERT INTO video (id) VALUES (LAST_INSERT_ID());`,
    });
    media = (await (await api('/media/all')).json()).content;
  }
  const byTitle = (title: string) => media.find((m) => m.title === title)!;
  writeFileSync(
    STATE_FILE,
    JSON.stringify({
      admin,
      songs: SHARED_SONGS.map((title) => ({ id: byTitle(title).id, title })),
      video: { id: byTitle(VIDEO_TITLE).id, title: VIDEO_TITLE },
    })
  );
}
