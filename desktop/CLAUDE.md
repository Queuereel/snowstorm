# desktop/ — Electron standalone app + filesystem host

This folder turns the bundled Snowstorm web app into a standalone desktop program. It is the
**host** for the app's hosted mode (see the root `CLAUDE.md`): it answers the same message
protocol the VSCode extension does, but resolves files against user-wired Bedrock **pack roots**
and reads/writes directly on disk.

## Files

- **main.js** — Electron main process. Creates the `BrowserWindow` (loads the repo's
  `index.html`), tracks `currentFilePath` (the open particle), and implements every host message
  handler over `ipcMain`. Also: open-file-from-CLI, re-open last file, native menu wiring.
- **preload.js** — defines `window.acquireVsCodeApi()` (the shim that flips the app into hosted
  mode). `postMessage` → `ipcRenderer.send('host-message')`; host replies arrive on
  `'renderer-message'` and are re-dispatched via `window.postMessage` so the app's existing
  `window.addEventListener('message')` handlers fire unchanged.
- **packs.js** — wired-pack config (persisted to `userData/snowstorm-desktop.json`) + all path
  resolution: `resolveTexture`, `expectedTexturePath`, `findParticleByIdentifier`,
  `autocompleteDirectory`, `listParticles`, `addPack`/`findPackRoot`. **All filesystem logic
  lives here**; main.js just calls it.
- **menu.js** — native application menu (File / Edit / Packs / View). The Packs menu is rebuilt
  from `packs.listParticles()` each time a pack is added/removed.
- **launch.js** — spawns the electron binary with `ELECTRON_RUN_AS_NODE` stripped (so the GUI
  actually opens). The npm `desktop*` scripts invoke this via `node`.
- **prep-images.js** — pre-build step that stages `assets/*.png` into `dist/images/` so the Mix
  build's custom PNG generator can read them (chained into `npm run build`).

## Host message handlers (main.js)

Renderer → main (`host-message`):
`save` (overwrite open file), `save_texture` (write PNG to resolved path, overwrite),
`request_texture` → `provide_texture`, `resolve_texture_path` → `provide_resolved_path`
(live path hint), `texture_autocomplete`, `request_particle_file` → `provide_particle_file`,
`open_particle_file_tab`, `locate_texture` (pick + copy a PNG to the expected path), `link`,
`view_code`.

Main → renderer (`renderer-message`): `update` (load a particle), `request_content_update`,
`request_save_texture`, `reload_texture`, plus the `provide_*` replies above.

## Conventions / cautions

- **Save = overwrite in place.** Never write uniquified copies. Particle JSON → `currentFilePath`;
  textures → the single path from `packs.resolveTexture`.
- **contextIsolation is disabled** (so the preload's `acquireVsCodeApi` global is visible to
  `dist/app.js` at load). Fine for a local tool; harden with contextBridge + a relay if needed.
- A **pack root** = the folder directly containing `textures/` / `particles/` (or `manifest.json`).
  `findPackRoot` walks up from a chosen folder to locate it.
- After editing anything in `src/`, rebuild (`npm run build`) — this folder loads `dist/app.js`,
  not the source.
