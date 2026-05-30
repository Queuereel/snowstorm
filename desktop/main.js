/*
 * Snowstorm desktop (Electron) main process.
 *
 * Acts as the "host" for the bundled Snowstorm web app (see desktop/preload.js). The app runs in a
 * project-buffered model: opening a folder or a .snow lists every particle, the app edits them in
 * memory, and nothing is written to disk until the user presses Ctrl+S — which prompts, one changed
 * particle at a time, whether to overwrite the file in the folder (or rewrites the .snow bundle).
 * Textures and referenced sub-particles resolve against wired Bedrock pack roots (desktop/packs.js)
 * or the open .snow bundle.
 */
const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const packs = require('./packs');
const project = require('./project');
const { buildMenu } = require('./menu');

let mainWindow = null;
let currentFilePath = null;     // disk path of the active particle (folder mode); null in .snow mode
let lastWrittenContent = null;  // last text we wrote/loaded, to ignore our own file-watch events
let fileWatcher = null;         // fs watcher for live VS Code -> Snowstorm sync
let persistedState = {};

// Current project context.
let projectMode = 'none';       // 'none' | 'folder' | 'snow'
let projectSnowPath = null;     // the .snow file path when in snow mode
let projectMainId = null;       // the main particle identifier in snow mode
let projectParticles = {};      // identifier -> particle JSON string (snow bundle resolution)
let projectTextures = {};       // texture path -> absolute temp file path (snow bundle resolution)

function send(type, payload) {
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.webContents.send('renderer-message', Object.assign({ type }, payload));
	}
}

function particleId(content) {
	try { return JSON.parse(content).particle_effect.description.identifier; } catch (e) { return null; }
}

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1400,
		height: 900,
		backgroundColor: '#29323a',
		icon: path.join(__dirname, '..', 'icon.png'),
		title: 'Snowstorm',
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: false,
			nodeIntegration: false,
			sandbox: false,
		},
	});

	mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

	mainWindow.webContents.on('did-finish-load', () => {
		mainWindow.webContents.send('init-state', persistedState);
		refreshMenu();
		// Open a .json passed on the command line, else re-open the last file if it still exists.
		let cliFile = process.argv.find(arg => /\.json$/i.test(arg) && fs.existsSync(arg));
		let last = persistedState.lastFile;
		if (cliFile) {
			openParticleFile(cliFile);
		} else if (last && fs.existsSync(last)) {
			openParticleFile(last);
		}
	});

	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

function refreshMenu() {
	buildMenu({
		packs,
		onAddPack: openFolderDialog,
		onRemovePack: (root) => { packs.removePack(root); refreshMenu(); },
		onOpenParticle: openParticleDialog,
		onOpenParticlePath: openParticleFile,
		onNewParticle: newParticle,
		onSave: () => send('trigger_save'),
		onReveal: () => { if (currentFilePath) shell.showItemInFolder(currentFilePath); },
		onToggleDevTools: () => mainWindow && mainWindow.webContents.toggleDevTools(),
		onOpenFolder: openFolderDialog,
		onOpenProject: openSnowProject,
		onExportProject: () => send('trigger_export_snow'),
	});
}

// Bundle the whole current project (all particle buffers + their textures) into a chosen .snow.
function exportSnow(mainId, items) {
	if (!items || !items.length) {
		dialog.showErrorBox('Nothing to export', 'Open a folder or project and select a particle first.');
		return;
	}
	let target = dialog.showSaveDialogSync(mainWindow, {
		title: 'Save Project As',
		defaultPath: ((mainId && mainId.split(':').pop()) || 'project') + '.snow',
		filters: [{ name: 'Snowstorm Project', extensions: ['snow'] }],
	});
	if (!target) return;

	// Resolve each referenced texture to a file on disk (open .snow bundle first, then wired packs).
	let textureFiles = {};
	for (let it of items) {
		try {
			let pe = JSON.parse(it.content).particle_effect;
			let tex = pe && pe.description && pe.description.basic_render_parameters && pe.description.basic_render_parameters.texture;
			if (tex && !textureFiles[tex]) {
				if (projectTextures[tex]) {
					textureFiles[tex] = projectTextures[tex];
				} else {
					let r = packs.resolveTexture(tex, currentFilePath);
					if (r && r.exists && r.abs) textureFiles[tex] = r.abs;
				}
			}
		} catch (e) { /* skip */ }
	}

	try {
		let bundle = project.buildBundleFromItems(mainId, items, textureFiles);
		fs.writeFileSync(target, Buffer.from(bundle));
		dialog.showMessageBox(mainWindow, {
			type: 'info', title: 'Project saved',
			message: 'Saved ' + path.basename(target),
			detail: 'Bundled ' + items.length + ' particle(s) and their textures.',
		});
	} catch (e) {
		dialog.showErrorBox('Save Project failed', String(e && e.message || e));
	}
}

// ---- Opening projects -----------------------------------------------------------------------

// Read every particle in a wired pack root into a project item list.
function listFolderItems(root) {
	let items = [];
	let groups = packs.listParticles();
	let group = groups.find(g => g.root === root);
	if (group) {
		for (let p of group.particles) {
			try {
				items.push({ id: p.identifier, path: p.path, content: fs.readFileSync(p.path, 'utf-8') });
			} catch (e) { /* skip unreadable */ }
		}
	}
	return items;
}

function pushFolderProject(root, activePath) {
	projectMode = 'folder';
	projectSnowPath = null;
	projectMainId = null;
	projectParticles = {};
	projectTextures = {};
	let items = listFolderItems(root);
	let activeId = null;
	if (activePath) {
		let norm = activePath.toLowerCase();
		let m = items.find(i => i.path && i.path.toLowerCase() === norm);
		if (m) activeId = m.id;
	}
	send('project_list', { mode: 'folder', name: path.basename(root), items, activeId });
	if (mainWindow) mainWindow.setTitle('Snowstorm — ' + path.basename(root));
}

function openFolderDialog() {
	let result = dialog.showOpenDialogSync(mainWindow, {
		title: 'Open Folder',
		properties: ['openDirectory'],
	});
	if (result && result[0]) {
		let root = packs.addPack(result[0]);
		refreshMenu();
		pushFolderProject(root || result[0]);
	}
}

// Open a single particle. If it lives inside a wired pack, list the whole pack (siblings show up).
function openParticleFile(filePath) {
	if (!filePath || !fs.existsSync(filePath)) return;
	packs.rememberFile(filePath);
	persistedState.lastFile = filePath;
	let lower = filePath.toLowerCase();
	let root = (packs.getPacks() || []).find(r => lower.startsWith(r.toLowerCase()));
	if (root) {
		pushFolderProject(root, filePath);
	} else {
		let content;
		try { content = fs.readFileSync(filePath, 'utf-8'); } catch (e) { dialog.showErrorBox('Open failed', String(e)); return; }
		let id = particleId(content) || path.basename(filePath);
		projectMode = 'folder';
		projectSnowPath = null;
		projectMainId = null;
		projectParticles = {};
		projectTextures = {};
		send('project_list', { mode: 'folder', name: path.basename(filePath), items: [{ id, path: filePath, content }], activeId: id });
		if (mainWindow) mainWindow.setTitle('Snowstorm — ' + path.basename(filePath));
	}
	refreshMenu();
}

function openParticleDialog() {
	let result = dialog.showOpenDialogSync(mainWindow, {
		title: 'Open Particle',
		filters: [{ name: 'Particle', extensions: ['json'] }],
		properties: ['openFile'],
	});
	if (result && result[0]) openParticleFile(result[0]);
}

function openSnowProject() {
	let picked = dialog.showOpenDialogSync(mainWindow, {
		title: 'Open Project',
		filters: [{ name: 'Snowstorm Project', extensions: ['snow'] }],
		properties: ['openFile'],
	});
	if (!picked || !picked[0]) return;
	try {
		let data = project.openBundle(fs.readFileSync(picked[0]));
		projectMode = 'snow';
		projectSnowPath = picked[0];
		projectParticles = data.particles || {};
		projectTextures = data.textures || {};
		let mainId = particleId(data.mainContent) || 'main';
		projectMainId = mainId;
		currentFilePath = null;
		let items = [{ id: mainId, path: null, content: data.mainContent }];
		for (let id in projectParticles) if (id !== mainId) items.push({ id, path: null, content: projectParticles[id] });
		send('project_list', { mode: 'snow', name: path.basename(picked[0]), items, activeId: mainId });
		send('reload_texture');
		if (mainWindow) mainWindow.setTitle('Snowstorm — ' + path.basename(picked[0]));
	} catch (err) {
		dialog.showErrorBox('Open Project failed', String(err && err.message || err));
	}
}

function newParticle() {
	let result = dialog.showSaveDialogSync(mainWindow, {
		title: 'New Particle',
		defaultPath: 'new.particle.json',
		filters: [{ name: 'Particle', extensions: ['json'] }],
	});
	if (!result) return;
	let template = {
		format_version: '1.10.0',
		particle_effect: {
			description: {
				identifier: 'custom:' + path.basename(result).replace(/\.particle\.json$|\.json$/i, ''),
				basic_render_parameters: { material: 'particles_alpha', texture: 'textures/particle/particles' },
			},
			components: {},
		},
	};
	fs.writeFileSync(result, JSON.stringify(template, null, '\t'));
	openParticleFile(result);
}

// ---- Saving (Ctrl+S flush) ------------------------------------------------------------------

// Folder mode: ask per changed particle whether to overwrite its file.
function saveFolder(items) {
	let written = [];
	for (let it of (items || [])) {
		if (!it.path) continue;
		let res = dialog.showMessageBoxSync(mainWindow, {
			type: 'question',
			buttons: ['Overwrite', 'Skip'],
			defaultId: 0,
			cancelId: 1,
			noLink: true,
			title: 'Save changes',
			message: 'Overwrite "' + it.id + '" in the folder?',
			detail: it.path,
		});
		if (res === 0) {
			try {
				fs.writeFileSync(it.path, it.content);
				written.push(it.id);
				if (it.path === currentFilePath) lastWrittenContent = it.content;
			} catch (e) {
				dialog.showErrorBox('Write failed', String(e));
			}
		}
	}
	send('project_saved', { written });
}

// Snow mode: rebuild the bundle from the current buffers + the bundle's textures.
function saveSnow(items) {
	let target = projectSnowPath;
	if (!target) {
		target = dialog.showSaveDialogSync(mainWindow, {
			title: 'Save Project',
			defaultPath: 'project.snow',
			filters: [{ name: 'Snowstorm Project', extensions: ['snow'] }],
		});
		if (!target) return;
		projectSnowPath = target;
	}
	try {
		let bundle = project.buildBundleFromItems(projectMainId, items, projectTextures);
		fs.writeFileSync(target, Buffer.from(bundle));
		send('project_saved', { written: (items || []).map(i => i.id) });
	} catch (e) {
		dialog.showErrorBox('Save Project failed', String(e && e.message || e));
	}
}

// Watch the open file so external edits (e.g. from VS Code) flow back into Snowstorm live.
function watchCurrentFile() {
	if (fileWatcher) {
		try { fileWatcher.close(); } catch (e) {}
		fileWatcher = null;
	}
	if (!currentFilePath) return;
	let debounce = null;
	try {
		fileWatcher = fs.watch(currentFilePath, () => {
			clearTimeout(debounce);
			debounce = setTimeout(() => {
				let content;
				try { content = fs.readFileSync(currentFilePath, 'utf-8'); } catch (e) { return; }
				if (content === lastWrittenContent) return; // ignore our own writes
				lastWrittenContent = content;
				send('update', { text: content });
			}, 150);
		});
	} catch (err) {
		console.warn('Could not watch file for live sync', err);
	}
}

// Open the active particle in VS Code, docked to the right; Snowstorm snaps to the left.
function openInVSCode() {
	if (!currentFilePath) {
		dialog.showErrorBox('No file open', 'Open a folder project and select a particle first (.snow projects have no on-disk file to edit).');
		return;
	}

	let right = null;
	if (mainWindow) {
		let display = screen.getDisplayMatching(mainWindow.getBounds());
		let wa = display.workArea;
		let halfW = Math.floor(wa.width / 2);
		right = { x: wa.x + halfW, y: wa.y, width: wa.width - halfW, height: wa.height };
		if (mainWindow.isMaximized()) mainWindow.unmaximize();
		mainWindow.setBounds({ x: wa.x, y: wa.y, width: halfW, height: wa.height });
	}

	let proc = spawn('code', ['--reuse-window', currentFilePath], { shell: true, detached: true });
	proc.on('error', () => {
		dialog.showMessageBox(mainWindow, {
			type: 'info',
			title: 'VS Code not found',
			message: 'Could not run the "code" command.',
			detail: 'Install Visual Studio Code and enable its "code" command in PATH (in VS Code: Command Palette ▸ "Shell Command: Install \'code\' command in PATH"), then try again.',
		});
	});

	if (right && process.platform === 'win32') {
		let ps = path.join(__dirname, 'dock-right.ps1');
		spawn('powershell.exe', [
			'-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps,
			'-X', String(right.x), '-Y', String(right.y),
			'-W', String(right.width), '-H', String(right.height),
			'-TitleMatch', path.basename(currentFilePath),
		], { detached: true, stdio: 'ignore' });
	}
}

// ---- Host message handlers (renderer -> main) -----------------------------------------------

ipcMain.on('set-state', (_event, state) => {
	persistedState = Object.assign({}, persistedState, state);
});

ipcMain.on('host-message', (_event, message) => {
	switch (message.type) {
		// Panel / menu actions.
		case 'project_action': {
			if (message.action === 'open_folder') openFolderDialog();
			else if (message.action === 'open_snow') openSnowProject();
			else if (message.action === 'new') newParticle();
			break;
		}

		// The app switched to a particle — track its disk path for texture resolution + live sync.
		case 'project_set_active': {
			if (message.path) {
				currentFilePath = message.path;
				try { lastWrittenContent = fs.readFileSync(message.path, 'utf-8'); } catch (e) { lastWrittenContent = null; }
				watchCurrentFile();
			}
			break;
		}

		// Ctrl+S flush.
		case 'project_save': {
			if (message.mode === 'snow') saveSnow(message.items);
			else saveFolder(message.items);
			break;
		}

		// Save Project As (.snow) — bundle the whole project to a chosen file.
		case 'export_snow': {
			exportSnow(message.mainId, message.items);
			break;
		}

		// Legacy hosted auto-save (only fires when no project is active).
		case 'save': {
			if (currentFilePath && typeof message.content === 'string') {
				if (message.content === lastWrittenContent) break;
				try {
					fs.writeFileSync(currentFilePath, message.content);
					lastWrittenContent = message.content;
				} catch (err) {
					console.error('save failed', err);
				}
			}
			break;
		}

		// Write the painted texture to its resolved path, overwriting in place.
		case 'save_texture': {
			if (typeof message.content !== 'string' || !message.content.startsWith('data:')) return;
			let resolved = packs.resolveTexture(message.path, currentFilePath);
			let target = resolved.abs;
			if (!target) {
				console.warn('No pack root to save texture into for', message.path);
				return;
			}
			try {
				let dir = path.dirname(target);
				if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
				let base64 = message.content.split(',')[1];
				if (base64) fs.writeFileSync(target, base64, { encoding: 'base64' });
			} catch (err) {
				console.error('save_texture failed', err);
			}
			break;
		}

		// Provide a texture file:// URL (project bundle first, then packs).
		case 'request_texture': {
			if (projectTextures[message.path]) {
				send('provide_texture', {
					request_id: message.request_id,
					url: pathToFileUrl(projectTextures[message.path]),
				});
				break;
			}
			let resolved = packs.resolveTexture(message.path, currentFilePath);
			send('provide_texture', {
				request_id: message.request_id,
				url: resolved.exists ? pathToFileUrl(resolved.abs) : null,
				attempted: resolved.attempted,
			});
			break;
		}

		// Live "expected location" hint under the texture-path field.
		case 'resolve_texture_path': {
			let info = packs.expectedTexturePath(message.path, currentFilePath);
			send('provide_resolved_path', {
				request_id: message.request_id,
				abs: info.abs,
				dir: info.dir,
				exists: info.exists,
				root: info.root,
			});
			break;
		}

		// Texture-path autocomplete from real disk contents.
		case 'texture_autocomplete': {
			send('texture_autocomplete', { list: packs.autocompleteDirectory(message.path) });
			break;
		}

		// Resolve a referenced sub-particle by identifier (project bundle first, then packs).
		case 'request_particle_file': {
			let content = projectParticles[message.identifier] || null;
			if (!content) {
				let match = packs.findParticleByIdentifier(message.identifier);
				content = match ? match.content : null;
			}
			send('provide_particle_file', {
				request_id: message.request_id,
				content,
			});
			break;
		}

		case 'open_particle_file_tab': {
			let match = packs.findParticleByIdentifier(message.identifier);
			if (match) openParticleFile(match.path);
			break;
		}

		// User clicked "Locate texture…" — pick a PNG and copy it to the expected path.
		case 'locate_texture': {
			let info = packs.expectedTexturePath(message.path, currentFilePath);
			if (!info.abs) {
				dialog.showErrorBox('No pack wired', 'Open a folder first (File → Open Folder…).');
				return;
			}
			let picked = dialog.showOpenDialogSync(mainWindow, {
				title: 'Locate texture for ' + message.path,
				filters: [{ name: 'Image', extensions: ['png', 'tga'] }],
				properties: ['openFile'],
			});
			if (picked && picked[0]) {
				try {
					if (!fs.existsSync(info.dir)) fs.mkdirSync(info.dir, { recursive: true });
					fs.copyFileSync(picked[0], info.abs);
					send('request_save_texture');
					send('reload_texture');
				} catch (err) {
					dialog.showErrorBox('Copy failed', String(err));
				}
			}
			break;
		}

		case 'link': {
			if (message.link) shell.openExternal(message.link);
			break;
		}

		case 'view_code': {
			openInVSCode();
			break;
		}
	}
});

function pathToFileUrl(p) {
	let normalized = p.replace(/\\/g, '/');
	if (!normalized.startsWith('/')) normalized = '/' + normalized;
	return 'file://' + encodeURI(normalized);
}

app.whenReady().then(() => {
	persistedState = {};
	packs.init(app.getPath('userData'));
	createWindow();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

// Expose for the menu module's "Open Particle from pack" entries.
module.exports = { openParticleFile };
