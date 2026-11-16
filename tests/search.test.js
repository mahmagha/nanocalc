/* Site-wide search (js/search.js): matching rules, synonyms, ranking, coverage of every kind of page. */
'use strict';
module.exports = function (t) {
  const { NC, ok } = t;
  const S = NC.search;
  const q = (s) => S.query(s, { limit: 50 });
  const has = (s, kind, re) => q(s).some((r) => r.kind === kind && re.test(r.title));

  ok(S.fold('Stöber') === 'stober' && S.fold('UV-vis') === 'uv vis' && S.fold('Fe₃O₄') === 'fe3o4', 'folding: accents, punctuation and subscripts');
  ok(has('stober', 'protocol', /Stöber/), 'accents ignored: "stober" finds the Stöber protocol');
  ok(has('Stöber', 'protocol', /Stöber/), 'and with the accent');
  ok(!q('TEM').some((r) => /Melting/.test(r.title)), 'three-letter words match whole words only: "TEM" does not find "temperature"');
  ok(has('TEM', 'calc', /TEM/), '"TEM" finds the TEM size-distribution calculator');
  ok(has('transmission electron microscopy', 'calc', /TEM|HRTEM/), 'spelled-out form finds the TEM calculators');
  ok(has('qd', 'calc', /Quantum dot/), 'abbreviation QD → quantum dot');
  ok(has('gold', 'protocol', /gold/i) && has('au', 'protocol', /gold/i), 'gold and Au are interchangeable');
  ok(has('citrate', 'protocol', /Citrate-reduced gold/), 'protocols are searchable');
  ok(has('core shell', 'page', /Particle designer/), 'workspace pages are searchable');
  ok(has('magnetite', 'material', /Magnetite|Fe/), 'materials are searchable');
  ok(has('Turkevich 1951', 'ref', /.+/), 'references are searchable by author and year');
  ok(q('zzzzqqq').length === 0, 'nonsense finds nothing');
  ok(q('').length === 0, 'empty query finds nothing');
  const sch = S.query('scherrer');
  ok(sch.length && sch[0].kind === 'calc' && /Scherrer/.test(sch[0].title), 'a calculator that matches its title ranks first');
  ok(S.query('gold').filter((r) => r.kind === 'calc').length <= 6, 'at most six results per kind by default');
  const g = S.group(S.query('bet'));
  ok(g.length >= 2 && g.every((x) => x.items.length && x.label), 'results group by kind with labels');
  ok(S.query('band gap').every((r) => /^#\//.test(r.href)), 'every result links to a page in the app');
  // every calculator can be found by its own title
  const missing = NC.calculators.filter((c) => !S.query(c.title, { limit: 200 }).some((r) => r.href === '#/calc/' + c.id));
  ok(!missing.length, 'every calculator is found by its title' + (missing.length ? ': ' + missing.map((c) => c.id).join(', ') : ''));
  const pmiss = NC.protocols.filter((p) => !S.query(p.title, { limit: 200 }).some((r) => r.href === '#/synthesis/' + encodeURIComponent(p.id)));
  ok(!pmiss.length, 'every protocol is found by its title');
};
