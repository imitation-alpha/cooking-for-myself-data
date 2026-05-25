# Nutrition Verification

Nutrition values in this dataset are planning estimates, not medical advice or
label-grade nutrition facts. User-facing app copy must say estimates vary by
brand, portion size, and cooking method.

## Data Contract

Ingredient records may include `nutrition`:

- `estimate: true`
- `rangePercent: { "low": 0.9, "high": 1.15 }`
- `nutrientsPer100g.kcal`
- `nutrientsPer100g.sodiumMg`
- `unitWeights[]` for non-gram recipe units such as `tbsp`, `egg`, `clove`,
  `stalk`, `slice`, `cup`, `thigh`, or `block`
- `sourceRefs[]` with Health Canada CNF or USDA FDC preferred
- `sourceRefs[].sourceNutrientsPer100g` copied from the cited source so the
  deterministic gate can compare dataset values against cited values
- `confidence` and `reviewStatus`

Meal ingredient rows may include `measure` beside localized `amounts`. Keep
`amounts` for display and use `measure` for computation:

```json
{
  "ingredientId": "light-soy",
  "amounts": { "zhHant": "1 湯匙", "en": "1 tbsp" },
  "measure": { "quantity": 1, "unit": "tbsp" }
}
```

Meal records may include `nutritionAssumptions` for cooking oil, added salt, or
sauce/broth adjustments that affect estimates but should not become shopping
list items.

The verifier has built-in deterministic profiles for `cooking_oil` and
`added_salt` so meal totals can include implied cooking additions. These
assumptions are still reviewed by the meal-level critic before release.

## Deterministic Gate

Generate a local audit packet:

```bash
npm run nutrition:audit
```

Run the release-blocking gate. It runs the normal dataset validator first, then
the nutrition-specific strict gate:

```bash
npm run nutrition:gate
```

The gate passes only when:

- at least 90% of audited ingredient rows pass source-match checks
- source-match checks compare `nutrientsPer100g` to cited
  `sourceNutrientsPer100g` values within rounding tolerance
- no high-severity deterministic issue remains
- every high-impact calorie or sodium ingredient has verified coverage
- every approved meal usage has a machine-readable `measure`
- every meal unit has a supported gram conversion
- recipes whose steps imply oil or salt include matching nutrition assumptions
- the git snapshot is clean when the audit is generated

Until nutrition profiles and structured measures are added, `nutrition:gate`
should block. That is expected.

## Two-Level Claude-Style Check

Run the read-only verification check requested for Claude Code CLI handoff:

```bash
npm run nutrition:verify
```

It writes ignored artifacts to `nutrition-audits/two-level/latest/`:

- `ingredient-nutrition-audit.json`
- `meal-nutrition-audit.json`
- `two-level-summary.json`

This check is intentionally separate from the release gate. It uses `+-10%`
tolerance to compare ingredient kcal/sodium values with cited source values,
then recomputes approved meals from ingredient profiles, structured measures,
unit gram conversions, and nutrition assumptions. If a meal has no stored
nutrition value yet, the meal row is marked `computed_only` and the recomputed
range is reported as the candidate estimate.

Prompt for a fresh Claude Code CLI critic:

```text
You are verifying nutrition data in:
`/Users/rlalpha/dev/project/ios/cooking-for-myself/cooking-for-myself-data`

Goal:
Perform a read-only two-level audit of calories and sodium. Do not edit dataset
files unless explicitly asked later.

Tolerance:
Use +-10% as the verification tolerance for kcal and sodium source-match
checks. Treat nutrition as estimates, not exact facts.

Level 1: Ingredient audit
1. Load approved ingredients from `data/ingredients`.
2. Compare `nutrition.nutrientsPer100g.kcal` and
   `nutrition.nutrientsPer100g.sodiumMg` against cited
   `sourceRefs[].sourceNutrientsPer100g`.
3. Check source type, URL, accessed date, raw/cooked/dry/salted/branded form,
   and unitWeights.
4. Mark pass, warning, or fail.
5. Prioritize sauces, broths, processed foods, soy sauce, oyster sauce, miso,
   gochujang, curry blocks, luncheon meat, and fish balls.

Level 2: Meal audit
1. Load approved meals from `data/meals`.
2. Recompute each meal from ingredient nutrition, structured measures, gram
   conversions, and `nutritionAssumptions`.
3. Check calories and sodium ranges using +-10% tolerance.
4. Flag missing measures, missing unit conversions, missing ingredient
   nutrition, missing oil/salt assumptions, and wrong sodium level.

Commands:
- `npm test`
- `npm run review:build`
- `npm run nutrition:verify`
- `npm run nutrition:gate -- --no-write`
```

## Dual-CLI LLM Rater

Run the advisory two-rater review after the deterministic two-level audit:

```bash
npm run nutrition:llm-rate
```

It writes ignored artifacts to `nutrition-audits/llm-rater/latest/`:

- `rater-packet.json`
- `rater-output.schema.json`
- `codex-rater.json`
- `claude-rater.json`
- `llm-rater-summary.json`

The script runs `nutrition:verify`, captures the current deterministic gate
summary when available, then asks Codex CLI and Claude Code CLI to judge the
same packet. Both raters work read-only, check ingredient-level source matching
and meal-level recomputation separately, use `+-10%` for kcal/sodium legitimacy,
and treat nutrition as estimates.

Running the external CLI step sends the generated audit packet, including
ingredient and meal nutrition metadata, to the configured Codex and Claude
services. Run it only when that data-sharing boundary is acceptable.

The LLM rater gate passes only when both CLIs return valid structured JSON and
neither rater reports `verdict: "fail"` or any `hardFails`. Warnings are
included in the summary but do not block. CLI errors, timeouts, invalid JSON,
missing source checks, unsupported units, uncomputable approved meals,
unverified sodium drivers, or exact-fact user wording route the result to
`human_review`.

## Subagent Audit

`nutrition:audit` writes ignored run artifacts under `nutrition-audits/`:

- `snapshot.json`
- `deterministic-report.json`
- `packets/subagent-a-sodium-drivers.json`
- `packets/subagent-b-staples-units.json`
- `packets/subagent-c-proteins.json`
- `packets/subagent-d-produce-low-calorie-units.json`
- `packets/subagent-e-meal-level-critic.json`
- `subagent-results-template.json`

Run each packet in a fresh critic context with web search enabled. The critic
must use primary or official sources where possible and return `pass`,
`warning`, or `fail` rows. Health Canada CNF and USDA FoodData Central are
preferred. Brand labels or Open Food Facts are acceptable only for explicit
branded overrides.

After critics finish, place result JSON files under the audit run's `results/`
folder and aggregate them. Aggregation requires every generated packet and every
row in those packets to have a matching result; partial results cannot pass:

```bash
node tools/nutrition-audit.mjs --aggregate nutrition-audits/<run-id>
```

Use `--strict` with aggregation to fail the command if critic results do not
meet the release gate.

## Final Report Requirements

The final release report must include:

- total rows audited
- pass, warning, and fail counts
- source-match percentage
- list of corrected rows
- unresolved warnings
- top calorie and sodium meals
- confirmation that app copy presents nutrition as estimates
