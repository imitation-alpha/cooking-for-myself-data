#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readRecordSet } from './data-loader.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const manifestPath = path.join(root, 'docs/global-meal-expansion-candidates.json');
const appSeedPath = path.resolve(root, '..', 'content/app-seed/recipes.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const appSeed = existsSync(appSeedPath) ? JSON.parse(readFileSync(appSeedPath, 'utf8')) : null;
const ingredients = readRecordSet(root, 'data/ingredients', 'ingredients').ingredients;
const meals = readRecordSet(root, 'data/meals', 'meals').meals;
const appSeedNutritionByIngredientId = new Map(
  (appSeed?.ingredients ?? [])
    .filter((ingredient) => ingredient.nutrition)
    .map((ingredient) => [ingredient.id, ingredient.nutrition])
);
const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
const mealById = new Map(meals.map((meal) => [meal.id, meal]));
const generatedIds = new Set((manifest.candidates ?? []).map((candidate) => candidate.id));
const errors = [];

const assumptionProfiles = {
  cooking_oil: {
    nutrientsPer100g: { kcal: 884, sodiumMg: 0 },
    unitWeights: [
      { unit: 'g', grams: 1 },
      { unit: 'tsp', grams: 4.5 },
      { unit: 'tbsp', grams: 13.5 }
    ]
  },
  added_salt: {
    nutrientsPer100g: { kcal: 0, sodiumMg: 38758 },
    unitWeights: [
      { unit: 'g', grams: 1 },
      { unit: 'pinch', grams: 0.36 },
      { unit: 'tsp', grams: 6 }
    ]
  }
};

function fail(message) {
  errors.push(message);
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function gramsForMeasure(measure, profile) {
  if (!measure || typeof measure !== 'object') return null;
  if (!finiteNonNegative(measure.quantity) || measure.quantity <= 0) return null;
  const unit = String(measure.unit ?? '').trim().toLowerCase();
  if (!unit) return null;
  if (unit === 'g' || unit === 'gram' || unit === 'grams') return measure.quantity;
  const match = (profile.unitWeights ?? []).find((entry) => String(entry.unit).trim().toLowerCase() === unit);
  if (!match || !finiteNonNegative(match.grams) || match.grams <= 0) return null;
  return measure.quantity * match.grams;
}

function nutritionProfileForIngredient(ingredient) {
  return ingredient?.nutrition ?? appSeedNutritionByIngredientId.get(ingredient?.id);
}

function validateProfile(owner, profile, { requireReviewed = false } = {}) {
  if (!profile || typeof profile !== 'object') {
    fail(`${owner} missing nutrition profile`);
    return;
  }
  if (profile.estimate !== true) fail(`${owner} nutrition must be marked estimate`);
  if (requireReviewed && profile.reviewStatus !== 'reviewed') fail(`${owner} nutrition must be reviewed`);
  if (!finiteNonNegative(profile.nutrientsPer100g?.kcal)) fail(`${owner} missing kcal per 100g`);
  if (!finiteNonNegative(profile.nutrientsPer100g?.sodiumMg)) fail(`${owner} missing sodiumMg per 100g`);
  if (!Array.isArray(profile.unitWeights) || profile.unitWeights.length === 0) {
    fail(`${owner} missing nutrition unitWeights`);
  }
}

function addNutrition(owner, profile, grams, totals) {
  if (!finiteNonNegative(profile.nutrientsPer100g?.kcal) || !finiteNonNegative(profile.nutrientsPer100g?.sodiumMg)) return;
  totals.kcal += grams / 100 * profile.nutrientsPer100g.kcal;
  totals.sodiumMg += grams / 100 * profile.nutrientsPer100g.sodiumMg;
  totals.steps += 1;
  if (totals.kcal > 2500) fail(`${owner} kcal estimate is outside a practical two-person dinner range`);
  if (totals.sodiumMg > 7000) fail(`${owner} sodium estimate is outside a practical two-person dinner range`);
}

for (const ingredient of ingredients) {
  if (ingredient.status === 'approved' && ingredient.provenance?.sourceName === 'CookingForMyself global 520 meal expansion') {
    validateProfile(`ingredient ${ingredient.id}`, ingredient.nutrition, { requireReviewed: true });
  }
}

for (const id of generatedIds) {
  const meal = mealById.get(id);
  if (!meal) {
    fail(`generated meal ${id} is missing`);
    continue;
  }
  if (meal.status !== 'approved') fail(`generated meal ${id} must be approved`);
  const totals = { kcal: 0, sodiumMg: 0, steps: 0 };
  for (const usage of meal.ingredients ?? []) {
    const ingredient = ingredientById.get(usage.ingredientId);
    if (!ingredient) {
      fail(`${id} references missing ingredient ${usage.ingredientId}`);
      continue;
    }
    const profile = nutritionProfileForIngredient(ingredient);
    validateProfile(`${id}/${usage.ingredientId}`, profile);
    const grams = gramsForMeasure(usage.measure, profile ?? {});
    if (grams === null) {
      fail(`${id}/${usage.ingredientId} missing computable structured measure`);
      continue;
    }
    addNutrition(`${id}/${usage.ingredientId}`, profile, grams, totals);
  }
  if (!Array.isArray(meal.nutritionAssumptions) || meal.nutritionAssumptions.length === 0) {
    fail(`${id} missing nutrition assumptions`);
  }
  for (const assumption of meal.nutritionAssumptions ?? []) {
    const profile = assumptionProfiles[assumption.kind];
    if (!profile) {
      fail(`${id} unsupported nutrition assumption ${assumption.kind}`);
      continue;
    }
    const grams = gramsForMeasure(assumption.measure, profile);
    if (grams === null) {
      fail(`${id}/${assumption.id ?? assumption.kind} missing computable assumption measure`);
      continue;
    }
    addNutrition(`${id}/${assumption.id ?? assumption.kind}`, profile, grams, totals);
  }
  if (totals.steps === 0) fail(`${id} did not produce nutrition calculation steps`);
  if (totals.kcal < 200) fail(`${id} kcal estimate is too low for a two-person meal`);
}

if (errors.length) {
  console.error(`Nutrition gate failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Nutrition gate passed: ${generatedIds.size} generated meals and generated ingredient nutrition profiles are computable.`);
