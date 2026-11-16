/* Reference library (js/library.js) and its verification report (docs/references/verification.json). */
'use strict';
module.exports = function (t) {
  const { NC, ok, fs, path, root } = t;
  const topics = new Set(NC.libraryTopics.map((x) => x.id));
  const KINDS = ['review', 'book', 'primary', 'standard', 'data'];
  const ids = new Set();
  NC.library.forEach((e) => {
    const id = e.ref || e.id;
    ok(!ids.has(id), 'library entry ' + id + ' is listed once');
    ids.add(id);
    ok(topics.has(e.topic), id + ': known topic');
    ok(KINDS.includes(e.kind), id + ': known kind');
    ok(typeof e.use === 'string' && e.use.length > 15, id + ': has a "use" note');
    if (e.ref) { ok(!!NC.refs[e.ref], id + ': links to an existing app citation'); return; }
    ok(!NC.refs[e.id], id + ': does not clash with an app citation id');
    ok(e.authors && e.title && e.year && e.type, id + ': complete citation');
    if (e.type === 'article') ok(!!e.journal, id + ': article has a journal');
    if (e.type === 'standard') ok(!!(e.url || e.doi), id + ': standard has a catalogue URL or DOI to re-check it');
    if (e.doi) ok(/^10\.\d{4,9}\/\S+$/.test(e.doi), id + ': DOI is well formed');
  });

  // Every non-standard library work and every app citation has a passing verification record.
  const rep = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'references', 'verification.json'), 'utf8'));
  NC.library.filter((e) => !e.ref).forEach((e) => {
    const v = (rep.sets.library || {})[e.id];
    const okStatus = e.type === 'standard' ? (v && v.status === 'not-checkable') : (v && v.status === 'verified');
    ok(okStatus, e.id + ': verification record is ' + (v ? v.status : 'missing') + ' (run make verify-refs)');
  });
  Object.keys(NC.refs).forEach((id) => {
    const v = (rep.sets.app || {})[id];
    ok(v && ['verified', 'not-checkable', 'not-found'].includes(v.status), 'app citation ' + id + ': verification record is ' + (v ? v.status : 'missing'));
  });
  const appBad = Object.values(rep.sets.app || {}).filter((v) => v.status === 'mismatch' || v.status === 'doi-not-found').length;
  ok(appBad === 0, 'no app citation is a mismatch or broken DOI (' + appBad + ')');
};
