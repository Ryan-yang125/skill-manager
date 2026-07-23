# Pricing — Skill Manager

Last updated: 2026-07-23

## Free forever

- Price: $0
- Billing: none
- Account: optional GitHub account for community participation only
- License: MIT
- Commercial use: included under the MIT License
- Source code: public

## Included

- Agent Skills audit CLI
- Installable `audit-agent-skills` Skill
- macOS, Windows, and Linux desktop downloads
- Shared, Codex, and Claude global skill-root scanning
- Local usage-evidence analysis
- Name-and-description catalog context estimates
- Package and path provenance
- Markdown and JSON reports
- Ledger-backed archive and restore
- Community updates through GitHub Releases

## Limits

- Global user skill roots are supported in the current release.
- Project-level skill folders sit outside the current release scope.
- Default evidence scan limits are 300 log files and 512 KB per log file; CLI flags can adjust both values.
- Usage evidence reflects the local logs available during the scan.

## Run

```bash
npx github:Ryan-yang125/skill-manager audit
```

## Install the Agent Skill

```bash
npx skills add Ryan-yang125/skill-manager --skill audit-agent-skills -g -y
```

## Download the desktop app

[Open the latest GitHub Release](https://github.com/Ryan-yang125/skill-manager/releases/latest)

## Support

Community support, bug reports, and feature requests live in the [public issue tracker](https://github.com/Ryan-yang125/skill-manager/issues).
