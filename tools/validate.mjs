#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readRecordSet } from './data-loader.mjs';
import { validateIngredientRecord, validateMealRecord } from './validation-core.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const errors = [];
const fail = (message) => errors.push(message);
const fileExists = (relativePath) => existsSync(path.join(root, relativePath));

const ingredientsPayload = readRecordSet(root, 'data/ingredients', 'ingredients');
const mealsPayload = readRecordSet(root, 'data/meals', 'meals');
const ingredients = ingredientsPayload.ingredients ?? [];
const meals = mealsPayload.meals ?? [];

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

if (errors.length) {
  console.error('Validation failed with ' + errors.length + ' error(s):');
  for (const error of errors) console.error('- ' + error);
  process.exit(1);
}
console.log('Validation passed: ' + ingredients.length + ' ingredients, ' + meals.length + ' meals.');
