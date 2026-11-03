import { Page } from '@playwright/test';
import { expect, loginContext, test } from '../fixtures/auth';
import { createUser, unique } from '../fixtures/api';

async function createRoom(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.locator('#name').fill(name);
  await page.locator('#submit-button').click();
  await expect(page).toHaveURL(/\/sessions\/\d+\/lobby$/);
}

const card = (page: Page, name: string) => page.locator('.room-card').filter({ hasText: name });

test.describe('rooms', () => {
  test('creating a room enters the lobby', async ({ userPage }) => {
    const name = unique('room');
    await createRoom(userPage, name);
    await expect(userPage.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Player', exact: true })).toBeVisible();
    await expect(userPage.locator('#header .session-name')).toHaveText(name);
  });

  test('empty name is rejected', async ({ userPage }) => {
    await userPage.goto('/');
    await userPage.locator('#submit-button').click();
    await expect(userPage).toHaveURL(/\/$/);
  });

  test('the lobby starts without a playlist unless one is chosen', async ({ userPage }) => {
    await userPage.goto('/');
    const select = userPage.getByRole('combobox', { name: 'Start with' });
    await expect(select).toBeVisible();
    await expect(select).toContainText('No playlist');
  });

  test('room list shows the room, join enters it, search and filters work', async ({ userPage }) => {
    const name = unique('listed');
    await createRoom(userPage, name);
    await userPage.goto('/');
    await expect(card(userPage, name)).toBeVisible();
    await expect(card(userPage, name).locator('.count')).toHaveText(/\d+ listening/);

    await userPage.getByLabel('Find a lobby').fill('zzz-no-match-zzz');
    await expect(userPage.locator('.room-card')).toHaveCount(0);
    await expect(userPage.locator('p.empty')).toHaveText('No lobby matches.');
    await userPage.getByLabel('Find a lobby').fill(name);
    await expect(card(userPage, name)).toBeVisible();

    // an empty room is neither Video nor Music
    const filter = userPage.getByRole('radiogroup', { name: 'Filter lobbies' });
    await filter.getByRole('radio', { name: 'Video' }).click();
    await expect(card(userPage, name)).toHaveCount(0);
    await filter.getByRole('radio', { name: 'Music' }).click();
    await expect(card(userPage, name)).toHaveCount(0);
    await filter.getByRole('radio', { name: 'Mine' }).click();
    await expect(card(userPage, name)).toBeVisible();
    await filter.getByRole('radio', { name: 'All' }).click();

    await card(userPage, name).getByRole('button', { name: 'Join' }).click();
    await expect(userPage).toHaveURL(/\/sessions\/\d+\/lobby$/);
  });

  test('"Mine" hides rooms of other users', async ({ userPage, browser, admin }) => {
    const other = await createUser(admin, unique('o'), 'pw-other');
    const ctx = await loginContext(browser, other);
    const otherPage = await ctx.newPage();
    const name = unique('foreign');
    await createRoom(otherPage, name);

    await userPage.goto('/');
    await expect(card(userPage, name)).toBeVisible();
    await userPage.getByRole('radiogroup', { name: 'Filter lobbies' }).getByRole('radio', { name: 'Mine' }).click();
    await expect(card(userPage, name)).toHaveCount(0);
    await ctx.close();
  });

  test('creator can delete a room after confirming', async ({ userPage }) => {
    const name = unique('del');
    await createRoom(userPage, name);
    await userPage.goto('/');
    await card(userPage, name).getByRole('button', { name: 'Delete lobby' }).click();
    await userPage.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(card(userPage, name)).toHaveCount(0);
  });

  test('dismissing the confirmation keeps the room', async ({ userPage }) => {
    const name = unique('keep');
    await createRoom(userPage, name);
    await userPage.goto('/');
    await card(userPage, name).getByRole('button', { name: 'Delete lobby' }).click();
    await userPage.getByRole('dialog').getByRole('button', { name: 'Keep' }).click();
    await expect(card(userPage, name)).toBeVisible();
  });

  test('other users cannot delete, admins can', async ({ userPage, browser, admin }) => {
    const name = unique('owned');
    await createRoom(userPage, name);

    const other = await createUser(admin, unique('o'), 'pw-other');
    const otherCtx = await loginContext(browser, other);
    const otherPage = await otherCtx.newPage();
    await otherPage.goto('/');
    await expect(card(otherPage, name)).toBeVisible();
    await expect(card(otherPage, name).getByRole('button', { name: 'Delete lobby' })).toHaveCount(0);
    await otherCtx.close();

    const adminCtx = await loginContext(browser, admin);
    const adminPage = await adminCtx.newPage();
    await adminPage.goto('/');
    await card(adminPage, name).getByRole('button', { name: 'Delete lobby' }).click();
    await adminPage.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(card(adminPage, name)).toHaveCount(0);
    await adminCtx.close();
  });

  test('leaving the lobby keeps the room reachable through the header and rail', async ({ userPage }) => {
    const name = unique('nav');
    await createRoom(userPage, name);
    await userPage.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
    await expect(userPage.locator('#header .session-link')).toBeVisible();
    await userPage.locator('#header .session-link').click();
    await expect(userPage).toHaveURL(/\/sessions\/\d+\/lobby$/);
  });
});
