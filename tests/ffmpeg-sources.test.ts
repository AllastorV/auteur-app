import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
    url: 'https://downloads.xiph.org/releases/opus/opus-1.6.1.tar.gz',
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

it('accepts only all four matching local archives without contacting the network', async () => {
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
