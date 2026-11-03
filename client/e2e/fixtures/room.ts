import { expect, Locator, Page } from '@playwright/test';
import { openMedia, searchLibrary } from './library';

const rail = (page: Page) => page.getByRole('navigation', { name: 'Main' });

/** Creates a room through the form and waits for the lobby. */
export async function createRoomInUi(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.locator('#name').fill(name);
  await page.locator('#submit-button').click();
  await expect(page).toHaveURL(/\/sessions\/\d+\/lobby$/);
}

/** Opens an item in the library (client side navigation keeps the room connection) and runs one of its actions. */
export async function libraryAction(
  page: Page,
  title: string,
  action: 'Play now' | 'Play next' | 'Add to queue'
): Promise<void> {
  await rail(page).getByRole('link', { name: 'Library' }).click();
  await searchLibrary(page, title);
  await openMedia(page, title);
  await page.locator('aside.detail').getByRole('button', { name: action, exact: true }).click();
}

export async function backToRoom(page: Page): Promise<void> {
  await rail(page).getByRole('link', { name: 'Player', exact: true }).click();
  await expect(page).toHaveURL(/\/lobby$/);
}

/**
 * Creates a room, loads the first item ("Play now" only loads it, the room stays paused), queues the others, returns
 * to the lobby and, unless `autoplay` is false, presses play.
 */
export async function startRoom(page: Page, name: string, titles: string[], autoplay = true): Promise<void> {
  await createRoomInUi(page, name);
  await libraryAction(page, titles[0], 'Play now');
  for (const title of titles.slice(1)) {
    await libraryAction(page, title, 'Add to queue');
  }
  await backToRoom(page);
  if (autoplay) {
    await expect(page.locator('section.main .bar .now-title')).toHaveText(titles[0]);
    await page.locator('section.main .bar button.play').click();
    await expect(page.locator('section.main .bar button.play')).toHaveAccessibleName('Pause');
  }
}

/** The seek bar of the lobby (the one in the bottom bar, not of the mini player). */
export const roomBar = (page: Page): Locator => page.locator('section.main .bar');

export async function seconds(time: Locator): Promise<number> {
  const text = (await time.innerText()).split('/')[0].trim();
  return text.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
}
