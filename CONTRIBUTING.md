# Contributing to Skill Manager

Skill Manager is a local-first inventory and health check for Agent Skills. Contributions should preserve three properties: evidence stays inspectable, filesystem changes stay reversible, and ordinary audits stay local.

## Good contribution areas

- Agent host path adapters with anonymized fixtures.
- Session evidence parsers with representative fixtures.
- Accessibility, internationalization, and documentation improvements.
- Reproducible bug fixes with focused tests.

Open a Discussion before proposing a new registry, network service, telemetry system, or broad product surface.

## Development

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
```

Run the CLI during development:

```bash
pnpm cli -- audit
pnpm cli -- audit --json
```

## Adapter requirements

Every new host or session adapter should include:

- The documented user and project skill paths.
- An anonymized fixture with secrets and personal paths removed.
- Tests for supported evidence and degraded coverage.
- A short note identifying the host version used for validation.

## Filesystem safety

- Keep `audit` and `inspect` read-only.
- Represent missing evidence as `no_evidence` or `unknown`.
- Require an explicit selection and confirmation for archive or restore.
- Write or update the recovery ledger before moving a skill folder.
- Refuse restore when the original path already exists.

## Pull requests

Keep each pull request focused. Include the user impact, validation commands, and any limits in evidence coverage. Security reports should follow [SECURITY.md](SECURITY.md).
