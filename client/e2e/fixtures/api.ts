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
