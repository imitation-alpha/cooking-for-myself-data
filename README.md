# Cooking For Myself Data

Open meal and ingredient metadata for Cooking For Myself.

This repository is the canonical source for meal metadata, ingredient metadata, multilingual labels, cooking steps, generated/owned images, and provenance used by the iOS app.

## Dataset

- `data/ingredients/`: one ingredient record per JSON file, plus `_meta.json`.
- `data/meals/`: one meal record per JSON file, plus `_meta.json`.
- `assets/ingredients/`: ingredient images.
- `assets/meals/`: meal cover images.
- `schemas/`: public schema contracts.

For app, website, and SDK integration guidance, see [docs/developer-guide.md](docs/developer-guide.md).
For nutrition estimate verification, see [docs/nutrition-verification.md](docs/nutrition-verification.md).

## Browse the dataset

A static browser is published via GitHub Pages:
**https://imitation-alpha.github.io/cooking-for-myself-data/**

Traverse meals (prev/next, search, restriction-tag filter, language switch) and draft a
new meal with the in-page form — it produces a `status:"draft"` record and opens a
prefilled pull request that CI validates. No server or account setup required beyond a
GitHub account to submit.

Build and preview locally:

```bash
npm run build:site     # validates, exports the seed, assembles _site/
npm run preview:site   # serves _site/ at http://localhost:8080
```

## Image Policy

Primary dataset images must be realistic photos. Meal images use `contentStyle: "realistic_food_photo"` and should look like home-cooked food. Ingredient images use `contentStyle: "realistic_ingredient_photo"` and should look like grocery or lightly prepped ingredient reference photos.

Generated images are allowed when they are photo-real, unbranded, disclosed as generated, attributed, and reviewed for meal or ingredient accuracy. Do not use icons, illustrations, restaurant branding, packaged-product logos, readable labels, watermarks, visible people, hands, or ingredients that are not represented by the record as primary dataset assets.

## Languages

Language keys are `zhHant`, `zhHans`, `en`, `ja`, `ko`, `th`, `vi`, `id`, and `tl`. Traditional Chinese and English are required. Other languages may be `null` until reviewed translations are contributed.

## Validation

```bash
npm test
npm run nutrition:audit  # generates deterministic nutrition audit packets
npm run nutrition:verify # writes ingredient + meal verification reports with +/-10% tolerance
npm run nutrition:llm-rate # asks Codex CLI + Claude CLI to rate the audit; fails into human review on hard issues
npm run nutrition:gate   # strict release gate; blocks until nutrition data is complete
```

## Licensing

Data is licensed under ODC-BY-1.0. Images are licensed under CC-BY-4.0 unless an individual asset says otherwise. Tooling is MIT licensed.
