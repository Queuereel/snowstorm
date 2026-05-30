# src/ — Snowstorm web app source (Vue 2 + Three.js)

Entry point is `app.js`, which mounts `components/App.vue`. Bundled by Laravel Mix into
`../dist/app.js`. After any change here you must rebuild (`npm run build`) for the desktop app /
extension to pick it up.

## The host abstraction (read this first)

`vscode_extension.js` exports `vscode = acquireVsCodeApi() || false`. Almost every file imports it
to branch between **web mode** (`!vscode`) and **hosted mode** (`vscode` truthy — VSCode extension
or the Electron desktop app). In hosted mode the app auto-saves on edit and fetches assets from the
host instead of using browser upload/download.

### Host message protocol

| Renderer → host (`vscode.postMessage`) | Sent from | Host → renderer (`window.postMessage`) |
|---|---|---|
| `save {content}` | `edits.js` (every edit) | `update {text}` — load particle (`import.js`) |
| `save_texture {path, content}` | `texture_edit.js` | `request_save_texture`, `reload_texture` (`texture_edit.js`) |
| `request_texture {request_id, path}` | `emitter.js` | `provide_texture {request_id, url, attempted}` |
| `resolve_texture_path {request_id, path}` | `components/Sidebar/InputGroup.vue` | `provide_resolved_path {request_id, abs, exists, ...}` |
| `texture_autocomplete {path}` | `path_autocomplete.js` | `texture_autocomplete {list}` |
| `request_particle_file {request_id, identifier}` | `emitter.js` | `provide_particle_file {request_id, content}` |
| `locate_texture {path}` | `InputGroup.vue` | (host copies file, then `reload_texture`) |
| `link`, `view_code`, `open_particle_file_tab` | `MenuBar.vue` / others | `request_content_update` (`edits.js`) |

Host implementations: `../desktop/main.js` (Electron) and `../vscode_extension/src/snowstormEditor.js`.

## File map

**Core engine / data**
- `emitter.js` — sets up the `wintersky` `Scene` / `Config` / `Emitter` singletons; `fetchTexture`
  and `fetchParticleFile` issue the host requests above. Exports `Emitter`, `Config`, `Scene`.
- `import.js` — load a particle JSON into the editor (`loadFile`, hosted `update` handler, presets).
- `export.js` — `generateFile()` builds the particle JSON from the input model; `downloadFile()`.
- `edits.js` — `registerEdit()` is called after any change → posts `save` (hosted) and runs
  `EditListeners` (used by the placeholder bar and the trajectory gizmo).
- `texture_edit.js` — the in-app pixel texture editor (`Texture` singleton): canvas, paint/fill/
  pick tools, undo/redo, `save()`/`reload()`, and the `request_save_texture`/`reload_texture` msgs.
- `trajectory.js` *(local addition)* — side-effect-free particle path simulation + 3D gizmo
  (toggled from `components/Preview.vue`).

**Input model (the form ⇄ config bridge)**
- `input.js` — the `Input` class (one editable field; type, value, visibility, change handling).
- `input_structure.js` — the `Data` tree: the entire sidebar layout as nested groups of `Input`s.
- `variable_placeholders.js` — the "undefined variable" placeholder bar logic.

**Molang / autocomplete / syntax**
- `molang_data.js`, `molang_autocomplete.js` — Molang tokens + autocomplete.
- `path_autocomplete.js` — texture-path autocomplete (hosted: real directory listing).
- `languages.js` — Prism syntax grammars (molang / generic).

**Editors & misc**
- `curves.js`, `gradient.js` — curve and color-gradient editors.
- `event_sub_effects.js` — sub-particle (event) effect handling.
- `options.js` — `OptionValues` (grid / axis / block visibility, persisted to localStorage).
- `help.js` — help panel content. `share.js` — encode/decode a particle into the URL (web only).
- `sort.js` — generic drag-to-reorder helper. `util.js` — math/string/JSON helpers + `IO` (the
  browser import/export used only in web mode).
- `browser.js` — web-only startup (service worker, drag-drop, unload warning); **skipped in hosted
  mode** via `if (!vscode)`.

See `components/CLAUDE.md` for the Vue components.
