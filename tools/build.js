#!/usr/bin/env node
/*
 * Build the deployed site: the app's own scripts and stylesheets become one file each, so a first visit
 * makes 2 requests instead of about 35. The source files are not changed; the repository still runs as is
 * (from file:// too).
 *
 *   node tools/build.js <outDir>
 *
 * Copies index.html, sw.js, manifest.webmanifest, icons, vendor and LICENSE into <outDir>, writes
 * <outDir>/js/nanocalc.<hash>.js and <outDir>/css/nanocalc.<hash>.css (in index.html order), and rewrites
 * <outDir>/index.html to load them. Vendored KaTeX stays separate (versioned path, cached by browsers).
 * The bundle is not minified (no build dependencies); GitHub Pages serves it gzip-compressed.
 * The service worker reads its file list from index.html, so it caches the bundles automatically.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, '_site'));

const copy = (rel) => fs.cpSync(path.join(root, rel), path.join(out, rel), { recursive: true });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'js'), { recursive: true });
fs.mkdirSync(path.join(out, 'css'), { recursive: true });
['sw.js', 'manifest.webmanifest', 'icons', 'vendor', 'LICENSE'].forEach(copy);

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>\n?/g)];
const styles = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)">\n?/g)];
if (!scripts.length || !styles.length) throw new Error('No app scripts or stylesheets found in index.html');

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
// Each classic script is wrapped as-is; a newline and semicolon between files keep them separate statements.
const js = scripts.map((m) => '/* ' + m[1] + ' */\n' + fs.readFileSync(path.join(root, m[1]), 'utf8')).join('\n;\n');
const css = styles.map((m) => '/* ' + m[1] + ' */\n' + fs.readFileSync(path.join(root, m[1]), 'utf8')).join('\n');
const jsName = 'js/nanocalc.' + hash(js) + '.js', cssName = 'css/nanocalc.' + hash(css) + '.css';
fs.writeFileSync(path.join(out, jsName), js);
fs.writeFileSync(path.join(out, cssName), css);

// replace the first app script/stylesheet tag with the bundle and drop the rest
let firstJs = true, firstCss = true;
html = html.replace(/<script src="js\/[^"]+"><\/script>\n?/g, () => { if (firstJs) { firstJs = false; return '<script src="' + jsName + '"></script>\n'; } return ''; });
html = html.replace(/<link rel="stylesheet" href="css\/[^"]+">\n?/g, () => { if (firstCss) { firstCss = false; return '<link rel="stylesheet" href="' + cssName + '">\n'; } return ''; });
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, '.nojekyll'), '');

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' kB';
const gz = (s) => (require('zlib').gzipSync(s).length / 1024).toFixed(0) + ' kB';
console.log('Built ' + path.relative(root, out) + ': ' + scripts.length + ' scripts → ' + jsName + ' (' + kb(js) + ', ' + gz(js) + ' gzipped); ' +
  styles.length + ' stylesheets → ' + cssName + ' (' + kb(css) + ', ' + gz(css) + ' gzipped)');
