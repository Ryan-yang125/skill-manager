# Testing

## Local Gate

Run:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
pnpm smoke
pnpm smoke:packaged
pnpm audit
```

## Core Tests

Core tests cover:

- skill parsing
- missing and malformed frontmatter recovery
- folded multiline descriptions
- package lock parsing
- package identity fallback
- scanner behavior
- all three global user roots
- duplicate names across roots
- usage evidence
- repeated usage matches on one log line
- archived Codex session coverage
- Claude skill tool evidence
- archive and restore ledger behavior
- archive destination conflicts
- report export
- inventory decisions
- archive and restore by inventory id
- archive path component safety

## Desktop Checks

Desktop lint covers:

- Electron main process types
- preload bridge types
- React renderer types

Smoke test launches the built Electron app with Playwright, waits for a completed scan, verifies that Node APIs are unavailable in the renderer, verifies malformed IPC payload rejection, verifies non-HTTPS external URL rejection, and captures a screenshot.

Packaged smoke launches the current-platform unpacked app from `dist-electron`, uses a temporary HOME and app data directory, keeps the app alive for 10 seconds, then terminates the process tree. In CI, Linux runs this check under `xvfb-run`.

## Release Checks

Run:

```bash
pnpm release:local
pnpm release:dist
```

`pnpm verify:artifacts` checks that every top-level release artifact has a matching SHA256 entry and that every digest matches the current file bytes.

`pnpm verify:release-assets` also checks required platform artifacts, archive formats, macOS DMG/zip integrity, Debian package structure, and `latest*.yml` update metadata SHA512/size values.

CI platform jobs use:

```bash
node scripts/verify-release-assets.mjs --platform=current
pnpm smoke:packaged
```

The release workflow builds macOS arm64, Windows x64, and Linux x64. The publish job uses the default all-platform mode against the flattened release directory.

`pnpm release:dist` prepares a local `release-dist/` directory with release artifacts, screenshots, release notes, `SHA256SUMS.txt`, and asset verification. It mirrors the GitHub Release publish job before uploading.

For macOS local verification:

```bash
codesign --verify --deep --strict --verbose=2 "dist-electron/mac-arm64/Skill Manager.app"
spctl -a -vvv -t install "dist-electron/mac-arm64/Skill Manager.app"
```

Ad-hoc macOS builds can fail Gatekeeper assessment. Developer ID release builds should pass when signing and notarization credentials are configured.

For release artifact integrity:

```bash
file dist-electron/SkillManager-*.AppImage dist-electron/SkillManager-*.deb dist-electron/SkillManager-*.exe
unzip -t dist-electron/SkillManager-*-mac-*.zip
hdiutil verify dist-electron/SkillManager-*.dmg
ar -t dist-electron/SkillManager-*.deb
```

Windows and Linux launch smoke checks must run on clean target machines or matching CI runners.
