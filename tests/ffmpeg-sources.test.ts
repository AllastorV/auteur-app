import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { expect, it } from 'vitest';

const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

const sources = {
  ffmpeg: {
    version: '9.0.2',
    url: 'https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz',
    sha256: ABC_SHA256,
    signatureUrl: 'https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz.asc',
    signingFingerprint: 'FCF986EA15E6E293A5644F10B4322F04D67658D8',
  },
  x264: {
    commit: 'b35605ace3ddf7c1a5d67a2eb553f034aef41d55',
    url: 'https://code.videolan.org/videolan/x264/-/archive/b35605ace3ddf7c1a5d67a2eb553f034aef41d55/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.gz',
    sha256: ABC_SHA256,
  },
  libvpx: {
    commit: '1024874c5919305883187e2953de8fcb4c3d7fa6',
    url: 'https://chromium.googlesource.com/webm/libvpx/+archive/1024874c5919305883187e2953de8fcb4c3d7fa6.tar.gz',
    sha256: ABC_SHA256,
  },
  libopus: {
    version: '1.6.1',
    url: 'https://ftp.osuosl.org/pub/xiph/releases/opus/opus-1.6.1.tar.gz',
    originUrl: 'https://downloads.xiph.org/releases/opus/opus-1.6.1.tar.gz',
    sha256: ABC_SHA256,
  },
  zlib: {
    version: '1.3.2',
    url: 'https://zlib.net/fossils/zlib-1.3.2.tar.gz',
    sha256: ABC_SHA256,
  },
};

async function moduleUnderTest() {
  return import('../tools/ffmpeg-sources.mjs').catch(() => ({} as Record<string, unknown>));
}

it('rejects changed bytes and malformed SHA-256 values', async () => {
  const source = await moduleUnderTest();
  expect(source.verifySha256).toBeTypeOf('function');
  const verify = source.verifySha256 as (bytes: Buffer, digest: string) => void;
  expect(() => verify(Buffer.from('abc'), ABC_SHA256)).not.toThrow();
  expect(() => verify(Buffer.from('changed'), ABC_SHA256)).toThrow(/SHA-256/i);
  expect(() => verify(Buffer.from('data'), 'not-a-digest')).toThrow(/SHA-256/i);
});

it('accepts only all five matching local archives without contacting the network', async () => {
  const source = await moduleUnderTest();
  expect(source.fetchLockedSources).toBeTypeOf('function');
  const fetchLockedSources = source.fetchLockedSources as (lock: string, output: string) => Promise<string>;
  const root = await mkdtemp(path.join(tmpdir(), 'auteur-sources-'));
  try {
    const lock = path.join(root, 'lock.json');
    const output = path.join(root, 'archives');
    await writeFile(lock, JSON.stringify({ schemaVersion: 1, sources }));
    const { mkdir } = await import('node:fs/promises');
    await mkdir(output);
    for (const filename of [
      'ffmpeg-9.0.2.tar.xz',
      'x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.gz',
      'libvpx-1024874c5919305883187e2953de8fcb4c3d7fa6.tar.gz',
      'opus-1.6.1.tar.gz',
      'zlib-1.3.2.tar.gz',
    ]) await writeFile(path.join(output, filename), 'abc');
    expect(await fetchLockedSources(lock, output)).toBe(output);
    expect(await readFile(path.join(output, 'opus-1.6.1.tar.gz'), 'utf8')).toBe('abc');
    await writeFile(path.join(output, 'opus-1.6.1.tar.gz'), 'changed');
    await expect(fetchLockedSources(lock, output)).rejects.toThrow(/SHA-256/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('rejects an unapproved source host before downloading', async () => {
  const source = await moduleUnderTest();
  expect(source.fetchLockedSources).toBeTypeOf('function');
  const fetchLockedSources = source.fetchLockedSources as (lock: string, output: string) => Promise<string>;
  const root = await mkdtemp(path.join(tmpdir(), 'auteur-host-'));
  try {
    const lock = path.join(root, 'lock.json');
    await writeFile(lock, JSON.stringify({ schemaVersion: 1, sources: {
      ...sources,
      libopus: { ...sources.libopus, url: 'https://example.invalid/opus-1.6.1.tar.gz' },
    } }));
    await expect(fetchLockedSources(lock, path.join(root, 'archives'))).rejects.toThrow(/source URL/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('bundles only verified source archives, licenses and rebuild instructions', async () => {
  const source = await moduleUnderTest();
  expect(source.bundleSources).toBeTypeOf('function');
  const bundleSources = source.bundleSources as (sources: string, zip: string, lock: string) => Promise<void>;
  const root = await mkdtemp(path.join(tmpdir(), 'auteur-bundle-'));
  try {
    const sourceDir = path.join(root, 'sources');
    const licenses = path.join(root, 'licenses');
    const lock = path.join(root, 'lock.json');
    const zip = path.join(root, 'corresponding-source.zip');
    await mkdir(sourceDir);
    await mkdir(licenses);
    await writeFile(lock, JSON.stringify({ schemaVersion: 1, sources }));
    const filenames = [
      'ffmpeg-9.0.2.tar.xz',
      'x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.gz',
      'libvpx-1024874c5919305883187e2953de8fcb4c3d7fa6.tar.gz',
      'opus-1.6.1.tar.gz',
      'zlib-1.3.2.tar.gz',
    ];
    for (const filename of filenames) await writeFile(path.join(sourceDir, filename), 'abc');
    for (const filename of [
      'ffmpeg-GPLv3.txt', 'ffmpeg-LICENSE.md', 'x264-COPYING.txt',
      'libvpx-LICENSE.txt', 'libvpx-PATENTS.txt', 'libopus-COPYING.txt', 'zlib-LICENSE.txt',
    ]) await writeFile(path.join(licenses, filename), filename);
    await writeFile(path.join(root, 'build-record.json'), JSON.stringify({
      schemaVersion: 1,
      sources: Object.fromEntries(Object.entries(sources).map(([name, value], index) =>
        [name, { ...value, archive: filenames[index] }])),
    }));
    await writeFile(path.join(root, 'build-commands.txt'), './configure --enable-gpl\\n');
    await bundleSources(sourceDir, zip, lock);
    const archive = await JSZip.loadAsync(await readFile(zip));
    expect(archive.file(`release-work/ffmpeg/sources/${filenames[0]}`)).toBeTruthy();
    expect(archive.file('tools/build-ffmpeg.sh')).toBeTruthy();
    expect(archive.file('REBUILD.md')).toBeTruthy();
    expect(await archive.file('SOURCE_SHA256SUMS.txt')!.async('string')).toContain(ABC_SHA256);
    expect(await readFile(path.join(root, 'SOURCE_SHA256SUMS.txt'), 'utf8')).toContain(ABC_SHA256);
    await writeFile(path.join(sourceDir, filenames[0]), 'changed');
    await expect(bundleSources(sourceDir, zip, lock)).rejects.toThrow(/SHA-256/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
