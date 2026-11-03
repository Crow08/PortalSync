import { chromium, Page } from '@playwright/test';
import { expect, loginContext, test as base } from '../fixtures/auth';
import { Account, createUser, unique } from '../fixtures/api';
import { api, uploadSong } from '../fixtures/media';
import { openMedia } from '../fixtures/library';
import { backToRoom, libraryAction, roomBar, seconds, startRoom } from '../fixtures/room';
import { connectStomp } from '../fixtures/stomp';
import { BASE_URL } from '../env';

const [A, B] = ['e2e-shared-song-a.mp3', 'e2e-shared-song-b.mp3'];

interface Guest {
  guest: Account;
  guestPage: Page;
}

const test = base.extend<Guest>({
  guest: async ({ admin }, use) => use(await createUser(admin, unique('g'), 'e2e-guest-password')),
  guestPage: async ({ browser, guest }, use) => {
    const ctx = await loginContext(browser, guest);
    await use(await ctx.newPage());
    await ctx.close();
  },
});

const nowTitle = (page: Page) => roomBar(page).locator('.now-title');
const play = (page: Page) => roomBar(page).locator('button.play');
const time = (page: Page) => roomBar(page).locator('.time-display');
const people = (page: Page) => page.getByRole('radiogroup', { name: 'Side panel' }).getByRole('radio', { name: /People/ });
const roomId = (page: Page) => Number(/sessions\/(\d+)\/lobby/.exec(page.url())![1]);

async function join(page: Page, roomName: string): Promise<void> {
  await page.goto('/');
  await page.locator('.room-card').filter({ hasText: roomName }).getByRole('button', { name: 'Join' }).click();
  await expect(page).toHaveURL(/\/lobby$/);
  await expect(nowTitle(page)).not.toHaveText('Nothing playing');
}

/** Host plays, guest joined. Returns the room name. */
async function hostAndGuest(host: Page, guest: Page, titles = [A, B]): Promise<string> {
  const name = unique('multi');
  await startRoom(host, name, titles);
  await join(guest, name);
  return name;
}

test.describe('multi user rooms', () => {
  test('a guest joining shows up for everybody', async ({ userPage, user, guestPage, guest }) => {
    const name = await hostAndGuest(userPage, guestPage);
    await expect(people(userPage)).toContainText('2');
    await expect(people(guestPage)).toContainText('2');
    await expect(userPage.locator('#header .live-chip')).toContainText('2 here');

    await people(userPage).click();
    await expect(userPage.locator('.person-name')).toHaveText([user.username, guest.username], { useInnerText: true });
    await expect(userPage.locator('.summary .avatar.small')).toHaveCount(2);

    // client side navigation: a reload would drop the connection of the host for a moment
    await userPage.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Lobbies' }).click();
    await expect(userPage.locator('.room-card').filter({ hasText: name }).locator('.count')).toHaveText('2 listening');
  });

  test('both users are ready after the media loaded', async ({ userPage, guestPage }) => {
    await hostAndGuest(userPage, guestPage);
    await people(guestPage).click();
    await expect(guestPage.locator('.person mat-icon.state.ready')).toHaveCount(2);
    await expect(guestPage.locator('.summary')).toContainText('ready');
  });

  test('play, pause, next and queue changes reach the other user', async ({ userPage, guestPage }) => {
    await hostAndGuest(userPage, guestPage);
    // the guest joined a running room
    await expect(play(guestPage)).toHaveAccessibleName('Pause');

    await play(guestPage).click();
    await expect(play(userPage)).toHaveAccessibleName('Play');
    await expect(play(guestPage)).toHaveAccessibleName('Play');
    await play(userPage).click();
    await expect(play(guestPage)).toHaveAccessibleName('Pause');

    await guestPage.getByRole('button', { name: 'Next', exact: true }).first().click();
    await expect(nowTitle(userPage)).toHaveText(B);
    await expect(nowTitle(guestPage)).toHaveText(B);

    // a song added by the guest appears in the queue of the host
    await libraryAction(guestPage, 'e2e-shared-song-c.mp3', 'Add to queue');
    await backToRoom(guestPage);
    await expect(userPage.getByRole('button', { name: 'Play e2e-shared-song-c.mp3' })).toBeVisible();
  });

  test('both users play at about the same position', async ({ userPage, guestPage }) => {
    await hostAndGuest(userPage, guestPage, [A]);
    await expect.poll(() => seconds(time(userPage)), { timeout: 20_000 }).toBeGreaterThanOrEqual(5);
    await expect.poll(() => seconds(time(guestPage)), { timeout: 20_000 }).toBeGreaterThanOrEqual(3);
    const [a, b] = [await seconds(time(userPage)), await seconds(time(guestPage))];
    expect(Math.abs(a - b)).toBeLessThanOrEqual(2);
  });

  test('a seek by one user moves the other', async ({ userPage, guestPage }) => {
    await hostAndGuest(userPage, guestPage, [A]);
    const slider = roomBar(guestPage).locator('app-player-track mat-slider');
    // the guest has to know the duration and be playing before the bar can be used
    await expect(time(guestPage)).toContainText('/ 01:00');
    await expect.poll(() => seconds(time(guestPage)), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
    const box = (await slider.boundingBox())!;
    expect(await seconds(time(userPage))).toBeLessThan(10);
    await guestPage.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
    // natural progress cannot reach 20 s within the timeout, only the jump can
    await expect.poll(() => seconds(time(userPage)), { timeout: 10_000 }).toBeGreaterThanOrEqual(20);
  });

  test('leaving and returning to the lobby keeps the playback going', async ({ userPage, guestPage }) => {
    await hostAndGuest(userPage, guestPage, [A]);
    await expect.poll(() => seconds(time(guestPage)), { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
    const before = await seconds(time(guestPage));
    await guestPage.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
    await backToRoom(guestPage);
    // no second join: the position does not restart
    expect(await seconds(time(guestPage))).toBeGreaterThanOrEqual(before);
    await expect(people(userPage)).toContainText('2');
  });

  test('a reload rejoins the room', async ({ userPage, guestPage }) => {
    await hostAndGuest(userPage, guestPage, [A]);
    await guestPage.reload();
    await expect(nowTitle(guestPage)).toHaveText(A);
    await expect(people(guestPage)).toContainText('2');
    await expect(people(userPage)).toContainText('2');
    await expect(play(userPage)).toHaveAccessibleName('Pause');
  });

  test('logging out removes the guest from the room', async ({ userPage, guestPage, guest }) => {
    await hostAndGuest(userPage, guestPage);
    await guestPage.getByRole('button', { name: `Account menu of ${guest.username}` }).click();
    await guestPage.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(people(userPage)).toContainText('1');
    await expect(play(userPage)).toHaveAccessibleName('Pause');
  });

  test('deleting the room sends the guest back to the room list', async ({ userPage, guestPage }) => {
    const name = await hostAndGuest(userPage, guestPage);
    await userPage.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Lobbies' }).click();
    await userPage.locator('.room-card').filter({ hasText: name }).getByRole('button', { name: 'Delete lobby' }).click();
    await userPage.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(guestPage).toHaveURL(/\/$/);
    await expect(guestPage.locator('.http-error-notification')).toContainText('The session has been deleted');
    await expect(guestPage.locator('#header .session-link')).toHaveCount(0);
    await expect(userPage.locator('.room-card').filter({ hasText: name })).toHaveCount(0);
  });

  test('a user who did not join cannot control the room', async ({ userPage, guest }) => {
    await startRoom(userPage, unique('closed'), [A, B]);
    const id = roomId(userPage);
    const stranger = await connectStomp(guest);
    try {
      stranger.client.publish({ destination: `/app/sessions/${id}/commands/skip` });
      await expect.poll(() => stranger.errors.map((e) => e.message)).toContain('You are not a member of this session');
    } finally {
      await stranger.close();
    }
    await expect(nowTitle(userPage)).toHaveText(A);
  });

  test('a failed command shows an error notification', async ({ userPage, user }) => {
    const song = await uploadSong(user, `${unique('gone')}.mp3`);
    await startRoom(userPage, unique('err'), [A]);
    await userPage.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
    await userPage.getByLabel('Search', { exact: true }).fill(song.title);
    await openMedia(userPage, song.title);
    // the song disappears behind the back of the page
    const del = await api(user, `/media/deleteSongById/${song.id}`, { method: 'PUT' });
    expect(del.ok).toBe(true);
    await userPage.locator('aside.detail').getByRole('button', { name: 'Add to queue', exact: true }).click();
    await expect(userPage.locator('.http-error-notification')).toContainText('Media not found');
  });
});

test.describe('autoplay and layout', () => {
  test('a guest without interaction plays muted until the first click', async ({ userPage, guest, admin }) => {
    const name = unique('muted');
    await startRoom(userPage, name, [A]);

    // a browser with the default autoplay policy (the fixture browser allows autoplay)
    const strict = await chromium.launch();
    try {
      const ctx = await strict.newContext({
        baseURL: BASE_URL,
        storageState: {
          cookies: [],
          origins: [
            {
              origin: BASE_URL,
              localStorage: [
                {
                  name: 'currentUser',
                  value: JSON.stringify({ ...guest, authdata: Buffer.from(`${guest.username}:${guest.password}`).toString('base64') }),
                },
              ],
            },
          ],
        },
      });
      const page = await ctx.newPage();
      await page.goto(`/sessions/${roomId(userPage)}/lobby`);
      await expect(nowTitle(page)).toHaveText(A);
      const hint = page.getByText('Playing muted. Click anywhere to unmute.');
      await expect(hint).toBeVisible();
      await page.locator('section.main .stage').click();
      await expect(hint).toBeHidden();
      await ctx.close();
    } finally {
      await strict.close();
    }
  });

  test('the lobby is usable on a phone', async ({ userPage }) => {
    await userPage.setViewportSize({ width: 390, height: 800 });
    await startRoom(userPage, unique('phone'), [A, B]);
    await expect(nowTitle(userPage)).toHaveText(A);
    await expect(play(userPage)).toBeVisible();
    await play(userPage).click();
    await expect(play(userPage)).toHaveAccessibleName('Play');
    const rail = userPage.getByRole('navigation', { name: 'Main' });
    expect((await rail.boundingBox())!.y).toBeGreaterThan(400);
    await userPage.getByRole('radio', { name: /Queue/ }).scrollIntoViewIfNeeded();
    await expect(userPage.getByRole('radio', { name: /Queue/ })).toBeVisible();
  });
});
