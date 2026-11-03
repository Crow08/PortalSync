import { Page } from '@playwright/test';
import { expect, loginContext, test } from '../fixtures/auth';
import { createUser, unique } from '../fixtures/api';
import { openMedia } from '../fixtures/library';
import { addSongToPlaylist, api, createPlaylist, playlistMedia, uploadSong } from '../fixtures/media';

const collection = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Collections' }).getByRole('button', { name });
const owners = (page: Page) => page.getByRole('list', { name: 'Owners' });

test.describe('playlist ownership', () => {
  test('the creator is the only owner and manages the playlist', async ({ userPage, user }) => {
    const name = unique('own');
    await createPlaylist(user, name);
    await userPage.goto('/library');
    await collection(userPage, name).click();
    await expect(owners(userPage).getByRole('listitem')).toHaveCount(1);
    await expect(owners(userPage).getByRole('listitem')).toContainText(user.username);
    // the last owner cannot be removed
    await expect(userPage.getByRole('button', { name: /^Remove .* as an owner$/ })).toHaveCount(0);
    await expect(userPage.getByRole('button', { name: 'Add an owner' })).toBeVisible();
  });

  test('owners can be added and removed', async ({ userPage, user, admin }) => {
    const other = await createUser(admin, unique('co'), 'pw-other');
    const name = unique('own');
    await createPlaylist(user, name);
    await userPage.goto('/library');
    await collection(userPage, name).click();

    await userPage.getByRole('button', { name: 'Add an owner' }).click();
    await userPage.getByRole('menuitem', { name: other.username }).click();
    await expect(owners(userPage).getByRole('listitem')).toHaveCount(2);

    await userPage.getByRole('button', { name: `Remove ${other.username} as an owner` }).click();
    await expect(owners(userPage).getByRole('listitem')).toHaveCount(1);
  });

  test('non-owners see a read only playlist', async ({ userPage, user, browser, admin }) => {
    const other = await createUser(admin, unique('ro'), 'pw-other');
    const name = unique('private');
    const id = await createPlaylist(user, name);
    const song = await uploadSong(user, `${unique('ro')}.mp3`);
    await addSongToPlaylist(user, id, song.id);

    const ctx = await loginContext(browser, other);
    const page = await ctx.newPage();
    await page.goto('/library');
    await collection(page, name).click();
    await expect(page.locator('.access-chip')).toHaveText('Read only');
    await expect(page.getByRole('button', { name: 'Add an owner' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete this playlist' })).toHaveCount(0);
    await openMedia(page, song.title);
    await expect(page.getByRole('button', { name: 'Remove from this playlist' })).toHaveCount(0);

    // the server enforces the same rule
    const res = await api(other, `/playlists/${id}/addSongToPlaylist/${song.id}`, { method: 'PUT' });
    expect(res.status).toBe(403);
    await ctx.close();
  });

  test('public ownership lets everybody change songs but not the owners', async ({ userPage, user, browser, admin }) => {
    const other = await createUser(admin, unique('pub'), 'pw-other');
    const name = unique('public');
    const id = await createPlaylist(user, name);
    const song = await uploadSong(user, `${unique('pub')}.mp3`);
    await addSongToPlaylist(user, id, song.id);

    await userPage.goto('/library');
    await collection(userPage, name).click();
    await userPage.getByRole('radiogroup', { name: 'Who can change this playlist' }).getByRole('radio', { name: 'Public' }).click();
    await expect.poll(async () => (await api(user, `/playlists/${id}`)).json().then((p) => p.publicOwnership)).toBe(true);

    const ctx = await loginContext(browser, other);
    const page = await ctx.newPage();
    await page.goto('/library');
    await collection(page, name).click();
    await expect(page.locator('.access-chip')).toHaveText('Public: everyone can change it');
    await expect(page.getByRole('button', { name: 'Add an owner' })).toHaveCount(0);
    await openMedia(page, song.title);
    await page.getByRole('button', { name: 'Remove from this playlist' }).click();
    await expect(page.locator('p.empty')).toContainText('This playlist is empty.');
    expect(await playlistMedia(user, id)).toEqual([]);
    await ctx.close();
  });

  test('delete playlist asks first and keeps the media', async ({ userPage, user }) => {
    const name = unique('gone');
    const id = await createPlaylist(user, name);
    const song = await uploadSong(user, `${unique('keep')}.mp3`);
    await addSongToPlaylist(user, id, song.id);
    await userPage.goto('/library');
    await collection(userPage, name).click();

    await userPage.getByRole('button', { name: 'Delete this playlist' }).click();
    await userPage.getByRole('button', { name: 'Keep', exact: true }).click();
    await expect(collection(userPage, name)).toBeVisible();

    await userPage.getByRole('button', { name: 'Delete this playlist' }).click();
    await userPage.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(collection(userPage, name)).toHaveCount(0);
    const all: { title: string }[] = (await (await api(user, '/media/all')).json()).content;
    expect(all.some((m) => m.title === song.title)).toBe(true);
  });

  test('admins manage playlists of other users', async ({ browser, admin, user }) => {
    const name = unique('adm');
    await createPlaylist(user, name);
    const ctx = await loginContext(browser, admin);
    const page = await ctx.newPage();
    await page.goto('/library');
    await collection(page, name).click();
    await expect(page.getByRole('button', { name: 'Add an owner' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete this playlist' })).toBeVisible();
    await ctx.close();
  });
});
