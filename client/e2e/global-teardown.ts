import { execFileSync } from 'node:child_process';
import { COMPOSE_FILE, MEDIA_DIR, PORT } from './env';

export default async function globalTeardown(): Promise<void> {
  if (process.env['E2E_KEEP_STACK'] === '1' || process.env['E2E_SKIP_STACK'] === '1') {
    return;
  }
  execFileSync('docker', ['compose', '-f', COMPOSE_FILE, 'down', '-v', '--remove-orphans'], {
    env: { ...process.env, MEDIA_DIR, E2E_PORT: PORT },
    stdio: 'inherit',
  });
}
