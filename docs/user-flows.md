# User Flows

## First Launch

1. Open Skill Manager.
2. App scans supported global roots.
3. Sidebar shows installed skills, packages, sources, review filters, and archived count.
4. First active skill is selected.

Empty state appears when no supported roots contain skills.

## Scan

1. Click Rescan.
2. App rebuilds inventory from local roots and local session logs.
3. Existing selection is preserved when the skill still exists.
4. Scan summary updates in the sidebar footer.

## Search And Sort

1. Type in search.
2. Current sidebar filter stays active.
3. Matching skills remain visible.
4. Toggle Latest added or Usage count to change row order.

## Inspect Content

1. Select a skill.
2. Content tab renders `SKILL.md` as Markdown.
3. Frontmatter is hidden from the reading view.

## Inspect Evidence

1. Open Usage tab.
2. Evidence rows show local session file, evidence kind, and session type.
3. Right rail shows recent local evidence when window width allows it.

## Inspect Files

1. Open Files tab.
2. Left side shows the skill folder and `SKILL.md`.
3. Right side previews the selected file.

## Archive

1. Select a skill.
2. Click Archive.
3. Confirm the dialog.
4. Main process writes ledger state, moves the folder, verifies destination, and reloads inventory.

## Restore

1. Open Archived.
2. Select an archived skill.
3. Click Restore.
4. Main process refuses path conflicts and restores the folder when the original path is clear.

## Export Report

1. Filter or search the intended skill set.
2. Click export report.
3. App writes Markdown and JSON reports under user data.
4. Report path can be revealed from the app.

## Permission Error

1. Scan encounters an unreadable folder.
2. App keeps scanning other roots.
3. Warning state identifies the affected path.

## Archive Conflict

1. Restore finds an existing original path.
2. App shows conflict reason.
3. User inspects or moves the existing folder before retrying restore.
