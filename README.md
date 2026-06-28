# Skill Manager

Skill Manager is a local-first macOS app for auditing, understanding, and
cleaning global agent skills.

It scans global skill folders, estimates the context cost of each skill from its
`name` and `description`, checks local session logs for usage evidence, and lets
you archive or restore unused skills.

![Skill Manager main window](docs/screenshots/main-window.png)

## Why

Agent skills are easy to install and easy to forget. Over time they add context,
make agent behavior harder to predict, and become hard to review by hand. Skill
Manager gives them the same kind of local inventory view you expect from a Mac
utility: what is installed, what it does, how much context it adds, when it was
last used, and which skills are good cleanup candidates.

## Supported Global Skill Roots

- `~/.agents/skills`
- `~/.codex/skills`
- `~/.claude/skills`

Project-level skills are out of scope for the first release.

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
- GitHub Release update check.

## How To Use

1. Open the app and click **Rescan** to read the global skill folders and local
   session history.
2. Review the sidebar counts for unused skills, archive suggestions, agents, and
   skill collections.
3. Sort the list by recent use, usage count, context tokens, or name.
4. Search by skill name or description when you want to inspect a specific tool.
5. Use **Finder** to open the skill folder, or **Archive** to move a stale skill
   into the recoverable local archive.
6. Open **Archived** when you need to restore a skill.
7. Use **Check for Updates** to open the latest GitHub Release when a newer
   build is available.

## What The App Counts

- **Installed**: skills found under the supported global roots.
- **Context tokens**: an estimate from the skill `name` and `description`, which
  are the fields most likely to be injected into agent context.
- **Last used / usage count**: evidence from local session logs, including Claude
  `Skill` tool calls and Codex tool calls that read `SKILL.md`.
- **Suggested archive**: skills with no recent usage evidence.
- **Collections**: grouped skill families inferred from skill names and install
  structure.

Everything runs locally. The app does not need network access to scan your
skills or session history.

## Install From GitHub Release

1. Download `SkillManager-v0.1.2-macos.zip` from the
   [latest release](https://github.com/Ryan-yang125/skill-manager/releases/latest).
2. Unzip it.
3. Open `SkillManager.app`.

Current release builds are ad-hoc signed. Apple Developer ID signing and
notarization are planned for a later distribution channel. If macOS blocks the
first launch, right-click the app and choose **Open**.

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
swift run SkillManagerScan --json
script/build_and_run.sh --verify
```

Regenerate the app icon:

```bash
swift scripts/generate_app_icon.swift
```

The Codex desktop Run action is wired through:

```text
.codex/environments/environment.toml
```

## License

MIT
