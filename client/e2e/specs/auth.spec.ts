import { expect, test } from '../fixtures/auth';

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
});
