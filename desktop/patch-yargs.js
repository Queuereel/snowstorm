#!/usr/bin/env node
// Works around a yargs@17.7.2 packaging bug: its package.json declares
// "type": "module", but node_modules/yargs/yargs (loaded by webpack-cli)
// is plain CommonJS (require/module.exports). Recent Node versions
// enforce the package "type" field strictly for extensionless files, so
// without this fix `npm run build` fails with:
//   ReferenceError: require is not defined in ES module scope
//
// Idempotent, chained into "postinstall" so a fresh `npm install` always
// self-heals - no manual step needed after cloning the repo.
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'node_modules', 'yargs', 'package.json');
if (!fs.existsSync(pkgPath)) process.exit(0);

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
if (pkg.type === 'module') {
    pkg.type = 'commonjs';
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log('Patched node_modules/yargs (type: module -> commonjs) - see desktop/patch-yargs.js');
}
