#!/usr/bin/env node
/** Inspect real portable-package contents, including the ASAR index. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPackage } from '@electron/asar';

const DENIED_DIRS = new Set([
  '.git', '.github', '.superpowers', '__tests__', 'tests', 'test', 'qa',
  'coverage', 'playwright-report', 'test-results', 'fixtures', 'fixture',
  'evidence', 'design', 'docs', 'doc', 'old', 'tools', '.vscode', 'screenshots',
]);
const DENIED_EXT = /\.(?:map|log|pem|key|p12|pfx|sbp|mzn|ts|tsx)$/i;
const TEST_FILE = /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/i;

/** @param {string[]} entries */
export function auditPackageEntries(entries) {
  const rejected = entries.filter((entry) => {
    if (typeof entry !== 'string') return true;
    const normalized = entry.replaceAll('\\', '/');
    const parts = normalized.split('/');
    if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return true;
    if (parts.some((part) => !part || part === '.' || part === '..')) return true;
    if (parts.some((part) => DENIED_DIRS.has(part.toLowerCase()))) return true;
    if (parts.some((part) => /^\.env(?:\..*)?$/i.test(part))) return true;
    if (parts[0].toLowerCase() === 'src') return true;
    return DENIED_EXT.test(normalized) || TEST_FILE.test(normalized);
  });
  return { ok: rejected.length === 0, rejected };
}

/**
 * @param {string} unpackedRoot electron-builder's win-unpacked directory
 * @returns {string[]} ASAR entries (archive-relative) and loose package paths.
 */
export function collectPackageEntries(unpackedRoot) {
  const root = path.resolve(unpackedRoot);
  const resources = path.join(root, 'resources');
  const asar = path.join(resources, 'app.asar');
  if (!fs.statSync(root).isDirectory() || !fs.statSync(resources).isDirectory()) {
    throw new Error(`Not a portable package directory: ${root}`);
  }
  if (!fs.statSync(asar).isFile()) throw new Error(`Missing app.asar: ${asar}`);

  // @electron/asar lists archive entries with a virtual leading slash.
  // Remove exactly that virtual slash; a remaining slash is a real bad path.
  const archived = listPackage(asar)
    .map((entry) => entry.replaceAll('\\', '/'))
    .filter((entry) => entry !== '/')
    .map((entry) => entry.startsWith('/') ? entry.slice(1) : entry);
  const loose = [];
  const walk = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, item.name);
      if (item.isSymbolicLink()) throw new Error(`Symlink in package: ${full}`);
      if (item.isDirectory()) walk(full);
      else if (item.isFile()) loose.push(path.relative(root, full).replaceAll('\\', '/'));
      else throw new Error(`Unsupported package entry: ${full}`);
    }
  };
  walk(root);
  return [...archived, ...loose];
}

/** @param {string[]} entries */
function missingRequired(entries) {
  const required = [
    ['app.asar', (entry) => entry === 'resources/app.asar'],
    ['Auteur GPL text', (entry) => entry === 'resources/licenses/Auteur-LICENSE'],
    ['third-party notices', (entry) => entry === 'resources/licenses/THIRD_PARTY_NOTICES.md'],
    ['Courier Prime OFL', (entry) => entry === 'resources/licenses/fonts/courier-prime-OFL.txt'],
    ['Tinos OFL', (entry) => entry === 'resources/licenses/fonts/tinos-OFL.txt'],
    ['IBM Plex OFL', (entry) => entry === 'resources/licenses/fonts/ibm-plex-sans-condensed-OFL.txt'],
    ['Electron license', (entry) => entry === 'LICENSE.electron.txt'],
    ['Chromium licenses', (entry) => entry === 'LICENSES.chromium.html'],
    ['FFmpeg runtime', (entry) => entry.endsWith('/node_modules/ffmpeg-static/ffmpeg.exe')],
    ['FFmpeg license', (entry) => entry.endsWith('/node_modules/ffmpeg-static/ffmpeg.exe.LICENSE')],
    ['FFmpeg build README', (entry) => entry.endsWith('/node_modules/ffmpeg-static/ffmpeg.exe.README')],
  ];
  return required.filter(([, found]) => !entries.some(found)).map(([label]) => label);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node tools/release-package-audit.mjs <win-unpacked>');
    const entries = collectPackageEntries(process.argv[2]);
    const result = auditPackageEntries(entries);
    const missing = missingRequired(entries);
    console.log(`Audited ${entries.length} ASAR and loose package entries.`);
    for (const entry of result.rejected) console.error(`REJECTED ${entry}`);
    for (const label of missing) console.error(`MISSING ${label}`);
    if (!result.ok || missing.length) process.exitCode = 1;
    else console.log('Portable package content and required notices: PASS');
  } catch (error) {
    console.error(`Package audit failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
