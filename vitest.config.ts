import { defineConfig } from 'vitest/config';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';

const coreSrc = path.resolve(__dirname, 'packages/core/src');
// Tests must never open the real server room store in the user's home directory.
// This environment is set before Vitest starts its workers, so every default
// startServer() call receives an isolated data root without changing production.
const testDataRoot = mkdtempSync(path.join(os.tmpdir(), 'auteur-vitest-'));
process.env.STORYBOARD_DATA_DIR = testDataRoot;
process.once('exit', () => {
  try {
    rmSync(testDataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch (error) {
    // A failed cleanup leaves only this run's disposable fixture, never user data.
    console.error(`Vitest temporary data cleanup failed: ${String(error)}`);
  }
});


export default defineConfig({
  plugins: [{
    name: 'inline-atlas-png-in-tests',
    enforce: 'pre',
    load(id) {
      const normalized = id.replace(/\\/g, '/');
      if (!normalized.includes('/textures/atlas-v1/') || !/\.png\?inline$/.test(normalized)) return null;
      const bytes = readFileSync(id.slice(0, -'?inline'.length));
      return `export default ${JSON.stringify(`data:image/png;base64,${bytes.toString('base64')}`)}`;
    },
  }],
  resolve: {
    alias: [
      { find: /^@storyboard\/core$/, replacement: path.join(coreSrc, 'index.ts') },
      { find: /^@storyboard\/core\/(.*)$/, replacement: path.join(coreSrc, '$1') },
    ],
  },
  test: {
    environment: 'node',
    setupFiles: [path.resolve(__dirname, 'tests/kurulum-dil.ts')],
    // `.tsx` de dahil: F1b-2'den itibaren bileşen testleri var. Yalnız `.ts`
    // aramak bir bileşen testini SESSİZCE koşmadan bırakır — dosya yeşil
    // sayılmaz, hiç görülmez.
    include: ['tests/**/*.test.{ts,tsx}', 'packages/**/*.test.{ts,tsx}', 'apps/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
