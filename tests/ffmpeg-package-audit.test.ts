import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import * as audit from '../tools/release-package-audit.mjs';

const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'ffmpeg-source-lock.json'), 'utf8')) as {
  sources: Record<string, { sha256: string; url: string; version?: string; commit?: string }>;
};
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

it('checks bundled FFmpeg hash, five matching sources, licenses and DLL imports', () => {
  const run = (audit as unknown as { auditFfmpegBundle?: (
    root: string, record: string, manifest: string, inspect: () => string[],
  ) => { ok: boolean; errors: string[] } }).auditFfmpegBundle;
  expect(run).toBeTypeOf('function');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auteur-ffmpeg-audit-'));
  try {
    const pkg = path.join(root, 'win-unpacked');
    const ffmpeg = path.join(pkg, 'resources', 'ffmpeg', 'ffmpeg.exe');
    const licenses = path.join(pkg, 'resources', 'licenses', 'ffmpeg');
    fs.mkdirSync(path.dirname(ffmpeg), { recursive: true });
    fs.mkdirSync(licenses, { recursive: true });
    const bytes = Buffer.from('verified-executable');
    fs.writeFileSync(ffmpeg, bytes);
    for (const name of ['ffmpeg-GPLv3.txt', 'ffmpeg-LICENSE.md', 'x264-COPYING.txt',
      'libvpx-LICENSE.txt', 'libvpx-PATENTS.txt', 'libopus-COPYING.txt', 'zlib-LICENSE.txt']) {
      fs.writeFileSync(path.join(licenses, name), name);
    }
    const sources = Object.fromEntries(Object.entries(lock.sources).map(([name, item]) => [name, {
      ...item,
      archive: name === 'ffmpeg' ? `ffmpeg-${item.version}.tar.xz`
        : name === 'libopus' ? `opus-${item.version}.tar.gz`
          : `${name}-${item.commit ?? item.version}.tar.gz`,
    }]));
    const recordPath = path.join(root, 'build-record.json');
    const manifestPath = path.join(root, 'SOURCE_SHA256SUMS.txt');
    fs.writeFileSync(recordPath, JSON.stringify({ schemaVersion: 1, binary: {
      sha256: sha256(bytes), imports: ['KERNEL32.dll'],
    }, sources }));
    fs.writeFileSync(manifestPath, Object.values(sources).map((item) => {
      const source = item as { sha256: string; archive: string };
      return `${source.sha256}  release-work/ffmpeg/sources/${source.archive}`;
    }).join('\n'));

    expect(run!(pkg, recordPath, manifestPath, () => ['KERNEL32.dll'])).toEqual({ ok: true, errors: [] });
    fs.writeFileSync(ffmpeg, 'changed');
    expect(run!(pkg, recordPath, manifestPath, () => ['KERNEL32.dll']).errors).toContain('FFmpeg SHA-256 mismatch');
    fs.writeFileSync(ffmpeg, bytes);
    expect(run!(pkg, recordPath, manifestPath, () => ['libwinpthread-1.dll']).errors)
      .toContain('Unexpected FFmpeg DLL: libwinpthread-1.dll');
    fs.rmSync(path.join(licenses, 'zlib-LICENSE.txt'));
    expect(run!(pkg, recordPath, manifestPath, () => ['KERNEL32.dll']).errors)
      .toContain('Missing FFmpeg license: zlib-LICENSE.txt');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('rejects the old ffmpeg-static executable in an app package', () => {
  expect(audit.auditPackageEntries(['resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe']).ok)
    .toBe(false);
});
