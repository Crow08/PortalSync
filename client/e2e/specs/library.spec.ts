import { expect, test } from '../fixtures/auth';
import { createUser, unique } from '../fixtures/api';
import { libraryRow, openMedia, pickMedia, searchLibrary } from '../fixtures/library';
import { addSongToPlaylist, api, createPlaylist, playlistMedia, sharedMedia, uploadSong } from '../fixtures/media';

test.describe('library', () => {
  test('shows the shared media and filters by type and search', async ({ userPage }) => {
    const { songs, video } = sharedMedia();
    await userPage.goto('/library');
    await searchLibrary(userPage, 'e2e-shared');
    await expect(userPage.locator('.list .row')).toHaveCount(4);
    await expect(userPage.locator('.footer .count')).toContainText('4 items');

    const type = userPage.getByRole('radiogroup', { name: 'Media type' });
    await type.getByRole('radio', { name: 'Videos' }).click();
    await expect(userPage.locator('.list .row')).toHaveCount(1);
    await expect(libraryRow(userPage, video.title)).toBeVisible();
    await type.getByRole('radio', { name: 'Songs' }).click();
    await expect(userPage.locator('.list .row')).toHaveCount(songs.length);
    await type.getByRole('radio', { name: 'All' }).click();

    await searchLibrary(userPage, 'zzz-no-match-zzz');
    await expect(userPage.locator('p.empty')).toContainText('Nothing matches.');
  });

  test('sorts by title', async ({ userPage }) => {
    await userPage.goto('/library');
    await searchLibrary(userPage, 'e2e-shared-song');
    await userPage.getByRole('combobox', { name: 'Sort by' }).click();
    await userPage.getByRole('option', { name: 'Title A to Z' }).click();
    const titles = await userPage.locator('.list .row .title').allTextContents();
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    // the list of options closes with an animation: a click on the dropdown while it is still closing does not open
    // it again (seen once on the slower CI runner)
    await expect(userPage.getByRole('listbox')).toBeHidden();
    await userPage.getByRole('combobox', { name: 'Sort by' }).click();
    await userPage.getByRole('option', { name: 'Recently added' }).click();
    await expect(userPage.locator('.list .row')).toHaveCount(titles.length);
  });

  test('detail panel shows the item, without a room there is no play button', async ({ userPage }) => {
    const { songs, video } = sharedMedia();
    await userPage.goto('/library');
    await searchLibrary(userPage, 'e2e-shared');
    await openMedia(userPage, songs[0].title);
    const detail = userPage.locator('aside.detail');
    await expect(detail.getByRole('heading', { name: songs[0].title })).toBeVisible();
    await expect(detail.locator('.chip')).toHaveText('Song');
    await expect(libraryRow(userPage, songs[0].title)).toHaveClass(/\bon\b/);
    await expect(detail.getByText('Join a lobby to play this.')).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Play now' })).toHaveCount(0);
    // the shared media belong to the admin: other users can not edit or delete them
    await expect(detail.getByRole('button', { name: 'Add to playlist' })).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Delete' })).toHaveCount(0);

    await openMedia(userPage, video.title);
    await expect(detail.locator('.chip')).toHaveText('Video');
    await expect(detail.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  });

  test('selection toolbar counts, selects all and clears', async ({ userPage }) => {
    await userPage.goto('/library');
    await searchLibrary(userPage, 'e2e-shared');
    await pickMedia(userPage, 'e2e-shared-song-a.mp3').click();
    const bulk = userPage.getByRole('toolbar', { name: 'Selection' });
    await expect(bulk).toContainText('1 selected');
    await userPage.getByRole('button', { name: 'Select all' }).click();
    await expect(bulk).toContainText('4 selected');
    await userPage.getByRole('button', { name: 'Deselect all' }).click();
    await expect(bulk).toHaveCount(0);
    await pickMedia(userPage, 'e2e-shared-song-b.mp3').click();
    await bulk.getByRole('button', { name: 'Clear' }).click();
    await expect(bulk).toHaveCount(0);
  });

  test('a long list is a virtual list: only the visible rows exist, the others come with scrolling', async ({
    userPage,
    user,
  }) => {
    const prefix = unique('many');
    const titles: string[] = [];
    for (let i = 0; i < 40; i++) {
      titles.push(`${prefix}-${String(i).padStart(2, '0')}.mp3`);
      await uploadSong(user, titles[i]);
    }
    await userPage.goto('/library');
    await searchLibrary(userPage, prefix);
    await expect(userPage.locator('.footer .count')).toContainText('40 items of');
    // sorted by title: the first is there at once, the last is not rendered yet
    await expect(libraryRow(userPage, titles[0])).toBeVisible();
    expect(await userPage.locator('.list .row').count()).toBeLessThan(40);
    await expect(libraryRow(userPage, titles[39])).toHaveCount(0);

    await userPage.locator('.list').evaluate((element) => (element.scrollTop = element.scrollHeight));
    await expect(libraryRow(userPage, titles[39])).toBeVisible();
    await expect(libraryRow(userPage, titles[0])).toHaveCount(0);

    // a new search starts at the top again
    await searchLibrary(userPage, titles[5]);
    await expect(userPage.locator('.footer .count')).toContainText('1 item');
    await expect(libraryRow(userPage, titles[5])).toBeVisible();
  });

  test('adds a song to a playlist and shows it in the collection', async ({ userPage, user }) => {
    const song = await uploadSong(user, `${unique('pl')}.mp3`);
    const name = unique('list');
    await createPlaylist(user, name);
    await userPage.goto('/library');
    await searchLibrary(userPage, song.title);
    await openMedia(userPage, song.title);
    await userPage.locator('aside.detail').getByRole('button', { name: 'Add to playlist' }).click();
    const dialog = userPage.getByRole('dialog');
    await dialog.getByRole('option', { name }).click();
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog).toBeHidden();

    await userPage.reload();
    await userPage.getByRole('navigation', { name: 'Collections' }).getByRole('button', { name }).click();
    await expect(libraryRow(userPage, song.title)).toBeVisible();
  });

  test('a new playlist can be created in the add to playlist dialog', async ({ userPage, user }) => {
    const song = await uploadSong(user, `${unique('newpl')}.mp3`);
    const name = unique('fresh');
    await userPage.goto('/library');
    await searchLibrary(userPage, song.title);
    await openMedia(userPage, song.title);
    await userPage.locator('aside.detail').getByRole('button', { name: 'Add to playlist' }).click();
    const dialog = userPage.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
    await dialog.getByLabel('Name of a new playlist').fill(name);
    await dialog.getByRole('button', { name: 'Create' }).click();
    // the new playlist is selected
    await expect(dialog.getByRole('option', { name })).toHaveAttribute('aria-selected', 'true');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog).toBeHidden();

    await userPage.reload();
    await userPage.getByRole('navigation', { name: 'Collections' }).getByRole('button', { name }).click();
    await expect(libraryRow(userPage, song.title)).toBeVisible();
  });

  test('bulk add of several songs to a playlist', async ({ userPage, user }) => {
    const prefix = unique('bulk');
    const a = await uploadSong(user, `${prefix}-a.mp3`);
    const b = await uploadSong(user, `${prefix}-b.mp3`);
    const name = unique('list');
    const id = await createPlaylist(user, name);
    await userPage.goto('/library');
    await searchLibrary(userPage, prefix);
    await userPage.getByRole('button', { name: 'Select all' }).click();
    await userPage.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Add to playlist' }).click();
    const dialog = userPage.getByRole('dialog');
    await dialog.getByRole('option', { name }).click();
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect.poll(async () => (await playlistMedia(user, id)).map((m) => m.id).sort()).toEqual([a.id, b.id].sort());
    await expect(dialog).toBeHidden();
  });

  test('removes a song from the shown playlist', async ({ userPage, user }) => {
    const song = await uploadSong(user, `${unique('rm')}.mp3`);
    const name = unique('list');
    const id = await createPlaylist(user, name);
    await addSongToPlaylist(user, id, song.id);
    await userPage.goto('/library');
    await userPage.getByRole('navigation', { name: 'Collections' }).getByRole('button', { name }).click();
    await openMedia(userPage, song.title);
    await userPage.getByRole('button', { name: 'Remove from this playlist' }).click();
    await expect(userPage.locator('p.empty')).toContainText('This playlist is empty.');
    expect(await playlistMedia(user, id)).toEqual([]);
  });

  test('every listed media of a playlist can be taken out of it in its row', async ({ userPage, user, admin }) => {
    const prefix = unique('row');
    const keep = await uploadSong(user, `${prefix}-keep.mp3`);
    const drop = await uploadSong(user, `${prefix}-drop.mp3`);
    const name = unique('list');
    const id = await createPlaylist(user, name);
    await addSongToPlaylist(user, id, keep.id);
    await addSongToPlaylist(user, id, drop.id);
    const foreign = unique('foreign');
    await addSongToPlaylist(admin, await createPlaylist(admin, foreign), keep.id);
    const collections = userPage.getByRole('navigation', { name: 'Collections' });
    const removeButtons = userPage.locator('.list .row .row-remove');
    await userPage.goto('/library');

    // the whole library is no playlist: nothing to remove from
    await searchLibrary(userPage, prefix);
    await expect(userPage.locator('.list .row')).toHaveCount(2);
    await expect(removeButtons).toHaveCount(0);

    // a playlist of someone else is read only
    await collections.getByRole('button', { name: foreign }).click();
    await expect(libraryRow(userPage, keep.title)).toBeVisible();
    await expect(removeButtons).toHaveCount(0);

    // the own playlist, filtered: the listed media has the option
    await collections.getByRole('button', { name }).click();
    await expect(removeButtons).toHaveCount(2);
    await searchLibrary(userPage, 'drop');
    await expect(removeButtons).toHaveCount(1);
    await userPage.getByRole('button', { name: `Remove ${drop.title} from this playlist` }).click();

    await searchLibrary(userPage, '');
    await expect(libraryRow(userPage, keep.title)).toBeVisible();
    await expect(libraryRow(userPage, drop.title)).toHaveCount(0);
    expect((await playlistMedia(user, id)).map((media) => media.id)).toEqual([keep.id]);
    // the media itself stays in the library
    await collections.getByRole('button', { name: 'All media' }).click();
    await searchLibrary(userPage, prefix);
    await expect(userPage.locator('.list .row')).toHaveCount(2);
  });

  test('songs in a playlist and with ratings can be deleted; they leave the playlist', async ({ userPage, user }) => {
    const prefix = unique('inlist');
    const a = await uploadSong(user, `${prefix}-a.mp3`);
    const b = await uploadSong(user, `${prefix}-b.mp3`);
    const keep = await uploadSong(user, `${prefix}-keep.mp3`);
    const id = await createPlaylist(user, unique('list'));
    for (const song of [a, b, keep]) {
      await addSongToPlaylist(user, id, song.id);
    }
    expect((await api(user, `/ratings/${a.id}/addUserRating/4`, { method: 'PUT' })).status).toBe(200);
    await userPage.goto('/library');
    await searchLibrary(userPage, prefix);
    await pickMedia(userPage, a.title).click();
    await pickMedia(userPage, b.title).click();

    await userPage.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Delete' }).click();
    await userPage.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(libraryRow(userPage, a.title)).toHaveCount(0);
    await expect(libraryRow(userPage, b.title)).toHaveCount(0);
    expect((await playlistMedia(user, id)).map((media) => media.id)).toEqual([keep.id]);
    // one at a time as well
    expect((await api(user, `/media/deleteSongById/${keep.id}`, { method: 'PUT' })).status).toBe(200);
    expect(await playlistMedia(user, id)).toEqual([]);
  });

  test('delete asks for confirmation; "no" keeps the song, "yes" removes it', async ({ userPage, user }) => {
    const song = await uploadSong(user, `${unique('del')}.mp3`);
    await userPage.goto('/library');
    await searchLibrary(userPage, song.title);
    await openMedia(userPage, song.title);
    const detail = userPage.locator('aside.detail');

    await detail.getByRole('button', { name: 'Delete' }).click();
    await userPage.getByRole('dialog').getByRole('button', { name: 'Keep' }).click();
    await expect(libraryRow(userPage, song.title)).toBeVisible();

    await detail.getByRole('button', { name: 'Delete' }).click();
    await userPage.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(libraryRow(userPage, song.title)).toHaveCount(0);
  });

  test('bulk delete removes all selected songs', async ({ userPage, user }) => {
    const prefix = unique('bd');
    await uploadSong(user, `${prefix}-a.mp3`);
    await uploadSong(user, `${prefix}-b.mp3`);
    await userPage.goto('/library');
    await searchLibrary(userPage, prefix);
    await expect(userPage.locator('.list .row')).toHaveCount(2);
    await userPage.getByRole('button', { name: 'Select all' }).click();
    await userPage.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Delete' }).click();
    await userPage.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(userPage.locator('.list .row')).toHaveCount(0);
  });

  test('the own filters show only the media and the playlists of the user', async ({ userPage, user, admin }) => {
    const other = await createUser(admin, unique('flt'), 'pw-other');
    const prefix = unique('own');
    const mine = await uploadSong(user, `${prefix}-mine.mp3`);
    const theirs = await uploadSong(other, `${prefix}-theirs.mp3`);
    const myList = unique('mylist');
    const theirList = unique('theirlist');
    await createPlaylist(user, myList);
    await createPlaylist(other, theirList);
    await userPage.goto('/library');
    await searchLibrary(userPage, prefix);
    await expect(userPage.locator('.list .row')).toHaveCount(2);

    const onlyMyMedia = userPage.getByRole('switch', { name: 'Only my media' });
    await onlyMyMedia.click();
    await expect(onlyMyMedia).toBeChecked();
    await expect(libraryRow(userPage, mine.title)).toBeVisible();
    await expect(libraryRow(userPage, theirs.title)).toHaveCount(0);
    await onlyMyMedia.click();
    await expect(userPage.locator('.list .row')).toHaveCount(2);

    const collections = userPage.getByRole('navigation', { name: 'Collections' });
    await expect(collections.getByRole('button', { name: theirList })).toBeVisible();
    await collections.getByRole('switch', { name: 'Only my playlists' }).click();
    await expect(collections.getByRole('button', { name: myList })).toBeVisible();
    await expect(collections.getByRole('button', { name: theirList })).toHaveCount(0);
    // the library itself is no playlist and stays
    await expect(collections.getByRole('button', { name: 'All media' })).toBeVisible();
  });

  test("the own filter of the playlists says so when none of them is the user's", async ({ userPage, admin }) => {
    await createPlaylist(admin, unique('notmine'));
    await userPage.goto('/library');
    const collections = userPage.getByRole('navigation', { name: 'Collections' });

    await collections.getByRole('switch', { name: 'Only my playlists' }).click();

    await expect(collections.getByText('None of the playlists is yours.')).toBeVisible();
  });

  test('shows who owns a media', async ({ userPage, user, admin }) => {
    const other = await createUser(admin, unique('own'), 'pw-owner');
    const prefix = unique('whose');
    const mine = await uploadSong(user, `${prefix}-mine.mp3`);
    const theirs = await uploadSong(other, `${prefix}-theirs.mp3`);
    await userPage.goto('/library');
    await searchLibrary(userPage, prefix);
    const meta = userPage.locator('aside.detail dl.meta');
    const ownerOf = (title: string) => libraryRow(userPage, title).locator('.row-owner');

    // in the list: the name of the owner, the own media stand out
    await expect(ownerOf(theirs.title)).toHaveText(new RegExp(other.username));
    await expect(ownerOf(theirs.title)).not.toHaveClass(/mine/);
    await expect(ownerOf(mine.title)).toHaveText(new RegExp(user.username));
    await expect(ownerOf(mine.title)).toHaveClass(/mine/);

    await openMedia(userPage, theirs.title);
    await expect(meta.locator('div', { hasText: 'Owner' }).locator('dd')).toHaveText(other.username);
    await openMedia(userPage, mine.title);
    await expect(meta.locator('div', { hasText: 'Owner' }).locator('dd')).toHaveText(`${user.username} (you)`);

    // the shared video was put into the database by SQL: nobody owns it
    const { video } = sharedMedia();
    await searchLibrary(userPage, video.title);
    await expect(ownerOf(video.title)).toHaveCount(0);
    await openMedia(userPage, video.title);
    await expect(meta.locator('div', { hasText: 'Owner' }).locator('dd')).toHaveText('Nobody (admins only)');
  });

  test('only the owner and admins can edit and delete a song', async ({ userPage, user, admin }) => {
    const owner = await createUser(admin, unique('own'), 'pw-owner');
    const song = await uploadSong(owner, `${unique('owned')}.mp3`);
    await userPage.goto('/library');
    await searchLibrary(userPage, song.title);
    await openMedia(userPage, song.title);
    const detail = userPage.locator('aside.detail');
    await expect(detail.getByRole('button', { name: 'Add to playlist' })).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Delete' })).toHaveCount(0);

    // the server rejects it as well, a bulk delete with one foreign song deletes nothing
    const own = await uploadSong(user, `${unique('mine')}.mp3`);
    const json = { 'Content-Type': 'application/json' };
    expect((await api(user, `/media/deleteSongById/${song.id}`, { method: 'PUT' })).status).toBe(403);
    const bulk = await api(user, '/media/deleteSongs', { method: 'PUT', headers: json, body: JSON.stringify([own, song]) });
    expect(bulk.status).toBe(403);
    const edit = await api(user, '/media/editSong', {
      method: 'PUT',
      headers: json,
      body: JSON.stringify({ id: song.id, type: 'SONG', title: 'taken over', genres: [], tags: [] }),
    });
    expect(edit.status).toBe(403);
    const titles = async () =>
      ((await (await api(user, '/media/all')).json()).content as { title: string }[]).map((m) => m.title);
    expect(await titles()).toEqual(expect.arrayContaining([song.title, own.title]));

    expect((await api(admin, `/media/deleteSongById/${song.id}`, { method: 'PUT' })).status).toBe(200);
    expect(await titles()).not.toContain(song.title);
  });

  test('edit dialog renames a song', async ({ userPage, user }) => {
    const song = await uploadSong(user, `${unique('edit')}.mp3`);
    await userPage.goto('/library');
    await searchLibrary(userPage, song.title);
    await openMedia(userPage, song.title);
    await userPage.locator('aside.detail').getByRole('button', { name: 'Edit' }).click();
    const title = `${unique('renamed')}`;
    await userPage.getByLabel('Song title').fill(title);
    await userPage.getByRole('button', { name: 'Save' }).click();
    await searchLibrary(userPage, title);
    await expect(libraryRow(userPage, title)).toBeVisible();
  });

  test('a new artist can be created from the edit dialog', async ({ userPage, user }) => {
    const song = await uploadSong(user, `${unique('art')}.mp3`);
    const artist = unique('artist');
    await userPage.goto('/library');
    await searchLibrary(userPage, song.title);
    await openMedia(userPage, song.title);
    await userPage.locator('aside.detail').getByRole('button', { name: 'Edit' }).click();
    await userPage.locator('app-input-artist').getByRole('button', { name: 'Add new' }).click();
    const create = userPage.getByRole('dialog').filter({ hasText: 'New Artist' });
    await create.getByRole('textbox').fill(artist);
    await create.getByRole('button', { name: 'Create' }).click();
    await expect(create).toBeHidden();
    await userPage.locator('app-input-artist').getByRole('combobox').fill(artist);
    await expect(userPage.getByRole('option', { name: new RegExp(artist) })).toBeVisible();
  });
});
