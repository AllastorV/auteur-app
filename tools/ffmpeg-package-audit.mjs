import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const lock = JSON.parse(fs.readFileSync(new URL('./ffmpeg-source-lock.json', import.meta.url), 'utf8'));
const COMPONENTS = ['ffmpeg', 'x264', 'libvpx', 'libopus', 'zlib'];
const LICENSES = [
  'ffmpeg-GPLv3.txt', 'ffmpeg-LICENSE.md', 'x264-COPYING.txt',
  'libvpx-LICENSE.txt', 'libvpx-PATENTS.txt', 'libopus-COPYING.txt', 'zlib-LICENSE.txt',
];
const SYSTEM_DLLS = new Set([
  'advapi32.dll', 'avicap32.dll', 'bcrypt.dll', 'comctl32.dll', 'comdlg32.dll',
  'crypt32.dll', 'gdi32.dll', 'kernel32.dll', 'ole32.dll', 'oleaut32.dll',
  'shell32.dll', 'shlwapi.dll', 'ucrtbase.dll', 'user32.dll', 'winmm.dll', 'ws2_32.dll',
]);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const archiveName = (name, source) => name === 'ffmpeg' ? `ffmpeg-${source.version}.tar.xz`
  : name === 'libopus' ? `opus-${source.version}.tar.gz`
    : `${name}-${source.commit ?? source.version}.tar.gz`;

function inspectDllImports(binary) {
  const output = execFileSync(process.env.AUTEUR_OBJDUMP || 'objdump', ['-p', binary], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true,
  });
  return [...output.matchAll(/DLL Name:\s*([^\s]+)/gi)].map((match) => match[1]);
}

/** Audit actual resource bytes against the build record and exact-source manifest. */
export function auditFfmpegBundle(unpackedRoot, buildRecordPath, sourceManifestPath, inspectImports = inspectDllImports) {
  const errors = [];
  const binary = path.join(unpackedRoot, 'resources', 'ffmpeg', 'ffmpeg.exe');
  const licenses = path.join(unpackedRoot, 'resources', 'licenses', 'ffmpeg');
  let record;
  try {
    record = JSON.parse(fs.readFileSync(buildRecordPath, 'utf8'));
    if (record.schemaVersion !== 1) errors.push('Invalid FFmpeg build record');
  } catch {
    errors.push('Missing or invalid FFmpeg build record');
  }

  let manifest = new Map();
  try {
    const lines = fs.readFileSync(sourceManifestPath, 'utf8').trim().split(/\r?\n/);
    for (const line of lines) {
      const match = /^([0-9a-f]{64})  release-work\/ffmpeg\/sources\/([A-Za-z0-9.-]+)$/.exec(line);
      if (!match || manifest.has(match[2])) throw new Error('invalid source manifest');
      manifest.set(match[2], match[1]);
    }
    if (manifest.size !== COMPONENTS.length) errors.push('Incomplete FFmpeg source manifest');
  } catch {
    errors.push('Missing or invalid FFmpeg source manifest');
    manifest = new Map();
  }

  for (const name of COMPONENTS) {
    const expected = lock.sources[name];
    const archive = archiveName(name, expected);
    const actual = record?.sources?.[name];
    if (!actual || actual.archive !== archive ||
        Object.entries(expected).some(([key, value]) => actual[key] !== value)) {
      errors.push(`${name} source identity mismatch`);
    }
    if (manifest.get(archive) !== expected.sha256) errors.push(`${name} source manifest mismatch`);
  }
  if (record?.sources && Object.keys(record.sources).length !== COMPONENTS.length) {
    errors.push('Unexpected FFmpeg source count');
  }

  for (const license of LICENSES) {
    if (!fs.existsSync(path.join(licenses, license))) errors.push(`Missing FFmpeg license: ${license}`);
  }
  if (!fs.existsSync(binary)) {
    errors.push('Missing FFmpeg executable');
  } else {
    if (sha256(fs.readFileSync(binary)) !== record?.binary?.sha256) errors.push('FFmpeg SHA-256 mismatch');
    try {
      const imports = inspectImports(binary);
      if (!Array.isArray(imports) || imports.length === 0) throw new Error('Empty DLL import table');
      for (const name of imports) {
        const lower = name.toLowerCase();
        if (!SYSTEM_DLLS.has(lower) && !/^api-ms-win-crt-[a-z0-9-]+\.dll$/.test(lower)) {
          errors.push(`Unexpected FFmpeg DLL: ${name}`);
        }
      }
      if (JSON.stringify([...imports].map((item) => item.toLowerCase()).sort()) !==
          JSON.stringify((record?.binary?.imports ?? []).map((item) => item.toLowerCase()).sort())) {
        errors.push('FFmpeg import table mismatch');
      }
    } catch {
      errors.push('FFmpeg DLL import inspection failed');
    }
  }
  return { ok: errors.length === 0, errors };
}
