import { readFileSync } from 'node:fs';
import { test as base, Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test';
import { ADMIN, BASE_URL, STATE_FILE } from '../env';
import { Account, createUser, login, unique } from './api';

export function adminAccount(): Account {
  const { admin } = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  return { id: admin.id, username: ADMIN.username, password: ADMIN.password, admin: true };
}

/**
 * The state of a browser in which the user is logged in: the login cookie of a fresh login (HttpOnly, the client can
 * not read it) and the user the client remembers in localStorage['currentUser'] (id, name, admin; no password).
 */
export async function loginState(user: Account): Promise<NonNullable<BrowserContextOptions['storageState']>> {
  const cookie = await login(user);
  const currentUser = { id: user.id, username: user.username, admin: user.admin };
  return {
    cookies: [
      {
        name: cookie.name,
        value: cookie.value,
        domain: new URL(BASE_URL).hostname,
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: 'Strict',
      },
    ],
    origins: [{ origin: BASE_URL, localStorage: [{ name: 'currentUser', value: JSON.stringify(currentUser) }] }],
  };
}

/** A browser context with the user already logged in. */
export async function loginContext(browser: Browser, user: Account): Promise<BrowserContext> {
  return browser.newContext({ baseURL: BASE_URL, storageState: await loginState(user) });
}

interface Fixtures {
  admin: Account;
  /** A fresh throwaway user. */
  user: Account;
  /** Page of a logged-in fresh user. */
  userPage: Page;
}

export const test = base.extend<Fixtures>({
  admin: async ({}, use) => use(adminAccount()),
  user: async ({ admin }, use) => use(await createUser(admin, unique('u'), 'e2e-user-password')),
  userPage: async ({ browser, user }, use) => {
    const ctx = await loginContext(browser, user);
    await use(await ctx.newPage());
    await ctx.close();
  },
});

export { expect } from '@playwright/test';
