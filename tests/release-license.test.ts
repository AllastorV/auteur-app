import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const manifests = [
  'package.json',
  'packages/core/package.json',
  'apps/desktop/package.json',
  'apps/web/package.json',
  'apps/server/package.json',
];

it.each(manifests)('%s declares GPL-3.0-only', (file) => {
  expect(JSON.parse(read(file)).license).toBe('GPL-3.0-only');
});

it('ships the GPL version 3 text, not the old BSL contract', () => {
  const license = read('LICENSE');
  expect(license).toMatch(/GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/);
  expect(license).toContain('END OF TERMS AND CONDITIONS');
  expect(license).not.toMatch(/Business Source License|BUSL-1\.1/);
});

it.each(['LICENSE-SUMMARY.md', 'CONTRIBUTING.md', 'README.md'])('%s describes the current GPL release', (file) => {
  const prose = read(file);
  expect(prose).toContain('GPL-3.0-only');
  expect(prose).not.toMatch(/BUSL-1\.1|Business Source License|source-available/i);
});
