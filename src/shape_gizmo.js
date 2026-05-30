/*
 * Spawn-shape outline gizmo.
 *
 * Draws wireframe vector lines in the viewport showing where the emitter's spawn shape ends, so you
 * can see the spawn volume without waiting for particles. It evaluates the same Molang values the
 * simulation uses (emitter.calculate on emitter_shape_*), parented into emitter.getActiveSpace() so
 * it lines up with where particles actually appear. Recomputed via EditListeners on change.
 */
import * as THREE from 'three';

const SHAPE_COLOR = 0x8be0ff;
const POINT_COLOR = 0xffc857;

function lineMaterial(color) {
	return new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 });
}

// Two unit axes perpendicular to a normal (for drawing the disc ring).
function perpendicularBasis(normal) {
	let n = normal && normal.lengthSq && normal.lengthSq() > 1e-8 ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
	let ref = Math.abs(n.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
	let u = new THREE.Vector3().crossVectors(ref, n).normalize();
	let v = new THREE.Vector3().crossVectors(n, u).normalize();
	return { u, v };
}

class ShapeGizmoGizmo {
	constructor() {
		this.group = new THREE.Group();
		this.group.name = 'shape_gizmo';
		this.emitter = null;
		this.show = false;
	}
	setEmitter(emitter) {
		this.emitter = emitter;
	}
	setShow(value) {
		this.show = value;
		this.update();
	}
	get active() {
		return this.show;
	}
	clear() {
		for (let child of this.group.children.slice()) {
			this.group.remove(child);
			if (child.geometry) child.geometry.dispose();
			if (child.material) child.material.dispose();
		}
	}
	reparent() {
		let space = this.emitter && this.emitter.getActiveSpace && this.emitter.getActiveSpace();
		if (space && this.group.parent !== space) {
			if (this.group.parent) this.group.parent.remove(this.group);
			space.add(this.group);
		}
	}
	calc(input, fallback) {
		try {
			let v = this.emitter.calculate(input, this.emitter.params());
			return (v === undefined || v === null) ? fallback : v;
		} catch (e) {
			return fallback;
		}
	}
	addWire(geometry, color) {
		let wire = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), lineMaterial(color));
		this.group.add(wire);
		geometry.dispose();
	}
	update() {
		this.clear();
		if (!this.emitter || !this.active || !this.emitter.initialized) return;
		this.reparent();

		let config = this.emitter.config;
		let mode = config.emitter_shape_mode || 'point';
		let offsetVal = this.calc(config.emitter_shape_offset, null);
		let offset = (offsetVal && offsetVal.isVector3) ? offsetVal.clone() : new THREE.Vector3(0, 0, 0);
		this.group.position.set(0, 0, 0); // wires positioned absolutely below

		if (mode === 'point') {
			let s = 0.25;
			let pts = [
				new THREE.Vector3(-s, 0, 0), new THREE.Vector3(s, 0, 0),
				new THREE.Vector3(0, -s, 0), new THREE.Vector3(0, s, 0),
				new THREE.Vector3(0, 0, -s), new THREE.Vector3(0, 0, s),
			].map(p => p.add(offset));
			let geo = new THREE.BufferGeometry().setFromPoints(pts);
			this.group.add(new THREE.LineSegments(geo, lineMaterial(POINT_COLOR)));

		} else if (mode === 'sphere') {
			let r = Number(this.calc(config.emitter_shape_radius, 1)) || 1;
			let geo = new THREE.SphereGeometry(r, 20, 14);
			let wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), lineMaterial(SHAPE_COLOR));
			wire.position.copy(offset);
			this.group.add(wire);
			geo.dispose();

		} else if (mode === 'box') {
			let half = this.calc(config.emitter_shape_half_dimensions, null);
			let hx = half && half.isVector3 ? half.x : 1;
			let hy = half && half.isVector3 ? half.y : 1;
			let hz = half && half.isVector3 ? half.z : 1;
			let geo = new THREE.BoxGeometry(Math.max(hx * 2, 0.001), Math.max(hy * 2, 0.001), Math.max(hz * 2, 0.001));
			let wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), lineMaterial(SHAPE_COLOR));
			wire.position.copy(offset);
			this.group.add(wire);
			geo.dispose();

		} else if (mode === 'entity_aabb') {
			let geo = new THREE.BoxGeometry(1, 2, 1); // approximate entity bounds
			let wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), lineMaterial(SHAPE_COLOR));
			wire.position.copy(offset).add(new THREE.Vector3(0, 1, 0));
			this.group.add(wire);
			geo.dispose();

		} else if (mode === 'disc') {
			let r = Number(this.calc(config.emitter_shape_radius, 1)) || 1;
			let normal = this.calc(config.emitter_shape_plane_normal, null);
			let { u, v } = perpendicularBasis(normal && normal.isVector3 ? normal : new THREE.Vector3(0, 1, 0));
			let pts = [];
			let N = 48;
			for (let i = 0; i <= N; i++) {
				let a = (i / N) * Math.PI * 2;
				pts.push(offset.clone()
					.addScaledVector(u, Math.cos(a) * r)
					.addScaledVector(v, Math.sin(a) * r));
			}
			let geo = new THREE.BufferGeometry().setFromPoints(pts);
			this.group.add(new THREE.Line(geo, lineMaterial(SHAPE_COLOR)));
		}
	}
}

export const ShapeGizmo = new ShapeGizmoGizmo();
if (typeof window !== 'undefined') window.ShapeGizmo = ShapeGizmo;
export default ShapeGizmo;
