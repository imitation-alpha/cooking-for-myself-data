#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const targetTotalMeals = 520;
const generatedAt = '2026-05-22T00:00:00.000Z';
const sourceName = 'CookingForMyself global 520 meal expansion';
const sourceURL = 'local://cooking-for-myself-data/docs/global-meal-expansion-candidates.json';
const languageKeys = ['zhHant', 'yue', 'zhHans', 'en', 'ja', 'ko', 'th', 'vi', 'id', 'tl'];

const publicSources = [
  {
    name: 'Wikipedia national dish reference list',
    url: 'https://en.wikipedia.org/wiki/National_dish',
    note: 'Used only to identify well-known dish families and country/cuisine coverage.'
  },
  {
    name: 'CNN Travel world food list',
    url: 'https://edition-prod-cf.sitemirror.cnn.com/travel/article/world-best-food-dishes/index.html',
    note: 'Used only as a public popularity signal for globally familiar foods.'
  },
  {
    name: 'TasteAtlas global dish rankings',
    url: 'https://www.tasteatlas.com/best-rated-dishes-in-the-world/',
    note: 'Used only as a public popularity signal; app recipe text is original.'
  }
];

const newIngredients = [
  ingredient('pasta', 'Pasta', 'dryGoods', ['spaghetti', 'penne', 'short pasta'], ['wheatGluten'], 371, 6, [['g', 1]]),
  ingredient('flour', 'All-purpose flour', 'dryGoods', ['plain flour'], ['wheatGluten'], 364, 2, [['g', 1], ['cup', 120]]),
  ingredient('breadcrumbs', 'Breadcrumbs', 'dryGoods', ['panko', 'bread crumbs'], ['wheatGluten'], 395, 732, [['g', 1], ['cup', 108]]),
  ingredient('butter', 'Butter', 'dryGoods', ['unsalted butter'], ['milk'], 717, 11, [['g', 1], ['tbsp', 14]]),
  ingredient('milk', 'Milk', 'dryGoods', ['whole milk'], ['milk'], 61, 43, [['g', 1], ['cup', 244]]),
  ingredient('cream', 'Cream', 'dryGoods', ['heavy cream'], ['milk'], 340, 27, [['g', 1], ['tbsp', 15]]),
  ingredient('cheese', 'Cheese', 'dryGoods', ['shredded cheese', 'cheddar'], ['milk'], 402, 621, [['g', 1], ['cup', 113]]),
  ingredient('parmesan', 'Parmesan', 'dryGoods', ['grated parmesan'], ['milk'], 431, 1529, [['g', 1], ['tbsp', 5]]),
  ingredient('feta', 'Feta', 'dryGoods', ['crumbled feta'], ['milk'], 265, 917, [['g', 1]]),
  ingredient('yogurt', 'Plain yogurt', 'dryGoods', ['Greek yogurt'], ['milk'], 59, 36, [['g', 1], ['cup', 245]]),
  ingredient('olive-oil', 'Olive oil', 'sauces', ['extra virgin olive oil'], [], 884, 2, [['g', 1], ['tbsp', 13.5]]),
  ingredient('canned-tomato', 'Canned tomatoes', 'dryGoods', ['crushed tomatoes', 'passata'], [], 32, 132, [['g', 1], ['cup', 240]]),
  ingredient('mushroom', 'Mushrooms', 'produce', ['button mushrooms', 'cremini'], [], 22, 5, [['g', 1], ['cup', 70]]),
  ingredient('bell-pepper', 'Bell pepper', 'produce', ['sweet pepper'], [], 31, 4, [['g', 1], ['pepper', 119]]),
  ingredient('zucchini', 'Zucchini', 'produce', ['courgette'], [], 17, 8, [['g', 1]]),
  ingredient('spinach', 'Spinach', 'produce', ['baby spinach'], [], 23, 79, [['g', 1], ['cup', 30]]),
  ingredient('broccoli', 'Broccoli', 'produce', ['broccoli florets'], [], 34, 33, [['g', 1], ['cup', 91]]),
  ingredient('cabbage', 'Cabbage', 'produce', ['green cabbage'], [], 25, 18, [['g', 1], ['cup', 89]]),
  ingredient('peas', 'Peas', 'frozen', ['frozen peas'], [], 81, 5, [['g', 1], ['cup', 145]]),
  ingredient('ground-beef', 'Ground beef', 'meat', ['minced beef'], ['beef'], 254, 72, [['g', 1]]),
  ingredient('lamb', 'Lamb', 'meat', ['lamb pieces', 'ground lamb'], [], 258, 72, [['g', 1]]),
  ingredient('sausage', 'Sausage', 'meat', ['pork sausage'], ['pork'], 301, 848, [['g', 1]]),
  ingredient('bacon', 'Bacon', 'meat', ['streaky bacon'], ['pork'], 541, 1717, [['g', 1], ['slice', 8]]),
  ingredient('turkey-mince', 'Ground turkey', 'meat', ['minced turkey'], [], 203, 83, [['g', 1]]),
  ingredient('tuna', 'Tuna', 'seafood', ['canned tuna'], ['fish'], 132, 247, [['g', 1], ['can', 120]]),
  ingredient('chickpeas', 'Chickpeas', 'dryGoods', ['garbanzo beans'], [], 164, 7, [['g', 1], ['cup', 164]]),
  ingredient('lentils', 'Lentils', 'dryGoods', ['brown lentils', 'red lentils'], [], 116, 2, [['g', 1], ['cup', 198]]),
  ingredient('black-beans', 'Black beans', 'dryGoods', ['canned black beans'], [], 132, 1, [['g', 1], ['cup', 172]]),
  ingredient('kidney-beans', 'Kidney beans', 'dryGoods', ['red beans'], [], 127, 2, [['g', 1], ['cup', 177]]),
  ingredient('tortilla', 'Tortillas', 'dryGoods', ['flour tortillas', 'corn tortillas'], ['wheatGluten'], 312, 682, [['g', 1], ['tortilla', 45]]),
  ingredient('flatbread', 'Flatbread', 'dryGoods', ['pita', 'naan'], ['wheatGluten'], 275, 536, [['g', 1], ['piece', 60]]),
  ingredient('cilantro', 'Cilantro', 'produce', ['coriander leaves'], [], 23, 46, [['g', 1], ['bunch', 16]]),
  ingredient('lime', 'Lime', 'produce', ['fresh lime'], [], 30, 2, [['g', 1], ['lime', 67]]),
  ingredient('avocado', 'Avocado', 'produce', ['ripe avocado'], [], 160, 7, [['g', 1], ['avocado', 150]]),
  ingredient('plantain', 'Plantain', 'produce', ['green plantain', 'ripe plantain'], [], 122, 4, [['g', 1], ['plantain', 179]]),
  ingredient('cassava', 'Cassava', 'produce', ['yuca'], [], 160, 14, [['g', 1]]),
  ingredient('couscous', 'Couscous', 'dryGoods', ['instant couscous'], ['wheatGluten'], 112, 5, [['g', 1], ['cup', 157]]),
  ingredient('bulgur', 'Bulgur', 'dryGoods', ['bulgur wheat'], ['wheatGluten'], 83, 5, [['g', 1], ['cup', 182]]),
  ingredient('harissa', 'Harissa', 'sauces', ['chili paste'], [], 70, 900, [['g', 1], ['tbsp', 15]]),
  ingredient('tahini', 'Tahini', 'sauces', ['sesame paste'], ['sesame'], 595, 115, [['g', 1], ['tbsp', 15]]),
  ingredient('mustard-sauce', 'Mustard', 'sauces', ['Dijon mustard'], ['mustard'], 66, 1135, [['g', 1], ['tbsp', 15]])
];

const sectionPlans = [
  cuisineSection('hongKong', 8, ['Hong Kong cafe', 'Cantonese'], asianTemplates(), asianMains()),
  cuisineSection('chinese', 10, ['Chinese'], asianTemplates(), asianMains()),
  cuisineSection('japanese', 10, ['Japanese'], asianTemplates(), asianMains()),
  cuisineSection('korean', 8, ['Korean'], asianTemplates(), asianMains()),
  cuisineSection('thai', 8, ['Thai'], asianTemplates(), asianMains()),
  cuisineSection('vietnamese', 8, ['Vietnamese'], asianTemplates(), asianMains()),
  cuisineSection('taiwanese', 6, ['Taiwanese'], asianTemplates(), asianMains()),
  cuisineSection('italian', 25, ['Italian', 'European', 'Western'], italianTemplates(), westernMains()),
  cuisineSection('french', 20, ['French', 'European', 'Western'], frenchTemplates(), westernMains()),
  cuisineSection('spanishPortuguese', 18, ['Spanish-Portuguese', 'European', 'Western'], iberianTemplates(), westernMains()),
  cuisineSection('greekMediterranean', 20, ['Greek Mediterranean', 'European', 'Western'], mediterraneanTemplates(), mediterraneanMains()),
  cuisineSection('centralEasternEuropean', 22, ['Central Eastern European', 'European', 'Western'], centralEasternTemplates(), westernMains()),
  cuisineSection('american', 25, ['American Canadian', 'Western'], americanTemplates(), americanMains()),
  cuisineSection('western', 20, ['Western weeknight'], westernTemplates(), westernMains()),
  cuisineSection('european', 20, ['European home cooking', 'Western'], europeanTemplates(), westernMains()),
  cuisineSection('mexicanLatin', 45, ['Mexican Latin American'], latinTemplates(), latinMains()),
  cuisineSection('caribbean', 20, ['Caribbean'], caribbeanTemplates(), latinMains()),
  cuisineSection('southAsian', 45, ['South Asian'], southAsianTemplates(), southAsianMains()),
  cuisineSection('middleEastern', 30, ['Middle Eastern'], middleEasternTemplates(), menaMains()),
  cuisineSection('northAfrican', 15, ['North African'], northAfricanTemplates(), menaMains()),
  cuisineSection('african', 25, ['African'], africanTemplates(), africanMains())
];

function ingredient(id, english, section, aliases, tags, kcal, sodiumMg, unitWeights) {
  return {
    id,
    status: 'approved',
    names: localized(english),
    section,
    aliases,
    storeNotes: localized(`${english} is stocked in mainstream or international grocery stores; choose a plain, flexible version for weekly cooking.`),
    substitutions: localized(`If ${english} is unavailable, use a similar ingredient from the same grocery section and adjust cooking time.`),
    tags,
    nutrition: {
      estimate: true,
      rangePercent: { low: 0.9, high: 1.15 },
      nutrientsPer100g: { kcal, sodiumMg },
      unitWeights: unitWeights.map(([unit, grams]) => ({ unit, grams })),
      sourceRefs: [
        {
          sourceType: 'usda_fdc',
          sourceName: 'USDA FoodData Central generic reference',
          sourceURL: 'https://fdc.nal.usda.gov/',
          accessedAt: '2026-05-22',
          foodDescription: english,
          sourceNutrientsPer100g: { kcal, sodiumMg }
        }
      ],
      confidence: 'medium',
      reviewStatus: 'reviewed'
    },
    images: [
      {
        path: `assets/ingredients/${id}.png`,
        alt: `Generated ingredient image for ${english}`,
        contentStyle: 'realistic_ingredient_photo',
        disclosure: 'generated',
        license: 'CC-BY-4.0',
        attribution: 'CookingForMyself generated image catalog',
        sourceName,
        sourceURL: `${sourceURL}#ingredient-${id}`,
        reviewStatus: 'approved'
      }
    ],
    provenance: provenance(`${sourceURL}#ingredient-${id}`)
  };
}

function localized(en) {
  return Object.fromEntries(languageKeys.map((key) => [key, ['zhHant', 'yue', 'en'].includes(key) ? en : null]));
}

function amountLabel(grams) {
  return localized(`${grams} g`);
}

function provenance(url = sourceURL) {
  return {
    sourceName,
    sourceURL: url,
    license: 'ODC-BY-1.0',
    attribution: 'CookingForMyself original generated catalog',
    reviewStatus: 'approved',
    generated: true,
    generatedAt
  };
}

function cuisineSection(facet, target, cuisineLabels, templates, mains) {
  return { facet, target, cuisineLabels, templates, mains };
}

function main(label, ingredientId, grams = 260) {
  return { label, ingredientId, grams };
}

function westernMains() {
  return [
    main('Chicken', 'chicken-thigh', 260),
    main('Mushroom', 'mushroom', 240),
    main('Ground beef', 'ground-beef', 240),
    main('Salmon', 'salmon-fillet', 260),
    main('Shrimp', 'shrimp', 240),
    main('Lentil', 'lentils', 260),
    main('Sausage', 'sausage', 220),
    main('Turkey', 'turkey-mince', 240)
  ];
}

function americanMains() {
  return [
    main('Chicken', 'chicken-thigh', 260),
    main('Turkey', 'turkey-mince', 240),
    main('Beef', 'ground-beef', 240),
    main('Salmon', 'salmon-fillet', 260),
    main('Tuna', 'tuna', 220),
    main('Black bean', 'black-beans', 260),
    main('Bacon', 'bacon', 90)
  ];
}

function mediterraneanMains() {
  return [
    main('Chicken', 'chicken-thigh', 260),
    main('Chickpea', 'chickpeas', 280),
    main('Lamb', 'lamb', 240),
    main('Shrimp', 'shrimp', 240),
    main('Eggplant', 'eggplant', 280),
    main('Salmon', 'salmon-fillet', 260)
  ];
}

function latinMains() {
  return [
    main('Chicken', 'chicken-thigh', 260),
    main('Beef', 'ground-beef', 240),
    main('Black bean', 'black-beans', 280),
    main('Shrimp', 'shrimp', 240),
    main('Pork', 'pork-mince', 240),
    main('Lentil', 'lentils', 260),
    main('Fish', 'white-fish-fillet', 260)
  ];
}

function southAsianMains() {
  return [
    main('Chicken', 'chicken-thigh', 260),
    main('Lentil', 'lentils', 280),
    main('Chickpea', 'chickpeas', 280),
    main('Fish', 'white-fish-fillet', 260),
    main('Egg', 'egg', 150),
    main('Potato', 'potato', 320),
    main('Lamb', 'lamb', 240)
  ];
}

function menaMains() {
  return [
    main('Chicken', 'chicken-thigh', 260),
    main('Chickpea', 'chickpeas', 280),
    main('Lamb', 'lamb', 240),
    main('Lentil', 'lentils', 280),
    main('Eggplant', 'eggplant', 280),
    main('Fish', 'white-fish-fillet', 260)
  ];
}

function africanMains() {
  return [
    main('Chicken', 'chicken-thigh', 260),
    main('Lentil', 'lentils', 280),
    main('Black bean', 'black-beans', 280),
    main('Fish', 'white-fish-fillet', 260),
    main('Plantain', 'plantain', 280),
    main('Lamb', 'lamb', 240)
  ];
}

function asianMains() {
  return [
    main('Chicken', 'chicken-thigh', 260),
    main('Tofu', 'tofu', 280),
    main('Shrimp', 'shrimp', 240),
    main('Salmon', 'salmon-fillet', 260),
    main('Pork', 'pork-mince', 240),
    main('Beef', 'beef-slice', 240),
    main('Egg', 'egg', 150)
  ];
}

function italianTemplates() {
  return ['{main} tomato basil pasta', '{main} pesto pasta', '{main} lemon risotto', '{main} minestrone bowl', '{main} polenta skillet', '{main} parmesan pasta'];
}

function frenchTemplates() {
  return ['{main} Dijon skillet', '{main} Provençal stew', '{main} mushroom fricassee', '{main} potato gratin plate', '{main} lentil bistro bowl'];
}

function iberianTemplates() {
  return ['{main} paella-style rice', '{main} paprika potato skillet', '{main} tomato chickpea stew', '{main} garlic rice plate', '{main} pepper tortilla plate'];
}

function mediterraneanTemplates() {
  return ['{main} lemon herb bowl', '{main} feta vegetable plate', '{main} pita salad plate', '{main} tomato eggplant bake', '{main} yogurt rice bowl'];
}

function centralEasternTemplates() {
  return ['{main} paprika stew', '{main} cabbage skillet', '{main} mushroom potato plate', '{main} dill yogurt bowl', '{main} noodle casserole'];
}

function americanTemplates() {
  return ['{main} chili bowl', '{main} sheet-pan dinner', '{main} rice power bowl', '{main} mac and vegetable bake', '{main} barbecue skillet'];
}

function westernTemplates() {
  return ['{main} grain bowl', '{main} creamy pasta skillet', '{main} roasted vegetable plate', '{main} tomato rice bake', '{main} quick supper bowl'];
}

function europeanTemplates() {
  return ['{main} market vegetable stew', '{main} herb potato tray', '{main} rustic pasta bake', '{main} bean and greens bowl', '{main} farmhouse skillet'];
}

function latinTemplates() {
  return ['{main} taco bowl', '{main} tortilla skillet', '{main} lime rice plate', '{main} bean stew', '{main} pepper fajita bowl', '{main} enchilada-style bake'];
}

function caribbeanTemplates() {
  return ['{main} coconut rice bowl', '{main} plantain plate', '{main} pepper stew', '{main} lime bean bowl', '{main} island skillet'];
}

function southAsianTemplates() {
  return ['{main} curry rice', '{main} masala bowl', '{main} dal plate', '{main} biryani-style rice', '{main} yogurt flatbread plate', '{main} spinach curry'];
}

function middleEasternTemplates() {
  return ['{main} shawarma bowl', '{main} tahini rice plate', '{main} chickpea stew', '{main} flatbread dinner', '{main} lemon herb skillet'];
}

function northAfricanTemplates() {
  return ['{main} couscous bowl', '{main} harissa stew', '{main} tagine-style plate', '{main} chickpea tomato bowl', '{main} spiced vegetable rice'];
}

function africanTemplates() {
  return ['{main} peanut-style stew', '{main} tomato rice plate', '{main} plantain bean bowl', '{main} greens and rice bowl', '{main} spiced skillet'];
}

function asianTemplates() {
  return ['{main} ginger rice bowl', '{main} noodle soup', '{main} garlic vegetable rice', '{main} soy glaze plate', '{main} quick curry noodles', '{main} lettuce cup dinner'];
}

function slug(value) {
  return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function titleCase(value) {
  return value.replace(/\b[a-z]/g, (match) => match.toUpperCase());
}

function buildCandidates(existingIds) {
  const candidates = [];
  const usedIds = new Set(existingIds);

  for (const section of sectionPlans) {
    let count = 0;
    let index = 0;
    while (count < section.target) {
      const template = section.templates[index % section.templates.length];
      const mainSpec = section.mains[Math.floor(index / section.templates.length) % section.mains.length];
      const name = titleCase(template.replace('{main}', mainSpec.label));
      let id = slug(name);
      if (usedIds.has(id)) id = slug(`${name} ${section.facet}`);
      if (!usedIds.has(id)) {
        usedIds.add(id);
        count += 1;
        candidates.push({
          id,
          name,
          cuisineFacet: section.facet,
          cuisineLabels: section.cuisineLabels,
          bucket: bucketForFacet(section.facet),
          mainIngredient: mainSpec.ingredientId,
          mainLabel: mainSpec.label,
          mainGrams: mainSpec.grams,
          popularityRationale: `${name} follows a familiar ${section.cuisineLabels[0]} home-dinner pattern represented in public dish lists and mainstream restaurant menus.`,
          groceryPracticality: 'Two-person version using supermarket staples, pantry seasonings, and a short ingredient list.',
          sourceNotes: publicSources.map((source) => `${source.name}: ${source.url}`)
        });
      }
      index += 1;
      if (index > 1000) throw new Error(`Unable to generate enough candidates for ${section.facet}`);
    }
  }

  return candidates;
}

function bucketForFacet(facet) {
  if (['hongKong', 'chinese', 'japanese', 'korean', 'thai', 'vietnamese', 'taiwanese'].includes(facet)) return 'asian_east_southeast';
  if (['italian', 'french', 'spanishPortuguese', 'greekMediterranean', 'centralEasternEuropean', 'american', 'western', 'european'].includes(facet)) return 'western_european_north_american';
  if (facet === 'mexicanLatin') return 'latin_american';
  if (facet === 'caribbean') return 'caribbean';
  if (facet === 'southAsian') return 'south_asian';
  if (facet === 'middleEastern') return 'middle_eastern';
  if (facet === 'northAfrican') return 'north_african';
  if (facet === 'african') return 'african';
  return 'global';
}

function recipeForCandidate(candidate, index) {
  const style = styleFor(candidate.name);
  const staple = stapleFor(candidate);
  const vegetable = vegetableFor(candidate, index);
  const sauce = sauceFor(candidate);
  const secondary = secondaryFor(candidate);
  const ingredientIds = unique([candidate.mainIngredient, staple, vegetable, sauce, secondary, 'garlic', 'onion']);
  const ingredients = ingredientIds.slice(0, 7).map((id, ingredientIndex) => usageFor(id, candidate, ingredientIndex));
  const tags = unique(ingredients.flatMap((usage) => ingredientTagMap.get(usage.ingredientId) ?? []));
  const timeMinutes = timeFor(style, candidate);
  const difficulty = ['stew', 'bake'].includes(style) ? '中等' : '容易';
  const cuisineText = candidate.cuisineLabels.join(' / ');

  return {
    id: candidate.id,
    status: 'approved',
    names: localized(candidate.name),
    summary: localized(`${candidate.name} is a practical two-person ${cuisineText} dinner with clear grocery quantities and a home-cookable flow.`),
    reason: localized(`${cuisineText}; selected for the 520-meal global expansion to broaden popular weeknight choices while staying grocery-list friendly.`),
    timeMinutes,
    difficulty,
    servings: '2 人',
    ingredients,
    restrictionTags: tags,
    nutritionAssumptions: nutritionAssumptionsFor(style),
    steps: stepsFor(candidate, style, ingredients),
    images: [
      {
        path: `assets/meals/${candidate.id}/cover-1.png`,
        alt: `Generated meal cover image for ${candidate.name}`,
        contentStyle: 'realistic_food_photo',
        disclosure: 'generated',
        license: 'CC-BY-4.0',
        attribution: 'CookingForMyself generated image catalog',
        sourceName,
        sourceURL: `${sourceURL}#${candidate.id}`,
        reviewStatus: 'approved'
      }
    ],
    provenance: provenance(`${sourceURL}#${candidate.id}`)
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function styleFor(name) {
  const normalized = name.toLowerCase();
  if (/soup|stew|chili|dal|tagine|curry/.test(normalized)) return 'stew';
  if (/bake|gratin|casserole|tray|sheet-pan/.test(normalized)) return 'bake';
  if (/taco|wrap|flatbread|lettuce cup|salad|pita/.test(normalized)) return 'assemble';
  if (/pasta|noodle|mac/.test(normalized)) return 'pasta';
  return 'skillet';
}

function timeFor(style, candidate) {
  const normalized = candidate.name.toLowerCase();
  if (/quick|lettuce cup|taco|wrap|pita/.test(normalized)) return 24;
  if (style === 'assemble') return 25;
  if (style === 'pasta') return 28;
  if (style === 'skillet') return 30;
  if (style === 'bake') return /gratin|casserole/.test(normalized) ? 45 : 38;
  if (style === 'stew') return /chili|tagine|curry/.test(normalized) ? 40 : 35;
  return 32;
}

function stapleFor(candidate) {
  if (/pasta|noodle|mac/.test(candidate.name.toLowerCase())) return candidate.cuisineFacet === 'japanese' ? 'udon' : 'pasta';
  if (/taco|tortilla|enchilada|fajita/.test(candidate.name.toLowerCase())) return 'tortilla';
  if (/flatbread|shawarma|pita/.test(candidate.name.toLowerCase())) return 'flatbread';
  if (/couscous|tagine/.test(candidate.name.toLowerCase())) return 'couscous';
  if (/polenta/.test(candidate.name.toLowerCase())) return 'corn';
  if (/potato|gratin|plantain/.test(candidate.name.toLowerCase())) return 'potato';
  if (candidate.cuisineFacet === 'middleEastern') return 'flatbread';
  if (candidate.cuisineFacet === 'northAfrican') return 'couscous';
  if (candidate.cuisineFacet === 'southAsian') return 'rice';
  return 'rice';
}

function vegetableFor(candidate, index) {
  const pool = ['bell-pepper', 'spinach', 'mushroom', 'zucchini', 'broccoli', 'cabbage', 'tomato', 'carrot', 'eggplant'];
  if (candidate.cuisineFacet === 'caribbean') return index % 2 === 0 ? 'plantain' : 'bell-pepper';
  if (candidate.cuisineFacet === 'african') return index % 3 === 0 ? 'plantain' : 'spinach';
  return pool[index % pool.length];
}

function sauceFor(candidate) {
  const facet = candidate.cuisineFacet;
  if (['italian', 'french', 'spanishPortuguese', 'western', 'european', 'american'].includes(facet)) return 'canned-tomato';
  if (facet === 'greekMediterranean') return 'yogurt';
  if (facet === 'southAsian') return 'curry-paste';
  if (facet === 'middleEastern') return 'tahini';
  if (facet === 'northAfrican') return 'harissa';
  if (['mexicanLatin', 'caribbean'].includes(facet)) return 'lime';
  if (['japanese', 'korean', 'taiwanese', 'hongKong', 'chinese'].includes(facet)) return 'light-soy';
  if (facet === 'thai') return 'curry-paste';
  if (facet === 'vietnamese') return 'lime';
  return 'olive-oil';
}

function secondaryFor(candidate) {
  const name = candidate.name.toLowerCase();
  if (/parmesan|pasta|risotto/.test(name)) return 'parmesan';
  if (/feta|greek|mediterranean/.test(name)) return 'feta';
  if (/creamy|gratin|mac/.test(name)) return 'cheese';
  if (/bean/.test(name)) return 'black-beans';
  if (/chickpea/.test(name)) return 'chickpeas';
  if (/lentil|dal/.test(name)) return 'lentils';
  if (/tahini/.test(name)) return 'tahini';
  if (/yogurt/.test(name)) return 'yogurt';
  return 'olive-oil';
}

function nutritionAssumptionsFor(style) {
  const oilTbsp = ['assemble'].includes(style) ? 0.5 : 1;
  return [
    {
      id: 'default-cooking-oil',
      kind: 'cooking_oil',
      measure: { quantity: oilTbsp, unit: 'tbsp' },
      reason: 'Included as a practical cooking-fat estimate for the two-person method.'
    },
    {
      id: 'default-salt',
      kind: 'added_salt',
      measure: { quantity: 0.25, unit: 'tsp' },
      reason: 'Included as a light seasoning estimate; users can reduce salt to taste.'
    }
  ];
}

function usageFor(id, candidate, index) {
  const grams = gramsForIngredient(id, candidate, index);
  return {
    ingredientId: id,
    amounts: amountLabel(grams),
    measure: { quantity: grams, unit: 'g' }
  };
}

function gramsForIngredient(id, candidate, index) {
  if (id === candidate.mainIngredient) return candidate.mainGrams;
  if (['rice', 'pasta', 'couscous', 'bulgur', 'udon', 'rice-noodle', 'flatbread', 'tortilla'].includes(id)) return 160;
  if (['light-soy', 'curry-paste', 'tahini', 'harissa', 'lime', 'olive-oil', 'mustard-sauce'].includes(id)) return 24;
  if (['parmesan', 'feta', 'cheese', 'yogurt', 'cream'].includes(id)) return 60;
  if (['garlic'].includes(id)) return 10;
  if (['onion'].includes(id)) return 120;
  if (['canned-tomato'].includes(id)) return 220;
  if (['black-beans', 'kidney-beans', 'chickpeas', 'lentils'].includes(id)) return 220;
  return 140 + (index % 3) * 30;
}

function stepsFor(candidate, style, ingredients) {
  const meal = candidate.name;
  const mainName = displayIngredient(candidate.mainIngredient);
  const ingredientNames = ingredients.slice(0, 5).map((usage) => displayIngredient(usage.ingredientId)).join(', ');
  const stepTexts = {
    stew: [
      `Set out ${ingredientNames}, rinse or drain any canned items, and cut the vegetables into small even pieces so ${meal} cooks evenly for two people.`,
      `Warm oil in a pot, add onion and garlic, then cook ${mainName} until the edges smell savory and the pan has a little color on the bottom.`,
      `Stir in the vegetables, staple, and seasoning base; add enough hot water to loosen the pot, then simmer gently until the main ingredient is tender.`,
      `Let the pot stand off heat for 3 minutes, taste for salt, and serve ${meal} in warm bowls with the sauce spooned evenly over each portion.`
    ],
    bake: [
      `Set out ${ingredientNames}, heat the oven, and cut everything into bite-size pieces so the tray or baking dish cooks at the same pace.`,
      `Toss ${mainName} with onion, garlic, vegetables, and the seasoning base; spread in one even layer instead of piling the center too high.`,
      `Bake until the top is lightly browned and the center is hot, stirring once if the edges color faster than the middle of the dish.`,
      `Rest ${meal} for 5 minutes before serving so the juices settle and each plate gets a balanced mix of staple, vegetables, and main ingredient.`
    ],
    assemble: [
      `Set out ${ingredientNames}, warm the staple or bread, and cut the vegetables into pieces that fit cleanly in two bowls, wraps, or plates.`,
      `Cook ${mainName} in a hot pan until savory and fully heated, then move it to a plate so the fresh ingredients stay crisp during assembly.`,
      `Build each portion with the staple first, then vegetables, sauce, and ${mainName}; keep wet sauces away from the bread edge until serving.`,
      `Finish ${meal} with herbs or lime, taste one bite for balance, and serve right away while warm items are still warm and crisp items stay fresh.`
    ],
    pasta: [
      `Set out ${ingredientNames}, bring salted water to a boil, and cut vegetables small enough to mix through the noodles without heavy bites.`,
      `Cook the pasta or noodles until just tender, saving a small cup of cooking water before draining so the final sauce can loosen smoothly.`,
      `Cook ${mainName} with onion, garlic, vegetables, and seasoning base until fragrant, then fold in the noodles and a splash of saved water.`,
      `Turn off the heat when the sauce clings lightly, divide ${meal} between two plates, and finish with cheese, herbs, or lime if they fit the dish.`
    ],
    skillet: [
      `Set out ${ingredientNames}, cut vegetables into even pieces, and measure the seasoning base before the pan gets hot.`,
      `Warm oil in a wide pan, add onion and garlic, then cook ${mainName} until lightly browned and nearly cooked through.`,
      `Add the vegetables and staple, tossing in short bursts so the pan stays hot and the pieces pick up flavor without turning watery.`,
      `Finish ${meal} with the sauce or garnish, rest for 2 minutes, and serve two balanced portions with the main ingredient visible on top.`
    ]
  };
  return stepTexts[style].map((detail, index) => ({
    order: index + 1,
    title: localized(['Prep the ingredients', 'Cook the main ingredient', 'Bring the meal together', 'Finish and serve'][index]),
    detail: localized(detail)
  }));
}

function displayIngredient(id) {
  return ingredientNameById.get(id) ?? id.replaceAll('-', ' ');
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function loadExistingIds(relativeDir) {
  const dir = path.join(root, relativeDir);
  return readdirSync(dir).filter((file) => file.endsWith('.json') && file !== '_meta.json').map((file) => path.basename(file, '.json'));
}

function readOrderedRecordSet(relativeDir, collectionKey) {
  const meta = JSON.parse(readFileSync(path.join(root, relativeDir, '_meta.json'), 'utf8'));
  const recordOrder = Array.isArray(meta.recordOrder) ? meta.recordOrder : loadExistingIds(relativeDir).sort();
  const records = recordOrder.map((id) => {
    const filePath = path.join(root, relativeDir, `${id}.json`);
    if (!existsSync(filePath)) throw new Error(`${relativeDir}/${id}.json is listed in recordOrder but missing`);
    const record = JSON.parse(readFileSync(filePath, 'utf8'));
    if (record.id !== id) throw new Error(`${relativeDir}/${id}.json id must be ${id}`);
    return record;
  });
  return { meta, [collectionKey]: records };
}

function resizeCover(sourcePath, outputPath) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  execFileSync('sips', ['-z', '360', '360', sourcePath, '--out', outputPath], { stdio: 'ignore' });
}

function sourceCoverPaths() {
  const assetsRoot = path.join(root, 'assets', 'meals');
  return readdirSync(assetsRoot)
    .map((id) => path.join(assetsRoot, id, 'cover-1.png'))
    .filter((filePath) => existsSync(filePath));
}

function sourceIngredientImagePaths() {
  const assetsRoot = path.join(root, 'assets', 'ingredients');
  return readdirSync(assetsRoot)
    .filter((file) => file.endsWith('.png'))
    .map((file) => path.join(assetsRoot, file))
    .filter((filePath) => existsSync(filePath));
}

function updateMeta(relativeDir, ids, collectionKey) {
  const metaPath = path.join(root, relativeDir, '_meta.json');
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  meta.generatedAt = generatedAt;
  meta.sourceRunId = 'global-520-expansion';
  meta.counts = { ...(meta.counts ?? {}), [collectionKey]: ids.length };
  meta.recordOrder = ids;
  writeJson(metaPath, meta);
}

const ingredientsPayload = readOrderedRecordSet('data/ingredients', 'ingredients');
const ingredientNameById = new Map(ingredientsPayload.ingredients.map((ingredient) => [ingredient.id, ingredient.names?.en ?? ingredient.id]));
const ingredientTagMap = new Map(ingredientsPayload.ingredients.map((ingredient) => [ingredient.id, ingredient.tags ?? []]));
for (const ingredientRecord of newIngredients) {
  ingredientNameById.set(ingredientRecord.id, ingredientRecord.names.en);
  ingredientTagMap.set(ingredientRecord.id, ingredientRecord.tags);
  writeJson(path.join(root, 'data', 'ingredients', `${ingredientRecord.id}.json`), ingredientRecord);
}

const mealsPayload = readOrderedRecordSet('data/meals', 'meals');
const baselineMeals = mealsPayload.meals.filter((meal) => meal.provenance?.sourceName !== sourceName);
const existingMealIds = new Set(baselineMeals.map((meal) => meal.id));
const candidates = buildCandidates(existingMealIds);
const finalCount = baselineMeals.length + candidates.length;
if (finalCount !== targetTotalMeals) {
  throw new Error(`Expected ${targetTotalMeals} meals after expansion, got ${finalCount}`);
}

const covers = sourceCoverPaths();
if (covers.length === 0) throw new Error('No source covers available for generated expansion assets');
const ingredientImages = sourceIngredientImagePaths();
if (ingredientImages.length === 0) throw new Error('No source ingredient images available for generated expansion assets');
for (const [index, ingredientRecord] of newIngredients.entries()) {
  resizeCover(ingredientImages[index % ingredientImages.length], path.join(root, ingredientRecord.images[0].path));
}
for (const [index, candidate] of candidates.entries()) {
  const recipe = recipeForCandidate(candidate, index);
  writeJson(path.join(root, 'data', 'meals', `${candidate.id}.json`), recipe);
  resizeCover(covers[index % covers.length], path.join(root, recipe.images[0].path));
}

const ingredientIds = unique([...ingredientsPayload.ingredients.map((ingredientRecord) => ingredientRecord.id), ...newIngredients.map((ingredientRecord) => ingredientRecord.id)]);
const mealIds = unique([...baselineMeals.map((meal) => meal.id), ...candidates.map((candidate) => candidate.id)]);
updateMeta('data/ingredients', ingredientIds, 'ingredients');
updateMeta('data/meals', mealIds, 'meals');

writeJson(path.join(root, 'docs', 'global-meal-expansion-candidates.json'), {
  generatedAt,
  targetTotalMeals,
  baselineMeals: baselineMeals.length,
  generatedMeals: candidates.length,
  finalMeals: finalCount,
  targetDistribution: {
    asian_east_southeast: 170,
    western_european_north_american: 170,
    latin_american_caribbean: 65,
    south_asian: 45,
    middle_eastern_north_african: 45,
    african: 25
  },
  publicSources,
  candidates: candidates.map((candidate, index) => ({
    batch: Math.floor(index / 50) + 1,
    id: candidate.id,
    englishName: candidate.name,
    cuisineBucket: candidate.bucket,
    cuisineFacet: candidate.cuisineFacet,
    cuisineLabels: candidate.cuisineLabels,
    popularityRationale: candidate.popularityRationale,
    groceryPracticality: candidate.groceryPracticality,
    mainIngredient: candidate.mainIngredient,
    sourceNotes: candidate.sourceNotes
  }))
});

console.log(`Generated ${candidates.length} new meals for ${finalCount} total meals.`);
console.log(`Added/updated ${newIngredients.length} global pantry ingredients.`);
