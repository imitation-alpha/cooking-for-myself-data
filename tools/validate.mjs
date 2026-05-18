#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readRecordSet } from './data-loader.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const languageKeys = ["zhHant","yue","zhHans","en","ja","ko","th","vi","id","tl"];
const statuses = new Set(['draft', 'reviewed', 'approved']);
const imageReviewStatuses = new Set(['needs_review', 'reviewed', 'approved']);
const imageDisclosures = new Set(['generated', 'owned', 'licensed', 'placeholder']);
const errors = [];
const oldGenericStepText = new Set([
  '先備料',
  '先滾湯底',
  '按熟成時間落料',
  '校正鹹淡',
  '鋪平主料',
  '中火蒸熟',
  '最後落蔥豉油',
  '大火預熱',
  '分批快炒',
  '回鑊掛汁',
  '炒香咖喱',
  '加湯煮主料',
  '收汁配飯',
  '洗米減水',
  '主料鋪面',
  '焗完休息',
  '中火定型',
  '翻面完成',
  '瀝油調味',
  '先煮主食',
  '分開處理餡料',
  '最後組裝',
  '先煮主料',
  '調好醬汁',
  '配飯完成'
]);
const staleTemplateStepFragments = [
  'before heating the pan',
  'garlic, ginger, scallion, or other aromatics',
  'sauce, broth or water',
  'surface changes color or the greens turn bright',
  'check seasoning and doneness one more time',
  'should keep its texture',
  '開火後不用停手找材料',
  '主料抹乾或切成同厚度',
  '蒜蓉、薑蔥或其他香料',
  '表面轉色或蔬菜變亮綠',
  '完成前再試一次鹹淡和熟度',
  '口感保持清楚',
  '汁要亮身但仍可流動'
];
const ingredientsPayload = readRecordSet(root, 'data/ingredients', 'ingredients');
const mealsPayload = readRecordSet(root, 'data/meals', 'meals');
const ingredients = ingredientsPayload.ingredients ?? [];
const meals = mealsPayload.meals ?? [];

function fail(message) { errors.push(message); }
function validLocalized(owner, value) {
  if (!value || typeof value !== 'object') return fail(owner + ' localized value must be object');
  for (const key of languageKeys) {
    if (!(key in value)) fail(owner + ' missing language ' + key);
  }
  if (!value.zhHant || !value.en) fail(owner + ' requires zhHant and en');
}
function validImages(owner, images, { requiredWhenApproved, contentStyle }) {
  if (!Array.isArray(images)) return fail(owner + ' images must be array');
  if (requiredWhenApproved && images.length === 0) fail(owner + ' approved records need at least one image');
  for (const image of images) {
    for (const key of ['path', 'alt', 'contentStyle', 'disclosure', 'license', 'attribution', 'sourceName', 'sourceURL', 'reviewStatus']) {
      if (!image[key]) fail(owner + ' image missing ' + key);
    }
    if (image.path && !existsSync(path.join(root, image.path))) fail(owner + ' image file missing: ' + image.path);
    if (image.contentStyle && image.contentStyle !== contentStyle) fail(owner + ' image contentStyle must be ' + contentStyle);
    if (image.disclosure && !imageDisclosures.has(image.disclosure)) fail(owner + ' image disclosure is invalid: ' + image.disclosure);
    if (image.reviewStatus && !imageReviewStatuses.has(image.reviewStatus)) fail(owner + ' image reviewStatus is invalid: ' + image.reviewStatus);
    if (!['CC-BY-4.0'].includes(image.license)) fail(owner + ' image license must be CC-BY-4.0');
    if (requiredWhenApproved && image.disclosure === 'placeholder') fail(owner + ' approved records cannot use placeholder primary images');
    if (requiredWhenApproved && image.reviewStatus === 'needs_review') fail(owner + ' approved records require reviewed or approved images');
  }
}
function validProvenance(owner, provenance) {
  for (const key of ['sourceName', 'sourceURL', 'license', 'attribution', 'reviewStatus']) {
    if (!provenance?.[key]) fail(owner + ' provenance missing ' + key);
  }
  if (provenance?.license !== 'ODC-BY-1.0') fail(owner + ' data license must be ODC-BY-1.0');
}
function validStepText(owner, value, minLength) {
  validLocalized(owner, value);
  for (const key of languageKeys) {
    const text = value?.[key];
    if (typeof text !== 'string') continue;
    if (text.trim().length < minLength) fail(owner + ' ' + key + ' is too short');
    if (oldGenericStepText.has(text.trim())) fail(owner + ' ' + key + ' uses old generic template text');
    const normalized = text.toLowerCase();
    if (staleTemplateStepFragments.some((fragment) => normalized.includes(fragment.toLowerCase()))) {
      fail(owner + ' ' + key + ' uses stale template step text');
    }
  }
}

const ingredientIds = new Set();
for (const ingredient of ingredients) {
  const owner = 'ingredient ' + ingredient.id;
  if (!ingredient.id) fail('ingredient missing id');
  if (ingredientIds.has(ingredient.id)) fail('duplicate ingredient id ' + ingredient.id);
  ingredientIds.add(ingredient.id);
  if (!statuses.has(ingredient.status)) fail(owner + ' invalid status');
  validLocalized(owner + ' names', ingredient.names);
  if (!Array.isArray(ingredient.aliases)) fail(owner + ' aliases must be array');
  if (!Array.isArray(ingredient.tags)) fail(owner + ' tags must be array');
  validImages(owner, ingredient.images, {
    requiredWhenApproved: ingredient.status === 'approved',
    contentStyle: 'realistic_ingredient_photo'
  });
  validProvenance(owner, ingredient.provenance);
}

const mealIds = new Set();
for (const meal of meals) {
  const owner = 'meal ' + meal.id;
  if (!meal.id) fail('meal missing id');
  if (mealIds.has(meal.id)) fail('duplicate meal id ' + meal.id);
  mealIds.add(meal.id);
  if (!statuses.has(meal.status)) fail(owner + ' invalid status');
  validLocalized(owner + ' names', meal.names);
  if (!Number.isInteger(meal.timeMinutes) || meal.timeMinutes <= 0) fail(owner + ' timeMinutes must be positive integer');
  if (!Array.isArray(meal.ingredients) || meal.ingredients.length === 0) fail(owner + ' must include ingredients');
  for (const usage of meal.ingredients ?? []) {
    if (!ingredientIds.has(usage.ingredientId)) fail(owner + ' references missing ingredient ' + usage.ingredientId);
    validLocalized(owner + ' amount for ' + usage.ingredientId, usage.amounts);
  }
  if (!Array.isArray(meal.steps) || meal.steps.length === 0) fail(owner + ' must include steps');
  for (const [index, step] of (meal.steps ?? []).entries()) {
    if (step.order !== index + 1) fail(owner + ' step ' + (index + 1) + ' order must be aligned');
    validStepText(owner + ' step ' + (index + 1) + ' title', step.title, 2);
    validStepText(owner + ' step ' + (index + 1) + ' detail', step.detail, 35);
  }
  validImages(owner, meal.images, {
    requiredWhenApproved: meal.status === 'approved',
    contentStyle: 'realistic_food_photo'
  });
  validProvenance(owner, meal.provenance);
}

if (errors.length) {
  console.error('Validation failed with ' + errors.length + ' error(s):');
  for (const error of errors) console.error('- ' + error);
  process.exit(1);
}
console.log('Validation passed: ' + ingredients.length + ' ingredients, ' + meals.length + ' meals.');
