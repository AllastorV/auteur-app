import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

const workflow = fs.readFileSync(path.resolve('.github/workflows/windows-candidate.yml'), 'utf8');

it('Windows candidate workflow is manual, pinned, read-only, and does not publish by default', () => {
  expect(workflow).toContain('workflow_dispatch:');
  expect(workflow).toContain('contents: read');
  expect(workflow).toMatch(/upload_compliant_bundle:[\s\S]*?default: false/);
  expect(workflow).toContain('if: ${{ success() && inputs.upload_compliant_bundle }}');
  for (const [, revision] of workflow.matchAll(/uses:\s*([^\s#]+)/g)) {
    expect(revision).toMatch(/^[\w-]+\/[\w-]+@[0-9a-f]{40}$/);
  }
  expect(workflow).not.toMatch(/gh release create|contents:\s*write|signpath.*submit/i);
});

it('candidate tests exact source, Windows package, clean profile and upload bundle', () => {
  for (const gate of [
    'bash tools/build-ffmpeg.sh',
    'Auteur-FFmpeg-Corresponding-Source.zip',
    'npm run typecheck',
    'npm test -- --reporter=dot',
    'tools/release-package-audit.mjs',
    'node tools/smoke-packaged.mjs',
    'Auteur-Windows-unsigned.exe',
    'SHA256SUMS.txt',
  ]) expect(workflow).toContain(gate);
});
