import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReviewData } from '../review-data-core.mjs';

const localizedName = (name) => ({
  zhHant: name,
  yue: name,
  zhHans: name,
  en: name,
  ja: name,
  ko: name,
  th: name,
  vi: name,
  id: name,
  tl: name
});

function ingredient(id, overrides = {}) {
  return {
    id,
    status: 'approved',
    names: localizedName(id),
    section: 'dryGoods',
    aliases: [],
    tags: [],
    images: [],
    ...overrides
  };
}

function meal(id, ingredients, overrides = {}) {
  return {
    id,
    status: 'approved',
    names: localizedName(id),
    ingredients,
    steps: [],
    images: [],
    ...overrides
  };
}

function nutrition(overrides = {}) {
  return {
    estimate: true,
    rangePercent: { low: 0.9, high: 1.15 },
    nutrientsPer100g: { kcal: 100, sodiumMg: 20 },
    unitWeights: [{ unit: 'piece', grams: 50 }],
    sourceRefs: [
      {
        id: 'source',
        sourceType: 'usda_fdc',
        sourceName: 'USDA FoodData Central',
        sourceURL: 'https://fdc.nal.usda.gov/',
        accessedAt: '2026-05-19',
        foodDescription: 'Test food',
        sourceNutrientsPer100g: { kcal: 100, sodiumMg: 20 }
      }
    ],
    confidence: 'medium',
    reviewStatus: 'reviewed',
    ...overrides
  };
}

const snapshot = {
  generatedAt: '2026-05-19T12:00:00.000Z',
  git: { commit: 'abc123', branch: 'test', dirty: false },
  hashes: { appSeed: 'seed-hash' },
  schemaVersion: 'review-data-v1'
};

test('missing nutrition creates a high issue for used approved ingredients', () => {
  const review = buildReviewData({
    snapshot,
    ingredients: [ingredient('egg')],
    meals: [
      meal('egg-rice', [
        { ingredientId: 'egg', measure: { quantity: 1, unit: 'piece' }, amounts: { en: '1 egg' } }
      ])
    ]
  });

  assert.equal(review.metadata.schemaVersion, 'review-data-v1');
  assert.equal(review.records.ingredients.length, 1);
  assert.equal(review.records.meals.length, 1);
  assert.ok(
    review.issues.some(
      (issue) =>
        issue.severity === 'high' &&
        issue.domain === 'nutrition' &&
        issue.code === 'missing-nutrition-profile' &&
        issue.recordType === 'ingredient' &&
        issue.recordId === 'egg'
    )
  );
});

test('sauce sodium source gaps are high severity', () => {
  const review = buildReviewData({
    snapshot,
    ingredients: [
      ingredient('light-soy', {
        tags: ['sauce'],
        nutrition: nutrition({ sourceRefs: [] })
      })
    ],
    meals: [
      meal('soy-noodles', [
        { ingredientId: 'light-soy', measure: { quantity: 1, unit: 'tbsp' }, amounts: { en: '1 tbsp' } }
      ])
    ]
  });

  assert.ok(
    review.issues.some(
      (issue) =>
        issue.severity === 'high' &&
        issue.domain === 'source' &&
        issue.code === 'sodium-driver-unverified-sodium' &&
        issue.recordId === 'light-soy'
    )
  );
});

test('missing unit conversion is high severity', () => {
  const review = buildReviewData({
    snapshot,
    ingredients: [
      ingredient('egg', {
        nutrition: nutrition({ unitWeights: [] })
      })
    ],
    meals: [
      meal('egg-rice', [
        { ingredientId: 'egg', measure: { quantity: 1, unit: 'piece' }, amounts: { en: '1 egg' } }
      ])
    ]
  });

  assert.ok(
    review.issues.some(
      (issue) =>
        issue.severity === 'high' &&
        issue.domain === 'measure' &&
        issue.code === 'missing-unit-conversion' &&
        issue.recordId === 'egg' &&
        issue.evidence.unit === 'piece'
    )
  );
});

test('invalid calorie and sodium estimate ranges are flagged', () => {
  const review = buildReviewData({
    snapshot,
    ingredients: [
      ingredient('egg', {
        nutrition: nutrition({ rangePercent: { low: 1, high: 1 } })
      })
    ],
    meals: [
      meal('egg-rice', [
        { ingredientId: 'egg', measure: { quantity: 1, unit: 'piece' }, amounts: { en: '1 egg' } }
      ])
    ]
  });

  assert.ok(
    review.issues.some(
      (issue) =>
        issue.severity === 'high' &&
        issue.domain === 'nutrition' &&
        issue.code === 'invalid-estimate-range' &&
        issue.recordId === 'egg'
    )
  );
});

test('internal nutrition baselines are flagged for source review', () => {
  const review = buildReviewData({
    snapshot,
    ingredients: [
      ingredient('egg', {
        nutrition: nutrition({
          sourceRefs: [
            {
              id: 'baseline-egg',
              sourceType: 'other_reviewed',
              sourceName: 'Cooking For Myself baseline nutrition estimate',
              sourceURL: 'local://nutrition-baseline#egg',
              accessedAt: '2026-05-20',
              foodDescription: 'Egg baseline',
              sourceNutrientsPer100g: { kcal: 100, sodiumMg: 20 }
            }
          ],
          reviewStatus: 'needs_review'
        })
      })
    ],
    meals: []
  });

  assert.ok(
    review.issues.some(
      (issue) =>
        issue.severity === 'medium' &&
        issue.domain === 'source' &&
        issue.code === 'non-preferred-nutrition-source' &&
        issue.recordId === 'egg'
    )
  );
  assert.ok(
    review.issues.some(
      (issue) =>
        issue.severity === 'medium' &&
        issue.domain === 'source' &&
        issue.code === 'nutrition-needs-source-review' &&
        issue.recordId === 'egg'
    )
  );
});

test('review data includes metadata and issue summary counts', () => {
  const review = buildReviewData({
    snapshot,
    ingredients: [ingredient('egg')],
    meals: []
  });

  assert.equal(review.metadata.generatedAt, snapshot.generatedAt);
  assert.equal(review.metadata.git.commit, 'abc123');
  assert.equal(typeof review.summary.totalIssues, 'number');
  assert.equal(typeof review.summary.bySeverity.high, 'number');
  assert.equal(review.copy.estimateDisclosure.includes('estimates'), true);
});
