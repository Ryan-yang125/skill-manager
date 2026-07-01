# Skill Manager Electron Delivery Spec

Status: draft for review
Prototype: `design/prototypes/skill-manager-v0.5-mosaic.html`
Target delivery: cross-platform Electron app

## Three Stages

1. Prototype polish
   - Fix visual, accessibility, motion, theme, and responsive issues in the HTML prototype.
   - Keep the Mosaic visual direction as the source of truth.
   - Validate with `impeccable --json` and screenshots.

2. Delivery spec
   - Convert the approved prototype into a precise Electron implementation contract.
   - Define product scope, architecture, data model, UI states, behavior, and acceptance checks.

3. Electron app delivery
   - Replace the current SwiftUI app surface with a new Electron application.
   - Use the existing Swift scanning code as behavior reference where useful.
   - Ship a fully usable local app from this repository.

## Final Acceptance

The final deliverable is a working Electron Skill Manager app.

It must:

- Run as a desktop app on macOS from this repository.
- Keep the source architecture portable for Windows and Linux.
- Scan local global skill roots.
- Show installed skills, packages, content, locations, source metadata, usage, last used time, and evidence.
- Search and filter skills by name, package, source, status, usage, and context size.
- Support open, archive, restore, and cleanup report workflows from the main detail surface.
- Preserve a safe local archive ledger so every archived skill can be restored to its original path.
- Export cleanup reports as Markdown and JSON.
- Provide light and dark themes matching the approved Mosaic prototype.
- Pass automated UI checks, unit tests, and a manual smoke test before release.

## Current Prototype Baseline

HTML:

- `design/prototypes/skill-manager-v0.5-mosaic.html`

Screenshots:

- `design/prototypes/v0.5-mosaic-light.png`
- `design/prototypes/v0.5-mosaic-dark.png`
- `design/prototypes/v0.5-mosaic-compact-light.png`

Current checks:

- `impeccable --json design/prototypes/skill-manager-v0.5-mosaic.html` returns `[]`.
- The prototype uses real button semantics for sidebar items, skill rows, tabs, icon buttons, copy, reveal, switch, and theme toggle.
- Search input and buttons have visible focus states.
- The compact layout hides the inspector rail and expands the content area.

## Product Scope

Skill Manager is a local-first desktop app for managing agent skills like installed apps.

Primary jobs:

- Browse installed skills.
- Read each skill's content.
- Understand package/source ownership.
- See usage count, last used time, and local evidence.
- Find stale, unused, duplicate, high-context, or risky skills.
- Preserve local status fields for reporting and future cleanup policy.
- Archive and restore skills safely.
- Export cleanup reports.

Global roots:

- `~/.agents/skills`
- `~/.codex/skills`
- `~/.claude/skills`

Project-level skill directories are out of the v0.5 delivery scope.

## Technical Direction

Recommended stack:

- Electron
- TypeScript
- React
- Vite
- pnpm
- Vitest
- Playwright for smoke screenshots
- electron-builder for packaging

Runtime split:

- Main process: filesystem access, scanning, archive/restore, report export, settings, app menu.
- Preload: typed IPC bridge with a narrow API surface.
- Renderer: library UI, detail views, filters, reports, settings.
- Shared package: TypeScript types, pure helpers, token counting, path normalization.

Local storage:

- Use JSON files under Electron `app.getPath("userData")` for the first production version.
- Suggested files:
  - `skill-cache.json`
  - `settings.json`
  - `archive-ledger.json`
  - `cleanup-reports/`

Reasoning:

- JSON keeps packaging simple and avoids native database dependencies.
- The scanner can rebuild cache from local files.
- Archive and restore safety depends on a durable ledger, so `archive-ledger.json` must be written atomically.

## Data Model

### SkillRecord

Fields:

- `id`: stable normalized key
- `name`
- `description`
- `rootKind`: `agents | codex | claude`
- `skillPath`
- `skillFilePath`
- `relativePath`
- `content`
- `contextTokens`
- `packageId`
- `packageTitle`
- `packageSource`
- `packageSourceUrl`
- `locations`
- `usage`
- `status`
- `updatedAt`
- `scanWarnings`

### SkillPackage

Fields:

- `id`
- `title`
- `source`
- `sourceUrl`
- `pluginName`
- `installedAt`
- `updatedAt`
- `skillCount`
- `inferred`

Identity priority:

1. `sourceUrl`
2. `source`
3. `pluginName`
4. fallback family name

### UsageSummary

Fields:

- `count`
- `lastUsedAt`
- `evidence`
- `scannedLogCount`
- `coverage`

Evidence fields:

- `agent`: `codex | claude | agents | unknown`
- `sessionPath`
- `sessionKind`: `active | archived | unknown`
- `timestamp`
- `matchedText`
- `confidence`

Usage scanner requirement:

- Codex usage scanning must include active and archived local session logs when those logs exist on disk.
- Claude usage scanning must include the local session/history files available on the user's machine.
- Evidence must stay inspectable in the UI so a usage count can be traced back to a file and timestamp.

### SkillStatus

Fields:

- `protected`
- `reviewLater`
- `archived`
- `archiveReason`
- `archivedAt`
- `archivePath`

### ArchiveLedgerEntry

Fields:

- `id`
- `skillId`
- `originalPath`
- `archivePath`
- `createdAt`
- `restoredAt`
- `operationStatus`
- `failureReason`
- `contentHashBefore`
- `contentHashAfter`

## UI Layout Contract

The app uses a three-pane desktop layout.

### Sidebar

Sections:

- Library
  - Installed skills
  - Add skills
  - Packages
- Sources
  - Agents
  - Codex
  - Claude
- Review
  - Recently used
  - No evidence
  - High context
  - Archived

Footer:

- Last scan summary
- Theme toggle

### Skill List

Header:

- Title
- Rescan action
- Add skill action
- Search field

Rows:

- Icon
- Skill name
- One-line description
- Agent/source dots
- Usage count
- Last used label

Grouping:

- Package groups when package metadata exists.
- Name-based fallback grouping for skills without package metadata.

### Detail Panel

Header:

- Skill title
- Description
- Package/source chips
- Find action
- Enable switch

Stats:

- Usage
- Last used
- Context
- Size

Tabs:

- Content
- Usage
- Files
- History

Inspector rail:

- Installed locations
- Source
- Local evidence
- Reveal action

Responsive rule:

- Below `1200px` window width, hide the inspector rail and expand the content tab.
- Minimum useful app size: `1120x720`.
- At narrower sizes, keep sidebar and list visible, then prioritize content over the inspector.

## Theme Tokens

The prototype tokens are the source of truth.

Core rules:

- Use tinted neutrals with one amber accent.
- Use OKLCH for color tokens.
- Avoid pure black and pure white.
- Keep accent under 10 percent of the visible surface.
- Use amber for selected, active, and primary state only.
- Use green only for enabled or healthy state.
- Use the system font stack in the Electron implementation.

Required themes:

- Light: warm cream surface, ink text, light code block.
- Dark: near-black warm surface, cream text, dark code block.

## Component Requirements

Every interactive component needs these states:

- default
- hover
- focus-visible
- pressed
- selected
- disabled
- loading where async work applies

Components:

- `AppShell`
- `Sidebar`
- `SidebarItem`
- `SkillList`
- `SkillRow`
- `SearchField`
- `IconButton`
- `ThemeToggle`
- `SkillDetailHeader`
- `StatsBar`
- `Tabs`
- `ContentViewer`
- `InspectorRail`
- `Switch`
- `ArchiveConflictView`
- `EmptyState`
- `ScanProgress`
- `PermissionPrompt`

## Required States

### Ready

Shows scanned skills and selected skill detail.

### Loading

Shows scan progress:

- Current root
- Skills found
- Logs scanned
- Current phase

### Empty

Shown when no skills exist in configured roots.

Actions:

- Add skill
- Open roots settings
- Rescan

### Permission Needed

Shown when a root cannot be read.

Content:

- Root path
- Reason
- Action to open settings or reveal folder

### Scan Error

Shown when parsing or filesystem access fails.

Content:

- Affected root or log path
- Plain-language reason
- Retry action

### No Evidence

Shown when usage cannot be inferred.

Content:

- Explain that no local session evidence was found.
- Show which log sources were scanned.

### Archive Conflict

Shown before archive or restore when paths collide.

Content:

- Original path
- Target path
- Conflict reason
- Safe recovery action

### Archived

Shown for archived skills.

Actions:

- Restore
- Reveal archive location
- Export ledger entry

## Interaction Rules

Search:

- Search across name, description, package title, source, and path.
- Preserve active filter when the query changes.
- Empty query restores the current filtered group.

Rescan:

- Run scanner in the main process.
- Show progress in renderer.
- Preserve current selection when possible.
- Update cache atomically after scan completes.

Archive:

- Archive moves the skill folder into an app-managed archive directory.
- Write ledger before moving.
- Verify target path before moving.
- After move, verify original path removal and archive path existence.

Restore:

- Restore moves archived folder back to the original path.
- If the original path exists, show Archive Conflict.
- Restore updates ledger after successful move.

Reports:

- Markdown report for human review.
- JSON report for automation.
- Include package source, usage summary, evidence, local status, and archive actions.

## Keyboard Shortcuts

Required:

- `CmdOrCtrl+F`: focus search
- `CmdOrCtrl+R`: rescan
- `CmdOrCtrl+K`: command palette
- `CmdOrCtrl+,`: settings
- `ArrowUp` and `ArrowDown`: move through skill list
- `Enter`: open selected skill
- `CmdOrCtrl+1`: Content tab
- `CmdOrCtrl+2`: Usage tab
- `CmdOrCtrl+3`: Files tab
- `CmdOrCtrl+4`: History tab

Recommended:

- `A`: archive selected skill after confirmation focus is present
- `Esc`: close transient panels

## Accessibility Requirements

Required:

- Every icon-only button has `aria-label` and tooltip text.
- Keyboard focus is always visible.
- Skill rows are reachable by keyboard.
- Tabs use tab semantics.
- Toggle states expose `aria-pressed` or switch semantics.
- Color is never the only state signal.
- Text contrast meets WCAG AA.
- App supports at least 150 percent zoom without breaking the primary flow.

## Electron Security Requirements

Required:

- `contextIsolation: true`
- `nodeIntegration: false`
- Typed preload API
- No arbitrary filesystem paths exposed to renderer
- Validate all IPC payloads
- Allow only app-owned archive operations
- Confirm destructive file moves through main-process checks
- Avoid remote code execution surfaces

## Test Plan

Unit tests:

- Skill parser
- Lockfile parser
- Package identity normalization
- Usage evidence matcher
- Archived Codex session coverage
- Token counting
- Archive ledger writes
- Restore conflict detection
- Report export

Integration tests:

- Scan fixture roots
- Scan fixture session logs
- Archive fixture skill
- Restore fixture skill
- Export Markdown and JSON reports

Renderer tests:

- Search filters visible rows
- Sidebar filters update selection
- Tabs switch content
- Theme persists
- Empty state renders
- Permission state renders
- Archive conflict state renders

Smoke tests:

- Launch app
- Scan local roots
- Select skill
- Search skill
- Toggle theme
- Open Usage tab
- Export report
- Archive and restore a disposable fixture skill

## Build and Release Commands

Expected commands after Electron migration:

```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm build
pnpm package
```

Prototype check command:

```bash
impeccable --json design/prototypes/skill-manager-v0.5-mosaic.html
```

Screenshot check:

```bash
node scripts/capture-ui-screenshots.mjs
```

## Repository Migration Shape

Recommended final structure:

```text
.
├── apps/
│   └── desktop/
│       ├── electron/
│       ├── src/
│       └── package.json
├── packages/
│   ├── core/
│   ├── scanner/
│   ├── reports/
│   └── ui/
├── design/
│   └── prototypes/
├── docs/
└── package.json
```

Swift source can remain during migration as a reference folder or be moved to `legacy/swift-v0.4`.

The Electron implementation should own the product after migration.

## Development Gate

Start the Electron build after this checklist is true:

- Prototype approved by user.
- `impeccable --json` returns `[]`.
- Light, dark, and compact screenshots reviewed.
- This spec is approved.
- Final scope for package-level cleanup is confirmed.
- Final archive and restore safety rules are confirmed.

## Open Decisions Before Coding

1. Package-level actions
   - Should a later release add package-level status controls and archive/restore?

2. Add skills
   - Should v0.5 include install/search for new skills, or only import from folder plus local management?

3. Cross-platform packaging
   - Should this repo produce macOS only at first with portable source, or also CI-built Windows and Linux artifacts?

4. Session log coverage
   - Confirm every local Codex archived session location that must be scanned.
   - Confirm every local Claude history location that must be scanned.

5. Migration handling
   - Should old Swift release artifacts remain in `dist/`, or move to a legacy release note?
