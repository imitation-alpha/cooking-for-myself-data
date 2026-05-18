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

## Image Policy

Primary dataset images must be realistic photos. Meal images use `contentStyle: "realistic_food_photo"` and should look like home-cooked food. Ingredient images use `contentStyle: "realistic_ingredient_photo"` and should look like grocery or lightly prepped ingredient reference photos.

Generated images are allowed when they are photo-real, unbranded, disclosed as generated, attributed, and reviewed for meal or ingredient accuracy. Do not use icons, illustrations, restaurant branding, packaged-product logos, readable labels, watermarks, visible people, hands, or ingredients that are not represented by the record as primary dataset assets.

## Languages

Language keys are `zhHant`, `zhHans`, `en`, `ja`, `ko`, `th`, `vi`, `id`, and `tl`. Traditional Chinese and English are required. Other languages may be `null` until reviewed translations are contributed.

## Validation

```bash
npm test
```

## Licensing

Data is licensed under ODC-BY-1.0. Images are licensed under CC-BY-4.0 unless an individual asset says otherwise. Tooling is MIT licensed.
