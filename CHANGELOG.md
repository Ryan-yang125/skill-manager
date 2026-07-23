# Changelog

## 0.6.0

- Added a read-first command-line interface for inventory, evidence-backed audits, inspection, dry-run archive planning, archive, and restore.
- Added stable JSON and Markdown audit reports for agents and automation, including explicit evidence coverage and conservative review states.
- Added the installable `audit-agent-skills` Agent Skill with confirmation gates around every filesystem change.
- Added a public documentation site with guides, machine-readable discovery files, and GitHub Pages delivery.
- Added contribution guidance for host adapters, evidence fixtures, and filesystem safety.

## 0.5.0

- Migrated the product surface to an Electron, React, TypeScript, Tailwind, and shadcn/Radix desktop app.
- Added a three-pane installed skill manager UI with sidebar filters, list sorting, Markdown content rendering, file tree preview, and Mosaic light/dark themes.
- Added local package metadata grouping, usage evidence, archived Codex session coverage, cleanup reports, archive ledger, and restore flow in the TypeScript core package.
- Added public launch documentation, release scripts, checksum generation, smoke testing, and GitHub Actions CI/release workflows.
- Hardened Electron IPC so archive and restore use inventory IDs, with filesystem operations owned by the main process.
