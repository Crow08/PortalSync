import { expect, test } from '../fixtures/auth';
import { unique } from '../fixtures/api';
import { createRoomInUi, roomBar } from '../fixtures/room';

test.describe('settings', () => {
  test('default volume changes with the keyboard and survives a reload', async ({ userPage }) => {
    await userPage.goto('/settings');
    const slider = userPage.getByRole('slider', { name: 'Default player volume' });
    await slider.focus();
    const before = Number(await slider.inputValue());
    await slider.press('End');
    const max = Number(await slider.inputValue());
    expect(max).toBeGreaterThan(before);
    await expect(userPage.locator('.slider-row .value')).toHaveText('100%');
    expect(await userPage.evaluate(() => localStorage.getItem('msc_defaultVolume'))).toBe(String(max));

    await userPage.reload();
    await expect(userPage.getByRole('slider', { name: 'Default player volume' })).toHaveValue(String(max));
  });

  test('time skip length is stored and used by the skip button', async ({ userPage }) => {
    await userPage.goto('/settings');
    const input = userPage.getByRole('spinbutton', { name: 'Time skip length' });
    await expect(input).toHaveValue('85');
    await input.fill('20');
    expect(await userPage.evaluate(() => localStorage.getItem('msc_defaultTimeSkipLength'))).toBe('20');

    await userPage.reload();
    await expect(userPage.getByRole('spinbutton', { name: 'Time skip length' })).toHaveValue('20');
    await createRoomInUi(userPage, unique('skiplabel'));
    await expect(roomBar(userPage).getByRole('button', { name: 'Skip 20 s' })).toBeVisible();
  });

  test('says so when the server has no Spotify client id', async ({ userPage }) => {
    // the e2e stack has no Spotify credentials
    await userPage.goto('/settings');
    await expect(userPage.getByText('Spotify is not set up on this server')).toBeVisible();
    await expect(userPage.getByRole('link', { name: 'Login with Spotify' })).toHaveCount(0);
  });

  test('builds the Spotify login link from the settings of the server', async ({ userPage }) => {
    await userPage.route('**/api/v1/spotify/config', (route) =>
      route.fulfill({ json: { clientId: 'test-client-id', redirectUri: 'https://portal.example/spotify/redirect' } })
    );
    await userPage.goto('/settings');
    const href = await userPage.getByRole('link', { name: 'Login with Spotify' }).getAttribute('href');
    const url = new URL(href ?? '');
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://portal.example/spotify/redirect');
  });
});
