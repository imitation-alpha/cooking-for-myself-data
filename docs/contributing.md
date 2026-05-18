# Contributing

## What to Contribute

- New meals with original metadata and cooking steps.
- Ingredient metadata and aliases.
- Reviewed translations for supported language keys.
- Realistic owned, generated, or compatibly licensed meal and ingredient photos with attribution.

## Requirements

- Run `npm test` before opening a PR.
- Keep `zhHant` and `en` filled for every localized object.
- Use `null` for missing optional translations.
- Include provenance for every record and image.
- Use `contentStyle: "realistic_food_photo"` for meal images and `contentStyle: "realistic_ingredient_photo"` for ingredient images.
- Generated images must be photo-real, disclosed as generated, and checked for meal or ingredient accuracy before an approved record ships.
- Avoid icons, illustrations, restaurant branding, packaging text, watermarks, visible people, hands, and misleading ingredients.
- Do not submit secrets, private notes, copied recipe text, or images without rights.

## Review Flow

New records start as `draft`, move to `reviewed` after schema/provenance review, then `approved` when ready for app export.
