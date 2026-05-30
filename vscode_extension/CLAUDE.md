# vscode_extension/ — the VSCode custom editor (and reference host)

Upstream packaging of Snowstorm as a VSCode custom editor for `*.particle.json` files. For this
fork it is mainly useful as the **reference implementation of the host message protocol** — the
Electron host in `../desktop/` was ported from here.

## Files
- **src/extension.js** — activates the custom editor provider.
- **src/snowstormEditor.js** — the host. Implements the same messages `../desktop/main.js` does,
  but resolves textures/particles relative to the open document's `particles/` ancestor folder
  (rather than user-wired pack roots). Key helpers worth reusing: `findFileFromContent()`
  (recursive content-matching file search) and `getParticleFileFromIdentifier()`.
- **snowstorm/app.js** — a copy of the built `../dist/app.js`. `webpack.mix.js` copies the bundle
  here on every build (`mix ... .after(...)`), so it stays in sync automatically.
- **package.json** — extension manifest; `npm run build-extension` (from repo root) runs `vsce package`.

## When changing the host protocol
If you add/rename a renderer↔host message, update **three** places to keep parity:
1. the app side in `../src/` (sender + reply handler),
2. `../desktop/main.js` (Electron host),
3. `src/snowstormEditor.js` here (VSCode host) — or knowingly leave the extension behind.
