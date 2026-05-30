/*
 * Guided presets — "pick a pattern or use your own" helpers for the fiddly sections.
 *
 * Each preset fills several inputs with a correct, Bedrock-sane combination and carries a one-line
 * explanation. Selecting "Custom" changes nothing (leaves the user's own values). Applying a preset
 * sets the inputs through the normal Input.set() path, then fires one registerEdit so the change is
 * buffered/undoable, and restarts playback so the preview reflects it immediately.
 */
import { Data } from './input_structure';
import registerEdit from './edits';

function inputAt(path) {
	let parts = path.split('.');
	let section = Data[parts[0]] && Data[parts[0]][parts[1]];
	if (!section || !section.inputs) return null;
	return section.inputs[parts[2]] || null;
}

export function applyValues(map) {
	for (let path in map) {
		let input = inputAt(path);
		if (!input) continue;
		try { input.set(map[path]); } catch (e) { console.warn('preset set failed', path, e); }
	}
	registerEdit('apply preset');
	if (window.Emitter) window.Emitter.start();
}

export function applyPreset(preset) {
	if (preset && typeof preset.apply === 'function') preset.apply();
	else if (preset && preset.values) applyValues(preset.values);
}

// ---- Spawn presets (Emitter ▸ Spawn Amount + Emitter Lifetime) ------------------------------
export const SPAWN_PRESETS = [
	{
		id: 'one_shot',
		label: 'One-shot burst',
		explain: 'Bursts all particles at once, then stops. Emitter Lifetime = Once — required in Bedrock for one-shot effects (explosions, hits, pickups).',
		values: {
			'emitter.rate.mode': 'instant',
			'emitter.rate.amount': '20',
			'emitter.lifetime.mode': 'once',
			'emitter.lifetime.active_time': '0.25',
		},
	},
	{
		id: 'steady',
		label: 'Steady stream (looping)',
		explain: 'Emits continuously while active and loops forever. For fire, smoke, torches, ambient effects.',
		values: {
			'emitter.rate.mode': 'steady',
			'emitter.rate.rate': '4',
			'emitter.rate.maximum': '100',
			'emitter.lifetime.mode': 'looping',
			'emitter.lifetime.active_time': '1',
			'emitter.lifetime.sleep_time': '0',
		},
	},
	{
		id: 'manual_event',
		label: 'Event-driven (manual)',
		explain: 'For child effects fired by events. The parent effect emits these via an event subpart of type "Particle".',
		values: {
			'emitter.rate.mode': 'manual',
			'emitter.rate.maximum': '100',
			'emitter.lifetime.mode': 'once',
			'emitter.lifetime.active_time': '1',
		},
	},
	{
		id: 'timed_burst',
		label: 'Timed burst loop',
		explain: 'Emits in bursts: active briefly, then sleeps, repeating. Good for pulsing effects.',
		values: {
			'emitter.rate.mode': 'steady',
			'emitter.rate.rate': '20',
			'emitter.rate.maximum': '200',
			'emitter.lifetime.mode': 'looping',
			'emitter.lifetime.active_time': '0.5',
			'emitter.lifetime.sleep_time': '2',
		},
	},
];

// ---- UV presets (Texture ▸ UV) --------------------------------------------------------------
export const UV_PRESETS = [
	{
		id: 'static_frame',
		label: 'Static frame',
		explain: 'One fixed part of the texture is shown on every particle.',
		values: {
			'texture.uv.mode': 'static',
			'texture.uv.uv': [0, 0],
			'texture.uv.uv_size': [16, 16],
		},
	},
	{
		id: 'random_frame',
		label: 'Random frame',
		explain: 'Each particle shows a random frame from the top row (uses math.random_integer).',
		values: {
			'texture.uv.mode': 'static',
			'texture.uv.uv': ['math.random_integer(0, 3) * 16', '0'],
			'texture.uv.uv_size': [16, 16],
		},
	},
	{
		id: 'play_once',
		label: 'Play once over lifetime',
		explain: 'Plays the flipbook once, stretched across the particle\'s lifetime.',
		values: {
			'texture.uv.mode': 'animated',
			'texture.uv.uv': [0, 0],
			'texture.uv.uv_size': [16, 16],
			'texture.uv.uv_step': [16, 0],
			'texture.uv.max_frame': '4',
			'texture.uv.frames_per_second': 10,
			'texture.uv.stretch_to_lifetime': true,
			'texture.uv.loop': false,
		},
	},
	{
		id: 'loop_anim',
		label: 'Loop animation',
		explain: 'Loops a flipbook animation at a fixed frame rate.',
		values: {
			'texture.uv.mode': 'animated',
			'texture.uv.uv': [0, 0],
			'texture.uv.uv_size': [16, 16],
			'texture.uv.uv_step': [16, 0],
			'texture.uv.max_frame': '4',
			'texture.uv.frames_per_second': 12,
			'texture.uv.stretch_to_lifetime': false,
			'texture.uv.loop': true,
		},
	},
	{
		id: 'scroll_x',
		label: 'Scroll sideways',
		explain: 'Scrolls the texture horizontally over time (variable.particle_age × speed).',
		values: {
			'texture.uv.mode': 'static',
			'texture.uv.uv': ['variable.particle_age * 8', '0'],
			'texture.uv.uv_size': [16, 16],
		},
	},
	{
		id: 'scroll_y',
		label: 'Scroll vertically',
		explain: 'Scrolls the texture vertically over time (variable.particle_age × speed).',
		values: {
			'texture.uv.mode': 'static',
			'texture.uv.uv': ['0', 'variable.particle_age * 8'],
			'texture.uv.uv_size': [16, 16],
		},
	},
];

/** A short warning for risky Bedrock combinations in the current Spawn config, or ''. */
export function spawnWarning() {
	let rateMode = inputAt('emitter.rate.mode');
	let lifeMode = inputAt('emitter.lifetime.mode');
	if (rateMode && lifeMode && rateMode.value === 'instant' && lifeMode.value === 'looping') {
		return 'Instant + Looping re-bursts every loop. For a single burst use Emitter Lifetime = Once.';
	}
	return '';
}
