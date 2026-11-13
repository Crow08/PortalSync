import { Page } from '@playwright/test';
import { expect, test } from '../fixtures/auth';
import { unique } from '../fixtures/api';
import { openMedia, searchLibrary } from '../fixtures/library';
import { uploadSong } from '../fixtures/media';
import { createRoomInUi, roomBar } from '../fixtures/room';

const rail = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const card = (page: Page, name: string) => page.locator('.room-card').filter({ hasText: name });

test.describe('languages', () => {
  test('casual English changes the tone of the texts and is remembered', async ({ userPage, user }) => {
    const song = await uploadSong(user, `${unique('casual')}.mp3`);
    await userPage.goto('/settings');
    await userPage.getByRole('radio', { name: 'English (fun)' }).click();
    expect(await userPage.evaluate(() => localStorage.getItem('msc_language'))).toBe('en-casual');

    // a reload keeps the language; keys missing in the casual file fall back to plain English
    await userPage.goto('/library');
    await searchLibrary(userPage, song.title);
    await openMedia(userPage, song.title);
    await userPage.locator('aside.detail').getByRole('button', { name: 'Delete' }).click();
    const dialog = userPage.getByRole('dialog');
    await expect(dialog.getByRole('heading')).toHaveText('Send this item into oblivion?');
    await dialog.getByRole('button', { name: 'God, no!' }).click();

    await rail(userPage).getByRole('link', { name: 'Settings' }).click();
    await userPage.getByRole('radio', { name: 'English', exact: true }).click();
    await rail(userPage).getByRole('link', { name: 'Library' }).click();
    await searchLibrary(userPage, song.title);
    await openMedia(userPage, song.title);
    await userPage.locator('aside.detail').getByRole('button', { name: 'Delete' }).click();
    await expect(userPage.getByRole('dialog').getByRole('heading')).toHaveText('Delete this item?');
    await userPage.getByRole('dialog').getByRole('button', { name: 'Keep' }).click();
  });

  test("Hawky's Theme lays its texts over the language, the aria labels stay plain", async ({ userPage }) => {
    const name = unique('anime');
    await userPage.goto('/settings');
    await userPage.getByRole('radio', { name: "Hawky's Theme" }).click();

    await createRoomInUi(userPage, name);
    await expect(userPage.locator('.cover-title')).toHaveText('See you, Space Cowboy…');
    const previous = roomBar(userPage).getByRole('button', { name: 'Previous', exact: true });
    await expect(previous).toHaveAttribute('title', 'Previous: Return by Death');

    await rail(userPage).getByRole('link', { name: 'Lobbies' }).click();
    await expect(card(userPage, name).getByRole('button', { name: 'Fight!' })).toBeVisible();

    // another theme takes the layer away again
    await rail(userPage).getByRole('link', { name: 'Settings' }).click();
    await userPage.getByRole('radio', { name: 'Ocean' }).click();
    await rail(userPage).getByRole('link', { name: 'Lobbies' }).click();
    await expect(card(userPage, name).getByRole('button', { name: 'Join' })).toBeVisible();
  });
});
