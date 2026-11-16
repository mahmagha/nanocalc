/*
 * Synthesis protocol pages (PLAN.md Plan 4, workstream B): rendering only.
 *   NC.protocolsView.renderIndex(el)               protocols grouped by role and material, with a filter
 *   NC.protocolsView.renderProtocol(el, id, opts)  one protocol; opts.volume = initial batch size
 * Each writes HTML into el and wires its own events. Data and arithmetic live in js/protocols.js.
 * Nothing runs at load time except defining functions, so the file also loads in Node (tests).
 */
(function (global) {
  'use strict';
  const NC = global.NC;
  const esc = NC.esc;

  /** "HAuCl4·3H2O" → HTML with subscripts (a number right after "·" is a coefficient, not a subscript). */
  function fmtFormula(f) {
    if (!f) return '—';
    return esc(f).replace(/([A-Za-z)\]])(\d+)/g, '$1<sub>$2</sub>');
  }
  const VERIFY = '<span class="pv-verify" title="NanoCalc could not confirm this item; check it against the original paper.">check against the original</span>';
  const chk = function (v) { return v ? ' ' + VERIFY : ''; };

  function citeFn(refIds) {
    return function (r) {
      const list = [].concat(r || []).filter(function (id) { return NC.refs[id] && refIds.indexOf(id) >= 0; });
      if (!list.length) return '';
      return '<sup class="cite">' + list.map(function (id) {
        return '<a href="#" data-ref="' + esc(id) + '" title="' + esc(NC.refs[id].authors + ' (' + NC.refs[id].year + ')') + '">[' + (refIds.indexOf(id) + 1) + ']</a>';
      }).join('') + '</sup>';
    };
  }
  function shortRef(id) {
    const r = NC.refs[id];
    if (!r) return '';
    const first = String(r.authors).split(';')[0].split(',')[0].trim();
    const n = String(r.authors).split(';').filter(function (s) { return s.trim(); }).length;
    return first + (n > 2 ? ' et al.' : n === 2 ? ' & ' + String(r.authors).split(';')[1].split(',')[0].trim() : '') + ' ' + r.year;
  }
  function keyLabel(role, k) {
    if (k === '*') return 'Any material';
    if (role === 'ligand') return (NC.protocolLigands && NC.protocolLigands[k]) || k;
    return (NC.materials[k] && NC.materials[k].label) || k;
  }
  function wireCitations(el) {
    el.addEventListener('click', function (e) {
      const a = e.target.closest ? e.target.closest('a[data-ref]') : null;
      if (!a || !el.contains(a)) return;
      e.preventDefault();
      const li = el.querySelector('#cite-' + a.getAttribute('data-ref'));
      if (!li) return;
      li.scrollIntoView({ behavior: 'smooth', block: 'center' });
      li.classList.add('flash');
      setTimeout(function () { li.classList.remove('flash'); }, 1600);
    });
  }
  function download(name, text) {
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Index                                                               */
  /* ------------------------------------------------------------------ */
  function renderIndex(el) {
    let html = '<div class="pidx">' +
      '<div class="pidx-tools"><label for="pidx-q">Filter protocols</label>' +
      '<input id="pidx-q" type="search" placeholder="Material, ligand, method or author…" autocomplete="off">' +
      '<span class="pidx-count" aria-live="polite"></span></div>' +
      '<p class="pidx-note">Each protocol is transcribed from the paper it cites and scaled to your batch. Check it against the original and do a local risk assessment before lab work.</p>';
    NC.protocolRoles.forEach(function (role) {
      const groups = {};
      const order = [];
      NC.protocols.forEach(function (p) {
        (p.makes || []).forEach(function (m) {
          if (m.role !== role.id) return;
          const k = role.id === 'ligand' ? m.ligand : m.material;
          if (!groups[k]) { groups[k] = []; order.push(k); }
          if (groups[k].indexOf(p) < 0) groups[k].push(p);
        });
      });
      if (!order.length) return;
      html += '<section class="pidx-role" aria-labelledby="pidx-h-' + role.id + '"><h2 id="pidx-h-' + role.id + '">' + esc(role.label) + '</h2>';
      order.forEach(function (k) {
        const label = keyLabel(role.id, k);
        html += '<div class="pidx-group"><h3>' + esc(label) + '</h3><div class="cards">' + groups[k].map(function (p) {
          const m = (p.makes || []).find(function (x) { return x.role === role.id && (x.material === k || x.ligand === k); }) || {};
          const on = m.on ? ' on ' + m.on.map(function (o) { return keyLabel('core', o); }).join(', ') : '';
          const search = [p.title, p.summary, label, k, on, (p.refs || []).map(shortRef).join(' '), (p.makes || []).map(function (x) { return (x.material || '') + ' ' + (x.ligand || '') + ' ' + (x.shape || ''); }).join(' ')].join(' ').toLowerCase();
          return '<a class="card pcard" href="#/synthesis/' + esc(p.id) + '" data-search="' + esc(search) + '"><b>' + esc(p.title) + '</b>' +
            '<span>' + esc((on ? on.trim().replace(/^on/, 'On') + '. ' : '') + (p.sizeText || '')) + '</span>' +
            '<span class="pcard-src">' + (p.generalPractice ? 'General lab practice' : esc((p.refs || []).map(shortRef).join('; '))) + '</span></a>';
        }).join('') + '</div></div>';
      });
      html += '</section>';
    });
    html += '<p class="pidx-empty" hidden>No protocol matches the filter.</p></div>';
    el.innerHTML = html;

    const q = el.querySelector('#pidx-q');
    const count = el.querySelector('.pidx-count');
    const empty = el.querySelector('.pidx-empty');
    function apply() {
      const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      const shown = {};
      el.querySelectorAll('.pidx-role').forEach(function (sec) {
        let secAny = false;
        sec.querySelectorAll('.pidx-group').forEach(function (g) {
          let any = false;
          g.querySelectorAll('.pcard').forEach(function (c) {
            const s = c.getAttribute('data-search');
            const hit = words.every(function (w) { return s.indexOf(w) >= 0; });
            c.hidden = !hit;
            if (hit) { any = true; shown[c.getAttribute('href')] = true; }
          });
          g.hidden = !any;
          if (any) secAny = true;
        });
        sec.hidden = !secAny;
      });
      const n = Object.keys(shown).length;
      count.textContent = words.length ? n + ' of ' + NC.protocols.length + ' protocols' : NC.protocols.length + ' protocols';
      empty.hidden = n > 0;
    }
    q.addEventListener('input', apply);
    apply();
  }

  /* ------------------------------------------------------------------ */
  /* One protocol                                                        */
  /* ------------------------------------------------------------------ */
  function renderProtocol(el, id, opts) {
    opts = opts || {};
    const p = NC.protocolById[id];
    if (!p) {
      el.innerHTML = '<p class="alert warn">No protocol called “' + esc(id) + '”. <a href="#/synthesis">See all protocols</a>.</p>';
      return;
    }
    const U = NC.protocolUnits;
    const refIds = NC.protocolRefIds(p);
    const cite = citeFn(refIds);
    const unit = p.baseUnit || 'mL';
    const state = { volume: typeof opts.volume === 'number' && opts.volume > 0 ? opts.volume : p.baseVolume, stockVolumes: {} };
    const scalable = typeof p.baseVolume === 'number' && p.baseVolume > 0 && (p.reagents || []).some(function (r) { return typeof r.amount === 'number'; });

    let html = '<article class="protocol">';
    html += '<p class="pv-back no-print"><a href="#/synthesis">← All protocols</a></p>';
    html += '<h1 class="pv-title">' + esc(p.title) + '</h1>';
    html += '<p class="lede">' + esc(p.summary) + '</p>';
    html += '<ul class="pv-makes" aria-label="What this protocol makes">' + (p.makes || []).map(function (m) {
      const what = m.role === 'ligand' ? keyLabel('ligand', m.ligand) : keyLabel(m.role, m.material);
      const roleLabel = { core: 'Core', shell: 'Shell', ligand: 'Ligand', purification: 'Purification' }[m.role] || m.role;
      return '<li><b>' + esc(roleLabel) + '</b> ' + esc(what) + (m.shape ? ', ' + esc(m.shape) : '') + (m.on ? ' on ' + esc(m.on.map(function (o) { return keyLabel('core', o); }).join(', ')) : '') + '</li>';
    }).join('') + '</ul>';
    if (p.sizeText) html += '<p class="pv-size"><b>Size:</b> ' + esc(p.sizeText) + chk(p.sizeVerify) + '</p>';

    html += '<div class="alert warn pv-notice" role="note"><b>Check before any lab work.</b> ' +
      (p.generalPractice
        ? 'This page describes general laboratory practice, not a single published protocol; sources are cited where a specific point comes from one.'
        : 'This procedure is transcribed from the cited source' + cite(p.refs) + ' and must be checked against the original paper.') +
      ' Do a local risk assessment (for example COSHH) before you start. Items marked ' + VERIFY + ' could not be confirmed by NanoCalc; amounts shown as “as in the original paper” are deliberately left out.</div>';

    html += '<div class="actions pv-actions no-print"><button class="btn" type="button" data-act="print">Print / PDF</button><button class="btn" type="button" data-act="md">Download as Markdown</button></div>';

    // batch size
    if (scalable) {
      const lo = p.baseVolume / 10, hi = p.baseVolume * 10;
      html += '<section class="panel pv-batch" aria-labelledby="pv-batch-h"><h2 id="pv-batch-h">Batch size</h2>' +
        '<div class="pv-batch-row"><label for="pv-vol">Final ' + esc(p.baseLabel || 'batch') + ' (' + esc(unit) + ')</label>' +
        '<input id="pv-vol" type="number" min="0" step="any" inputmode="decimal" value="' + NC.fmt(state.volume, 6).replace('−', '-') + '">' +
        '<input id="pv-vol-slider" class="pv-slider" type="range" min="0" max="1000" step="1" aria-label="Batch size (logarithmic slider, ' + esc(NC.fmt(lo, 3) + '–' + NC.fmt(hi, 3) + ' ' + unit) + ')">' +
        '<button class="btn small" type="button" data-act="reset">Paper’s amount (' + esc(NC.fmt(p.baseVolume, 4) + ' ' + unit) + ')</button></div>' +
        '<p class="pv-factor" aria-live="polite"></p>' +
        '<p class="pv-hint">All amounts below scale linearly with the batch. Temperatures and times are not scaled, but heating, mixing and addition rates change with volume, so results at very different batch sizes can differ from the paper.</p></section>';
      state.lo = lo; state.hi = hi;
    }

    // reagents
    html += '<section class="panel" aria-labelledby="pv-reag-h"><h2 id="pv-reag-h">Reagents</h2>';
    if (!scalable) html += '<p class="pv-hint">Amounts are not given here: take them from the original paper for the size or thickness you need.</p>';
    html += '<div class="table-wrap"><table class="data pv-reagents"><thead><tr><th scope="col">Reagent</th><th scope="col">Formula</th><th scope="col">M (g/mol)' + cite('ciaaw2021') + '</th><th scope="col">Stock</th><th scope="col">Amount</th><th scope="col">Delivers</th><th scope="col">Stock to prepare → weigh</th></tr></thead><tbody>';
    let stage = null;
    (p.reagents || []).forEach(function (r, i) {
      if (r.stage && r.stage !== stage) { stage = r.stage; html += '<tr class="pv-stage"><th colspan="7" scope="colgroup">' + esc(stage) + '</th></tr>'; }
      html += '<tr data-i="' + i + '"><td class="pv-name">' + esc(r.name) + '<span class="pv-role">' + esc(r.role || '') + '</span>' + (r.note ? '<span class="pv-note">' + esc(r.note) + '</span>' : '') + '</td>' +
        '<td class="pv-formula">' + fmtFormula(r.formula) + '</td><td class="num">' + (r.M ? esc(NC.fmt(r.M, 5)) : '—') + '</td>' +
        '<td class="pv-stockdesc">' + esc(U.fmtStock(r.stock)) + '</td><td class="num pv-amt"></td><td class="num pv-del"></td><td class="pv-stock"></td></tr>';
    });
    html += '</tbody></table></div><p class="pv-warn alert warn" hidden></p>' +
      '<p class="pv-hint">Molar masses are sums of IUPAC 2021 standard atomic weights' + cite('ciaaw2021') + ' for the formula shown, hydrate water included; if your bottle is a different hydrate, use its molar mass. Mass to weigh: c·V·M for molar stocks; for wt % stocks the solute mass in the stated volume of solution, taking the solution density as 1.00 g/mL (a good approximation for dilute aqueous solutions only).</p></section>';

    if ((p.equipment || []).length) html += '<section class="panel" aria-labelledby="pv-eq-h"><h2 id="pv-eq-h">Equipment</h2><ul class="pv-list">' + p.equipment.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></section>';

    // steps
    html += '<section class="panel" aria-labelledby="pv-steps-h"><h2 id="pv-steps-h">Procedure</h2><ol class="pv-steps">';
    stage = null;
    (p.steps || []).forEach(function (s) {
      if (s.stage && s.stage !== stage) { stage = s.stage; html += '<li class="pv-step-stage"><span>' + esc(stage) + '</span></li>'; }
      const badges = (s.temp ? '<span class="pv-badge temp" title="Temperature"><span class="pv-sr">Temperature: </span>' + esc(s.temp) + '</span>' : '') +
        (s.time ? '<span class="pv-badge time" title="Time"><span class="pv-sr">Time: </span>' + esc(s.time) + '</span>' : '') +
        (s.general ? '<span class="pv-badge general">general practice</span>' : '');
      html += '<li class="pv-step' + (s.critical ? ' critical' : '') + '">' + (badges ? '<div class="pv-badges">' + badges + '</div>' : '') +
        '<p>' + (s.critical ? '<strong class="pv-crit">Critical: </strong>' : '') + esc(s.text) + cite(s.ref) + chk(s.verify) + '</p></li>';
    });
    html += '</ol></section>';

    // safety
    const seen = {};
    html += '<section class="panel pv-safety" aria-labelledby="pv-safe-h"><h2 id="pv-safe-h">Safety</h2><h3>Reagent hazards</h3><ul class="pv-list">' +
      (p.reagents || []).filter(function (r) { if (seen[r.name]) return false; seen[r.name] = true; return true; }).map(function (r) { return '<li><b>' + esc(r.name) + ':</b> ' + esc(r.hazard) + '</li>'; }).join('') + '</ul>';
    if (p.safety && (p.safety.general || []).length) html += '<h3>General</h3><ul class="pv-list">' + p.safety.general.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
    if (p.safety && (p.safety.waste || []).length) html += '<h3>Waste</h3><ul class="pv-list">' + p.safety.waste.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
    html += '</section>';

    // expected
    const ex = p.expected || {};
    const exRows = [['Colour', ex.colour], ['Absorption', ex.lambdaMax], ['Size', ex.size], ['Yield', ex.yield]].filter(function (x) { return x[1]; });
    if (exRows.length) html += '<section class="panel" aria-labelledby="pv-ex-h"><h2 id="pv-ex-h">Expected result' + chk(ex.verify) + '</h2><dl class="pv-dl">' + exRows.map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl></section>';

    if (p.tuning) html += '<section class="panel" aria-labelledby="pv-tune-h"><h2 id="pv-tune-h">Tuning the size</h2><p>' + esc(p.tuning.text) + cite(p.tuning.ref) + chk(p.tuning.verify) + '</p></section>';

    if ((p.characterise || []).length) {
      html += '<section class="panel" aria-labelledby="pv-char-h"><h2 id="pv-char-h">Characterise the product</h2><ul class="pv-char">' + p.characterise.map(function (c) {
        const def = NC.byId && NC.byId[c.calc];
        return '<li>' + esc(c.what) + ' — <a href="#/calc/' + esc(c.calc) + '">' + esc(def ? def.title : c.calc) + '</a></li>';
      }).join('') + '</ul></section>';
    }

    if ((p.troubleshooting || []).length) {
      html += '<section class="panel" aria-labelledby="pv-ts-h"><h2 id="pv-ts-h">Troubleshooting</h2><div class="pv-ts">' + p.troubleshooting.map(function (t) {
        return '<div class="pv-ts-item"><p class="pv-ts-problem">' + esc(t.problem) + '</p><dl class="pv-dl"><dt>Likely cause</dt><dd>' + esc(t.cause) + '</dd><dt>Fix</dt><dd>' + esc(t.fix) + '</dd></dl></div>';
      }).join('') + '</div><p class="pv-hint">Troubleshooting notes are general guidance unless a source is cited.</p></section>';
    }

    html += '<section class="panel" aria-labelledby="pv-ref-h"><h2 id="pv-ref-h">References</h2><ol class="refs">' + refIds.map(function (rid) {
      return '<li id="cite-' + esc(rid) + '">' + NC.formatRef(NC.refs[rid]) + '</li>';
    }).join('') + '</ol><p class="disclaimer">Transcribed by NanoCalc; check every quantity against the original source and your local risk assessment before use.</p></section>';
    html += '</article>';
    el.innerHTML = html;

    /* ---- live scaling ---- */
    const tbody = el.querySelector('.pv-reagents tbody');
    const warnEl = el.querySelector('.pv-warn');
    function cellsFor(i) { return tbody.querySelector('tr[data-i="' + i + '"]'); }
    // build the stock-volume inputs once (so typing in them keeps focus)
    NC.protocolScale(p, state.volume, state).reagents.forEach(function (r) {
      const tr = cellsFor(r.index);
      const cell = tr.querySelector('.pv-stock');
      if (r.stockVolumeMl !== null) {
        const inputId = 'pv-sv-' + r.index;
        cell.innerHTML = '<span class="pv-stock-row"><label class="pv-sr" for="' + inputId + '">Stock volume to prepare for ' + esc(r.name) + ' (mL)</label>' +
          '<input id="' + inputId + '" class="pv-sv" type="number" min="0" step="any" inputmode="decimal" data-i="' + r.index + '" value="' + r.stockVolumeMl + '"><span class="pv-unit">mL</span>' +
          '<span class="pv-arrow" aria-hidden="true">→</span><output class="pv-mass" for="' + inputId + '"></output></span>';
      }
    });
    function update() {
      const sc = NC.protocolScale(p, state.volume, state);
      sc.reagents.forEach(function (r) {
        const tr = cellsFor(r.index);
        tr.querySelector('.pv-amt').innerHTML = r.amount === null ? '<span class="pv-orig">as in the original paper</span>' :
          esc(U.fmtAmount(r.amount, r.amountUnit)) + (r.amountUnit === 'mmol' && r.massG !== null ? '<span class="pv-sub">= ' + esc(U.fmtMass(r.massG)) + '</span>' : '') +
          (r.scaled ? '' : '<span class="pv-sub">fixed (not scaled)</span>') + chk(r.verify);
        const del = [r.mmol !== null && r.amountUnit !== 'mmol' ? U.fmtMol(r.mmol) : '', r.massG !== null && r.amountUnit !== 'mg' && r.amountUnit !== 'g' && r.amountUnit !== 'mmol' ? U.fmtMass(r.massG) : ''].filter(Boolean);
        tr.querySelector('.pv-del').textContent = del.length ? del.join(' · ') : '—';
        const out = tr.querySelector('.pv-mass');
        const cell = tr.querySelector('.pv-stock');
        if (out) {
          out.textContent = r.massToWeighG !== null ? 'weigh ' + U.fmtMass(r.massToWeighG) + (r.solutionMassG !== null ? ', make up to ' + U.fmtMass(r.solutionMassG) + ' of solution' : '') : '—';
          tr.classList.toggle('pv-short', r.short);
        } else {
          cell.textContent = r.weighDirect ? 'weigh ' + U.fmtMass(r.massG) + ' directly' : '—';
        }
      });
      warnEl.hidden = !sc.warnings.length;
      warnEl.textContent = sc.warnings.join(' ');
      const fac = el.querySelector('.pv-factor');
      if (fac) fac.textContent = 'Batch: ' + NC.fmt(sc.finalVolume, 4) + ' ' + unit + ' — scale factor ×' + NC.fmt(sc.factor, 4) + ' relative to the paper (' + NC.fmt(p.baseVolume, 4) + ' ' + unit + ').';
    }
    tbody.addEventListener('input', function (e) {
      const t = e.target;
      if (!t.classList || !t.classList.contains('pv-sv')) return;
      const v = parseFloat(t.value);
      const i = Number(t.getAttribute('data-i'));
      if (isFinite(v) && v > 0) state.stockVolumes[i] = v;
      else delete state.stockVolumes[i];
      update();
    });

    const vol = el.querySelector('#pv-vol');
    const slider = el.querySelector('#pv-vol-slider');
    function toSlider(v) { return Math.round(1000 * Math.log(Math.min(state.hi, Math.max(state.lo, v)) / state.lo) / Math.log(state.hi / state.lo)); }
    function fromSlider(s) { return Number((state.lo * Math.pow(state.hi / state.lo, s / 1000)).toPrecision(3)); }
    if (vol) {
      slider.value = toSlider(state.volume);
      vol.addEventListener('input', function () {
        const v = parseFloat(vol.value);
        if (!(isFinite(v) && v > 0)) { vol.setAttribute('aria-invalid', 'true'); return; }
        vol.removeAttribute('aria-invalid');
        state.volume = v;
        slider.value = toSlider(v);
        update();
      });
      slider.addEventListener('input', function () {
        state.volume = fromSlider(Number(slider.value));
        vol.value = state.volume;
        vol.removeAttribute('aria-invalid');
        update();
      });
    }
    el.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        const act = b.getAttribute('data-act');
        if (act === 'print') window.print();
        else if (act === 'md') download('nanocalc-protocol-' + p.id + '.md', NC.protocolMarkdown(p, state.volume, state));
        else if (act === 'reset') { state.volume = p.baseVolume; vol.value = p.baseVolume; slider.value = toSlider(p.baseVolume); update(); }
      });
    });
    wireCitations(el);
    update();
  }

  NC.protocolsView = { renderIndex: renderIndex, renderProtocol: renderProtocol, fmtFormula: fmtFormula };
})(typeof window !== 'undefined' ? window : globalThis);
