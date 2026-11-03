import { readFileSync } from 'node:fs';
import { test as base, Browser, BrowserContext, Page } from '@playwright/test';
import { ADMIN, BASE_URL, STATE_FILE } from '../env';
import { Account, createUser, unique } from './api';

export function adminAccount(): Account {
  const { admin } = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  return { id: admin.id, username: ADMIN.username, password: ADMIN.password, admin: true };
}

/** A browser context with the user already logged in (the client keeps the login in localStorage['currentUser']). */
export async function loginContext(browser: Browser, user: Account): Promise<BrowserContext> {
  const currentUser = { ...user, authdata: Buffer.from(`${user.username}:${user.password}`).toString('base64') };
  return browser.newContext({
    baseURL: BASE_URL,
    storageState: {
      cookies: [],
      origins: [{ origin: BASE_URL, localStorage: [{ name: 'currentUser', value: JSON.stringify(currentUser) }] }],
    },
  });
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
