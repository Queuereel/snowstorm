# src/components/ — Vue 2 single-file components

`App.vue` is the root; it composes the menu bar, the sidebar (controls), and the 3D preview.

## Top level
- **App.vue** — root layout, tab/panel state, portrait-vs-landscape handling, dialog hosting.
- **MenuBar.vue** — top menu. In hosted mode it drops the Import/Download items and shows the
  "Switch to Code" toggle; routes `link` / `view_code` to the host.
- **Preview.vue** — the Three.js viewport (`View` object: scene, camera, render loop `animate()`),
  footer playback controls, FPS/particle stats, and the **trajectory toggles** (path / rotation,
  backed by `../trajectory.js`). The render loop calls `Emitter.tick()` and renders `View.scene`.
- **Sidebar.vue** — container for the editable input groups.
- **CodeViewer.vue** — read-only JSON view. **ExpressionBar.vue** — the expanded Molang editor
  (`ExpandedInput`). **InfoBox.vue**, **WarningDialog.vue** (`validate()` warnings).
- **HelpPanel.vue** (+ `HelpPanel/`) — documentation panel rendering `../help.js`.

## Sidebar/ (the actual controls)
- **InputGroup.vue** — renders a group of `Input`s (text/molang/number/select/color/gradient/
  event/image). The shared text-input branch is where most fields live. *Local addition:* for the
  `particle_texture_path` field it shows a live **"expected texture location"** hint below the
  input and a **Locate texture…** button (uses `resolve_texture_path` / `locate_texture` host msgs).
- **TextureInput.vue** — the texture editor UI (canvas, tools, UV overlay), wraps `../texture_edit.js`.
- **Curve.vue**, **Gradient.vue** — curve and gradient editors.
- **EventList.vue**, **EventPicker.vue**, **EventSubpart.vue** — particle event editing.
- **QuickSetup.vue** — the guided "Quick Setup" tab (sprite presets in `assets/`).
- **InputGroup.vue / Logo.vue** and `Form/` (Checkbox, ListAddButton) — shared widgets.

## Conventions
- Components read/write the global input model in `../input_structure.js` (the `Data` tree) and
  call `registerEdit()` (`../edits.js`) after changes so hosted mode auto-saves.
- Icons come from `lucide-vue`. To add one, import it in the `<script>` and register it in
  `components:` (verify the export exists in `node_modules/lucide-vue` first).
- Host communication is done by importing `vscode` from `../vscode_extension` and using
  `postMessage` + a `window.addEventListener('message', …)` reply handler (see InputGroup.vue and
  Preview.vue for the pattern).
