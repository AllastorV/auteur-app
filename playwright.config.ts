import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// E2E must never load or overwrite the user's default server data directory.
const e2eDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'auteur-playwright-data-'));
process.env.STORYBOARD_DATA_DIR = e2eDataRoot;
process.once('exit', () => {
  try {
    fs.rmSync(e2eDataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch (error) {
    // A failed cleanup leaves only this run's disposable fixture.
    console.error(`Playwright temporary data cleanup failed: ${String(error)}`);
  }
});


export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    /* e2e iddialari Turkce metin bekliyor; urun varsayilani Ingilizce.
       Dil localStorage'dan okunur — sayfa yuklenmeden once yazilir. */
    storageState: {
      cookies: [],
      origins: [{
        origin: 'http://localhost:5174',
        localStorage: [{ name: 'mizansen.arayuz-dili', value: 'tr' }],
      }],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // CI görüntülerinde Playwright'ın indirdiği tarayıcı sürümü farklı
        // olabilir; ortamda hazır bulunan Chromium kullanılır.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev --workspace @storyboard/server',
      /* Hız sınırı testler için gevşetiliyor: paket tek koşuda onlarca oda ve
         davet üretiyor ve üretim sınırları o yükte devreye giriyor. Sınırın
         KENDİSİ `apps/server/tests` içinde kendi sıkı değerleriyle ölçülüyor
         — burada gevşetmek onu ölçüsüz bırakmıyor. */
      env: { ...process.env, STORYBOARD_HIZ_CARPANI: '200' },
      port: 5180,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev --workspace @storyboard/web',
      // Dropbox/antivirus can lock Vite's atomic deps rename inside the repo.
      env: {
        ...process.env,
        STORYBOARD_VITE_CACHE_DIR: path.join(os.tmpdir(), `auteur-vite-e2e-${process.pid}`),
      },
      port: 5174,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
