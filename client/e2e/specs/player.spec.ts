import { Page } from '@playwright/test';
import { expect, test } from '../fixtures/auth';
import { unique } from '../fixtures/api';
import { sharedMedia } from '../fixtures/media';
import { backToRoom, createRoomInUi, libraryAction, roomBar, seconds, startRoom } from '../fixtures/room';

const [A, B, C] = ['e2e-shared-song-a.mp3', 'e2e-shared-song-b.mp3', 'e2e-shared-song-c.mp3'];

test.beforeEach(async ({ userPage }) => {
  await userPage.addInitScript(() => localStorage.setItem('msc_defaultTimeSkipLength', '10'));
});

const nowTitle = (page: Page) => page.locator('section.main .bar .now-title');
const time = (page: Page) => roomBar(page).locator('.time-display');
const play = (page: Page) => roomBar(page).locator('button.play');
const queueTab = (page: Page) => page.getByRole('radiogroup', { name: 'Side panel' });

test.describe('player (single user)', () => {
  test('an empty room shows the empty state', async ({ userPage }) => {
    await createRoomInUi(userPage, unique('empty'));
    await expect(nowTitle(userPage)).toHaveText('Nothing playing');
    await expect(userPage.locator('.cover-title')).toHaveText('Nothing playing');
    await expect(userPage.getByRole('link', { name: 'Add from the library' })).toBeVisible();
  });

  test('"Play now" starts the song, the position advances', async ({ userPage }) => {
    await startRoom(userPage, unique('play'), [A]);
    await expect(nowTitle(userPage)).toHaveText(A);
    await expect(play(userPage)).toHaveAccessibleName('Pause');
    await expect.poll(() => seconds(time(userPage)), { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
    await expect(time(userPage)).toContainText('/ 01:00');
  });

  test('pause stops the position, play resumes it', async ({ userPage }) => {
    await startRoom(userPage, unique('pause'), [A]);
    await expect.poll(() => seconds(time(userPage)), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
    await play(userPage).click();
    await expect(play(userPage)).toHaveAccessibleName('Play');
    const frozen = await seconds(time(userPage));
    await userPage.waitForTimeout(2500);
    expect(await seconds(time(userPage))).toBe(frozen);
    await play(userPage).click();
    await expect(play(userPage)).toHaveAccessibleName('Pause');
    await expect.poll(() => seconds(time(userPage)), { timeout: 20_000 }).toBeGreaterThan(frozen);
  });

  test('queue: next and previous move through the songs', async ({ userPage }) => {
    await startRoom(userPage, unique('nav'), [A, B, C]);
    await expect(queueTab(userPage).getByText(/^Queue\s*3$/)).toBeVisible();
    await expect(nowTitle(userPage)).toHaveText(A);
    await userPage.getByRole('button', { name: 'Next', exact: true }).first().click();
    await expect(nowTitle(userPage)).toHaveText(B);
    await userPage.getByRole('button', { name: 'Next', exact: true }).first().click();
    await expect(nowTitle(userPage)).toHaveText(C);
    await userPage.getByRole('button', { name: 'Previous', exact: true }).first().click();
    await expect(nowTitle(userPage)).toHaveText(B);
  });

  test('queue rows: jump to a song and remove one', async ({ userPage }) => {
    await startRoom(userPage, unique('rows'), [A, B, C]);
    await userPage.getByRole('button', { name: `Play ${C}` }).click();
    await expect(nowTitle(userPage)).toHaveText(C);
    // the remove button of a row only shows (and takes space) while the row is hovered
    const rowA = userPage.locator('.queue-viewport .row').filter({ has: userPage.getByRole('button', { name: `Play ${A}` }) });
    await rowA.hover();
    await rowA.getByRole('button', { name: 'Remove' }).click();
    await expect(userPage.getByRole('button', { name: `Play ${A}` })).toHaveCount(0);
    await expect(userPage.getByRole('button', { name: `Play ${B}` })).toBeVisible();
  });

  test('"Play next" puts the song right behind the current one', async ({ userPage }) => {
    await startRoom(userPage, unique('next'), [A, B]);
    await libraryAction(userPage, C, 'Play next');
    await backToRoom(userPage);
    await userPage.getByRole('button', { name: 'Next', exact: true }).first().click();
    await expect(nowTitle(userPage)).toHaveText(C);
  });

  test('time skip jumps ahead by the configured length', async ({ userPage }) => {
    await startRoom(userPage, unique('skip'), [A]);
    await expect(play(userPage)).toHaveAccessibleName('Pause');
    await roomBar(userPage).getByRole('button', { name: 'Skip 10 s' }).click();
    await expect.poll(() => seconds(time(userPage)), { timeout: 20_000 }).toBeGreaterThanOrEqual(10);
  });

  test('seek bar jumps to the clicked position', async ({ userPage }) => {
    await startRoom(userPage, unique('seek'), [A]);
    await expect(play(userPage)).toHaveAccessibleName('Pause');
    const slider = roomBar(userPage).locator('app-player-track mat-slider');
    const box = (await slider.boundingBox())!;
    await userPage.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
    await expect.poll(() => seconds(time(userPage)), { timeout: 20_000 }).toBeGreaterThanOrEqual(25);
  });

  test('loop button toggles and shuffle keeps the queue', async ({ userPage }) => {
    await startRoom(userPage, unique('opts'), [A, B, C]);
    const loop = userPage.getByRole('button', { name: 'Loop the queue' });
    await expect(loop).toHaveAttribute('aria-pressed', 'false');
    await loop.click();
    await expect(loop).toHaveAttribute('aria-pressed', 'true');
    await loop.click();
    await expect(loop).toHaveAttribute('aria-pressed', 'false');

    await userPage.getByRole('button', { name: 'Shuffle queue' }).click();
    await expect(queueTab(userPage).getByText(/^Queue\s*3$/)).toBeVisible();
    await expect(userPage.locator('.row-open')).toHaveCount(2);
  });

  test('queue rows can be reordered by dragging', async ({ userPage }) => {
    await startRoom(userPage, unique('drag'), [A, B, C]);
    const rows = userPage.locator('.queue-viewport .row-title');
    await expect(rows).toHaveText([A, B, C]);
    // cdk drag needs a real pointer movement in several steps
    const from = (await userPage.locator('.queue-viewport .row').filter({ hasText: C }).boundingBox())!;
    const to = (await userPage.locator('.queue-viewport .row').filter({ hasText: B }).boundingBox())!;
    await userPage.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await userPage.mouse.down();
    await userPage.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 6, { steps: 4 });
    await userPage.mouse.move(to.x + to.width / 2, to.y + 4, { steps: 12 });
    await userPage.mouse.up();
    await expect(rows).toHaveText([A, C, B]);
  });

  test('volume slider reacts to the keyboard', async ({ userPage }) => {
    await startRoom(userPage, unique('vol'), [A]);
    const volume = roomBar(userPage).locator('.volume-slider input');
    const before = Number(await volume.inputValue());
    await volume.focus();
    await volume.press('ArrowRight');
    await volume.press('ArrowRight');
    expect(Number(await volume.inputValue())).toBeGreaterThan(before);
  });

  test('the rating stars can be used for a song', async ({ userPage }) => {
    await startRoom(userPage, unique('rate'), [A]);
    const rating = userPage.getByRole('group', { name: 'Rating' });
    await rating.hover(); // stars 2 to 5 show on hover
    await rating.getByRole('button', { name: '4 stars' }).click();
    await expect(rating.locator('button.star.filled')).toHaveCount(4);
  });

  test('the library link of the queue opens the library', async ({ userPage }) => {
    await createRoomInUi(userPage, unique('lib'));
    await userPage.getByRole('link', { name: 'Add from the library' }).click();
    await expect(userPage).toHaveURL(/\/library$/);
  });
});

test.describe('mini player', () => {
  test('follows the room on other pages and keeps playing', async ({ userPage }) => {
    await startRoom(userPage, unique('mini'), [A, B]);
    await expect.poll(() => seconds(roomBar(userPage).locator('.time-display')), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);

    await userPage.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();
    const mini = userPage.locator('app-mini-player');
    await expect(mini.locator('.song-title')).toHaveText(A);
    const at = await seconds(mini.locator('.time-display'));
    await expect.poll(() => seconds(mini.locator('.time-display')), { timeout: 20_000 }).toBeGreaterThan(at);

    await mini.getByRole('button', { name: 'Pause' }).click();
    await expect(mini.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await mini.getByRole('button', { name: 'Play', exact: true }).click();
    await mini.getByRole('button', { name: 'Next' }).click();
    await expect(mini.locator('.song-title')).toHaveText(B);

    await mini.getByRole('button', { name: 'Back to the player' }).click();
    await expect(userPage).toHaveURL(/\/lobby$/);
    await expect(nowTitle(userPage)).toHaveText(B);
    await expect(userPage.locator('app-mini-player')).toHaveCount(0);
  });

  test('logging out leaves the room', async ({ userPage, user }) => {
    await startRoom(userPage, unique('out'), [A]);
    await userPage.getByRole('button', { name: `Account menu of ${user.username}` }).click();
    await userPage.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(userPage).toHaveURL(/\/login/);
    await userPage.locator('#username').fill(user.username);
    await userPage.locator('#password').fill(user.password);
    await userPage.locator('#submit-button').click();
    await expect(userPage.getByRole('button', { name: `Account menu of ${user.username}` })).toBeVisible();
    await expect(userPage.locator('#header .session-link')).toHaveCount(0);
    await expect(userPage.locator('app-mini-player')).toHaveCount(0);
  });
});

test.describe('video', () => {
  const videoTitle = () => sharedMedia().video.title;

  test('plays in the lobby with chapters, fullscreen button and seek preview', async ({ userPage }) => {
    await startRoom(userPage, unique('video'), [videoTitle()]);
    await expect(nowTitle(userPage)).toHaveText(videoTitle());
    await expect(play(userPage)).toHaveAccessibleName('Pause');
    const video = userPage.locator('video');
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 20_000 }).toBeGreaterThan(1);
    await expect(userPage.getByRole('button', { name: 'Fullscreen' })).toBeVisible();

    // chapters from the MP4: two segments and a menu
    await expect(roomBar(userPage).locator('.segment')).toHaveCount(2);
    await userPage.getByRole('button', { name: 'Chapters' }).click();
    await expect(userPage.getByRole('menuitem', { name: /Intro/ })).toBeVisible();
    await userPage.getByRole('menuitem', { name: /Second/ }).click();
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 20_000 }).toBeGreaterThanOrEqual(15);
    await expect(roomBar(userPage).getByRole('button', { name: 'Next chapter' })).toBeDisabled();

    // hover preview with thumbnail and chapter title
    const slider = roomBar(userPage).locator('app-player-track mat-slider');
    const box = (await slider.boundingBox())!;
    await userPage.mouse.move(box.x + 5, box.y + box.height / 2);
    await userPage.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 8 });
    await expect(userPage.locator('.seek-preview-chapter')).toHaveText('Intro');
    await expect(userPage.locator('.seek-preview-image')).toBeVisible();
  });

  test('a song room shows no fullscreen button', async ({ userPage }) => {
    await startRoom(userPage, unique('nofs'), [A]);
    await expect(userPage.getByRole('button', { name: 'Fullscreen' })).toBeHidden();
    await expect(roomBar(userPage).getByRole('button', { name: 'Chapters' })).toHaveCount(0);
  });
});
