/*
 * .snow project bundles.
 *
 * A .snow file is a zip that packages a particle together with everything it needs: the main
 * particle, every sub-particle its events reference (resolved recursively), and the textures they
 * use. This lets a whole effect be saved/shared as one file instead of loose files scattered
 * across a pack. Built on `fflate` (already a dependency) and the resolution helpers in packs.js.
 *
 * Layout inside the .snow zip:
 *   project.json              - manifest { main, particles: {id: file}, textures: {path: file} }
 *   main.particle.json        - the main effect
 *   particles/<id>.json       - each referenced sub-particle
 *   textures/<path>.png       - each referenced texture
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { zipSync, unzipSync, strToU8, strFromU8 } = require('fflate');
const packs = require('./packs');

function safeName(id) {
	return id.replace(/[^a-z0-9._-]+/gi, '_');
}

/** Collect referenced sub-particle identifiers and texture paths from one particle JSON. */
function collectRefs(json, identifiers, textures) {
	let pe = json && json.particle_effect;
	if (!pe) return;
	let tex = pe.description && pe.description.basic_render_parameters && pe.description.basic_render_parameters.texture;
	if (tex) textures.add(tex);

	let walk = (subpart) => {
		if (!subpart || typeof subpart !== 'object') return;
		if (subpart.particle_effect && subpart.particle_effect.effect) identifiers.add(subpart.particle_effect.effect);
		if (Array.isArray(subpart.sequence)) subpart.sequence.forEach(walk);
		if (Array.isArray(subpart.randomize)) subpart.randomize.forEach(walk);
	};
	let events = pe.events || {};
	for (let id in events) walk(events[id]);
}

/**
 * Build a .snow bundle (Uint8Array) from the main particle content. `anchorPath` is the on-disk
 * location of the main particle, used to resolve relative textures.
 */
function buildBundle(mainContent, anchorPath) {
	let identifiers = new Set();
	let textures = new Set();
	let resolvedParticles = {};

	let main;
	try { main = JSON.parse(mainContent); } catch (e) { throw new Error('The current particle is not valid JSON.'); }
	collectRefs(main, identifiers, textures);

	// Resolve referenced particles recursively across wired packs.
	let queue = Array.from(identifiers);
	while (queue.length) {
		let id = queue.shift();
		if (resolvedParticles[id]) continue;
		let match = packs.findParticleByIdentifier(id);
		if (!match) continue;
		resolvedParticles[id] = match.content;
		try {
			let before = identifiers.size;
			collectRefs(JSON.parse(match.content), identifiers, textures);
			// Queue any newly discovered identifiers.
			for (let newId of identifiers) if (!resolvedParticles[newId] && !queue.includes(newId)) queue.push(newId);
			void before;
		} catch (e) { /* skip bad sub-particle */ }
	}

	let files = {};
	let manifest = { format: 'snowstorm-project', version: 1, main: 'main.particle.json', particles: {}, textures: {} };

	files['main.particle.json'] = strToU8(mainContent);

	for (let id in resolvedParticles) {
		let file = 'particles/' + safeName(id) + '.json';
		files[file] = strToU8(resolvedParticles[id]);
		manifest.particles[id] = file;
	}

	for (let texPath of textures) {
		let resolved = packs.resolveTexture(texPath, anchorPath);
		if (resolved && resolved.exists && resolved.abs) {
			try {
				let file = 'textures/' + texPath.replace(/^\/+/, '') + path.extname(resolved.abs);
				files[file] = new Uint8Array(fs.readFileSync(resolved.abs));
				manifest.textures[texPath] = file;
			} catch (e) { /* skip unreadable texture */ }
		}
	}

	files['project.json'] = strToU8(JSON.stringify(manifest, null, '\t'));
	return zipSync(files, { level: 6 });
}

/**
 * Open a .snow bundle. Extracts textures to a temp folder and returns everything needed to load
 * and preview the project: { mainContent, particles: {id: content}, textures: {texPath: absFile},
 * tempDir }.
 */
function openBundle(buffer) {
	let unzipped = unzipSync(new Uint8Array(buffer));
	let manifest;
	try { manifest = JSON.parse(strFromU8(unzipped['project.json'])); } catch (e) { manifest = null; }

	let mainFile = (manifest && manifest.main) || 'main.particle.json';
	if (!unzipped[mainFile]) throw new Error('This .snow file has no main particle.');
	let mainContent = strFromU8(unzipped[mainFile]);

	let particles = {};
	if (manifest && manifest.particles) {
		for (let id in manifest.particles) {
			let file = manifest.particles[id];
			if (unzipped[file]) particles[id] = strFromU8(unzipped[file]);
		}
	}

	let tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snowstorm-project-'));
	let textures = {};
	if (manifest && manifest.textures) {
		for (let texPath in manifest.textures) {
			let file = manifest.textures[texPath];
			if (!unzipped[file]) continue;
			let out = path.join(tempDir, file);
			fs.mkdirSync(path.dirname(out), { recursive: true });
			fs.writeFileSync(out, Buffer.from(unzipped[file]));
			textures[texPath] = out;
		}
	}

	return { mainContent, particles, textures, tempDir };
}

/**
 * Rebuild a .snow bundle from in-memory project items (used when saving an open .snow project).
 * `items` = [{ id, content }]; `textureFiles` = { texturePath: absoluteTempFile } from openBundle.
 */
function buildBundleFromItems(mainId, items, textureFiles) {
	let files = {};
	let manifest = { format: 'snowstorm-project', version: 1, main: 'main.particle.json', particles: {}, textures: {} };
	let mainItem = (items || []).find(i => i.id === mainId) || (items || [])[0];
	if (!mainItem) throw new Error('No particles to save.');

	files['main.particle.json'] = strToU8(mainItem.content);
	for (let it of items) {
		if (it === mainItem) continue;
		let file = 'particles/' + safeName(it.id) + '.json';
		files[file] = strToU8(it.content);
		manifest.particles[it.id] = file;
	}
	for (let texPath in (textureFiles || {})) {
		try {
			let abs = textureFiles[texPath];
			let file = 'textures/' + texPath.replace(/^\/+/, '') + path.extname(abs);
			files[file] = new Uint8Array(fs.readFileSync(abs));
			manifest.textures[texPath] = file;
		} catch (e) { /* skip unreadable texture */ }
	}
	files['project.json'] = strToU8(JSON.stringify(manifest, null, '\t'));
	return zipSync(files, { level: 6 });
}

module.exports = { buildBundle, openBundle, buildBundleFromItems };
