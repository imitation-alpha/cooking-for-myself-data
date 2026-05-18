# Data Contract

## Source Layout

Meals and ingredients are stored as one JSON file per record:

- `data/meals/<meal-id>.json`
- `data/ingredients/<ingredient-id>.json`

Each directory includes `_meta.json`. The `recordOrder` array in that metadata file defines deterministic export order and must include every record ID in the directory.

## Record States

Records use `draft`, `reviewed`, or `approved`.

- `draft`: proposed content, not shipped to app exports.
- `reviewed`: structurally reviewed but not app-ready.
- `approved`: included in app exports and must include provenance and at least one image.

## Localization

All localized objects use the same language keys: `zhHant`, `zhHans`, `en`, `ja`, `ko`, `th`, `vi`, `id`, `tl`.

`zhHant` and `en` are required strings. Other languages can be strings or `null`.

## Provenance

Every meal, ingredient, and image requires source, license, attribution, and review status metadata. Public contributors must not submit copied recipe text or images without compatible rights.

## Images

Primary image assets must be realistic photos with explicit `contentStyle` metadata:

- Meal images use `realistic_food_photo`.
- Ingredient images use `realistic_ingredient_photo`.

Photo-real generated images are acceptable when the image record discloses `generated`, keeps source/run provenance, and has been reviewed for meal or ingredient accuracy. Approved records must not ship placeholder images or images still marked `needs_review`.

Images must avoid visible people, hands, restaurant branding, packaged-product logos, readable labels, watermarks, decorative illustrations, and ingredients that are not represented by the corresponding record.
