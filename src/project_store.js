/*
 * Project store — the home base of the desktop workspace.
 *
 * Holds the open "project" (a wired folder, a .snow bundle, or a single loose file) as a list of
 * particles, and tracks per-particle edits in memory. Editing never touches disk; the host writes
 * only when the user presses Ctrl+S (see flush()). Switching particles is instant because every
 * particle's content is already in memory.
 *
 * Wiring (kept one-directional to avoid import cycles):
 *   - import.js registers the loader (updateConfig) via setLoader().
 *   - edits.js checks window.ProjectStore.active to buffer instead of auto-saving, and runs
 *     captureActiveEdit() through its EditListeners.
 */
import Vue from 'vue';
import { compileJSON } from './util';
import { generateFile } from './export';
import { resetHistory } from './edits';
import vscode from './vscode_extension';

let loader = null; // (parsedParticleJSON) => void  — set by import.js (updateConfig)

function serialize() {
	try {
		return compileJSON(generateFile());
	} catch (err) {
		return null;
	}
}

const state = Vue.observable({
	mode: 'none',     // 'none' | 'folder' | 'snow' | 'file'
	name: '',
	particles: [],    // { id, path, diskContent, baseline, buffer, dirty, loaded }
	activeId: null,
	search: '',
});

const ProjectStore = {
	state,

	get active() {
		return state.mode !== 'none' && state.particles.length > 0;
	},
	get activeParticle() {
		return state.particles.find(p => p.id === state.activeId) || null;
	},
	get dirtyCount() {
		return state.particles.filter(p => p.dirty).length;
	},

	setLoader(fn) {
		loader = fn;
	},

	/** Populate from a host project_list. items: [{id, path, content}]. */
	load({ mode, name, items, activeId }) {
		state.mode = mode || 'folder';
		state.name = name || '';
		state.particles = (items || []).map(it => ({
			id: it.id,
			path: it.path || null,
			diskContent: it.content || '',
			baseline: null,
			buffer: it.content || '',
			dirty: false,
			loaded: false,
			selected: false,
		}));
		state.activeId = null;
		let first = activeId && state.particles.find(p => p.id === activeId);
		let target = first || state.particles[0];
		if (target) this.setActive(target.id);
	},

	/** Switch the editor to a particle, preserving the current one's edits in its buffer. */
	setActive(id) {
		if (id === state.activeId) return;
		// Stash the current editor state into the outgoing particle's buffer.
		this._captureInto(this.activeParticle);

		let next = state.particles.find(p => p.id === id);
		if (!next) return;
		state.activeId = id;
		if (window.tex) window.tex.reset(); // clear the previous particle's painted texture
		if (loader) {
			try {
				loader(JSON.parse(next.buffer || next.diskContent));
			} catch (err) {
				console.warn('Failed to load particle', id, err);
			}
		}
		if (window.Emitter) window.Emitter.start(); // restart playback for the new effect
		// Refresh the preview gizmos so they show THIS particle, not the previous one.
		if (window.Trajectory && window.Trajectory.active) window.Trajectory.update();
		if (window.ShapeGizmo && window.ShapeGizmo.active) window.ShapeGizmo.update();
		// Establish the comparison baseline the first time a particle is opened.
		let normalized = serialize();
		if (!next.loaded) {
			next.baseline = normalized;
			next.buffer = normalized;
			next.dirty = false;
			next.loaded = true;
		} else {
			next.buffer = normalized;
			next.dirty = next.baseline != null && next.buffer !== next.baseline;
		}
		resetHistory();
		notifyHost(next);
	},

	/** Called on every edit (via edits.js EditListeners) to update the active buffer + dirty flag. */
	captureActiveEdit() {
		let p = this.activeParticle;
		if (!p) return;
		this._captureInto(p);
	},
	_captureInto(p) {
		if (!p) return;
		let snap = serialize();
		if (snap == null) return;
		p.buffer = snap;
		if (p.baseline == null) p.baseline = snap; // first edit before baseline set
		p.dirty = p.buffer !== p.baseline;
	},

	/** Mark a particle as saved (called after the host confirms a write). */
	markSaved(id) {
		let p = state.particles.find(x => x.id === id);
		if (!p) return;
		p.diskContent = p.buffer;
		p.baseline = p.buffer;
		p.dirty = false;
	},

	/** All current particle contents (for .snow rebuild). */
	allItems() {
		this.captureActiveEdit();
		return state.particles.map(p => ({ id: p.id, path: p.path, content: p.buffer, dirty: p.dirty }));
	},
	dirtyItems() {
		this.captureActiveEdit();
		// If any particles are checked, Save acts on those; otherwise on every changed particle.
		let checked = state.particles.filter(p => p.selected);
		let pool = checked.length ? checked : state.particles;
		return pool.filter(p => p.dirty).map(p => ({ id: p.id, path: p.path, content: p.buffer }));
	},

	get selectedCount() {
		return state.particles.filter(p => p.selected).length;
	},
	toggleSelected(id) {
		let p = state.particles.find(x => x.id === id);
		if (p) p.selected = !p.selected;
	},
	clearSelection() {
		state.particles.forEach(p => { p.selected = false; });
	},

	// Panel actions — ask the host to open a folder / .snow / create a particle.
	saveOne(id) {
		if (!vscode) return;
		this.captureActiveEdit();
		let p = state.particles.find(x => x.id === id);
		if (!p || !p.path) return;
		vscode.postMessage({ type: 'project_save', mode: 'folder', items: [{ id: p.id, path: p.path, content: p.buffer }] });
	},
	openFolder() { if (vscode) vscode.postMessage({ type: 'project_action', action: 'open_folder' }); },
	openSnow() { if (vscode) vscode.postMessage({ type: 'project_action', action: 'open_snow' }); },
	newParticle() { if (vscode) vscode.postMessage({ type: 'project_action', action: 'new' }); },
	save() { this.flush(); },
	exportSnow() {
		if (!vscode || !this.active) return;
		vscode.postMessage({ type: 'export_snow', mainId: state.activeId, items: this.allItems() });
	},

	setSearch(v) {
		state.search = v;
	},
	filteredParticles() {
		let q = state.search.trim().toLowerCase();
		if (!q) return state.particles;
		return state.particles.filter(p =>
			p.id.toLowerCase().includes(q) || (p.path || '').toLowerCase().includes(q)
		);
	},
};

// Let the host resolve textures/sub-particles relative to the active particle's location.
function notifyHost(particle) {
	if (vscode && particle && particle.path) {
		vscode.postMessage({ type: 'project_set_active', path: particle.path });
	}
}

/** Send the dirty (or all) particles to the host to be written. Triggered by Ctrl+S. */
ProjectStore.flush = function () {
	if (!vscode || !this.active) return;
	// Also flush a painted texture for the active particle.
	if (window.tex && window.tex.internal_changes && typeof window.tex.save === 'function') {
		window.tex.save();
	}
	if (state.mode === 'snow') {
		vscode.postMessage({ type: 'project_save', mode: 'snow', items: this.allItems() });
	} else {
		let items = this.dirtyItems();
		if (!items.length) return;
		vscode.postMessage({ type: 'project_save', mode: 'folder', items });
	}
};

// Host -> app: receive the project list and save confirmations.
window.addEventListener('message', event => {
	const m = event.data;
	if (!m) return;
	if (m.type === 'project_list') {
		ProjectStore.load(m);
	} else if (m.type === 'project_saved') {
		(m.written || []).forEach(id => ProjectStore.markSaved(id));
	} else if (m.type === 'trigger_save') {
		ProjectStore.save();
	} else if (m.type === 'trigger_export_snow') {
		ProjectStore.exportSnow();
	}
});

window.ProjectStore = ProjectStore;
export default ProjectStore;
