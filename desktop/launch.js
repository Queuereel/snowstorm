/*
 * Launches the Electron GUI for Snowstorm.
 *
 * Some environments set ELECTRON_RUN_AS_NODE=1, which forces the electron binary to behave as a
 * plain Node process (no window, and require('electron') returns a path string instead of the
 * API). We strip that variable for the child so the GUI always starts. Run via `node desktop/launch.js`.
 */
const { spawn } = require('child_process');
const path = require('path');
const electronBinary = require('electron'); // resolves to the electron executable path

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(
	electronBinary,
	[path.join(__dirname, 'main.js'), ...process.argv.slice(2)],
	{ stdio: 'inherit', env }
);

child.on('close', (code) => process.exit(code));
