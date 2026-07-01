# Architecture

Skill Manager is a pnpm workspace with an Electron desktop app and a TypeScript core package.

## Packages

- `apps/desktop`: Electron main process, preload bridge, React renderer, shadcn/Radix UI, Tailwind styling.
- `packages/core`: parser, scanner, package metadata, usage analyzer, archive ledger, report export, inventory service.

## Runtime Split

Main process:

- owns filesystem access
- owns archive and restore operations
- owns report export
- validates IPC payloads
- opens external HTTPS links

Preload:

- exposes a narrow `window.skillManager` API
- passes typed command payloads to main

Renderer:

- displays inventory
- manages filters, sorting, tabs, theme, and i18n
- requests actions through preload

## Data Flow

1. Renderer calls `loadInventory`.
2. Main process invokes `InventoryService`.
3. Core scans skill roots and local session logs.
4. Main returns typed inventory records.
5. Renderer displays list, detail, usage, files, and archived records.

Archive and restore use inventory IDs. The renderer never sends raw filesystem move instructions.

## Local Storage

Core stores JSON under Electron `userData`:

- archive ledger
- skill decisions
- cleanup reports

Writes that protect recovery state use atomic JSON helpers.
