# agent-skills-audit

Audit Agent Skills installed for Codex, Claude Code, and the shared Agents directory. The CLI runs locally, needs no account, and emits stable JSON for other agents.

## Run

```bash
npx github:Ryan-yang125/skill-manager audit
npx github:Ryan-yang125/skill-manager audit --json
npx github:Ryan-yang125/skill-manager audit --markdown
npx github:Ryan-yang125/skill-manager inspect <skill-id> --json
```

Archive and restore are recoverable operations backed by a local ledger. Both commands produce a read-only preview until `--yes` is supplied.

```bash
npx github:Ryan-yang125/skill-manager archive <skill-id> --dry-run --json
npx github:Ryan-yang125/skill-manager archive <skill-id> --yes --json
npx github:Ryan-yang125/skill-manager restore <archive-id> --yes --json
```

`no_evidence` means the scanned local session logs contain no observed usage for that Skill. It remains a review signal and never becomes an archive recommendation on its own. `unknown` means relevant searchable logs were unavailable or coverage exclusions prevent a reliable absence claim.

Use `--home <path>` and `--data-dir <path>` for isolated fixtures or alternate installations. Run `agent-skills-audit help` for every option.
