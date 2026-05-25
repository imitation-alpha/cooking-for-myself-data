#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { readRecordSet } from './data-loader.mjs';
import { createNutritionAudit } from './nutrition-audit.mjs';
import { buildReviewData, reviewDataSchemaVersion } from './review-data-core.mjs';
import { validateIngredientRecord, validateMealRecord } from './validation-core.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);

function hashFileIfExists(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!existsSync(filePath)) return null;
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function collectValidationErrors(ingredients, meals) {
  const errors = [];
  const fail = (message) => errors.push(message);
  const fileExists = (relativePath) => existsSync(path.join(root, relativePath));
  const ingredientIds = new Set();

  for (const ingredient of ingredients) {
    if (ingredient.id && ingredientIds.has(ingredient.id)) fail('duplicate ingredient id ' + ingredient.id);
    if (ingredient.id) ingredientIds.add(ingredient.id);
    validateIngredientRecord(fail, ingredient, { fileExists });
  }

  const mealIds = new Set();
  for (const meal of meals) {
    if (meal.id && mealIds.has(meal.id)) fail('duplicate meal id ' + meal.id);
    if (meal.id) mealIds.add(meal.id);
    validateMealRecord(fail, meal, { ingredientIds, fileExists });
  }

  return errors;
}

function reviewSnapshot(nutritionSnapshot) {
  const statusPorcelain = nutritionSnapshot.git.statusPorcelain ?? '';
  return {
    schemaVersion: reviewDataSchemaVersion,
    generatedAt: nutritionSnapshot.generatedAt,
    git: {
      commit: nutritionSnapshot.git.commit,
      branch: nutritionSnapshot.git.branch,
      dirty: Boolean(statusPorcelain.trim()),
      statusPorcelain
    },
    hashes: {
      ...nutritionSnapshot.hashes,
      appSeed: hashFileIfExists('dist/app-seed.json')
    }
  };
}

function nutritionGate(report) {
  return {
    summary: report.summary,
    currentDatasetState: report.currentDatasetState,
    topCaloriesMeals: report.topCaloriesMeals,
    topSodiumMeals: report.topSodiumMeals,
    userFacingCopyRequirement: report.userFacingCopyRequirement
  };
}

function run() {
  const ingredientsPayload = readRecordSet(root, 'data/ingredients', 'ingredients');
  const mealsPayload = readRecordSet(root, 'data/meals', 'meals');
  const ingredients = ingredientsPayload.ingredients ?? [];
  const meals = mealsPayload.meals ?? [];
  const validationErrors = collectValidationErrors(ingredients, meals);
  const nutritionAudit = createNutritionAudit(root);
  const reviewData = buildReviewData({
    snapshot: reviewSnapshot(nutritionAudit.snapshot),
    ingredients,
    meals,
    validationErrors,
    nutritionGate: nutritionGate(nutritionAudit.report)
  });

  mkdirSync(path.join(root, 'dist'), { recursive: true });
  const outPath = path.join(root, 'dist', 'review-data.json');
  writeFileSync(outPath, JSON.stringify(reviewData, null, 2) + '\n');
  console.log(
    'Review data exported: ' +
      path.relative(root, outPath) +
      ' (' +
      reviewData.summary.totalIssues +
      ' issue(s), ' +
      reviewData.summary.bySeverity.high +
      ' high)'
  );
}

try {
  run();
} catch (error) {
  console.error('Review data export failed:');
  console.error(error.message);
  process.exit(1);
}
