#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const accessedAt = '2026-05-20';
const rangePercent = { low: 0.9, high: 1.15 };

// Baseline values are internal estimates for app planning and review only.
// They unblock deterministic meal math, but remain reviewStatus: needs_review
// until independently checked against USDA FDC, Health Canada CNF, or labels.
const baseline = {
  'choy-sum': { kcal: 13, sodiumMg: 65, form: 'fresh raw', confidence: 'low', units: { bunch: 250 } },
  tomato: { kcal: 18, sodiumMg: 5, form: 'fresh raw', confidence: 'medium', units: { medium: 123 } },
  egg: { kcal: 143, sodiumMg: 129, form: 'raw whole', confidence: 'medium', units: { egg: 50 } },
  ginger: { kcal: 80, sodiumMg: 13, form: 'fresh raw', confidence: 'medium', units: { slice: 2 } },
  garlic: { kcal: 149, sodiumMg: 17, form: 'fresh raw', confidence: 'medium', units: { clove: 3 } },
  scallion: { kcal: 32, sodiumMg: 16, form: 'fresh raw', confidence: 'medium', units: { stalk: 15 } },
  rice: { kcal: 365, sodiumMg: 5, form: 'dry as sold', confidence: 'medium', units: { cup: 185 } },
  'cooked-rice': { kcal: 130, sodiumMg: 1, form: 'cooked plain', confidence: 'medium', units: { bowl: 180 } },
  'light-soy': { kcal: 53, sodiumMg: 5493, form: 'prepared sauce', confidence: 'medium', units: { tbsp: 16 } },
  'oyster-sauce': { kcal: 51, sodiumMg: 2733, form: 'prepared sauce', confidence: 'low', units: { tbsp: 18 } },
  'shaoxing-wine': { kcal: 134, sodiumMg: 5, form: 'cooking wine', confidence: 'low', units: { tbsp: 15 } },
  'chicken-broth': { kcal: 6, sodiumMg: 343, form: 'prepared broth', confidence: 'low', units: { ml: 1 } },
  'black-tea': { kcal: 1, sodiumMg: 3, form: 'brewed unsweetened', confidence: 'medium', units: { ml: 1, cup: 240 } },
  'chicken-wing': { kcal: 191, sodiumMg: 82, form: 'raw edible portion', confidence: 'medium', units: { wing: 35 } },
  'chicken-thigh': { kcal: 177, sodiumMg: 87, form: 'raw edible portion', confidence: 'medium', units: { thigh: 120 } },
  'white-fish-fillet': { kcal: 90, sodiumMg: 70, form: 'raw fillet', confidence: 'medium', units: { fillet: 150 } },
  'salmon-fillet': { kcal: 208, sodiumMg: 59, form: 'raw fillet', confidence: 'medium', units: { fillet: 170 } },
  'fish-ball': { kcal: 160, sodiumMg: 700, form: 'prepared processed', confidence: 'low', units: { piece: 20 } },
  shrimp: { kcal: 85, sodiumMg: 119, form: 'raw edible portion', confidence: 'medium', units: {} },
  'seafood-mix': { kcal: 90, sodiumMg: 150, form: 'raw mixed seafood', confidence: 'low', units: {} },
  oyster: { kcal: 68, sodiumMg: 90, form: 'raw edible portion', confidence: 'medium', units: {} },
  'beef-slice': { kcal: 217, sodiumMg: 60, form: 'raw sliced beef', confidence: 'medium', units: {} },
  'beef-brisket': { kcal: 251, sodiumMg: 66, form: 'raw beef brisket', confidence: 'medium', units: {} },
  'bulgogi-beef': { kcal: 220, sodiumMg: 520, form: 'marinated raw beef', confidence: 'low', units: {} },
  'pork-mince': { kcal: 297, sodiumMg: 62, form: 'raw ground pork', confidence: 'medium', units: {} },
  'pork-chop': { kcal: 231, sodiumMg: 62, form: 'raw pork chop', confidence: 'medium', units: { chop: 170 } },
  'spare-ribs': { kcal: 277, sodiumMg: 90, form: 'raw pork ribs', confidence: 'medium', units: {} },
  'pork-bone': { kcal: 200, sodiumMg: 70, form: 'raw pork bones with meat', confidence: 'low', units: {} },
  'char-siu': { kcal: 300, sodiumMg: 800, form: 'prepared roast pork', confidence: 'low', units: {} },
  'roast-pork': { kcal: 410, sodiumMg: 650, form: 'prepared roast pork', confidence: 'low', units: {} },
  'luncheon-meat': { kcal: 310, sodiumMg: 1200, form: 'processed canned meat', confidence: 'low', units: { slice: 25 } },
  tofu: { kcal: 76, sodiumMg: 7, form: 'firm tofu', confidence: 'medium', units: { block: 400 } },
  'soft-tofu': { kcal: 55, sodiumMg: 5, form: 'soft tofu', confidence: 'medium', units: { block: 300 } },
  'gai-lan': { kcal: 22, sodiumMg: 7, form: 'fresh raw', confidence: 'medium', units: { bunch: 250 } },
  'napa-cabbage': { kcal: 16, sodiumMg: 8, form: 'fresh raw', confidence: 'medium', units: { head: 900 } },
  'bitter-melon': { kcal: 17, sodiumMg: 5, form: 'fresh raw', confidence: 'medium', units: { melon: 500 } },
  eggplant: { kcal: 25, sodiumMg: 2, form: 'fresh raw', confidence: 'medium', units: { small: 200 } },
  lettuce: { kcal: 15, sodiumMg: 28, form: 'fresh raw', confidence: 'medium', units: { head: 600 } },
  'lotus-root': { kcal: 74, sodiumMg: 40, form: 'fresh raw', confidence: 'medium', units: {} },
  'winter-melon': { kcal: 13, sodiumMg: 6, form: 'fresh raw', confidence: 'medium', units: {} },
  watercress: { kcal: 11, sodiumMg: 41, form: 'fresh raw', confidence: 'medium', units: { bunch: 250 } },
  'sweet-potato-leaves': { kcal: 35, sodiumMg: 11, form: 'fresh raw', confidence: 'low', units: { bunch: 250 } },
  'soybean-sprouts': { kcal: 122, sodiumMg: 14, form: 'fresh raw', confidence: 'low', units: {} },
  'daikon-cake': { kcal: 140, sodiumMg: 420, form: 'prepared cake', confidence: 'low', units: { slice: 60 } },
  'cheung-fun': { kcal: 150, sodiumMg: 220, form: 'prepared rice noodle roll', confidence: 'low', units: { roll: 120 } },
  'egg-tart': { kcal: 305, sodiumMg: 180, form: 'prepared pastry', confidence: 'low', units: { piece: 75 } },
  'dried-noodle': { kcal: 384, sodiumMg: 8, form: 'dry as sold noodles', confidence: 'medium', units: { noodle_nest: 50 } },
  'wonton-wrapper': { kcal: 291, sodiumMg: 570, form: 'prepared wrapper', confidence: 'low', units: { wrapper: 8 } },
  macaroni: { kcal: 371, sodiumMg: 6, form: 'dry as sold pasta', confidence: 'medium', units: {} },
  'ho-fun': { kcal: 109, sodiumMg: 5, form: 'fresh rice noodles', confidence: 'low', units: {} },
  'rice-noodle': { kcal: 364, sodiumMg: 5, form: 'dry as sold rice noodles', confidence: 'medium', units: {} },
  'pho-noodle': { kcal: 364, sodiumMg: 5, form: 'dry as sold rice noodles', confidence: 'medium', units: {} },
  udon: { kcal: 127, sodiumMg: 164, form: 'prepared cooked noodles', confidence: 'low', units: { pack: 200 } },
  soba: { kcal: 336, sodiumMg: 10, form: 'dry as sold noodles', confidence: 'medium', units: {} },
  'glass-noodle': { kcal: 351, sodiumMg: 10, form: 'dry as sold noodles', confidence: 'medium', units: {} },
  tteok: { kcal: 238, sodiumMg: 5, form: 'prepared rice cakes', confidence: 'low', units: {} },
  bread: { kcal: 265, sodiumMg: 491, form: 'prepared bread', confidence: 'medium', units: { slice: 28 } },
  'pancake-mix': { kcal: 366, sodiumMg: 1116, form: 'dry mix', confidence: 'low', units: {} },
  nori: { kcal: 306, sodiumMg: 48, form: 'dried seaweed', confidence: 'medium', units: { sheet: 2.5 } },
  kimchi: { kcal: 15, sodiumMg: 498, form: 'prepared fermented vegetable', confidence: 'low', units: {} },
  miso: { kcal: 199, sodiumMg: 3728, form: 'prepared paste', confidence: 'medium', units: { tbsp: 17 } },
  'curry-block': { kcal: 500, sodiumMg: 3500, form: 'prepared curry roux block', confidence: 'low', units: { cube: 20 } },
  'curry-paste': { kcal: 240, sodiumMg: 2700, form: 'prepared curry paste', confidence: 'low', units: { tbsp: 15 } },
  'coconut-milk': { kcal: 197, sodiumMg: 15, form: 'canned coconut milk', confidence: 'medium', units: { ml: 1.01 } },
  gochujang: { kcal: 242, sodiumMg: 3270, form: 'prepared paste', confidence: 'low', units: { tbsp: 18 } },
  'black-bean-sauce': { kcal: 165, sodiumMg: 4160, form: 'prepared sauce', confidence: 'low', units: { tbsp: 16 } },
  'hoisin-sauce': { kcal: 220, sodiumMg: 1615, form: 'prepared sauce', confidence: 'low', units: { tbsp: 18 } },
  'satay-sauce': { kcal: 260, sodiumMg: 900, form: 'prepared sauce', confidence: 'low', units: { tbsp: 18 } },
  'teriyaki-sauce': { kcal: 89, sodiumMg: 3833, form: 'prepared sauce', confidence: 'low', units: { tbsp: 18 } },
  'three-cup-sauce': { kcal: 180, sodiumMg: 2500, form: 'prepared sauce', confidence: 'low', units: { tbsp: 18 } },
  'lu-rou-sauce': { kcal: 160, sodiumMg: 2200, form: 'prepared sauce', confidence: 'low', units: { tbsp: 18 } },
  'lu-wei-mix': { kcal: 230, sodiumMg: 800, form: 'prepared braised mix', confidence: 'low', units: {} },
  'beef-noodle-broth': { kcal: 20, sodiumMg: 350, form: 'prepared broth', confidence: 'low', units: { ml: 1 } },
  'scallion-pancake': { kcal: 260, sodiumMg: 520, form: 'prepared frozen pancake', confidence: 'low', units: { pancake: 100 } },
  lemongrass: { kcal: 99, sodiumMg: 6, form: 'fresh raw', confidence: 'medium', units: { stalk: 15 } },
  'thai-basil': { kcal: 23, sodiumMg: 4, form: 'fresh raw', confidence: 'medium', units: { cup: 24 } },
  'bean-sprouts': { kcal: 30, sodiumMg: 6, form: 'fresh raw', confidence: 'medium', units: {} },
  'rice-paper': { kcal: 329, sodiumMg: 742, form: 'dry wrapper', confidence: 'low', units: { sheet: 10 } },
  peanut: { kcal: 567, sodiumMg: 18, form: 'dry roasted no added salt', confidence: 'medium', units: { tbsp: 9 } },
  cucumber: { kcal: 15, sodiumMg: 2, form: 'fresh raw', confidence: 'medium', units: { cucumber: 300 } },
  carrot: { kcal: 41, sodiumMg: 69, form: 'fresh raw', confidence: 'medium', units: { carrot: 61 } },
  corn: { kcal: 86, sodiumMg: 240, form: 'canned drained', confidence: 'low', units: { can: 340 } },
  potato: { kcal: 77, sodiumMg: 6, form: 'fresh raw', confidence: 'medium', units: { potato: 173 } },
  onion: { kcal: 40, sodiumMg: 4, form: 'fresh raw', confidence: 'medium', units: { onion: 150 } },
  basil: { kcal: 23, sodiumMg: 4, form: 'fresh raw', confidence: 'medium', units: { cup: 24 } }
};

const amountUnitMap = new Map([
  ['g', 'g'],
  ['ml', 'ml'],
  ['tbsp', 'tbsp'],
  ['cup', 'cup'],
  ['cloves', 'clove'],
  ['stalks', 'stalk'],
  ['stalk', 'stalk'],
  ['eggs', 'egg'],
  ['thighs', 'thigh'],
  ['wings', 'wing'],
  ['slices', 'slice'],
  ['noodle nests', 'noodle_nest'],
  ['block', 'block'],
  ['chops', 'chop'],
  ['bowls', 'bowl'],
  ['fillets', 'fillet'],
  ['bunch', 'bunch'],
  ['bunches', 'bunch'],
  ['packs', 'pack'],
  ['medium', 'medium'],
  ['head', 'head'],
  ['sheets', 'sheet'],
  ['melon', 'melon'],
  ['pieces', 'piece'],
  ['can', 'can'],
  ['small', 'small'],
  ['rolls', 'roll'],
  ['cubes', 'cube'],
  ['potatoes', 'potato'],
  ['onion', 'onion'],
  ['cucumber', 'cucumber'],
  ['carrot', 'carrot'],
  ['pancakes', 'pancake'],
  ['wrappers', 'wrapper']
]);

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

function writeJson(relativePath, value) {
  writeFileSync(path.join(root, relativePath), JSON.stringify(value, null, 2) + '\n');
}

function recordFiles(relativeDir) {
  return readdirSync(path.join(root, relativeDir))
    .filter((file) => file.endsWith('.json') && file !== '_meta.json')
    .sort();
}

function sourceFor(id, ingredient, data) {
  return {
    id: 'baseline-' + id,
    sourceType: 'other_reviewed',
    sourceName: 'Cooking For Myself baseline nutrition estimate',
    sourceURL: 'local://cooking-for-myself/nutrition-baseline-v1#' + id,
    accessedAt,
    foodDescription: (ingredient.names?.en ?? id) + ', ' + data.form + ' baseline estimate',
    sourceNutrientsPer100g: {
      kcal: data.kcal,
      sodiumMg: data.sodiumMg
    }
  };
}

function unitWeights(id, data) {
  return [
    {
      unit: 'g',
      grams: 1,
      sourceRefId: 'baseline-' + id,
      note: 'Mass measure.'
    },
    ...Object.entries(data.units).map(([unit, grams]) => ({
      unit,
      grams,
      sourceRefId: 'baseline-' + id,
      note: 'Planning conversion estimate; verify against package size or source measure.'
    }))
  ];
}

function nutritionFor(id, ingredient, data) {
  return {
    estimate: true,
    rangePercent,
    form: data.form,
    nutrientsPer100g: {
      kcal: data.kcal,
      sodiumMg: data.sodiumMg
    },
    unitWeights: unitWeights(id, data),
    sourceRefs: [sourceFor(id, ingredient, data)],
    confidence: data.confidence,
    reviewStatus: 'needs_review'
  };
}

function parseQuantity(raw) {
  if (raw.includes('/')) {
    const [top, bottom] = raw.split('/').map(Number);
    return top / bottom;
  }
  return Number(raw);
}

function parseMeasure(amount) {
  const normalized = amount.trim().toLowerCase();
  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?|[0-9]+\/[0-9]+)\s+(.+)$/);
  if (!match) throw new Error('Cannot parse amount: ' + amount);
  const quantity = parseQuantity(match[1]);
  const unit = amountUnitMap.get(match[2]);
  if (!unit) throw new Error('Unknown amount unit in "' + amount + '"');
  return { quantity, unit };
}

function mealText(meal) {
  return (meal.steps ?? [])
    .map((step) => [step.detail?.en, step.detail?.zhHant, step.detail?.yue].filter(Boolean).join(' '))
    .join(' ')
    .toLowerCase();
}

function hasAssumption(meal, kind) {
  return (meal.nutritionAssumptions ?? []).some((assumption) => assumption.kind === kind);
}

function addAssumption(meal, assumption) {
  if (!Array.isArray(meal.nutritionAssumptions)) meal.nutritionAssumptions = [];
  if (!meal.nutritionAssumptions.some((entry) => entry.id === assumption.id || entry.kind === assumption.kind)) {
    meal.nutritionAssumptions.push(assumption);
  }
}

function assertBaselineCoverage() {
  const ingredientIds = new Set(recordFiles('data/ingredients').map((file) => path.basename(file, '.json')));
  const missing = [...ingredientIds].filter((id) => !baseline[id]);
  const stale = Object.keys(baseline).filter((id) => !ingredientIds.has(id));
  if (missing.length > 0 || stale.length > 0) {
    throw new Error('Nutrition baseline coverage mismatch. Missing=' + missing.join(',') + ' stale=' + stale.join(','));
  }
}

function applyIngredients() {
  for (const file of recordFiles('data/ingredients')) {
    const id = path.basename(file, '.json');
    const ingredient = readJson(path.join('data/ingredients', file));
    ingredient.nutrition = nutritionFor(id, ingredient, baseline[id]);
    writeJson(path.join('data/ingredients', file), ingredient);
  }
}

function applyMeals() {
  const usedUnits = new Map();
  for (const file of recordFiles('data/meals')) {
    const meal = readJson(path.join('data/meals', file));
    for (const usage of meal.ingredients ?? []) {
      const measure = parseMeasure(usage.amounts.en);
      usage.measure = measure;
      if (!usedUnits.has(usage.ingredientId)) usedUnits.set(usage.ingredientId, new Set());
      usedUnits.get(usage.ingredientId).add(measure.unit);
    }

    const text = mealText(meal);
    if ((text.includes('oil') || text.includes('油')) && !hasAssumption(meal, 'cooking_oil')) {
      addAssumption(meal, {
        id: 'default-cooking-oil',
        kind: 'cooking_oil',
        measure: { quantity: 1, unit: 'tbsp' },
        reason: 'Steps imply cooking oil; included as a planning estimate.'
      });
    }
    if ((text.includes('salt') || text.includes('鹽') || text.includes('盐')) && !hasAssumption(meal, 'added_salt')) {
      addAssumption(meal, {
        id: 'default-added-salt',
        kind: 'added_salt',
        measure: { quantity: 0.25, unit: 'tsp' },
        reason: 'Steps imply added salt; included as a planning estimate.'
      });
    }

    writeJson(path.join('data/meals', file), meal);
  }

  for (const [ingredientId, units] of usedUnits.entries()) {
    for (const unit of units) {
      if (unit === 'g') continue;
      if (!baseline[ingredientId]?.units?.[unit]) {
        throw new Error('Missing unit conversion for ' + ingredientId + ' unit ' + unit);
      }
    }
  }
}

assertBaselineCoverage();
applyIngredients();
applyMeals();

console.log('Applied nutrition baseline to ' + Object.keys(baseline).length + ' ingredients.');
