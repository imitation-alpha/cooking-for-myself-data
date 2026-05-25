#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { readRecordSet } from './data-loader.mjs';
import { assumptionNutritionProfiles, defaultRangePercent } from './nutrition-audit.mjs';

export const verificationTolerance = { relative: 0.1 };

const acceptedSourceTypes = new Set([
  'health_canada_cnf',
  'usda_fdc',
  'brand_label',
  'open_food_facts',
  'other_reviewed'
]);
const brandedSourceTypes = new Set(['brand_label', 'open_food_facts']);
const massUnits = new Set(['g', 'gram', 'grams']);
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
const sodiumDriverTokens = ['soy', 'sauce', 'broth', 'stock', 'miso', 'gochujang', 'curry', 'luncheon', 'fish-ball'];

function parseArgs(argv) {
  const args = { outDir: undefined, write: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') {
      args.outDir = argv[index + 1];
      index += 1;
    } else if (arg === '--no-write') {
      args.write = false;
    } else {
      throw new Error('Unknown option: ' + arg);
    }
  }
  return args;
}

function localizedName(record) {
  return record?.names?.en || record?.names?.zhHant || record?.id || '(unnamed)';
}

function approved(records) {
  return records.filter((record) => record.status === 'approved');
}

function normalizeUnit(unit) {
  return typeof unit === 'string' ? unit.trim().toLowerCase() : '';
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function sourceRefs(profile) {
  return Array.isArray(profile?.sourceRefs) ? profile.sourceRefs : [];
}

function unitWeights(profile) {
  return Array.isArray(profile?.unitWeights) ? profile.unitWeights : [];
}

function isSodiumDriver(ingredient) {
  if (sodiumDriverIds.has(ingredient.id)) return true;
  const haystack = [ingredient.id, localizedName(ingredient), ...(ingredient.tags ?? []), ...(ingredient.aliases ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return sodiumDriverTokens.some((token) => haystack.includes(token));
}

function issue(code, message, severity = 'fail', evidence = {}) {
  return { code, severity, message, evidence };
}

function pctDelta(datasetValue, sourceValue) {
  if (typeof datasetValue !== 'number' || typeof sourceValue !== 'number') return null;
  if (sourceValue === 0) return datasetValue === 0 ? 0 : Infinity;
  return Math.round(((datasetValue - sourceValue) / sourceValue) * 1000) / 10;
}

function withinTenPercent(datasetValue, sourceValue) {
  if (typeof datasetValue !== 'number' || typeof sourceValue !== 'number') return false;
  if (sourceValue === 0) return datasetValue === 0;
  return Math.abs(datasetValue - sourceValue) / Math.abs(sourceValue) <= verificationTolerance.relative;
}

function statusFromIssues(issues, fallback = 'pass') {
  if (issues.some((entry) => entry.severity === 'fail')) return 'fail';
  if (issues.some((entry) => entry.severity === 'warning')) return 'warning';
  return fallback;
}

function sourceFieldIssues(source) {
  const issues = [];
  for (const field of ['sourceType', 'sourceName', 'sourceURL', 'accessedAt', 'foodDescription', 'sourceNutrientsPer100g']) {
    if (!source?.[field]) issues.push(issue('missing-source-field', 'Source ref is missing ' + field + '.', 'fail', { field }));
  }
  if (source?.sourceType && !acceptedSourceTypes.has(source.sourceType)) {
    issues.push(issue('invalid-source-type', 'Source type is not accepted for this verification.', 'fail', { sourceType: source.sourceType }));
  }
  return issues;
}

function conflictingFoodForm(profileForm, sourceDescription) {
  if (!profileForm || !sourceDescription) return null;
  const profile = profileForm.toLowerCase();
  const source = sourceDescription.toLowerCase();
  const conflicts = [
    ['raw', 'cooked'],
    ['dry', 'cooked'],
    ['dried', 'cooked'],
    ['salted', 'unsalted']
  ];
  for (const [left, right] of conflicts) {
    if (profile.includes(left) && source.includes(right)) return { expected: left, sourceContains: right };
    if (profile.includes(right) && source.includes(left)) return { expected: right, sourceContains: left };
  }
  return null;
}

function bestSourceMatch(profile, rowIssues) {
  const nutrients = profile?.nutrientsPer100g;
  const checks = [];
  for (const source of sourceRefs(profile)) {
    const issues = sourceFieldIssues(source);
    const sourceNutrients = source?.sourceNutrientsPer100g;
    if (brandedSourceTypes.has(source?.sourceType) && !profile.brandedOverride) {
      issues.push(
        issue(
          'branded-source-without-override-flag',
          'Brand/Open Food Facts source requires nutrition.brandedOverride.',
          'fail',
          { sourceType: source.sourceType }
        )
      );
    }
    const formConflict = conflictingFoodForm(profile.form, source?.foodDescription);
    if (formConflict) {
      issues.push(issue('food-form-mismatch', 'Nutrition form conflicts with source food description.', 'fail', formConflict));
    }
    if (!isObject(sourceNutrients) || typeof sourceNutrients.kcal !== 'number') {
      issues.push(issue('missing-source-kcal', 'Source ref is missing source kcal per 100 g.', 'fail'));
    }
    if (!isObject(sourceNutrients) || typeof sourceNutrients.sodiumMg !== 'number') {
      issues.push(issue('missing-source-sodium', 'Source ref is missing source sodium mg per 100 g.', 'fail'));
    }

    const deltaPercent = {
      kcal: pctDelta(nutrients?.kcal, sourceNutrients?.kcal),
      sodiumMg: pctDelta(nutrients?.sodiumMg, sourceNutrients?.sodiumMg)
    };
    const kcalPass = withinTenPercent(nutrients?.kcal, sourceNutrients?.kcal);
    const sodiumPass = withinTenPercent(nutrients?.sodiumMg, sourceNutrients?.sodiumMg);
    if (!kcalPass || !sodiumPass) {
      issues.push(
        issue('source-value-outside-tolerance', 'Dataset kcal or sodium is outside +/-10% of this source.', 'fail', {
          deltaPercent
        })
      );
    }

    checks.push({
      sourceId: source?.id ?? null,
      sourceType: source?.sourceType ?? null,
      sourceName: source?.sourceName ?? null,
      sourceURL: source?.sourceURL ?? null,
      accessDate: source?.accessedAt ?? null,
      foodDescription: source?.foodDescription ?? null,
      sourceKcal: sourceNutrients?.kcal ?? null,
      sourceSodiumMg: sourceNutrients?.sodiumMg ?? null,
      deltaPercent,
      status: statusFromIssues(issues),
      issues
    });
  }

  for (const check of checks) {
    if (check.status === 'pass') return { best: check, checks };
  }
  const best = checks
    .filter((check) => typeof check.deltaPercent.kcal === 'number' && typeof check.deltaPercent.sodiumMg === 'number')
    .sort((a, b) => Math.max(Math.abs(a.deltaPercent.kcal), Math.abs(a.deltaPercent.sodiumMg)) - Math.max(Math.abs(b.deltaPercent.kcal), Math.abs(b.deltaPercent.sodiumMg)))[0];
  if (!best && checks.length === 0) rowIssues.push(issue('missing-source-refs', 'Nutrition profile has no sourceRefs.', 'fail'));
  return { best: best ?? checks[0] ?? null, checks };
}

function unitWeightIssues(profile) {
  const issues = [];
  if (!Array.isArray(profile?.unitWeights)) {
    issues.push(issue('missing-unit-weights', 'Nutrition profile must include unitWeights.', 'fail'));
    return issues;
  }
  for (const [index, entry] of profile.unitWeights.entries()) {
    if (!entry.unit || typeof entry.grams !== 'number' || entry.grams <= 0) {
      issues.push(issue('invalid-unit-weight', 'Unit conversion must include unit and positive grams.', 'fail', { index, entry }));
    }
  }
  return issues;
}

export function auditIngredients(ingredients) {
  const rows = [];
  for (const ingredient of approved(ingredients)) {
    const rowIssues = [];
    const profile = ingredient.nutrition;
    if (!profile) {
      rowIssues.push(issue('missing-nutrition-profile', 'Approved ingredient is missing nutrition profile.', 'fail'));
      rows.push({
        ingredientId: ingredient.id,
        name: localizedName(ingredient),
        status: 'fail',
        priority: isSodiumDriver(ingredient) ? 'high' : 'normal',
        datasetKcal: null,
        datasetSodiumMg: null,
        sourceKcal: null,
        sourceSodiumMg: null,
        sourceURL: null,
        sourceType: null,
        deltaPercent: { kcal: null, sodiumMg: null },
        unitConversionChecked: false,
        confidence: null,
        issues: rowIssues,
        correctionRecommendation: 'Add nutrition.nutrientsPer100g, sourceRefs, rangePercent, unitWeights, confidence, and reviewStatus.'
      });
      continue;
    }

    if (profile.estimate !== true) rowIssues.push(issue('missing-estimate-disclosure', 'Nutrition profile must set estimate: true.', 'fail'));
    if (profile.rangePercent?.low !== defaultRangePercent.low || profile.rangePercent?.high !== defaultRangePercent.high) {
      rowIssues.push(issue('invalid-estimate-range', 'Nutrition rangePercent must remain 90%-115% for user-facing estimates.', 'fail'));
    }
    for (const key of ['kcal', 'sodiumMg']) {
      if (typeof profile.nutrientsPer100g?.[key] !== 'number' || profile.nutrientsPer100g[key] < 0) {
        rowIssues.push(issue('invalid-dataset-nutrient', 'Dataset nutrient value is missing or invalid.', 'fail', { key }));
      }
    }
    rowIssues.push(...unitWeightIssues(profile));

    const { best, checks } = bestSourceMatch(profile, rowIssues);
    if (isSodiumDriver(ingredient) && !checks.some((check) => typeof check.sourceSodiumMg === 'number')) {
      rowIssues.push(issue('sodium-driver-unverified-sodium', 'Sodium-driver ingredient has no source sodium value.', 'fail'));
    }
    if (best?.status === 'fail') {
      rowIssues.push(...best.issues.filter((entry) => entry.severity === 'fail'));
    }

    const uniqueIssues = dedupeIssues(rowIssues);
    rows.push({
      ingredientId: ingredient.id,
      name: localizedName(ingredient),
      status: statusFromIssues(uniqueIssues),
      priority: isSodiumDriver(ingredient) ? 'high' : 'normal',
      datasetKcal: profile.nutrientsPer100g?.kcal ?? null,
      datasetSodiumMg: profile.nutrientsPer100g?.sodiumMg ?? null,
      sourceKcal: best?.sourceKcal ?? null,
      sourceSodiumMg: best?.sourceSodiumMg ?? null,
      sourceURL: best?.sourceURL ?? null,
      sourceType: best?.sourceType ?? null,
      sourceName: best?.sourceName ?? null,
      sourceFoodDescription: best?.foodDescription ?? null,
      deltaPercent: best?.deltaPercent ?? { kcal: null, sodiumMg: null },
      unitConversionChecked: unitWeightIssues(profile).length === 0,
      confidence: profile.confidence ?? null,
      reviewStatus: profile.reviewStatus ?? null,
      issues: uniqueIssues,
      sourceChecks: checks,
      correctionRecommendation: recommendationForIngredient(uniqueIssues)
    });
  }

  return { summary: summarizeRows(rows), rows };
}

function dedupeIssues(issues) {
  const seen = new Set();
  return issues.filter((entry) => {
    const key = entry.code + ':' + JSON.stringify(entry.evidence ?? {});
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function recommendationForIngredient(issues) {
  if (issues.some((entry) => entry.code === 'missing-nutrition-profile')) return 'Add a complete nutrition profile from Health Canada CNF or USDA FDC.';
  if (issues.some((entry) => entry.code.includes('source') || entry.code === 'food-form-mismatch')) return 'Update sourceRefs so kcal/sodium, source type, URL, access date, and food form match the dataset values within +/-10%.';
  if (issues.some((entry) => entry.code.includes('unit'))) return 'Add supported gram conversions in nutrition.unitWeights for units used by meals.';
  if (issues.some((entry) => entry.code === 'invalid-estimate-range')) return 'Keep verification tolerance separate and restore rangePercent to 90%-115%.';
  return 'No correction needed.';
}

function summarizeRows(rows) {
  return {
    totalRows: rows.length,
    passCount: rows.filter((row) => row.status === 'pass').length,
    warningCount: rows.filter((row) => row.status === 'warning').length,
    failCount: rows.filter((row) => row.status === 'fail').length,
    computedOnlyCount: rows.filter((row) => row.status === 'computed_only').length
  };
}

function gramsForMeasure(measure, profile) {
  const quantity = measure?.quantity;
  const unit = normalizeUnit(measure?.unit);
  if (typeof quantity !== 'number' || quantity <= 0 || !unit) return null;
  if (massUnits.has(unit)) return quantity;
  const match = unitWeights(profile).find((entry) => normalizeUnit(entry.unit) === unit);
  if (!match || typeof match.grams !== 'number' || match.grams <= 0) return null;
  return quantity * match.grams;
}

function mealText(meal) {
  return (meal.steps ?? [])
    .map((step) => [step.detail?.en, step.detail?.zhHant, step.detail?.yue].filter(Boolean).join(' '))
    .join(' ')
    .toLowerCase();
}

function sodiumLevel(sodiumMg) {
  if (sodiumMg < 600) return 'lower';
  if (sodiumMg < 1200) return 'moderate';
  return 'higher';
}

function computeMeal(meal, ingredientById) {
  let kcal = 0;
  let sodiumMg = 0;
  const issues = [];
  for (const usage of meal.ingredients ?? []) {
    const ingredient = ingredientById.get(usage.ingredientId);
    const profile = ingredient?.nutrition;
    if (!ingredient) {
      issues.push(issue('missing-ingredient-reference', 'Meal references an ingredient id that does not exist.', 'fail', { ingredientId: usage.ingredientId }));
      continue;
    }
    if (!profile) {
      issues.push(issue('missing-ingredient-nutrition', 'Ingredient is missing nutrition profile.', 'fail', { ingredientId: usage.ingredientId }));
      continue;
    }
    if (!isObject(usage.measure)) {
      issues.push(issue('missing-structured-measure', 'Meal ingredient is missing measure.quantity/unit.', 'fail', { ingredientId: usage.ingredientId }));
      continue;
    }
    const grams = gramsForMeasure(usage.measure, profile);
    if (grams === null) {
      issues.push(issue('missing-unit-conversion', 'Ingredient unit has no gram conversion.', 'fail', { ingredientId: usage.ingredientId, unit: usage.measure?.unit ?? null }));
      continue;
    }
    kcal += (grams / 100) * profile.nutrientsPer100g.kcal;
    sodiumMg += (grams / 100) * profile.nutrientsPer100g.sodiumMg;
  }

  for (const assumption of meal.nutritionAssumptions ?? []) {
    const profile = assumptionNutritionProfiles[assumption.kind];
    if (!profile) {
      issues.push(issue('unsupported-nutrition-assumption', 'Nutrition assumption kind is not computable.', 'fail', { id: assumption.id, kind: assumption.kind }));
      continue;
    }
    const grams = gramsForMeasure(assumption.measure, profile);
    if (grams === null) {
      issues.push(issue('missing-assumption-measure', 'Nutrition assumption measure is missing or unsupported.', 'fail', { id: assumption.id, kind: assumption.kind }));
      continue;
    }
    kcal += (grams / 100) * profile.nutrientsPer100g.kcal;
    sodiumMg += (grams / 100) * profile.nutrientsPer100g.sodiumMg;
  }

  const assumedKinds = new Set((meal.nutritionAssumptions ?? []).map((assumption) => assumption.kind));
  const text = mealText(meal);
  if ((text.includes('oil') || text.includes('油')) && !assumedKinds.has('cooking_oil')) {
    issues.push(issue('missing-cooking-oil-assumption', 'Steps imply oil but nutritionAssumptions lacks cooking_oil.', 'fail'));
  }
  if ((text.includes('salt') || text.includes('鹽') || text.includes('盐')) && !assumedKinds.has('added_salt')) {
    issues.push(issue('missing-added-salt-assumption', 'Steps imply salt but nutritionAssumptions lacks added_salt.', 'fail'));
  }

  if (issues.some((entry) => entry.severity === 'fail')) return { computable: false, issues };
  return {
    computable: true,
    base: {
      kcal: Math.round(kcal * 10) / 10,
      sodiumMg: Math.round(sodiumMg * 10) / 10
    },
    kcal: {
      low: Math.round(kcal * defaultRangePercent.low),
      high: Math.round(kcal * defaultRangePercent.high)
    },
    sodiumMg: {
      low: Math.round(sodiumMg * defaultRangePercent.low),
      high: Math.round(sodiumMg * defaultRangePercent.high)
    },
    sodiumLevel: sodiumLevel(sodiumMg),
    issues
  };
}

function storedMealNutrition(meal) {
  return meal.nutrition ?? meal.nutritionEstimate ?? meal.estimatedNutrition ?? null;
}

function compareRange(name, computed, stored) {
  const issues = [];
  const deltaPercent = {
    low: pctDelta(stored?.low, computed?.low),
    high: pctDelta(stored?.high, computed?.high)
  };
  if (!stored || typeof stored.low !== 'number' || typeof stored.high !== 'number') {
    issues.push(issue('missing-stored-' + name, 'Stored meal ' + name + ' range is missing.', 'warning'));
    return { issues, deltaPercent };
  }
  if (!withinTenPercent(stored.low, computed.low) || !withinTenPercent(stored.high, computed.high)) {
    issues.push(
      issue('stored-meal-value-outside-tolerance', 'Stored meal ' + name + ' range is outside +/-10% of recomputed value.', 'fail', {
        nutrient: name,
        deltaPercent
      })
    );
  }
  return { issues, deltaPercent };
}

export function auditMeals(meals, ingredients) {
  const ingredientById = new Map(approved(ingredients).map((ingredient) => [ingredient.id, ingredient]));
  const rows = [];
  for (const meal of approved(meals)) {
    const computed = computeMeal(meal, ingredientById);
    const stored = storedMealNutrition(meal);
    if (!computed.computable) {
      rows.push({
        mealId: meal.id,
        name: localizedName(meal),
        status: 'fail',
        computable: false,
        computed: null,
        stored: stored ?? null,
        deltaPercent: null,
        issues: dedupeIssues(computed.issues),
        correctionRecommendation: 'Fix missing ingredient nutrition, structured measures, unit conversions, and oil/salt assumptions before meal nutrition can be verified.'
      });
      continue;
    }

    const rowIssues = [];
    let status = 'computed_only';
    let deltaPercent = null;
    if (stored) {
      const kcal = compareRange('kcal', computed.kcal, stored.kcal);
      const sodium = compareRange('sodiumMg', computed.sodiumMg, stored.sodiumMg);
      rowIssues.push(...kcal.issues, ...sodium.issues);
      deltaPercent = { kcal: kcal.deltaPercent, sodiumMg: sodium.deltaPercent };
      if (stored.sodiumLevel && stored.sodiumLevel !== computed.sodiumLevel) {
        rowIssues.push(
          issue('sodium-level-mismatch', 'Stored sodium level does not match recomputed sodium level.', 'fail', {
            stored: stored.sodiumLevel,
            computed: computed.sodiumLevel
          })
        );
      }
      status = statusFromIssues(rowIssues);
    }

    rows.push({
      mealId: meal.id,
      name: localizedName(meal),
      status,
      computable: true,
      computed: {
        base: computed.base,
        kcal: computed.kcal,
        sodiumMg: computed.sodiumMg,
        sodiumLevel: computed.sodiumLevel
      },
      stored: stored ?? null,
      deltaPercent,
      issues: dedupeIssues(rowIssues),
      correctionRecommendation:
        status === 'computed_only'
          ? 'No stored meal nutrition exists yet; use this recomputed estimate as the candidate value.'
          : status === 'pass'
            ? 'No correction needed.'
            : 'Update stored meal kcal/sodium range and sodium level to match recomputed values within +/-10%.'
    });
  }

  const computableRows = rows.filter((row) => row.computable);
  return {
    summary: summarizeRows(rows),
    topCaloriesMeals: [...computableRows].sort((a, b) => b.computed.kcal.high - a.computed.kcal.high).slice(0, 10),
    topSodiumMeals: [...computableRows].sort((a, b) => b.computed.sodiumMg.high - a.computed.sodiumMg.high).slice(0, 10),
    rows
  };
}

export function buildTwoLevelNutritionAudit({ ingredients, meals, snapshot = null }) {
  return {
    schemaVersion: 'two-level-nutrition-audit-v1',
    generatedAt: snapshot?.generatedAt ?? new Date().toISOString(),
    snapshot,
    tolerance: verificationTolerance,
    estimateRangePercent: defaultRangePercent,
    copyRequirement: 'Calories and sodium are estimates and must be described as varying by brand, portion, ingredient form, and cooking method.',
    ingredientReport: auditIngredients(ingredients),
    mealReport: auditMeals(meals, ingredients)
  };
}

function gitValue(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function snapshot(root) {
  return {
    generatedAt: new Date().toISOString(),
    git: {
      commit: gitValue(root, ['rev-parse', 'HEAD']),
      branch: gitValue(root, ['branch', '--show-current']),
      statusPorcelain: gitValue(root, ['status', '--short']) ?? ''
    }
  };
}

function writeJson(filePath, value) {
  writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(new URL('..', import.meta.url).pathname);
  const ingredientsPayload = readRecordSet(root, 'data/ingredients', 'ingredients');
  const mealsPayload = readRecordSet(root, 'data/meals', 'meals');
  const audit = buildTwoLevelNutritionAudit({
    ingredients: ingredientsPayload.ingredients ?? [],
    meals: mealsPayload.meals ?? [],
    snapshot: snapshot(root)
  });

  let output = '(not written; --no-write)';
  if (args.write) {
    const outDir = path.resolve(args.outDir ?? path.join(root, 'nutrition-audits', 'two-level', 'latest'));
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    writeJson(path.join(outDir, 'ingredient-nutrition-audit.json'), audit.ingredientReport);
    writeJson(path.join(outDir, 'meal-nutrition-audit.json'), audit.mealReport);
    writeJson(path.join(outDir, 'two-level-summary.json'), {
      schemaVersion: audit.schemaVersion,
      generatedAt: audit.generatedAt,
      snapshot: audit.snapshot,
      tolerance: audit.tolerance,
      estimateRangePercent: audit.estimateRangePercent,
      copyRequirement: audit.copyRequirement,
      ingredientSummary: audit.ingredientReport.summary,
      mealSummary: audit.mealReport.summary
    });
    output = path.relative(root, outDir);
  }

  console.log('Two-level nutrition verification');
  console.log('Ingredient rows: ' + JSON.stringify(audit.ingredientReport.summary));
  console.log('Meal rows: ' + JSON.stringify(audit.mealReport.summary));
  console.log('Tolerance: +/-' + Math.round(verificationTolerance.relative * 100) + '%');
  console.log('Output: ' + output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run();
  } catch (error) {
    console.error('Two-level nutrition audit failed:');
    console.error(error.message);
    process.exit(1);
  }
}
