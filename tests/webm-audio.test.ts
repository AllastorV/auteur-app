import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { expect, it } from 'vitest';
import { renderVideo, setFfmpegPath } from '../apps/desktop/electron/video';

const fixtureBinary = ffmpegStatic as string | null;
const renderBinary = process.env.AUTEUR_FFMPEG_EXE || fixtureBinary;

function probe(file: string): string {
  const result = spawnSync(renderBinary!, ['-hide_banner', '-i', file], { encoding: 'utf8', windowsHide: true });
  return `${result.stdout}\n${result.stderr}`;
}

it.skipIf(!fixtureBinary || !renderBinary || !fs.existsSync(renderBinary))(
  'exports WebM with Opus audio and MP4 with AAC without changing their duration',
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auteur-audio-'));
    try {
      const png = path.join(dir, 'frame.png');
      const wav = path.join(dir, 'tone.wav');
      execFileSync(fixtureBinary!, [
        '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=32x18:d=0.1',
        '-frames:v', '1', png,
      ]);
      execFileSync(fixtureBinary!, [
        '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5',
        '-c:a', 'pcm_s16le', wav,
      ]);
      setFfmpegPath(renderBinary!);
      for (const format of ['webm', 'mp4'] as const) {
        const outputPath = path.join(dir, `video.${format}`);
        await renderVideo({
          jobId: `test-audio-${format}`, fps: 24, width: 32, height: 18, format,
          segments: [{ dataUrl: `data:image/png;base64,${fs.readFileSync(png).toString('base64')}`, duration: 1.5 }],
          audioPath: wav, outputPath, expectedDuration: 1.5,
        }, () => {});
        const media = probe(outputPath);
        expect(media).toMatch(format === 'webm' ? /Audio: opus/i : /Audio: aac/i);
        const duration = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(media);
        expect(duration).not.toBeNull();
        const seconds = Number(duration![1]) * 3600 + Number(duration![2]) * 60 + Number(duration![3]);
        expect(Math.abs(seconds - 1.5)).toBeLessThan(0.1);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120000,
);
