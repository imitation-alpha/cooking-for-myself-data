#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readRecordSet } from './data-loader.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const ingredientsPayload = readRecordSet(root, 'data/ingredients', 'ingredients');
const mealsPayload = readRecordSet(root, 'data/meals', 'meals');
const outDir = path.join(root, 'dist');
mkdirSync(outDir, { recursive: true });
const toAppNames = (names) => ({ zhHant: names.zhHant, cantonese: names.yue, zhHans: names.zhHans, english: names.en, japanese: names.ja ?? undefined, korean: names.ko ?? undefined, thai: names.th ?? undefined, vietnamese: names.vi ?? undefined, indonesian: names.id ?? undefined, tagalog: names.tl ?? undefined });
const payload = {
  generatedAt: new Date().toISOString(),
  source: 'cooking-for-myself-data',
  ingredients: ingredientsPayload.ingredients.filter((i) => i.status === 'approved').map((i) => ({ id: i.id, names: toAppNames(i.names), section: i.section, aliases: i.aliases, storeNotes: i.storeNotes.zhHant ?? i.storeNotes.en ?? '', substitutions: i.substitutions.zhHant ?? i.substitutions.en ?? '', tags: i.tags })),
  recipes: mealsPayload.meals.filter((m) => m.status === 'approved').map((m) => ({ id: m.id, names: toAppNames(m.names), summary: m.summary.zhHant ?? m.summary.en ?? '', timeMinutes: m.timeMinutes, difficulty: m.difficulty, servings: m.servings, ingredients: m.ingredients.map((u) => ({ ingredientId: u.ingredientId, amounts: toAppNames(u.amounts), amountZh: u.amounts.zhHant, amountEn: u.amounts.en })), tags: m.restrictionTags, steps: m.steps.map((s) => ({ instruction: toAppNames(s.detail), title: toAppNames(s.title) })), reason: m.reason.zhHant ?? m.reason.en ?? '', reviewStatus: 'reviewed', source: m.provenance, image: m.images[0] ? { assetPath: m.images[0].path, contentStyle: m.images[0].contentStyle, disclosure: m.images[0].disclosure, license: m.images[0].license, reviewStatus: m.images[0].reviewStatus } : null }))
};
const outPath = path.join(outDir, 'app-seed.json');
writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
console.log('Exported app seed: ' + path.relative(root, outPath));
