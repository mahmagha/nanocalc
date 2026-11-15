/* NanoCalc UI: navigation, forms, live computation, step/citation rendering, export. */
(function () {
  'use strict';
  const NC = window.NC;
  const esc = NC.esc;
  const $ = function (sel, el) { return (el || document).querySelector(sel); };
  const main = $('#main');
  const store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };

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
    const h = location.hash.replace(/^#\/?/, '').split('/');
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
    const h = location.hash.replace(/^#\/?/, '').split('/');
    if (h[0] === 'calc' && NC.byId[h[1]]) renderCalc(NC.byId[h[1]]);
    else if (h[0] === 'references') renderReferences();
    else renderHome();
    markActive();
    window.scrollTo(0, 0);
  }

  /* ---------------- home ---------------- */
  function renderHome() {
    document.title = 'NanoCalc';
    let html = '<section class="hero"><h1>Nanomaterials calculations, shown step by step</h1>' +
      '<p>NanoCalc does ' + NC.calculators.length + ' calculations used in nanomaterials synthesis and characterization. Every result shows each step with the numbers filled in, and every equation, constant and empirical coefficient is cited to its source.</p></section>' +
      '<div class="pillars">' +
      '<div class="pillar"><b>Transparent</b><span>Each step shows the formula, the substituted values and the intermediate result.</span></div>' +
      '<div class="pillar"><b>Cited</b><span>Inline citation numbers link to the full reference list, with DOIs where they exist.</span></div>' +
      '<div class="pillar"><b>Exportable</b><span>Copy or download a Markdown report, or print it to PDF for your lab notebook.</span></div></div>';
    NC.categories.forEach(function (cat) {
      const list = calcsIn(cat.id);
      if (!list.length) return;
      html += '<section class="cat-block"><h2>' + esc(cat.label) + '</h2><p>' + esc(cat.blurb) + '</p><div class="cards">' +
        list.map(function (c) { return '<a class="card" href="#/calc/' + c.id + '"><b>' + esc(c.title) + '</b><span>' + esc(c.short || '') + '</span></a>'; }).join('') +
        '</div></section>';
    });
    main.innerHTML = html;
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

  function defaults(def) {
    const v = {};
    def.inputs.forEach(function (inp) {
      const x = inp.value;
      v[inp.id] = x === undefined || x === null || (typeof x === 'number' && isNaN(x)) ? '' : String(x);
    });
    return v;
  }
  function exampleValues(def) {
    const ex = typeof def.example === 'function' ? def.example() : def.example || {};
    const v = defaults(def);
    Object.keys(ex).forEach(function (k) { v[k] = String(ex[k]); });
    return v;
  }
  function parseNumber(s) {
    s = String(s === undefined ? '' : s).trim().replace(/−/g, '-');
    if (s === '') return NaN;
    if (s.indexOf(',') >= 0 && s.indexOf('.') < 0) s = s.replace(',', '.');
    const n = Number(s);
    return isFinite(n) ? n : NaN;
  }
  function parsed(def, raw) {
    const v = {};
    def.inputs.forEach(function (inp) { v[inp.id] = inp.type === 'number' ? parseNumber(raw[inp.id]) : raw[inp.id]; });
    return v;
  }

  function fieldHTML(inp, val) {
    const id = 'f-' + inp.id;
    const label = '<label for="' + id + '">' + esc(inp.label) + (inp.unit ? ' <span class="unit">(' + esc(inp.unit) + ')</span>' : '') + '</label>';
    let control;
    if (inp.type === 'select') {
      control = '<select id="' + id + '" name="' + inp.id + '">' + inp.options.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select>';
    } else if (inp.type === 'textarea') {
      control = '<textarea id="' + id + '" name="' + inp.id + '" rows="' + (inp.rows || 8) + '" spellcheck="false" placeholder="' + esc(inp.placeholder || '') + '">' + esc(val) + '</textarea>';
    } else {
      control = '<input id="' + id + '" name="' + inp.id + '" type="text" inputmode="decimal" autocomplete="off" value="' + esc(val) + '">';
    }
    const help = inp.help ? '<div class="help">' + esc(inp.help) + '</div>' : '';
    return '<div class="field' + (inp.type === 'textarea' || inp.wide || inp.full ? ' wide' : '') + '" data-field="' + inp.id + '">' + label + control + help + '</div>';
  }

  function renderCalc(def) {
    document.title = def.title + ' · NanoCalc';
    const cat = NC.categories.find(function (c) { return c.id === def.category; }) || { label: '' };
    const raw = Object.assign(defaults(def), store.get('nc:v:' + def.id) || {});
    const presets = def.presets && def.presets.length
      ? '<label class="preset">Preset: <select id="presetSel"><option value="">— choose —</option>' +
        def.presets.map(function (p, i) { return '<option value="' + i + '">' + esc(p.label) + '</option>'; }).join('') + '</select></label>'
      : '';
    main.innerHTML =
      '<header class="calc-head"><div class="crumb">' + esc(cat.label) + '</div><h1>' + esc(def.title) + '</h1><p class="lede">' + esc(def.description) + '</p></header>' +
      '<section class="panel"><div class="panel-head"><h2>Inputs</h2><div class="actions">' + presets +
      (def.example ? '<button class="btn" id="exBtn" type="button">Load example</button>' : '') +
      '<button class="btn" id="resetBtn" type="button">Reset</button></div></div>' +
      '<form class="form" id="form" autocomplete="off" onsubmit="return false">' + def.inputs.map(function (inp) { return fieldHTML(inp, raw[inp.id]); }).join('') + '</form>' +
      (def.presetNote ? '<p class="preset-note">' + esc(def.presetNote) + '</p>' : '') + '</section>' +
      '<div id="output" aria-live="polite"></div>';

    const form = $('#form');
    const setValues = function (vals) {
      def.inputs.forEach(function (inp) {
        const el = form.elements[inp.id];
        if (el && vals[inp.id] !== undefined) el.value = vals[inp.id];
      });
    };
    const read = function () {
      const r = {};
      def.inputs.forEach(function (inp) { r[inp.id] = form.elements[inp.id].value; });
      return r;
    };
    const run = function () {
      const r = read();
      store.set('nc:v:' + def.id, r);
      const v = parsed(def, r);
      def.inputs.forEach(function (inp) {
        const wrap = form.querySelector('[data-field="' + inp.id + '"]');
        wrap.hidden = inp.showIf ? !inp.showIf(v) : false;
      });
      compute(def, v);
    };
    form.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 180); });
    form.addEventListener('change', run);
    if ($('#presetSel')) $('#presetSel').addEventListener('change', function (e) {
      if (e.target.value === '') return;
      const p = def.presets[+e.target.value];
      const vals = {};
      Object.keys(p.values).forEach(function (k) { vals[k] = String(p.values[k]); });
      setValues(vals);
      run();
    });
    if ($('#exBtn')) $('#exBtn').addEventListener('click', function () { setValues(exampleValues(def)); run(); });
    $('#resetBtn').addEventListener('click', function () { setValues(defaults(def)); if ($('#presetSel')) $('#presetSel').value = ''; run(); });
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

  function compute(def, v) {
    const outEl = $('#output');
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
      return;
    }
    const refIds = collectRefIds(def, out);
    const num = function (id) { return refIds.indexOf(id) + 1; };
    const cite = function (r) {
      const list = (Array.isArray(r) ? r : r ? [r] : []).filter(function (id) { return NC.refs[id]; });
      if (!list.length) return '';
      return '<sup class="cite">' + list.map(function (id) { return '<a href="#" data-ref="' + id + '" title="' + esc(NC.refs[id].authors + ' (' + NC.refs[id].year + ')') + '">[' + num(id) + ']</a>'; }).join('') + '</sup>';
    };

    let html = '<section class="panel"><div class="panel-head"><h2>Results</h2><div class="actions no-print">' +
      '<button class="btn" id="copyBtn" type="button">Copy report</button><button class="btn" id="mdBtn" type="button">Download .md</button><button class="btn" id="printBtn" type="button">Print / PDF</button></div></div>';
    if (out.warnings && out.warnings.length) html += '<div class="alert warn"><ul>' + out.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>';
    html += '<div class="results">' + (out.results || []).map(function (r) {
      const isText = typeof r.value === 'string';
      const val = isText ? esc(r.value) : esc(NC.fmt(r.value, r.sig || 4));
      return '<div class="result' + (r.main ? ' main' : '') + (isText ? ' text' : '') + '"><div class="k">' + esc(r.label) + cite(r.ref) + '</div><div class="v">' + val + (r.unit ? '<small>' + esc(r.unit) + '</small>' : '') + '</div></div>';
    }).join('') + '</div>';

    const figs = (out.figures || []).map(function (fg) { return '<figure class="sketch"><figcaption>' + esc(fg.title || '') + '</figcaption>' + fg.svg + '</figure>'; })
      .concat((out.plots || []).map(function (p) { return '<figure><figcaption>' + esc(p.title || '') + '</figcaption>' + NC.plot(p) + '</figure>'; }));
    if (figs.length) html += '<div class="plots" style="margin-top:16px">' + figs.join('') + '</div>';
    (out.tables || []).forEach(function (t) {
      html += '<h3>' + esc(t.title) + '</h3><div class="table-wrap"><table class="data"><thead><tr>' + t.columns.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') +
        '</tr></thead><tbody>' + t.rows.map(function (row) { return '<tr>' + row.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
    });
    html += '</section>';

    html += '<section class="panel"><h2>Step-by-step solution</h2><ol class="steps">' + (out.steps || []).map(function (s) {
      if (s.kind === 'heading') return '<li class="heading">' + esc(s.title) + '</li>';
      const box = function (cls, plain, tex) {
        if (!plain && !tex) return '';
        const r = NC.renderMath(plain || '', tex);
        return '<div class="' + cls + (r.tex ? ' tex' : '') + '">' + r.html + '</div>';
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
    const md = function () { return markdownReport(def, v, out, refIds); };
    $('#copyBtn').addEventListener('click', function () {
      const text = md();
      const done = function () { toast('Report copied to clipboard'); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      else { fallbackCopy(text); done(); }
    });
    $('#mdBtn').addEventListener('click', function () { download('nanocalc-' + def.id + '.md', md(), 'text/markdown'); });
    $('#printBtn').addEventListener('click', function () { window.print(); });
  }

  /* ---------------- export ---------------- */
  function markdownReport(def, v, out, refIds) {
    const num = function (id) { return refIds.indexOf(id) + 1; };
    const cite = function (r) {
      const list = (Array.isArray(r) ? r : r ? [r] : []).filter(function (id) { return NC.refs[id]; });
      return list.length ? ' [' + list.map(num).join(', ') + ']' : '';
    };
    const L = [];
    L.push('# ' + def.title, '', '_Generated by NanoCalc on ' + new Date().toISOString().slice(0, 10) + '_', '');
    L.push('## Inputs', '', '| Parameter | Value |', '|---|---|');
    def.inputs.forEach(function (inp) {
      if (inp.showIf && !inp.showIf(v)) return;
      let val = v[inp.id];
      if (inp.type === 'select') { const o = inp.options.find(function (o) { return String(o[0]) === String(val); }); val = o ? o[1] : val; }
      if (inp.type === 'textarea') { L.push('| ' + inp.label + ' | (data, see below) |'); return; }
      L.push('| ' + inp.label + (inp.unit ? ' (' + inp.unit + ')' : '') + ' | ' + (typeof val === 'number' && isNaN(val) ? '—' : val) + ' |');
    });
    def.inputs.filter(function (i) { return i.type === 'textarea' && !(i.showIf && !i.showIf(v)); }).forEach(function (inp) {
      L.push('', '**' + inp.label + '**', '', '```', String(v[inp.id]).trim(), '```');
    });
    L.push('', '## Results', '');
    (out.results || []).forEach(function (r) {
      L.push('- **' + r.label + ':** ' + (typeof r.value === 'string' ? r.value : NC.fmt(r.value, r.sig || 4)) + (r.unit ? ' ' + r.unit : '') + cite(r.ref));
    });
    (out.warnings || []).forEach(function (w) { L.push('', '> ⚠ ' + w); });
    (out.tables || []).forEach(function (t) {
      L.push('', '### ' + t.title, '', '| ' + t.columns.join(' | ') + ' |', '|' + t.columns.map(function () { return '---'; }).join('|') + '|');
      t.rows.forEach(function (r) { L.push('| ' + r.join(' | ') + ' |'); });
    });
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
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1800);
  }

  buildNav('');
  window.addEventListener('hashchange', route);
  route();
})();
