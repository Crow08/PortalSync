import { join } from 'node:path';

export const PORT = process.env['E2E_PORT'] ?? '18080';
export const BASE_URL = `http://127.0.0.1:${PORT}`;
export const COMPOSE_FILE = join(__dirname, 'compose.e2e.yaml');
export const MEDIA_DIR = join(__dirname, '.media');
export const STATE_FILE = join(__dirname, '.state.json');

// disposable test credentials of the throwaway stack
export const ADMIN = { username: 'e2e-admin', password: process.env['E2E_ADMIN_PASSWORD'] ?? 'e2e-admin-password' };
export const SOURCE_DIR = join(__dirname, '.media-src');
