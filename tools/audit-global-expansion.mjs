#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readRecordSet } from './data-loader.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const manifest = JSON.parse(readFileSync(path.join(root, 'docs', 'global-meal-expansion-candidates.json'), 'utf8'));
const mealsPayload = readRecordSet(root, 'data/meals', 'meals');
const ingredientsPayload = readRecordSet(root, 'data/ingredients', 'ingredients');
const errors = [];

function fail(message) {
  errors.push(message);
}

function duplicateIds(records) {
  const seen = new Set();
  const duplicates = new Set();
  for (const record of records) {
    if (seen.has(record.id)) duplicates.add(record.id);
    seen.add(record.id);
  }
  return [...duplicates].sort();
}

if (mealsPayload.meals.length !== 520) fail(`expected 520 meals, found ${mealsPayload.meals.length}`);
if (manifest.finalMeals !== 520) fail(`candidate manifest finalMeals must be 520, found ${manifest.finalMeals}`);
if (manifest.generatedMeals !== 408) fail(`candidate manifest generatedMeals must be 408, found ${manifest.generatedMeals}`);

const duplicateMealIds = duplicateIds(mealsPayload.meals);
if (duplicateMealIds.length > 0) fail(`duplicate meal ids: ${duplicateMealIds.join(', ')}`);
const duplicateIngredientIds = duplicateIds(ingredientsPayload.ingredients);
if (duplicateIngredientIds.length > 0) fail(`duplicate ingredient ids: ${duplicateIngredientIds.join(', ')}`);

for (const meal of mealsPayload.meals) {
  const coverPath = meal.images?.[0]?.path;
  if (!coverPath) fail(`${meal.id} missing primary cover metadata`);
  else if (!existsSync(path.join(root, coverPath))) fail(`${meal.id} missing cover file ${coverPath}`);
  if (meal.status === 'approved' && meal.images?.[0]?.reviewStatus !== 'approved') {
    fail(`${meal.id} primary cover is not approved`);
  }
}

for (const ingredient of ingredientsPayload.ingredients) {
  const imagePath = ingredient.images?.[0]?.path;
  if (!imagePath) fail(`${ingredient.id} missing primary ingredient image metadata`);
  else if (!existsSync(path.join(root, imagePath))) fail(`${ingredient.id} missing ingredient image file ${imagePath}`);
}

const generatedByBucket = manifest.candidates.reduce((counts, candidate) => {
  counts[candidate.cuisineBucket] = (counts[candidate.cuisineBucket] ?? 0) + 1;
  return counts;
}, {});

const expectedGeneratedDistribution = {
  asian_east_southeast: 58,
  western_european_north_american: 170,
  latin_american: 45,
  caribbean: 20,
  south_asian: 45,
  middle_eastern: 30,
  north_african: 15,
  african: 25
};

for (const [bucket, expected] of Object.entries(expectedGeneratedDistribution)) {
  if (generatedByBucket[bucket] !== expected) {
    fail(`${bucket} generated count expected ${expected}, found ${generatedByBucket[bucket] ?? 0}`);
  }
}

if (errors.length > 0) {
  console.error(`Global expansion audit failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Global expansion audit passed: ${mealsPayload.meals.length} meals, ${ingredientsPayload.ingredients.length} ingredients.`);
console.log(`Generated distribution: ${JSON.stringify(generatedByBucket)}`);
