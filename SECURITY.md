# Security Policy

## Supported Versions

The latest public release receives security fixes.

## Reporting A Vulnerability

Open a private security advisory on GitHub, or contact the maintainer through the repository owner profile.

Please include:

- affected version
- operating system
- reproduction steps
- expected impact
- any relevant local paths with sensitive parts redacted

## Security Model

Skill Manager is local-first. Inventory, usage analysis, archive, restore, and report export read and write local files only.

Electron hardening requirements:

- context isolation enabled
- Node integration disabled
- sandbox enabled for renderer windows
- typed preload API
- strict Content Security Policy
- HTTPS-only external links
- no arbitrary filesystem primitive exposed to the renderer

Archive and restore operations are recoverable through `archive-ledger.json`.
