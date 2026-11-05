import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Run after npm run build, with a desktop display (or xvfb-run on Linux).
const application = await electron.launch({ args: [fileURLToPath(new URL('../', import.meta.url))] });
try {
  const page = await application.firstWindow();
  await page.getByRole('heading', { name: 'Find your next favorite' }).waitFor();
  assert.equal(await page.locator('.video-card').count(), 8);
  const bridge = await page.evaluate(async () => ({
    info: await window.frame.getAppInfo(),
    keys: Object.keys(window.frame).sort(),
    nodeAvailable: typeof window.require !== 'undefined' || typeof window.process !== 'undefined',
  }));
  assert.equal(bridge.info.version, '0.1.0');
  assert.deepEqual(bridge.keys, ['getAppInfo', 'library', 'openYouTube', 'playback', 'youtube']);
  assert.equal(bridge.nodeAvailable, false);
  const preferences = await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const { contextIsolation, sandbox, nodeIntegration, webSecurity } = window.webContents.getLastWebPreferences();
    return { contextIsolation, sandbox, nodeIntegration, webSecurity };
  });
  assert.deepEqual(preferences, { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true });
  await page.getByRole('button', { name: 'YouTube Discovery', exact: true }).click();
  await page.getByRole('button', { name: 'Open YouTube', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  await page.screenshot({ path: 'test-results/desktop-settings.png' });
  await page.getByRole('button', { name: 'Frame home' }).click();
  await page.screenshot({ path: 'test-results/desktop-home.png' });
  console.log('PASS: built Electron app loads; IPC responds; renderer isolation and navigation verified.');
} finally {
  await application.close();
}
