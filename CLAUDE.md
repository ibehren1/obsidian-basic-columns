# Project rules

## Versioning: every commit bumps the patch version

Every commit must increase `z` in the `x.y.z` version, no matter how small the
change. The `.githooks/pre-commit` hook does this automatically via
`scripts/bump-patch.mjs` (updates `manifest.json`, `package.json`,
`package-lock.json`, and `versions.json`). `npm install` enables the hook
(`core.hooksPath`).

- Never commit with `--no-verify`.
- If a commit is made without the hook, run `node scripts/bump-patch.mjs` and
  stage the version files before committing.
- CI (`scripts/check-version-bumps.mjs`) rejects any commit whose version isn't
  greater than its parent's.
- Every push to `main` publishes a GitHub release tagged with the new version.
