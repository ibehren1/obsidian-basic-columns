# Basic Columns

An [Obsidian](https://obsidian.md) plugin.

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # type-check + production build
npm run lint
```

## Manual install

Copy `main.js`, `manifest.json`, and `styles.css` into
`<vault>/.obsidian/plugins/basic-columns/`, then enable the plugin in
Settings → Community plugins.

## Releasing

Update `minAppVersion` in `manifest.json` if needed, then run
`npm version patch|minor|major` to bump `manifest.json`, `package.json`, and
`versions.json`. Push the tag; the GitHub release workflow builds the assets.
