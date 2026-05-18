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

## Drafting a meal from the web

The published site's [Add a meal](https://imitation-alpha.github.io/cooking-for-myself-data/#/add)
form builds a schema-valid `status:"draft"` meal record (no image, `zhHant` + `en`
filled, other languages `null`) and opens a prefilled pull request — or downloads the
JSON if it is too large for a URL. The form validates with the same rules as
`tools/validate.mjs` (shared `tools/validation-core.mjs`), and the PR is checked by CI.
It only references existing ingredient ids; adding new ingredients is still a manual edit.

## Review Flow

New records start as `draft`, move to `reviewed` after schema/provenance review, then `approved` when ready for app export.
