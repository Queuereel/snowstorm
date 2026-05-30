# examples/ — sample particle files

Bundled `*.particle.json` samples (fire, rain, snow, magic, trail, drops, etc.). They are:
- imported directly in `../src/import.js` and exposed as presets (File ▸ load preset / Quick Setup);
- handy fixtures for testing — e.g. open `fire.particle.json` in the desktop app, or load one into
  the renderer to exercise features like the trajectory gizmo (fire uses `dynamic` motion).

These are plain Bedrock particle JSON (format_version 1.10.0). They reference textures by path
(e.g. `textures/particle/...`); in the desktop app those resolve only if a matching pack folder is
wired, otherwise particles render as untextured white billboards — that's expected, not a bug.
