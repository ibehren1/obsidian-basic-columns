# Basic Columns

An [Obsidian](https://obsidian.md) plugin for Word-style column sections. A note
can run full width, switch to 2 or 3 columns for a comparison or list, then go
back to full width.

## Usage

- Run **Insert 2 columns** or **Insert 3 columns** from the command palette, or
  right-click in the editor. Any selected text goes into the first column.
- In Live Preview you type directly inside the columns. Links, `[[` suggestions,
  lists, tags and checkboxes all work as usual.
- Hover a column section to get its toolbar: add a column, remove the last
  column (its content moves into the one before), edit as raw markdown, or
  remove the columns while keeping the content.
- Drag the line between two columns to resize them. Double-click it to make
  the columns equal again.
- Arrow keys move between columns and out of the section. Escape leaves the
  section.
- Columns stack vertically in narrow panes and on phones.

## Format

Columns are stored as a callout, so the note stays plain markdown. Links and
tags inside columns are indexed by Obsidian, and the note is still readable
without the plugin.

```markdown
> [!columns|40 60]
> ## Option A
> - fast
>
> > [!column-break]
>
> ## Option B
> - slow
```

The optional `|40 60` sets column widths in percent. Leave it out for equal
widths.

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # type-check + production build
npm run lint
npm test
```

For a dev vault, link `main.js`, `manifest.json`, and `styles.css` into
`<vault>/.obsidian/plugins/basic-columns/`. The gitignored `bc-dev-vault/` in
this repo is set up that way.

Inside columns the plugin uses Obsidian's internal markdown editor, which
isn't part of the public API. That code lives in `src/embedded-editor.ts`. If
a future Obsidian release breaks it, the plugin falls back to a plain text
editor inside columns.

## Versioning and releases

Every commit bumps the patch version (`x.y.z` to `x.y.z+1`). A pre-commit hook
(`.githooks/pre-commit`, enabled by `npm install`) updates `manifest.json`,
`package.json`, `package-lock.json`, and `versions.json`. To bump `x` or `y`,
edit the version in `manifest.json` by hand before committing; the hook leaves
it alone when it's already newer than the last commit's.

CI rejects commits that don't increase the version. Every push to `main`
publishes a GitHub release with `main.js`, `manifest.json`, and `styles.css`.
