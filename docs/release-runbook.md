# Release Runbook

## Preconditions

- Working tree is clean except intended release changes.
- Version is set in root `package.json` and `apps/desktop/package.json`.
- `CHANGELOG.md` has the release entry.
- CI passes on `main`.

## Local Verification

```bash
pnpm install --frozen-lockfile
pnpm release:local
pnpm release:dist
```

`pnpm package` creates a local macOS ad-hoc build for development verification.

CI uses `pnpm --filter @skill-manager/desktop package:mac`. When `CSC_LINK` or `CSC_NAME` is configured, the macOS package uses that signing identity. Without those credentials, the package uses ad-hoc signing for direct download distribution.

CI build jobs verify their own platform assets with `node scripts/verify-release-assets.mjs --platform=current`. The publish job verifies the flattened all-platform asset directory before creating the draft GitHub Release.

The publish job attaches release binaries, update metadata, `SHA256SUMS.txt`, and screenshots:

- `screenshot-main.png`
- `screenshot-dark.png`
- `screenshot-compact.png`

Run the packaged app launch probe after packaging:

```bash
pnpm smoke:packaged
```

Linux CI runs the same command through `xvfb-run -a`.

`release-dist/` is the local preview of the final GitHub Release asset set.

## macOS Verification

```bash
codesign --verify --deep --strict --verbose=2 "dist-electron/mac-arm64/Skill Manager.app"
```

For signed Developer ID releases:

```bash
spctl -a -vvv -t install "dist-electron/mac-arm64/Skill Manager.app"
xcrun stapler validate "dist-electron/mac-arm64/Skill Manager.app"
```

## Direct-Download Verification

Verify the final release directory:

```bash
node scripts/verify-release-assets.mjs release-dist
shasum -a 256 -c release-dist/SHA256SUMS.txt
```

Install and launch the downloaded artifact on each target platform. Keep the launch result in `docs/releases/v0.5.0.md`.

## Tag Release

```bash
git tag v0.5.0
git push origin main v0.5.0
```

The release workflow creates a draft GitHub Release with artifacts and generated notes.

## Publish

1. Download artifacts from the draft release.
2. Verify `SHA256SUMS.txt`.
3. Verify archive/file formats with the release checks in `docs/testing.md`.
4. Install on macOS, Windows, and Linux.
5. Run smoke flow from `docs/testing.md`.
6. Add release evidence under `docs/releases/v0.5.0.md`.
7. Publish the GitHub Release.

## Recovery

If validation fails before publishing, keep the release draft private and replace the artifacts with a fixed build.

If a public release needs correction, publish a higher patch version and describe affected platforms in the release notes.
