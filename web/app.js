// Cooking For Myself — meal browser + zero-infra "add a meal" form.
// Vanilla ESM, no dependencies. Served under a project-pages base path
// (/cooking-for-myself-data/), so every URL here is RELATIVE.
import { validateMealRecord, languageKeys } from './validation-core.mjs';

const OWNER = 'imitation-alpha';
const REPO = 'cooking-for-myself-data';
const URL_PREFILL_LIMIT = 6000; // GitHub /new?value= practical ceiling; else download.

// Seed uses friendly language keys (see tools/export-app-seed.mjs toAppNames).
const LANGS = [
  ['zhHant', '繁體中文'], ['cantonese', '廣東話'], ['zhHans', '简体中文'],
  ['english', 'English'], ['japanese', '日本語'], ['korean', '한국어'],
  ['thai', 'ไทย'], ['vietnamese', 'Tiếng Việt'], ['indonesian', 'Bahasa Indonesia'],
  ['tagalog', 'Tagalog']
];

const view = document.getElementById('view');
const searchEl = document.getElementById('search');
const langEl = document.getElementById('lang');

let DATA = null;
let recipesById = new Map();
let ingredientsById = new Map();
let ordered = [];
let lang = localStorage.getItem('cfm.lang') || 'zhHant';
let query = '';
let activeTag = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const loc = (obj, l = lang) => (obj && (obj[l] ?? obj.zhHant ?? obj.english)) || '';

async function boot() {
  try {
    const res = await fetch('./app-seed.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    DATA = await res.json();
  } catch (e) {
    view.innerHTML = `<p class="empty">Could not load <code>app-seed.json</code> (${esc(e.message)}).</p>`;
    return;
  }
  ordered = DATA.recipes || [];
  recipesById = new Map(ordered.map((r) => [r.id, r]));
  ingredientsById = new Map((DATA.ingredients || []).map((i) => [i.id, i]));

  const present = new Set();
  for (const r of ordered) for (const [k] of LANGS) if (r.names && r.names[k]) present.add(k);
  langEl.innerHTML = LANGS.filter(([k]) => present.has(k))
    .map(([k, label]) => `<option value="${k}">${esc(label)}</option>`).join('');
  if (!present.has(lang)) lang = 'zhHant';
  langEl.value = lang;

  const di = document.getElementById('datasetInfo');
  di.textContent = `${ordered.length} meals · ${(DATA.ingredients || []).length} ingredients · generated ${(DATA.generatedAt || '').slice(0, 10)} · `;

  langEl.addEventListener('change', () => {
    lang = langEl.value; localStorage.setItem('cfm.lang', lang); render();
  });
  searchEl.addEventListener('input', () => {
    query = searchEl.value.trim().toLowerCase();
    if (location.hash.replace(/^#\/?/, '') !== '') location.hash = '#/';
    else render();
  });
  window.addEventListener('hashchange', render);
  window.addEventListener('keydown', (e) => {
    const m = location.hash.match(/^#\/meal\/(.+)$/);
    if (!m || e.target.matches('input, textarea, select')) return;
    if (e.key === 'ArrowLeft') step(decodeURIComponent(m[1]), -1);
    if (e.key === 'ArrowRight') step(decodeURIComponent(m[1]), 1);
  });
  render();
}

function step(id, dir) {
  const i = ordered.findIndex((r) => r.id === id);
  if (i < 0) return;
  const next = ordered[(i + dir + ordered.length) % ordered.length];
  location.hash = '#/meal/' + encodeURIComponent(next.id);
}

function render() {
  const hash = location.hash.replace(/^#\/?/, '');
  if (hash === 'add') return renderAdd();
  const m = hash.match(/^meal\/(.+)$/);
  if (m) return renderDetail(decodeURIComponent(m[1]));
  return renderIndex();
}

function thumb(r, cls) {
  if (r.image && r.image.assetPath) {
    return `<img class="${cls}" loading="lazy" alt="${esc(loc(r.names))}" src="./${esc(r.image.assetPath)}">`;
  }
  return `<div class="${cls}" role="img" aria-label="no image"></div>`;
}

function renderIndex() {
  document.title = 'Cooking For Myself — Meal Browser';
  searchEl.value = query;
  const tags = [...new Set(ordered.flatMap((r) => r.tags || []))].sort();
  let list = ordered;
  if (activeTag) list = list.filter((r) => (r.tags || []).includes(activeTag));
  if (query) {
    list = list.filter((r) => {
      const hay = [
        ...Object.values(r.names || {}),
        ...(r.tags || []),
        ...(r.ingredients || []).map((u) => ingredientsById.get(u.ingredientId))
          .filter(Boolean).flatMap((i) => Object.values(i.names || {}))
      ].join(' ').toLowerCase();
      return hay.includes(query);
    });
  }
  const chips = tags.map((t) =>
    `<button class="chip" data-tag="${esc(t)}" aria-pressed="${activeTag === t}">${esc(t)}</button>`).join('');
  const cards = list.map((r) => `
    <a class="card" href="#/meal/${encodeURIComponent(r.id)}">
      ${thumb(r, 'thumb')}
      <div class="body">
        <p class="name">${esc(loc(r.names))}</p>
        <p class="meta">⏱ ${esc(r.timeMinutes)} min · ${esc(r.difficulty)} · ${esc(r.servings)}</p>
      </div>
    </a>`).join('');
  view.innerHTML =
    `<div class="tagbar">${chips || ''}</div>` +
    (list.length ? `<div class="grid">${cards}</div>`
      : `<p class="empty">No meals match.</p>`);
  view.querySelectorAll('.chip[data-tag]').forEach((b) =>
    b.addEventListener('click', () => {
      activeTag = activeTag === b.dataset.tag ? null : b.dataset.tag; renderIndex();
    }));
}

function renderDetail(id) {
  const r = recipesById.get(id);
  if (!r) { view.innerHTML = `<p class="empty">Unknown meal. <a href="#/">Back</a></p>`; return; }
  document.title = loc(r.names) + ' — Cooking For Myself';
  const i = ordered.findIndex((x) => x.id === id);
  const prev = ordered[(i - 1 + ordered.length) % ordered.length];
  const nextR = ordered[(i + 1) % ordered.length];
  const en = r.names && r.names.english;
  const ings = (r.ingredients || []).map((u) => {
    const ing = ingredientsById.get(u.ingredientId);
    const nm = ing ? loc(ing.names) : u.ingredientId;
    const amt = loc(u.amounts) || u.amountEn || u.amountZh || '';
    return `<li>
      <img loading="lazy" alt="" src="./assets/ingredients/${esc(u.ingredientId)}.png"
           onerror="this.style.visibility='hidden'">
      <span><strong>${esc(nm)}</strong>${amt ? ' — ' + esc(amt) : ''}</span></li>`;
  }).join('');
  const steps = (r.steps || []).map((s, n) => `
    <li><div class="st">${n + 1}. ${esc(loc(s.title))}</div>
        <div class="sd">${esc(loc(s.instruction))}</div></li>`).join('');
  const tagChips = (r.tags || []).map((t) => `<span class="chip static">${esc(t)}</span>`).join(' ');
  const p = r.source || {};
  view.innerHTML = `
    <div class="detail-nav">
      <a class="btn secondary" href="#/meal/${encodeURIComponent(prev.id)}">← ${esc(loc(prev.names))}</a>
      <a class="btn secondary" href="#/">All meals</a>
      <a class="btn secondary" href="#/meal/${encodeURIComponent(nextR.id)}">${esc(loc(nextR.names))} →</a>
    </div>
    <article class="detail">
      ${thumb(r, 'cover')}
      <div>
        <h1>${esc(loc(r.names))}</h1>
        ${en && en !== loc(r.names) ? `<p class="subtitle">${esc(en)}</p>` : ''}
        <div class="facts"><span>⏱ ${esc(r.timeMinutes)} min</span><span>🍽 ${esc(r.servings)}</span><span>📊 ${esc(r.difficulty)}</span></div>
        <div class="tagbar">${tagChips}</div>
        ${loc(r.summary) ? `<p>${esc(loc(r.summary))}</p>` : ''}
        ${loc(r.reason) ? `<p class="prov">${esc(loc(r.reason))}</p>` : ''}
      </div>
      <section><h2>Ingredients</h2><ul class="ings">${ings}</ul></section>
      <section><h2>Steps</h2><ol class="steps">${steps}</ol></section>
      <section><h2>Provenance</h2>
        <p class="prov">${esc(p.sourceName || '')} · ${esc(p.license || '')} ·
        ${esc(p.attribution || '')} · review: ${esc(p.reviewStatus || r.reviewStatus || '')}${
          r.image ? ` · image: ${esc(r.image.disclosure)} (${esc(r.image.license)}, ${esc(r.image.reviewStatus)})` : ''}</p>
      </section>
    </article>`;
  window.scrollTo(0, 0);
}

/* ---------- Add a meal ---------- */

const slugify = (s) => s.toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Emit a record using RAW source-schema language keys (validated by
// tools/validate.mjs), zhHant + en required, others null.
const localizedRaw = (zh, en) => {
  const o = {};
  for (const k of languageKeys) o[k] = null;
  o.zhHant = zh.trim() || null;
  o.en = en.trim() || null;
  return o;
};

function renderAdd() {
  document.title = 'Add a meal — Cooking For Myself';
  const ingredientsSorted = [...ingredientsById.values()]
    .sort((a, b) => (a.names && a.names.english || a.id).localeCompare(b.names && b.names.english || b.id));
  const ingOpt = '<option value="">— choose an ingredient —</option>' + ingredientsSorted
    .map((i) => `<option value="${esc(i.id)}">${esc(i.names && i.names.english || i.id)} — ${esc(i.id)}</option>`).join('');
  const diffVals = [...new Set(ordered.map((r) => r.difficulty).filter(Boolean))];
  const diffOpt = '<option value="">— select —</option>'
    + diffVals.map((d) => `<option>${esc(d)}</option>`).join('')
    + '<option value="__other">Other…</option>';
  const servingsList = [...new Set(ordered.map((r) => r.servings).filter(Boolean))]
    .map((s) => `<option value="${esc(s)}">`).join('');
  const tagUniverse = [...new Set(ordered.flatMap((r) => r.tags || []))].sort();
  const selectedTags = new Set();

  view.innerHTML = `
  <h1>Add a meal</h1>
  <div class="formhelp">
    Fill the fields below. <strong>繁體中文 + English are required</strong>; everything else
    is optional and reviewers add other languages later. When valid, this opens a prefilled
    GitHub pull request (no account setup beyond signing in to GitHub) — the repo's CI
    checks it automatically. Nothing is saved until you submit.
  </div>
  <div id="formErrors"></div>
  <form class="meal" id="mealForm" novalidate>
    <fieldset><legend>Basics</legend>
      <div class="row2">
        <label>Name — 繁體中文 *<input name="name_zh" required placeholder="蕃茄炒蛋"></label>
        <label>Name — English *<input name="name_en" required placeholder="Tomato &amp; egg"></label>
      </div>
      <label>Meal id <span class="hint">(auto from the English name — edit only if needed)</span>
        <input name="id" pattern="[a-z0-9-]+" placeholder="tomato-egg">
        <div class="idpreview" id="idPreview"></div></label>
      <div class="row2">
        <label>Time in minutes *<input name="time" type="number" min="1" step="1" required placeholder="20"></label>
        <label>Servings *<input name="servings" list="servingsList" required placeholder="2 人">
          <datalist id="servingsList">${servingsList}</datalist></label>
      </div>
      <label>Difficulty *
        <select name="difficulty" required>${diffOpt}</select>
        <input name="difficulty_other" placeholder="custom difficulty" style="display:none;margin-top:8px"></label>
      <div class="row2">
        <label>Summary — 繁體中文 <span class="hint">(optional)</span><input name="sum_zh"></label>
        <label>Summary — English <span class="hint">(optional)</span><input name="sum_en"></label>
      </div>
      <div class="row2">
        <label>Reason / note — 繁體中文 <span class="hint">(optional)</span><input name="why_zh"></label>
        <label>Reason / note — English <span class="hint">(optional)</span><input name="why_en"></label>
      </div>
      <label>Restriction tags <span class="hint">(tap any that apply)</span></label>
      <div class="tagpick" id="tagPick">
        ${tagUniverse.map((t) => `<button type="button" class="chip" data-tag="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('')}
        <input id="tagAdd" placeholder="add custom tag + Enter">
      </div>
    </fieldset>
    <fieldset><legend>Ingredients <span class="hint">(at least one)</span></legend>
      <div id="ings"></div>
      <p><button type="button" id="addIng">+ add ingredient</button></p>
    </fieldset>
    <fieldset><legend>Steps <span class="hint">(at least one, in order)</span></legend>
      <div id="steps"></div>
      <p><button type="button" id="addStep">+ add step</button></p>
    </fieldset>
    <div id="result"></div>
    <div class="stickybar">
      <button type="submit" class="primary">Validate &amp; submit</button>
      <button type="button" id="dl">Download JSON</button>
      <a class="btn secondary" href="#/">Cancel</a>
    </div>
  </form>`;

  const form = view.querySelector('#mealForm');
  const ingsBox = view.querySelector('#ings');
  const stepsBox = view.querySelector('#steps');
  const q = (n, scope = form) => scope.querySelector(`[name="${n}"]`);

  // ---- inline field validation -------------------------------------------
  const setMsg = (el, msg) => {
    let m = el.parentElement.querySelector('.field-msg');
    if (!m) { m = document.createElement('div'); m.className = 'field-msg'; el.parentElement.appendChild(m); }
    if (msg) { el.classList.add('invalid'); m.textContent = msg; m.classList.add('show'); }
    else { el.classList.remove('invalid'); m.textContent = ''; m.classList.remove('show'); }
  };
  const cjkLen = (s) => [...s.trim()].length; // count code points, not UTF-16 units
  const checkField = (el) => {
    const v = (el.value || '').trim();
    const min = Number(el.dataset.min || 0);
    if (el.dataset.req && !v) return setMsg(el, 'Required'), false;
    if (min && v && cjkLen(v) < min) return setMsg(el, `Need ≥ ${min} characters (have ${cjkLen(v)})`), false;
    if (el.name === 'time' && v && !(Number.isInteger(+v) && +v > 0)) return setMsg(el, 'Whole number of minutes'), false;
    setMsg(el, ''); return true;
  };
  // live counter badge for min-length fields
  const counter = (el) => {
    const min = Number(el.dataset.min || 0);
    if (!min) return;
    const badge = el.parentElement.querySelector('.counter');
    const n = cjkLen(el.value);
    badge.textContent = `${n}/${min}`;
    badge.classList.toggle('ok', n >= min);
  };
  form.addEventListener('input', (e) => {
    const el = e.target;
    if (el.matches('[data-min]')) counter(el);
    if (el.classList.contains('invalid')) checkField(el);
  });
  form.addEventListener('blur', (e) => {
    if (e.target.matches('input,textarea,select') && (e.target.dataset.req || e.target.dataset.min)) checkField(e.target);
  }, true);
  // tag the static required fields
  ['name_zh', 'name_en', 'time', 'servings', 'difficulty'].forEach((n) => { q(n).dataset.req = '1'; });

  // ---- meal id live preview ----------------------------------------------
  const idInput = q('id');
  const nameEn = q('name_en');
  const idPrev = view.querySelector('#idPreview');
  const currentId = () => slugify(idInput.value || nameEn.value);
  const updateIdPreview = () => {
    const id = currentId();
    if (!id) { idPrev.textContent = ''; idPrev.className = 'idpreview'; return; }
    if (recipesById.has(id)) { idPrev.textContent = `⚠ data/meals/${id}.json already exists — pick another id`; idPrev.className = 'idpreview bad'; }
    else { idPrev.textContent = `→ data/meals/${id}.json  ✓ available`; idPrev.className = 'idpreview good'; }
  };
  nameEn.addEventListener('input', () => { if (!idInput.value) updateIdPreview(); });
  idInput.addEventListener('input', updateIdPreview);

  // ---- difficulty "Other…" -----------------------------------------------
  const diffSel = q('difficulty');
  const diffOther = q('difficulty_other');
  diffSel.addEventListener('change', () => {
    const other = diffSel.value === '__other';
    diffOther.style.display = other ? '' : 'none';
    if (other) diffOther.focus();
  });

  // ---- restriction tag chips ---------------------------------------------
  const tagPick = view.querySelector('#tagPick');
  tagPick.addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    const t = b.dataset.tag;
    if (selectedTags.has(t)) { selectedTags.delete(t); b.setAttribute('aria-pressed', 'false'); }
    else { selectedTags.add(t); b.setAttribute('aria-pressed', 'true'); }
  });
  const tagAdd = view.querySelector('#tagAdd');
  tagAdd.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const t = tagAdd.value.trim(); if (!t) return;
    if (!selectedTags.has(t)) {
      selectedTags.add(t);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.dataset.tag = t;
      b.setAttribute('aria-pressed', 'true'); b.textContent = t;
      tagPick.insertBefore(b, tagAdd);
    }
    tagAdd.value = '';
  });

  // ---- repeatable rows ----------------------------------------------------
  const renumber = () => {
    ingsBox.querySelectorAll('.repeat-row').forEach((r, i) => {
      r.querySelector('h3').textContent = `Ingredient ${i + 1}`;
      r.querySelector('.rm').disabled = ingsBox.children.length === 1;
    });
    stepsBox.querySelectorAll('.repeat-row').forEach((r, i, all) => {
      r.querySelector('h3').textContent = `Step ${i + 1}`;
      r.querySelector('.rm').disabled = all.length === 1;
      r.querySelector('.up').disabled = i === 0;
      r.querySelector('.down').disabled = i === all.length - 1;
    });
  };
  const addIngRow = () => {
    const d = document.createElement('div');
    d.className = 'repeat-row';
    d.innerHTML = `
      <div class="row-head"><h3></h3><div class="row-tools">
        <button type="button" class="rm">remove</button></div></div>
      <label>Ingredient *
        <select name="ing_id" data-req="1">${ingOpt}</select></label>
      <div class="row2">
        <label>Amount — 繁體中文 *<input name="ing_zh" data-req="1" placeholder="3 個"></label>
        <label>Amount — English *<input name="ing_en" data-req="1" placeholder="3 medium"></label>
      </div>`;
    d.querySelector('.rm').onclick = () => { d.remove(); renumber(); };
    ingsBox.appendChild(d); renumber();
  };
  const addStepRow = () => {
    const d = document.createElement('div');
    d.className = 'repeat-row';
    d.innerHTML = `
      <div class="row-head"><h3></h3><div class="row-tools">
        <button type="button" class="up" title="move up">▲</button>
        <button type="button" class="down" title="move down">▼</button>
        <button type="button" class="rm">remove</button></div></div>
      <div class="row2">
        <label>Title — 繁體中文 * <span class="counter">0/2</span>
          <input name="st_zh" data-req="1" data-min="2" placeholder="先備料"></label>
        <label>Title — English * <span class="counter">0/2</span>
          <input name="st_en" data-req="1" data-min="2" placeholder="Prep"></label>
      </div>
      <label>Detail — 繁體中文 * <span class="counter">0/35</span>
        <textarea name="sd_zh" data-req="1" data-min="35" placeholder="把雞蛋打散加少許鹽，蕃茄切塊，蔥切粒備用…"></textarea></label>
      <label>Detail — English * <span class="counter">0/35</span>
        <textarea name="sd_en" data-req="1" data-min="35" placeholder="Beat the eggs with a little salt, cut the tomatoes into wedges…"></textarea></label>`;
    d.querySelector('.rm').onclick = () => { d.remove(); renumber(); };
    d.querySelector('.up').onclick = () => { const p = d.previousElementSibling; if (p) stepsBox.insertBefore(d, p); renumber(); };
    d.querySelector('.down').onclick = () => { const n = d.nextElementSibling; if (n) stepsBox.insertBefore(n, d); renumber(); };
    stepsBox.appendChild(d); renumber();
  };
  addIngRow();
  addStepRow();
  view.querySelector('#addIng').onclick = addIngRow;
  view.querySelector('#addStep').onclick = addStepRow;
  q('name_zh').focus();

  // ---- build / validate / submit -----------------------------------------
  const buildRecord = () => {
    const g = (n) => (q(n)?.value || '').trim();
    const id = currentId();
    const ingredients = [...ingsBox.querySelectorAll('.repeat-row')].map((row) => ({
      ingredientId: row.querySelector('[name="ing_id"]').value.trim(),
      amounts: localizedRaw(row.querySelector('[name="ing_zh"]').value, row.querySelector('[name="ing_en"]').value)
    }));
    const steps = [...stepsBox.querySelectorAll('.repeat-row')].map((row, n) => ({
      order: n + 1,
      title: localizedRaw(row.querySelector('[name="st_zh"]').value, row.querySelector('[name="st_en"]').value),
      detail: localizedRaw(row.querySelector('[name="sd_zh"]').value, row.querySelector('[name="sd_en"]').value)
    }));
    const difficulty = diffSel.value === '__other' ? diffOther.value.trim() : diffSel.value;
    return {
      id,
      status: 'draft',
      names: localizedRaw(g('name_zh'), g('name_en')),
      summary: localizedRaw(g('sum_zh'), g('sum_en')),
      reason: localizedRaw(g('why_zh'), g('why_en')),
      timeMinutes: Number(g('time')),
      difficulty,
      servings: g('servings'),
      ingredients,
      restrictionTags: [...selectedTags],
      steps,
      images: [],
      provenance: {
        sourceName: 'Cooking For Myself community web form',
        sourceURL: `https://${OWNER}.github.io/${REPO}/#/add`,
        license: 'ODC-BY-1.0',
        attribution: 'Cooking For Myself contributors',
        reviewStatus: 'needs_review',
        generated: false,
        generatedAt: new Date().toISOString()
      }
    };
  };

  const validate = (rec) => {
    // inline pass first (marks fields + scrolls user to the first one)
    let firstBad = null;
    form.querySelectorAll('[data-req],[data-min]').forEach((el) => {
      if (!checkField(el) && !firstBad) firstBad = el;
    });
    const errs = [];
    if (diffSel.value === '__other' && !diffOther.value.trim()) {
      setMsg(diffOther, 'Required'); if (!firstBad) firstBad = diffOther;
      errs.push('Difficulty is required.');
    }
    if (!rec.id) errs.push('Meal id is required (enter an English name or id).');
    if (recipesById.has(rec.id)) errs.push(`Meal id "${rec.id}" already exists — choose another.`);
    const ingredientIds = new Set(ingredientsById.keys());
    validateMealRecord((m) => errs.push(m), rec, { ingredientIds, fileExists: () => true });
    return { errs, firstBad };
  };

  const showErrors = ({ errs, firstBad }) => {
    const top = view.querySelector('#formErrors');
    if (!errs.length) { top.innerHTML = ''; return true; }
    top.innerHTML = `<div class="errors"><strong>Please fix ${errs.length} item(s):</strong>
      <ul>${errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
    (firstBad || top).scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (firstBad && firstBad.focus) firstBad.focus();
    return false;
  };

  const json = (rec) => JSON.stringify(rec, null, 2) + '\n';
  const download = (rec) => {
    const blob = new Blob([json(rec)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${rec.id || 'meal'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  view.querySelector('#dl').onclick = () => {
    const rec = buildRecord();
    const r = validate(rec);
    if (!showErrors(r)) return;
    download(rec);
    view.querySelector('#result').innerHTML =
      `<div class="ok"><strong>Valid draft.</strong> Downloaded <code>${esc(rec.id)}.json</code>.</div>`;
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const rec = buildRecord();
    const r = validate(rec);
    if (!showErrors(r)) return;
    const file = `data/meals/${rec.id}.json`;
    const url = `https://github.com/${OWNER}/${REPO}/new/main?filename=${encodeURIComponent(file)}&value=${encodeURIComponent(json(rec))}`;
    const box = view.querySelector('#result');
    if (url.length <= URL_PREFILL_LIMIT) {
      window.open(url, '_blank', 'noopener');
      box.innerHTML = `<div class="ok"><strong>Valid draft.</strong> Opened a prefilled GitHub PR for
        <code>${esc(file)}</code>. If your browser blocked it,
        <a href="${esc(url)}" target="_blank" rel="noopener">click here</a>.</div>`;
    } else {
      download(rec);
      box.innerHTML = `<div class="ok"><strong>Valid draft.</strong> Too large to prefill a URL, so
        <code>${esc(rec.id)}.json</code> was downloaded. Create it at
        <a href="https://github.com/${OWNER}/${REPO}/new/main" target="_blank" rel="noopener">github.com/${OWNER}/${REPO}/new/main</a>
        as <code>${esc(file)}</code> and open a PR.</div>`;
    }
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

boot();
