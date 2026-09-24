# Contributing to Auteur

Bug reports, translation fixes, and code contributions are welcome. Please describe what you tried, what you expected, what happened, and how to reproduce a problem.

By submitting code, you agree that your contribution can be distributed under Auteur's [GPL-3.0-only license](LICENSE). You keep your copyright; no separate contributor license agreement is required. Submit only work you have the right to share.

## Before a pull request

1. Find the existing owner of a rule or calculation before adding another copy.
2. Keep project data safe. Changes to saving, recovery, or history need a test for the relevant data-loss case.
3. Report errors to the user; do not hide failures in empty catch blocks.
4. Test the production path as well as the helper you changed. Where practical, verify that the test fails when the behavior is deliberately broken.
5. Measure performance claims instead of guessing.

Run the app and checks locally:

```bash
npm ci
npm run dev
npm run typecheck
npm test
```

The desktop client is in `apps/desktop`, the collaboration web client in `apps/web`, the room server in `apps/server`, and shared application code in `packages/core`.

The Auteur name and logo are separate from the code license.
