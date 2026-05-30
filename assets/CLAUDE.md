# assets/ — bundled images

Sprite textures (ball, dirt, leaves, smoke, dust, sparkle, magic, spark) used by the Quick Setup
presets, plus `minecraft_block.png` (the ground block in the 3D preview). They are imported
directly in the source (`../src/components/Sidebar/QuickSetup.vue`, `../src/components/Preview.vue`)
and inlined as base64 by the Mix build.

**Build dependency:** `webpack.mix.js`'s custom PNG `dataUrl` generator reads each of these back
from `../dist/images/<name>.png` at bundle time. `../desktop/prep-images.js` copies everything here
into `dist/images/` before the build runs (chained in `npm run build`). If you add a new imported
PNG, drop it in this folder — prep-images stages all `*.png` automatically.
