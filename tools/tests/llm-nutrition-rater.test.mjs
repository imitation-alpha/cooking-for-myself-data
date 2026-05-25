import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregateRaterRuns,
  buildRaterPacket,
  normalizeRaterOutput,
  raterOutputSchema
} from '../llm-nutrition-rater.mjs';

const ingredientReport = {
  summary: { totalRows: 2, passCount: 1, warningCount: 0, failCount: 1, computedOnlyCount: 0 },
  rows: [
    {
      id: 'light-soy',
      name: 'Light soy sauce',
      status: 'fail',
      dataset: { kcal: 60, sodiumMg: 5490 },
      bestSource: { sourceName: 'USDA FoodData Central', sourceURL: 'https://fdc.nal.usda.gov/' },
      issues: [{ code: 'missing-source-sodium', severity: 'fail', message: 'Missing source sodium.' }]
    },
    {
      id: 'egg',
      name: 'Egg',
      status: 'pass',
      dataset: { kcal: 143, sodiumMg: 142 },
      bestSource: { sourceName: 'USDA FoodData Central', sourceURL: 'https://fdc.nal.usda.gov/' },
      issues: []
    }
  ]
};

const mealReport = {
  summary: { totalRows: 2, passCount: 0, warningCount: 0, failCount: 1, computedOnlyCount: 1 },
  topCaloriesMeals: [{ id: 'soy-noodles', name: 'Soy noodles', computed: { kcal: { low: 500, high: 640 } } }],
  topSodiumMeals: [{ id: 'soy-noodles', name: 'Soy noodles', computed: { sodiumMg: { low: 1800, high: 2300 } } }],
  rows: [
    {
      id: 'soy-noodles',
      name: 'Soy noodles',
      status: 'fail',
      computable: false,
      issues: [{ code: 'missing-unit-conversion', severity: 'fail', message: 'Missing tbsp conversion.' }]
    },
    {
      id: 'egg-rice',
      name: 'Egg rice',
      status: 'computed_only',
      computable: true,
      issues: []
    }
  ]
};

const twoLevelSummary = {
  schemaVersion: 'two-level-nutrition-audit-v1',
  generatedAt: '2026-05-20T12:00:00.000Z',
  tolerance: { relative: 0.1 },
  copyRequirement: 'Calories and sodium are estimates and must be described as varying by brand, portion, ingredient form, and cooking method.',
  ingredientSummary: ingredientReport.summary,
  mealSummary: mealReport.summary
};

function completedRater(verdict, overrides = {}) {
  return {
    rater: overrides.rater ?? 'codex',
    status: 'completed',
    result: {
      verdict,
      hardFails: [],
      warnings: [],
      ingredientLevel: { summary: 'Ingredient review complete.', sampledRows: [], sourceCheckNotes: [] },
      mealLevel: { summary: 'Meal review complete.', recomputationConcerns: [], sodiumLevelConcerns: [] },
      copyCheck: { estimatesDisclosed: true, notes: 'Estimate wording is present.' },
      humanReviewReason: '',
      ...overrides.result
    }
  };
}

test('packet builder includes audit reports, top rows, and estimate wording requirement', () => {
  const packet = buildRaterPacket({
    ingredientReport,
    mealReport,
    twoLevelSummary,
    deterministicGate: { status: 'blocked', highSeverityIssues: 10 }
  });

  assert.equal(packet.schemaVersion, 'llm-nutrition-rater-packet-v1');
  assert.equal(packet.tolerance.relative, 0.1);
  assert.equal(packet.copyRequirement.includes('estimates'), true);
  assert.deepEqual(packet.deterministicGate, { status: 'blocked', highSeverityIssues: 10 });
  assert.equal(packet.ingredientLevel.report.rows.length, 2);
  assert.equal(packet.mealLevel.report.rows.length, 2);
  assert.equal(packet.ingredientLevel.highImpactRows.some((row) => row.id === 'light-soy'), true);
  assert.equal(packet.mealLevel.topCaloriesMeals[0].id, 'soy-noodles');
  assert.equal(packet.mealLevel.topSodiumMeals[0].id, 'soy-noodles');
});

test('aggregator passes when codex is good and claude only warns', () => {
  const summary = aggregateRaterRuns({
    codex: completedRater('good', { rater: 'codex' }),
    claude: completedRater('warning', {
      rater: 'claude',
      result: { warnings: ['Spot check sodium drivers before release.'] }
    })
  });

  assert.equal(summary.finalVerdict, 'pass');
  assert.equal(summary.decisionReasons.length, 0);
  assert.deepEqual(summary.warnings, [
    { rater: 'claude', message: 'Spot check sodium drivers before release.' }
  ]);
});

test('aggregator requests human review when either rater fails', () => {
  const summary = aggregateRaterRuns({
    codex: completedRater('good', { rater: 'codex' }),
    claude: completedRater('fail', {
      rater: 'claude',
      result: {
        hardFails: ['Soy sauce sodium is unverified.'],
        humanReviewReason: 'High-impact sodium driver has no source sodium.'
      }
    })
  });

  assert.equal(summary.finalVerdict, 'human_review');
  assert.equal(summary.decisionReasons.some((reason) => reason.includes('claude reported fail')), true);
  assert.equal(summary.humanReviewReasons.some((reason) => reason.includes('High-impact sodium driver')), true);
});

test('aggregator requests human review on invalid output or cli error', () => {
  const invalid = normalizeRaterOutput({
    rater: 'codex',
    rawText: '{"verdict":"maybe"}',
    exitCode: 0,
    timedOut: false
  });
  const cliError = normalizeRaterOutput({
    rater: 'claude',
    rawText: '',
    exitCode: 1,
    timedOut: false,
    stderr: 'authentication failed'
  });

  const summary = aggregateRaterRuns({ codex: invalid, claude: cliError });

  assert.equal(summary.finalVerdict, 'human_review');
  assert.equal(summary.raters.codex.status, 'schema_invalid');
  assert.equal(summary.raters.claude.status, 'cli_error');
  assert.equal(summary.decisionReasons.length, 2);
});

test('rater output schema requires the planned structured fields', () => {
  assert.equal(raterOutputSchema.type, 'object');
  assert.equal(raterOutputSchema.properties.verdict.enum.includes('good'), true);
  assert.equal(raterOutputSchema.required.includes('ingredientLevel'), true);
  assert.equal(raterOutputSchema.required.includes('mealLevel'), true);
  assert.equal(raterOutputSchema.required.includes('copyCheck'), true);
});
