#!/usr/bin/env node
/*
 * Verify bibliographic references against Crossref (articles, many books) and Open Library (books).
 *
 *   node tools/verify-refs.js            verify the app's citations (NC.refs) and the library (NC.library)
 *   node tools/verify-refs.js --library  only the library
 *   node tools/verify-refs.js --app      only the app's citations
 *
 * For each reference:
 *  - with a DOI: fetch its Crossref record; title words, first-author surname and year (±1, online vs print)
 *    must match, and volume/first page are compared when both are known.
 *  - without a DOI: search Crossref (and Open Library for books); accept only a strong match, and report the DOI found.
 *  - standards and guides (ISO, JCGM) cannot be checked this way and are reported as such.
 * Writes docs/references/verification.json. Needs network access; not part of the offline test suite.
 * Exit code 1 if any reference is a mismatch or a DOI that does not resolve.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const UA = 'NanoCalc-reference-verifier/1.0';
const args = process.argv.slice(2);

/* ---- load NC.refs and NC.library from the app's own scripts ---- */
const ctx = { console, Math, JSON };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
[...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1]).filter((s) => !s.endsWith('app.js'))
  .forEach((s) => vm.runInContext(fs.readFileSync(path.join(root, s), 'utf8'), ctx, { filename: s }));
const NC = ctx.NC;

/* ---- text matching ---- */
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'its', 'their', 'von', 'der', 'die', 'des', 'und', 'eine', 'einer', 'den', 'dem', 'aus', 'mit', 'zur', 'zum', 'über', 'uber', 'des']);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const toks = (s) => norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
/** Fraction of our title's words found in theirs (robust to subtitles they add). */
function contain(ours, theirs) {
  const A = toks(ours), B = new Set(toks(theirs));
  if (!A.length) return 0;
  return A.filter((w) => B.has(w)).length / A.length;
}
function firstSurname(authors) {
  const a = String(authors || '').split(/;|\band\b/)[0].trim();
  const fam = a.includes(',') ? a.split(',')[0] : a.split(/\s+/).pop();
  return norm(fam).split(' ').pop();
}
function yearOf(m) {
  for (const k of ['published-print', 'issued', 'published-online', 'published', 'created']) {
    const d = m[k] && m[k]['date-parts'] && m[k]['date-parts'][0];
    if (d && d[0]) return d[0];
  }
  return null;
}
function authorOk(ref, m) {
  const want = firstSurname(ref.authors);
  if (!want || /^(iso|jcgm|iupac)$/.test(want)) return true;
  const fams = (m.author || []).concat(m.editor || []).map((a) => norm(a.family || a.name || ''));
  return fams.some((f) => f && (f === want || f.split(' ').includes(want) || want.split(' ').includes(f.split(' ').pop())));
}

/* ---- network ---- */
async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.status === 404) return { status: 404 };
      if (r.ok) return { status: 200, json: await r.json() };
      if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 1500 * (i + 1))); continue; }
      return { status: r.status };
    } catch (e) { await new Promise((ok) => setTimeout(ok, 1000 * (i + 1))); }
  }
  return { status: 0 };
}
const crossrefWork = (doi) => get('https://api.crossref.org/works/' + encodeURIComponent(doi));
const crossrefSearch = (q) => get('https://api.crossref.org/works?rows=6&select=DOI,title,author,editor,issued,published-print,published-online,container-title,volume,page,type&query.bibliographic=' + encodeURIComponent(q));
const openLibrary = (title, author) => get('https://openlibrary.org/search.json?limit=5&fields=title,author_name,first_publish_year,publisher&title=' + encodeURIComponent(title) + '&author=' + encodeURIComponent(author));

function compare(ref, m) {
  const t = (m.title || [''])[0] + ' ' + ((m.subtitle || [])[0] || '');
  const c = contain(ref.title, t);
  const y = yearOf(m);
  const issues = [];
  if (c < 0.8) issues.push('title differs (' + Math.round(c * 100) + '% of words match): "' + t.trim().slice(0, 120) + '"');
  if (!authorOk(ref, m)) issues.push('first author differs: Crossref has ' + ((m.author || [])[0] ? (m.author[0].family || m.author[0].name) : 'none'));
  if (ref.year && y && Math.abs(Number(ref.year) - y) > 1) issues.push('year differs: Crossref ' + y);
  const warn = [];
  const vnum = (x) => (String(x).match(/\d+/) || [norm(x)])[0]; // '65U' (de Gruyter) = 65
  if (ref.volume && m.volume && vnum(ref.volume) !== vnum(m.volume)) warn.push('volume: Crossref ' + m.volume);
  const fp = (s) => String(s || '').split(/[–\-]/)[0].replace(/^\D+/, '');
  if (ref.pages && m.page && fp(ref.pages) && fp(ref.pages) !== fp(m.page)) warn.push('first page: Crossref ' + m.page);
  return { score: c, year: y, issues: issues, warnings: warn, title: t.trim(), journal: (m['container-title'] || [])[0], volume: m.volume, page: m.page };
}

async function verify(id, ref) {
  if (ref.type === 'standard' || /^(ISO|JCGM)\b/.test(ref.authors || '')) {
    return { status: 'not-checkable', note: 'standard or guide: check against the issuing body\'s catalogue' };
  }
  if (ref.doi) {
    const r = await crossrefWork(ref.doi);
    if (r.status === 404) return { status: 'doi-not-found', note: 'DOI ' + ref.doi + ' does not resolve in Crossref' };
    if (r.status !== 200) return { status: 'error', note: 'Crossref request failed (' + r.status + ')' };
    const cmp = compare(ref, r.json.message);
    return cmp.issues.length ? { status: 'mismatch', doi: ref.doi, ...cmp } : { status: 'verified', via: 'crossref-doi', doi: ref.doi, ...cmp };
  }
  // No DOI: search Crossref
  const q = [ref.title, firstSurname(ref.authors), ref.year].filter(Boolean).join(' ');
  const s = await crossrefSearch(q);
  if (s.status === 200) {
    // A search hit must be the same kind of work, and an article must match volume and first page,
    // otherwise e.g. a 1947 paper is mistaken for the 1948 book with the same title.
    const BOOKISH = ['book', 'monograph', 'edited-book', 'reference-book', 'book-set', 'book-series'];
    const sameKind = (m) => ref.type === 'book' ? BOOKISH.includes(m.type)
      : ref.type === 'article' ? ['journal-article', 'proceedings-article'].includes(m.type) : true;
    const fp = (x) => String(x || '').split(/[–\-]/)[0].replace(/^\D+/, '');
    const sameIssue = (m) => ref.type !== 'article' ||
      ((!ref.volume || !m.volume || (String(ref.volume).match(/\d+/) || [''])[0] === (String(m.volume).match(/\d+/) || [''])[0]) && (!ref.pages || !m.page || fp(ref.pages) === fp(m.page)) && !!(m.volume || m.page));
    const best = (s.json.message.items || []).filter((m) => sameKind(m) && sameIssue(m)).map((m) => ({ m, cmp: compare(ref, m) }))
      .filter((x) => !x.cmp.issues.length && !x.cmp.warnings.length).sort((a, b) => b.cmp.score - a.cmp.score)[0];
    if (best && best.cmp.score >= 0.85) return { status: 'verified', via: 'crossref-search', foundDoi: best.m.DOI, ...best.cmp };
  }
  if (ref.type === 'book') {
    const ol = await openLibrary(ref.title.split(/[:(]/)[0], firstSurname(ref.authors));
    if (ol.status === 200) {
      const hit = (ol.json.docs || []).find((d) => contain(ref.title.split(/[:(]/)[0], d.title) >= 0.8 &&
        (d.author_name || []).some((a) => norm(a).split(' ').includes(firstSurname(ref.authors))));
      if (hit) return { status: 'verified', via: 'openlibrary', title: hit.title, year: hit.first_publish_year, warnings: [] };
    }
  }
  return { status: 'not-found', note: 'no strong match in Crossref' + (ref.type === 'book' ? ' or Open Library' : '') + ' (older or non-indexed works may be genuine)' };
}

async function runAll(list) {
  const out = {};
  let i = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (i < list.length) {
      const [id, ref] = list[i++];
      out[id] = await verify(id, ref);
      process.stdout.write('.');
    }
  });
  await Promise.all(workers);
  process.stdout.write('\n');
  return out;
}

(async () => {
  const sets = [];
  if (!args.includes('--library')) sets.push(['app', Object.entries(NC.refs)]);
  // library entries that point at an app citation ({ref}) are verified in the 'app' set
  if (!args.includes('--app') && NC.library) sets.push(['library', NC.library.filter((r) => !r.ref).map((r) => [r.id, r])]);
  const report = { generated: new Date().toISOString().slice(0, 10), tool: 'tools/verify-refs.js', sets: {} };
  let bad = 0;
  for (const [name, list] of sets) {
    console.log('Verifying ' + list.length + ' ' + name + ' references');
    const res = await runAll(list);
    report.sets[name] = res;
    const count = {};
    Object.values(res).forEach((r) => { count[r.status] = (count[r.status] || 0) + 1; });
    console.log('  ' + Object.entries(count).map(([k, v]) => k + ' ' + v).join(', '));
    Object.entries(res).forEach(([id, r]) => {
      if (r.status === 'mismatch' || r.status === 'doi-not-found') { bad++; console.log('  ✗ ' + id + ': ' + (r.issues || [r.note]).join('; ')); }
      else if (r.status === 'not-found') console.log('  ? ' + id + ': ' + r.note);
      else if (r.warnings && r.warnings.length) console.log('  ~ ' + id + ': ' + r.warnings.join('; '));
      if (r.foundDoi) console.log('  + ' + id + ': DOI found ' + r.foundDoi);
    });
  }
  const outDir = path.join(root, 'docs', 'references');
  fs.mkdirSync(outDir, { recursive: true });
  // merge with an existing report so --app / --library runs don't erase each other
  const file = path.join(outDir, 'verification.json');
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* none yet */ }
  report.sets = Object.assign({}, prev.sets || {}, report.sets);
  fs.writeFileSync(file, JSON.stringify(report, null, 1) + '\n');
  console.log('Wrote ' + path.relative(root, file));
  process.exit(bad ? 1 : 0);
})();
