import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

const root = path.join(__dirname, '..');
const desktop = path.join(root, 'apps', 'desktop');

it('packages exactly the source-built FFmpeg resource and keeps Gyan development-only', () => {
  const config = JSON.parse(fs.readFileSync(path.join(desktop, 'electron-builder.json'), 'utf8')) as {
    extraResources: { from: string; to: string }[];
    asarUnpack?: string[];
  };
  const packageJson = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
  };
  expect(config.extraResources).toContainEqual({
    from: '../../release-work/ffmpeg/ffmpeg.exe',
    to: 'ffmpeg/ffmpeg.exe',
  });
  expect(config.asarUnpack ?? []).not.toContain('**/node_modules/ffmpeg-static/**');
  expect(packageJson.dependencies).not.toHaveProperty('ffmpeg-static');
});
