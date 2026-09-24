import { createHash } from 'node:crypto';
import { readFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE_NAMES = ['ffmpeg', 'x264', 'libvpx', 'libopus', 'zlib'];
const RELEASE_FINGERPRINT = 'FCF986EA15E6E293A5644F10B4322F04D67658D8';

export function verifySha256(bytes, expected) {
  if (typeof expected !== 'string' || !/^[0-9a-f]{64}$/i.test(expected)) {
    throw new Error('Invalid SHA-256 digest');
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected.toLowerCase()) throw new Error('Source SHA-256 mismatch');
}

export function archiveDetails(name, source) {
  if (!source || typeof source !== 'object') throw new Error(`Invalid ${name} source`);
  if (name === 'ffmpeg' || name === 'libopus' || name === 'zlib') {
    if (!/^\d+\.\d+(?:\.\d+)?$/.test(source.version)) throw new Error(`Invalid ${name} version`);
    const filename = name === 'ffmpeg'
      ? `ffmpeg-${source.version}.tar.xz`
      : name === 'zlib' ? `zlib-${source.version}.tar.gz` : `opus-${source.version}.tar.gz`;
    const prefix = name === 'ffmpeg'
      ? 'https://ffmpeg.org/releases/'
      : name === 'zlib' ? 'https://zlib.net/fossils/' : 'https://ftp.osuosl.org/pub/xiph/releases/opus/';
    if (name === 'ffmpeg' && (
      source.signatureUrl !== `${prefix}${filename}.asc`
      || source.signingFingerprint !== RELEASE_FINGERPRINT
    )) throw new Error('Invalid FFmpeg release signature identity');
    if (name === 'libopus' && source.originUrl !==
        `https://downloads.xiph.org/releases/opus/${filename}`) {
      throw new Error('Invalid Xiph source origin URL');
    }
    return { filename, url: `${prefix}${filename}` };
  }
  if (!/^[0-9a-f]{40}$/.test(source.commit)) throw new Error(`Invalid ${name} commit`);
  const filename = `${name}-${source.commit}.tar.gz`;
  const url = name === 'x264'
    ? `https://code.videolan.org/videolan/x264/-/archive/${source.commit}/x264-${source.commit}.tar.gz`
    : `https://chromium.googlesource.com/webm/libvpx/+archive/${source.commit}.tar.gz`;
  return { filename, url };
}

export async function fetchLockedSources(lockFile, outDir) {
  const lock = JSON.parse(await readFile(lockFile, 'utf8'));
  if (lock.schemaVersion !== 1 || !lock.sources ||
      Object.keys(lock.sources).length !== SOURCE_NAMES.length ||
      SOURCE_NAMES.some((name) => !Object.hasOwn(lock.sources, name))) {
    throw new Error('Source lock must contain exactly FFmpeg, x264, libvpx, libopus and zlib');
  }
  const inputs = SOURCE_NAMES.map((name) => {
    const source = lock.sources[name];
    const details = archiveDetails(name, source);
    if (source.url !== details.url) throw new Error(`Unapproved ${name} source URL`);
    if (typeof source.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(source.sha256)) {
      throw new Error(`Invalid ${name} SHA-256 digest`);
    }
    return { ...details, sha256: source.sha256 };
  });
  if (new Set(inputs.map(({ filename }) => filename)).size !== inputs.length) {
    throw new Error('Duplicate source archive filename');
  }

  const destination = path.resolve(outDir);
  await mkdir(destination, { recursive: true });
  for (const { filename, url, sha256 } of inputs) {
    const target = path.join(destination, filename);
    let bytes;
    try {
      bytes = await readFile(target);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (bytes) {
      verifySha256(bytes, sha256);
      continue;
    }
    const response = await fetch(url, { redirect: 'error' });
    if (!response.ok || response.url !== url) throw new Error(`Unapproved or failed ${filename} source download`);
    bytes = Buffer.from(await response.arrayBuffer());
    verifySha256(bytes, sha256);
    const temporary = `${target}.${process.pid}.part`;
    try {
      await writeFile(temporary, bytes, { flag: 'wx' });
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return destination;
}

export { bundleSources } from './ffmpeg-source-bundle.mjs';
