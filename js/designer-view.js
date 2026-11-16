/*
 * Layered particle designer: user interface.
 *
 *   NC.designerView.render(el, opts) → { getState(), setState(design), destroy() }
 *   opts: { state: design (from the URL, optional), onChange(design) (called after every settled
 *           change), heading: false to omit the <h1> }
 *
 * Left: layer stack editor (core, shells, ligand, medium, batch, wavelengths); every size has a
 * slider beside its number field. Right: to-scale cross-section, live results and spectra
 * (NC.renderOutput when the app provides it, otherwise a minimal fallback), the synthesis route,
 * then steps and references. Sliders recompute once per animation frame; the slow part (steps,
 * references) is rendered when the input settles. The design is kept in localStorage.
 */
(function (global) {
  'use strict';
  const NC = global.NC;
  const esc = function (s) { return NC.esc(s); };
  const KEY = 'nc:designer:v1';
  const raf = function (fn) { return global.requestAnimationFrame ? global.requestAnimationFrame(fn) : setTimeout(fn, 16); };
  const caf = function (h) { if (global.cancelAnimationFrame) global.cancelAnimationFrame(h); else clearTimeout(h); };
  let uid = 0;

  const clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  function load() {
    try { const s = global.localStorage && global.localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function save(st) {
    try { if (global.localStorage) global.localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage unavailable */ }
  }
  // named designs saved in this browser: [{ name, date, design }]
  const SAVED = 'nc:designer:saved';
  function savedList() { try { const s = global.localStorage && global.localStorage.getItem(SAVED); const a = s ? JSON.parse(s) : []; return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function setSavedList(a) { try { if (global.localStorage) global.localStorage.setItem(SAVED, JSON.stringify(a)); } catch (e) { /* storage unavailable */ } }
  function getPath(o, path) {
    return path.split('.').reduce(function (a, k) { return a === undefined || a === null ? undefined : a[k]; }, o);
  }
  function setPath(o, path, v) {
    const ks = path.split('.');
    let a = o;
    for (let i = 0; i < ks.length - 1; i++) {
      if (a[ks[i]] === undefined || a[ks[i]] === null) a[ks[i]] = {};
      a = a[ks[i]];
    }
    a[ks[ks.length - 1]] = v;
  }

  /** Fill in missing parts so the editor always has something to show. */
  function normalize(d) {
    const D = NC.designer, def = D.defaults();
    d = d && typeof d === 'object' ? clone(d) : def;
    if (!d.core || typeof d.core !== 'object') d.core = def.core;
    if (!Array.isArray(d.shells)) d.shells = [];
    if (!d.medium) d.medium = def.medium;
    if (!d.batch) d.batch = def.batch;
    if (!d.lambda) d.lambda = def.lambda;
    if (d.ligand && !d.ligand.key) d.ligand = null;
    [d.core].concat(d.shells).forEach(function (L) { if (L && !L.optical) L.optical = D.defaultOptical(L.material); });
    return d;
  }

  /* ---------------- allowed values (the same limits js/designer.js checks) ---------------- */
  const MAX_SHELLS = 12;
  function limitsFor(path) {
    const k = path.split('.').pop();
    if (path === 'core.D' || /^shells\.\d+\.t$/.test(path)) return { gt: 0, max: 20000 };
    if (path === 'ligand.nC') return { int: true, min: 1, max: 30 };
    if (path === 'ligand.a') return { gt: 0, max: 2 };
    if (path === 'ligand.length') return { gt: 0, max: 100 };
    if (path === 'ligand.excess') return { min: 1, max: 1e6 };
    if (k === 'k') return { min: 0 };
    if (/^(rho|M|n|epsInf|wp|gam|value|Mw|volumeMl|massConc|particleConc|min|max|step)$/.test(k)) return { gt: 0 };
    return null;
  }
  function limitAttrs(lim) {
    if (!lim) return ' step="any" inputmode="decimal"';
    return (lim.int ? ' step="1" inputmode="numeric"' : ' step="any" inputmode="decimal"') +
      (lim.min !== undefined ? ' min="' + lim.min + '"' : lim.gt !== undefined ? ' min="' + lim.gt + '"' : '') +
      (lim.max !== undefined ? ' max="' + lim.max + '"' : '');
  }

  /* ---------------- sliders (log scale for sizes) ---------------- */
  const SLIDER = 1000;
  function toPos(v, lo, hi, log) {
    if (!(v > 0) && log) return 0;
    const p = log ? Math.log(v / lo) / Math.log(hi / lo) : (v - lo) / (hi - lo);
    return Math.round(Math.max(0, Math.min(1, p)) * SLIDER);
  }
  function fromPos(p, lo, hi, log) {
    const t = p / SLIDER, v = log ? lo * Math.pow(hi / lo, t) : lo + t * (hi - lo);
    return Number(v.toPrecision(log ? 3 : 4));
  }

  function render(el, opts) {
    opts = opts || {};
    const D = NC.designer;
    if (!D) { el.innerHTML = '<div class="alert err">The designer engine (js/designer.js) is not loaded.</div>'; return null; }
    const P = 'dz' + (++uid) + '-';
    const pid = function (path) { return P + path.replace(/\./g, '-'); };
    let state = normalize(opts.state || load() || D.defaults());
    const presets = D.presets();

    el.innerHTML =
      '<div class="dz">' +
      (opts.heading === false ? '' : '<div class="dz-head"><h1>Layered particle designer</h1><p class="lede">Build a core with any number of shells and a ligand layer. NanoCalc works out the geometry and composition, the optical spectrum (multilayer Mie theory), the ligand amounts and a synthesis route with the precursor amounts for your batch, each with its steps and sources.</p></div>') +
      '<div class="dz-grid">' +
      '<form class="dz-editor" novalidate aria-label="Particle design"><div class="dz-toolbar"><label for="' + P + 'preset">Example design</label><select id="' + P + 'preset" data-act="preset"><option value="">Choose an example…</option>' +
      presets.map(function (p, i) { return '<option value="' + i + '">' + esc(p.label) + '</option>'; }).join('') + '</select></div>' +
      '<div class="dz-toolbar dz-mine"><label for="' + P + 'mine">My designs</label><select id="' + P + 'mine" data-act="mine"></select>' +
      '<button type="button" class="btn small" data-act="saveas">Save as…</button><button type="button" class="btn small" data-act="delsaved">Delete</button></div>' +
      '<div class="dz-toolbar"><label for="' + P + 'cmp">Compare with</label><select id="' + P + 'cmp" data-act="compare"></select></div>' +
      '<div class="dz-target"><div class="dz-target-row"><label for="' + P + 'tgt">Target peak λ_max</label><input id="' + P + 'tgt" type="number" min="1" step="any" inputmode="decimal" placeholder="nm" aria-describedby="' + P + 'tmsg">' +
      '<label for="' + P + 'tparam" class="dz-by">by changing</label><select id="' + P + 'tparam"></select><button type="button" class="btn small" data-act="solve">Find</button></div>' +
      '<p class="dz-tmsg" id="' + P + 'tmsg" role="status"></p></div>' +
      '<div class="dz-stack"></div></form>' +
      '<div class="dz-out">' +
      '<div class="dz-error" role="alert" aria-live="assertive"></div>' +
      '<figure class="panel dz-fig"><figcaption>Cross-section (to scale)</figcaption><div class="dz-fig-body"></div></figure>' +
      '<div class="dz-live"></div>' +
      '<section class="panel dz-compare" hidden aria-label="Comparison with a saved design"></section>' +
      '<section class="panel dz-route-panel" aria-labelledby="' + P + 'route-h"><h2 id="' + P + 'route-h">Synthesis route</h2><ol class="dz-route"></ol>' +
      '<p class="dz-note">Amounts are stoichiometric minima from a mass balance for the batch; published protocols use excess reagents. Follow the linked protocol and its source for the real quantities.</p></section>' +
      '<div class="dz-detail"></div>' +
      '</div></div></div>';
    const stackEl = el.querySelector('.dz-stack');
    const errEl = el.querySelector('.dz-error');
    const figEl = el.querySelector('.dz-fig-body');
    const liveEl = el.querySelector('.dz-live');
    const routeEl = el.querySelector('.dz-route');
    const detailEl = el.querySelector('.dz-detail');
    const cmpEl = el.querySelector('.dz-compare');
    const collapsed = {};
    let compareWith = null, compareCache = null;

    /* ---------------- editor HTML ---------------- */
    const val = function (path) { const v = getPath(state, path); return v === undefined || v === null ? '' : v; };
    function numField(path, label, unit, extra) {
      extra = extra || {};
      return '<div class="field' + (extra.wide ? ' wide' : '') + '"><label for="' + pid(path) + '">' + esc(label) + (unit ? ' <span class="unit">(' + esc(unit) + ')</span>' : '') + '</label>' +
        '<input id="' + pid(path) + '" type="number"' + limitAttrs(limitsFor(path)) + ' data-path="' + path + '" value="' + esc(val(path)) + '"' + (extra.placeholder ? ' placeholder="' + esc(extra.placeholder) + '"' : '') + (extra.help ? ' aria-describedby="' + pid(path) + '-h"' : '') + '>' +
        (extra.help ? '<span class="help" id="' + pid(path) + '-h">' + esc(extra.help) + '</span>' : '') + msgEl(path) + '</div>';
    }
    function msgEl(path) {
      const lim = limitsFor(path);
      const txt = lim && (lim.int || lim.max !== undefined || lim.min !== undefined) ? NC.limitText(lim) : '';
      return (txt ? '<span class="help dz-lim">Allowed: ' + esc(txt) + '</span>' : '') + '<span class="field-msg err" id="' + pid(path) + '-m" hidden></span>';
    }
    function sliderField(path, label, unit, lo, hi, log, help) {
      const v = Number(val(path));
      return '<div class="field wide dz-size"><label for="' + pid(path) + '">' + esc(label) + ' <span class="unit">(' + esc(unit) + ')</span></label><div class="dz-sizerow">' +
        '<input type="range" id="' + pid(path) + '-r" min="0" max="' + SLIDER + '" step="1" value="' + toPos(v, lo, hi, log) + '" data-path="' + path + '" data-range="' + lo + ',' + hi + ',' + (log ? 1 : 0) + '" aria-label="' + esc(label) + ' slider" aria-valuetext="' + esc((isFinite(v) ? v : '') + ' ' + unit) + '">' +
        '<input type="number" id="' + pid(path) + '"' + limitAttrs(limitsFor(path)) + ' data-path="' + path + '" value="' + esc(val(path)) + '"></div>' +
        (help ? '<span class="help">' + esc(help) + '</span>' : '') + msgEl(path) + '</div>';
    }
    function selField(path, label, options, extra) {
      extra = extra || {};
      const cur = String(val(path));
      const opt = function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; };
      const body = options.map(function (o) {
        if (o.group) return '<optgroup label="' + esc(o.group) + '">' + o.items.map(opt).join('') + '</optgroup>';
        return opt(o);
      }).join('');
      return '<div class="field' + (extra.wide ? ' wide' : '') + '"><label for="' + pid(path) + '">' + esc(label) + '</label><select id="' + pid(path) + '" data-path="' + path + '"' + (extra.rebuild ? ' data-rebuild="' + extra.rebuild + '"' : '') + '>' + body + '</select>' +
        (extra.help ? '<span class="help">' + esc(extra.help) + '</span>' : '') + '</div>';
    }
    function materialOptions() {
      const groups = NC.materialGroups || {};
      const out = Object.keys(groups).map(function (g) {
        return { group: groups[g], items: Object.keys(NC.materials).filter(function (k) { return NC.materials[k].group === g; }).map(function (k) { return [k, NC.materials[k].label]; }) };
      });
      out.push({ group: 'Other', items: [['custom', 'Custom material (enter ρ and M)']] });
      return out;
    }
    function opticalFields(p, isCore, layer) {
      const o = layer.optical || {};
      let h = selField(p + '.model', 'Optical model', [['none', 'Not set (no spectrum)'], ['drude', 'Drude model (metal)'], ['n', 'Constant n + ik'], ['sellmeier', 'Fused silica, Sellmeier (Malitson 1965)'], ['nk', 'Pasted n, k table']], { rebuild: 'optical', wide: true });
      if (o.model === 'drude') {
        h += selField(p + '.preset', 'Drude parameters', [['Ag', 'Silver, free-electron preset'], ['Au', 'Gold, free-electron preset'], ['custom', 'My values']], { rebuild: 'drude', wide: true });
        if (o.preset === 'custom') h += numField(p + '.epsInf', 'ε∞', '') + numField(p + '.wp', 'ħωp', 'eV') + numField(p + '.gam', 'ħγ', 'eV');
        if (isCore) h += '<div class="field wide dz-check"><input type="checkbox" id="' + pid(p + '.damp') + '" data-path="' + p + '.damp"' + (o.damp ? ' checked' : '') + '><label for="' + pid(p + '.damp') + '">Size-dependent damping, γ(R) = γ + ħv_F/R</label></div>';
      } else if (o.model === 'n') {
        h += numField(p + '.n', 'n', '') + numField(p + '.k', 'k', '');
      } else if (o.model === 'nk') {
        h += '<div class="field wide"><label for="' + pid(p + '.table') + '">n, k table: λ (nm), n, k</label><textarea id="' + pid(p + '.table') + '" rows="5" data-path="' + p + '.table" placeholder="One row per wavelength, from a source you cite&#10;400, 1.47, 1.95">' + esc(o.table || '') + '</textarea></div>';
      } else if (o.model === 'none' || !o.model) {
        h += '<p class="dz-hint">No optical constants: the spectrum is not computed until every layer has them.</p>';
      }
      return h;
    }
    function matShort(k) { const m = NC.materials && NC.materials[k]; return m ? (m.label.match(/\(([^)]+)\)/) || [null, m.label])[1].split(' ').pop() : k === 'custom' ? 'custom' : k; }
    function foldBtn(k, label) {
      return '<button type="button" class="dz-fold" data-act="fold" data-k="' + k + '" aria-expanded="' + !collapsed[k] + '" aria-label="' + (collapsed[k] ? 'Expand ' : 'Collapse ') + esc(label) + '">' + (collapsed[k] ? '▸' : '▾') + '</button>';
    }
    function layerCard(layer, i) {
      const isCore = i < 0;
      const p = isCore ? 'core' : 'shells.' + i;
      const n = state.shells.length;
      const k = isCore ? 'core' : 's' + i;
      const sw = 'var(--s' + ((isCore ? 0 : i + 1) % 5) + ')';
      const name = isCore ? 'Core' : 'Shell ' + (i + 1);
      const sum = matShort(layer.material) + ' · ' + (isCore ? NC.fmt(Number(layer.D), 4) + ' nm diameter' : NC.fmt(Number(layer.t), 4) + ' nm thick');
      let h = '<fieldset class="dz-card' + (collapsed[k] ? ' collapsed' : '') + '" data-layer="' + (isCore ? 'core' : i) + '"><legend>' + foldBtn(k, name) + '<span class="dz-swatch" style="background:' + sw + '"></span>' + name + '<span class="dz-sum">' + esc(sum) + '</span></legend>';
      if (!isCore) {
        h += '<div class="dz-card-actions">' +
          '<button type="button" class="btn small" data-act="up" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move shell ' + (i + 1) + ' inward">↑</button>' +
          '<button type="button" class="btn small" data-act="down" data-i="' + i + '"' + (i === n - 1 ? ' disabled' : '') + ' aria-label="Move shell ' + (i + 1) + ' outward">↓</button>' +
          '<button type="button" class="btn small" data-act="remove" data-i="' + i + '" aria-label="Remove shell ' + (i + 1) + '">Remove</button></div>';
      }
      h += '<div class="dz-fields">' + selField(p + '.material', 'Material', materialOptions(), { rebuild: 'material', wide: true });
      if (layer.material === 'custom') h += '<div class="field wide"><label for="' + pid(p + '.label') + '">Name</label><input id="' + pid(p + '.label') + '" type="text" data-path="' + p + '.label" value="' + esc(layer.label || '') + '"></div>' + numField(p + '.rho', 'Density ρ', 'g/cm³') + numField(p + '.M', 'Molar mass M', 'g/mol');
      h += isCore ? sliderField(p + '.D', 'Core diameter', 'nm', 1, 1000, true) : sliderField(p + '.t', 'Shell thickness', 'nm', 0.2, 500, true);
      h += opticalFields(p + '.optical', isCore, layer) + '</div></fieldset>';
      return h;
    }
    function ligandCard() {
      const lg = state.ligand;
      const L = D.ligands;
      const lsum = lg && lg.key ? (L[lg.key] ? L[lg.key].label : lg.key) : 'none';
      let h = '<fieldset class="dz-card' + (collapsed.lig ? ' collapsed' : '') + '"><legend>' + foldBtn('lig', 'ligand shell') + '<span class="dz-swatch dz-hatch"></span>Ligand shell<span class="dz-sum">' + esc(lsum) + '</span></legend><div class="dz-fields">';
      h += selField('ligand.key', 'Ligand', [['', 'None']].concat(Object.keys(L).map(function (k) { return [k, L[k].label]; })), { rebuild: 'ligand', wide: true });
      if (lg && lg.key) {
        h += selField('ligand.mode', 'Surface coverage given as', [['density', 'Grafting density (molecules/nm²)'], ['footprint', 'Footprint (nm² per molecule)']], { wide: true });
        h += numField('ligand.value', lg.mode === 'footprint' ? 'Footprint' : 'Grafting density', lg.mode === 'footprint' ? 'nm²' : 'nm⁻²', { help: lg.key === 'alkanethiol' ? 'Alkanethiol SAM on Au(111): 21.4 Å² = 0.214 nm² per molecule (Love et al. 2005). Leave blank to use it.' : 'From your measurement (TGA, XPS) or a source you cite.', wide: true });
        if (lg.key === 'alkanethiol') h += numField('ligand.nC', 'Chain length', 'C atoms');
        if (lg.key === 'PEG-thiol' || lg.key === 'custom') h += numField('ligand.Mw', 'Molar mass', 'g/mol');
        if (lg.key === 'PEG-thiol') h += numField('ligand.a', 'Monomer size a', 'nm', { help: 'An assumption: ≈0.35 nm is often used for PEG.' });
        else h += numField('ligand.length', 'Ligand shell thickness', 'nm', { placeholder: 'optional' });
        h += numField('ligand.excess', 'Excess factor', '×', { help: 'Moles to add ÷ moles bound in a full layer.' });
      }
      return h + '</div></fieldset>';
    }
    function envCard() {
      const concMode = state.batch.particleConc !== undefined && state.batch.particleConc !== null && state.batch.particleConc !== '' && (state.batch.massConc === undefined || state.batch.massConc === null || state.batch.massConc === '') ? 'particle' : 'mass';
      const esum = 'n = ' + state.medium.n + ' · ' + state.batch.volumeMl + ' mL · ' + state.lambda.min + '–' + state.lambda.max + ' nm';
      let h = '<fieldset class="dz-card' + (collapsed.env ? ' collapsed' : '') + '"><legend>' + foldBtn('env', 'medium, batch and spectrum') + 'Medium, batch and spectrum<span class="dz-sum">' + esc(esum) + '</span></legend><div class="dz-fields">';
      h += '<div class="field wide dz-size"><label for="' + pid('medium.n') + '">Refractive index of the medium</label><div class="dz-sizerow"><input type="range" id="' + pid('medium.n') + '-r" min="0" max="' + SLIDER + '" step="1" value="' + toPos(Number(val('medium.n')), 1, 1.8, false) + '" data-path="medium.n" data-range="1,1.8,0" aria-label="Medium refractive index slider"><input type="number" id="' + pid('medium.n') + '"' + limitAttrs(limitsFor('medium.n')) + ' data-path="medium.n" value="' + esc(val('medium.n')) + '"></div><span class="help">Water ≈ 1.333 in the visible.</span>' + msgEl('medium.n') + '</div>';
      h += numField('batch.volumeMl', 'Batch volume', 'mL');
      h += '<div class="field"><label for="' + P + 'cmode">Concentration given as</label><select id="' + P + 'cmode" data-act="cmode"><option value="mass"' + (concMode === 'mass' ? ' selected' : '') + '>Mass (µg/mL)</option><option value="particle"' + (concMode === 'particle' ? ' selected' : '') + '>Particles per mL</option></select></div>';
      h += concMode === 'mass' ? numField('batch.massConc', 'Mass concentration', 'µg/mL', { help: 'Inorganic particle (core + shells).' }) : numField('batch.particleConc', 'Particle concentration', 'mL⁻¹');
      h += numField('lambda.min', 'Start λ', 'nm') + numField('lambda.max', 'End λ', 'nm') + numField('lambda.step', 'Step', 'nm');
      return h + '</div></fieldset>';
    }
    function rebuild() {
      const active = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : null;
      stackEl.innerHTML = layerCard(state.core, -1) +
        '<ol class="dz-shells" aria-label="Shells, from the core outward">' + state.shells.map(function (s, i) { return '<li>' + layerCard(s, i) + '</li>'; }).join('') + '</ol>' +
        '<button type="button" class="btn dz-add" data-act="add"' + (state.shells.length >= MAX_SHELLS ? ' disabled title="At most ' + MAX_SHELLS + ' shells"' : '') + '>+ Add shell</button>' + ligandCard() + envCard();
      if (active) { const a = document.getElementById(active); if (a) a.focus(); }
      const tp = el.querySelector('#' + P + 'tparam'), cur = tp.value;
      tp.innerHTML = '<option value="core">core diameter</option>' + state.shells.map(function (s, i) { return '<option value="shell:' + i + '">shell ' + (i + 1) + ' thickness (' + esc(matShort(s.material)) + ')</option>'; }).join('');
      if (cur && tp.querySelector('option[value="' + cur + '"]')) tp.value = cur; else if (state.shells.length) tp.value = 'shell:' + (state.shells.length - 1);
    }
    function renderSaved() {
      const list = savedList();
      const opts = list.map(function (s, i) { return '<option value="' + i + '">' + esc(s.name) + '</option>'; }).join('');
      el.querySelector('#' + P + 'mine').innerHTML = '<option value="">' + (list.length ? 'Load a saved design…' : 'None saved yet') + '</option>' + opts;
      const c = el.querySelector('#' + P + 'cmp');
      const curName = compareWith ? compareWith.name : '';
      c.innerHTML = '<option value="">' + (list.length ? 'Nothing' : 'Save a design to compare') + '</option>' + opts;
      if (curName) { const j = list.findIndex(function (s) { return s.name === curName; }); c.value = j >= 0 ? String(j) : ''; if (j < 0) compareWith = null; }
    }

    /* ---------------- events ---------------- */
    let frame = null, pendingLive = null, settleTimer = null;
    function schedule(live) {
      pendingLive = pendingLive === null ? live : pendingLive && live;
      if (frame === null) frame = raf(function () { frame = null; const l = pendingLive; pendingLive = null; update(l); });
      clearTimeout(settleTimer);
      if (live) settleTimer = setTimeout(function () { schedule(false); }, 350);
    }
    function readValue(t) {
      if (t.type === 'checkbox') return t.checked;
      if (t.type === 'range') { const r = t.getAttribute('data-range').split(','); return fromPos(Number(t.value), Number(r[0]), Number(r[1]), r[2] === '1'); }
      if (t.type === 'number') { if (t.value === '') return null; const x = Number(t.value); return isFinite(x) ? x : null; }
      return t.value;
    }
    function onStructural(kind, path, v) {
      const base = path.replace(/\.[^.]+$/, '');
      if (kind === 'material') {
        const layer = getPath(state, base);
        layer.optical = D.defaultOptical(v);
        if (v === 'custom') { if (layer.rho === undefined) layer.rho = null; if (layer.M === undefined) layer.M = null; }
        else { delete layer.rho; delete layer.M; delete layer.label; }
      } else if (kind === 'optical') {
        const o = getPath(state, base);
        const keep = o.model;
        Object.keys(o).forEach(function (k) { delete o[k]; });
        o.model = keep;
        if (keep === 'drude') { o.preset = 'Au'; }
        if (keep === 'sellmeier') o.preset = 'SiO2';
        if (keep === 'n') { o.n = null; o.k = 0; }
        if (keep === 'nk') o.table = '';
      } else if (kind === 'drude') {
        const o = getPath(state, base);
        if (o.preset === 'custom') {
          const pv = (NC.optics && NC.optics.presets || []).filter(function (q) { return /^Gold/.test(q.label); })[0];
          if (pv && o.epsInf === undefined) { o.epsInf = pv.values.epsInf; o.wp = pv.values.wp; o.gam = pv.values.gam; o.vF = pv.values.vF; }
        }
      } else if (kind === 'ligand') {
        if (!v) state.ligand = null;
        else if (v === 'alkanethiol') state.ligand = { key: v, mode: 'footprint', value: 0.214, nC: 12, length: null, excess: 1 };
        else if (v === 'PEG-thiol') state.ligand = { key: v, mode: 'density', value: null, Mw: 5000, a: 0.35, excess: 1 };
        else state.ligand = { key: v, mode: 'density', value: null, length: null, Mw: v === 'custom' ? null : undefined, excess: 1 };
      }
    }
    function flag(t, path, v) {
      const lim = limitsFor(path);
      const msg = document.getElementById(pid(path) + '-m');
      const err = lim && v !== null && typeof v === 'number' ? NC.limitError(v, '', lim) : '';
      if (msg) { msg.textContent = err; msg.hidden = !err; }
      const f = t.closest && t.closest('.field');
      if (f) f.classList.toggle('invalid', !!err);
      t.setAttribute('aria-invalid', err ? 'true' : 'false');
      if (msg) t.setAttribute('aria-errormessage', msg.id);
    }
    // On leaving a number field, snap it to the nearest allowed value (round whole numbers, clamp to min/max).
    function snap(t, path) {
      const lim = limitsFor(path);
      if (!lim || t.type !== 'number' || t.value === '') return;
      const x = Number(t.value), y = NC.snapToLimits(x, lim);
      if (!isFinite(x) || y === x) return;
      t.value = String(y);
      setPath(state, path, y);
      const rng = document.getElementById(t.id + '-r');
      if (rng) { const r = rng.getAttribute('data-range').split(','); rng.value = toPos(y, Number(r[0]), Number(r[1]), r[2] === '1'); }
      flag(t, path, y);
    }
    function onInput(e) {
      const t = e.target, path = t.getAttribute && t.getAttribute('data-path');
      if (!path) return;
      if (t.type === 'number' || t.type === 'range') {
        const num = t.type === 'range' ? document.getElementById(t.id.replace(/-r$/, '')) : t;
        if (num) flag(num, path, readValue(t));
      }
      if (t.tagName === 'SELECT' && e.type === 'input') return; // handled on change (fires once in every browser)
      const v = readValue(t);
      if (path === 'ligand.key') { onStructural('ligand', path, v); rebuild(); schedule(false); return; }
      setPath(state, path, v);
      const kind = t.getAttribute('data-rebuild');
      if (kind) { onStructural(kind, path, v); rebuild(); schedule(false); return; }
      if (t.type === 'range') {
        const num = document.getElementById(t.id.replace(/-r$/, ''));
        if (num) num.value = v;
        t.setAttribute('aria-valuetext', String(v));
        schedule(true);
        return;
      }
      if (t.type === 'number') {
        const rng = document.getElementById(t.id + '-r');
        if (rng && v !== null) { const r = rng.getAttribute('data-range').split(','); rng.value = toPos(v, Number(r[0]), Number(r[1]), r[2] === '1'); }
      }
      if (path === 'ligand.mode') {
        const lv = state.ligand && state.ligand.value;
        if (lv > 0) state.ligand.value = Number((1 / lv).toPrecision(4)); // density ↔ footprint
        rebuild(); schedule(false); return;
      }
      schedule(true);
    }
    function onChange(e) {
      const t = e.target;
      const act = t.getAttribute && t.getAttribute('data-act');
      if (act === 'preset') {
        if (t.value === '') return;
        state = normalize(presets[Number(t.value)].design);
        rebuild(); schedule(false);
        const sel = el.querySelector('[data-act="preset"]'); if (sel) sel.value = '';
        return;
      }
      if (act === 'mine') {
        const list = savedList(), j = Number(t.value);
        if (t.value === '' || !list[j]) return;
        state = normalize(list[j].design);
        rebuild(); schedule(false);
        return;
      }
      if (act === 'compare') {
        const list = savedList(), j = Number(t.value);
        compareWith = t.value === '' || !list[j] ? null : list[j];
        compareCache = null;
        schedule(false);
        return;
      }
      if (act === 'cmode') {
        const b = state.batch;
        if (t.value === 'particle') { b.particleConc = b.particleConc || null; delete b.massConc; }
        else { b.massConc = b.massConc || null; delete b.particleConc; }
        rebuild(); schedule(false);
        return;
      }
      if (t.tagName === 'SELECT' && t.getAttribute('data-path')) { onInput({ target: t, type: 'change' }); return; }
      if (t.type === 'number' && t.getAttribute('data-path')) snap(t, t.getAttribute('data-path'));
      if (t.type === 'range' || t.type === 'number' || t.type === 'checkbox' || t.tagName === 'TEXTAREA') schedule(false);
    }
    function onClick(e) {
      const b = e.target.closest ? e.target.closest('button[data-act]') : null;
      if (!b || !el.contains(b)) return;
      const act = b.getAttribute('data-act'), i = Number(b.getAttribute('data-i'));
      const sh = state.shells;
      let focusSel = null;
      if (act === 'fold') { const k = b.getAttribute('data-k'); collapsed[k] = !collapsed[k]; rebuild(); const fb = el.querySelector('[data-act="fold"][data-k="' + k + '"]'); if (fb) fb.focus(); return; }
      if (act === 'saveas') {
        const list = savedList();
        const name = global.prompt ? global.prompt('Name for this design', NC.projects ? NC.projects.designSummary(state) : 'My design') : null;
        if (!name || !name.trim()) return;
        const j = list.findIndex(function (s) { return s.name === name.trim(); });
        const rec = { name: name.trim(), date: new Date().toISOString(), design: clone(state) };
        if (j >= 0) list[j] = rec; else list.unshift(rec);
        setSavedList(list.slice(0, 100)); renderSaved();
        return;
      }
      if (act === 'delsaved') {
        const sel = el.querySelector('#' + P + 'mine'), list = savedList(), j = Number(sel.value);
        if (sel.value === '' || !list[j]) { if (global.alert) global.alert('Choose a saved design in the list first.'); return; }
        if (global.confirm && !global.confirm('Delete the saved design “' + list[j].name + '”?')) return;
        list.splice(j, 1); setSavedList(list); renderSaved(); schedule(false);
        return;
      }
      if (act === 'solve') {
        const msg = el.querySelector('#' + P + 'tmsg');
        const tgt = Number(el.querySelector('#' + P + 'tgt').value), param = el.querySelector('#' + P + 'tparam').value;
        msg.className = 'dz-tmsg'; msg.textContent = 'Searching…';
        setTimeout(function () {
          try {
            const r = D.solvePeak(state, tgt, param);
            if (param === 'core') state.core.D = r.value; else state.shells[Number(param.split(':')[1])].t = r.value;
            rebuild(); schedule(false);
            msg.textContent = r.label.charAt(0).toUpperCase() + r.label.slice(1) + ' set to ' + NC.fmt(r.value, 4) + ' nm, which puts λ_max at ' + NC.fmt(r.lam, 4) + ' nm (' + r.evaluations + ' spectra computed by bisection).' +
              (r.alternatives ? ' Other sizes also reach this peak; this is the one nearest the previous value.' : '');
          } catch (e) { msg.className = 'dz-tmsg err'; msg.textContent = e.message; }
        }, 20);
        return;
      }
      if (act === 'add') {
        if (sh.length >= MAX_SHELLS) return;
        const last = sh.length ? sh[sh.length - 1].material : state.core.material;
        const mat = last === 'SiO2' ? 'Au' : 'SiO2';
        sh.push({ material: mat, t: 5, optical: D.defaultOptical(mat) });
        focusSel = '[data-layer="' + (sh.length - 1) + '"] select';
      } else if (act === 'remove') { sh.splice(i, 1); focusSel = '.dz-add'; }
      else if (act === 'up' && i > 0) { const x = sh[i]; sh[i] = sh[i - 1]; sh[i - 1] = x; focusSel = '[data-layer="' + (i - 1) + '"] [data-act="up"]'; }
      else if (act === 'down' && i < sh.length - 1) { const x = sh[i]; sh[i] = sh[i + 1]; sh[i + 1] = x; focusSel = '[data-layer="' + (i + 1) + '"] [data-act="down"]'; }
      else return;
      rebuild();
      if (focusSel) { const f = el.querySelector(focusSel); if (f && !f.disabled) f.focus(); else { const g = el.querySelector('.dz-add'); if (g) g.focus(); } }
      schedule(false);
    }
    el.addEventListener('input', onInput);
    el.addEventListener('change', onChange);
    el.addEventListener('click', onClick);
    const form = el.querySelector('form.dz-editor');
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    /* ---------------- output ---------------- */
    let lastOut = null;
    function routeHTML(route) {
      return route.map(function (r) {
        const links = r.protocols && r.protocols.length
          ? '<ul class="dz-protos">' + r.protocols.map(function (p) { return '<li><a href="#/synthesis/' + encodeURIComponent(p.id) + (state.batch && state.batch.volumeMl > 0 ? '?volume=' + encodeURIComponent(state.batch.volumeMl) : '') + '">' + esc(p.title) + '</a></li>'; }).join('') + '</ul>' : '';
        return '<li class="dz-rstep dz-r-' + esc(r.role) + '"><div class="dz-rlabel">' + esc(r.label) + '</div>' +
          (r.amount ? '<div class="dz-ramount">' + esc(r.amount) + '</div>' : '') + links +
          (r.note ? '<div class="dz-rnote">' + esc(r.note.charAt(0).toUpperCase() + r.note.slice(1)) + '.</div>' : '') + '</li>';
      }).join('');
    }
    function fallback(out, live) {
      const cite = function (r) { return [].concat(r || []).filter(function (id) { return NC.refs[id]; }).map(function (id) { return '<sup class="cite">[' + (out.refs.indexOf(id) + 1) + ']</sup>'; }).join(''); };
      liveEl.innerHTML = '<section class="panel"><h2>Results</h2>' +
        (out.warnings.length ? '<div class="alert warn"><ul>' + out.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>' : '') +
        '<div class="results">' + out.results.map(function (r) { return '<div class="result' + (r.main ? ' main' : '') + '"><div class="k">' + esc(r.label) + '</div><div class="v">' + esc(typeof r.value === 'string' ? r.value : NC.fmt(r.value, r.sig || 4)) + (r.unit ? '<small>' + esc(r.unit) + '</small>' : '') + '</div></div>'; }).join('') + '</div></section>' +
        (out.plots.length ? '<div class="plots">' + out.plots.map(function (p) { return '<figure class="plotfig"><figcaption>' + esc(p.title) + '</figcaption>' + NC.plot(p) + '</figure>'; }).join('') + '</div>' : '');
      if (live) return;
      const math = function (plain, tex) { if (!plain && !tex) return ''; const r = NC.renderMath ? NC.renderMath(plain || '', tex) : { html: esc(plain) }; return '<div class="dz-math">' + r.html + '</div>'; };
      detailEl.innerHTML = '<section class="panel"><h2>Step-by-step solution</h2><ol class="steps">' + out.steps.map(function (s) {
        if (s.kind === 'heading') return '</ol><h3>' + esc(s.title) + '</h3><ol class="steps">';
        return '<li class="step"><div class="step-title">' + esc(s.title) + cite(s.ref) + '</div>' + math(s.formula, s.tex) + math(s.sub) + math(s.result) + (s.note ? '<div class="note">' + esc(s.note) + '</div>' : '') + '</li>';
      }).join('') + '</ol></section>' +
        (out.notes.length ? '<section class="panel"><h2>Assumptions &amp; notes</h2><ul>' + out.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></section>' : '') +
        '<section class="panel"><h2>References</h2><ol class="refs">' + out.refs.map(function (id) { return '<li id="cite-' + esc(id) + '">' + NC.formatRef(NC.refs[id]) + '</li>'; }).join('') + '</ol></section>';
    }
    function update(live) {
      const t0 = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
      let out;
      try {
        out = D.compute(state);
      } catch (e) {
        const isInput = e instanceof NC.InputError;
        if (!isInput && global.console) global.console.error(e);
        errEl.innerHTML = '<div class="alert err"><b>' + (isInput ? 'Check the design.' : 'Calculation error.') + '</b> ' + esc(e.message) + '</div>';
        el.querySelector('.dz-out').classList.add('dz-stale');
        return;
      }
      errEl.innerHTML = '';
      el.querySelector('.dz-out').classList.remove('dz-stale');
      lastOut = out;
      out = withComparison(out);
      figEl.innerHTML = out.figures[0].svg;
      routeEl.innerHTML = routeHTML(out.route);
      if (typeof NC.renderOutput === 'function') {
        NC.renderOutput(liveEl, Object.assign({}, out, { figures: [] }), { refs: out.refs, live: live, key: 'designer', detailEl: detailEl });
      } else fallback(out, live);
      const t1 = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
      el.setAttribute('data-compute-ms', (t1 - t0).toFixed(1));
      if (!live) {
        save(state);
        if (typeof opts.onChange === 'function') { try { opts.onChange(clone(state)); } catch (e2) { /* caller's problem */ } }
      }
    }

    /** Overlay a saved design: its extinction curve on the spectrum and its key numbers beside this design's. */
    function withComparison(out) {
      if (!compareWith) { cmpEl.hidden = true; cmpEl.innerHTML = ''; return out; }
      if (!compareCache) { try { compareCache = { out: D.compute(compareWith.design) }; } catch (e) { compareCache = { error: e.message }; } }
      const c = compareCache;
      const KEYS = ['Outer diameter', 'Extinction peak λ_max', 'FWHM', 'Particles per mL', 'Mass per particle', 'Effective density', 'Molar extinction coefficient'];
      const val = function (o, k) { const r = o && (o.results || []).find(function (x) { return x.label === k; }); return r ? r : null; };
      if (c.error) { cmpEl.hidden = false; cmpEl.innerHTML = '<h2>Compared with “' + esc(compareWith.name) + '”</h2><p class="alert warn">That design cannot be computed: ' + esc(c.error) + '</p>'; return out; }
      cmpEl.hidden = false;
      cmpEl.innerHTML = '<h2>Compared with “' + esc(compareWith.name) + '”</h2><p class="muted">' + esc(NC.projects ? NC.projects.designSummary(compareWith.design) : '') + '</p>' +
        '<div class="table-wrap"><table class="proj-cmp"><thead><tr><th>Quantity</th><th>This design</th><th>' + esc(compareWith.name) + '</th></tr></thead><tbody>' +
        KEYS.map(function (k) {
          const a = val(out, k), b = val(c.out, k);
          if (!a && !b) return '';
          const show = function (r) { return r ? esc(NC.fmt(r.value, r.sig || 4)) + (r.unit ? ' ' + esc(r.unit) : '') : '—'; };
          return '<tr><th scope="row">' + esc(k) + '</th><td>' + show(a) + '</td><td>' + show(b) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      const o = Object.assign({}, out, { plots: (out.plots || []).map(function (p, i) {
        const cp = (c.out.plots || [])[i];
        if (!cp) return p;
        const ext = cp.series[0];
        return Object.assign({}, p, { series: p.series.concat([{ name: compareWith.name + ': ' + ext.name.toLowerCase(), mode: 'line', color: 2, dashed: true, points: ext.points }]) });
      }) });
      return o;
    }

    rebuild();
    renderSaved();
    update(false);

    return {
      getState: function () { return clone(state); },
      getOutput: function () { return lastOut; },
      setState: function (d) { state = normalize(d); rebuild(); update(false); },
      destroy: function () {
        if (frame !== null) caf(frame);
        clearTimeout(settleTimer);
        el.removeEventListener('input', onInput);
        el.removeEventListener('change', onChange);
        el.removeEventListener('click', onClick);
        el.innerHTML = '';
      }
    };
  }

  NC.designerView = { render: render, storageKey: KEY, limitsFor: limitsFor, maxShells: MAX_SHELLS };
})(typeof window !== 'undefined' ? window : globalThis);
