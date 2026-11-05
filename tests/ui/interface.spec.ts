import { test, expect } from '@playwright/test';

test('search, filters, and empty results work', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.video-card')).toHaveCount(8);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await expect(page.locator('.video-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search sample videos' }).fill('alps');
  await page.getByRole('textbox', { name: 'Search sample videos' }).press('Enter');
  await expect(page.locator('.video-card')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Search sample videos' }).fill('no-such-video');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('Nothing here just yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.locator('.video-card')).toHaveCount(8);
});

test('watch page and session Watch Later are interactive', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'View A little further from everything. A week in the Alps' }).click();
  await expect(page.getByText('A glimpse of what’s coming.')).toBeVisible();
  await page.getByRole('button', { name: 'Save sample for later', exact: true }).click();
  await page.getByRole('button', { name: /Watch Later/ }).click();
  await expect(page.locator('.video-card')).toHaveCount(1);
  await page.getByRole('button', { name: /^Unsave/ }).click();
  await expect(page.getByText('Keep a little inspiration.')).toBeVisible();
});

test('all routes, theme persistence, and sidebar toggle', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Downloads', 'History', 'Playlists', 'Offline Library', 'Settings']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  await expect(page.locator('.app-shell')).toHaveClass(/sidebar-collapsed/);
  await page.getByRole('button', { name: 'YouTube Discovery', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open YouTube' })).toBeVisible();
  await page.getByRole('button', { name: 'About Frame', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('responsive layouts have no horizontal overflow or renderer errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto('/');
    await expect(page.locator('.video-card')).toHaveCount(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});
