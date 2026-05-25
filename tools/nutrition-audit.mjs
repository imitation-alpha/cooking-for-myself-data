#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { readRecordSet } from './data-loader.mjs';

export const defaultRangePercent = { low: 0.9, high: 1.15 };
const sourceMatchTarget = 0.9;
const nutrientTolerance = {
  kcal: { absolute: 1, relative: 0.02 },
  sodiumMg: { absolute: 5, relative: 0.02 }
};
const acceptedSourceTypes = new Set([
  'health_canada_cnf',
  'usda_fdc',
  'brand_label',
  'open_food_facts',
  'other_reviewed'
]);
const preferredSourceTypes = new Set(['health_canada_cnf', 'usda_fdc']);
const brandedSourceTypes = new Set(['brand_label', 'open_food_facts']);
const massUnits = new Set(['g', 'gram', 'grams']);
export const assumptionNutritionProfiles = {
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
      { unit: 'pinch', grams: 0.3 },
      { unit: 'tsp', grams: 6 }
    ]
  }
};

const sodiumDriverIds = new Set([
  'light-soy',
  'oyster-sauce',
  'miso',
  'gochujang',
  'curry-block',
  'curry-paste',
  'chicken-broth',
  'beef-noodle-broth',
  'black-bean-sauce',
  'hoisin-sauce',
  'satay-sauce',
  'teriyaki-sauce',
  'luncheon-meat',
  'fish-ball',
  'kimchi',
  'lu-rou-sauce',
  'lu-wei-mix',
  'three-cup-sauce',
  'shaoxing-wine'
]);

const calorieDriverIds = new Set([
  'rice',
  'cooked-rice',
  'dried-noodle',
  'udon',
  'soba',
  'rice-noodle',
  'ho-fun',
  'macaroni',
  'bread',
  'wonton-wrapper',
  'pancake-mix',
  'tteok',
  'rice-paper',
  'egg',
  'chicken-thigh',
  'chicken-wing',
  'pork-mince',
  'pork-chop',
  'beef-slice',
  'beef-brisket',
  'spare-ribs',
  'salmon-fillet',
  'shrimp',
  'white-fish-fillet',
  'tofu',
  'soft-tofu',
  'coconut-milk',
  'peanut'
]);

const subagentGroups = [
  {
    id: 'subagent-a-sodium-drivers',
    title: 'Sauces, Broths, Sodium Drivers',
    focus: 'Audit sauces, broths, processed foods, and all high-sodium drivers. Sodium source quality is strict.',
    ingredientIds: [
      'light-soy',
      'oyster-sauce',
      'miso',
      'gochujang',
      'curry-block',
      'curry-paste',
      'chicken-broth',
      'beef-noodle-broth',
      'black-bean-sauce',
      'hoisin-sauce',
      'satay-sauce',
      'teriyaki-sauce',
      'luncheon-meat',
      'fish-ball',
      'kimchi',
      'lu-rou-sauce',
      'lu-wei-mix',
      'three-cup-sauce',
      'shaoxing-wine'
    ]
  },
  {
    id: 'subagent-b-staples-units',
    title: 'Staples and Unit Conversion',
    focus: 'Audit dry/cooked state and cup/gram conversions for staples.',
    ingredientIds: [
      'rice',
      'cooked-rice',
      'dried-noodle',
      'udon',
      'soba',
      'rice-noodle',
      'ho-fun',
      'macaroni',
      'bread',
      'wonton-wrapper',
      'pancake-mix',
      'tteok',
      'rice-paper',
      'glass-noodle',
      'pho-noodle',
      'cheung-fun',
      'daikon-cake',
      'scallion-pancake'
    ]
  },
  {
    id: 'subagent-c-proteins',
    title: 'Proteins',
    focus: 'Audit raw/cooked edible-form matching for protein ingredients.',
    ingredientIds: [
      'egg',
      'chicken-thigh',
      'chicken-wing',
      'pork-mince',
      'pork-chop',
      'pork-bone',
      'spare-ribs',
      'beef-slice',
      'beef-brisket',
      'bulgogi-beef',
      'char-siu',
      'roast-pork',
      'shrimp',
      'white-fish-fillet',
      'salmon-fillet',
      'oyster',
      'seafood-mix',
      'tofu',
      'soft-tofu'
    ]
  },
  {
    id: 'subagent-d-produce-low-calorie-units',
    title: 'Produce and Low-Calorie Units',
    focus: 'Audit piece/stalk/clove/slice/head conversion assumptions and low-calorie ingredients.',
    ingredientIds: []
  }
];

const sourcePolicy = {
  sourcePriority: [
    'Health Canada Canadian Nutrient File for Canada-oriented generic foods',
    'USDA FoodData Central for generic fallback values',
    'Brand labels or Open Food Facts only for explicit branded packaged overrides'
  ],
  requiredFields: [
    'sourceType',
    'sourceName',
    'sourceURL',
    'accessedAt',
    'foodDescription',
    'sourceNutrientsPer100g'
  ],
  acceptedSourceTypes: [...acceptedSourceTypes],
  preferredSourceTypes: [...preferredSourceTypes],
  estimateRangePercent: defaultRangePercent,
  passDefinition:
    'A row passes when kcal and sodium match the cited source after unit conversion within rounding tolerance, the food form matches use, source refs are acceptable, and the estimate range is present.'
};

const auditorRubric = {
  requiredOutputFields: [
    'status',
    'sourceUsed',
    'sourceURL',
    'accessDate',
    'sourceType',
    'sourceKcal',
    'sourceSodiumMg',
    'datasetKcal',
    'datasetSodiumMg',
    'unitConversionChecked',
    'deltaFromSource',
    'confidence',
    'correctionRecommendation'
  ],
  validStatuses: ['pass', 'warning', 'fail'],
  releaseGate: {
    minimumSourceMatchRate: sourceMatchTarget,
    highSeverityUnresolvedIssues: 0,
    highImpactCoverage: 1
  }
};

function parseArgs(argv) {
  const args = {
    strict: false,
    write: true,
    outDir: undefined,
    aggregateDir: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--strict') args.strict = true;
    else if (arg === '--no-write') args.write = false;
    else if (arg === '--out') {
      args.outDir = argv[index + 1];
      index += 1;
    } else if (arg === '--aggregate') {
      args.aggregateDir = argv[index + 1];
      index += 1;
    } else {
      throw new Error('Unknown option: ' + arg);
    }
  }

  return args;
}

function gitValue(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function hashFile(root, relativePath) {
  return sha256(readFileSync(path.join(root, relativePath)));
}

function hashJsonFiles(root, relativeDir) {
  const dir = path.join(root, relativeDir);
  const hash = createHash('sha256');
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort();
  for (const file of files) {
    const relativePath = path.join(relativeDir, file);
    hash.update(relativePath);
    hash.update('\0');
    hash.update(readFileSync(path.join(root, relativePath)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function readPayloads(root) {
  return {
    ingredientsPayload: readRecordSet(root, 'data/ingredients', 'ingredients'),
    mealsPayload: readRecordSet(root, 'data/meals', 'meals')
  };
}

function englishText(value) {
  return typeof value?.en === 'string' ? value.en : '';
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export function issue(issues, severity, code, owner, message, details = {}) {
  issues.push({ severity, code, owner, message, details });
}

function normalizeUnit(unit) {
  return typeof unit === 'string' ? unit.trim().toLowerCase() : '';
}

function nutritionProfile(ingredient) {
  return ingredient.nutrition;
}

function nutrientsPer100g(profile) {
  return profile?.nutrientsPer100g;
}

function unitWeights(profile) {
  return Array.isArray(profile?.unitWeights) ? profile.unitWeights : [];
}

function hasUnitWeight(profile, unit) {
  const normalized = normalizeUnit(unit);
  if (massUnits.has(normalized)) return true;
  return unitWeights(profile).some((entry) => normalizeUnit(entry.unit) === normalized && typeof entry.grams === 'number' && entry.grams > 0);
}

function withinTolerance(datasetValue, sourceValue, tolerance) {
  if (typeof datasetValue !== 'number' || typeof sourceValue !== 'number') return false;
  const delta = Math.abs(datasetValue - sourceValue);
  return delta <= Math.max(tolerance.absolute, Math.abs(sourceValue) * tolerance.relative);
}

function sourceNutrients(source) {
  return source?.sourceNutrientsPer100g;
}

function sourceRefMatchesNutrients(profile, source) {
  const nutrients = nutrientsPer100g(profile);
  const sourceValues = sourceNutrients(source);
  if (!isObject(nutrients) || !isObject(sourceValues)) return false;
  return (
    withinTolerance(nutrients.kcal, sourceValues.kcal, nutrientTolerance.kcal) &&
    withinTolerance(nutrients.sodiumMg, sourceValues.sodiumMg, nutrientTolerance.sodiumMg)
  );
}

export function validateIngredientNutrition(ingredient, issues) {
  const owner = 'ingredient ' + ingredient.id;
  const profile = nutritionProfile(ingredient);
  if (!profile) {
    issue(issues, 'high', 'missing-nutrition-profile', owner, 'Approved ingredient is missing a nutrition profile.');
    return { ingredientId: ingredient.id, status: 'fail', reason: 'missing nutrition profile' };
  }

  if (profile.estimate !== true) {
    issue(issues, 'high', 'missing-estimate-disclosure', owner, 'Nutrition profile must set estimate: true.');
  }

  const range = profile.rangePercent;
  if (!isObject(range) || range.low !== defaultRangePercent.low || range.high !== defaultRangePercent.high) {
    issue(
      issues,
      'high',
      'invalid-estimate-range',
      owner,
      'Nutrition profile must use the default 90% low / 115% high estimate range.',
      { expected: defaultRangePercent, actual: range ?? null }
    );
  }

  const nutrients = nutrientsPer100g(profile);
  if (!isObject(nutrients)) {
    issue(issues, 'high', 'missing-nutrients-per-100g', owner, 'Nutrition profile must include nutrientsPer100g.');
  } else {
    for (const key of ['kcal', 'sodiumMg']) {
      if (typeof nutrients[key] !== 'number' || nutrients[key] < 0) {
        issue(issues, 'high', 'invalid-nutrient-value', owner, 'Nutrition profile has invalid nutrientsPer100g.' + key + '.', {
          key,
          actual: nutrients[key] ?? null
        });
      }
    }
  }

  let matchedSourceRefId = null;
  if (!Array.isArray(profile.sourceRefs) || profile.sourceRefs.length === 0) {
    issue(issues, 'high', 'missing-source-refs', owner, 'Nutrition profile must include sourceRefs.');
  } else {
    for (const [index, source] of profile.sourceRefs.entries()) {
      const sourceOwner = owner + ' sourceRefs[' + index + ']';
      if (!acceptedSourceTypes.has(source.sourceType)) {
        issue(issues, 'high', 'invalid-source-type', sourceOwner, 'Source type is not accepted for nutrition verification.', {
          sourceType: source.sourceType ?? null
        });
      }
      for (const key of sourcePolicy.requiredFields) {
        if (!source[key]) {
          issue(issues, 'high', 'missing-source-field', sourceOwner, 'Source ref is missing ' + key + '.');
        }
      }
      const sourceValues = sourceNutrients(source);
      if (isObject(sourceValues)) {
        for (const key of ['kcal', 'sodiumMg']) {
          if (typeof sourceValues[key] !== 'number' || sourceValues[key] < 0) {
            issue(issues, 'high', 'invalid-source-nutrient-value', sourceOwner, 'Source ref has invalid sourceNutrientsPer100g.' + key + '.', {
              key,
              actual: sourceValues[key] ?? null
            });
          }
        }
      }
      if (!matchedSourceRefId && sourceRefMatchesNutrients(profile, source)) {
        matchedSourceRefId = source.id ?? String(index);
      }
      if (brandedSourceTypes.has(source.sourceType) && !profile.brandedOverride) {
        issue(
          issues,
          'high',
          'branded-source-without-override-flag',
          sourceOwner,
          'Brand/Open Food Facts sources should only be used for explicit branded overrides.'
        );
      }
    }
  }

  if (!matchedSourceRefId) {
    issue(
      issues,
      'high',
      'source-nutrient-mismatch',
      owner,
      'Nutrition nutrientsPer100g must match at least one cited sourceNutrientsPer100g within rounding tolerance.'
    );
  }

  if (!['high', 'medium', 'low'].includes(profile.confidence)) {
    issue(issues, 'medium', 'missing-confidence', owner, 'Nutrition profile should include confidence: high, medium, or low.');
  }

  if (!['needs_review', 'reviewed', 'approved'].includes(profile.reviewStatus)) {
    issue(issues, 'high', 'missing-review-status', owner, 'Nutrition profile must include reviewStatus.');
  }

  return {
    ingredientId: ingredient.id,
    status: matchedSourceRefId ? 'pass' : 'fail',
    matchedSourceRefId,
    datasetNutrientsPer100g: nutrientsPer100g(profile) ?? null
  };
}

function validateMealMeasures(meals, ingredientById, issues) {
  const usedUnitsByIngredient = new Map();
  let missingMeasureCount = 0;

  for (const meal of meals) {
    for (const usage of meal.ingredients ?? []) {
      const owner = 'meal ' + meal.id + ' ingredient ' + usage.ingredientId;
      if (!isObject(usage.measure)) {
        missingMeasureCount += 1;
        issue(issues, 'high', 'missing-structured-measure', owner, 'Approved meal ingredient is missing machine-readable measure.');
        continue;
      }
      if (typeof usage.measure.quantity !== 'number' || usage.measure.quantity <= 0) {
        issue(issues, 'high', 'invalid-measure-quantity', owner, 'Measure quantity must be a positive number.');
      }
      const unit = normalizeUnit(usage.measure.unit);
      if (!unit) {
        issue(issues, 'high', 'invalid-measure-unit', owner, 'Measure unit is required.');
      } else {
        if (!usedUnitsByIngredient.has(usage.ingredientId)) usedUnitsByIngredient.set(usage.ingredientId, new Set());
        usedUnitsByIngredient.get(usage.ingredientId).add(unit);
      }
    }
  }

  for (const [ingredientId, units] of usedUnitsByIngredient.entries()) {
    const ingredient = ingredientById.get(ingredientId);
    const profile = ingredient ? nutritionProfile(ingredient) : null;
    for (const unit of units) {
      if (!profile || !hasUnitWeight(profile, unit)) {
        issue(
          issues,
          'high',
          'missing-unit-conversion',
          'ingredient ' + ingredientId,
          'Nutrition profile is missing a gram conversion for unit used by approved meals.',
          { unit }
        );
      }
    }
  }

  return { missingMeasureCount };
}

function mealStepText(meal) {
  return (meal.steps ?? [])
    .map((step) => [step.detail?.en, step.detail?.zhHant, step.detail?.yue].filter(Boolean).join(' '))
    .join(' ')
    .toLowerCase();
}

export function validateMealAssumptions(meals, issues) {
  for (const meal of meals) {
    const assumptions = Array.isArray(meal.nutritionAssumptions) ? meal.nutritionAssumptions : [];
    const assumedKinds = new Set(assumptions.map((assumption) => assumption.kind));
    const text = mealStepText(meal);

    if ((text.includes('oil') || text.includes('油')) && !assumedKinds.has('cooking_oil')) {
      issue(
        issues,
        'high',
        'missing-cooking-oil-assumption',
        'meal ' + meal.id,
        'Steps imply cooking oil, but nutritionAssumptions has no cooking_oil entry.'
      );
    }
    if ((text.includes('salt') || text.includes('鹽') || text.includes('盐')) && !assumedKinds.has('added_salt')) {
      issue(
        issues,
        'high',
        'missing-added-salt-assumption',
        'meal ' + meal.id,
        'Steps imply added salt, but nutritionAssumptions has no added_salt entry.'
      );
    }

    for (const assumption of assumptions) {
      const owner = 'meal ' + meal.id + ' assumption ' + (assumption.id ?? '(missing id)');
      if (!assumptionNutritionProfiles[assumption.kind]) {
        issue(issues, 'medium', 'manual-assumption-review-needed', owner, 'Assumption kind needs manual meal-level review.');
      }
      if (!isObject(assumption.measure)) {
        issue(issues, 'high', 'missing-assumption-measure', owner, 'Nutrition assumption is missing measure.');
        continue;
      }
      if (typeof assumption.measure.quantity !== 'number' || assumption.measure.quantity <= 0) {
        issue(issues, 'high', 'invalid-assumption-quantity', owner, 'Nutrition assumption quantity must be a positive number.');
      }
      if (!normalizeUnit(assumption.measure.unit)) {
        issue(issues, 'high', 'invalid-assumption-unit', owner, 'Nutrition assumption unit is required.');
      }
    }
  }
}

function gramsForMeasure(measure, profile) {
  const unit = normalizeUnit(measure?.unit);
  const quantity = measure?.quantity;
  if (typeof quantity !== 'number' || quantity <= 0 || !unit) return null;
  if (unit === 'g' || unit === 'gram' || unit === 'grams') return quantity;
  const match = unitWeights(profile).find((entry) => normalizeUnit(entry.unit) === unit);
  if (!match || typeof match.grams !== 'number' || match.grams <= 0) return null;
  return quantity * match.grams;
}

function gramsForUsage(usage, profile) {
  return gramsForMeasure(usage.measure, profile);
}

export function computeMealNutrition(meal, ingredientById) {
  let kcal = 0;
  let sodiumMg = 0;
  const missing = [];

  for (const usage of meal.ingredients ?? []) {
    const ingredient = ingredientById.get(usage.ingredientId);
    const profile = ingredient ? nutritionProfile(ingredient) : null;
    const nutrients = nutrientsPer100g(profile);
    const grams = profile && usage.measure ? gramsForUsage(usage, profile) : null;
    if (!ingredient || !profile || !nutrients || grams === null) {
      missing.push(usage.ingredientId);
      continue;
    }
    kcal += (grams / 100) * nutrients.kcal;
    sodiumMg += (grams / 100) * nutrients.sodiumMg;
  }

  for (const assumption of meal.nutritionAssumptions ?? []) {
    const profile = assumptionNutritionProfiles[assumption.kind];
    const grams = profile ? gramsForMeasure(assumption.measure, profile) : null;
    if (!profile || grams === null) {
      missing.push('assumption:' + (assumption.id ?? assumption.kind ?? 'unknown'));
      continue;
    }
    kcal += (grams / 100) * profile.nutrientsPer100g.kcal;
    sodiumMg += (grams / 100) * profile.nutrientsPer100g.sodiumMg;
  }

  if (missing.length > 0) return { computable: false, missing };
  return {
    computable: true,
    kcal: {
      low: Math.round(kcal * defaultRangePercent.low),
      high: Math.round(kcal * defaultRangePercent.high)
    },
    sodiumMg: {
      low: Math.round(sodiumMg * defaultRangePercent.low),
      high: Math.round(sodiumMg * defaultRangePercent.high)
    },
    sodiumLevel: sodiumLevel(sodiumMg)
  };
}

function sodiumLevel(sodiumMg) {
  if (sodiumMg < 600) return 'lower';
  if (sodiumMg < 1200) return 'moderate';
  return 'higher';
}

function selectRepresentativeMeals(meals) {
  const selected = new Map();
  const add = (meal, reason) => {
    if (!meal || selected.has(meal.id)) return;
    selected.set(meal.id, { meal, reason });
  };

  for (const meal of meals) {
    if ((meal.ingredients ?? []).some((usage) => sodiumDriverIds.has(usage.ingredientId))) add(meal, 'contains sodium-driver ingredients');
    if (selected.size >= 8) break;
  }
  for (const meal of meals) {
    if ((meal.ingredients ?? []).some((usage) => calorieDriverIds.has(usage.ingredientId))) add(meal, 'contains calorie-driver ingredients');
    if (selected.size >= 14) break;
  }
  for (const meal of meals) {
    const text = (meal.steps ?? []).map((step) => englishText(step.detail) + ' ' + (step.detail?.zhHant ?? '')).join(' ').toLowerCase();
    if (text.includes('oil') || text.includes('油')) add(meal, 'steps imply cooking oil assumption review');
    if (selected.size >= 20) break;
  }

  return [...selected.values()].map(({ meal, reason }) => ({
    id: meal.id,
    names: meal.names,
    servings: meal.servings,
    reason,
    ingredients: meal.ingredients,
    nutritionAssumptions: meal.nutritionAssumptions ?? []
  }));
}

function groupIngredients(ingredients) {
  const byId = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const assigned = new Set();
  const packets = [];

  for (const group of subagentGroups) {
    const rows = group.ingredientIds
      .map((id) => byId.get(id))
      .filter(Boolean);
    for (const row of rows) assigned.add(row.id);
    packets.push({ ...group, ingredients: rows });
  }

  const produceGroup = packets.find((packet) => packet.id === 'subagent-d-produce-low-calorie-units');
  produceGroup.ingredients = [
    ...produceGroup.ingredients,
    ...ingredients.filter((ingredient) => !assigned.has(ingredient.id))
  ].sort((a, b) => a.id.localeCompare(b.id));
  produceGroup.ingredientIds = produceGroup.ingredients.map((ingredient) => ingredient.id);

  return packets;
}

function packetPrompt(packet) {
  return [
    'You are an independent nutrition-data critic for Cooking For Myself.',
    'Use fresh web search and primary/official sources when possible.',
    'Do not assume the dataset values are correct. Your job is to find mismatches.',
    'Audit only this packet: ' + packet.title + '.',
    'For every ingredient row, return JSON rows with status pass, warning, or fail.',
    'A pass requires source-match after unit conversion, acceptable source type, matching food form, and estimate range 90%-115%.',
    'Flag any exact-health-claim wording or missing estimate disclosure as fail.'
  ].join('\n');
}

function buildSnapshot(root) {
  return {
    generatedAt: new Date().toISOString(),
    git: {
      commit: gitValue(root, ['rev-parse', 'HEAD']),
      branch: gitValue(root, ['branch', '--show-current']),
      statusPorcelain: gitValue(root, ['status', '--short']) ?? ''
    },
    hashes: {
      ingredientSchema: hashFile(root, 'schemas/ingredient.schema.json'),
      mealSchema: hashFile(root, 'schemas/meal.schema.json'),
      ingredientRecords: hashJsonFiles(root, 'data/ingredients'),
      mealRecords: hashJsonFiles(root, 'data/meals')
    },
    sourceMatchTarget,
    defaultRangePercent
  };
}

function buildReport({ snapshot, ingredients, meals, issues, mealNutrition, sourceMatchResults }) {
  const highIssues = issues.filter((entry) => entry.severity === 'high');
  const mediumIssues = issues.filter((entry) => entry.severity === 'medium');
  const passCount = sourceMatchResults.filter((entry) => entry.status === 'pass').length;
  const failCount = sourceMatchResults.length - passCount;
  const sourceMatchRate = sourceMatchResults.length > 0 ? passCount / sourceMatchResults.length : 0;
  const highImpactIds = [...new Set([...sodiumDriverIds, ...calorieDriverIds])].filter((id) =>
    ingredients.some((ingredient) => ingredient.id === id)
  );
  const coveredHighImpactIds = highImpactIds.filter((id) => {
    const ingredient = ingredients.find((entry) => entry.id === id);
    const profile = nutritionProfile(ingredient);
    const nutrients = nutrientsPer100g(profile);
    return profile && nutrients && typeof nutrients.kcal === 'number' && typeof nutrients.sodiumMg === 'number';
  });
  const highImpactCoverage = highImpactIds.length > 0 ? coveredHighImpactIds.length / highImpactIds.length : 1;
  const blockedReasons = [];

  if (sourceMatchRate < sourceMatchTarget) blockedReasons.push('source-match rate is below 90%');
  if (highIssues.length > 0) blockedReasons.push('high-severity deterministic issues remain');
  if (highImpactCoverage < 1) blockedReasons.push('high-impact calorie/sodium coverage is incomplete');
  if (snapshot.git.statusPorcelain.trim()) blockedReasons.push('dataset snapshot has uncommitted changes');

  return {
    snapshot,
    summary: {
      totalRowsAudited: ingredients.length,
      passCount,
      warningCount: mediumIssues.length,
      failCount,
      sourceMatchRate,
      sourceMatchRatePercent: Math.round(sourceMatchRate * 1000) / 10,
      highSeverityIssueCount: highIssues.length,
      highImpactCoverage,
      highImpactCoveragePercent: Math.round(highImpactCoverage * 1000) / 10,
      releaseGatePassed: blockedReasons.length === 0,
      blockedReasons
    },
    currentDatasetState: {
      approvedIngredients: ingredients.length,
      approvedMeals: meals.length,
      computedMeals: mealNutrition.filter((entry) => entry.nutrition.computable).length,
      uncomputedMeals: mealNutrition.filter((entry) => !entry.nutrition.computable).length
    },
    topCaloriesMeals: mealNutrition
      .filter((entry) => entry.nutrition.computable)
      .sort((a, b) => b.nutrition.kcal.high - a.nutrition.kcal.high)
      .slice(0, 10),
    topSodiumMeals: mealNutrition
      .filter((entry) => entry.nutrition.computable)
      .sort((a, b) => b.nutrition.sodiumMg.high - a.nutrition.sodiumMg.high)
      .slice(0, 10),
    correctedRows: [],
    unresolvedWarnings: mediumIssues,
    sourceMatchResults,
    issues,
    userFacingCopyRequirement:
      'All app copy must say nutrition values are estimates and vary by brand, portion size, and cooking method.'
  };
}

function writeJson(filePath, value) {
  writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function writeAuditRun(root, outDir, data) {
  mkdirSync(outDir, { recursive: true });
  mkdirSync(path.join(outDir, 'packets'), { recursive: true });
  mkdirSync(path.join(outDir, 'results'), { recursive: true });

  writeJson(path.join(outDir, 'snapshot.json'), data.snapshot);
  writeJson(path.join(outDir, 'deterministic-report.json'), data.report);
  writeJson(path.join(outDir, 'subagent-results-template.json'), {
    packetId: 'subagent-a-sodium-drivers',
    auditedBy: '',
    completedAt: new Date().toISOString(),
    rows: [
      {
        ingredientId: '',
        status: 'pass',
        sourceUsed: '',
        sourceURL: '',
        accessDate: new Date().toISOString().slice(0, 10),
        sourceType: 'health_canada_cnf',
        sourceKcal: null,
        sourceSodiumMg: null,
        datasetKcal: null,
        datasetSodiumMg: null,
        unitConversionChecked: '',
        deltaFromSource: '',
        confidence: 'medium',
        correctionRecommendation: ''
      }
    ]
  });

  for (const packet of data.packets) {
    writeJson(path.join(outDir, 'packets', packet.packetId + '.json'), packet);
  }

  const readme = [
    '# Nutrition Audit Run',
    '',
    'Snapshot commit: `' + (data.snapshot.git.commit ?? 'unknown') + '`',
    'Generated at: `' + data.snapshot.generatedAt + '`',
    '',
    'Run each packet with a fresh critic context. Web search is allowed and expected.',
    'Write completed JSON results into `results/` using the shape in `subagent-results-template.json`.',
    '',
    'Release gate status: `' + (data.report.summary.releaseGatePassed ? 'passed' : 'blocked') + '`',
    'Blocked reasons: ' + (data.report.summary.blockedReasons.join('; ') || 'none'),
    '',
    'The current app/user-facing copy must describe nutrition values as estimates that vary by brand, portion, and cooking method.'
  ].join('\n');
  writeFileSync(path.join(outDir, 'README.md'), readme + '\n');

  return path.relative(root, outDir);
}

export function buildPackets({ snapshot, ingredients, meals }) {
  const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const representativeMeals = selectRepresentativeMeals(meals);
  const representativeIngredientIds = [
    ...new Set(
      representativeMeals.flatMap((meal) => (meal.ingredients ?? []).map((usage) => usage.ingredientId))
    )
  ].sort();
  const packets = groupIngredients(ingredients).map((packet) => ({
    packetId: packet.id,
    title: packet.title,
    focus: packet.focus,
    sourcePolicy,
    auditorRubric,
    prompt: packetPrompt(packet),
    ingredients: packet.ingredients.map((ingredient) => ({
      id: ingredient.id,
      names: ingredient.names,
      section: ingredient.section,
      aliases: ingredient.aliases,
      nutrition: ingredient.nutrition ?? null
    }))
  }));

  packets.push({
    packetId: 'subagent-e-meal-level-critic',
    title: 'Meal-Level Critic',
    focus: 'Recompute representative meals and verify sodium levels from ingredient profiles, structured measures, and cooking assumptions.',
    sourcePolicy,
    auditorRubric,
    prompt: [
      'You are an independent meal-level nutrition critic for Cooking For Myself.',
      'Use the provided ingredient nutrition rows and structured measures only.',
      'Recompute representative meals, then flag mismatched calorie ranges or sodium levels.',
      'Confirm the output remains clearly labeled as estimated nutrition.'
    ].join('\n'),
    representativeMeals,
    ingredientProfiles: representativeIngredientIds.map((ingredientId) => {
      const ingredient = ingredientById.get(ingredientId);
      return {
        id: ingredientId,
        names: ingredient?.names ?? null,
        nutrition: ingredient?.nutrition ?? null
      };
    }),
    assumptionNutritionProfiles,
    estimateRangePercent: defaultRangePercent,
    sodiumLevelThresholdsMg: {
      lowerBelow: 600,
      moderateBelow: 1200,
      higherAtOrAbove: 1200
    },
    snapshot
  });

  return packets;
}

function readPackets(runDir) {
  const packetsDir = path.join(runDir, 'packets');
  if (!existsSync(packetsDir)) return new Map();
  const packets = new Map();
  for (const file of readdirSync(packetsDir).filter((entry) => entry.endsWith('.json')).sort()) {
    const packet = JSON.parse(readFileSync(path.join(packetsDir, file), 'utf8'));
    if (packet.packetId) packets.set(packet.packetId, packet);
  }
  return packets;
}

function expectedRowsForPacket(packet) {
  if (Array.isArray(packet.ingredients)) {
    return {
      key: 'ingredientId',
      ids: packet.ingredients.map((ingredient) => ingredient.id).filter(Boolean)
    };
  }
  if (Array.isArray(packet.representativeMeals)) {
    return {
      key: 'mealId',
      ids: packet.representativeMeals.map((meal) => meal.id).filter(Boolean)
    };
  }
  return { key: 'id', ids: [] };
}

function requiredFieldsForPacket(packet) {
  if (Array.isArray(packet.ingredients)) {
    return ['ingredientId', ...auditorRubric.requiredOutputFields];
  }
  return ['mealId', 'status', 'unitConversionChecked', 'deltaFromSource', 'confidence', 'correctionRecommendation'];
}

function missingRequiredFields(row, packet) {
  return requiredFieldsForPacket(packet).filter((field) => row[field] === undefined || row[field] === null || row[field] === '');
}

export function aggregateSubagentResults(runDir) {
  const resultsDir = path.join(runDir, 'results');
  if (!existsSync(resultsDir)) return null;
  const files = readdirSync(resultsDir).filter((file) => file.endsWith('.json')).sort();
  if (files.length === 0) return null;
  const packets = readPackets(runDir);
  const deterministicPath = path.join(runDir, 'deterministic-report.json');
  const deterministicReport = existsSync(deterministicPath)
    ? JSON.parse(readFileSync(deterministicPath, 'utf8'))
    : null;

  const rows = [];
  const rowIssues = [];
  for (const file of files) {
    const payload = JSON.parse(readFileSync(path.join(resultsDir, file), 'utf8'));
    for (const row of payload.rows ?? []) {
      rows.push({ packetId: payload.packetId ?? file.replace(/\.json$/, ''), ...row });
    }
  }

  const rowsByPacket = new Map();
  for (const row of rows) {
    if (!rowsByPacket.has(row.packetId)) rowsByPacket.set(row.packetId, []);
    rowsByPacket.get(row.packetId).push(row);

    const packet = packets.get(row.packetId);
    if (!packet) {
      rowIssues.push({ code: 'unknown-packet', packetId: row.packetId, row });
      continue;
    }
    const missing = missingRequiredFields(row, packet);
    if (missing.length > 0) rowIssues.push({ code: 'missing-required-fields', packetId: row.packetId, row, missing });
    if (!auditorRubric.validStatuses.includes(row.status)) rowIssues.push({ code: 'invalid-status', packetId: row.packetId, row });
    if (Array.isArray(packet.ingredients) && !acceptedSourceTypes.has(row.sourceType)) {
      rowIssues.push({ code: 'invalid-source-type', packetId: row.packetId, row });
    }
  }

  for (const [packetId, packet] of packets.entries()) {
    const { key, ids } = expectedRowsForPacket(packet);
    const packetRows = rowsByPacket.get(packetId) ?? [];
    if (packetRows.length === 0) {
      rowIssues.push({ code: 'missing-packet-results', packetId });
      continue;
    }
    const seen = new Set();
    for (const row of packetRows) {
      const id = row[key];
      if (!ids.includes(id)) {
        rowIssues.push({ code: 'unknown-row-id', packetId, expectedKey: key, actual: id });
      } else if (seen.has(id)) {
        rowIssues.push({ code: 'duplicate-row-id', packetId, expectedKey: key, actual: id });
      } else {
        seen.add(id);
      }
    }
    for (const id of ids) {
      if (!seen.has(id)) rowIssues.push({ code: 'missing-row-result', packetId, expectedKey: key, expected: id });
    }
  }

  const total = rows.length;
  const pass = rows.filter((row) => row.status === 'pass').length;
  const warning = rows.filter((row) => row.status === 'warning').length;
  const invalid = rows.filter((row) => !auditorRubric.validStatuses.includes(row.status)).length;
  const fail = rows.filter((row) => row.status === 'fail').length + invalid + rowIssues.length;
  const sourceMatchRate = total > 0 ? pass / total : 0;
  const blockedReasons = [];

  if (packets.size === 0) blockedReasons.push('no packet definitions were found');
  if (total === 0) blockedReasons.push('no subagent rows were audited');
  if (fail > 0) blockedReasons.push('subagent fail or invalid rows remain');
  if (sourceMatchRate < sourceMatchTarget) blockedReasons.push('subagent source-match rate is below 90%');
  if (!deterministicReport) {
    blockedReasons.push('deterministic report is missing');
  } else if (!deterministicReport.summary?.releaseGatePassed) {
    blockedReasons.push('deterministic report is still blocked');
  }

  return {
    totalRowsAudited: total,
    passCount: pass,
    warningCount: warning,
    failCount: fail,
    invalidStatusCount: invalid,
    sourceMatchRate,
    sourceMatchRatePercent: Math.round(sourceMatchRate * 1000) / 10,
    rowIssueCount: rowIssues.length,
    rowIssues,
    deterministicSummary: deterministicReport?.summary ?? null,
    releaseGatePassed: blockedReasons.length === 0,
    blockedReasons,
    rows
  };
}

export function createNutritionAudit(root) {
  const { ingredientsPayload, mealsPayload } = readPayloads(root);
  const ingredients = (ingredientsPayload.ingredients ?? []).filter((ingredient) => ingredient.status === 'approved');
  const meals = (mealsPayload.meals ?? []).filter((meal) => meal.status === 'approved');
  const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const issues = [];

  const sourceMatchResults = ingredients.map((ingredient) => validateIngredientNutrition(ingredient, issues));
  validateMealMeasures(meals, ingredientById, issues);
  validateMealAssumptions(meals, issues);

  const mealNutrition = meals.map((meal) => ({
    mealId: meal.id,
    names: meal.names,
    nutrition: computeMealNutrition(meal, ingredientById)
  }));
  const snapshot = buildSnapshot(root);
  const report = buildReport({ snapshot, ingredients, meals, issues, mealNutrition, sourceMatchResults });
  const packets = buildPackets({ snapshot, ingredients, meals });

  return {
    ingredients,
    meals,
    issues,
    mealNutrition,
    sourceMatchResults,
    snapshot,
    report,
    packets
  };
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(new URL('..', import.meta.url).pathname);

  if (args.aggregateDir) {
    const aggregate = aggregateSubagentResults(path.resolve(args.aggregateDir));
    if (!aggregate) {
      console.error('No subagent result JSON files found under ' + path.join(args.aggregateDir, 'results'));
      process.exit(1);
    }
    writeJson(path.join(path.resolve(args.aggregateDir), 'subagent-aggregate.json'), aggregate);
    console.log('Aggregated subagent results: ' + path.join(args.aggregateDir, 'subagent-aggregate.json'));
    if (args.strict && !aggregate.releaseGatePassed) process.exit(1);
    return;
  }

  const { snapshot, report, packets } = createNutritionAudit(root);

  let outputLabel = '(not written; --no-write)';
  if (args.write) {
    const safeTimestamp = snapshot.generatedAt.replace(/[:.]/g, '-');
    const outDir = path.resolve(args.outDir ?? path.join(root, 'nutrition-audits', safeTimestamp));
    outputLabel = writeAuditRun(root, outDir, { snapshot, report, packets });
  }

  console.log('Nutrition deterministic audit: ' + (report.summary.releaseGatePassed ? 'PASSED' : 'BLOCKED'));
  console.log('Rows audited: ' + report.summary.totalRowsAudited);
  console.log('Source-match pass rate: ' + report.summary.sourceMatchRatePercent + '%');
  console.log('High-severity issues: ' + report.summary.highSeverityIssueCount);
  console.log('High-impact coverage: ' + report.summary.highImpactCoveragePercent + '%');
  console.log('Output: ' + outputLabel);
  if (report.summary.blockedReasons.length > 0) {
    console.log('Blocked reasons:');
    for (const reason of report.summary.blockedReasons) console.log('- ' + reason);
  }

  if (args.strict && !report.summary.releaseGatePassed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run();
  } catch (error) {
    console.error('Nutrition audit failed:');
    console.error(error.message);
    process.exit(1);
  }
}
