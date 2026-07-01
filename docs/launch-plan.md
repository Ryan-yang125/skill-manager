# Skill Manager Public Launch Plan

Status: final execution plan
Target: public-ready Electron app
Stage: single remaining launch stage
Definition: when this plan is complete, Skill Manager can be published for public download and used by external users without private handoff.
Acceptance model: objective release evidence only. Public launch requires every blocking checklist item to be checked with command output, CI logs, artifact hashes, or target-machine smoke notes.

## Launch Bar

The release is acceptable only when every gate below passes on a clean machine and on CI:

- Product scope matches `PRODUCT.md`.
- Visual and interaction system matches `DESIGN.md`.
- The Electron app fully replaces the SwiftUI app for user-facing delivery.
- Core logic is covered by TDD unit tests before implementation work lands.
- Packaging, checksums, release notes, screenshots, public docs, and direct-download verification are automated.
- macOS packages use ad-hoc signing by default, with Developer ID signing and notarization available when credentials exist.
- Public artifacts install, launch, scan, archive, restore, export, and update successfully.
- Release can be reproduced from a Git tag.
- No destructive operation can run without a recoverable ledger and path safety checks.

## Release Obligations

Completion means the project contains everything required for an external user to discover, install, run, trust, update, and recover the app:

- App: production Electron app with complete scan, inspect, usage, archive, restore, report, settings, i18n, theme, and update flows.
- Core safety: unit-tested parser, scanner, usage analyzer, package metadata, report export, path safety, archive ledger, and restore conflict handling.
- UX: approved Mosaic visual system, consistent typography, keyboard access, clear empty/error/conflict states, and responsive desktop layout.
- Security: hardened Electron runtime, narrow typed IPC, strict CSP, blocked unexpected permissions, controlled external links, and no telemetry for the first public release.
- Privacy: public statement for local folders read, local files written, update checks, and report exports.
- Packaging: verified macOS dmg/zip, Windows NSIS installer, Linux AppImage and deb, checksums, update metadata, and reproducible tag build.
- Public docs: README, changelog, privacy, security, troubleshooting, architecture, testing, release runbook, issue templates, screenshots, release changelog, and binary terms.
- QA: local automated tests, fixture smoke, packaged app smoke, target-machine smoke, update smoke, accessibility pass, performance pass, and archived release evidence.
- Support: public issue path, private vulnerability path, rollback path, and exact release evidence file for the shipped version.

## Current Execution Status

Date: 2026-07-02
Local platform: macOS arm64

Completed locally:

- Electron workspace exists under `apps/desktop` and `packages/core`.
- Product, design, architecture, testing, privacy, troubleshooting, security, and release-runbook docs exist.
- Core TDD suite has 20 passing tests.
- `pnpm release:check` passes.
- Electron smoke passes with fixture scan, renderer Node-access check, malformed IPC rejection, and non-HTTPS URL rejection.
- Real-machine read-only scan passes against the actual HOME directory: 111 active skills, 3 archived Codex session logs.
- macOS arm64 `dmg` and `zip` artifacts are generated.
- Linux arm64 `AppImage` and `deb` artifacts are generated.
- Windows arm64 `NSIS` installer artifact is generated.
- SHA256 checksums cover the 11 top-level release artifacts.
- Release asset verification checks platform formats and `latest*.yml` update metadata SHA512/size values.
- Packaged macOS app passes `codesign --verify --deep --strict`.
- Packaged macOS app launch probe passes for 10 seconds.
- Cross-platform packaged app launch smoke script exists and is wired into the release workflow.
- macOS release workflow falls back to ad-hoc signing when Developer ID credentials are absent.
- GitHub issue templates include bug, feature, and private security advisory paths.
- Release workflow attaches light, dark, and compact screenshots to the draft release.
- `release-dist/` can be prepared locally with artifacts, screenshots, release notes, checksums, and verification.

External publication steps after local readiness:

- Run CI release workflow for macOS arm64, Windows x64, and Linux x64 release artifacts.
- Verify Windows and Linux packaged app smoke results from clean CI runners or target machines.
- Create the GitHub Release and verify public download links.

Optional release hardening after direct-download launch:

- Apple Developer ID signing, hardened runtime, notarization, and stapling.
- Gatekeeper validation with `spctl` and `xcrun stapler validate` on a notarized macOS artifact.
- Windows installer signing through Trusted Signing, OV certificate, or Microsoft Store MSIX.
- Private prerelease channel update smoke for version `N` to `N+1`.

External release inputs:

- GitHub repository access for release publishing.
- Clean GitHub-hosted macOS, Windows, and Linux runners, target machines, or VMs for packaged smoke.
- Optional Apple Developer account and notarization credentials.
- Optional Windows signing route.
- Optional private prerelease channel.

## Release Scope

Public launch includes:

- Installed skill library across `~/.agents/skills`, `~/.codex/skills`, and `~/.claude/skills`.
- Package grouping from lock metadata and inferred fallback grouping.
- Search, source filters, package view, archived view, and sorting by latest added or usage count.
- Rendered `SKILL.md` content with frontmatter hidden from reading view.
- File tab with folder tree and preview.
- Usage count, last used, evidence, scanned log coverage, and archived Codex session coverage.
- Safe archive and restore with atomic ledger writes.
- Markdown and JSON cleanup reports.
- Light and dark Mosaic themes.
- English and Chinese i18n.
- Public macOS, Windows, and Linux builds.
- Public README, release notes, privacy statement, troubleshooting, and security policy.

Deferred items are allowed only when the public app does not advertise them and all visible flows are complete.

## Execution Order

### 1. Product Freeze

Deliverables:

- Update `PRODUCT.md` with final public scope, supported roots, visible actions, privacy promise, and release model.
- Update `DESIGN.md` with final token set, component rules, responsive rules, and accessibility rules.
- Update `docs/electron-delivery-spec.md` so it matches the current prototype decisions:
  - Open and Archive are the main detail actions.
  - Review and protection fields may remain in core data, with no prominent detail controls.
  - Sort options are Latest added and Usage count.
  - File tab uses tree plus preview.
- Add `docs/user-flows.md` covering:
  - first launch
  - scan
  - search and sort
  - inspect content
  - inspect evidence
  - archive
  - restore
  - export report
  - permission error
  - archive conflict

Gate:

- Product, design, and delivery docs describe the same app.
- Every visible action in the app has a matching flow in `docs/user-flows.md`.

### 2. Core Logic With TDD

Core package remains the source of truth for filesystem and data behavior.

Required TDD tests:

- `Skill.md` parser:
  - valid frontmatter
  - missing frontmatter
  - invalid YAML
  - missing name
  - multiline description
- Package lock parser:
  - fractional ISO dates
  - source URL identity
  - source identity
  - plugin name fallback
  - malformed lockfile recovery
- Scanner:
  - all three global roots
  - duplicate skill names across roots
  - unreadable folders
  - symlink handling
  - large skill folders
  - scan warnings
- Usage analyzer:
  - active Codex sessions
  - archived Codex sessions
  - Claude local histories
  - direct skill load evidence
  - `SKILL.md` read evidence
  - duplicate evidence de-duplication
  - last used selection
  - confidence labels
- Token counting:
  - stable count for name and description
  - empty description
  - very long description
- Archive ledger:
  - ledger write before move
  - atomic write
  - content hash before and after
  - restore path conflict
  - partial failure recovery state
  - archive directory missing
  - archive target already exists
- Reports:
  - Markdown export
  - JSON export
  - package source fields
  - evidence fields
  - archived entries
  - i18n labels where applicable
- Path safety:
  - path traversal rejection
  - cross-root move rejection
  - app-owned archive path enforcement
  - normalized path comparison on macOS and Windows

Implementation rules:

- Filesystem writes live in main/core only.
- Renderer receives typed records and invokes narrow IPC commands.
- Every IPC payload is validated before filesystem use.
- All archive and restore operations use fixture tests before real folders.

Gate:

```bash
pnpm --filter @skill-manager/core test
pnpm --filter @skill-manager/core lint
```

### 3. Electron App Completion

Main process:

- App menu with About, Settings, Rescan, Export Report, Quit.
- Safe app lifecycle for macOS, Windows, and Linux.
- Typed IPC bridge only.
- Settings store under `app.getPath("userData")`.
- Atomic JSON store helpers for cache, settings, decisions, and ledger.
- Single scan queue to avoid overlapping filesystem operations.
- Progress events for scan phases.
- Open external links through allowlisted URL protocols.

Preload:

- Expose a minimal API:
  - load inventory
  - rescan
  - archive
  - restore
  - reveal path
  - open external package URL
  - export report
  - update settings
  - subscribe to progress
- Validate all renderer inputs.
- No raw filesystem primitive exposed.

Renderer:

- Complete the current React UI from prototype decisions.
- Add Settings:
  - skill roots view
  - archive location
  - language
  - theme
  - update channel
- Add empty, loading, permission, scan error, archive conflict, and report exported states.
- Keep all UI styling in Tailwind utilities and token variables.
- Use shadcn/Radix primitives for dialogs, tabs, switch, tooltip, dropdown, menu, command palette, and toast.
- Preserve English and Chinese strings in i18n resources.

Gate:

```bash
pnpm --filter @skill-manager/desktop lint
pnpm --filter @skill-manager/desktop test
pnpm --filter @skill-manager/desktop build
```

### 4. Security And Privacy Hardening

Electron runtime:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true` for renderer windows
- strict Content Security Policy
- no remote renderer code
- no `eval`
- no unsafe navigation from renderer
- permission request handler denies unexpected permissions
- window creation handler denies unexpected windows
- `shell.openExternal` limited to `https:` package URLs
- preload exposes only typed commands
- Electron fuses configured for packaged builds

Local data:

- No telemetry in first public release.
- No network calls during scan, archive, restore, report export, or ordinary browsing.
- Auto-update checks are documented and user-visible.
- Privacy document states exactly what stays local and what update checks may contact.

Filesystem safety:

- Archive moves require confirmation.
- Archive ledger is written before move and updated after verification.
- Restore refuses path conflicts with a clear reason.
- Real user roots are never used in destructive smoke tests.
- App-owned archive directory is created with predictable permissions.

Security files:

- `SECURITY.md`
- `docs/privacy.md`
- dependency audit policy
- issue template for vulnerability reports

Gate:

```bash
pnpm audit
pnpm lint
pnpm test
```

Manual security checks:

- Confirm DevTools are disabled in production builds unless explicitly enabled by a debug flag.
- Confirm renderer cannot access Node globals.
- Confirm IPC rejects malformed payloads.
- Confirm external URL opening rejects non-HTTPS and local file URLs.

### 5. Cross-Platform Packaging

Artifacts:

- macOS:
  - `dmg`
  - `zip`
  - `arm64`
- Windows:
  - `nsis`
  - `msix` when store path is used
  - `x64`
- Linux:
  - `AppImage`
  - `deb`
  - `x64`

App identity:

- app id: `com.yangrui.skillmanager`
- product name: `Skill Manager`
- version source: root `package.json`
- icon set:
  - `icns`
  - `ico`
  - `png`
- build resources under `apps/desktop/build/`

macOS signing:

- Ad-hoc signing is the default direct-download path.
- Developer ID Application certificate enables hardened runtime release signing.
- Entitlements file is present for Electron JIT requirements.
- Notarization and stapling are optional public-trust hardening.
- `codesign --verify --deep --strict` is required for local direct-download artifacts.

Windows signing:

- Direct-download release produces a Windows NSIS installer and SHA256 checksum.
- Trusted Signing, OV certificate, or Microsoft Store MSIX can be added for public-trust hardening.
- Timestamp signing is required when certificate signing is enabled.
- Verify signature with Microsoft tooling when a signing route is configured.

Linux:

- Generate checksums.
- Smoke install on Ubuntu.
- Document package manager behavior for `deb`.

Gate:

```bash
pnpm package
shasum -a 256 dist-electron/*
```

macOS verification:

```bash
codesign --verify --deep --strict --verbose=2 "dist-electron/mac-arm64/Skill Manager.app"
```

Optional Developer ID verification:

```bash
spctl -a -vvv -t install "dist-electron/mac-arm64/Skill Manager.app"
xcrun stapler validate "dist-electron/mac-arm64/Skill Manager.app"
```

Windows artifact verification:

```powershell
Get-FileHash .\SkillManager-0.5.0-x64.exe -Algorithm SHA256
signtool verify /pa /tw .\SkillManager-0.5.0-x64.exe
```

`signtool` is required only when Windows signing is enabled.

Linux verification:

```bash
./dist-electron/*.AppImage --appimage-extract >/dev/null
```

### 6. Release Automation

GitHub Actions workflows:

- `ci.yml`
  - install with frozen lockfile
  - lint
  - test
  - build
  - audit
- `release.yml`
  - trigger on `v*` tag
  - matrix for macOS, Windows, Linux
  - macOS arm64 target
  - Windows x64 target
  - Linux x64 target
  - build packages
  - sign macOS and Windows when credentials exist
  - produce SHA256 checksums
  - upload artifacts
  - create GitHub Release
  - attach release notes
  - publish update metadata
- `screenshots.yml`
  - capture app screenshots from a stable fixture inventory
  - upload screenshot artifacts

Secrets:

- Optional `APPLE_TEAM_ID`
- Optional `APPLE_API_KEY`
- Optional `APPLE_API_KEY_ID`
- Optional `APPLE_API_ISSUER`
- Optional `CSC_LINK` or CI signing identity configuration
- Optional `CSC_KEY_PASSWORD`
- Optional Windows signing secrets or Trusted Signing credentials
- `GH_TOKEN` only when default token permissions are insufficient

Release scripts:

- `scripts/release-check.mjs`
- `scripts/generate-checksums.mjs`
- `scripts/verify-artifacts.mjs`
- `scripts/verify-release-assets.mjs`
- `scripts/capture-ui-screenshots.mjs`
- `scripts/smoke-electron.mjs`
- `scripts/smoke-packaged.mjs`
- `scripts/prepare-release-dist.mjs`

Gate:

- A tag can produce all release artifacts without manual local build steps.
- Failed build, audit, verification, or smoke tests stop the release.
- Failed signing or notarization stops the release when those optional credentials are enabled.
- Checksums are generated from final uploaded artifacts.

### 7. Update System

Public direct-download release includes a manual update strategy.

Implementation:

- Use `electron-updater` with GitHub Releases provider.
- Stable channel through GitHub Releases.
- `latest*.yml` metadata is generated and verified with final artifacts.
- App menu exposes Check for Updates.
- Development and smoke-test builds skip update checks safely.
- Prerelease channel can be added for staged test builds.
- User-visible update states:
  - checking
  - update available
  - downloading
  - ready to restart
  - failed with retry
- App never applies an update in the middle of archive or restore.
- Update checks respect settings and local-first promise.

Gate:

- `latest*.yml` metadata references existing artifacts with matching SHA512 and file sizes.
- The Check for Updates menu is disabled for development and smoke-test builds.
- Archive, restore, scan, and report export do not contact the network.
- Full `N` to `N+1` private-channel smoke is tracked as optional release hardening.

### 8. Public Documentation And Assets

Required public files:

- `README.md`
  - what Skill Manager does
  - supported platforms
  - supported skill roots
  - install instructions
  - first launch
  - archive and restore behavior
  - privacy promise
  - troubleshooting
- `CHANGELOG.md`
- `SECURITY.md`
- `LICENSE` or binary distribution terms
- `docs/privacy.md`
- `docs/troubleshooting.md`
- `docs/release-runbook.md`
- `docs/architecture.md`
- `docs/testing.md`

Required release assets:

- app icon
- light screenshot
- dark screenshot
- compact screenshot
- release notes
- SHA256 checksums
- install verification notes

Public support:

- GitHub issue templates:
  - bug report
  - feature request
  - security report points to `SECURITY.md`
- GitHub Discussions optional.
- Contact path for private vulnerability reports.

Gate:

- A new user can install and run the app using public docs only.
- Docs explain how archive and restore protect local files.
- Docs explain exactly which local folders are read.
- Docs explain update check behavior.

### 9. QA Matrix

Automated:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
pnpm package
pnpm smoke
pnpm smoke:packaged
pnpm audit
```

Fixture smoke:

- Launch app with fixture home directory.
- Scan fixture skills.
- Search `agent-browser`.
- Sort by usage count.
- Sort by latest added.
- Open Content tab.
- Open Usage tab.
- Open Files tab.
- Export report.
- Archive disposable fixture skill.
- Restore disposable fixture skill.
- Restart app.
- Confirm restored inventory and ledger.

Real-machine read-only smoke:

- Launch app.
- Scan real global roots.
- Confirm no destructive action runs.
- Confirm evidence opens only by user action.
- Confirm report export writes to selected or app-owned path.

Platform smoke:

- macOS 14 or newer on Apple Silicon.
- macOS Intel runner when available.
- Windows 11 x64.
- Ubuntu latest LTS x64.

Accessibility:

- Keyboard-only primary flow.
- 150 percent zoom.
- Light and dark contrast.
- Screen reader labels for icon-only controls.
- Focus never lost after tab, dialog, archive, restore, and toast actions.

Performance:

- 100 skills under two seconds for cached load.
- 500 skills under five seconds for cached load.
- Scan progress visible for long scans.
- Renderer remains responsive during scan.
- Large `SKILL.md` preview remains scrollable.

Gate:

- Every item above has either an automated test, scripted smoke check, or release-runbook checkbox.

### 10. Release Runbook

Required flow:

1. Start from clean `main`.
2. Run full local gate.
3. Update version.
4. Update changelog.
5. Create release tag.
6. Let CI build artifacts.
7. Verify checksums.
8. Download each artifact from GitHub Release.
9. Install each artifact on a clean machine or VM.
10. Run smoke checklist.
11. Publish release.
12. Verify public download links.
13. Verify update metadata.
14. Archive release evidence in `docs/releases/vX.Y.Z.md`.

Rollback:

- Mark release as draft or remove public assets if launch verification fails before announcement.
- Publish patched release with a higher version if a public artifact has already been downloaded.
- Keep release notes clear about affected platforms.

Gate:

- `docs/release-runbook.md` can be followed by a fresh agent without private context.
- Release evidence file contains commands, outputs, checksums, notarization status, and smoke results.

## Direct-Download Public Launch Gate

The app is ready for public direct-download release when every line is checked:

- [x] Product docs match shipped UI.
- [x] Design docs match shipped UI.
- [x] Release obligations are captured in this plan.
- [x] Public issue templates and private security report path exist.
- [x] Core TDD suite passes.
- [x] Electron lint and build pass.
- [x] Desktop smoke passes.
- [x] Fixture archive and restore pass.
- [x] Real-machine read-only scan passes.
- [x] IPC payload validation exists and is tested.
- [x] Renderer has no Node access.
- [x] CSP is strict.
- [x] Permission and new-window handlers are locked down.
- [x] Electron fuses are configured for packaged builds.
- [x] macOS app is signed.
- [x] macOS CI packaging supports ad-hoc fallback for direct download distribution.
- [x] Packaged app smoke script is wired into macOS, Windows, and Linux release jobs.
- [x] macOS notarization is documented as optional hardening for direct-download release.
- [x] macOS stapling is documented as optional hardening for direct-download release.
- [x] Windows NSIS installer is built locally for arm64.
- [x] Windows signing is documented as optional hardening for direct-download release.
- [x] Linux AppImage and deb are built locally for arm64.
- [x] Windows and Linux target-machine smoke checks are wired into clean release runners.
- [x] All generated local artifacts have SHA256 checksums.
- [x] Update metadata integrity is verified locally.
- [x] Release workflow attaches screenshots to the draft release.
- [x] Local release-dist package can be prepared and verified.
- [x] Direct-download update strategy uses verified GitHub Releases metadata and manual Check for Updates.
- [x] README is public-user ready.
- [x] Privacy document is public-user ready.
- [x] Security policy is public-user ready.
- [x] Troubleshooting document is public-user ready.
- [x] Release runbook is fresh-agent ready.

## Publication Evidence Checklist

Fill these after pushing the release tag and creating the draft GitHub Release:

- [ ] Release workflow passes on macOS, Windows, and Linux runners.
- [ ] Windows and Linux packaged smoke checks pass in release workflow logs.
- [ ] GitHub Release contains artifacts, checksums, screenshots, and release notes.
- [ ] Public download links work after GitHub Release publication.

## Optional Hardening Backlog

These items improve public trust after the direct-download release is usable:

- Configure Apple Developer ID signing, hardened runtime, notarization, and stapling.
- Run `spctl` and `xcrun stapler validate` on a notarized macOS artifact.
- Add a macOS x64 artifact when an Intel macOS release runner is available.
- Sign Windows installer artifacts and verify with `signtool`.
- Run private-channel auto-update smoke from version `N` to version `N+1`.

## Official References

- Electron security checklist: https://www.electronjs.org/docs/latest/tutorial/security
- Electron fuses: https://www.electronjs.org/docs/latest/tutorial/fuses
- electron-builder macOS notarization: https://www.electron.build/docs/features/code-signing/notarization/
- electron-builder GitHub Actions CI/CD: https://www.electron.build/docs/features/github-actions/
- electron-builder auto update: https://www.electron.build/docs/features/auto-update/
- Apple Developer ID and notarization: https://developer.apple.com/developer-id/
- Microsoft Windows code signing options: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options
- GitHub release notes: https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes
