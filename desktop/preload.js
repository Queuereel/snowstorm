/*
 * Preload for the Snowstorm desktop app.
 *
 * Snowstorm already supports a "host" via the object returned by acquireVsCodeApi() (see
 * src/vscode_extension.js). By defining that function here, the bundled app switches into hosted
 * mode: it drops the browser Import/Download/upload UI, auto-saves on every edit, and asks the
 * host for textures and referenced particle files. The Electron main process plays the host.
 *
 * contextIsolation is disabled (see desktop/main.js) so this global is visible to dist/app.js
 * when it evaluates `typeof acquireVsCodeApi == 'function' && acquireVsCodeApi()` at load time.
 */
const { ipcRenderer } = require('electron');

let state = {};

window.acquireVsCodeApi = function () {
	return {
		postMessage(message) {
			ipcRenderer.send('host-message', message);
		},
		getState() {
			return state;
		},
		setState(newState) {
			state = newState;
			ipcRenderer.send('set-state', newState);
			return newState;
		},
	};
};

// Host -> renderer: re-dispatch as a window message so the app's existing
// `window.addEventListener('message', ...)` handlers fire unchanged.
ipcRenderer.on('renderer-message', (_event, data) => {
	window.postMessage(data, '*');
});

// Allow main to seed the persisted state before the app reads it.
ipcRenderer.on('init-state', (_event, data) => {
	state = data || {};
});
