import { expect, it } from 'vitest';
import { auditPackageEntries } from '../tools/release-package-audit.mjs';

const rejected = [
  'tests/smoke.spec.ts',
  'src/private.ts',
  'qa/session.log',
  '.env',
  'config/.env.local',
  'playwright-report/index.html',
  'test-results/result.json',
  'dist/app.js.map',
  'node_modules/pkg/tests/fixture.json',
  'node_modules\\pkg\\__tests__\\fixture.js',
  'evidence/personal.png',
  'node_modules/fluent-ffmpeg/doc/index.html',
  'node_modules/fluent-ffmpeg/OLD/README.md',
  'node_modules/fluent-ffmpeg/tools/jsdoc-conf.json',
  'node_modules/fluent-ffmpeg/.vscode/settings.json',
  'sessions/secret.sbp',
  'keys/signing.pem',
  'parent/../private.txt',
  '/absolute/private.txt',
  'C:\\personal\\private.txt',
];

it.each(rejected)('rejects %s', (entry) => {
  expect(auditPackageEntries([entry]).rejected).toContain(entry);
});

it.each([
  'dist/index.html',
  'dist-electron/main.cjs',
  'package.json',
  'resources/ffmpeg/ffmpeg.exe',
  'resources/dosya.ico',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'third_party_licenses/courier-prime-OFL.txt',
  'LICENSES.chromium.html',
])('allows %s', (entry) => {
  expect(auditPackageEntries([entry]).ok).toBe(true);
});

it('reports every offending path without rewriting the originals', () => {
  const result = auditPackageEntries(['dist/index.html', 'qa/session.log', '.env']);
  expect(result).toEqual({ ok: false, rejected: ['qa/session.log', '.env'] });
});
