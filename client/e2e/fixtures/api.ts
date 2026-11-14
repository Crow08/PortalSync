import { BASE_URL } from '../env';

export interface Account {
  id: number;
  username: string;
  password: string;
  admin: boolean;
}

export function basic(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

/** A login cookie as the server sets it. */
export interface LoginCookie {
  name: string;
  value: string;
  /** The attributes of the Set-Cookie header in lower case, e.g. "httponly", "samesite=strict". */
  attributes: string[];
}

/**
 * Logs the user in like the client does and returns the login cookie. The fixtures themselves talk to the API with
 * HTTP Basic (see `basic`), which the server keeps for clients that are no browser.
 */
export async function login(user: Account): Promise<LoginCookie> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user.username, password: user.password }),
  });
  if (!res.ok) {
    throw new Error(`login of ${user.username} failed: HTTP ${res.status}`);
  }
  const [pair, ...attributes] = res.headers
    .getSetCookie()[0]
    .split(';')
    .map((part) => part.trim());
  const separator = pair.indexOf('=');
  return {
    name: pair.substring(0, separator),
    value: pair.substring(separator + 1),
    attributes: attributes.map((attribute) => attribute.toLowerCase()),
  };
}

/** A request to the API that is logged in by a login cookie, like a request of the browser. */
export async function withCookie(cookie: LoginCookie, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE_URL}/api/v1${path}`, {
    ...init,
    headers: { Cookie: `${cookie.name}=${cookie.value}`, ...init.headers },
  });
}

/** Creates a user through the invite flow (the only way without SQL) and returns the account. */
export async function createUser(inviter: Account, username: string, password: string): Promise<Account> {
  const signed = await fetch(`${BASE_URL}/api/v1/users/register?X-NPE-PSU-Duration=PT1H`, {
    method: 'PUT',
    headers: { Authorization: basic(inviter.username, inviter.password) },
  });
  if (!signed.ok) {
    throw new Error(`invite failed: HTTP ${signed.status}`);
  }
  const reg = await fetch(await signed.text(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!reg.ok) {
    throw new Error(`register ${username} failed: HTTP ${reg.status}`);
  }
  const login = await fetch(`${BASE_URL}/api/v1/users/login`, { headers: { Authorization: basic(username, password) } });
  const user = await login.json();
  return { id: user.id, username, password, admin: !!user.admin };
}

let counter = 0;
export function unique(prefix: string): string {
  return `${prefix}-${process.pid}-${Date.now().toString(36)}-${counter++}`;
}
