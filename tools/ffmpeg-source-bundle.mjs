import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveDetails, fetchLockedSources } from './ffmpeg-sources.mjs';

const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const LICENSE_FILES = [
  'ffmpeg-GPLv3.txt', 'ffmpeg-LICENSE.md', 'x264-COPYING.txt',
  'libvpx-LICENSE.txt', 'libvpx-PATENTS.txt', 'libopus-COPYING.txt', 'zlib-LICENSE.txt',
];

export async function bundleSources(sourceDir, outputZip, lockFile = path.join(repositoryRoot, 'tools', 'ffmpeg-source-lock.json')) {
  const verifiedDir = await fetchLockedSources(lockFile, sourceDir);
  const work = path.dirname(verifiedDir);
  const lockBytes = await readFile(lockFile);
  const lock = JSON.parse(lockBytes.toString('utf8'));
  const recordBytes = await readFile(path.join(work, 'build-record.json'));
  const record = JSON.parse(recordBytes.toString('utf8'));
  if (record.schemaVersion !== 1) throw new Error('Invalid FFmpeg build record');

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const manifest = [];
  for (const name of ['ffmpeg', 'x264', 'libvpx', 'libopus', 'zlib']) {
    const source = lock.sources[name];
    const { filename } = archiveDetails(name, source);
    const recorded = record.sources?.[name];
    if (recorded?.sha256 !== source.sha256 || recorded?.archive !== filename ||
        recorded?.url !== source.url) throw new Error(`${name} build-record source identity mismatch`);
    const entry = `release-work/ffmpeg/sources/${filename}`;
    zip.file(entry, await readFile(path.join(verifiedDir, filename)));
    manifest.push(`${source.sha256}  ${entry}`);
  }
  for (const filename of LICENSE_FILES) {
    zip.file(`release-work/ffmpeg/licenses/${filename}`, await readFile(path.join(work, 'licenses', filename)));
  }
  for (const filename of ['build-ffmpeg.sh', 'ffmpeg-sources.mjs', 'ffmpeg-source-bundle.mjs', 'ffmpeg-build-record.mjs']) {
    zip.file(`tools/${filename}`, await readFile(path.join(repositoryRoot, 'tools', filename)));
  }
  zip.file('tools/ffmpeg-source-lock.json', lockBytes);
  zip.file('release-work/ffmpeg/build-record.json', recordBytes);
  zip.file('release-work/ffmpeg/build-commands.txt', await readFile(path.join(work, 'build-commands.txt')));
  const manifestText = `${manifest.join('\n')}\n`;
  zip.file('SOURCE_SHA256SUMS.txt', manifestText);
  zip.file('REBUILD.md', [
    '# Rebuilding Auteur’s bundled FFmpeg',
    '',
    'This ZIP contains the exact five upstream source archives used for the binary,',
    'their license notices, the source lock, build script and original toolchain record.',
    'Extract it into an empty directory on Windows. In an MSYS2 UCRT64 shell, install',
    '`base-devel`, `mingw-w64-ucrt-x86_64-toolchain`, `mingw-w64-ucrt-x86_64-nasm`,',
    '`mingw-w64-ucrt-x86_64-pkgconf`, `make`, `tar`, `xz`, `diffutils` and Node.js 22 or newer.',
    'Run `bash tools/build-ffmpeg.sh` from the extracted directory. The script verifies',
    'every archive against `tools/ffmpeg-source-lock.json` before extraction.',
    'The rebuilt binary appears at `release-work/ffmpeg/ffmpeg.exe`.',
    'Compare its features and imports with `release-work/ffmpeg/build-record.json`;',
    'byte-identical output is not guaranteed across different toolchain revisions.',
    '',
  ].join('\n'));
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
  await writeFile(path.join(work, 'SOURCE_SHA256SUMS.txt'), manifestText);
  await writeFile(outputZip, bytes);
}
