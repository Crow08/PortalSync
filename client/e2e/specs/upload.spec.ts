import { expect, test } from '../fixtures/auth';
import { unique } from '../fixtures/api';
import { libraryRow } from '../fixtures/library';
import { createPlaylist, playlistMedia, toneFile } from '../fixtures/media';

test.describe('upload', () => {
  test('lists chosen files, removes one and keeps Upload disabled without files', async ({ userPage }) => {
    const a = `${unique('up')}-a.mp3`;
    const b = `${unique('up')}-b.mp3`;
    await userPage.goto('/upload');
    const upload = userPage.getByRole('button', { name: 'Upload', exact: true });
    await expect(upload).toBeDisabled();
    await expect(userPage.getByText('No songs chosen yet.')).toBeVisible();

    await userPage.locator('input[type=file]').setInputFiles([toneFile(a), toneFile(b)]);
    await expect(userPage.getByRole('listitem').filter({ hasText: a })).toBeVisible();
    await expect(userPage.locator('.summary')).toContainText('2 songs');
    await expect(upload).toBeEnabled();

    await userPage.getByRole('button', { name: `Remove ${a}` }).click();
    await expect(userPage.getByRole('listitem').filter({ hasText: a })).toHaveCount(0);
    await expect(userPage.locator('.summary')).toContainText('1 song');
  });

  test('uploaded songs show up in the library', async ({ userPage }) => {
    const name = `${unique('lib')}.mp3`;
    await userPage.goto('/upload');
    await userPage.locator('input[type=file]').setInputFiles(toneFile(name));
    await userPage.getByRole('button', { name: 'Upload', exact: true }).click();
    await expect(userPage.getByText('No songs chosen yet.')).toBeVisible();

    await userPage.goto('/library');
    await userPage.getByLabel('Search', { exact: true }).fill(name);
    await expect(libraryRow(userPage, name)).toBeVisible();
  });

  test('a song can be added to a playlist during the upload', async ({ userPage, user }) => {
    const playlist = unique('upl');
    const id = await createPlaylist(user, playlist);
    const name = `${unique('pl')}.mp3`;
    await userPage.goto('/upload');
    await userPage.locator('input[type=file]').setInputFiles(toneFile(name));
    await userPage.locator('app-input-playlist').getByRole('combobox').fill(playlist);
    await userPage.getByRole('option', { name: new RegExp(`${id} - ${playlist}`) }).click();
    await userPage.getByRole('button', { name: 'Upload', exact: true }).click();
    await expect(userPage.getByText('No songs chosen yet.')).toBeVisible();
    await expect.poll(async () => (await playlistMedia(user, id)).map((m) => m.title)).toEqual([name]);
  });

  test('uploading the same file name twice fails and keeps the files listed', async ({ userPage }) => {
    const name = `${unique('dup')}.mp3`;
    for (const expectDone of [true, false]) {
      await userPage.goto('/upload');
      await userPage.locator('input[type=file]').setInputFiles(toneFile(name));
      await userPage.getByRole('button', { name: 'Upload', exact: true }).click();
      if (expectDone) {
        await expect(userPage.getByText('No songs chosen yet.')).toBeVisible();
      } else {
        await expect(userPage.getByRole('listitem').filter({ hasText: name })).toBeVisible();
        await expect(userPage.getByRole('button', { name: 'Upload', exact: true })).toBeEnabled();
      }
    }
  });
});
