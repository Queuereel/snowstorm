# Snowstorm — project guide

Snowstorm is JannisX11's **Minecraft Bedrock Edition particle editor**. Upstream it ships as a
web app ([snowstorm.app](https://snowstorm.app)) and a VSCode extension. This fork adds a
**standalone Electron desktop app** and a few editor features (see "Local additions" below).

Stack: **Vue 2** + **Three.js**, with the particle simulation provided by the **`wintersky`**
npm package. Bundled by **Laravel Mix** (webpack) into `dist/app.js`, which `index.html` loads.

## Run / build (no command line needed)

Double-click (or `./` on Linux) one of the root launcher scripts (see `READ ME FIRST.txt`):
- `Snowstorm-Start.bat` / `Snowstorm-Start.sh` — install (first time) → build → launch.
- `Snowstorm-Run.bat` / `Snowstorm-Run.sh` — launch without rebuilding.
- `Snowstorm-MakeInstaller.bat` — produce a Windows installer in `dist_app/`.
- `Snowstorm-MakeInstaller.sh` — build a Linux **AppImage** in `dist_app/`, then install it: copies
  it to `~/.local/share/Snowstorm/Snowstorm.AppImage`, installs the icon, and writes an app-menu
  entry + a desktop-icon launcher (there's no separate "installer program" step on Linux — running
  the script *is* the install). Safe to re-run to update an existing install.

Equivalent npm scripts:
- `npm run build` — `node desktop/prep-images.js && mix --production` → `dist/app.js`.
- `npm run desktop` / `npm run desktop-nobuild` — build+launch / launch only.
- `npm run dist-win` — package a Windows installer via electron-builder.
- `npm run dist-linux` — package a Linux AppImage via electron-builder.
- `npm run watch` — Mix watch mode for web/extension development.

## The one architectural idea to know

The web app talks to an optional **host** through the object returned by `acquireVsCodeApi()`
(see `src/vscode_extension.js`, exported as `vscode`). When that object exists, the app is in
**"hosted mode"**: it hides the browser Import/Download UI, **auto-saves on every edit**, and
asks the host for textures / referenced particle files instead of using upload/download dialogs.

Two hosts implement the same message protocol:
- **VSCode extension** — `vscode_extension/src/snowstormEditor.js` (upstream; the reference impl).
- **Electron desktop app** — `desktop/` (this fork). The preload defines `acquireVsCodeApi()`,
  so the *same* hosted-mode code path drives the desktop app.

Protocol summary (renderer ⇄ host), see `src/CLAUDE.md` for the full table.

## Local additions in this fork

- `desktop/` — the Electron shell + filesystem host (see `desktop/CLAUDE.md`).
- `src/trajectory.js` + footer toggles in `src/components/Preview.vue` — preview a particle's
  full-lifetime path and rotation in the 3D viewport without waiting out the emitter.
- Live "expected texture location" hint under the texture-path field
  (`src/components/Sidebar/InputGroup.vue`) + a `reload_texture` handler in `src/texture_edit.js`.
- Root `.bat` / `.sh` launchers + `READ ME FIRST.txt`.
- Linux packaging: `build.linux` target (AppImage) in `package.json` + `Snowstorm-MakeInstaller.sh`
  (build + desktop integration, since AppImages have no OS-level installer of their own).

## Build gotchas (important)

1. **`dist/images/` must exist before bundling.** `webpack.mix.js` has a custom PNG `dataUrl`
   generator that reads each imported image back from `./dist/images/<name>.png`; on a clean
   checkout that folder is missing and the build fails with ENOENT. `desktop/prep-images.js`
   stages the PNGs and is chained into the `build` script — always build via `npm run build`,
   not bare `mix --production`.
2. **`ELECTRON_RUN_AS_NODE`** is set in this environment, which makes the `electron` binary run
   headless as plain Node (no window; `require('electron')` returns a path string).
   `desktop/launch.js` strips it for the child — always launch via the npm scripts / .bat files,
   never `electron desktop/main.js` directly.
3. **`npm install` needs `allow-git` on newer npm.** The `root` dependency
   (`github:JannisX11/vue-prism-editor#<sha>`) is fetched via git, which npm 11+ blocks by default
   (`EALLOWGIT`) as a supply-chain-safety default. The repo's `.npmrc` sets `allow-git=all` so a
   plain `npm install` just works — don't remove it.
4. **Electron's postinstall (binary download) needs an explicit approval on newer npm.** Same
   hardening family as #3: dependency install scripts are skipped unless listed in package.json's
   `allowScripts` (managed via `npm install-scripts approve electron`, already committed there) —
   without it `node_modules/electron/dist/electron` never gets downloaded and every launch silently
   no-ops.
5. **`yargs@17.7.2` (a `webpack-cli` dependency) mis-declares `"type": "module"`** even though
   `node_modules/yargs/yargs` is plain CommonJS; recent Node enforces that field strictly, so the
   build fails with `ReferenceError: require is not defined in ES module scope`.
   `desktop/patch-yargs.js` fixes the field post-install and is chained into `npm run postinstall`,
   so a fresh `npm install` self-heals — no manual step needed.

## License

GPL-3.0-or-later (upstream). Keep that in mind for any redistribution.
