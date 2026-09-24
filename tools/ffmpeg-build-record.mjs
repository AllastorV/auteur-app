import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const work = path.join(root, 'release-work', 'ffmpeg');
const lock = JSON.parse(await readFile(path.join(root, 'tools', 'ffmpeg-source-lock.json'), 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const output = (command, args) => execFileSync(command, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();

const sourceFiles = {
  ffmpeg: `ffmpeg-${lock.sources.ffmpeg.version}.tar.xz`,
  x264: `x264-${lock.sources.x264.commit}.tar.gz`,
  libvpx: `libvpx-${lock.sources.libvpx.commit}.tar.gz`,
  libopus: `opus-${lock.sources.libopus.version}.tar.gz`,
  zlib: `zlib-${lock.sources.zlib.version}.tar.gz`,
};
const sources = {};
for (const [name, filename] of Object.entries(sourceFiles)) {
  const measured = sha256(await readFile(path.join(work, 'sources', filename)));
  if (measured !== lock.sources[name].sha256) throw new Error(`${name} source SHA-256 mismatch`);
  sources[name] = { ...lock.sources[name], archive: filename };
}

const binary = path.join(work, 'ffmpeg.exe');
const imports = [...output('objdump', ['-p', binary]).matchAll(/DLL Name:\s*([^\s]+)/gi)]
  .map((match) => match[1]).sort();
if (imports.length === 0) throw new Error('No DLL import table found in FFmpeg binary');

const record = {
  schemaVersion: 1,
  binary: { filename: 'ffmpeg.exe', sha256: sha256(await readFile(binary)), imports },
  sources,
  toolchain: {
    gcc: output('gcc', ['--version']).split('\n')[0],
    nasm: output('nasm', ['-v']),
    pkgConfig: output('pkg-config', ['--version']),
    make: output('make', ['--version']).split('\n')[0],
    msys2Packages: output('pacman', ['-Q']).split('\n').filter((line) => /^(mingw-w64-ucrt-x86_64-|mingw-w64-clang-x86_64-|msys2-runtime|make |tar )/.test(line)),
  },
  ffmpegVersion: output(binary, ['-version']),
  ffmpegBuildconf: output(binary, ['-buildconf']),
  buildCommands: await readFile(path.join(work, 'build-commands.txt'), 'utf8'),
};
await writeFile(path.join(work, 'build-record.json'), `${JSON.stringify(record, null, 2)}\n`);
console.log(`Recorded FFmpeg SHA-256 ${record.binary.sha256}`);
