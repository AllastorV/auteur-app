import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import * as paths from '../apps/desktop/electron/paths';

it('uses only the bundled binary for a packaged app, never the developer fallback', () => {
  expect(paths.resolveFfmpegBinary).toBeTypeOf('function');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auteur-ffmpeg-path-'));
  try {
    const dev = path.join(root, 'development.exe');
    fs.writeFileSync(dev, 'dev');
    const resources = path.join(root, 'resources');
    const bundled = path.join(resources, 'ffmpeg', 'ffmpeg.exe');
    expect(paths.resolveFfmpegBinary(true, resources, dev)).toBeNull();
    fs.mkdirSync(path.dirname(bundled), { recursive: true });
    fs.writeFileSync(bundled, 'bundled');
    expect(paths.resolveFfmpegBinary(true, resources, dev)).toBe(bundled);
    expect(paths.resolveFfmpegBinary(false, resources, dev)).toBe(dev);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
