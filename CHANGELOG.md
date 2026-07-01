# Changelog

## 0.5.0

- Migrated the product surface to an Electron, React, TypeScript, Tailwind, and shadcn/Radix desktop app.
- Added a three-pane installed skill manager UI with sidebar filters, list sorting, Markdown content rendering, file tree preview, and Mosaic light/dark themes.
- Added local package metadata grouping, usage evidence, archived Codex session coverage, cleanup reports, archive ledger, and restore flow in the TypeScript core package.
- Added public launch documentation, release scripts, checksum generation, smoke testing, and GitHub Actions CI/release workflows.
- Hardened Electron IPC so archive and restore use inventory IDs, with filesystem operations owned by the main process.
