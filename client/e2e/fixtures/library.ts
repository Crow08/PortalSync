import { Locator, Page } from '@playwright/test';

/** The row of a media in the library list, found by its exact title (the virtual list renders only the visible rows). */
export const libraryRow = (page: Page, title: string): Locator =>
  page.locator('.list .row').filter({ has: page.locator('.title', { hasText: new RegExp(`^${escapeRegExp(title)}$`) }) });

/** Shows the details of a media: clicks its row. */
export const openMedia = (page: Page, title: string): Promise<void> => libraryRow(page, title).locator('.open').click();

/** The checkbox of the row of a media. */
export const pickMedia = (page: Page, title: string): Locator => libraryRow(page, title).locator('mat-checkbox');

export const searchLibrary = (page: Page, text: string): Promise<void> => page.getByLabel('Search', { exact: true }).fill(text);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
