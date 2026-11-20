import { Page } from '@playwright/test';
import { expect, test } from '../fixtures/auth';
import { unique } from '../fixtures/api';
import { libraryRow } from '../fixtures/library';
import { api, createPlaylist, playlistMedia, toneFile, uploadSong, uploadVideo, videoFile, videoSourceFile } from '../fixtures/media';

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

  test('a running upload shows its progress', async ({ userPage }) => {
    const name = `${unique('slow')}.mp3`;
    await userPage.goto('/upload');
    await userPage.locator('input[type=file]').setInputFiles(toneFile(name));
    // a local upload is over at once: the answer is held back to see the bar (the numbers are unit tested)
    await userPage.route('**/api/v1/media/upload/', async (route) => {
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({ response });
    });
    await userPage.getByRole('button', { name: 'Upload', exact: true }).click();

    const bar = userPage.getByRole('progressbar', { name: 'Progress of the upload' });
    await expect(bar).toBeVisible();
    await expect(userPage.getByRole('button', { name: `Remove ${name}` })).toBeDisabled();

    // the bar goes away with the upload
    await expect(userPage.getByText('No songs chosen yet.')).toBeVisible();
    await expect(bar).toHaveCount(0);
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

  test('deleting a song removes its file: the name is free for a new upload', async ({ user }) => {
    const name = `${unique('again')}.mp3`;
    const song = await uploadSong(user, name);
    // while the song exists its file name is taken
    await expect(uploadSong(user, name)).rejects.toThrow('HTTP 409');

    expect((await api(user, `/media/deleteSongById/${song.id}`, { method: 'PUT' })).status).toBe(200);

    const again = await uploadSong(user, name);
    expect(again.id).not.toBe(song.id);
  });

  test.describe('videos', () => {
    /** Opens the upload page in the video mode and waits for the switches: they are on once the server reported ffmpeg. */
    async function openVideoUpload(page: Page): Promise<void> {
      await page.goto('/upload');
      await page.getByRole('radiogroup', { name: 'What to upload' }).getByRole('radio', { name: 'Videos' }).click();
      await expect(page.getByText('No videos chosen yet.')).toBeVisible();
      await expect(page.getByRole('switch', { name: 'Preprocess' })).toBeChecked();
      await expect(page.getByRole('switch', { name: 'Thumbnails' })).toBeChecked();
    }

    test('an MP4 is stored as it is when both switches are off', async ({ userPage }) => {
      const title = unique('vid');
      await openVideoUpload(userPage);
      await userPage.getByRole('switch', { name: 'Preprocess' }).click();
      await userPage.getByRole('switch', { name: 'Thumbnails' }).click();
      await expect(userPage.getByRole('switch', { name: 'Burn in subtitles' })).toHaveCount(0);

      await userPage.locator('input[type=file]').setInputFiles(videoFile(`${title}.mp4`));
      await expect(userPage.locator('.summary')).toContainText('1 video');
      await userPage.getByRole('button', { name: 'Upload', exact: true }).click();
      await expect(userPage.getByText('No videos chosen yet.')).toBeVisible();
      // nothing for the server to work on
      await expect(userPage.getByRole('listitem').filter({ hasText: title })).toHaveCount(0);

      await userPage.goto('/library');
      await userPage.getByLabel('Search', { exact: true }).fill(title);
      await expect(libraryRow(userPage, title)).toBeVisible();
    });

    test('without preprocessing only MP4 files can be uploaded', async ({ userPage }) => {
      const name = `${unique('mkv')}.mkv`;
      await openVideoUpload(userPage);
      await userPage.locator('input[type=file]').setInputFiles(videoSourceFile(name));
      const upload = userPage.getByRole('button', { name: 'Upload', exact: true });
      await expect(upload).toBeEnabled();

      await userPage.getByRole('switch', { name: 'Preprocess' }).click();
      await expect(userPage.getByText('Without preprocessing only MP4 files can be uploaded.')).toBeVisible();
      await expect(upload).toBeDisabled();

      await userPage.getByRole('switch', { name: 'Preprocess' }).click();
      await expect(upload).toBeEnabled();
    });

    test('a video in another format is converted, gets thumbnails and shows up in the library', async ({ userPage, user }) => {
      test.slow();
      const title = unique('conv');
      await openVideoUpload(userPage);
      await userPage.locator('input[type=file]').setInputFiles(videoSourceFile(`${title}.mkv`));
      await userPage.getByRole('button', { name: 'Upload', exact: true }).click();

      const job = userPage.getByRole('listitem').filter({ hasText: title });
      await expect(job).toContainText('Converting');
      await expect(job).toContainText('Done', { timeout: 120_000 });

      const all: { id: number; title: string; type: string; uri: string }[] = (await (await api(user, '/media/all')).json()).content;
      const video = all.find((m) => m.title === title)!;
      expect(video.type).toBe('VIDEO');
      expect(video.uri).toBe(`/videos/uploaded/${title}.mp4`);
      // the result and the sprite of the seek bar next to it can be loaded like those of every video
      for (const kind of ['data', 'thumbnails']) {
        const signed = await (await api(user, `/media/${kind}/${video.id}?X-NPE-PSU-Duration=PT1H`)).text();
        const file = await fetch(signed);
        expect(file.status, kind).toBe(200);
        expect((await file.arrayBuffer()).byteLength, kind).toBeGreaterThan(1000);
      }

      await userPage.goto('/library');
      await userPage.getByLabel('Search', { exact: true }).fill(title);
      await expect(libraryRow(userPage, title)).toBeVisible();
    });

    test('the server refuses another format without preprocessing', async ({ user }) => {
      const form = new FormData();
      form.append('files', new Blob([new Uint8Array(8)]), `${unique('bad')}.mkv`);
      form.append('data', JSON.stringify({ preprocess: false, thumbnails: false }));
      expect((await api(user, '/media/videoUpload', { method: 'POST', body: form })).status).toBe(400);
      // the same file is taken once it is to be converted (the job then fails: it is no video)
      const converted = new FormData();
      converted.append('files', new Blob([new Uint8Array(8)]), `${unique('bad')}.mkv`);
      converted.append('data', JSON.stringify({ preprocess: true }));
      expect((await api(user, '/media/videoUpload', { method: 'POST', body: converted })).status).toBe(200);
    });

    test('deleting an uploaded video removes its file: the name is free for a new upload', async ({ user }) => {
      const name = `${unique('vagain')}.mp4`;
      const video = await uploadVideo(user, name);
      // while the video exists its file name is taken
      await expect(uploadVideo(user, name)).rejects.toThrow('HTTP 409');

      expect((await api(user, `/media/deleteSongById/${video.id}`, { method: 'PUT' })).status).toBe(200);

      const again = await uploadVideo(user, name);
      expect(again.id).not.toBe(video.id);
    });
  });
});
