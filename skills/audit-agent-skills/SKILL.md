---
name: audit-agent-skills
description: Audit, organize, archive, and restore local Agent Skills with skill-manager. Use when users ask to inspect installed skills, find duplicates or stale skills, understand usage evidence and scan coverage, clean up skill directories, archive candidates safely, or restore archived skills.
---

# Audit Agent Skills

Use `skill-manager` as the source of truth. Keep discovery read-only and make every write reversible.

## Run the audit

1. Run the local CLI first:

   ```bash
   skill-manager audit --json
   ```

2. When the executable is unavailable, use the repository package:

   ```bash
   npx --yes github:Ryan-yang125/skill-manager audit --json
   ```

3. Preserve the successful invocation prefix for later commands. Surface command failures and audit warnings instead of inferring missing results.

## Interpret the result

Read only fields present in the JSON and report:

- Coverage first: scanned roots, supported agents and evidence sources, observation window, unreachable locations, and parser warnings.
- Evidence second: observed usage, last-seen data, source or installation provenance, duplicates, conflicts, and archive state.
- Confidence for each recommendation, tied to the reported coverage.

Preserve the JSON usage state exactly. `no_evidence` means relevant local logs were scanned without a match; `unknown` means relevant searchable coverage was unavailable. Keep both states in review until coverage, recency, provenance, duplicate content, and the skill's purpose support a stronger conclusion.

Group findings into:

- Keep: clear use, unique capability, or current project relevance.
- Review: weak evidence, partial coverage, duplicate candidates, or uncertain ownership.
- Archive candidate: strong redundant or stale evidence with a recoverable path.

## Prepare a write action

Before any archive or restore:

1. Inspect the applicable command with `<invocation> archive --help` or `<invocation> restore --help`.
2. Present the exact skill names, paths, reasons, proposed command, and recovery path.
3. Request explicit confirmation for that exact target set and action.
4. Treat a changed target set or command as a new confirmation checkpoint.

A request to inspect, audit, organize, or recommend grants read-only authority. Keep filesystem contents unchanged until the user confirms an archive or restore.

## Execute and verify

After explicit confirmation:

1. Run only the confirmed `skill-manager` archive or restore command, adding `--yes` to the exact confirmed command. Prefer its reversible workflow and avoid direct deletion or manual moves.
2. Capture the command result and archive identifier or restored path.
3. Rerun the full audit with `--json` using the same invocation.
4. Compare coverage and affected records before and after the write.
5. Report the verified state, remaining warnings, and exact recovery command when applicable.

If the installed CLI lacks the requested write command, stop after the read-only audit and explain the missing capability.
