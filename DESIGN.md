# Skill Manager Design System

## Design Register

Product UI. Design serves repeated work: scan, inspect, compare, open, archive, restore.

## Physical Scene

A developer is reviewing local agent skills on a Mac during focused desk work, with the app next to Codex or an editor. The interface should be quiet, readable, and dense enough for repeated scanning.

## Visual Direction

Mosaic, warm, restrained. The approved prototype uses a Craft-like three-pane shell with soft warm surfaces, thin separators, compact rows, and a single amber accent. Keep this direction unless the user explicitly asks for a new concept.

## Layout

- Three columns: sidebar, skill list, detail.
- Sidebar width: about 232 px.
- Skill list width: about 356 px.
- Detail pane fills remaining space.
- Compact desktop breakpoints may hide the right inspector rail and let content expand.
- No nested cards.
- Use framed panels only for tools, previews, file trees, repeated rows, dialogs, and actual content surfaces.
- Detail content area should feel like a reading/work surface, not a marketing page.

## Typography

Use one UI font stack for Chinese and English across navigation, labels, buttons, inputs, tabs, metadata, and side panels:

```css
--sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Segoe UI", system-ui, sans-serif;
```

Use monospace only inside code spans, code blocks, and raw technical snippets:

```css
--code-font: "SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
```

Rules:

- Do not use a separate display font.
- Use the shared sans font for navigation, buttons, tabs, counters, and metadata.
- Chinese and English in the same control must inherit the same UI font stack.
- Body and row copy should sit around 13 px.
- Section labels should be small, calm, and readable without excessive tracking.

## Color Strategy

Restrained. Warm tinted neutrals carry most of the surface. Amber is the single accent for selected state, active tabs, and small source markers.

Light theme tokens:

```css
--page-bg: oklch(0.91 0.018 98);
--bg: oklch(0.985 0.025 98);
--pane: oklch(0.965 0.018 98);
--pane-strong: oklch(0.992 0.023 98 / 0.86);
--detail-bg: oklch(0.985 0.025 98);
--ink: oklch(0.19 0.006 90);
--ink-dim: oklch(0.19 0.006 90 / 0.48);
--ink-soft: oklch(0.19 0.006 90 / 0.68);
--ink-body: oklch(0.19 0.006 90 / 0.72);
--ink-faint: oklch(0.19 0.006 90 / 0.12);
--accent: oklch(0.76 0.15 74);
--selected-bg: oklch(0.76 0.15 74 / 0.16);
--selected-border: oklch(0.76 0.15 74 / 0.46);
```

Dark theme follows the same roles with warm near-black surfaces and restrained amber.

## Components

Use shadcn/ui and Radix primitives for behavior. Style with Tailwind utilities and design tokens. CSS should hold imports, tokens, and global base rules. Component visual styling should live in Tailwind class strings or small reusable component wrappers.

### Sidebar

- Leave top-left space for native macOS controls.
- Do not draw fake red, yellow, and green traffic light dots.
- Sidebar labels, counts, and icons use the same UI font.
- Selected item uses warm amber tint and subtle border.

### Skill List

- Header includes title, rescan, add, search, and sorting.
- Sorting options: latest added and usage count.
- Default sort: latest added first.
- Rows show icon, title, one-line summary, small source dots, usage count, and last used.
- Row text truncates cleanly.

### Detail Header

- Title and description are the main hierarchy.
- Source chips stay compact.
- Avoid prominent protect/review controls in the primary detail surface.
- The enabled switch must be aligned, clickable, and visually centered.

### Actions

Primary visible actions on an active skill:

- Open
- Archive

Archive uses a confirmation dialog. Open should reveal or open the skill location.

### Content Tab

- Render `SKILL.md` as Markdown.
- Hide frontmatter from the reading view when possible.
- Headings, paragraphs, lists, inline code, and fenced code blocks should have distinct readable styles.
- Copy remains available as a small utility action.

### Files Tab

Use an IDE-like split:

- Left: compact file tree.
- Right: preview of the selected file.

The initial file tree can include the skill folder and `SKILL.md`. When file enumeration is available, extend the tree with real files.

### Inspector Rail

- Use plain label/value rows and thin separators.
- Keep metadata readable.
- Avoid a large protection/review ledger on the primary surface.

## Motion

- Keep transitions between 150 ms and 220 ms.
- Animate color, opacity, and transform only.
- Use motion for state feedback.

## Accessibility

- All icon buttons need labels.
- Switches need an accessible name and keyboard interaction.
- Tabs need semantic tablist/tab/panel structure.
- Search input needs a real label or aria label.
- Text must not rely on color alone for selected state.

## Current UI Fixes To Preserve

- Remove fake macOS traffic lights.
- Use one UI font stack across Chinese and English.
- Replace raw `SKILL.md` source view with Markdown rendering.
- Replace Files tab cards with file tree plus preview.
- Keep main detail actions to Open and Archive.
- Add sorting by latest added and usage count.
