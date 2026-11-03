import { expect, test } from '../fixtures/auth';

test.describe('shell and navigation', () => {
  test('rail links navigate', async ({ userPage }) => {
    const rail = userPage.getByRole('navigation', { name: 'Main' });
    await userPage.goto('/');
    await rail.getByRole('link', { name: 'Library' }).click();
    await expect(userPage).toHaveURL(/\/library$/);
    await rail.getByRole('link', { name: 'Settings' }).click();
    await expect(userPage).toHaveURL(/\/settings$/);
    await rail.getByRole('link', { name: 'Lobbies' }).click();
    await expect(userPage).toHaveURL(/\/$/);
  });

  test('brand link goes home', async ({ userPage }) => {
    await userPage.goto('/settings');
    await userPage.getByRole('link', { name: 'PortalSync' }).click();
    await expect(userPage).toHaveURL(/\/$/);
  });

  test('account menu opens settings', async ({ userPage, user }) => {
    await userPage.goto('/');
    await userPage.getByRole('button', { name: `Account menu of ${user.username}` }).click();
    await userPage.getByRole('menuitem', { name: 'Settings' }).click();
    await expect(userPage).toHaveURL(/\/settings$/);
  });

  test('unknown routes fall back to the room list', async ({ userPage }) => {
    await userPage.goto('/does/not/exist');
    await expect(userPage).toHaveURL(/\/$/);
  });

  test('legacy routes redirect', async ({ userPage }) => {
    await userPage.goto('/database/browse');
    await expect(userPage).toHaveURL(/\/library$/);
    await userPage.goto('/sessions/create');
    await expect(userPage).toHaveURL(/\/$/);
  });

  test('no room and no mini player before a room is joined', async ({ userPage }) => {
    await userPage.goto('/');
    await expect(userPage.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Player', exact: true })).toHaveCount(0);
    await expect(userPage.locator('app-mini-player')).toHaveCount(0);
  });

  test('login page hides header and rail', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#app-theme-container')).toHaveClass(/auth-page/);
    await expect(page.locator('#header')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  });

  test('narrow viewport keeps the navigation reachable', async ({ userPage }) => {
    await userPage.setViewportSize({ width: 600, height: 900 });
    await userPage.goto('/');
    const rail = userPage.getByRole('navigation', { name: 'Main' });
    await expect(rail).toBeVisible();
    const box = await rail.boundingBox();
    expect(box!.y).toBeGreaterThan(400); // bottom bar below 720 px
    await rail.getByRole('link', { name: 'Library' }).click();
    await expect(userPage).toHaveURL(/\/library$/);
  });
});
