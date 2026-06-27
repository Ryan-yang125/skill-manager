# Skill Manager

Skill Manager is a local-first macOS app for auditing and cleaning global agent
skills.

It scans global skill folders, estimates the context cost of each skill from its
`name` and `description`, checks local session logs for usage evidence, and lets
you archive or restore unused skills.

## Supported Global Skill Roots

- `~/.agents/skills`
- `~/.codex/skills`
- `~/.claude/skills`

Project-level skills are intentionally out of scope for the first release.

## Features

- Native macOS sidebar layout.
- Local-only scan, with no network dependency for inventory.
- Usage evidence from Claude `Skill` tool calls and Codex tool calls that read
  `SKILL.md`.
- Sort by recent use, usage count, context tokens, or name.
- Filter by all, unused, suggested archive, archived, agent, and collection.
- Archive and restore skills through a recoverable local archive.
- Finder reveal for active and archived skills.
- Menu bar status panel.

## Install From GitHub Release

1. Download `SkillManager-v0.1.1-macos.zip` from the latest release.
2. Unzip it.
3. Open `SkillManager.app`.

Current release builds are ad-hoc signed. Apple Developer ID signing and
notarization are planned for a later distribution channel.

## Build Locally

```bash
swift test
scripts/build_app.sh
open build/SkillManager.app
```

The app bundle is created at:

```text
build/SkillManager.app
```

## Development

```bash
swift run SkillManagerScan
script/build_and_run.sh --verify
```

The Codex desktop Run action is wired through:

```text
.codex/environments/environment.toml
```

## License

MIT
