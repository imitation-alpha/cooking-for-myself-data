import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  aggregateSubagentResults,
  buildPackets,
  computeMealNutrition,
  validateIngredientNutrition,
  validateMealAssumptions
} from '../nutrition-audit.mjs';

function nutrition(overrides = {}) {
  return {
    estimate: true,
    rangePercent: { low: 0.9, high: 1.15 },
    nutrientsPer100g: { kcal: 100, sodiumMg: 200 },
    unitWeights: [{ unit: 'piece', grams: 50 }],
    sourceRefs: [
      {
        id: 'source',
        sourceType: 'usda_fdc',
        sourceName: 'USDA FoodData Central',
        sourceURL: 'https://fdc.nal.usda.gov/',
        accessedAt: '2026-05-19',
        foodDescription: 'Test food',
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
    names: { en: id, zhHant: id },
    section: 'dryGoods',
    aliases: [],
    nutrition: nutrition(overrides)
  };
}

function writeJson(filePath, value) {
  writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

test('ingredient source-match requires cited source nutrient values to match dataset nutrients', () => {
  const passingIssues = [];
  const passing = validateIngredientNutrition(ingredient('egg'), passingIssues);
  assert.equal(passing.status, 'pass');
  assert.equal(passingIssues.some((entry) => entry.code === 'source-nutrient-mismatch'), false);

  const failingIssues = [];
  const failing = validateIngredientNutrition(
    ingredient('egg', {
      sourceRefs: [
        {
          id: 'source',
          sourceType: 'usda_fdc',
          sourceName: 'USDA FoodData Central',
          sourceURL: 'https://fdc.nal.usda.gov/',
          accessedAt: '2026-05-19',
          foodDescription: 'Test food',
          sourceNutrientsPer100g: { kcal: 150, sodiumMg: 200 }
        }
      ]
    }),
    failingIssues
  );
  assert.equal(failing.status, 'fail');
  assert.equal(failingIssues.some((entry) => entry.code === 'source-nutrient-mismatch'), true);
});

test('meal nutrition includes cooking oil assumptions', () => {
  const meal = {
    id: 'test-meal',
    ingredients: [
      {
        ingredientId: 'egg',
        measure: { quantity: 1, unit: 'piece' }
      }
    ],
    nutritionAssumptions: [
      {
        id: 'default-oil',
        kind: 'cooking_oil',
        measure: { quantity: 1, unit: 'tbsp' },
        reason: 'Step uses oil.'
      }
    ]
  };
  const result = computeMealNutrition(meal, new Map([['egg', ingredient('egg')]]));
  assert.equal(result.computable, true);
  assert.equal(result.kcal.low, 152);
  assert.equal(result.kcal.high, 195);
});

test('assumption validator blocks implied oil without a cooking_oil assumption', () => {
  const issues = [];
  validateMealAssumptions(
    [
      {
        id: 'oil-meal',
        steps: [{ detail: { en: 'Heat oil in the pan.', zhHant: '落油。' } }],
        nutritionAssumptions: []
      }
    ],
    issues
  );
  assert.equal(issues.some((entry) => entry.code === 'missing-cooking-oil-assumption'), true);
});

test('meal-level packet includes ingredient profiles and assumption profiles', () => {
  const packets = buildPackets({
    snapshot: { git: { commit: 'test' } },
    ingredients: [ingredient('egg'), ingredient('light-soy')],
    meals: [
      {
        id: 'soy-egg',
        names: { en: 'Soy egg', zhHant: 'Soy egg' },
        servings: '1',
        ingredients: [
          { ingredientId: 'egg', measure: { quantity: 1, unit: 'piece' } },
          { ingredientId: 'light-soy', measure: { quantity: 1, unit: 'tbsp' } }
        ],
        nutritionAssumptions: [{ id: 'oil', kind: 'cooking_oil', measure: { quantity: 1, unit: 'tsp' }, reason: 'Step uses oil.' }],
        steps: [{ detail: { en: 'Heat oil.', zhHant: '落油。' } }]
      }
    ]
  });
  const mealPacket = packets.find((packet) => packet.packetId === 'subagent-e-meal-level-critic');
  assert.ok(mealPacket);
  assert.equal(mealPacket.ingredientProfiles.length, 2);
  assert.equal(Boolean(mealPacket.assumptionNutritionProfiles.cooking_oil), true);
  assert.equal(mealPacket.representativeMeals[0].nutritionAssumptions.length, 1);
});

test('subagent aggregate blocks partial packet results and blocked deterministic reports', () => {
  const runDir = mkdtempSync(path.join(os.tmpdir(), 'cfm-nutrition-test-'));
  mkdirSync(path.join(runDir, 'packets'));
  mkdirSync(path.join(runDir, 'results'));

  writeJson(path.join(runDir, 'deterministic-report.json'), {
    summary: { releaseGatePassed: false }
  });
  writeJson(path.join(runDir, 'packets', 'subagent-a-sodium-drivers.json'), {
    packetId: 'subagent-a-sodium-drivers',
    ingredients: [{ id: 'light-soy' }, { id: 'oyster-sauce' }]
  });
  writeJson(path.join(runDir, 'packets', 'subagent-e-meal-level-critic.json'), {
    packetId: 'subagent-e-meal-level-critic',
    representativeMeals: [{ id: 'tomato-egg' }]
  });
  writeJson(path.join(runDir, 'results', 'subagent-a-sodium-drivers.json'), {
    packetId: 'subagent-a-sodium-drivers',
    rows: [
      {
        ingredientId: 'light-soy',
        status: 'pass',
        sourceUsed: 'USDA FoodData Central',
        sourceURL: 'https://fdc.nal.usda.gov/',
        accessDate: '2026-05-19',
        sourceType: 'usda_fdc',
        sourceKcal: 100,
        sourceSodiumMg: 200,
        datasetKcal: 100,
        datasetSodiumMg: 200,
        unitConversionChecked: 'yes',
        deltaFromSource: '0',
        confidence: 'medium',
        correctionRecommendation: 'none'
      }
    ]
  });

  const aggregate = aggregateSubagentResults(runDir);
  assert.equal(aggregate.releaseGatePassed, false);
  assert.equal(aggregate.blockedReasons.includes('deterministic report is still blocked'), true);
  assert.equal(aggregate.rowIssues.some((entry) => entry.code === 'missing-row-result' && entry.expected === 'oyster-sauce'), true);
  assert.equal(aggregate.rowIssues.some((entry) => entry.code === 'missing-packet-results' && entry.packetId === 'subagent-e-meal-level-critic'), true);
});
