# Snowstorm Desktop — How to use it

A practical guide to the desktop app and everything added to it. For the absolute basics, see
`READ ME FIRST.txt`.

## Launching

Double-click one of these (no command line needed):

- **Snowstorm-Start.bat** — installs (first time), builds, and opens the app.
- **Snowstorm-Run.bat** — opens instantly without rebuilding.
- **Snowstorm-MakeInstaller.bat** — builds a Windows installer `.exe` in `dist_app/`.

## The workspace

Three columns, left to right:

1. **Project panel** — your particles. Open a folder or project here and switch between particles.
2. **Controls** — the editor tabs (File, Emitter, Motion, Appearance, Texture, Time, Events,
   Variables & Curves).
3. **3D preview** — live render, with the transport/visualization controls along the bottom.

## Opening your work

In the Project panel header (or the **File** menu):

- **Open Folder** — point at a Bedrock pack folder (the one containing `particles/` / `textures/`).
  Every particle in it is listed.
- **Open Particle** — open a single `.particle.json`. If it lives inside a pack, the whole pack is
  listed so you can see its siblings.
- **Open Project (.snow)** — open a Snowstorm project bundle (see ".snow projects" below).

## Navigating particles

- **Click a row** (anywhere from the name to the right edge) to open that particle in the editor.
  The active one is highlighted with a colored left bar.
- **Search box** filters the list by name/path.
- **Checkboxes (left)** select multiple particles — used to scope saving (below). They are the only
  selection mechanism; clicking a row just opens it.

## Saving (important — it's buffered)

Edits are held in the app and **do not touch your files until you save**. This lets you bounce
between particles freely without writing half-finished changes to disk.

- **Ctrl+S** — saves your changes. In a **folder**, it asks, one changed particle at a time,
  "Overwrite `<id>` in the folder?" (Overwrite / Skip). In a **.snow** project, it rewrites the
  bundle.
- If you have **checkboxes ticked**, Ctrl+S only saves those; with nothing ticked, it saves every
  changed particle.
- The **Save icon** in the panel header lights up when you have unsaved changes.
- Painted textures are written as part of the same save.

## .snow projects

A `.snow` file bundles a particle **plus everything it needs** — every sub-particle its events
reference and all their textures — into one shareable file.

- **Create one:** File ▸ **Save Project As (.snow)…** (or `Ctrl+Shift+S`). Bundles the current
  project's particles + textures.
- **Open one:** File ▸ **Open Project (.snow)…**. Textures and sub-particles resolve straight from
  the bundle, even without a wired pack.
- Great for sharing a complete effect or backing one up.

## Guided presets (stop fighting Molang)

Two sections have a "pick a pattern" dropdown that fills the fields correctly and explains what it
does. Each also has **Custom (your own values)** to leave fields untouched.

- **Emitter ▸ Spawn Amount → Spawn preset:** One-shot burst, Steady stream, Event-driven (manual),
  Timed burst loop. These set Bedrock-correct combinations — e.g. *One-shot burst* sets Emitter
  Lifetime to **Once** (required for one-shot effects in Bedrock). A ⚠ warning appears for risky
  combos.
- **Texture ▸ UV → UV pattern:** Static frame, Random frame, Play once over lifetime, Loop
  animation, Scroll sideways/vertically.

## Preview tools (bottom bar)

- **Time of day** (Default / Day / Sunset / Night / Cave) — changes the preview environment;
  remembered between sessions.
- **Collision** — toggles the ground-collision plane for the viewport.
- **Variables bar** (#) — edit undefined Molang variables live.
- **Path** and **Rotation** — draw a particle's full-lifetime trajectory and its roll along it,
  without waiting for the emitter to cycle.
- **Spawn shape** (box icon) — draws a wireframe outline of where particles spawn (point/sphere/
  box/disc). Updates as you change the shape.
- **Timeline** (the bar near the bottom) — **drag it to scrub** the effect back and forth; the
  playhead follows during playback.

All visualizations now update automatically when you switch particles.

## Edit the raw JSON live (Switch to Code)

Top-right **Switch to Code** opens the current particle in **VS Code docked to the right**, with
Snowstorm on the left. Edits saved in VS Code appear back in Snowstorm within a second, and vice
versa — live two-way editing. (Requires VS Code with its `code` command on PATH.)

## Undo / redo

- **Ctrl+Z** undoes the last action; **Ctrl+Y** or **Ctrl+Shift+Z** redoes.
- The texture editor keeps its own undo while your cursor is over it.
- History is per-particle — switching particles starts a fresh history.

## Languages

**Language** menu (top bar): English, Русский, Français, 日本語. The main interface translates
immediately and the choice is remembered. (Deep field labels and the full Help library stay in
English.)

## Examples

**Examples** menu loads ready-made effects: Aurora, Aurora (Winter), Explosion, Smoke Plume, Portal
Swirl, plus the originals (Fire, Rain, Snow, Magic, Trail…). Good starting points to learn from.

## Textures

- Wire a folder (Open Folder) so texture paths resolve. Under the texture-path field you'll see the
  **exact location on disk** the texture is expected at; if it's missing, a **Locate texture…**
  button lets you point at the PNG and it's copied into place.
- Painting on the texture and saving writes back to that same file (no duplicate copies).

## Events

The editor's **Events** tab builds combined effects (one effect triggering particles/sounds/Molang
at set moments). For a plain-English walkthrough of how events work and how to use them in Minecraft,
open **Help ▸ Documentation ▸ Events ▸ "Using Events in Minecraft"**.

## Quick tips

- First run downloads dependencies — it takes a few minutes, then it's fast.
- If a `.bat` shows an error it pauses so you can read it; screenshot it if you need help.
- Nothing is written to your pack until you press **Ctrl+S** — experiment freely.
