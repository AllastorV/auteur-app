import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPackage } from '@electron/asar';
import { expect, it } from 'vitest';
import { auditPackageEntries, collectPackageEntries } from '../tools/release-package-audit.mjs';

it('opens a real ASAR and also inspects unpacked resource files', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'auteur-package-audit-'));
  const source = path.join(fixtureRoot, 'source');
  const packageRoot = path.join(fixtureRoot, 'win-unpacked');
  const resources = path.join(packageRoot, 'resources');
  try {
    fs.mkdirSync(path.join(source, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(source, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(resources, 'qa'), { recursive: true });
    fs.writeFileSync(path.join(source, 'dist', 'index.html'), '<!doctype html>');
    fs.writeFileSync(path.join(source, 'tests', 'smoke.spec.ts'), 'test fixture');
    fs.writeFileSync(path.join(resources, 'qa', 'session.log'), 'private fixture');
    await createPackage(source, path.join(resources, 'app.asar'));

    const entries = collectPackageEntries(packageRoot);
    expect(entries).toContain('dist/index.html');
    expect(entries).toContain('tests/smoke.spec.ts');
    expect(entries).toContain('resources/qa/session.log');
    expect(entries).toContain('resources/app.asar');
    expect(auditPackageEntries(entries).rejected).toEqual(expect.arrayContaining([
      'tests/smoke.spec.ts', 'resources/qa/session.log',
    ]));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
