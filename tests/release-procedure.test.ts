import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

const read = (name: string) => fs.readFileSync(path.resolve(name), 'utf8');

it('public signing policy and release procedure never promise a signature before verification', () => {
  const policy = read('CODE_SIGNING_POLICY.md');
  const procedure = read('docs/release/release-procedure.md');
  expect(policy).toMatch(/currently \*\*unsigned\*\*/i);
  expect(policy).toContain('AllastorV');
  expect(procedure).toContain('Auteur-FFmpeg-Corresponding-Source.zip');
  expect(procedure).toContain('same GitHub release');
  expect(procedure).toContain('upload_compliant_bundle=false');
  expect(procedure).toContain('website and Gumroad');
  expect(procedure).toMatch(/Authenticator|multi-factor authentication/i);
  expect(procedure).toContain('Authenticode');
});
