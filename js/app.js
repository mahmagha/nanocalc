/* NanoCalc UI: navigation, forms, live computation, step/citation rendering, uncertainty,
   units, saved work, file upload, export, offline (service worker). */
(function () {
  'use strict';
  const NC = window.NC;
  const esc = NC.esc;
  const $ = function (sel, el) { return (el || document).querySelector(sel); };
  const main = $('#main');
  const store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } }
  };
  const UPLOAD_TYPES = '.csv,.txt,.xy,.dat,.tsv,.asc,text/plain,text/csv';
  const MC = { minTrials: 200, maxTrials: 2000, cpuBudget: 300, wallCap: 4000 };

  /* ---------------- theme ---------------- */
  const savedTheme = store.get('nc:theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  $('#themeBtn').addEventListener('click', function () {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store.set('nc:theme', next);
  });

  /* ---------------- routing helpers ---------------- */
  /** Parse "#/calc/id?state=…" → { parts: ['calc', 'id'], state: '…' | null }. */
  function parseHash() {
    const full = location.hash.replace(/^#\/?/, '');
    const qi = full.indexOf('?');
    const path = qi >= 0 ? full.slice(0, qi) : full;
    const query = qi >= 0 ? full.slice(qi + 1) : '';
    const m = query.match(/(?:^|&)state=([^&]*)/);
    return { parts: path.split('/'), state: m ? m[1] : null };
  }
  function calcLink(id, raw) {
    const enc = raw ? NC.encodeState(raw) : '';
    return '#/calc/' + id + (enc && enc !== encodeURIComponent('{}') ? '?state=' + enc : '');
  }

  /* ---------------- navigation ---------------- */
  function calcsIn(cat) { return NC.calculators.filter(function (c) { return c.category === cat; }); }

  function buildNav(query) {
    const q = (query || '').trim().toLowerCase();
    const match = function (c) {
      return !q || (c.title + ' ' + (c.short || '') + ' ' + c.description).toLowerCase().indexOf(q) >= 0;
    };
    let html = '<div class="nav-top"><a href="#/" data-nav="home">Overview</a><a href="#/references" data-nav="references">All references</a></div>';
    let any = false;
    NC.categories.forEach(function (cat) {
      const list = calcsIn(cat.id).filter(match);
      if (!list.length) return;
      any = true;
      html += '<div class="nav-group"><h3>' + esc(cat.label) + '</h3>' +
        list.map(function (c) { return '<a href="#/calc/' + c.id + '" data-nav="' + c.id + '">' + esc(c.title) + '</a>'; }).join('') + '</div>';
    });
    if (!any) html += '<p class="nav-empty">No calculators match “' + esc(query) + '”.</p>';
    $('#sidebar').innerHTML = html;
    markActive();
  }
  function markActive() {
    const key = currentKey();
    document.querySelectorAll('[data-nav]').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-nav') === key); });
  }
  function currentKey() {
    const h = parseHash().parts;
    if (h[0] === 'calc') return h[1];
    if (h[0] === 'references') return 'references';
    return 'home';
  }
  function setNav(open) {
    document.body.classList.toggle('nav-open', open);
    $('#menuBtn').setAttribute('aria-expanded', String(open));
  }
  $('#menuBtn').addEventListener('click', function () { setNav(!document.body.classList.contains('nav-open')); });
  $('#scrim').addEventListener('click', function () { setNav(false); });
  $('#search').addEventListener('input', function (e) { buildNav(e.target.value); });
  $('#search').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      const first = $('#sidebar .nav-group a');
      if (first) location.hash = first.getAttribute('href');
    }
  });

  function route() {
    setNav(false);
    const h = parseHash();
    mcToken++; // cancel any running propagation
    if (h.parts[0] === 'calc' && NC.byId[h.parts[1]]) renderCalc(NC.byId[h.parts[1]], h.state ? NC.decodeState(h.state) : null);
    else if (h.parts[0] === 'references') renderReferences();
    else renderHome();
    markActive();
    window.scrollTo(0, 0);
  }

  /* ---------------- history ---------------- */
  const HISTORY_KEY = 'nc:history';
  function getHistory() { const h = store.get(HISTORY_KEY); return Array.isArray(h) ? h : []; }
  let historyTimer = null;
  function recordHistory(def, raw, out) {
    clearTimeout(historyTimer);
    historyTimer = setTimeout(function () {
      const head = (out.results || []).find(function (r) { return r.main && typeof r.value === 'number'; }) || (out.results || [])[0];
      const entry = {
        id: def.id, title: def.title, date: new Date().toISOString(), raw: raw,
        headline: head ? head.label + ': ' + (typeof head.value === 'number' ? NC.fmt(head.value, head.sig || 4) : head.value) + (head.unit ? ' ' + head.unit : '') : ''
      };
      const h = getHistory();
      if (h.length && h[0].id === def.id) h[0] = entry; // keep one entry while the same calculator is being tweaked
      else h.unshift(entry);
      store.set(HISTORY_KEY, h.slice(0, 20));
    }, 1500);
  }
  function relTime(iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (!isFinite(s)) return '';
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return new Date(iso).toLocaleDateString();
  }

  /* ---------------- home ---------------- */
  function renderHome() {
    document.title = 'NanoCalc';
    let html = '<section class="hero"><h1>Nanomaterials calculations, shown step by step</h1>' +
      '<p>NanoCalc does ' + NC.calculators.length + ' calculations used in nanomaterials synthesis and characterization. Every result shows each step with the numbers filled in, and every equation, constant and empirical coefficient is cited to its source.</p></section>' +
      '<div class="pillars">' +
      '<div class="pillar"><b>Transparent</b><span>Each step shows the formula, the substituted values and the intermediate result.</span></div>' +
      '<div class="pillar"><b>Cited</b><span>Inline citation numbers link to the full reference list, with DOIs where they exist.</span></div>' +
      '<div class="pillar"><b>With uncertainties</b><span>Add ± to any input to propagate it (Monte Carlo, GUM Supplement 1). Export to Markdown or PDF; share runs as links.</span></div></div>';
    const hist = getHistory().filter(function (e) { return NC.byId[e.id]; });
    if (hist.length) {
      html += '<section class="cat-block history"><div class="hist-head"><h2>Recent calculations</h2><button class="btn small" id="clearHist" type="button">Clear history</button></div><ul class="hist-list">' +
        hist.map(function (e) {
          return '<li><a href="' + esc(calcLink(e.id, e.raw)) + '"><b>' + esc(e.title) + '</b><span>' + esc(e.headline || '') + '</span></a><time datetime="' + esc(e.date) + '">' + esc(relTime(e.date)) + '</time></li>';
        }).join('') + '</ul></section>';
    }
    NC.categories.forEach(function (cat) {
      const list = calcsIn(cat.id);
      if (!list.length) return;
      html += '<section class="cat-block"><h2>' + esc(cat.label) + '</h2><p>' + esc(cat.blurb) + '</p><div class="cards">' +
        list.map(function (c) { return '<a class="card" href="#/calc/' + c.id + '"><b>' + esc(c.title) + '</b><span>' + esc(c.short || '') + '</span></a>'; }).join('') +
        '</div></section>';
    });
    main.innerHTML = html;
    if ($('#clearHist')) $('#clearHist').addEventListener('click', function () { store.del(HISTORY_KEY); renderHome(); });
  }

  /* ---------------- references page ---------------- */
  function renderReferences() {
    document.title = 'References · NanoCalc';
    const used = {};
    NC.calculators.forEach(function (c) {
      collectRefIds(c, null).forEach(function (id) { (used[id] = used[id] || []).push(c); });
    });
    const ids = Object.keys(NC.refs).sort(function (a, b) { return NC.refs[a].authors.localeCompare(NC.refs[b].authors); });
    main.innerHTML = '<header class="calc-head"><div class="crumb">Bibliography</div><h1>All references</h1>' +
      '<p class="lede">Every source the calculators cite, with the calculators that use it.</p></header>' +
      '<section class="panel"><div class="panel-head"><h2>' + ids.length + ' sources</h2><div class="actions"><button class="btn" id="bibBtn">Download BibTeX</button></div></div>' +
      '<ol class="refs refs-all">' + ids.map(function (id) {
        const u = used[id] || [];
        return '<li>' + NC.formatRef(NC.refs[id]) + (u.length ? '<span class="used">Used in: ' + u.map(function (c) { return '<a href="#/calc/' + c.id + '">' + esc(c.title) + '</a>'; }).join(', ') + '</span>' : '') + '</li>';
      }).join('') + '</ol><p class="disclaimer">Citations are given so you can trace every number. Check the original publications before using a result in your own work.</p></section>';
    $('#bibBtn').addEventListener('click', function () {
      download('nanocalc-references.bib', ids.map(function (id) { return NC.toBibTeX(NC.refs[id]); }).join('\n\n') + '\n', 'application/x-bibtex');
    });
  }

  /* ---------------- calculator page ---------------- */
  let timer = null;
  let mcToken = 0;

  function defaults(def) {
    const v = {};
    def.inputs.forEach(function (inp) {
      const x = inp.value;
      v[inp.id] = x === undefined || x === null || (typeof x === 'number' && isNaN(x)) ? '' : String(x);
      if (inp.type === 'number') v['u_' + inp.id] = '';
    });
    return v;
  }
  function exampleValues(def) {
    const ex = typeof def.example === 'function' ? def.example() : def.example || {};
    const v = defaults(def);
    // an example may leave optional fields as NaN/null meaning "blank" — show them empty, not as the text "NaN"
    Object.keys(ex).forEach(function (k) {
      const x = ex[k];
      v[k] = x === undefined || x === null || (typeof x === 'number' && isNaN(x)) ? '' : String(x);
    });
    return v;
  }
  function hasUnc(raw) { return Object.keys(raw || {}).some(function (k) { return k.indexOf('u_') === 0 && String(raw[k]).trim() !== ''; }); }

  /** Parse raw form strings → values, per-field errors, standard uncertainties, unit conversions. */
  function parseAll(def, raw) {
    const v = {}, errors = {}, unc = {}, conv = {};
    def.inputs.forEach(function (inp) {
      if (inp.type !== 'number') { v[inp.id] = raw[inp.id]; return; }
      const p = NC.parseUnitDetailed(raw[inp.id], inp.unit);
      v[inp.id] = p.value;
      if (p.error) errors[inp.id] = p.error;
      else if (p.converted) conv[inp.id] = '= ' + NC.fmt(p.value, 6) + ' ' + inp.unit;
      const us = raw['u_' + inp.id];
      if (us !== undefined && String(us).trim() !== '') {
        const q = NC.parseUnitDetailed(us, inp.unit, { difference: true });
        if (q.error) errors[inp.id] = 'Uncertainty: ' + q.error;
        else if (!(q.value >= 0)) errors[inp.id] = 'The uncertainty must be zero or positive.';
        else if (q.value > 0) unc[inp.id] = q.value;
      }
    });
    return { v: v, errors: errors, unc: unc, conv: conv };
  }

  function fieldHTML(inp, val, uval) {
    const id = 'f-' + inp.id;
    const label = '<label for="' + id + '">' + esc(inp.label) + (inp.unit ? ' <span class="unit">(' + esc(inp.unit) + ')</span>' : '') + '</label>';
    let control, extra = '';
    if (inp.type === 'select') {
      // options: [value, label] or [value, label, group]; consecutive options sharing a group render as an <optgroup>
      let html = '', open = null;
      inp.options.forEach(function (o) {
        const g = o[2] || null;
        if (g !== open) {
          if (open) html += '</optgroup>';
          if (g) html += '<optgroup label="' + esc(g) + '">';
          open = g;
        }
        html += '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      });
      if (open) html += '</optgroup>';
      control = '<select id="' + id + '" name="' + inp.id + '">' + html + '</select>';
    } else if (inp.type === 'textarea') {
      control = '<textarea id="' + id + '" name="' + inp.id + '" rows="' + (inp.rows || 8) + '" spellcheck="false" placeholder="' + esc(inp.placeholder || '') + '">' + esc(val) + '</textarea>';
      extra = '<div class="upload-row"><button type="button" class="btn small" data-upload="' + inp.id + '">Upload file</button>' +
        '<span class="help">or drop a .csv, .txt, .xy or .dat file on the box</span>' +
        '<input type="file" hidden accept="' + UPLOAD_TYPES + '" data-file-for="' + inp.id + '"></div>';
    } else {
      const hint = NC.unitHint ? NC.unitHint(inp.unit) : '';
      control = '<div class="valrow"><input id="' + id + '" name="' + inp.id + '" type="text" autocomplete="off" spellcheck="false" value="' + esc(val) + '"' + (hint ? ' title="' + esc(hint) + '"' : '') + '>' +
        '<span class="unc-wrap"><span class="pm" aria-hidden="true">±</span><input name="u_' + inp.id + '" class="unc" type="text" autocomplete="off" spellcheck="false" aria-label="Standard uncertainty of ' + esc(inp.label) + '" placeholder="u (1σ)" value="' + esc(uval || '') + '" title="Standard uncertainty (1σ), in ' + esc(inp.unit || 'the same unit') + '; units allowed"></span></div>';
      extra = '<div class="field-msg" hidden></div>';
    }
    const help = inp.help ? '<div class="help">' + esc(inp.help) + '</div>' : '';
    return '<div class="field' + (inp.type === 'textarea' || inp.wide || inp.full ? ' wide' : '') + '" data-field="' + inp.id + '">' + label + control + extra + help + '</div>';
  }

  function renderCalc(def, urlState) {
    document.title = def.title + ' · NanoCalc';
    const cat = NC.categories.find(function (c) { return c.id === def.category; }) || { label: '' };
    const raw = Object.assign(defaults(def), urlState || store.get('nc:v:' + def.id) || {});
    const showUnc = hasUnc(raw) || !!store.get('nc:unc-open');
    const presets = def.presets && def.presets.length
      ? '<label class="preset">Preset: <select id="presetSel"><option value="">— choose —</option>' +
        def.presets.map(function (p, i) { return '<option value="' + i + '">' + esc(p.label) + '</option>'; }).join('') + '</select></label>'
      : '';
    main.innerHTML =
      '<header class="calc-head"><div class="crumb">' + esc(cat.label) + '</div><h1>' + esc(def.title) + '</h1><p class="lede">' + esc(def.description) + '</p></header>' +
      '<section class="panel"><div class="panel-head"><h2>Inputs</h2><div class="actions">' + presets +
      (def.example ? '<button class="btn" id="exBtn" type="button">Load example</button>' : '') +
      '<button class="btn" id="resetBtn" type="button">Reset</button>' +
      '<button class="btn" id="uncBtn" type="button" aria-pressed="' + showUnc + '">± Uncertainties</button>' +
      '<button class="btn" id="linkBtn" type="button">Copy link</button></div></div>' +
      '<form class="form' + (showUnc ? ' show-unc' : '') + '" id="form" autocomplete="off" onsubmit="return false">' +
      def.inputs.map(function (inp) { return fieldHTML(inp, raw[inp.id], raw['u_' + inp.id]); }).join('') + '</form>' +
      '<p class="units-note">Number fields accept units, e.g. <code>5 Å</code>, <code>0.2 µm</code>, <code>25 °C</code>.' +
      '<span class="unc-only"> The ± boxes take standard uncertainties (1σ); they are propagated by Monte Carlo. Data tables are used as entered.</span></p>' +
      (def.presetNote ? '<p class="preset-note">' + esc(def.presetNote) + '</p>' : '') +
      '<details class="saved-runs" id="savedRuns"><summary>Saved runs</summary><div class="save-row">' +
      '<input id="saveName" type="text" placeholder="Name this run" aria-label="Name for the saved run" maxlength="80">' +
      '<button class="btn" id="saveBtn" type="button">Save run</button></div><ul id="savedList"></ul></details></section>' +
      '<div id="output" aria-live="polite"></div>';

    const form = $('#form');
    const setValues = function (vals, clearUnc) {
      def.inputs.forEach(function (inp) {
        const el = form.elements[inp.id];
        if (el && vals[inp.id] !== undefined) el.value = vals[inp.id];
        if (inp.type === 'number') {
          const u = form.elements['u_' + inp.id];
          if (vals['u_' + inp.id] !== undefined) u.value = vals['u_' + inp.id];
          else if (clearUnc) u.value = '';
        }
      });
    };
    const read = function () {
      const r = {};
      def.inputs.forEach(function (inp) {
        r[inp.id] = form.elements[inp.id].value;
        if (inp.type === 'number') r['u_' + inp.id] = form.elements['u_' + inp.id].value;
      });
      return r;
    };
    const run = function () {
      const r = read();
      store.set('nc:v:' + def.id, r);
      const P = parseAll(def, r);
      const hidden = {};
      def.inputs.forEach(function (inp) {
        const wrap = form.querySelector('[data-field="' + inp.id + '"]');
        hidden[inp.id] = inp.showIf ? !inp.showIf(P.v) : false;
        wrap.hidden = hidden[inp.id];
        const msg = wrap.querySelector('.field-msg');
        if (!msg) return;
        const err = P.errors[inp.id], conv = P.conv[inp.id];
        msg.hidden = !(err || conv);
        msg.className = 'field-msg' + (err ? ' err' : ' conv');
        msg.textContent = err || conv || '';
        wrap.classList.toggle('invalid', !!err);
      });
      const errs = Object.keys(P.errors).filter(function (id) { return !hidden[id]; });
      const updateUncBtn = function (n) { $('#uncBtn').textContent = '± Uncertainties' + (n ? ' (' + n + ')' : ''); };
      const unc = {};
      Object.keys(P.unc).forEach(function (id) { if (!hidden[id]) unc[id] = P.unc[id]; });
      updateUncBtn(Object.keys(unc).length);
      if (errs.length) {
        mcToken++;
        $('#output').innerHTML = '<section class="panel"><div class="alert err" role="alert"><b>Check the inputs.</b><ul>' + errs.map(function (id) {
          const inp = def.inputs.find(function (i) { return i.id === id; });
          return '<li>' + esc(inp.label) + ': ' + esc(P.errors[id]) + '</li>';
        }).join('') + '</ul></div></section>';
        return;
      }
      const out = compute(def, P.v, unc, r);
      if (out) recordHistory(def, r, out);
    };
    form.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 180); });
    form.addEventListener('change', run);
    if ($('#presetSel')) $('#presetSel').addEventListener('change', function (e) {
      if (e.target.value === '') return;
      const p = def.presets[+e.target.value];
      const vals = {};
      Object.keys(p.values).forEach(function (k) { const x = p.values[k]; vals[k] = x === null || (typeof x === 'number' && isNaN(x)) ? '' : String(x); });
      setValues(vals);
      run();
    });
    if ($('#exBtn')) $('#exBtn').addEventListener('click', function () { setValues(exampleValues(def), true); run(); });
    $('#resetBtn').addEventListener('click', function () { setValues(defaults(def), true); if ($('#presetSel')) $('#presetSel').value = ''; run(); });
    $('#uncBtn').addEventListener('click', function () {
      const on = !form.classList.contains('show-unc');
      form.classList.toggle('show-unc', on);
      $('#uncBtn').setAttribute('aria-pressed', String(on));
      store.set('nc:unc-open', on);
      if (on) { const first = form.querySelector('.field:not([hidden]) input.unc'); if (first) first.focus(); }
    });
    $('#linkBtn').addEventListener('click', function () {
      const url = location.href.split('#')[0] + calcLink(def.id, read());
      copyText(url, 'Link copied. It restores these inputs.');
    });

    /* file upload + drag and drop for data boxes */
    form.querySelectorAll('[data-upload]').forEach(function (btn) {
      const id = btn.getAttribute('data-upload');
      const fileInput = form.querySelector('[data-file-for="' + id + '"]');
      const ta = form.elements[id];
      const load = function (file) {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { toast('File is larger than 5 MB.'); return; }
        const reader = new FileReader();
        reader.onload = function () { ta.value = String(reader.result); run(); toast('Loaded ' + file.name); };
        reader.onerror = function () { toast('Could not read ' + file.name); };
        reader.readAsText(file);
      };
      btn.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function () { load(fileInput.files[0]); fileInput.value = ''; });
      ta.addEventListener('dragover', function (e) { e.preventDefault(); ta.classList.add('dragging'); });
      ta.addEventListener('dragleave', function () { ta.classList.remove('dragging'); });
      ta.addEventListener('drop', function (e) {
        e.preventDefault();
        ta.classList.remove('dragging');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) load(e.dataTransfer.files[0]);
      });
    });

    /* saved runs */
    const savedKey = 'nc:saved:' + def.id;
    const renderSaved = function () {
      const list = store.get(savedKey) || [];
      $('#savedRuns summary').textContent = 'Saved runs' + (list.length ? ' (' + list.length + ')' : '');
      $('#savedList').innerHTML = list.length ? list.map(function (s, i) {
        return '<li><span class="sr-name">' + esc(s.name) + '</span><time>' + esc(new Date(s.date).toLocaleString()) + '</time>' +
          '<button class="btn small" type="button" data-load="' + i + '">Load</button><button class="btn small" type="button" data-del="' + i + '">Delete</button></li>';
      }).join('') : '<li class="empty">No saved runs yet. Name the current inputs and save them here (stored in this browser only).</li>';
    };
    $('#saveBtn').addEventListener('click', function () {
      const name = $('#saveName').value.trim() || 'Run ' + new Date().toLocaleString();
      const list = store.get(savedKey) || [];
      list.unshift({ name: name, date: new Date().toISOString(), raw: read() });
      store.set(savedKey, list.slice(0, 50));
      $('#saveName').value = '';
      renderSaved();
      toast('Saved “' + name + '”');
    });
    $('#savedList').addEventListener('click', function (e) {
      const list = store.get(savedKey) || [];
      const li = e.target.getAttribute('data-load'), di = e.target.getAttribute('data-del');
      if (li !== null && list[+li]) { setValues(Object.assign(defaults(def), list[+li].raw), true); run(); toast('Loaded “' + list[+li].name + '”'); }
      if (di !== null && list[+di]) { list.splice(+di, 1); store.set(savedKey, list); renderSaved(); }
    });
    renderSaved();

    if (urlState) {
      toast('Inputs loaded from link');
      // drop ?state= so a later refresh shows the latest edits (saved in this browser), not the link's values
      try { history.replaceState(null, '', location.href.split('#')[0] + '#/calc/' + def.id); } catch (e) { /* ignore */ }
    }
    run();
  }

  function collectRefIds(def, out) {
    const ids = [];
    const add = function (r) {
      (Array.isArray(r) ? r : r ? [r] : []).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    };
    if (out) {
      (out.steps || []).forEach(function (s) { add(s.ref); });
      (out.results || []).forEach(function (r) { add(r.ref); });
    }
    add(def.refs);
    return ids;
  }

  /** Render a calculation; returns the output object, or null on error. */
  function compute(def, v, unc, raw) {
    const outEl = $('#output');
    const myToken = ++mcToken;
    let out;
    try {
      out = def.compute(v);
    } catch (e) {
      if (e instanceof NC.InputError) {
        outEl.innerHTML = '<section class="panel"><div class="alert err" role="alert"><b>Check the inputs.</b> ' + esc(e.message) + '</div></section>';
      } else {
        console.error(e);
        outEl.innerHTML = '<section class="panel"><div class="alert err" role="alert"><b>Calculation error.</b> ' + esc(e.message) + '</div></section>';
      }
      return null;
    }
    const withUnc = Object.keys(unc).length > 0;
    const refIds = collectRefIds(def, out);
    if (withUnc) ['jcgm101', 'jcgm100'].forEach(function (id) { if (NC.refs[id] && refIds.indexOf(id) < 0) refIds.push(id); });
    const num = function (id) { return refIds.indexOf(id) + 1; };
    const cite = function (r) {
      const list = (Array.isArray(r) ? r : r ? [r] : []).filter(function (id) { return NC.refs[id]; });
      if (!list.length) return '';
      return '<sup class="cite">' + list.map(function (id) { return '<a href="#" data-ref="' + id + '" title="' + esc(NC.refs[id].authors + ' (' + NC.refs[id].year + ')') + '">[' + num(id) + ']</a>'; }).join('') + '</sup>';
    };
    const state = { mc: null };

    let html = '<section class="panel"><div class="panel-head"><h2>Results</h2><div class="actions no-print">' +
      '<button class="btn" id="copyBtn" type="button">Copy report</button><button class="btn" id="mdBtn" type="button">Download .md</button><button class="btn" id="printBtn" type="button">Print / PDF</button></div></div>';
    if (out.warnings && out.warnings.length) html += '<div class="alert warn"><ul>' + out.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>';
    html += '<div class="results">' + (out.results || []).map(function (r, i) {
      const isText = typeof r.value === 'string';
      const val = isText ? esc(r.value) : esc(NC.fmt(r.value, r.sig || 4));
      return '<div class="result' + (r.main ? ' main' : '') + (isText ? ' text' : '') + '" data-ri="' + i + '"><div class="k">' + esc(r.label) + cite(r.ref) + '</div><div class="v">' + val + (r.unit ? '<small>' + esc(r.unit) + '</small>' : '') + '</div>' +
        (withUnc && !isText ? '<div class="u pending">±…</div>' : '') + '</div>';
    }).join('') + '</div>';

    const figs = (out.figures || []).map(function (fg) { return '<figure class="sketch"><figcaption>' + esc(fg.title || '') + '</figcaption>' + fg.svg + '</figure>'; })
      .concat((out.plots || []).map(function (p) { return '<figure><figcaption>' + esc(p.title || '') + '</figcaption>' + NC.plot(p) + '</figure>'; }));
    if (figs.length) html += '<div class="plots" style="margin-top:16px">' + figs.join('') + '</div>';
    (out.tables || []).forEach(function (t) {
      html += '<h3>' + esc(t.title) + '</h3><div class="table-wrap"><table class="data"><thead><tr>' + t.columns.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') +
        '</tr></thead><tbody>' + t.rows.map(function (row) { return '<tr>' + row.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
    });
    html += '</section>';

    if (withUnc) {
      html += '<section class="panel" id="uncPanel"><h2>Uncertainty' + cite(['jcgm101', 'jcgm100']) + '</h2>' +
        '<p class="unc-status">Propagating input uncertainties…</p><div class="unc-body"></div>' +
        '<p class="note">Method: Monte Carlo propagation of distributions (GUM Supplement 1). Each input with a ± value is sampled as an independent normal distribution with that standard uncertainty; the whole calculation is repeated for every trial. Each result is reported with the standard deviation of its trial values (standard uncertainty) and the 2.5th–97.5th percentile range (95 % coverage interval). Trials whose sampled inputs are outside the model’s valid range are discarded and counted. Correlations between inputs are not modelled. The step-by-step solution below uses the nominal values.</p></section>';
    }

    html += '<section class="panel"><h2>Step-by-step solution</h2><ol class="steps">' + (out.steps || []).map(function (s) {
      if (s.kind === 'heading') return '<li class="heading">' + esc(s.title) + '</li>';
      const box = function (cls, plain, tex) {
        if (!plain && !tex) return '';
        const r = NC.renderMath(plain || '', tex);
        return '<div class="' + cls + (r.tex ? ' tex' : '') + (r.prose ? ' prose' : '') + '">' + r.html + '</div>';
      };
      return '<li class="step"><div class="step-title">' + esc(s.title) + cite(s.ref) + '</div>' +
        box('formula', s.formula, s.tex) +
        box('sub', s.sub, s.subTex) +
        box('res', s.result, s.resultTex) +
        (s.note ? '<div class="note">' + esc(s.note) + '</div>' : '') + '</li>';
    }).join('') + '</ol></section>';

    if (out.notes && out.notes.length) html += '<section class="panel"><h2>Assumptions & notes</h2><ul class="notes">' + out.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></section>';

    html += '<section class="panel"><h2>References</h2><ol class="refs">' + refIds.map(function (id) {
      return '<li id="cite-' + id + '">' + NC.formatRef(NC.refs[id]) + '</li>';
    }).join('') + '</ol><p class="disclaimer">Constants: CODATA 2018. Check results against the original sources before publishing them.</p></section>';

    outEl.innerHTML = html;
    outEl.querySelectorAll('a[data-ref]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        const li = document.getElementById('cite-' + a.getAttribute('data-ref'));
        if (!li) return;
        li.scrollIntoView({ behavior: 'smooth', block: 'center' });
        li.style.background = 'var(--accent-weak)';
        setTimeout(function () { li.style.background = ''; }, 1600);
      });
    });
    const md = function () { return markdownReport(def, v, out, refIds, unc, state.mc); };
    $('#copyBtn').addEventListener('click', function () { copyText(md(), 'Report copied to clipboard'); });
    $('#mdBtn').addEventListener('click', function () { download('nanocalc-' + def.id + '.md', md(), 'text/markdown'); });
    $('#printBtn').addEventListener('click', function () { window.print(); });

    if (withUnc) runMonteCarlo(def, v, unc, out, myToken, state);
    return out;
  }

  /* ---------------- Monte Carlo (async, cancellable) ---------------- */
  function runMonteCarlo(def, v, unc, out, token, state) {
    const status = $('#uncPanel .unc-status');
    let runner;
    try { runner = NC.mcRunner(def, v, unc); } catch (e) { status.textContent = 'Uncertainty could not be propagated: ' + e.message; return; }
    let cpu = 0;
    const t0 = performance.now();
    const chunk = function () {
      if (token !== mcToken) return; // superseded by a newer calculation
      const s = performance.now();
      while (performance.now() - s < 12 && runner.trials < MC.maxTrials) runner.step(5);
      cpu += performance.now() - s;
      status.textContent = 'Propagating input uncertainties… ' + runner.trials + ' trials';
      const more = runner.trials < MC.maxTrials && (runner.trials < MC.minTrials || cpu < MC.cpuBudget) && performance.now() - t0 < MC.wallCap;
      if (more) setTimeout(chunk, 0);
      else finish(runner.summary());
    };
    const finish = function (sum) {
      if (token !== mcToken) return;
      state.mc = sum;
      const pct = sum.trials ? (100 * sum.failed) / sum.trials : 0;
      const inputsText = sum.inputs.map(function (id) {
        const inp = def.inputs.find(function (i) { return i.id === id; });
        return inp.label + ' = ' + NC.fmt(v[id], 6) + ' ± ' + NC.fmt(unc[id], 3) + (inp.unit ? ' ' + inp.unit : '');
      }).join('; ');
      status.textContent = NC.fmt(sum.trials, 6) + ' trials' + (sum.failed ? ', ' + NC.fmt(sum.failed, 6) + ' discarded (' + NC.fix(pct, 1) + ' %)' : '') + '. Input uncertainties: ' + inputsText + '.';
      if (pct > 5) status.textContent += ' Many trials fell outside the model’s valid range, so the distribution is truncated; treat the uncertainty with care.';
      const rows = [];
      (out.results || []).forEach(function (r, i) {
        const s = sum.results[r.label];
        const card = document.querySelector('.result[data-ri="' + i + '"] .u');
        if (!s || typeof r.value !== 'number' || s.u === 0) { if (card) card.remove(); return; } // counts and constants: no spread to show
        if (card) {
          card.classList.remove('pending');
          card.textContent = NC.fmtUnc(s.u) + (r.unit ? ' ' + r.unit : '');
          card.title = '95 % interval: ' + NC.fmt(s.lo, 4) + ' – ' + NC.fmt(s.hi, 4) + (r.unit ? ' ' + r.unit : '') + ' (MC mean ' + NC.fmt(s.mean, 4) + ')';
        }
        rows.push('<tr><td>' + esc(r.label) + '</td><td>' + esc(NC.fmt(r.value, r.sig || 4)) + '</td><td>' + esc(NC.fmt(s.u, 2)) + '</td><td>' + esc(s.mean !== 0 ? NC.fix((100 * s.u) / Math.abs(s.mean), 2) + ' %' : '—') + '</td><td>' + esc(NC.fmt(s.lo, 4) + ' – ' + NC.fmt(s.hi, 4)) + '</td><td>' + esc(r.unit || '') + '</td></tr>');
      });
      $('#uncPanel .unc-body').innerHTML = rows.length
        ? '<div class="table-wrap"><table class="data"><thead><tr><th>Result</th><th>Value</th><th>Std. uncertainty</th><th>Relative</th><th>95 % interval</th><th>Unit</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>'
        : '<p>No numeric results could be propagated.</p>';
    };
    setTimeout(chunk, 0);
  }

  /* ---------------- export ---------------- */
  function markdownReport(def, v, out, refIds, unc, mc) {
    const num = function (id) { return refIds.indexOf(id) + 1; };
    const cite = function (r) {
      const list = (Array.isArray(r) ? r : r ? [r] : []).filter(function (id) { return NC.refs[id]; });
      return list.length ? ' [' + list.map(num).join(', ') + ']' : '';
    };
    unc = unc || {};
    const L = [];
    L.push('# ' + def.title, '', '_Generated by NanoCalc on ' + new Date().toISOString().slice(0, 10) + '_', '');
    L.push('## Inputs', '', '| Parameter | Value |', '|---|---|');
    def.inputs.forEach(function (inp) {
      if (inp.showIf && !inp.showIf(v)) return;
      let val = v[inp.id];
      if (inp.type === 'select') { const o = inp.options.find(function (o) { return String(o[0]) === String(val); }); val = o ? o[1] : val; }
      if (inp.type === 'textarea') { L.push('| ' + inp.label + ' | (data, see below) |'); return; }
      if (typeof val === 'number') val = isNaN(val) ? '—' : String(val) + (unc[inp.id] ? ' ± ' + unc[inp.id] : '');
      L.push('| ' + inp.label + (inp.unit ? ' (' + inp.unit + ')' : '') + ' | ' + val + ' |');
    });
    def.inputs.filter(function (i) { return i.type === 'textarea' && !(i.showIf && !i.showIf(v)); }).forEach(function (inp) {
      L.push('', '**' + inp.label + '**', '', '```', String(v[inp.id]).trim(), '```');
    });
    L.push('', '## Results', '');
    (out.results || []).forEach(function (r) {
      const s = mc && mc.results[r.label];
      L.push('- **' + r.label + ':** ' + (typeof r.value === 'string' ? r.value : NC.fmt(r.value, r.sig || 4)) +
        (s ? ' ' + NC.fmtUnc(s.u) : '') + (r.unit ? ' ' + r.unit : '') +
        (s ? ' (95 % interval ' + NC.fmt(s.lo, 4) + ' – ' + NC.fmt(s.hi, 4) + ')' : '') + cite(r.ref));
    });
    (out.warnings || []).forEach(function (w) { L.push('', '> ⚠ ' + w); });
    (out.tables || []).forEach(function (t) {
      L.push('', '### ' + t.title, '', '| ' + t.columns.join(' | ') + ' |', '|' + t.columns.map(function () { return '---'; }).join('|') + '|');
      t.rows.forEach(function (r) { L.push('| ' + r.join(' | ') + ' |'); });
    });
    if (Object.keys(unc).length) {
      L.push('', '## Uncertainty' + cite(['jcgm101', 'jcgm100']), '');
      if (mc) {
        L.push('Monte Carlo propagation of distributions (GUM Supplement 1): ' + mc.trials + ' trials' + (mc.failed ? ', ' + mc.failed + ' discarded as outside the model’s valid range' : '') +
          '. Inputs sampled as independent normal distributions with the stated standard uncertainties; correlations not modelled. Uncertainties are standard uncertainties (1σ); intervals are 95 % coverage intervals (2.5th–97.5th percentiles).');
      } else {
        L.push('Uncertainty propagation had not finished when this report was created.');
      }
    }
    L.push('', '## Step-by-step solution', '');
    let n = 0;
    (out.steps || []).forEach(function (s) {
      if (s.kind === 'heading') { L.push('', '### ' + s.title, ''); return; }
      n++;
      L.push(n + '. **' + s.title + '**' + cite(s.ref));
      const m = function (plain, tex) {
        const t = tex || NC.toTex(plain);
        return t ? '$' + t + '$' : plain;
      };
      if (s.formula || s.tex) L.push('   - Formula: ' + m(s.formula, s.tex));
      if (s.sub || s.subTex) L.push('   - Substitution: ' + m(s.sub, s.subTex));
      if (s.result || s.resultTex) L.push('   - Result: ' + m(s.result, s.resultTex));
      if (s.note) L.push('   - _' + s.note + '_');
    });
    if (out.notes && out.notes.length) { L.push('', '## Assumptions & notes', ''); out.notes.forEach(function (x) { L.push('- ' + x); }); }
    L.push('', '## References', '');
    refIds.forEach(function (id, i) { L.push((i + 1) + '. ' + NC.formatRefText(NC.refs[id])); });
    L.push('', '_Constants: CODATA 2018. Check results against the original sources before publishing them._', '');
    return L.join('\n');
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function copyText(text, msg) {
    const done = function () { toast(msg); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
  }
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  /* ---------------- offline: service worker (http/https only) ---------------- */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('Service worker not registered:', e.message); });
    });
  }

  buildNav('');
  window.addEventListener('hashchange', route);
  route();
})();
