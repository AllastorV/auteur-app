import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { expect, it } from 'vitest';

const candidate = process.env.RELEASE_CANDIDATE === '1' && process.platform === 'win32';

function ffmpegOutput(binary: string, option: string): string {
  const result = spawnSync(binary, ['-hide_banner', option], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`FFmpeg ${option} failed: ${result.error?.message ?? result.stderr}`);
  }
  return `${result.stdout}\n${result.stderr}`;
}

(candidate ? it : it.skip)('release FFmpeg is the source-built GPL binary with required media capabilities', () => {
  const binary = process.env.AUTEUR_FFMPEG_EXE;
  expect(binary, 'AUTEUR_FFMPEG_EXE is required for release candidates').toBeTruthy();
  expect(existsSync(binary!)).toBe(true);

  const version = ffmpegOutput(binary!, '-version');
  expect(version).toContain('ffmpeg version 9.0.2');
  for (const flag of ['--enable-gpl', '--enable-version3', '--disable-autodetect',
    '--enable-libx264', '--enable-libvpx', '--enable-libopus', '--enable-zlib']) {
    expect(version).toContain(flag);
  }

  const encoders = ffmpegOutput(binary!, '-encoders');
  for (const name of ['libx264', 'libvpx-vp9', 'libopus', 'aac']) {
    expect(encoders).toMatch(new RegExp(`\\b${name}\\b`));
  }
  const decoders = ffmpegOutput(binary!, '-decoders');
  for (const name of ['png', 'mp3', 'aac', 'opus', 'vorbis', 'pcm_s16le']) {
    expect(decoders).toMatch(new RegExp(`\\b${name}\\b`));
  }
  const demuxers = ffmpegOutput(binary!, '-demuxers');
  for (const name of ['image2', 'mp3', 'wav', 'mov', 'ogg']) {
    expect(demuxers).toMatch(new RegExp(`\\b${name}\\b`));
  }
  const muxers = ffmpegOutput(binary!, '-muxers');
  for (const name of ['mp4', 'webm']) {
    expect(muxers).toMatch(new RegExp(`\\b${name}\\b`));
  }
  const filters = ffmpegOutput(binary!, '-filters');
  for (const name of ['scale', 'apad']) {
    expect(filters).toMatch(new RegExp(`\\b${name}\\b`));
  }
});
