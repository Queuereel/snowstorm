/*
 * Native application menu for the Snowstorm desktop app.
 * Provides File actions and a Packs menu listing particles discovered across wired pack folders.
 */
const { Menu } = require('electron');

function buildMenu(opts) {
	const {
		packs,
		onRemovePack,
		onOpenParticle,
		onOpenParticlePath,
		onNewParticle,
		onSave,
		onReveal,
		onToggleDevTools,
		onOpenFolder,
		onOpenProject,
		onExportProject,
	} = opts;

	// Build the "Packs" menu from particles found in each wired root.
	let packGroups = packs.listParticles();
	let packsSubmenu;
	if (packGroups.length === 0) {
		packsSubmenu = [{ label: 'No folders open — File ▸ Open Folder…', enabled: false }];
	} else {
		packsSubmenu = packGroups.map(group => ({
			label: group.name + '  (' + group.particles.length + ')',
			submenu: [
				...group.particles.slice(0, 200).map(p => ({
					label: p.label,
					click: () => onOpenParticlePath(p.path),
				})),
				...(group.particles.length === 0
					? [{ label: '(no particles found)', enabled: false }]
					: []),
				{ type: 'separator' },
				{ label: 'Remove this pack', click: () => onRemovePack(group.root) },
			],
		}));
	}

	const template = [
		{
			label: 'File',
			submenu: [
				{ label: 'New Particle…', accelerator: 'CmdOrCtrl+N', click: onNewParticle },
				{ label: 'Open Particle…', accelerator: 'CmdOrCtrl+O', click: onOpenParticle },
				{ label: 'Open Folder…', accelerator: 'CmdOrCtrl+Shift+O', click: onOpenFolder },
				{ label: 'Open Project (.snow)…', click: onOpenProject },
				{ type: 'separator' },
				{ label: 'Save', accelerator: 'CmdOrCtrl+S', click: onSave },
				{ label: 'Save Project As (.snow)…', accelerator: 'CmdOrCtrl+Shift+S', click: onExportProject },
				{ label: 'Reveal Current File', click: onReveal },
				{ type: 'separator' },
				{ role: 'quit' },
			],
		},
		{
			label: 'Edit',
			submenu: [
				{ role: 'undo' },
				{ role: 'redo' },
				{ type: 'separator' },
				{ role: 'cut' },
				{ role: 'copy' },
				{ role: 'paste' },
				{ role: 'selectAll' },
			],
		},
		{
			label: 'Packs',
			submenu: packsSubmenu,
		},
		{
			label: 'View',
			submenu: [
				{ role: 'reload' },
				{ role: 'forceReload' },
				{ label: 'Toggle Developer Tools', accelerator: 'F12', click: onToggleDevTools },
				{ type: 'separator' },
				{ role: 'resetZoom' },
				{ role: 'zoomIn' },
				{ role: 'zoomOut' },
				{ type: 'separator' },
				{ role: 'togglefullscreen' },
			],
		},
	];

	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildMenu };
