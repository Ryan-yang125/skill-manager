# Privacy

Skill Manager is designed for local agent skill management.

## Local Files Read

The app scans these global roots:

- `~/.agents/skills`
- `~/.codex/skills`
- `~/.claude/skills`

The app scans local session logs when they exist:

- `~/.codex/sessions`
- `~/.codex/archived_sessions`
- `~/.claude/projects`

## Local Files Written

The app writes to Electron `userData`:

- `archive-ledger.json`
- `skill-decisions.json`
- `cleanup-reports/`
- app settings

## Network

Inventory scan, usage analysis, archive, restore, and report export run locally.

Network access is used only for user-triggered external package links and release update checks.

## Telemetry

The first public release sends no telemetry.
