/*
 * Wired-pack configuration + filesystem path resolution for the Snowstorm desktop app.
 *
 * A "pack root" is the folder that directly contains a Bedrock-style `textures/` and/or
 * `particles/` directory (the folder texture paths like `textures/particle/foo` are relative
 * to). The user wires in any number of these; textures and referenced particle files are then
 * resolved against all of them.
 *
 * This is the desktop equivalent of vscode_extension/src/snowstormEditor.js, but resolving
 * against user-configured roots instead of a single open document.
 */
const fs = require('fs');
const path = require('path');

let configPath = null;
let config = { packs: [], recentFiles: [] };

function init(userDataDir) {
	configPath = path.join(userDataDir, 'snowstorm-desktop.json');
	try {
		config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
	} catch (err) {
		config = { packs: [], recentFiles: [] };
	}
	if (!Array.isArray(config.packs)) config.packs = [];
	if (!Array.isArray(config.recentFiles)) config.recentFiles = [];
	return config;
}

function save() {
	try {
		fs.writeFileSync(configPath, JSON.stringify(config, null, '\t'));
	} catch (err) {
		console.error('Failed to save desktop config', err);
	}
}

function getConfig() {
	return config;
}
function getPacks() {
	return config.packs.slice();
}

/** Walk up from a chosen folder to the folder that directly contains textures/ or particles/ or manifest.json. */
function findPackRoot(startDir) {
	let dir = startDir;
	for (let i = 0; i < 8; i++) {
		try {
			if (
				fs.existsSync(path.join(dir, 'manifest.json')) ||
				fs.existsSync(path.join(dir, 'textures')) ||
				fs.existsSync(path.join(dir, 'particles'))
			) {
				return dir;
			}
		} catch (err) { /* ignore */ }
		let parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return startDir;
}

function addPack(chosenDir) {
	let root = findPackRoot(chosenDir);
	if (!config.packs.includes(root)) {
		config.packs.push(root);
		save();
	}
	return root;
}

function removePack(root) {
	config.packs = config.packs.filter(p => p !== root);
	save();
}

function rememberFile(filePath) {
	if (!filePath) return;
	config.recentFiles = config.recentFiles.filter(f => f !== filePath);
	config.recentFiles.unshift(filePath);
	config.recentFiles = config.recentFiles.slice(0, 15);
	save();
}

/** The pack root that an open file belongs to, else the first wired pack. */
function activeRoot(openFilePath) {
	if (openFilePath) {
		let match = config.packs
			.filter(root => openFilePath.toLowerCase().startsWith(root.toLowerCase()))
			.sort((a, b) => b.length - a.length)[0];
		if (match) return match;
		// Not inside a wired pack — derive a root from the file's own location.
		return findPackRoot(path.dirname(openFilePath));
	}
	return config.packs[0] || null;
}

function stripTextureExt(p) {
	return p.replace(/\.(png|tga)$/i, '');
}

/** Recursively find the first file with the given basename under a directory. */
function findByBasename(dir, basename) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch (err) {
		return null;
	}
	for (let entry of entries) {
		if (entry.isFile() && stripTextureExt(entry.name).toLowerCase() === basename.toLowerCase()) {
			return path.join(dir, entry.name);
		}
	}
	for (let entry of entries) {
		if (entry.isDirectory()) {
			let found = findByBasename(path.join(dir, entry.name), basename);
			if (found) return found;
		}
	}
	return null;
}

/**
 * Resolve a particle texture path (e.g. "textures/particle/foo") to a file on disk.
 * Returns { abs, exists, attempted: [...] }. `abs` is the first matching file, or — when none
 * match — the primary expected location (active root + path + .png), so callers can always show
 * the user exactly where the texture is expected.
 */
function resolveTexture(texturePath, openFilePath) {
	let clean = stripTextureExt((texturePath || '').replace(/\\/g, '/'));
	let attempted = [];
	let roots = [];
	let primaryRoot = activeRoot(openFilePath);
	if (primaryRoot) roots.push(primaryRoot);
	for (let p of config.packs) if (!roots.includes(p)) roots.push(p);

	let candidates = [];
	for (let root of roots) {
		candidates.push(path.join(root, clean + '.png'));
		candidates.push(path.join(root, clean + '.tga'));
	}
	// Relative to the open file's own folder (some packs reference textures locally).
	if (openFilePath) {
		candidates.push(path.join(path.dirname(openFilePath), clean + '.png'));
		candidates.push(path.join(path.dirname(openFilePath), clean + '.tga'));
	}

	for (let candidate of candidates) {
		attempted.push(candidate);
		try {
			if (fs.existsSync(candidate)) {
				return { abs: candidate, exists: true, attempted };
			}
		} catch (err) { /* ignore */ }
	}

	// Last-resort fuzzy match by basename within each root's textures tree.
	let basename = path.basename(clean);
	for (let root of roots) {
		let texturesDir = path.join(root, 'textures');
		let found = findByBasename(texturesDir, basename);
		if (found) {
			attempted.push('(fuzzy) ' + found);
			return { abs: found, exists: true, fuzzy: true, attempted };
		}
	}

	// Nothing found — expected location is active root + path.
	let expected = primaryRoot ? path.join(primaryRoot, clean + '.png') : null;
	return { abs: expected, exists: false, attempted };
}

/**
 * Where the app *expects* a texture to live, regardless of whether it exists yet.
 * Used for the live hint under the texture-path field. Returns { abs, dir, exists, root }.
 */
function expectedTexturePath(texturePath, openFilePath) {
	let clean = stripTextureExt((texturePath || '').replace(/\\/g, '/'));
	let root = activeRoot(openFilePath);
	if (!root || !clean) {
		return { abs: null, dir: null, exists: false, root: root || null };
	}
	let resolved = resolveTexture(texturePath, openFilePath);
	if (resolved.exists) {
		return { abs: resolved.abs, dir: path.dirname(resolved.abs), exists: true, root };
	}
	let abs = path.join(root, clean + '.png');
	return { abs, dir: path.dirname(abs), exists: false, root };
}

function looksLikeParticleFile(content) {
	return content && content.particle_effect && content.particle_effect.description;
}

/** Recursively collect *.json particle files under a directory. */
function collectParticles(dir, out, base) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch (err) {
		return;
	}
	for (let entry of entries) {
		let full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			collectParticles(full, out, base);
		} else if (/\.json$/i.test(entry.name)) {
			try {
				let content = JSON.parse(fs.readFileSync(full, 'utf-8'));
				if (looksLikeParticleFile(content)) {
					out.push({
						path: full,
						identifier: content.particle_effect.description.identifier || entry.name,
						label: path.relative(base, full).replace(/\\/g, '/')
					});
				}
			} catch (err) { /* skip non-JSON / unreadable */ }
		}
	}
}

/** List every particle across all wired packs, grouped by pack root. */
function listParticles() {
	let groups = [];
	for (let root of config.packs) {
		let particlesDir = path.join(root, 'particles');
		let list = [];
		let searchDir = fs.existsSync(particlesDir) ? particlesDir : root;
		collectParticles(searchDir, list, root);
		list.sort((a, b) => a.label.localeCompare(b.label));
		groups.push({ root, name: path.basename(root), particles: list });
	}
	return groups;
}

/** Find a particle file by its identifier across all wired packs. */
function findParticleByIdentifier(identifier) {
	for (let group of listParticles()) {
		let match = group.particles.find(p => p.identifier === identifier);
		if (match) {
			try {
				return { path: match.path, content: fs.readFileSync(match.path, 'utf-8') };
			} catch (err) { /* ignore */ }
		}
	}
	return null;
}

/** Directory listing for texture-path autocomplete, merged across all roots. */
function autocompleteDirectory(basePath) {
	let clean = (basePath || '').replace(/\\/g, '/');
	let set = new Set();
	for (let root of config.packs) {
		try {
			for (let name of fs.readdirSync(path.join(root, clean))) {
				set.add(name);
			}
		} catch (err) { /* ignore */ }
	}
	return Array.from(set);
}

module.exports = {
	init,
	save,
	getConfig,
	getPacks,
	findPackRoot,
	addPack,
	removePack,
	rememberFile,
	activeRoot,
	resolveTexture,
	expectedTexturePath,
	listParticles,
	findParticleByIdentifier,
	autocompleteDirectory,
};
