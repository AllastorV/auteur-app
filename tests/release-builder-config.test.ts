import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.join(__dirname, '..');
const desktop = path.join(root, 'apps/desktop');
const config = JSON.parse(fs.readFileSync(path.join(desktop, 'electron-builder.json'), 'utf8')) as {
  files: string[];
  extraResources: { from: string; to: string }[];
};

describe('portable release packaging', () => {
  it('bundles Auteur GPL, third-party notices, and original font licenses', () => {
    for (const [from, to] of [
      ['../../LICENSE', 'licenses/Auteur-LICENSE'],
      ['../../THIRD_PARTY_NOTICES.md', 'licenses/THIRD_PARTY_NOTICES.md'],
      ['../../third_party_licenses', 'licenses/fonts'],
    ]) {
      expect(config.extraResources).toContainEqual({ from, to });
      expect(fs.existsSync(path.join(desktop, from))).toBe(true);
    }
  });

  it('excludes dependency tests, coverage, TypeScript sources, and source maps', () => {
    for (const pattern of [
      '!**/coverage/**', '!**/tests/**', '!**/test/**',
      '!**/src/**', '!**/*.ts', '!**/*.map',
      '!**/doc/**', '!**/OLD/**', '!**/tools/**', '!**/.vscode/**',
    ]) expect(config.files).toContain(pattern);
  });
});
