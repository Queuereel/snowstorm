/*
 * Trajectory preview gizmo.
 *
 * Draws, directly in the 3D viewport, the path a particle would travel over its lifetime — so you
 * can see where particles go without waiting out the emitter lifetime. It runs a side-effect-free
 * simulation that reuses Wintersky's own Particle physics (shape spawn, initial speed/direction,
 * dynamic acceleration + drag, parametric motion, and rotation — see node_modules/wintersky/src/
 * particle.js), then renders the sampled positions as poly-lines. Optionally it also draws short
 * tick marks along the path showing the particle's roll (rotation) at each sample.
 *
 * Two independent toggles drive it (wired to footer buttons in components/Preview.vue):
 *   - path:     show the full trajectory line(s)
 *   - rotation: show rotation ticks along the path
 */
import * as THREE from 'three';
import Wintersky from 'wintersky';

const PATH_COLOR = 0x4fd6ff;
const ROT_COLOR = 0xffc857;
const MAX_SIM_TICKS = 6000;      // hard cap on simulated ticks (~200s at 30 tick/s) so a runaway
                                 // lifetime can't freeze the UI
const MAX_POINTS = 400;          // cap on stored points per path; long paths are sub-sampled so a
                                 // 140s particle traces fully without a huge geometry
const ROTATION_TICK_EVERY = 4;   // draw a rotation tick every N samples
const ROTATION_TICK_LENGTH = 0.18;
const TEXTURE_EVERY = 6;         // stamp a textured sprite every N samples along the path
const TEXTURE_TINT = 0xbfe6ff;   // light tint so the texture preview reads as a ghost, not a live particle
const TEXTURE_OPACITY = 0.6;

function removeFromArray(array, item) {
	let index = array.indexOf(item);
	if (index >= 0) array.splice(index, 1);
}

/** Build two unit axes perpendicular to a forward direction (for drawing roll ticks). */
function perpendicularBasis(forward) {
	let f = forward && forward.lengthSq() > 1e-8 ? forward.clone().normalize() : new THREE.Vector3(0, 0, 1);
	let ref = Math.abs(f.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
	let u = new THREE.Vector3().crossVectors(ref, f).normalize();
	let v = new THREE.Vector3().crossVectors(f, u).normalize();
	return { u, v, f };
}

class TrajectoryGizmo {
	constructor() {
		this.group = new THREE.Group();
		this.group.name = 'trajectory_gizmo';
		this.emitter = null;
		this.show_path = false;
		this.show_rotation = false;
		this.show_texture = false;
		this.sample_count = 12;
	}
	setEmitter(emitter) {
		this.emitter = emitter;
	}
	setShowPath(value) {
		this.show_path = value;
		this.update();
	}
	setShowRotation(value) {
		this.show_rotation = value;
		this.update();
	}
	setShowTexture(value) {
		this.show_texture = value;
		this.update();
	}
	get active() {
		return this.show_path || this.show_rotation || this.show_texture;
	}
	clear() {
		for (let child of this.group.children.slice()) {
			this.group.remove(child);
			if (child.geometry) child.geometry.dispose();
			if (child.material) child.material.dispose();
		}
	}
	/** Re-parent the gizmo to whichever space the emitter currently renders particles into. */
	reparent() {
		let space = this.emitter && this.emitter.getActiveSpace && this.emitter.getActiveSpace();
		if (space && this.group.parent !== space) {
			if (this.group.parent) this.group.parent.remove(this.group);
			space.add(this.group);
		}
	}
	/** Run one side-effect-free particle simulation, returning sampled positions/rotations/facings. */
	simulateOne() {
		let emitter = this.emitter;
		let tick_rate = emitter.scene.global_options.tick_rate;
		let points = [], rotations = [], facings = [];
		let size = [0.5, 0.5];

		// Neutralize events so the probe never spawns child effects / sounds / sub-emitters.
		let originalRunEvent = emitter.runEvent;
		emitter.runEvent = function () {};

		let probe = null;
		try {
			probe = new Wintersky.Particle(emitter); // constructor inits + ticks once
			// Detach immediately so it is never rendered or counted as a live particle.
			removeFromArray(emitter.particles, probe);
			if (probe.mesh.parent) probe.mesh.parent.remove(probe.mesh);

			// Representative billboard size for the texture preview.
			if (probe.size) {
				if (probe.size.isVector2) size = [probe.size.x, probe.size.y];
				else if (Array.isArray(probe.size)) size = [probe.size[0], probe.size[1]];
			}

			let lifetime = probe.lifetime || 1;
			// Simulate every tick for physics accuracy, but only store a point every `stride` ticks
			// so a very long-lived particle (e.g. 140s) traces its whole path with a bounded geometry.
			let total_ticks = Math.min(Math.ceil(lifetime * tick_rate) + 1, MAX_SIM_TICKS);
			let stride = Math.max(1, Math.ceil(total_ticks / MAX_POINTS));
			let jump = emitter.config.particle_motion_mode !== 'parametric';

			let record = () => {
				points.push(probe.position.clone());
				rotations.push(probe.rotation || 0);
				facings.push(probe.facing_direction.clone());
			};
			record(); // starting point

			for (let i = 0; i < total_ticks; i++) {
				probe.tick(jump);
				let last = (i === total_ticks - 1);
				if (i % stride === 0 || last) record();
				if (probe.age > lifetime) {
					if (!last) record(); // always capture the final position
					break;
				}
			}
		} catch (err) {
			console.warn('Trajectory simulation failed', err);
		} finally {
			emitter.runEvent = originalRunEvent;
			if (probe) {
				removeFromArray(emitter.particles, probe);
				removeFromArray(emitter.dead_particles, probe);
				if (probe.mesh && probe.mesh.parent) probe.mesh.parent.remove(probe.mesh);
				probe.delete();
			}
		}
		return { points, rotations, facings, size };
	}
	update() {
		this.clear();
		if (!this.emitter || !this.active) return;
		// The emitter must be initialized (active_time etc. set in start()).
		if (!this.emitter.initialized) return;

		this.reparent();

		let path_positions = [];
		// Shared sprite material for the texture preview (the live particle texture, lightly tinted).
		let texMaterial = null;
		if (this.show_texture) {
			let texture = this.emitter.config && this.emitter.config.texture;
			if (texture) {
				texMaterial = new THREE.SpriteMaterial({
					map: texture, color: TEXTURE_TINT, transparent: true,
					opacity: TEXTURE_OPACITY, depthWrite: false,
				});
			}
		}

		for (let s = 0; s < this.sample_count; s++) {
			let { points, rotations, facings, size } = this.simulateOne();
			if (points.length < 2) continue;

			if (this.show_path) {
				let geometry = new THREE.BufferGeometry().setFromPoints(points);
				let material = new THREE.LineBasicMaterial({ color: PATH_COLOR, transparent: true, opacity: 0.6 });
				this.group.add(new THREE.Line(geometry, material));
			}

			if (texMaterial) {
				for (let i = 0; i < points.length; i += TEXTURE_EVERY) {
					let sprite = new THREE.Sprite(texMaterial);
					sprite.position.copy(points[i]);
					sprite.scale.set(size[0] || 0.5, size[1] || 0.5, 1);
					this.group.add(sprite);
				}
			}

			if (this.show_rotation) {
				for (let i = 0; i < points.length; i += ROTATION_TICK_EVERY) {
					let { u, v } = perpendicularBasis(facings[i]);
					let angle = rotations[i] || 0;
					let dir = u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v, Math.sin(angle));
					let half = dir.multiplyScalar(ROTATION_TICK_LENGTH / 2);
					path_positions.push(
						points[i].clone().sub(half),
						points[i].clone().add(half)
					);
				}
			}
		}

		if (this.show_rotation && path_positions.length) {
			let geometry = new THREE.BufferGeometry().setFromPoints(path_positions);
			let material = new THREE.LineBasicMaterial({ color: ROT_COLOR, transparent: true, opacity: 0.85 });
			this.group.add(new THREE.LineSegments(geometry, material));
		}
	}
}

export const Trajectory = new TrajectoryGizmo();
if (typeof window !== 'undefined') window.Trajectory = Trajectory;
export default Trajectory;
