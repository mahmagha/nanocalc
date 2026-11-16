/* Site-wide search: one index over calculators, workspace pages, synthesis protocols, materials,
   cited references and the further-reading library.

   Matching rules
   - accents and case are ignored (Stober finds Stöber), punctuation splits words (UV-vis = UV vis)
   - every query word must match the start of a word in the entry; words of three letters or fewer
     must match a whole word, so "TEM" finds electron microscopy but not "temperature"
   - common abbreviations and their spelled-out forms are interchangeable (TEM ↔ transmission electron
     microscopy, QD ↔ quantum dot, Au ↔ gold …)
   Results are ranked by where the words matched (title first) and grouped by kind. */
(function (global) {
  'use strict';
  const NC = global.NC;

  const fold = function (s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[₀-₉]/g, function (c) { return String(c.charCodeAt(0) - 0x2080); })
      .replace(/[^a-z0-9]+/g, ' ').trim();
  };
  const words = function (s) { return fold(s).split(' ').filter(Boolean); };

  // Abbreviation ↔ spelled-out form. Each group is a set of interchangeable phrases.
  const SYNONYMS = [
    ['tem', 'transmission electron microscopy', 'electron microscopy', 'hrtem'],
    ['sem', 'scanning electron microscopy', 'electron microscopy'],
    ['afm', 'atomic force microscopy'],
    ['xrd', 'x ray diffraction', 'diffraction', 'scherrer'],
    ['saxs', 'small angle x ray scattering', 'small angle scattering'],
    ['dls', 'dynamic light scattering', 'hydrodynamic'],
    ['nta', 'nanoparticle tracking'],
    ['uv vis', 'uvvis', 'absorbance', 'absorption spectrum', 'extinction'],
    ['pl', 'photoluminescence', 'fluorescence', 'quantum yield'],
    ['plqy', 'photoluminescence quantum yield', 'quantum yield'],
    ['ftir', 'infrared', 'ir'],
    ['xps', 'x ray photoelectron'],
    ['edx', 'eds', 'energy dispersive'],
    ['icp', 'icp ms', 'icp oes', 'inductively coupled plasma'],
    ['bet', 'brunauer', 'surface area', 'sorption', 'isotherm'],
    ['bjh', 'pore size', 'mesopore'],
    ['tga', 'thermogravimetric', 'thermogravimetry'],
    ['dsc', 'differential scanning calorimetry'],
    ['zeta', 'electrophoretic', 'zeta potential'],
    ['dlvo', 'colloidal stability', 'aggregation'],
    ['lspr', 'spr', 'plasmon', 'surface plasmon'],
    ['qd', 'qds', 'quantum dot', 'quantum dots'],
    ['cnt', 'cnts', 'swcnt', 'nanotube', 'nanotubes'],
    ['np', 'nps', 'nanoparticle', 'nanoparticles'],
    ['au', 'gold'], ['ag', 'silver'], ['pt', 'platinum'], ['pd', 'palladium'], ['cu', 'copper'],
    ['sio2', 'silica'], ['tio2', 'titania', 'titanium dioxide'], ['zno', 'zinc oxide'],
    ['fe3o4', 'magnetite', 'iron oxide'], ['cdse', 'cadmium selenide'], ['zns', 'zinc sulfide'], ['cds', 'cadmium sulfide'],
    ['peg', 'polyethylene glycol', 'pegylation'],
    ['core shell', 'coreshell', 'shell', 'coated'],
    ['ligand', 'ligands', 'capping', 'surface chemistry', 'thiol'],
    ['synthesis', 'protocol', 'recipe', 'procedure', 'make'],
    ['size', 'diameter', 'radius'],
    ['band gap', 'bandgap', 'tauc', 'optical gap']
  ].map(function (g) { return g.map(words); });
  const SYN = {};
  SYNONYMS.forEach(function (g) {
    g.forEach(function (ph) { if (ph.length === 1) (SYN[ph[0]] = SYN[ph[0]] || []).push.apply(SYN[ph[0]], g); });
  });

  /** Does one query word (or phrase) match the word list? Returns 2 for a whole word, 1 for a prefix, 0 for none. */
  function wordHit(q, ws) {
    let best = 0;
    for (let i = 0; i < ws.length && best < 2; i++) {
      if (ws[i] === q) best = 2;
      else if (q.length > 3 && ws[i].indexOf(q) === 0) best = 1;
    }
    return best;
  }
  function phraseHit(ph, ws) {
    if (ph.length === 1) return wordHit(ph[0], ws);
    for (let i = 0; i + ph.length <= ws.length; i++) {
      let ok = true;
      for (let j = 0; j < ph.length && ok; j++) ok = ws[i + j] === ph[j] || (j === ph.length - 1 && ph[j].length > 3 && ws[i + j].indexOf(ph[j]) === 0);
      if (ok) return 2;
    }
    return 0;
  }
  /** Score of a query word against one field: the word itself, or any of its synonyms (scored a little lower). */
  function termHit(q, ws) {
    let s = wordHit(q, ws);
    if (s === 2) return 2;
    (SYN[q] || []).forEach(function (ph) { if (s < 1.5 && phraseHit(ph, ws)) s = Math.max(s, 1.5); });
    return s;
  }

  const KIND = {
    // boost: tools you can use rank above works you can read when they match equally well
    page: { label: 'Workspaces', order: 0, boost: 1.5 },
    calc: { label: 'Calculators', order: 1, boost: 1.3 },
    protocol: { label: 'Synthesis protocols', order: 2, boost: 1.2 },
    material: { label: 'Materials', order: 3, boost: 1 },
    reading: { label: 'Further reading', order: 4, boost: 0.8 },
    ref: { label: 'References', order: 5, boost: 0.7 }
  };

  let INDEX = null;
  function entry(kind, title, sub, href, fields) {
    // fields: [[text, weight], …]; title is always weight 3
    const f = [[title, 3]].concat(fields || []).map(function (x) { return { ws: words(x[0]), w: x[1] }; });
    return { kind: kind, title: title, sub: sub || '', href: href, fields: f };
  }
  function build() {
    const out = [];
    const cat = function (id) { return (NC.categories || []).find(function (g) { return g.id === id; }) || {}; };
    (NC.sections || []).forEach(function (s) {
      (s.pages || []).forEach(function (p) { out.push(entry('page', p.label, p.blurb, p.href, [[p.keywords || '', 2], [p.blurb, 1], [s.label + ' ' + s.verb, 1]])); });
    });
    out.push(entry('page', 'Projects', 'Keep a design, the protocols you used and your measurements together, and compare predicted with measured.', '#/projects', [['project notebook lab report predicted measured compare', 1]]));
    (NC.calculators || []).forEach(function (c) {
      const g = cat(c.category);
      out.push(entry('calc', c.title, c.short || g.label, '#/calc/' + c.id, [[c.short || '', 2], [g.label + ' ' + (g.aliases || '') + ' ' + c.id, 2], [c.description, 1]]));
    });
    (NC.protocols || []).forEach(function (p) {
      const makes = (p.makes || []).map(function (m) { return [m.role, m.material, m.ligand, m.shape, (NC.materials && NC.materials[m.material] || {}).label].filter(Boolean).join(' '); }).join(' ');
      out.push(entry('protocol', p.title, p.sizeText || '', '#/synthesis/' + encodeURIComponent(p.id), [[makes + ' synthesis protocol', 2], [p.summary, 1], [(p.reagents || []).map(function (r) { return r.name + ' ' + (r.formula || ''); }).join(' '), 1]]));
    });
    if (NC.materials) Object.keys(NC.materials).forEach(function (k) {
      const m = NC.materials[k];
      out.push(entry('material', m.label, 'ρ = ' + m.rho + ' g/cm³, M = ' + m.M + ' g/mol (material database)', '#/calc/materials', [[k, 3]]));
    });
    const refLine = function (r) { return (r.authors || '').split(';')[0].split(',')[0] + (r.year ? ' (' + r.year + ')' : '') + (r.journal ? ', ' + r.journal : r.publisher ? ', ' + r.publisher : ''); };
    const topics = {};
    (NC.libraryTopics || []).forEach(function (t) { topics[t.id] = t.label; });
    (NC.library || []).forEach(function (e) {
      const r = e.ref ? NC.refs[e.ref] : e;
      if (!r) return;
      out.push(entry('reading', r.title, refLine(r) + ' · ' + (topics[e.topic] || ''), '#/reading/' + e.topic, [[r.authors + ' ' + r.year, 2], [e.use + ' ' + (topics[e.topic] || ''), 1]]));
    });
    Object.keys(NC.refs || {}).forEach(function (id) {
      const r = NC.refs[id];
      const surname = (r.authors || '').split(';')[0].split(',')[0].trim();
      out.push(entry('ref', r.title || id, refLine(r), '#/references?q=' + encodeURIComponent((surname + ' ' + (r.year || '')).trim()), [[r.authors + ' ' + (r.year || '') + ' ' + (r.journal || ''), 2]]));
    });
    return out;
  }

  /**
   * Search everything. Returns [{kind, kindLabel, title, sub, href, score}], best first,
   * at most `limit` per kind (default 6).
   */
  /** The query's words, plus variants where a spelled-out phrase is replaced by its abbreviation ("transmission electron microscopy" → "tem"). */
  function variants(qs) {
    const out = [qs], text = ' ' + qs.join(' ') + ' ';
    SYNONYMS.forEach(function (g) {
      g.forEach(function (ph) {
        if (ph.length < 2 || text.indexOf(' ' + ph.join(' ') + ' ') < 0) return;
        const abbr = g.find(function (x) { return x.length === 1; });
        if (abbr) out.push(words(text.replace(' ' + ph.join(' ') + ' ', ' ' + abbr[0] + ' ')));
      });
    });
    return out;
  }
  function search(query, opts) {
    opts = opts || {};
    const qs0 = words(query);
    if (!qs0.length) return [];
    if (!INDEX) INDEX = build();
    const hits = [];
    const vs = variants(qs0);
    INDEX.forEach(function (e) {
      let top = 0;
      vs.forEach(function (qs) {
        let score = 0;
        for (let i = 0; i < qs.length; i++) {
          let best = 0;
          e.fields.forEach(function (f) { const h = termHit(qs[i], f.ws); if (h) best = Math.max(best, h * f.w); });
          if (!best) return; // every query word must match somewhere
          score += best;
        }
        top = Math.max(top, score);
      });
      if (top) hits.push({ kind: e.kind, kindLabel: KIND[e.kind].label, title: e.title, sub: e.sub, href: e.href, score: top * KIND[e.kind].boost });
    });
    hits.sort(function (a, b) { return b.score - a.score || KIND[a.kind].order - KIND[b.kind].order || a.title.localeCompare(b.title); });
    const per = {}, limit = opts.limit || 6;
    return hits.filter(function (h) { per[h.kind] = (per[h.kind] || 0) + 1; return per[h.kind] <= limit; });
  }

  /** Group results by kind, in a fixed order (workspaces, calculators, protocols, …). */
  function group(results) {
    const g = {};
    results.forEach(function (r) { (g[r.kind] = g[r.kind] || []).push(r); });
    return Object.keys(KIND).filter(function (k) { return g[k]; }).sort(function (a, b) {
      // the kind holding the best hit first, then the fixed order
      return (g[b][0].score - g[a][0].score) || KIND[a].order - KIND[b].order;
    }).map(function (k) { return { kind: k, label: KIND[k].label, items: g[k] }; });
  }

  NC.search = { query: search, group: group, fold: fold, words: words, reset: function () { INDEX = null; }, synonyms: SYNONYMS };
})(typeof window !== 'undefined' ? window : globalThis);
