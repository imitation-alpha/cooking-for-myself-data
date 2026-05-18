#!/usr/bin/env node
// Assembles the deployable static site into _site/. Run after `npm test` so
// dist/app-seed.json exists. Used identically by local `npm run build:site`
// and the GitHub Pages workflow, so local and CI output stay in lockstep.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(root, '_site');

const seed = path.join(root, 'dist', 'app-seed.json');
if (!existsSync(seed)) {
  console.error('Missing dist/app-seed.json — run `npm test` (or `npm run export:app-seed`) first.');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Static SPA source.
cpSync(path.join(root, 'web'), out, { recursive: true });
// Generated dataset the SPA fetches at runtime.
cpSync(seed, path.join(out, 'app-seed.json'));
// Shared validator imported by the add-a-meal form (must sit next to app.js).
cpSync(path.join(root, 'tools', 'validation-core.mjs'), path.join(out, 'validation-core.mjs'));
// Real image binaries (the Pages workflow checks out with lfs:true so these are
// resolved blobs, not LFS pointers).
cpSync(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
// License for the site footer link.
cpSync(path.join(root, 'LICENSE'), path.join(out, 'LICENSE'));
// Disable Jekyll so files/dirs are served verbatim.
writeFileSync(path.join(out, '.nojekyll'), '');

console.log('Built site: ' + path.relative(root, out) + '/');
