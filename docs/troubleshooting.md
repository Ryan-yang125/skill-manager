# Troubleshooting

## No Skills Found

Check that at least one supported root exists:

```bash
ls ~/.agents/skills ~/.codex/skills ~/.claude/skills
```

Install or copy skills into one of those roots, then rescan.

## Usage Count Looks Low

Skill Manager counts local evidence from Codex and Claude session files. Counts depend on logs still being present on disk.

Check these folders:

```bash
ls ~/.codex/sessions ~/.codex/archived_sessions ~/.claude/projects
```

## Archive Fails

Archive can fail when:

- the original skill folder is missing
- the app archive destination already exists
- the app cannot write to the user data directory

The app keeps the failure reason in the archive ledger.

## Restore Fails

Restore refuses to overwrite an existing original path. Move or inspect the existing folder, then try restore again.

## macOS Blocks Launch

Direct-download macOS builds use ad-hoc signing when Developer ID credentials are absent. If Gatekeeper blocks first launch, right-click the app and choose Open.

Developer ID builds should pass Gatekeeper verification when signing and notarization credentials are configured for the release.

## Windows SmartScreen Prompt

Verify `SHA256SUMS.txt` from the GitHub Release before launching the installer.

Code-signed Windows builds can be added when a Trusted Signing, OV certificate, or Microsoft Store path is configured.

## Linux AppImage Launch

Make the AppImage executable:

```bash
chmod +x SkillManager-0.5.0-x64.AppImage
./SkillManager-0.5.0-x64.AppImage
```

For deb installs:

```bash
sudo apt install ./SkillManager-0.5.0-x64.deb
```

## Reset Local App State

Quit the app, then remove Skill Manager files from the Electron `userData` directory for your platform.

Archive folders contain moved skills. Inspect them before deleting app data.
