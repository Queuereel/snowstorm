/*
 * Pre-build step. Laravel Mix's custom PNG dataUrl generator (webpack.mix.js) reads each imported
 * image back from ./dist/images/<name>.png while bundling. On a clean checkout that folder doesn't
 * exist yet, so the production build fails with ENOENT. Staging the source PNGs there first breaks
 * the chicken-and-egg. Safe to run repeatedly.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const assetsDir = path.join(root, 'assets');
const outDir = path.join(root, 'dist', 'images');

fs.mkdirSync(outDir, { recursive: true });
for (const file of fs.readdirSync(assetsDir)) {
	if (/\.png$/i.test(file)) {
		fs.copyFileSync(path.join(assetsDir, file), path.join(outDir, file));
	}
}
console.log('Staged ' + fs.readdirSync(outDir).length + ' image(s) into dist/images for the build.');
