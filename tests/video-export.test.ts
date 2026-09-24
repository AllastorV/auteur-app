import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { frameCounts, renderVideo, setFfmpegPath } from '../apps/desktop/electron/video';
import { discardFrames, pushFrame, takeFrames } from '../apps/desktop/electron/frameStore';
import { planAnimatic, planDuration } from '@storyboard/core/export/animatic';
import { totalDuration } from '@storyboard/core/model/timeline';
import { createPanel } from '@storyboard/core/model/factory';
import type { Panel, TransitionKind } from '@storyboard/core/model/types';

const execFileAsync = promisify(execFile);
const FFMPEG = (ffmpegStatic as unknown as string) ?? '';
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbstudio-test-'));

afterAll(() => fs.rmSync(outDir, { recursive: true, force: true }));

/* ---------------- minimal PNG üretici (test verisi) ---------------- */

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Tek renkli PNG dataURL üretir. */
function solidPng(width: number, height: number, rgb: [number, number, number]): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      raw[row + 1 + x * 3] = rgb[0];
      raw[row + 2 + x * 3] = rgb[1];
      raw[row + 3 + x * 3] = rgb[2];
    }
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** ffmpeg çıktısından süreyi okur. */
async function probeDuration(file: string): Promise<number> {
  const { stderr } = await execFileAsync(FFMPEG, ['-i', file], { encoding: 'utf8' }).catch(
    (err: { stderr?: string }) => ({ stderr: err.stderr ?? '' }),
  );
  const match = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(stderr ?? '');
  if (!match) throw new Error(`Süre okunamadı:\n${stderr}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function panel(duration: number, transition: TransitionKind = 'cut', td = 0.5): Panel {
  const p = createPanel();
  p.meta.duration = duration;
  p.transition = transition;
  p.transitionDuration = td;
  return p;
}

describe.skipIf(!FFMPEG || !fs.existsSync(FFMPEG))('Animatik video dışa aktarma', () => {
  it('çıktı süresi zaman çizelgesi toplamıyla ±100 ms içinde eşleşir', async () => {
    setFfmpegPath(FFMPEG);

    const panels = [panel(2.0, 'dissolve', 0.5), panel(1.5, 'cut'), panel(0.75, 'fadeOut', 0.5)];
    const expected = totalDuration(panels); // 2.0 + 0.5 + 1.5 + 0.75 + 0.5 = 5.25
    expect(expected).toBeCloseTo(5.25, 6);

    const fps = 24;
    const plan = planAnimatic(panels, fps);
    expect(Math.abs(planDuration(plan) - expected)).toBeLessThan(0.001);

    const colors: [number, number, number][] = [
      [220, 40, 40],
      [40, 200, 90],
      [60, 120, 240],
    ];
    const segments = plan.map((step) => ({
      dataUrl: solidPng(64, 36, colors[step.panelIndex % colors.length]),
      duration: step.duration,
    }));

    const outputPath = path.join(outDir, 'animatik.mp4');
    await renderVideo(
      {
        jobId: 'test-job',
        fps,
        width: 64,
        height: 36,
        format: 'mp4',
        segments,
        outputPath,
        expectedDuration: expected,
      },
      () => {},
    );

    expect(fs.existsSync(outputPath)).toBe(true);
    const actual = await probeDuration(outputPath);
    expect(Math.abs(actual - expected)).toBeLessThan(0.1);
  }, 120000);

  it('kare sayıları toplam süreyi tam karşılar', () => {
    const cases: { durations: number[]; fps: number }[] = [
      { durations: [1, 1], fps: 25 },
      { durations: [2.4, 0.0417, 0.0417, 1.1], fps: 24 },
      { durations: [3.5, 2.25, 0.75], fps: 24 },
      { durations: [0.333, 0.333, 0.334], fps: 30 },
    ];
    for (const c of cases) {
      const segments = c.durations.map((d) => ({ dataUrl: '', duration: d }));
      const counts = frameCounts(segments, c.fps);
      const total = c.durations.reduce((a, b) => a + b, 0);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(Math.round(total * c.fps));
      expect(counts.every((n) => n >= 1)).toBe(true);
    }
  });

  it('WebM çıktısı da aynı süreyi korur', async () => {
    setFfmpegPath(FFMPEG);
    const panels = [panel(1.0, 'cut'), panel(1.0, 'cut')];
    const expected = totalDuration(panels);
    const plan = planAnimatic(panels, 25);
    const segments = plan.map((step) => ({
      dataUrl: solidPng(32, 18, step.panelIndex === 0 ? [255, 255, 255] : [0, 0, 0]),
      duration: step.duration,
    }));

    const outputPath = path.join(outDir, 'animatik.webm');
    await renderVideo(
      {
        jobId: 'test-webm',
        fps: 25,
        width: 32,
        height: 18,
        format: 'webm',
        segments,
        outputPath,
        expectedDuration: expected,
      },
      () => {},
    );

    expect(fs.existsSync(outputPath)).toBe(true);
    expect(Math.abs((await probeDuration(outputPath)) - expected)).toBeLessThan(0.1);
  }, 120000);

  it('kısa ses dosyası eklendiğinde video süresi korunur', async () => {
    setFfmpegPath(FFMPEG);
    // 0.5 saniyelik sessiz WAV
    const sampleRate = 8000;
    const samples = sampleRate / 2;
    const wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + samples * 2, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate * 2, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(samples * 2, 40);
    const audioPath = path.join(outDir, 'ses.wav');
    fs.writeFileSync(audioPath, wav);

    const panels = [panel(2.0, 'cut'), panel(1.5, 'cut')];
    const expected = totalDuration(panels); // 3.5
    const plan = planAnimatic(panels, 24);
    const segments = plan.map((step) => ({
      dataUrl: solidPng(32, 18, step.panelIndex === 0 ? [200, 30, 30] : [30, 200, 30]),
      duration: step.duration,
    }));

    const outputPath = path.join(outDir, 'sesli.mp4');
    await renderVideo(
      {
        jobId: 'test-audio',
        fps: 24,
        width: 32,
        height: 18,
        format: 'mp4',
        segments,
        audioPath,
        outputPath,
        expectedDuration: expected,
      },
      () => {},
    );

    expect(fs.existsSync(outputPath)).toBe(true);
    expect(Math.abs((await probeDuration(outputPath)) - expected)).toBeLessThan(0.1);
  }, 120000);

  it('ilerleme bildirimleri gönderilir', async () => {
    setFfmpegPath(FFMPEG);
    const phases: string[] = [];
    await renderVideo(
      {
        jobId: 'test-progress',
        fps: 24,
        width: 32,
        height: 18,
        format: 'mp4',
        segments: [{ dataUrl: solidPng(32, 18, [10, 10, 10]), duration: 0.5 }],
        outputPath: path.join(outDir, 'progress.mp4'),
        expectedDuration: 0.5,
      },
      (p) => phases.push(p.phase),
    );
    expect(phases).toContain('hazirlik');
    expect(phases).toContain('tamamlandi');
  }, 120000);
});

describe.skipIf(!FFMPEG || !fs.existsSync(FFMPEG))('Kare akışı ile dışa aktarma', () => {
  it('diske akıtılmış karelerden aynı süreyi üretir', async () => {
    setFfmpegPath(FFMPEG);

    const panels = [panel(2.0, 'dissolve', 0.5), panel(1.5, 'cut'), panel(0.75, 'fadeOut', 0.5)];
    const expected = totalDuration(panels);
    const fps = 24;
    const plan = planAnimatic(panels, fps);

    const colors: [number, number, number][] = [
      [220, 40, 40],
      [40, 200, 90],
      [60, 120, 240],
    ];

    // Renderer'ın yaptığı gibi: kareler tek tek gönderilir, bellekte birikmez.
    const jobId = 'stream-job';
    plan.forEach((step, index) => {
      pushFrame({
        jobId,
        index,
        dataUrl: solidPng(64, 36, colors[step.panelIndex % colors.length]),
        duration: step.duration,
      });
    });

    const diskSegments = takeFrames(jobId)!;
    expect(diskSegments).toHaveLength(plan.length);

    const outputPath = path.join(outDir, 'animatik-akis.mp4');
    await renderVideo(
      {
        jobId,
        fps,
        width: 64,
        height: 36,
        format: 'mp4',
        diskSegments,
        outputPath,
        expectedDuration: expected,
      },
      () => {},
    );
    discardFrames(jobId);

    expect(fs.existsSync(outputPath)).toBe(true);
    const actual = await probeDuration(outputPath);
    expect(Math.abs(actual - expected)).toBeLessThan(0.1);
  }, 120000);

  it('bellekten geçen yol ile akış yolu birebir aynı süreyi verir', async () => {
    setFfmpegPath(FFMPEG);
    const panels = [panel(1.0, 'dissolve', 0.5), panel(1.0, 'cut')];
    const fps = 25;
    const plan = planAnimatic(panels, fps);
    const frames = plan.map((step) => ({
      dataUrl: solidPng(32, 18, step.panelIndex === 0 ? [255, 0, 0] : [0, 0, 255]),
      duration: step.duration,
    }));

    const memoryPath = path.join(outDir, 'bellek.mp4');
    await renderVideo(
      { jobId: 'mem', fps, width: 32, height: 18, format: 'mp4', segments: frames, outputPath: memoryPath, expectedDuration: 0 },
      () => {},
    );

    const jobId = 'disk';
    frames.forEach((f, index) => pushFrame({ jobId, index, dataUrl: f.dataUrl, duration: f.duration }));
    const streamPath = path.join(outDir, 'akis.mp4');
    await renderVideo(
      {
        jobId,
        fps,
        width: 32,
        height: 18,
        format: 'mp4',
        diskSegments: takeFrames(jobId)!,
        outputPath: streamPath,
        expectedDuration: 0,
      },
      () => {},
    );
    discardFrames(jobId);

    expect(await probeDuration(streamPath)).toBeCloseTo(await probeDuration(memoryPath), 2);
  }, 120000);

  it('kare yoksa sessizce boş video üretmez', async () => {
    setFfmpegPath(FFMPEG);
    await expect(
      renderVideo(
        {
          jobId: 'bos',
          fps: 24,
          width: 32,
          height: 18,
          format: 'mp4',
          segments: [],
          outputPath: path.join(outDir, 'bos.mp4'),
          expectedDuration: 0,
        },
        () => {},
      ),
    ).rejects.toThrow(/kare yok/i);
  });
});
