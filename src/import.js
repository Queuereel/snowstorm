import {guid, IO, pathToExtension} from './util'
import {Config, QuickSetup, Emitter} from './emitter'
import vscode from './vscode_extension'
import {ExpandedInput} from './components/ExpressionBar'
import Data, {forEachInput} from './input_structure'
import {View} from './components/Preview'

import FireSample from '../examples/fire.particle.json'
import LoadingSample from '../examples/loading.particle.json'
import RainbowSample from '../examples/rainbow.particle.json'
import MagicSample from '../examples/magic.particle.json'
import RainSample from '../examples/rain.particle.json'
import SnowSample from '../examples/snow.particle.json'
import TrailSample from '../examples/trail.particle.json'
import BillboardSample from '../examples/billboard.particle.json'
import AuroraSample from '../examples/aurora.particle.json'
import AuroraWinterSample from '../examples/aurora_winter.particle.json'
import ExplosionSample from '../examples/explosion.particle.json'
import SmokePlumeSample from '../examples/smoke_plume.particle.json'
import PortalSwirlSample from '../examples/portal_swirl.particle.json'
import Curve from './curves'
import registerEdit, { setHistoryRestorer, resetHistory } from './edits'
import { Texture } from './texture_edit'
import ProjectStore from './project_store'


const Samples = {
	fire: FireSample,
	loading: LoadingSample,
	rainbow: RainbowSample,
	magic: MagicSample,
	rain: RainSample,
	snow: SnowSample,
	trail: TrailSample,
	billboard: BillboardSample,
	aurora: AuroraSample,
	aurora_winter: AuroraWinterSample,
	explosion: ExplosionSample,
	smoke_plume: SmokePlumeSample,
	portal_swirl: PortalSwirlSample,
}

function updateInputsFromConfig() {
	forEachInput(input => {
		input.value = Config[input.id];
		if (input.type == 'molang' && input.value) {
			let lineify = string => {
				if (typeof string == 'string' && string && string.includes(';')) {
					input.expanded = true;
					return string.replace(/;\s*/g, ';\n').replace(/\n+$/, '');
				} else {
					return string;
				}
			}
			if (input.value instanceof Array) {
				input.value.forEach((v, i) => {
					input.value[i] = lineify(v);
				})
			} else {
				input.value = lineify(input.value);
			}
		}
		input.update(Data);
	})
	Data.variables.curves.curves.splice(0, Infinity);
	for (let id in Config.curves) {
		let data = Config.curves[id];
		let curve = new Curve(data);
		curve.inputs.id.value = id;
		Data.variables.curves.curves.push(curve);
		Config.curves[id] = curve.config;
		curve.updateMinMax();
	}
	Data.events.events.events.splice(0);
	for (let id in Config.events) {
		let event = Config.events[id];
		let entry = {
			uuid: guid(), id, event
		};
		Data.events.events.events.push(entry);
	}

	Data.effect.meta.inputs.identifier.onchange();

	View.updateVariablePlaceholderList();
}
//function importFile() {}
function updateConfig(data) {
	// Reset first: Wintersky's setFromJSON *merges* events/curves/event-triggers onto the existing
	// config instead of replacing them, so without this, switching particles would carry over the
	// previous particle's events and curves. (loadFile resets via startNewProject; the project-panel
	// switch path calls updateConfig directly, so it must reset here.)
	Config.reset();
	Config.unsupported_fields = {};
	Config.setFromJSON(data);

	if (data.particle_effect) {
		Config.unsupported_fields.events = data.particle_effect.events;
		Config.unsupported_fields.emitter_lifetime_events = data.particle_effect.components['minecraft:emitter_lifetime_events'];
		Config.unsupported_fields.particle_lifetime_events = data.particle_effect.components['minecraft:particle_lifetime_events'];
		if (data.particle_effect.components['minecraft:particle_motion_collision']) {
			Config.unsupported_fields.collision_events = data.particle_effect.components['minecraft:particle_motion_collision'].events;
		}
	}

	updateInputsFromConfig();
}
// Let the undo/redo system restore a serialized particle without resetting the texture or playback.
setHistoryRestorer(updateConfig);
// Let the project store load a particle into the editor when switching between project entries.
ProjectStore.setLoader(updateConfig);

function loadFile(data, confirmNewProject=true) {
	if (data && data.particle_effect && (!confirmNewProject || startNewProject())) {
		Texture.reset();
		QuickSetup.resetAll();
		updateConfig(data);
		resetHistory();
		Emitter.stop(true);
		View.PlaybackController.start();
		registerEdit('load file')
	}
}

window.loadFileFromParentEffect = function (raw_json, texture_url) {
	loadFile(JSON.parse(raw_json), false);
	if (texture_url) {
		let input = Data.texture.texture.inputs.image;
		input.image.data = Texture.source = texture_url;
		input.image.loaded = true;
		Texture.updateCanvasFromSource();
		Config.updateTexture();
		Emitter.updateMaterial()
	}
}

function importFile() {
	IO.import({
		extensions: ['json']
	}, (files) => {
		if (files[0]) {
			loadFile(JSON.parse(files[0].content))
		}
	})
}
function startNewProject(force) {
	if (vscode || force || confirm('This action may clear your current work. Do you want to continue?')) {
		Config.unsupported_fields = {};
		Config.reset();
		Texture.reset();
		QuickSetup.resetAll();
		updateInputsFromConfig();
		registerEdit('new file')
		return true;
	}
}

document.addEventListener('readystatechange', () => {
	Emitter.start();
	View.PlaybackController.start();
	resetHistory();
});

function loadPreset(id) {
	loadFile(Samples[id])
}


if (vscode) {
	
	async function confirmSystemSetup() {
	}

    async function updateContent(text) {
        if (text && typeof text == 'string') {

			await confirmSystemSetup()

			let parsed = JSON.parse(text)
			updateConfig(parsed, true)
			resetHistory()
			if (ExpandedInput.input) {
				ExpandedInput.input.focus()
			}
        }
    }

    window.addEventListener('message', event => {
		const message = event.data; // The json data that the extension sent
		switch (message.type) {
			case 'update':
				const text = message.text;

				updateContent(text);

				vscode.setState({ text });

				return;
		}
    });
    
    const state = vscode.getState();
	if (state) {
		updateContent(state.text);
	}
} else {
	document.ondragover = function(event) {
		event.preventDefault()
	}
	document.body.ondrop = function(event) {
		var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
		if (file) {
			if (pathToExtension(file.name) === 'json') {
				var reader = new FileReader()
				reader.onloadend = function() {
	
					loadFile(JSON.parse(reader.result))
					View.PlaybackController.start();
				}
				reader.readAsText(file)
				event.preventDefault()
			}
		}
	}
}
	

export {
	importFile,
	loadFile,
	loadPreset,
	startNewProject
}
