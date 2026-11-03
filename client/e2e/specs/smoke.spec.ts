import { expect, test } from '../fixtures/auth';

test('login form signs a user in and shows the room list', async ({ page, user }) => {
  await page.goto('/login');
  await page.locator('#username').fill(user.username);
  await page.locator('#password').fill(user.password);
  await page.locator('#submit-button').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: `Account menu of ${user.username}` })).toBeVisible();
});

test('logged-in context skips the login page', async ({ userPage }) => {
  await userPage.goto('/');
  await expect(userPage).not.toHaveURL(/login/);
});
