#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const reviewDataPath = path.join(root, 'dist', 'review-data.json');
const sourceDir = path.join(root, 'review-site');
const outDir = path.join(root, '_review-site');

function readSource(file) {
  return readFileSync(path.join(sourceDir, file), 'utf8');
}

function scriptSafeJson(jsonText) {
  return jsonText.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

if (!existsSync(reviewDataPath)) {
  console.error('Missing dist/review-data.json. Run `npm run review:export` first.');
  process.exit(1);
}

const template = readSource('index.html');
const css = readSource('review.css');
const js = readSource('review.js');
const data = scriptSafeJson(readFileSync(reviewDataPath, 'utf8'));

const html = template
  .replace('/* __REVIEW_CSS__ */', css)
  .replace('"__REVIEW_DATA__"', data)
  .replace('// __REVIEW_JS__', js);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'index.html'), html);

console.log('Built review site: ' + path.relative(root, path.join(outDir, 'index.html')));
