# Skill Manager Product Context

register: product

## Product Purpose

Skill Manager is a local-first desktop app for browsing, understanding, and managing agent skills installed on this machine. It should feel like a focused developer utility: fast to scan, calm to read, and safe to operate.

The app starts from a familiar skill manager model. Users can see installed skills, inspect each skill's content, understand where it came from, and open or archive it. Usage analysis is an added management layer that helps users spot unused, stale, high-context, or risky skills.

## Users

- Agent power users who install many skills across Codex, Claude, and local agent folders.
- Developers who want to inspect `SKILL.md` content without opening a terminal.
- Builders who need to reduce local agent context clutter with traceable evidence.
- Users who care about reversible file operations and clear local provenance.

## Core Jobs

- Browse installed global skills.
- Search and sort skills quickly.
- Read rendered `SKILL.md` content.
- Inspect package/source metadata and local install paths.
- See usage count, last used time, and evidence from local session logs.
- Archive a skill safely.
- Restore an archived skill to its original path.
- Export cleanup reports when needed.

## Supported Roots

- `~/.agents/skills`
- `~/.codex/skills`
- `~/.claude/skills`

Project-level skill directories are outside the current product scope.

## Product Principles

- Local first. The app should not need network access for inventory, usage evidence, archive, restore, or report export.
- Inspectable. Every usage count should have evidence that can be traced to a local file.
- Reversible. Archive operations should preserve original paths and make restore behavior obvious.
- Familiar. Use standard desktop patterns: sidebar, list, detail pane, tabs, file tree, search, sorting, and clear actions.
- Quiet. The UI should help the user make management decisions without decorative noise.
- Direct. The primary actions on a skill detail page are open and archive. Review and protection concepts can exist in the data model, but they should not dominate the main detail surface.

## Interaction Model

- Three pane layout: navigation, skill list, detail.
- Skill list supports search and sorting.
- Default sort is latest added first.
- Secondary sort is usage count.
- Detail content renders Markdown, not raw source text.
- File tab behaves like a compact IDE: left file tree, right preview.
- Archive uses confirmation and writes a recoverable ledger.
- Open reveals or opens the local skill path.

## Tone

Short, concrete, tool-like. Avoid marketing copy, tutorials, and explanations inside the app chrome. Labels should name the object or action directly.

Preferred labels:

- Open
- Archive
- Restore
- Search
- Latest added
- Usage count

Avoid labels that create unnecessary workflow weight:

- Protect
- Review later
- Cleanup strategy
- Recommendations as prominent calls to action

## Anti References

- A cleanup-only app that makes skills feel like trash to remove.
- A dashboard full of metrics before the user can inspect content.
- Decorative panels, nested cards, heavy color, and playful empty states.
- Mixed font systems where Chinese, English, labels, and buttons look unrelated.
- Fake macOS traffic lights inside the app content.

## Hard Language Rule

Use direct, positive phrasing in user-facing text and documentation. Avoid sentence structures that deny one option first and then affirm another, in both Chinese and English copy.
