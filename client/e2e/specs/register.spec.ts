import { expect, test } from '../fixtures/auth';
import { unique } from '../fixtures/api';

async function createInvite(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create invite link' }).click();
  const link = page.getByLabel('Invite link');
  await expect(link).toHaveValue(/\/register\?invite=/);
  return link.inputValue();
}

async function fillRegister(page: import('@playwright/test').Page, name: string, password: string): Promise<void> {
  await page.locator('#username').fill(name);
  await page.locator('#password').fill(password);
  await page.locator('#password_confirm').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
}

test.describe('invite and register', () => {
  test('invite link lets a new person register and sign in', async ({ userPage, browser, baseURL }) => {
    const link = await createInvite(userPage);
    const name = unique('new');

    const guest = await browser.newContext({ baseURL });
    const page = await guest.newPage();
    await page.goto(link);
    await fillRegister(page, name, 'guest-password');
    await expect(page.getByRole('status')).toHaveText('Account created.');
    await page.getByRole('button', { name: 'Go to sign in' }).click();

    await expect(page).toHaveURL(/\/login/);
    await page.locator('#username').fill(name);
    await page.locator('#password').fill('guest-password');
    await page.locator('#submit-button').click();
    await expect(page.getByRole('button', { name: `Account menu of ${name}` })).toBeVisible();
    await guest.close();
  });

  test('register page without invite reports an invalid link', async ({ page }) => {
    await page.goto('/register');
    await fillRegister(page, unique('x'), 'pw');
    await expect(page.getByRole('alert')).toHaveText('Invalid invite link.');
  });

  test('taken username fails', async ({ userPage, user, browser, baseURL }) => {
    const link = await createInvite(userPage);
    const guest = await browser.newContext({ baseURL });
    const page = await guest.newPage();
    await page.goto(link);
    await fillRegister(page, user.username, 'other-password');
    await expect(page.getByRole('alert')).toHaveText('Registration failed.');
    await guest.close();
  });

  test('empty register form does not submit', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(0);
  });
});
