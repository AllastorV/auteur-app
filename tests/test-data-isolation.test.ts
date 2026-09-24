import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

it('server tests never use the real default room directory', () => {
  const target = process.env.STORYBOARD_DATA_DIR;
  expect(target).toBeTruthy();
  const resolved = path.resolve(target!);
  const temp = path.resolve(os.tmpdir());
  expect(resolved.startsWith(`${temp}${path.sep}`)).toBe(true);
  expect(resolved).not.toBe(path.join(os.homedir(), '.mizansen-sunucu'));
});
