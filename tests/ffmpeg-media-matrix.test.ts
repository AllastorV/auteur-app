import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { expect, it } from 'vitest';
import { cancelVideo, renderVideo, setFfmpegPath } from '../apps/desktop/electron/video';

const fixture = ffmpegStatic as string | null;
const binary = process.env.AUTEUR_FFMPEG_EXE || fixture;
const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5+QnsAAAAASUVORK5CYII=';

function probe(file: string): string {
  const result = spawnSync(binary!, ['-hide_banner', '-i', file], { encoding: 'utf8', windowsHide: true });
  return `${result.stdout}\n${result.stderr}`;
}

it.skipIf(!fixture || !binary || !fs.existsSync(binary))(
  'source-built FFmpeg exports silent and MP3/WAV/M4A/AAC/Ogg-backed MP4 and WebM',
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auteur-format-matrix-'));
    try {
      const wav = path.join(dir, 'tone.wav');
      execFileSync(fixture!, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
        'sine=frequency=440:duration=0.45', '-c:a', 'pcm_s16le', wav]);
      const inputs: Array<string | null> = [null, wav];
      for (const [ext, codec] of [['mp3', 'libmp3lame'], ['m4a', 'aac'], ['aac', 'aac'], ['ogg', 'libvorbis']]) {
        const audio = path.join(dir, `tone.${ext}`);
        execFileSync(fixture!, ['-hide_banner', '-loglevel', 'error', '-i', wav, '-c:a', codec, audio]);
        inputs.push(audio);
      }
      setFfmpegPath(binary!);
      for (const format of ['mp4', 'webm'] as const) {
        for (const audioPath of inputs) {
          const label = audioPath ? path.extname(audioPath).slice(1) : 'silent';
          const outputPath = path.join(dir, `${label}.${format}`);
          await renderVideo({ jobId: `matrix-${format}-${label}`, fps: 12, width: 32, height: 18,
            format, segments: [{ dataUrl: `data:image/png;base64,${pixel}`, duration: 0.75 }],
            audioPath, outputPath, expectedDuration: 0.75 }, () => {});
          const media = probe(outputPath);
          expect(media, `${format}/${label}`).toMatch(format === 'mp4' ? /Video: h264/i : /Video: vp9/i);
          if (audioPath) expect(media, `${format}/${label}`).toMatch(format === 'mp4' ? /Audio: aac/i : /Audio: opus/i);
          else expect(media, `${format}/${label}`).not.toMatch(/Audio:/i);
          const duration = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(media);
          expect(duration, `${format}/${label}`).not.toBeNull();
          const seconds = Number(duration![1]) * 3600 + Number(duration![2]) * 60 + Number(duration![3]);
          expect(Math.abs(seconds - 0.75), `${format}/${label}`).toBeLessThan(0.15);
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120000,
);

it.skipIf(!binary || !fs.existsSync(binary))('cancelled render preserves an existing output byte-for-byte', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auteur-cancel-matrix-'));
  try {
    setFfmpegPath(binary!);
    const outputPath = path.join(dir, 'existing.mp4');
    const sentinel = Buffer.from('Existing approved video must survive cancellation.');
    fs.writeFileSync(outputPath, sentinel);
    const jobId = 'cancel-existing-output';
    let cancelled = false;
    await expect(renderVideo({ jobId, fps: 24, width: 32, height: 18, format: 'mp4',
      segments: [{ dataUrl: `data:image/png;base64,${pixel}`, duration: 120 }],
      outputPath, expectedDuration: 120 }, (progress) => {
      if (progress.phase === 'kodlama' && !cancelled) {
        cancelled = true;
        cancelVideo(jobId);
      }
    })).rejects.toThrow(/İptal edildi/);
    expect(cancelled).toBe(true);
    expect(fs.readFileSync(outputPath)).toEqual(sentinel);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 120000);
