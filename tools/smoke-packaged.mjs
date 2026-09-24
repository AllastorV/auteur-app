#!/usr/bin/env node
/** Clean-profile smoke test of the exact unpacked Windows release candidate. */
import { _electron as electron } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve('apps/desktop/release/win-unpacked');
const executablePath = path.join(root, 'Auteur.exe');
const ffmpeg = path.join(root, 'resources', 'ffmpeg', 'ffmpeg.exe');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'auteur-release-profile-'));
const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'auteur-release-video-'));
let app;

function mediaDetails(file) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8', windowsHide: true });
  const output = `${result.stdout}\n${result.stderr}`;
  const duration = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(output);
  if (!duration) throw new Error(`Cannot probe ${file}: ${output}`);
  return {
    bytes: fs.statSync(file).size,
    video: /Video:\s*([^,]+)/.exec(output)?.[1],
    audio: /Audio:\s*([^,]+)/.exec(output)?.[1] ?? null,
    seconds: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]),
  };
}

try {
  if (!fs.existsSync(executablePath) || !fs.existsSync(ffmpeg)) {
    throw new Error('Packaged Auteur or bundled FFmpeg is missing');
  }
  app = await electron.launch({ executablePath, args: [`--user-data-dir=${profile}`], cwd: root });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  const packaged = await app.evaluate(({ app: running }) => running.isPackaged);
  if (!packaged) throw new Error('Electron did not launch a packaged application');

  await page.locator('[data-testid="kitaplik-yeni"], [data-testid="bos-yeni"]').first().click();
  await page.getByTestId('yeni-proje-olustur').click();
  await page.getByTestId('mod-board').click();
  await page.getByTestId('canvas-container').waitFor();
  await page.screenshot({ path: path.join(evidence, 'clean-profile-storyboard.png') });

  const outputs = Object.fromEntries(['mp4', 'webm'].map((format) => [format, path.join(evidence, `animatic.${format}`)]));
  await app.evaluate(({ dialog }, targets) => {
    dialog.showSaveDialog = async (options) => ({
      canceled: false,
      filePath: targets[options.filters?.[0]?.extensions?.[0] ?? 'mp4'],
    });
  }, outputs);

  for (const format of ['mp4', 'webm']) {
    await page.getByTestId('disa-aktar-dugmesi').click();
    const panel = page.locator('[role="dialog"]');
    await panel.getByTestId('kapsam-storyboard').click();
    await panel.getByTestId('storyboard-bicim').selectOption('video');
    await panel.locator('select:has(option[value="webm"])').selectOption(format);
    await panel.getByTestId('disa-aktar-uret').click();
    const output = outputs[format];
    const deadline = Date.now() + 120_000;
    while ((!fs.existsSync(output) || fs.statSync(output).size < 1024) && Date.now() < deadline) {
      await page.waitForTimeout(500);
    }
    if (!fs.existsSync(output) || fs.statSync(output).size < 1024) {
      throw new Error(`Packaged ${format} export did not produce a video`);
    }
    const details = mediaDetails(output);
    if (!details.video?.includes(format === 'mp4' ? 'h264' : 'vp9')) {
      throw new Error(`Wrong ${format} codec: ${JSON.stringify(details)}`);
    }
    console.log(JSON.stringify({ format, ...details }));
  }
  console.log(`Packaged smoke PASS. Evidence: ${evidence}`);
} finally {
  if (app) {
    await app.evaluate(({ app: running }) => running.exit(0)).catch(() => {});
    await app.close().catch(() => {});
  }
}
