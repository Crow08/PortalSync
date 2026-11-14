import { expect, test } from '../fixtures/auth';
import { createUser, login, unique, withCookie } from '../fixtures/api';
import { BASE_URL } from '../env';

test.describe('auth', () => {
  test('wrong password shows an error and stays on the login page', async ({ page, user }) => {
    await page.goto('/login');
    await page.locator('#username').fill(user.username);
    await page.locator('#password').fill('wrong-password');
    await page.locator('#submit-button').click();
    await expect(page.getByRole('alert')).toHaveText('Login failed.');
    await expect(page).toHaveURL(/\/login/);
  });

  test('empty form does not submit', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#submit-button').click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('guard redirects to login with returnUrl and returns after login', async ({ page, user }) => {
    await page.goto('/library');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Flibrary/);
    await page.locator('#username').fill(user.username);
    await page.locator('#password').fill(user.password);
    await page.locator('#submit-button').click();
    await expect(page).toHaveURL(/\/library$/);
  });

  test('login survives a reload', async ({ userPage, user }) => {
    await userPage.goto('/');
    await userPage.reload();
    await expect(userPage.getByRole('button', { name: `Account menu of ${user.username}` })).toBeVisible();
  });

  test('logout clears the login and protects the pages again', async ({ userPage, user }) => {
    await userPage.goto('/');
    await userPage.getByRole('button', { name: `Account menu of ${user.username}` }).click();
    await userPage.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(userPage).toHaveURL(/\/login/);
    expect(await userPage.evaluate(() => localStorage.getItem('currentUser'))).toBeNull();
    await userPage.goto('/library');
    await expect(userPage).toHaveURL(/\/login/);
  });

  test('a logged-in user is sent away from the login page', async ({ userPage }) => {
    await userPage.goto('/login');
    await expect(userPage).not.toHaveURL(/login/);
  });

  test('the login is a cookie that scripts can not read, the browser keeps no password', async ({ page, user }) => {
    await page.goto('/login');
    await page.locator('#username').fill(user.username);
    await page.locator('#password').fill(user.password);
    await page.locator('#submit-button').click();
    await expect(page.getByRole('button', { name: `Account menu of ${user.username}` })).toBeVisible();

    const cookies = await page.context().cookies();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' });
    expect(await page.evaluate(() => document.cookie)).toBe('');
    const stored = await page.evaluate(() => localStorage.getItem('currentUser'));
    expect(JSON.parse(stored!)).toEqual({ id: user.id, username: user.username, admin: false });
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(user.password);
  });

  test('logout ends the login on the server and removes the cookie', async ({ userPage, user }) => {
    await userPage.goto('/');
    const [cookie] = await userPage.context().cookies();
    const login = { name: cookie.name, value: cookie.value, attributes: [] };
    expect((await withCookie(login, '/users/login')).status).toBe(200);

    await userPage.getByRole('button', { name: `Account menu of ${user.username}` }).click();
    await userPage.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(userPage).toHaveURL(/\/login/);

    await expect.poll(async () => (await withCookie(login, '/users/login')).status).toBe(401);
    await expect.poll(() => userPage.context().cookies()).toEqual([]);
  });

  test('a login the server does not know any more sends the client to the login page', async ({ userPage, user }) => {
    await userPage.goto('/');
    await expect(userPage.getByRole('button', { name: `Account menu of ${user.username}` })).toBeVisible();
    // the login ends without the client: e.g. it ran out, or the password was changed in another browser
    const [cookie] = await userPage.context().cookies();
    await withCookie({ name: cookie.name, value: cookie.value, attributes: [] }, '/auth/logout', { method: 'POST' });

    await userPage.goto('/library');

    await expect(userPage).toHaveURL(/\/login/);
    expect(await userPage.evaluate(() => localStorage.getItem('currentUser'))).toBeNull();
  });

  test('the login cookie is not accepted in requests of other sites', async ({ user }) => {
    const cookie = await login(user);
    expect(cookie.attributes).toEqual(expect.arrayContaining(['httponly', 'samesite=strict', 'path=/']));
    // browsers do not send a SameSite=Strict cookie with requests of other sites; the server refuses them as well
    const createPlaylist = (origin: string) =>
      withCookie(cookie, '/playlists/', {
        method: 'POST',
        body: unique('csrf'),
        headers: { 'Content-Type': 'text/plain', Origin: origin },
      });
    expect((await createPlaylist('https://evil.example')).status).toBe(403);
    expect((await createPlaylist(BASE_URL)).status).toBe(200);
  });

  test('changing the password ends the other logins of the user', async ({ admin }) => {
    const user = await createUser(admin, unique('pw'), 'old-password');
    const here = await login(user);
    const elsewhere = await login(user);
    const changed = await withCookie(here, '/users/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'old-password', newPassword: 'new-password' }),
    });
    expect(changed.status).toBe(204);
    expect((await withCookie(here, '/users/login')).status).toBe(200);
    expect((await withCookie(elsewhere, '/users/login')).status).toBe(401);
  });

  test('without a login the API and the WebSocket are closed', async () => {
    expect((await fetch(`${BASE_URL}/api/v1/media/all`)).status).toBe(401);
    expect((await fetch(`${BASE_URL}/api/v1/users/login`, { headers: { Cookie: 'portalsync_login=made-up' } })).status).toBe(
      401
    );
    expect((await fetch(`${BASE_URL}/ws`)).status).toBe(401);
  });
});
