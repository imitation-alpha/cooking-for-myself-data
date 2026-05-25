import { computeMealNutrition, defaultRangePercent } from './nutrition-audit.mjs';

export const reviewDataSchemaVersion = 'review-data-v1';

const massUnits = new Set(['g', 'gram', 'grams']);
const preferredNutritionSourceTypes = new Set(['health_canada_cnf', 'usda_fdc']);
const reviewStatuses = ['unreviewed', 'accepted', 'needs_fix', 'false_positive'];
const sodiumDriverTokens = [
  'soy',
  'sauce',
  'broth',
  'stock',
  'miso',
  'gochujang',
  'curry-block',
  'curry-paste',
  'luncheon',
  'fish-ball',
  'kimchi',
  'teriyaki',
  'hoisin',
  'satay',
  'oyster',
  'black-bean',
  'shaoxing'
];

function localizedName(record) {
  return record?.names?.en || record?.names?.zhHant || record?.id || '(unnamed)';
}

function normalizeUnit(unit) {
  return typeof unit === 'string' ? unit.trim().toLowerCase() : '';
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function unitWeights(profile) {
  return Array.isArray(profile?.unitWeights) ? profile.unitWeights : [];
}

function hasUnitWeight(profile, unit) {
  const normalized = normalizeUnit(unit);
  if (massUnits.has(normalized)) return true;
  return unitWeights(profile).some(
    (entry) => normalizeUnit(entry.unit) === normalized && typeof entry.grams === 'number' && entry.grams > 0
  );
}

function sourceRefs(profile) {
  return Array.isArray(profile?.sourceRefs) ? profile.sourceRefs : [];
}

function hasSourceSodium(profile) {
  return sourceRefs(profile).some((source) => typeof source?.sourceNutrientsPer100g?.sodiumMg === 'number');
}

function hasPreferredNutritionSource(profile) {
  return sourceRefs(profile).some((source) => preferredNutritionSourceTypes.has(source?.sourceType));
}

function isSodiumDriver(ingredient) {
  const haystack = [
    ingredient.id,
    localizedName(ingredient),
    ...(ingredient.tags ?? []),
    ...(ingredient.aliases ?? [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return sodiumDriverTokens.some((token) => haystack.includes(token));
}

function makeIssue({
  severity,
  domain,
  code,
  recordType,
  recordId,
  recordName,
  message,
  evidence = {},
  suggestedFix,
  relatedMeals = []
}) {
  return {
    id: [recordType, recordId, code, evidence.unit, evidence.mealId].filter(Boolean).join(':'),
    severity,
    domain,
    code,
    recordType,
    recordId,
    recordName,
    message,
    evidence,
    suggestedFix,
    relatedMeals,
    reviewStatus: 'unreviewed'
  };
}

function addIssue(issues, issue) {
  issues.push(makeIssue(issue));
}

function summarizeIssues(issues) {
  const bySeverity = { high: 0, medium: 0, low: 0 };
  const byDomain = {};
  for (const issue of issues) {
    bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
    byDomain[issue.domain] = (byDomain[issue.domain] ?? 0) + 1;
  }
  return {
    totalIssues: issues.length,
    bySeverity,
    byDomain
  };
}

function relatedMealMap(meals) {
  const byIngredientId = new Map();
  for (const meal of meals) {
    if (meal.status !== 'approved') continue;
    for (const usage of meal.ingredients ?? []) {
      if (!byIngredientId.has(usage.ingredientId)) byIngredientId.set(usage.ingredientId, []);
      byIngredientId.get(usage.ingredientId).push({ id: meal.id, name: localizedName(meal) });
    }
  }
  return byIngredientId;
}

function usedUnitMap(meals) {
  const byIngredientId = new Map();
  for (const meal of meals) {
    if (meal.status !== 'approved') continue;
    for (const usage of meal.ingredients ?? []) {
      const ingredientId = usage.ingredientId;
      if (!byIngredientId.has(ingredientId)) byIngredientId.set(ingredientId, new Map());
      const units = byIngredientId.get(ingredientId);
      const unit = normalizeUnit(usage.measure?.unit);
      if (!unit) continue;
      if (!units.has(unit)) units.set(unit, []);
      units.get(unit).push({ id: meal.id, name: localizedName(meal), amount: usage.amounts?.en ?? null });
    }
  }
  return byIngredientId;
}

function addSchemaIssues(issues, validationErrors) {
  for (const [index, message] of validationErrors.entries()) {
    addIssue(issues, {
      severity: 'high',
      domain: 'schema',
      code: 'schema-validation-error',
      recordType: 'dataset',
      recordId: 'validation',
      recordName: 'Dataset validation',
      message,
      evidence: { index },
      suggestedFix: 'Fix the schema validation error before reviewing nutrition estimates.'
    });
  }
}

function addNutritionIssues(issues, ingredients, relatedMealsByIngredient) {
  for (const ingredient of ingredients) {
    if (ingredient.status !== 'approved') continue;
    const recordName = localizedName(ingredient);
    const relatedMeals = relatedMealsByIngredient.get(ingredient.id) ?? [];
    const profile = ingredient.nutrition;

    if (!profile) {
      addIssue(issues, {
        severity: 'high',
        domain: 'nutrition',
        code: 'missing-nutrition-profile',
        recordType: 'ingredient',
        recordId: ingredient.id,
        recordName,
        message: 'Approved ingredient is missing calories and sodium profile data.',
        evidence: { usedByApprovedMeals: relatedMeals.length },
        suggestedFix: 'Add estimated nutrition with kcal/sodium per 100 g, unit conversions, sourceRefs, and a 90%-115% range.',
        relatedMeals
      });
      continue;
    }

    if (profile.estimate !== true) {
      addIssue(issues, {
        severity: 'high',
        domain: 'nutrition',
        code: 'missing-estimate-disclosure',
        recordType: 'ingredient',
        recordId: ingredient.id,
        recordName,
        message: 'Nutrition profile does not mark values as estimates.',
        evidence: { estimate: profile.estimate ?? null },
        suggestedFix: 'Set nutrition.estimate to true and keep user-facing copy clear that values are estimates.',
        relatedMeals
      });
    }

    const range = profile.rangePercent;
    if (!isObject(range) || range.low !== defaultRangePercent.low || range.high !== defaultRangePercent.high) {
      addIssue(issues, {
        severity: 'high',
        domain: 'nutrition',
        code: 'invalid-estimate-range',
        recordType: 'ingredient',
        recordId: ingredient.id,
        recordName,
        message: 'Nutrition estimate range must be 90% low and 115% high.',
        evidence: { expected: defaultRangePercent, actual: range ?? null },
        suggestedFix: 'Use rangePercent: { "low": 0.9, "high": 1.15 } for calories and sodium estimates.',
        relatedMeals
      });
    }

    const nutrients = profile.nutrientsPer100g;
    for (const key of ['kcal', 'sodiumMg']) {
      if (!isObject(nutrients) || typeof nutrients[key] !== 'number' || nutrients[key] < 0) {
        addIssue(issues, {
          severity: 'high',
          domain: 'nutrition',
          code: 'invalid-nutrients-per-100g',
          recordType: 'ingredient',
          recordId: ingredient.id,
          recordName,
          message: 'Nutrition profile has missing or invalid ' + key + ' per 100 g.',
          evidence: { key, actual: nutrients?.[key] ?? null },
          suggestedFix: 'Set nutrition.nutrientsPer100g.' + key + ' from an accepted source.',
          relatedMeals
        });
      }
    }

    if (sourceRefs(profile).length === 0) {
      addIssue(issues, {
        severity: 'high',
        domain: 'source',
        code: 'missing-source-refs',
        recordType: 'ingredient',
        recordId: ingredient.id,
        recordName,
        message: 'Nutrition profile has no cited source references.',
        evidence: { sourceRefs: 0 },
        suggestedFix: 'Add sourceRefs from Health Canada CNF or USDA FDC first; use brand/Open Food Facts only for branded overrides.',
        relatedMeals
      });
    }

    if (sourceRefs(profile).length > 0 && !hasPreferredNutritionSource(profile)) {
      addIssue(issues, {
        severity: 'medium',
        domain: 'source',
        code: 'non-preferred-nutrition-source',
        recordType: 'ingredient',
        recordId: ingredient.id,
        recordName,
        message: 'Nutrition profile uses an internal or non-preferred source instead of Health Canada CNF or USDA FDC.',
        evidence: { sourceTypes: sourceRefs(profile).map((source) => source.sourceType ?? null) },
        suggestedFix: 'Verify kcal and sodium against Health Canada CNF or USDA FDC, then replace or add an official sourceRef.',
        relatedMeals
      });
    }

    if (profile.reviewStatus === 'needs_review') {
      addIssue(issues, {
        severity: 'medium',
        domain: 'source',
        code: 'nutrition-needs-source-review',
        recordType: 'ingredient',
        recordId: ingredient.id,
        recordName,
        message: 'Nutrition profile is still marked needs_review.',
        evidence: { reviewStatus: profile.reviewStatus, confidence: profile.confidence ?? null },
        suggestedFix: 'Complete source verification and update reviewStatus after the values and unit conversions are checked.',
        relatedMeals
      });
    }

    if (isSodiumDriver(ingredient) && !hasSourceSodium(profile)) {
      addIssue(issues, {
        severity: 'high',
        domain: 'source',
        code: 'sodium-driver-unverified-sodium',
        recordType: 'ingredient',
        recordId: ingredient.id,
        recordName,
        message: 'Sodium-driver ingredient does not have source sodium values to verify against.',
        evidence: { sourceRefs: sourceRefs(profile).length, tags: ingredient.tags ?? [] },
        suggestedFix: 'Verify sodium against an accepted source and include sourceNutrientsPer100g.sodiumMg.',
        relatedMeals
      });
    }
  }
}

function addMeasureIssues(issues, meals, ingredientById, relatedMealsByIngredient, unitsByIngredient) {
  for (const meal of meals) {
    if (meal.status !== 'approved') continue;
    for (const usage of meal.ingredients ?? []) {
      const ingredient = ingredientById.get(usage.ingredientId);
      const recordName = localizedName(ingredient) || usage.ingredientId;
      if (!isObject(usage.measure)) {
        addIssue(issues, {
          severity: 'high',
          domain: 'measure',
          code: 'missing-structured-measure',
          recordType: 'meal',
          recordId: meal.id,
          recordName: localizedName(meal),
          message: 'Approved meal ingredient is missing machine-readable measure data.',
          evidence: { ingredientId: usage.ingredientId, amount: usage.amounts?.en ?? null },
          suggestedFix: 'Add measure: { quantity, unit } to this meal ingredient.',
          relatedMeals: [{ id: meal.id, name: localizedName(meal) }]
        });
        continue;
      }
      if (typeof usage.measure.quantity !== 'number' || usage.measure.quantity <= 0) {
        addIssue(issues, {
          severity: 'high',
          domain: 'measure',
          code: 'invalid-measure-quantity',
          recordType: 'meal',
          recordId: meal.id,
          recordName: localizedName(meal),
          message: 'Meal ingredient measure quantity must be a positive number.',
          evidence: { ingredientId: usage.ingredientId, measure: usage.measure },
          suggestedFix: 'Use a positive numeric measure.quantity.',
          relatedMeals: [{ id: meal.id, name: localizedName(meal) }]
        });
      }
      if (!normalizeUnit(usage.measure.unit)) {
        addIssue(issues, {
          severity: 'high',
          domain: 'measure',
          code: 'invalid-measure-unit',
          recordType: 'meal',
          recordId: meal.id,
          recordName: localizedName(meal),
          message: 'Meal ingredient measure unit is missing.',
          evidence: { ingredientId: usage.ingredientId, measure: usage.measure },
          suggestedFix: 'Set measure.unit to a canonical unit such as g, tbsp, piece, clove, or stalk.',
          relatedMeals: [{ id: meal.id, name: localizedName(meal) }]
        });
      }
      if (!ingredient) {
        addIssue(issues, {
          severity: 'high',
          domain: 'schema',
          code: 'missing-ingredient-reference',
          recordType: 'meal',
          recordId: meal.id,
          recordName: localizedName(meal),
          message: 'Approved meal references an ingredient id that does not exist.',
          evidence: { ingredientId: usage.ingredientId },
          suggestedFix: 'Add the ingredient record or update the meal ingredientId.',
          relatedMeals: [{ id: meal.id, name: localizedName(meal) }]
        });
      }
      recordName;
    }
  }

  for (const [ingredientId, units] of unitsByIngredient.entries()) {
    const ingredient = ingredientById.get(ingredientId);
    const profile = ingredient?.nutrition;
    for (const [unit, relatedMeals] of units.entries()) {
      if (!profile || !hasUnitWeight(profile, unit)) {
        addIssue(issues, {
          severity: 'high',
          domain: 'measure',
          code: 'missing-unit-conversion',
          recordType: 'ingredient',
          recordId: ingredientId,
          recordName: localizedName(ingredient) || ingredientId,
          message: 'Ingredient is used by an approved meal in a unit with no gram conversion.',
          evidence: { unit },
          suggestedFix: 'Add nutrition.unitWeights entry for "' + unit + '" or convert the meal measure to grams.',
          relatedMeals: relatedMealsByIngredient.get(ingredientId) ?? relatedMeals
        });
      }
    }
  }
}

function addMealMathIssues(issues, meals, ingredientById) {
  for (const meal of meals) {
    if (meal.status !== 'approved') continue;
    const nutrition = computeMealNutrition(meal, ingredientById);
    if (!nutrition.computable) {
      addIssue(issues, {
        severity: 'high',
        domain: 'meal-math',
        code: 'meal-nutrition-uncomputable',
        recordType: 'meal',
        recordId: meal.id,
        recordName: localizedName(meal),
        message: 'Meal calories and sodium cannot be computed from current ingredient profiles and measures.',
        evidence: { missing: nutrition.missing },
        suggestedFix: 'Fix missing ingredient nutrition, structured measures, unit conversions, or nutrition assumptions.',
        relatedMeals: [{ id: meal.id, name: localizedName(meal) }]
      });
    }
  }
}

function recordSummaries(records, type, relatedMealsByIngredient) {
  return records.map((record) => ({
    type,
    id: record.id,
    status: record.status,
    name: localizedName(record),
    names: record.names ?? {},
    imageCount: Array.isArray(record.images) ? record.images.length : 0,
    nutrition: type === 'ingredient' ? record.nutrition ?? null : undefined,
    relatedMeals: type === 'ingredient' ? relatedMealsByIngredient.get(record.id) ?? [] : undefined,
    raw: record
  }));
}

function normalizeMetadata(snapshot) {
  return {
    schemaVersion: snapshot?.schemaVersion ?? reviewDataSchemaVersion,
    generatedAt: snapshot?.generatedAt ?? new Date().toISOString(),
    git: snapshot?.git ?? null,
    hashes: snapshot?.hashes ?? {},
    reviewStatuses
  };
}

export function buildReviewData({
  snapshot,
  ingredients,
  meals,
  validationErrors = [],
  nutritionGate = null
}) {
  const allIngredients = Array.isArray(ingredients) ? ingredients : [];
  const allMeals = Array.isArray(meals) ? meals : [];
  const approvedMeals = allMeals.filter((meal) => meal.status === 'approved');
  const ingredientById = new Map(allIngredients.map((ingredient) => [ingredient.id, ingredient]));
  const relatedMealsByIngredient = relatedMealMap(approvedMeals);
  const unitsByIngredient = usedUnitMap(approvedMeals);
  const issues = [];

  addSchemaIssues(issues, validationErrors);
  addNutritionIssues(issues, allIngredients, relatedMealsByIngredient);
  addMeasureIssues(issues, approvedMeals, ingredientById, relatedMealsByIngredient, unitsByIngredient);
  addMealMathIssues(issues, approvedMeals, ingredientById);

  const issueSummary = summarizeIssues(issues);

  return {
    metadata: normalizeMetadata(snapshot),
    summary: {
      ...issueSummary,
      records: {
        ingredients: allIngredients.length,
        meals: allMeals.length,
        approvedIngredients: allIngredients.filter((ingredient) => ingredient.status === 'approved').length,
        approvedMeals: approvedMeals.length
      }
    },
    nutritionGate,
    records: {
      ingredients: recordSummaries(allIngredients, 'ingredient', relatedMealsByIngredient),
      meals: recordSummaries(allMeals, 'meal', relatedMealsByIngredient)
    },
    issues,
    copy: {
      estimateDisclosure:
        'Calories and sodium are estimates. Actual values vary by brand, portion size, ingredient form, and cooking method.',
      flagDisclosure:
        'Flags identify records that need review; they are not final nutrition judgments until source verification is complete.'
    }
  };
}
