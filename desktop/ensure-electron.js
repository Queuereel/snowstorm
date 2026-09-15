#!/usr/bin/env node
// Linux safety net for a flaky `extract-zip` (used internally by
// node_modules/electron/install.js): on some setups it silently extracts
// only a couple of files from the Electron release zip - e.g. just
// resources.pak - and still reports success, leaving
// node_modules/electron/dist/electron missing with no error anywhere.
// Every later step (launch, build, packaging) then fails confusingly.
//
// If that happened, re-extract the SAME already-downloaded/cached zip
// (resolved via @electron/get, exactly like install.js does, so the
// version/arch/cache lookup is identical) using the system `unzip`
// binary, which doesn't show the bug. Chained into "postinstall" after
// patch-yargs.js - a no-op whenever the normal install already worked.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

if (process.platform !== 'linux') process.exit(0);

const electronDir = path.join(__dirname, '..', 'node_modules', 'electron');
const distDir = path.join(electronDir, 'dist');
const binPath = path.join(distDir, 'electron');

if (fs.existsSync(binPath)) process.exit(0); // normal install already worked
if (!fs.existsSync(electronDir)) process.exit(0); // electron isn't installed at all; nothing to do here

const { version } = require(path.join(electronDir, 'package.json'));

async function main () {
    let downloadArtifact;
    try {
        ({ downloadArtifact } = require('@electron/get'));
    } catch {
        return; // not resolvable; leave it to install.js's own error message
    }

    let zipPath;
    try {
        zipPath = await downloadArtifact({
            version,
            artifactName: 'electron',
            cacheRoot: process.env.electron_config_cache,
            platform: 'linux',
            arch: process.env.npm_config_arch || process.arch,
        });
    } catch (err) {
        console.error('ensure-electron: could not resolve the Electron download:', err.message);
        return;
    }

    if (!fs.existsSync(binPath)) {
        console.log('ensure-electron: the Electron binary is still missing after install - '
            + 're-extracting the release zip with unzip...');
        fs.mkdirSync(distDir, { recursive: true });
        try {
            execFileSync('unzip', ['-o', zipPath, '-d', distDir], { stdio: 'inherit' });
        } catch {
            console.error('ensure-electron: `unzip` is not available - install it '
                + '(e.g. sudo pacman -S unzip) and run `npm install` again.');
            return;
        }
    }

    if (fs.existsSync(binPath)) {
        fs.chmodSync(binPath, 0o755);
        fs.writeFileSync(path.join(distDir, 'version'), `v${version}`);
        fs.writeFileSync(path.join(electronDir, 'path.txt'), 'electron');
        console.log('ensure-electron: Electron binary is in place.');
    }
}

main();
