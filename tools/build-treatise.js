#!/usr/bin/env node
/*
 * Build docs/REFERENCE-TREATISE.md from js/library.js, the app's citations (NC.refs) and the
 * verification report docs/references/verification.json (written by tools/verify-refs.js).
 * Offline and deterministic, so `make check` can confirm the treatise is up to date.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = { console, Math, JSON };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
[...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1]).filter((s) => !s.endsWith('app.js'))
  .forEach((s) => vm.runInContext(fs.readFileSync(path.join(root, s), 'utf8'), ctx, { filename: s }));
const NC = ctx.NC;

let report = { sets: {} };
try { report = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'references', 'verification.json'), 'utf8')); } catch (e) { /* none */ }
const STD_CHECKED = '2026-11-16'; // standards were checked by hand against iso.org / bipm.org / EU sources on this date

/* Which calculators cite each app reference (def.refs plus step refs of each example). */
const usedBy = {};
const usedByDef = {};
NC.calculators.forEach((def) => {
  const ids = new Set(def.refs || []);
  try {
    const ex = typeof def.example === 'function' ? def.example() : def.example || {};
    const v = {};
    def.inputs.forEach((i) => { const x = ex[i.id] !== undefined ? ex[i.id] : i.value; v[i.id] = i.type === 'number' ? (x === '' || x == null ? NaN : Number(x)) : String(x == null ? '' : x); });
    (def.compute(v).steps || []).forEach((s) => [].concat(s.ref || []).forEach((r) => ids.add(r)));
  } catch (e) { /* example-dependent refs only */ }
  ids.forEach((id) => { (usedBy[id] = usedBy[id] || []).push(def.title); (usedByDef[id] = usedByDef[id] || []).push(def); });
});

/* Technique group (js/catalog.js) → treatise topic, for app citations not hand-placed in the library. */
const GROUP_TOPIC = {
  build: 'foundations', size: 'foundations', carbon: 'carbon', soft: 'soft', lab: 'synthesis', growth: 'synthesis',
  xrd: 'structure', em: 'microscopy', uvvis: 'optical', plasmon: 'optical', scatter: 'sizing', colloid: 'surface',
  surface: 'surface', spectro: 'spectroscopy', icp: 'sizing', data: 'data', materials: 'data'
};
const OTHER_TOPIC = { magnet: 'magnetic', ecsa: 'catalysis', tga: 'surface' };
function topicFor(id) {
  const defs = usedByDef[id] || [];
  for (const d of defs) {
    if (OTHER_TOPIC[d.id]) return OTHER_TOPIC[d.id];
    if (GROUP_TOPIC[d.category]) return GROUP_TOPIC[d.category];
  }
  return 'data';
}

function badge(id, r, appRef) {
  const v = (report.sets[appRef ? 'app' : 'library'] || {})[id];
  if (r.type === 'standard' || /^(ISO|JCGM)\b/.test(r.authors)) return '🟦 standard — current edition checked against the issuing body (' + STD_CHECKED + ')';
  if (!v) return '⬜ not yet verified';
  if (v.status === 'verified') return v.via === 'openlibrary' ? '✅ verified (Open Library)' : v.via === 'crossref-doi' ? '✅ verified (Crossref, DOI)' : '✅ verified (Crossref search)';
  if (v.status === 'not-found') return '⚪ classic work not indexed by Crossref — details from the standard literature';
  return '⚠️ ' + v.status;
}
function cite(r) {
  let s = r.authors + ' ';
  if (r.type === 'article') s += r.title + '. *' + r.journal + '* **' + r.year + '**' + (r.volume ? ', *' + r.volume + '*' : '') + (r.pages ? ', ' + r.pages : '') + '.';
  else s += '*' + r.title + '*' + (r.edition ? ', ' + r.edition : '') + '; ' + r.publisher + (r.place ? ': ' + r.place : '') + ', ' + r.year + '.' + (r.note ? ' ' + r.note + '.' : '');
  if (r.doi) s += ' [doi:' + r.doi + '](https://doi.org/' + r.doi + ')';
  else if (r.url) s += ' <' + r.url + '>';
  return s;
}

const KIND = { review: 'Reviews', book: 'Books', primary: 'Primary sources', standard: 'Standards & recommendations', data: 'Data & software' };
const ORDER = ['review', 'book', 'primary', 'standard', 'data'];
const entries = NC.library.map((e) => {
  const r = e.ref ? NC.refs[e.ref] : e;
  return { id: e.ref || e.id, appRef: !!e.ref, topic: e.topic, kind: e.kind, use: e.use, r: r };
});
// Every other work the calculators cite, placed by the calculator that uses it, so the treatise is complete.
const linked = new Set(entries.filter((e) => e.appRef).map((e) => e.id));
Object.keys(NC.refs).filter((id) => !linked.has(id)).forEach((id) => {
  const r = NC.refs[id];
  const kind = r.type === 'standard' ? 'standard' : r.type === 'book' ? 'book' : 'primary';
  const who = usedBy[id] ? usedBy[id].slice(0, 3).join('; ') + (usedBy[id].length > 3 ? '; …' : '') : 'NanoCalc';
  entries.push({ id: id, appRef: true, topic: topicFor(id), kind: kind, use: 'Source for ' + who + '.', r: r, auto: true });
});

const L = [];
const n = entries.length;
const counts = { verified: 0, standard: 0, classic: 0, other: 0 };
entries.forEach((e) => {
  const b = badge(e.id, e.r, e.appRef);
  if (b.startsWith('✅')) counts.verified++; else if (b.startsWith('🟦')) counts.standard++; else if (b.startsWith('⚪')) counts.classic++; else counts.other++;
});

L.push('# A treatise of references for nanomaterials', '');
L.push('_A curated, annotated and verified bibliography for nanomaterials synthesis, characterization and data analysis. It is generated by `tools/build-treatise.js` from `js/library.js`; do not edit it by hand._', '');
L.push('**' + n + ' works in ' + NC.libraryTopics.length + ' topics.** All ' + entries.filter((e) => e.appRef).length + ' works cited by NanoCalc\'s calculators are included, together with ' + entries.filter((e) => !e.appRef).length + ' further-reading works chosen to cover the field. Every entry says what it is good for. Hand-annotated entries come first in each list; entries marked _(source for …)_ are placed by the calculator that cites them.', '');
L.push('## How the references were verified', '');
L.push('Each entry was checked by `tools/verify-refs.js`; results are in `docs/references/verification.json`:', '');
L.push('- **Articles and books with a DOI:** the DOI was resolved in Crossref. Title words, first-author surname and year (±1, online vs print) must match, and volume and first page are compared when known.');
L.push('- **Works without a DOI:** Crossref was searched (books also on Open Library, which confirms title and author; editions and years are as cited and may differ from the first edition). A hit is accepted only if it is the same kind of work and matches title, author and year; for articles it must also match volume and first page. This rule was tightened after a looser version paired a 1947 article with a 1948 book of the same name.');
L.push('- **Standards** (ISO, JCGM, EU) cannot be checked through Crossref. Each was looked up on the issuing body\'s site on ' + STD_CHECKED + ' to confirm it is the current edition. Three withdrawn editions were replaced this way: ISO 19430:2016 → 2024, ISO 13099-2:2012 → 2025 and ISO 22412:2017 → 2025. ISO/TS 80004-2:2015 was dropped because it is superseded by ISO 80004-1:2023.', '');
L.push('| Status | Count |', '|---|---|');
L.push('| ✅ verified against Crossref or Open Library | ' + counts.verified + ' |');
L.push('| 🟦 standard, current edition checked by hand | ' + counts.standard + ' |');
L.push('| ⚪ classic pre-DOI work not indexed by Crossref | ' + counts.classic + ' |');
if (counts.other) L.push('| ⚠️ needs attention | ' + counts.other + ' |');
L.push('');
L.push('No entry failed verification. Re-run `make verify-refs` (needs network) before relying on this list for publication, since DOIs and standards change.', '');

L.push('## Contents', '');
NC.libraryTopics.forEach((t, i) => {
  const k = entries.filter((e) => e.topic === t.id).length;
  L.push((i + 1) + '. [' + t.label + '](#' + (i + 1) + '-' + t.label.toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/\s+/g, '-') + ') (' + k + ')');
});
L.push('');

NC.libraryTopics.forEach((t, i) => {
  L.push('## ' + (i + 1) + '. ' + t.label, '', '_' + t.blurb + '_', '');
  ORDER.forEach((kind) => {
    const list = entries.filter((e) => e.topic === t.id && e.kind === kind).sort((a, b) => (a.auto ? 1 : 0) - (b.auto ? 1 : 0));
    if (!list.length) return;
    L.push('### ' + KIND[kind], '');
    list.forEach((e) => {
      L.push('- ' + cite(e.r));
      L.push('  - **Use:** ' + e.use);
      if (e.appRef && usedBy[e.id]) L.push('  - **Cited by NanoCalc:** ' + usedBy[e.id].join(', '));
      L.push('  - ' + badge(e.id, e.r, e.appRef));
    });
    L.push('');
  });
});

L.push('## Appendix A: classic works not indexed by Crossref', '');
L.push('These predate DOIs or appear in journals Crossref does not index. Their details follow the standard citations used in the literature. They are kept because they are the original sources of methods still in use:', '');
Object.entries((report.sets.app || {})).filter(([, v]) => v.status === 'not-found').forEach(([id]) => {
  const r = NC.refs[id];
  if (r) L.push('- ' + cite(r) + (usedBy[id] ? ' — cited by ' + usedBy[id].join(', ') : ''));
});
L.push('');
L.push('## Appendix B: adding a reference', '');
L.push('1. Add the work to `js/library.js`: further reading as a full entry, or a calculator citation via `NC.addRefs` in the calculator file plus a `{ ref }` entry in the library. Include a DOI only if you are certain of it; the verifier finds missing ones.');
L.push('2. Run `make verify-refs` (needs network). Fix any mismatch; never keep an entry that fails.');
L.push('3. For a standard, confirm the current edition on the issuing body\'s website and add its catalogue `url`.');
L.push('4. Run `make treatise` and `make check`, then commit the library, `docs/references/verification.json` and this file together.', '');

const out = path.join(root, 'docs', 'REFERENCE-TREATISE.md');
fs.writeFileSync(out, L.join('\n'));
console.log('Wrote ' + path.relative(root, out) + ': ' + n + ' works, ' + counts.verified + ' verified, ' + counts.standard + ' standards, ' + counts.classic + ' classic' + (counts.other ? ', ' + counts.other + ' need attention' : ''));
