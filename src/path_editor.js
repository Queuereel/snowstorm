/*
 * 3D Path editor.
 *
 * Lets you shape a particle's motion by dragging control points directly in the viewport. The path
 * is represented as Catmull-Rom position curves (variable.se_path_x/y/z) written into the particle's
 * *parametric* motion, so dragging a handle edits real curve nodes that show up live in the Motion
 * and Variables & Curves tabs. Entering the mode on a dynamic particle first traces its current
 * trajectory and converts it to an equivalent editable path; on a particle that already uses this
 * editor's curves it loads the existing nodes. Optional per-point thickness writes a size curve.
 *
 * Interaction (raycasting, drag planes, wheel) is driven from components/Preview.vue; this module
 * owns the geometry, the config writeback, and the math.
 */
import * as THREE from 'three';
import Wintersky from 'wintersky';
import { Config } from './emitter';
import registerEdit from './edits';
import { bumpRefresh } from './ui_refresh';

const HANDLE_COLOR = 0x4fd6ff;
const HANDLE_HOVER = 0xffc857;
const PATH_COLOR = 0x9fe8ff;
const HANDLE_RADIUS = 0.35;
const DEFAULT_POINTS = 6;
const CURVE_X = 'variable.se_path_x';
const CURVE_Y = 'variable.se_path_y';
const CURVE_Z = 'variable.se_path_z';
const CURVE_SIZE = 'variable.se_path_size';
const ACC_X = 'variable.se_acc_x';
const ACC_Y = 'variable.se_acc_y';
const ACC_Z = 'variable.se_acc_z';
const MAX_SOLVE_NODES = 120; // cap on acceleration-curve resolution

function removeFromArray(array, item) {
	let i = array.indexOf(item);
	if (i >= 0) array.splice(i, 1);
}

class PathEditorClass {
	constructor() {
		this.group = new THREE.Group();
		this.group.name = 'path_editor';
		this.emitter = null;
		this.active = false;
		this.points = [];        // THREE.Vector3 control points (local space)
		this.thickness = [];     // per-point size (blocks); only written if the user adjusts it
		this.thicknessTouched = false;
		this.handles = [];       // handle meshes
		this.line = null;        // path line
		this.hovered = -1;
	}
	setEmitter(emitter) { this.emitter = emitter; }
	get space() {
		return this.emitter && this.emitter.getActiveSpace ? this.emitter.getActiveSpace() : null;
	}
	reparent() {
		let s = this.space;
		if (s && this.group.parent !== s) {
			if (this.group.parent) this.group.parent.remove(this.group);
			s.add(this.group);
		}
	}

	setActive(value) {
		if (value) this.enter(); else this.exit();
	}
	enter() {
		if (!this.emitter || !this.emitter.initialized) return;
		// Dynamic mode: produce real acceleration curves + speed + drag (same style as aurora2),
		// set spawn to a point so all particles start from the same place and follow the same curve.
		// This gives human-editable Molang numbers in Motion/Curves tabs just like a hand-crafted particle.
		this.targetMode = 'dynamic';
		// Store original spawn shape so exit() can restore it.
		this._origShapeMode = Config.emitter_shape_mode;
		this._origShapeOffset = Array.isArray(Config.emitter_shape_offset) ? [...Config.emitter_shape_offset] : ['0','0','0'];
		this._origSpeedMode = Config.particle_direction_mode;
		this._origSpeed = Config.particle_motion_linear_speed;
		this._origDir = Array.isArray(Config.particle_direction_direction) ? [...Config.particle_direction_direction] : ['0','1','0'];
		this._origAcc = Array.isArray(Config.particle_motion_linear_acceleration) ? [...Config.particle_motion_linear_acceleration] : ['0','0','0'];
		this.active = true;
		this.reparent();
		this.derivePoints();
		this.writeCurves();
		this.rebuildVisuals();
		this.commit();
	}
	exit() {
		// Restore original spawn shape (the acceleration curves + speed/direction remain as the edit).
		Config.emitter_shape_mode = this._origShapeMode || Config.emitter_shape_mode;
		if (this._origShapeOffset) Config.emitter_shape_offset = this._origShapeOffset;
		this.active = false;
		this.clearVisuals();
		if (window.refreshInputsFromConfig) window.refreshInputsFromConfig();
		if (window.Emitter) window.Emitter.start();
	}

	// ---- control points -----------------------------------------------------------------------
	derivePoints() {
		let cx = Config.curves[CURVE_X];
		if (cx && Array.isArray(cx.nodes) && cx.nodes.length >= 4
			&& Config.curves[CURVE_Y] && Config.curves[CURVE_Z]) {
			// Load existing path (un-pad the duplicated end nodes).
			let nx = cx.nodes, ny = Config.curves[CURVE_Y].nodes, nz = Config.curves[CURVE_Z].nodes;
			let pts = [];
			for (let i = 1; i < nx.length - 1; i++) {
				pts.push(new THREE.Vector3(Number(nx[i]) || 0, Number(ny[i]) || 0, Number(nz[i]) || 0));
			}
			this.points = pts.length >= 2 ? pts : this.tracePath();
		} else {
			this.points = this.tracePath();
		}
		if (!this.points || this.points.length < 2) this.points = this.defaultPath();
		let sz = this.currentSizeGuess();
		this.thickness = this.points.map(() => sz);
		this.thicknessTouched = false;
	}
	currentSizeGuess() {
		let s = Config.particle_appearance_size;
		if (Array.isArray(s)) { let n = parseFloat(s[0]); if (!isNaN(n) && n > 0) return n; }
		return 0.5;
	}
	defaultPath() {
		let pts = [];
		for (let i = 0; i < DEFAULT_POINTS; i++) {
			let t = i / (DEFAULT_POINTS - 1);
			pts.push(new THREE.Vector3((t - 0.5) * 4, Math.sin(t * Math.PI) * 2, 0));
		}
		return pts;
	}
	/** Trace the particle's current motion into ~DEFAULT_POINTS control points. */
	tracePath() {
		let emitter = this.emitter;
		let raw = [];
		let originalRunEvent = emitter.runEvent;
		emitter.runEvent = function () {};
		let probe = null;
		try {
			probe = new Wintersky.Particle(emitter);
			removeFromArray(emitter.particles, probe);
			if (probe.mesh && probe.mesh.parent) probe.mesh.parent.remove(probe.mesh);
			let lifetime = probe.lifetime || 1;
			this.lifetime = lifetime;
			let tick_rate = emitter.scene.global_options.tick_rate;
			let total = Math.min(Math.ceil(lifetime * tick_rate), 6000);
			let jump = emitter.config.particle_motion_mode !== 'parametric';
			raw.push(probe.position.clone());
			for (let i = 0; i < total; i++) {
				probe.tick(jump);
				raw.push(probe.position.clone());
				if (probe.age > lifetime) break;
			}
		} catch (e) {
			console.warn('Path trace failed', e);
		} finally {
			emitter.runEvent = originalRunEvent;
			if (probe) {
				removeFromArray(emitter.particles, probe);
				removeFromArray(emitter.dead_particles, probe);
				if (probe.mesh && probe.mesh.parent) probe.mesh.parent.remove(probe.mesh);
				if (probe.delete) probe.delete();
			}
		}
		return this.resample(raw, DEFAULT_POINTS);
	}
	resample(pts, count) {
		if (pts.length <= count) return pts.map(p => p.clone());
		let out = [];
		for (let i = 0; i < count; i++) {
			let idx = Math.round((i / (count - 1)) * (pts.length - 1));
			out.push(pts[idx].clone());
		}
		return out;
	}

	// ---- config writeback ---------------------------------------------------------------------
	paddedNodes(axis) {
		let vals = this.points.map(p => Number((axis === 'x' ? p.x : axis === 'y' ? p.y : p.z).toFixed(4)));
		// Duplicate the endpoints so the Catmull-Rom curve passes through the first/last point.
		return [vals[0], ...vals, vals[vals.length - 1]];
	}
	makeCurve(nodes) {
		return { type: 'catmull_rom', input: 'v.particle_age', horizontal_range: 'v.particle_lifetime', nodes: nodes };
	}
	writeCurves() {
		if (this.targetMode === 'parametric') this.writeParametric();
		else this.solveDynamic();
		if (this.thicknessTouched) {
			let sizeNodes = [this.thickness[0], ...this.thickness, this.thickness[this.thickness.length - 1]];
			Config.curves[CURVE_SIZE] = this.makeCurve(sizeNodes.map(n => Number(n)));
			Config.particle_appearance_size = [CURVE_SIZE, CURVE_SIZE];
		}
	}
	/** Parametric particles: the path IS the position, written directly as relative_position curves. */
	writeParametric() {
		Config.particle_motion_mode = 'parametric';
		Config.space_local_position = true; // parametric position only works in local space
		Config.particle_motion_relative_position = [CURVE_X, CURVE_Y, CURVE_Z];
		Config.curves[CURVE_X] = this.makeCurve(this.paddedNodes('x'));
		Config.curves[CURVE_Y] = this.makeCurve(this.paddedNodes('y'));
		Config.curves[CURVE_Z] = this.makeCurve(this.paddedNodes('z'));
	}
	/**
	 * Produce aurora2-style dynamic parameters from the drawn path.
	 * Wintersky integration per tick: a_eff = A(t) - drag*v ; v[i+1] = v[i] + a_eff*dt ; pos[i+1] = pos[i] + v[i+1]*dt
	 * Inverting: v[i+1] = (pos[i+1]-pos[i])/dt ; a_eff[i] = (v[i+1]-v[i])/dt ; A[i] = a_eff[i] + drag*v[i]
	 * Initial v[0]: solve from v[1] = v[0] + (A[0]-drag*v[0])*dt → v[0] = (v[1] - A[0]*dt)/(1-drag*dt)
	 * Stability constraint: drag*dt < 1 — cap dt so the Euler step doesn't blow up.
	 */
	solveDynamic() {
		let drag = parseFloat(Config.particle_motion_linear_drag_coefficient);
		if (!isFinite(drag) || drag < 0) drag = 0;
		let lifetime = this.lifetime || 1;
		// dt must satisfy drag*dt < 0.9 for Euler stability; cap node count for readability.
		let maxDt = drag > 0 ? 0.9 / drag : lifetime;
		let N = Math.max(4, Math.min(16, Math.ceil(lifetime / maxDt)));
		let dt = lifetime / N;

		let curve3 = new THREE.CatmullRomCurve3(this.points.map(p => p.clone()));
		let origin = this.points[0].clone(); // spawn offset (in emitter space)
		// pos[i] = position at time i*dt, relative to spawn
		let pos = [];
		for (let i = 0; i <= N; i++) pos.push(curve3.getPoint(i / N).sub(origin));

		// v[i] in Wintersky terms = pos[i] moved to via v[i+1]*dt, so v[i+1] = (pos[i+1]-pos[i])/dt
		let vel = [];
		for (let i = 0; i < N; i++) vel.push(pos[i + 1].clone().sub(pos[i]).multiplyScalar(1 / dt));

		// A[i] = (v[i+1]-v[i])/dt + drag*v[i]   (where vel[i] = v[i+1])
		let acc = [];
		for (let i = 0; i < N; i++) {
			let vCur = vel[i];                          // = v[i+1]
			let vNxt = i + 1 < vel.length ? vel[i + 1] : vel[i]; // = v[i+2]
			acc.push(vNxt.clone().sub(vCur).multiplyScalar(1 / dt).addScaledVector(vCur, drag));
		}

		// Exact initial velocity: v[0] = (v[1] - A[0]*dt) / (1 - drag*dt)
		let k = 1 - drag * dt;
		let v0 = Math.abs(k) > 0.05
			? vel[0].clone().sub(acc[0].clone().multiplyScalar(dt)).multiplyScalar(1 / k)
			: vel[0].clone(); // fallback for near-singular (shouldn't happen with stability constraint)
		let speed = v0.length();

		// Write Motion tab values (same fields visible in Snowstorm's Motion tab).
		Config.particle_motion_mode = 'dynamic';
		Config.particle_motion_linear_speed = String(Number(speed.toFixed(4)));
		Config.particle_direction_mode = 'direction';
		Config.particle_direction_direction = speed > 1e-6
			? [v0.x / speed, v0.y / speed, v0.z / speed].map(n => String(Number(n.toFixed(4))))
			: ['0', '1', '0'];

		// Acceleration curves per axis (same style as aurora2's variable.v).
		let nodesFor = (axis) => {
			let vals = acc.map(a => Number(a[axis].toFixed(4)));
			return [vals[0], ...vals, vals[vals.length - 1]]; // padded endpoints for Catmull-Rom
		};
		Config.curves[ACC_X] = this.makeCurve(nodesFor('x'));
		Config.curves[ACC_Y] = this.makeCurve(nodesFor('y'));
		Config.curves[ACC_Z] = this.makeCurve(nodesFor('z'));
		Config.particle_motion_linear_acceleration = [ACC_X, ACC_Y, ACC_Z];

		// Set spawn to a single point at path start so all particles follow the same curve.
		// (Wide spawn shapes scatter particles so each one goes a different direction.)
		Config.emitter_shape_mode = 'point';
		Config.emitter_shape_offset = [
			String(Number(origin.x.toFixed(3))),
			String(Number(origin.y.toFixed(3))),
			String(Number(origin.z.toFixed(3))),
		];
	}
	/** Cheap live update during a drag: mutate the curve nodes in place so the preview follows. */
	updateCurvesLive() {
		let set = (id, axis) => { if (Config.curves[id]) Config.curves[id].nodes = this.paddedNodes(axis); };
		set(CURVE_X, 'x'); set(CURVE_Y, 'y'); set(CURVE_Z, 'z');
		if (this.thicknessTouched && Config.curves[CURVE_SIZE]) {
			Config.curves[CURVE_SIZE].nodes = [this.thickness[0], ...this.thickness, this.thickness[this.thickness.length - 1]].map(Number);
		}
	}
	/** Commit to undo history and refresh every tab's numbers. */
	commit() {
		registerEdit('edit path');
		if (window.refreshInputsFromConfig) window.refreshInputsFromConfig();
		else bumpRefresh();
		if (window.Emitter) window.Emitter.start();
	}

	// ---- visuals ------------------------------------------------------------------------------
	rebuildVisuals() {
		this.clearVisuals();
		// Path line through the control points.
		if (this.points.length >= 2) {
			let curve = new THREE.CatmullRomCurve3(this.points.map(p => p.clone()));
			let pts = curve.getPoints(Math.max(20, this.points.length * 16));
			let geo = new THREE.BufferGeometry().setFromPoints(pts);
			this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: PATH_COLOR, transparent: true, opacity: 0.8 }));
			this.group.add(this.line);
		}
		// Handles.
		this.handles = [];
		for (let i = 0; i < this.points.length; i++) {
			let r = HANDLE_RADIUS * (this.thicknessTouched ? Math.max(0.6, this.thickness[i]) : 1);
			let mesh = new THREE.Mesh(
				new THREE.SphereGeometry(r, 16, 12),
				new THREE.MeshBasicMaterial({ color: i === this.hovered ? HANDLE_HOVER : HANDLE_COLOR })
			);
			mesh.position.copy(this.points[i]);
			mesh.userData.pathHandle = i;
			this.group.add(mesh);
			this.handles.push(mesh);
		}
	}
	clearVisuals() {
		for (let child of this.group.children.slice()) {
			this.group.remove(child);
			if (child.geometry) child.geometry.dispose();
			if (child.material) child.material.dispose();
		}
		this.handles = [];
		this.line = null;
	}

	// ---- interaction (called from Preview.vue) ------------------------------------------------
	get handleMeshes() { return this.handles; }
	setHovered(index) {
		if (index === this.hovered) return;
		this.hovered = index;
		this.handles.forEach((m, i) => m.material.color.setHex(i === index ? HANDLE_HOVER : HANDLE_COLOR));
	}
	/** Move control point `index` to a new local-space position (live, no commit). */
	dragTo(index, localPoint) {
		if (index < 0 || index >= this.points.length) return;
		this.points[index].copy(localPoint);
		this.handles[index].position.copy(localPoint);
		this.refitLine();
		this.updateCurvesLive();
	}
	refitLine() {
		if (!this.line || this.points.length < 2) return;
		let curve = new THREE.CatmullRomCurve3(this.points.map(p => p.clone()));
		let pts = curve.getPoints(Math.max(20, this.points.length * 16));
		this.line.geometry.setFromPoints(pts);
	}
	/** Adjust the thickness of a point (mouse wheel); positive delta = thicker. */
	adjustThickness(index, delta) {
		if (index < 0 || index >= this.points.length) return;
		this.thicknessTouched = true;
		this.thickness[index] = Math.max(0.05, (this.thickness[index] || 0.5) + delta);
		this.writeCurves();
		this.rebuildVisuals();
		this.commit();
	}
	/** Insert a new control point after `index`. */
	addPointAfter(index) {
		let a = this.points[index];
		let b = this.points[Math.min(index + 1, this.points.length - 1)];
		let mid = a.clone().add(b).multiplyScalar(0.5);
		this.points.splice(index + 1, 0, mid);
		this.thickness.splice(index + 1, 0, this.thickness[index] || 0.5);
		this.writeCurves();
		this.rebuildVisuals();
		this.commit();
	}
	removePoint(index) {
		if (this.points.length <= 2) return;
		this.points.splice(index, 1);
		this.thickness.splice(index, 1);
		this.writeCurves();
		this.rebuildVisuals();
		this.commit();
	}
	endDrag() {
		this.writeCurves();
		this.commit();
	}
}

export const PathEditor = new PathEditorClass();
if (typeof window !== 'undefined') window.PathEditor = PathEditor;
export default PathEditor;
