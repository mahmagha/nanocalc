/* Projects: one particle from design to measurement.

   A project keeps together
     - the design from the particle designer (its state, so it can be reopened and recomputed),
     - the synthesis protocols used, with the batch volume,
     - measurements: results saved from calculators (with their inputs, so each can be reopened),
       and values typed in by hand (e.g. a measured plasmon peak),
     - free notes.
   compare() sets the designer's predictions beside the matching measurements, and toMarkdown()
   writes one lab report. Projects live in this browser (localStorage) and can be exported and
   imported as JSON files. Nothing is sent anywhere. */
(function (global) {
  'use strict';
  const NC = global.NC;
  const KEY = 'nc:projects:v1', ACTIVE = 'nc:project:active';

  // storage: localStorage when available, otherwise memory (tests, private windows)
  const mem = {};
  const store = {
    get: function (k) { try { const s = global.localStorage ? global.localStorage.getItem(k) : mem[k]; return s ? JSON.parse(s) : null; } catch (e) { return mem[k] ? JSON.parse(mem[k]) : null; } },
    set: function (k, v) { const s = JSON.stringify(v); mem[k] = s; try { if (global.localStorage) global.localStorage.setItem(k, s); } catch (e) { /* full or blocked: memory only */ } }
  };
  const now = function () { return new Date().toISOString(); };
  const uid = function () { return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); };

  function all() { const a = store.get(KEY); return Array.isArray(a) ? a : []; }
  function saveAll(a) { store.set(KEY, a); }
  function list() { return all().sort(function (a, b) { return (b.updated || '').localeCompare(a.updated || ''); }); }
  function get(id) { return all().find(function (p) { return p.id === id; }) || null; }
  function put(p) {
    p.updated = now();
    const a = all(), i = a.findIndex(function (x) { return x.id === p.id; });
    if (i >= 0) a[i] = p; else a.push(p);
    saveAll(a);
    return p;
  }
  function create(name) {
    const p = { id: uid(), name: String(name || '').trim() || 'Untitled project', created: now(), updated: now(), design: null, protocols: [], measurements: [], notes: '' };
    put(p);
    setActive(p.id);
    return p;
  }
  function remove(id) { saveAll(all().filter(function (p) { return p.id !== id; })); if (store.get(ACTIVE) === id) store.set(ACTIVE, null); }
  function rename(id, name) { const p = get(id); if (!p) return null; p.name = String(name || '').trim() || p.name; return put(p); }
  function active() { const id = store.get(ACTIVE); return id ? get(id) : null; }
  function setActive(id) { store.set(ACTIVE, id || null); }
  /** The active project, or a new one when there is none. */
  function activeOrNew() { return active() || create('Project ' + (all().length + 1)); }

  function setDesign(id, design) {
    const p = get(id); if (!p) return null;
    p.design = JSON.parse(JSON.stringify(design));
    return put(p);
  }
  function addProtocol(id, protocolId, volumeMl) {
    const p = get(id); if (!p) return null;
    const ex = p.protocols.find(function (r) { return r.id === protocolId; });
    if (ex) { ex.volumeMl = volumeMl; ex.date = now(); } else p.protocols.push({ id: protocolId, volumeMl: volumeMl, date: now() });
    return put(p);
  }
  /** Save a calculator result: its main results (numbers with units) and the raw inputs to reopen it. */
  function addMeasurement(id, def, raw, out, label) {
    const p = get(id); if (!p) return null;
    const results = (out.results || []).filter(function (r) { return typeof r.value === 'number' && isFinite(r.value); })
      .map(function (r) { return { label: r.label, value: r.value, unit: r.unit || '', main: !!r.main, sig: r.sig || 4 }; });
    const m = { id: uid(), calc: def.id, title: def.title, label: label || '', date: now(), raw: raw || {}, results: results };
    p.measurements.push(m);
    put(p);
    return m;
  }
  /** A value measured elsewhere, typed in by hand: quantity is one of QUANTITIES' keys. */
  function addManual(id, quantity, value, note) {
    const p = get(id); if (!p) return null;
    const q = QUANTITIES[quantity];
    if (!q) NC.fail('Unknown quantity "' + quantity + '".');
    const x = NC.need(Number(value), q.label, { positive: true });
    const m = { id: uid(), calc: null, title: 'Entered by hand', label: note || '', date: now(), raw: {}, results: [{ label: q.label, value: x, unit: q.unit, main: true, quantity: quantity }] };
    p.measurements.push(m);
    put(p);
    return m;
  }
  function removeMeasurement(id, mid) {
    const p = get(id); if (!p) return null;
    p.measurements = p.measurements.filter(function (m) { return m.id !== mid; });
    return put(p);
  }
  function setNotes(id, text) { const p = get(id); if (!p) return null; p.notes = String(text || ''); return put(p); }

  /* ---------------- predicted vs measured ---------------- */
  // Quantities that can be both predicted by the designer and measured.
  const QUANTITIES = {
    core: { label: 'Core diameter', unit: 'nm' },
    outer: { label: 'Inorganic diameter (core + shells)', unit: 'nm' },
    dh: { label: 'Hydrodynamic diameter', unit: 'nm' },
    lam: { label: 'Extinction peak λ_max', unit: 'nm' },
    conc: { label: 'Particles per mL', unit: 'mL⁻¹' },
    ligands: { label: 'Ligands per particle', unit: '' }
  };
  // Which calculator results measure which quantity, and what the measurement actually sees.
  const MEASURES = [
    { calc: 'dls', label: /^Hydrodynamic diameter/, q: 'dh', how: 'DLS (intensity-weighted)' },
    { calc: 'cumulants', label: /^z-average diameter/, q: 'dh', how: 'DLS z-average (intensity-weighted)' },
    { calc: 'nta', label: /^Hydrodynamic diameter/, q: 'dh', how: 'NTA (number-weighted)' },
    { calc: 'nta', label: /^Concentration \(original\)/, q: 'conc', how: 'NTA' },
    { calc: 'psd', label: /^Mean diameter/, q: 'outer', how: 'TEM/SEM image analysis (sees the inorganic particle)' },
    { calc: 'haiss', label: /^Diameter d/, q: 'core', how: 'UV-vis (Haiss method, valid for bare gold)' },
    { calc: 'haiss', label: /^Particles per mL/, q: 'conc', how: 'UV-vis (Haiss method)' },
    { calc: 'scherrer', label: /^Mean crystallite size/, q: 'core', how: 'XRD Scherrer (crystallite size, a lower bound for polycrystalline cores)' },
    { calc: 'wh', label: /^Crystallite size/, q: 'core', how: 'XRD Williamson–Hall (crystallite size)' },
    { calc: 'spicpms', label: /^Particle diameter/, q: 'core', how: 'single-particle ICP-MS (element mass, so the core)' },
    { calc: 'spicpms', label: /^Particles per mL \(sample\)/, q: 'conc', how: 'single-particle ICP-MS' },
    { calc: 'icp2n', label: /^Particles per mL/, q: 'conc', how: 'ICP-MS mass concentration' },
    { calc: 'tga', label: /^Ligands per particle/, q: 'ligands', how: 'TGA mass loss' }
  ];

  /** Predictions from the design (null when the design cannot be computed). */
  function predict(design) {
    if (!design || !NC.designer) return null;
    let out;
    try { out = NC.designer.compute(design); } catch (e) { return { error: e.message }; }
    const L = out.geometry.layers;
    const pred = {
      core: 2 * L[0].rOut,
      outer: 2 * L[L.length - 1].rOut,
      lam: out.optics && isFinite(out.optics.lam) ? out.optics.lam : null,
      conc: null,
      ligands: out.ligand && isFinite(out.ligand.N) ? out.ligand.N : null,
      dh: null
    };
    const c = (out.results || []).find(function (r) { return r.label === 'Particles per mL'; });
    if (c) pred.conc = c.value;
    // hydrodynamic: inorganic diameter plus twice the ligand shell (when the design gives its thickness)
    if (out.ligand && isFinite(out.ligand.thickness)) pred.dh = pred.outer + 2 * out.ligand.thickness;
    pred.notes = {
      dh: out.ligand && isFinite(out.ligand.thickness) ? 'inorganic diameter + 2 × ligand shell; DLS also counts the solvation layer, so it usually reads larger' : 'needs a ligand with a shell thickness in the design',
      lam: pred.lam ? 'multilayer Mie theory' : 'needs optical constants for every layer',
      conc: 'from the batch mass concentration and the particle mass'
    };
    return pred;
  }
  /** Rows of predicted against measured: [{q, label, unit, predicted, note, measured: [{value, how, date, mid}]}]. */
  function compare(p) {
    const pred = predict(p.design) || {};
    const rows = Object.keys(QUANTITIES).map(function (q) {
      return { q: q, label: QUANTITIES[q].label, unit: QUANTITIES[q].unit, predicted: typeof pred[q] === 'number' ? pred[q] : null, note: (pred.notes || {})[q] || '', measured: [] };
    });
    const byQ = {};
    rows.forEach(function (r) { byQ[r.q] = r; });
    (p.measurements || []).forEach(function (m) {
      m.results.forEach(function (r) {
        let q = r.quantity, how = 'entered by hand' + (m.label ? ' (' + m.label + ')' : '');
        if (!q && m.calc) {
          const rule = MEASURES.find(function (x) { return x.calc === m.calc && x.label.test(r.label); });
          if (rule) { q = rule.q; how = rule.how; }
        }
        if (q && byQ[q]) {
          const pv = byQ[q].predicted;
          byQ[q].measured.push({ value: r.value, how: how, date: m.date, mid: m.id, deviation: pv ? (r.value - pv) / pv : null });
        }
      });
    });
    return { rows: rows.filter(function (r) { return r.predicted !== null || r.measured.length; }), error: pred.error || null };
  }

  /* ---------------- calculator inputs filled in from a design ---------------- */
  /** Raw form values for a calculator, from a design (or just a material key). Only fields the calculator has. */
  function prefill(calcId, design, material) {
    const def = NC.byId && NC.byId[calcId];
    if (!def) return null;
    const has = function (id) { return def.inputs.some(function (i) { return i.id === id; }); };
    const opt = function (id, v) { const i = def.inputs.find(function (x) { return x.id === id; }); return i && i.options && i.options.some(function (o) { return String(o[0]) === String(v); }); };
    const v = {};
    const core = design && design.core, shells = (design && design.shells) || [];
    const mat = core ? core.material : material;
    let pred = null;
    if (design) { try { const o = NC.designer.compute(design); pred = o; } catch (e) { pred = null; } }
    const set = function (id, x) { if (has(id) && x !== undefined && x !== null && x !== '' && (typeof x !== 'number' || isFinite(x))) v[id] = String(typeof x === 'number' ? Number(x.toPrecision(6)) : x); };
    if (mat && has('mat') && opt('mat', mat)) set('mat', mat);
    if (mat && has('refmat') && opt('refmat', mat)) set('refmat', mat);
    const m = mat && NC.materials ? NC.materials[mat] : null;
    if (m) { set('rho', m.rho); set('M', m.M); }
    if (core && isFinite(Number(core.D))) {
      const D = Number(core.D);
      if (calcId === 'nanoparticle' && shells.length) {
        set('struct', 'coreshell'); set('D', D);
        if (opt('smat', shells[0].material)) set('smat', shells[0].material);
        const sm = NC.materials && NC.materials[shells[0].material];
        if (sm) { set('srho', sm.rho); set('sM', sm.M); }
        set('ts', Number(shells[0].t));
      } else if (calcId === 'sediment' || calcId === 'tga') {
        // these see the whole inorganic particle: outer diameter and its mean density
        const g = pred && pred.geometry, L = g ? g.layers : null;
        const outer = L ? 2 * L[L.length - 1].rOut : D;
        set('D', outer);
        if (shells.length && pred) {
          const rhoEff = (pred.results || []).find(function (r) { return r.label === 'Effective density'; });
          if (rhoEff) { if (has('mat') && opt('mat', 'custom')) v.mat = 'custom'; set('rho', rhoEff.value); }
        }
      } else {
        set('D', D); set('pD', D);
      }
    }
    if (design && design.medium && has('nmed')) set('nmed', Number(design.medium.n));
    return v;
  }

  /* ---------------- summary, report, import/export ---------------- */
  function designSummary(d) {
    if (!d || !d.core) return '';
    const lab = function (k) { const m = NC.materials && NC.materials[k]; return m ? (m.label.match(/\(([^)]+)\)/) || [null, m.label])[1].split(' ').pop() : k; };
    let s = lab(d.core.material) + ' ' + d.core.D + ' nm';
    (d.shells || []).forEach(function (sh) { s += ' @ ' + lab(sh.material) + ' ' + sh.t + ' nm'; });
    if (d.ligand && d.ligand.key) s += ' + ' + d.ligand.key;
    return s;
  }
  function summary(p) {
    const bits = [];
    if (p.design) bits.push(designSummary(p.design));
    if (p.protocols.length) bits.push(p.protocols.length + ' protocol' + (p.protocols.length > 1 ? 's' : ''));
    if (p.measurements.length) bits.push(p.measurements.length + ' measurement' + (p.measurements.length > 1 ? 's' : ''));
    return bits.join(' · ') || 'Empty project';
  }
  const f = function (x, s) { return NC.fmt(x, s || 4); };
  function toMarkdown(p) {
    const L = [];
    L.push('# ' + p.name, '', 'NanoCalc v' + NC.version + ' project report, ' + now().slice(0, 10) + '. Created ' + (p.created || '').slice(0, 10) + '.', '');
    if (p.design) {
      L.push('## Design', '', designSummary(p.design), '');
      const pr = predict(p.design);
      if (pr && pr.error) L.push('The design could not be computed: ' + pr.error, '');
    }
    if (p.protocols.length) {
      L.push('## Synthesis', '');
      p.protocols.forEach(function (r) {
        const pp = NC.protocolById && NC.protocolById[r.id];
        L.push('- ' + (pp ? pp.title : r.id) + (r.volumeMl ? ', batch ' + f(r.volumeMl) + ' mL' : '') + ' (' + (r.date || '').slice(0, 10) + ')');
      });
      L.push('');
    }
    const cmp = compare(p);
    if (cmp.rows.length) {
      L.push('## Predicted and measured', '', '| Quantity | Predicted | Measured | Method | Difference |', '|---|---|---|---|---|');
      cmp.rows.forEach(function (r) {
        const u = r.unit ? ' ' + r.unit : '';
        if (!r.measured.length) L.push('| ' + r.label + ' | ' + (r.predicted !== null ? f(r.predicted) + u : '—') + ' | — | | |');
        r.measured.forEach(function (m, i) {
          L.push('| ' + (i ? '' : r.label) + ' | ' + (i ? '' : r.predicted !== null ? f(r.predicted) + u : '—') + ' | ' + f(m.value) + u + ' | ' + m.how + ' | ' + (m.deviation !== null ? (m.deviation >= 0 ? '+' : '') + NC.fix(m.deviation * 100, 1) + ' %' : '') + ' |');
        });
      });
      L.push('');
    }
    if (p.measurements.length) {
      L.push('## Measurements', '');
      p.measurements.forEach(function (m) {
        L.push('### ' + m.title + (m.label ? ': ' + m.label : '') + ' (' + (m.date || '').slice(0, 10) + ')', '');
        m.results.forEach(function (r) { L.push('- ' + r.label + ': ' + f(r.value, r.sig) + (r.unit ? ' ' + r.unit : '')); });
        L.push('');
      });
    }
    if (p.notes) L.push('## Notes', '', p.notes, '');
    L.push('---', 'Each calculation, with its steps and references, can be reopened from the project in NanoCalc.');
    return L.join('\n');
  }
  function exportJSON(p) { return JSON.stringify({ format: 'nanocalc-project', version: 1, app: NC.version, project: p }, null, 1); }
  function importJSON(text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { NC.fail('This file is not a NanoCalc project (not JSON).'); }
    const p = o && o.format === 'nanocalc-project' ? o.project : null;
    if (!p || typeof p !== 'object' || !p.name) NC.fail('This file is not a NanoCalc project.');
    const q = { id: uid(), name: String(p.name), created: p.created || now(), updated: now(), design: p.design && p.design.core ? p.design : null,
      protocols: Array.isArray(p.protocols) ? p.protocols : [], measurements: Array.isArray(p.measurements) ? p.measurements.filter(function (m) { return m && Array.isArray(m.results); }) : [], notes: String(p.notes || '') };
    if (get(p.id) === null && p.id) q.id = String(p.id);
    put(q);
    return q;
  }

  NC.projects = {
    list: list, get: get, create: create, remove: remove, rename: rename, active: active, setActive: setActive, activeOrNew: activeOrNew,
    setDesign: setDesign, addProtocol: addProtocol, addMeasurement: addMeasurement, addManual: addManual, removeMeasurement: removeMeasurement, setNotes: setNotes,
    predict: predict, compare: compare, prefill: prefill, summary: summary, designSummary: designSummary, toMarkdown: toMarkdown,
    exportJSON: exportJSON, importJSON: importJSON, QUANTITIES: QUANTITIES, MEASURES: MEASURES
  };
})(typeof window !== 'undefined' ? window : globalThis);
