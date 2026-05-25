import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditIngredients,
  auditMeals,
  buildTwoLevelNutritionAudit,
  verificationTolerance
} from '../two-level-nutrition-audit.mjs';

function nutrition(overrides = {}) {
  return {
    estimate: true,
    rangePercent: { low: 0.9, high: 1.15 },
    nutrientsPer100g: { kcal: 109, sodiumMg: 218 },
    unitWeights: [{ unit: 'piece', grams: 50 }],
    sourceRefs: [
      {
        id: 'source',
        sourceType: 'usda_fdc',
        sourceName: 'USDA FoodData Central',
        sourceURL: 'https://fdc.nal.usda.gov/',
        accessedAt: '2026-05-19',
        foodDescription: 'Test food, raw',
        sourceNutrientsPer100g: { kcal: 100, sodiumMg: 200 }
      }
    ],
    confidence: 'medium',
    reviewStatus: 'reviewed',
    ...overrides
  };
}

function ingredient(id, overrides = {}) {
  return {
    id,
    status: 'approved',
    names: { en: id, zhHant: id },
    aliases: [],
    tags: [],
    section: 'dryGoods',
    nutrition: nutrition(),
    ...overrides
  };
}

function meal(id, ingredients, overrides = {}) {
  return {
    id,
    status: 'approved',
    names: { en: id, zhHant: id },
    ingredients,
    nutritionAssumptions: [],
    steps: [],
    ...overrides
  };
}

test('ingredient audit passes values within plus/minus ten percent of a cited source', () => {
  const report = auditIngredients([ingredient('egg')]);
  assert.equal(verificationTolerance.relative, 0.1);
  assert.equal(report.rows[0].status, 'pass');
  assert.equal(report.rows[0].deltaPercent.kcal, 9);
  assert.equal(report.summary.passCount, 1);
});

test('ingredient audit fails values outside plus/minus ten percent', () => {
  const report = auditIngredients([
    ingredient('egg', {
      nutrition: nutrition({
        nutrientsPer100g: { kcal: 112, sodiumMg: 218 }
      })
    })
  ]);

  assert.equal(report.rows[0].status, 'fail');
  assert.equal(report.rows[0].issues.some((issue) => issue.code === 'source-value-outside-tolerance'), true);
  assert.equal(report.summary.failCount, 1);
});

test('sodium-driver ingredient without source sodium fails source verification', () => {
  const report = auditIngredients([
    ingredient('light-soy', {
      tags: ['sauce'],
      nutrition: nutrition({
        sourceRefs: [
          {
            id: 'source',
            sourceType: 'usda_fdc',
            sourceName: 'USDA FoodData Central',
            sourceURL: 'https://fdc.nal.usda.gov/',
            accessedAt: '2026-05-19',
            foodDescription: 'Soy sauce',
            sourceNutrientsPer100g: { kcal: 100 }
          }
        ]
      })
    })
  ]);

  assert.equal(report.rows[0].status, 'fail');
  assert.equal(report.rows[0].issues.some((issue) => issue.code === 'missing-source-sodium'), true);
});

test('meal audit recomputes computable meals as computed only when no stored value exists', () => {
  const ingredients = [ingredient('egg')];
  const meals = [
    meal('egg-rice', [
      { ingredientId: 'egg', measure: { quantity: 2, unit: 'piece' }, amounts: { en: '2 eggs' } }
    ])
  ];

  const report = auditMeals(meals, ingredients);
  assert.equal(report.rows[0].status, 'computed_only');
  assert.equal(report.rows[0].computed.kcal.low, 98);
  assert.equal(report.rows[0].computed.kcal.high, 125);
  assert.equal(report.summary.computedOnlyCount, 1);
});

test('meal audit fails when stored meal calories are outside plus/minus ten percent', () => {
  const ingredients = [ingredient('egg')];
  const meals = [
    meal(
      'egg-rice',
      [{ ingredientId: 'egg', measure: { quantity: 2, unit: 'piece' }, amounts: { en: '2 eggs' } }],
      {
        nutrition: {
          kcal: { low: 30, high: 40 },
          sodiumMg: { low: 190, high: 251 },
          sodiumLevel: 'lower'
        }
      }
    )
  ];

  const report = auditMeals(meals, ingredients);
  assert.equal(report.rows[0].status, 'fail');
  assert.equal(report.rows[0].issues.some((issue) => issue.code === 'stored-meal-value-outside-tolerance'), true);
});

test('two-level audit returns separate ingredient and meal reports', () => {
  const ingredients = [ingredient('egg')];
  const meals = [
    meal('egg-rice', [
      { ingredientId: 'egg', measure: { quantity: 1, unit: 'piece' }, amounts: { en: '1 egg' } }
    ])
  ];

  const audit = buildTwoLevelNutritionAudit({ ingredients, meals, snapshot: { generatedAt: '2026-05-19T12:00:00.000Z' } });
  assert.equal(audit.tolerance.relative, 0.1);
  assert.equal(audit.ingredientReport.rows.length, 1);
  assert.equal(audit.mealReport.rows.length, 1);
  assert.equal(audit.copyRequirement.includes('estimates'), true);
});
