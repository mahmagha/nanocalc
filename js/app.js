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
  // Structure comes from js/catalog.js: NC.sections → NC.categories (technique groups) → calculators.
  const REPO = 'https://github.com/mahmagha/nanocalc';
  const NAV_OPEN_KEY = 'nc:nav-open';
  function calcsIn(cat) { return NC.calculators.filter(function (c) { return c.category === cat; }); }
  function groupsIn(sec) { return NC.categories.filter(function (g) { return g.section === sec; }); }
  function catOf(def) { return NC.categories.find(function (g) { return g.id === def.category; }) || { id: '', label: '', section: '' }; }
  function secOf(def) { return NC.sectionOf ? NC.sectionOf(def.category) : null; }
  function haystack(c) {
    const g = catOf(c);
    return (c.title + ' ' + (c.short || '') + ' ' + c.description + ' ' + c.id + ' ' + g.label + ' ' + (g.aliases || '')).toLowerCase();
  }
  /** Every word of the query must appear (in title, description, technique name or aliases). */
  function matches(c, q) { return q.split(/\s+/).filter(Boolean).every(function (w) { return haystack(c).indexOf(w) >= 0; }); }
  function calcCard(c) { return '<a class="card" href="#/calc/' + c.id + '"><b>' + esc(c.title) + '</b><span>' + esc(c.short || '') + '</span></a>'; }

  function buildNav(query) {
    const q = (query || '').trim().toLowerCase();
    const h = parseHash().parts;
    const cur = h[0] === 'calc' ? NC.byId[h[1]] : null;
    const curSec = cur ? (secOf(cur) || {}).id : h[0] === 'section' ? h[1] : h[0] === 'design' ? 'design' : h[0] === 'synthesis' ? 'synthesis' : null;
    const openSet = store.get(NAV_OPEN_KEY) || {};
    let html = '<div class="nav-top"><a href="#/" data-nav="home">Home</a><a href="#/reading" data-nav="reading">Further reading</a><a href="#/references" data-nav="references">References</a><a href="#/about" data-nav="about">About &amp; validation</a></div>';
    let any = false;
    NC.sections.forEach(function (sec) {
      let inner = '', count = 0;
      const pages = (sec.pages || []).filter(function (pg) { return !q || (pg.label + ' ' + pg.blurb).toLowerCase().indexOf(q) >= 0; });
      if (pages.length) {
        count += pages.length;
        inner += '<div class="nav-group nav-pages">' + pages.map(function (pg) { return '<a href="' + pg.href + '" data-nav="' + pg.key + '" class="nav-page">' + esc(pg.label) + '</a>'; }).join('') + '</div>';
      }
      groupsIn(sec.id).forEach(function (g) {
        const list = calcsIn(g.id).filter(function (c) { return !q || matches(c, q); });
        if (!list.length) return;
        count += list.length;
        inner += '<div class="nav-group"><h4>' + esc(g.label) + '</h4>' +
          list.map(function (c) { return '<a href="#/calc/' + c.id + '" data-nav="' + c.id + '">' + esc(c.title) + '</a>'; }).join('') + '</div>';
      });
      if (!count) return;
      any = true;
      const open = !!q || curSec === sec.id || openSet[sec.id];
      html += '<details class="nav-sec" data-sec="' + sec.id + '"' + (open ? ' open' : '') + '><summary><span>' + esc(sec.label) + '</span><span class="count">' + count + '</span></summary>' +
        (q ? '' : '<a class="nav-overview" href="#/section/' + sec.id + '" data-nav="section:' + sec.id + '">Overview of ' + esc(sec.label.toLowerCase()) + '</a>') + inner + '</details>';
    });
    if (!any) html += '<p class="nav-empty">No calculators match “' + esc(query) + '”. Try a technique (XRD, DLS, BET) or a quantity (band gap, zeta).</p>';
    $('#sidebar').innerHTML = html;
    if (!q) {
      document.querySelectorAll('.nav-sec').forEach(function (d) {
        d.querySelector('summary').addEventListener('click', function () {
          // the click happens before the toggle: store the state it is about to have
          const s = store.get(NAV_OPEN_KEY) || {};
          s[d.getAttribute('data-sec')] = !d.open;
          store.set(NAV_OPEN_KEY, s);
        });
      });
    }
    markActive();
  }
  function markActive() {
    const key = currentKey();
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      const on = a.getAttribute('data-nav') === key;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function currentKey() {
    const h = parseHash().parts;
    if (h[0] === 'calc') return h[1];
    if (h[0] === 'section') return 'section:' + h[1];
    if (h[0] === 'references' || h[0] === 'about' || h[0] === 'reading' || h[0] === 'design' || h[0] === 'synthesis') return h[0];
    return 'home';
  }
  function setNav(open) {
    document.body.classList.toggle('nav-open', open);
    $('#menuBtn').setAttribute('aria-expanded', String(open));
  }
  $('#menuBtn').addEventListener('click', function () {
    const open = !document.body.classList.contains('nav-open');
    setNav(open);
    if (open) { const first = $('#sidebar').querySelector('a, button, input, summary'); if (first) setTimeout(function () { first.focus(); }, 0); }
  });
  // The app routes on the URL hash, so the skip link moves focus itself instead of changing the hash.
  $('.skip-link').addEventListener('click', function (e) { e.preventDefault(); main.focus(); main.scrollIntoView(); });
  $('#scrim').addEventListener('click', function () { setNav(false); });
  // Escape closes the mobile navigation and returns focus to the menu button.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('nav-open')) { setNav(false); $('#menuBtn').focus(); }
  });
  $('#search').addEventListener('input', function (e) { buildNav(e.target.value); });
  $('#search').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      const first = $('#sidebar .nav-group a');
      if (first) location.hash = first.getAttribute('href');
    }
  });

  let routed = false;
  function route() {
    main.classList.remove('wide');
    if (designer && designer.destroy) { designer.destroy(); designer = null; }
    setNav(false);
    const h = parseHash();
    const p = h.parts;
    mcToken++; // cancel any running propagation
    let scrollTarget = null;
    if (p[0] === 'calc' && NC.byId[p[1]]) renderCalc(NC.byId[p[1]], h.state ? NC.decodeState(h.state) : null);
    else if (p[0] === 'section' && NC.sections.some(function (s) { return s.id === p[1]; })) scrollTarget = renderSection(p[1], p[2]);
    else if (p[0] === 'references') renderReferences();
    else if (p[0] === 'about') renderAbout();
    else if (p[0] === 'reading') scrollTarget = renderReading(p[1]);
    else if (p[0] === 'design') renderDesigner(h.state ? decodeDesign(h.state) : null);
    else if (p[0] === 'synthesis') renderSynthesis(p[1] ? decodeURIComponent(p[1]) : null);
    else if (p[0] === '' || p[0] === undefined) renderHome();
    else renderNotFound(p.join('/'));
    buildNav($('#search').value);
    if (scrollTarget) scrollTarget.scrollIntoView(); else window.scrollTo(0, 0);
    // Move focus to the new page for screen readers, but not on first load, so Tab starts at the skip link.
    if (routed) main.focus({ preventScroll: true });
    routed = true;
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
  function footer() {
    return '<footer class="site-foot"><span>NanoCalc v' + esc(NC.version) + '</span><span>MIT licence</span>' +
      '<a href="#/about">About &amp; validation</a><a href="' + REPO + '" target="_blank" rel="noopener">Source on GitHub</a>' +
      '<span class="foot-note">Tested and cross-checked against SciPy and miepython; not yet reviewed by a domain expert. Check results against the cited sources before publishing.</span></footer>';
  }

  function renderHome() {
    document.title = 'NanoCalc · nanomaterials calculations, step by step';
    let html = '<section class="hero"><h1>Design, make and characterise nanomaterials</h1>' +
      '<p>Design a particle layer by layer, follow a published synthesis scaled to your batch, and analyse your measurements with ' + NC.calculators.length + ' calculators. Every result shows its working step by step and cites its sources.</p>' +
      '<div class="home-search"><input id="homeSearch" type="search" placeholder="What are you calculating? e.g. crystallite size, band gap, zeta, BET, gold…" aria-label="Search calculators" autocomplete="off"></div>' +
      '<div id="homeResults" aria-live="polite"></div></section>';

    html += '<section class="home-block"><div class="jobs">' + NC.sections.filter(function (s) { return s.id !== 'tools'; }).map(function (s, i) {
      const pg = (s.pages || [])[0];
      const groups = groupsIn(s.id);
      return '<div class="job"><div class="job-num">' + (i + 1) + '</div><h2>' + esc(s.verb) + '</h2><p>' + esc(s.blurb) + '</p>' +
        (pg ? '<a class="btn primary" href="' + pg.href + '">Open the ' + esc(pg.label.toLowerCase()) + '</a>' : '<a class="btn primary" href="#/section/' + s.id + '">Browse ' + groups.length + ' techniques</a>') +
        '<ul>' + groups.slice(0, 6).map(function (g) { return '<li><a href="#/section/' + s.id + '/' + g.id + '">' + esc(g.label) + '</a></li>'; }).join('') + '</ul></div>';
    }).join('') + '</div></section>';

    html += '<section class="home-block"><h2>Common tasks</h2><div class="tasks">' +
      NC.tasks.filter(function (t) { return t.href || NC.byId[t.calc]; }).map(function (t) {
        return '<a class="task" href="' + (t.href || '#/calc/' + t.calc) + '"><b>' + esc(t.text) + '</b><span>' + esc(t.where || catOf(NC.byId[t.calc]).label) + '</span></a>';
      }).join('') + '</div></section>';

    html += '<section class="home-block"><h2>Browse by section</h2><div class="sections">' +
      NC.sections.map(function (s) {
        const groups = groupsIn(s.id);
        const n = groups.reduce(function (k, g) { return k + calcsIn(g.id).length; }, 0);
        return '<div class="sec-card"><a class="sec-title" href="#/section/' + s.id + '"><b>' + esc(s.label) + '</b><span class="count">' + n + '</span></a>' +
          '<p>' + esc(s.blurb) + '</p><ul>' + groups.map(function (g) {
            return '<li><a href="#/section/' + s.id + '/' + g.id + '">' + esc(g.label) + '</a> <span class="muted">' + calcsIn(g.id).length + '</span></li>';
          }).join('') + '</ul></div>';
      }).join('') + '</div></section>';

    const hist = getHistory().filter(function (e) { return NC.byId[e.id]; }).slice(0, 6);
    if (hist.length) {
      html += '<section class="home-block history"><div class="hist-head"><h2>Recent calculations</h2><button class="btn small" id="clearHist" type="button">Clear history</button></div><ul class="hist-list">' +
        hist.map(function (e) {
          return '<li><a href="' + esc(calcLink(e.id, e.raw)) + '"><b>' + esc(e.title) + '</b><span>' + esc(e.headline || '') + '</span></a><time datetime="' + esc(e.date) + '">' + esc(relTime(e.date)) + '</time></li>';
        }).join('') + '</ul></section>';
    }

    html += '<section class="home-block"><div class="pillars">' +
      '<div class="pillar"><b>Transparent</b><span>Each step shows the formula, the substituted values and the intermediate result.</span></div>' +
      '<div class="pillar"><b>Cited</b><span>Inline citation numbers link to the full reference list, with DOIs where they exist.</span></div>' +
      '<div class="pillar"><b>With uncertainties</b><span>Add ± to any input to propagate it (Monte Carlo, GUM Supplement 1). Export to Markdown or PDF; share runs as links.</span></div></div></section>';
    main.innerHTML = html + footer();

    const hs = $('#homeSearch'), out = $('#homeResults');
    hs.addEventListener('input', function () {
      const q = hs.value.trim().toLowerCase();
      if (!q) { out.innerHTML = ''; return; }
      const hits = NC.calculators.filter(function (c) { return matches(c, q); });
      out.innerHTML = hits.length
        ? '<p class="muted">' + hits.length + ' match' + (hits.length > 1 ? 'es' : '') + '</p><div class="cards">' + hits.slice(0, 12).map(calcCard).join('') + '</div>'
        : '<p class="muted">No calculator matches “' + esc(hs.value) + '”. Try a technique (XRD, DLS, BET, TEM) or a quantity (band gap, zeta, surface area).</p>';
    });
    hs.addEventListener('keydown', function (e) {
      const first = out.querySelector('.card');
      if (e.key === 'Enter' && first) location.hash = first.getAttribute('href');
    });
    if ($('#clearHist')) $('#clearHist').addEventListener('click', function () { store.del(HISTORY_KEY); renderHome(); });
  }

  /* ---------------- section pages ---------------- */
  function renderSection(secId, groupId) {
    const s = NC.sections.find(function (x) { return x.id === secId; });
    const groups = groupsIn(secId);
    document.title = s.label + ' · NanoCalc';
    let html = '<header class="calc-head"><nav class="crumb" aria-label="Breadcrumb"><a href="#/">Home</a></nav><h1>' + esc(s.label) + '</h1><p class="lede">' + esc(s.blurb) + '</p>' +
      (groups.length > 1 ? '<div class="chips">' + groups.map(function (g) { return '<a class="chip" href="#/section/' + secId + '/' + g.id + '">' + esc(g.label) + '</a>'; }).join('') + '</div>' : '') + '</header>';
    (s.pages || []).forEach(function (pg) {
      html += '<a class="feature" href="' + pg.href + '"><b>' + esc(pg.label) + '</b><span>' + esc(pg.blurb) + '</span><span class="go">Open →</span></a>';
    });
    groups.forEach(function (g) {
      html += '<section class="cat-block" id="g-' + g.id + '"><h2>' + esc(g.label) + '</h2><p>' + esc(g.blurb) + '</p><div class="cards">' + calcsIn(g.id).map(calcCard).join('') + '</div></section>';
    });
    main.innerHTML = html + footer();
    return groupId ? document.getElementById('g-' + groupId) : null;
  }

  /* ---------------- designer & synthesis workspaces ---------------- */
  function crumbs(secId) {
    const s = NC.sections.find(function (x) { return x.id === secId; });
    return '<nav class="crumb" aria-label="Breadcrumb"><a href="#/">Home</a><span aria-hidden="true">›</span><a href="#/section/' + secId + '">' + esc(s.label) + '</a></nav>';
  }
  let designer = null;
  function decodeDesign(str) {
    try { const d = JSON.parse(decodeURIComponent(str)); return d && typeof d === 'object' && d.core ? d : null; } catch (e) { return null; }
  }
  function renderDesigner(urlState) {
    document.title = 'Particle designer · NanoCalc';
    main.classList.add('wide');
    main.innerHTML = '<header class="calc-head">' + crumbs('design') + '<h1>Particle designer</h1>' +
      '<p class="lede">Build a spherical particle layer by layer: a core, any number of shells and a ligand shell. Every output updates as you drag, shows its working and cites its sources, and the build plan links to the synthesis protocols.</p></header>' +
      '<div id="designer"></div>' + footer();
    const el = $('#designer');
    if (!NC.designerView) { el.innerHTML = '<p class="alert err">The designer did not load.</p>'; return; }
    designer = NC.designerView.render(el, {
      state: urlState,
      heading: false,
      onChange: function (state) {
        // the design is nested JSON, so it is stored whole (calculator links use the flat NC.encodeState)
        try { history.replaceState(null, '', location.href.split('#')[0] + '#/design?state=' + encodeURIComponent(JSON.stringify(state))); } catch (e) { /* ignore */ }
      }
    });
  }
  function renderSynthesis(id) {
    const p = id && NC.protocolById ? NC.protocolById[id] : null;
    document.title = (p ? p.title : 'Synthesis protocols') + ' · NanoCalc';
    main.innerHTML = '<header class="calc-head">' + crumbs('synthesis') + (p ? '' : '<h1>Synthesis protocols</h1><p class="lede">Published procedures for nanoparticle cores, shells and surface chemistry, transcribed from the original papers and scaled to your batch. Check each one against its source and do a risk assessment before lab work.</p>') + '</header>' +
      '<div id="protocols"></div>' + footer();
    const el = $('#protocols');
    if (!NC.protocolsView) { el.innerHTML = '<p class="alert err">The protocol library did not load.</p>'; return; }
    if (id && !p) { el.innerHTML = '<p class="alert warn">No protocol called “' + esc(id) + '”. <a href="#/synthesis">See all protocols</a>.</p>'; return; }
    if (p) NC.protocolsView.renderProtocol(el, id, {});
    else NC.protocolsView.renderIndex(el);
  }

  /* ---------------- about ---------------- */
  function renderAbout() {
    document.title = 'About & validation · NanoCalc';
    const doc = function (file, text) { return '<a href="' + REPO + '/blob/main/' + file + '" target="_blank" rel="noopener">' + text + '</a>'; };
    main.innerHTML = '<header class="calc-head"><nav class="crumb" aria-label="Breadcrumb"><a href="#/">Home</a></nav><h1>About &amp; validation</h1>' +
      '<p class="lede">What NanoCalc is, how its results are checked, and how to report a problem.</p></header>' +
      '<section class="panel prose"><h2>What it is</h2><p>NanoCalc is a free, open-source web app with ' + NC.calculators.length + ' calculators for nanomaterials work, citing ' + Object.keys(NC.refs).length + ' sources. ' +
      'Each calculation shows its working step by step, with every equation, constant and empirical coefficient cited. It runs entirely in your browser: nothing you enter is sent anywhere. Once loaded it works offline and can be installed as an app.</p></section>' +
      '<section class="panel prose"><h2>How results are checked</h2><ul>' +
      '<li><b>About 2,800 automated checks</b> compare every calculator with values worked out by hand, from textbooks, or from synthetic data with a known answer. Every formula is also tested to make sure it typesets.</li>' +
      '<li><b>Cross-validation against established software:</b> Mie theory against miepython; quadrature, smoothing, curve fitting, regression, statistics and constants against SciPy and NumPy. Agreement is to 10⁻⁶ or better. ' + doc('docs/VALIDATION.md', 'Validation report') + '.</li>' +
      '<li><b>Not yet reviewed by a domain expert.</b> A sign-off checklist of every formula, value and reference is ready (' + doc('docs/REVIEW.md', 'REVIEW.md') + ', ' + doc('docs/EXPERT-REVIEW-GUIDE.md', 'reviewer guide') + '). Until it is signed off, check important results against the cited sources.</li></ul></section>' +
      '<section class="panel prose"><h2>Data policy</h2><p>Literature data is built in only when its source is certain, for example CODATA constants, CRC densities and IUPAC atomic weights; see the <a href="#/calc/materials">material database</a>. ' +
      'Values that vary between instruments or sources are inputs you supply: optical constants, XPS and EDX sensitivity factors, Hamaker constants, lipid areas. These come with labelled typical defaults.</p></section>' +
      '<section class="panel prose"><h2>Using the app</h2><ul>' +
      '<li><b>Units:</b> type them with the number, e.g. <code>5 Å</code>, <code>0.2 µm</code> or <code>25 °C</code>.</li>' +
      '<li><b>Uncertainties:</b> press <b>± Uncertainties</b> on a calculator to give inputs a standard uncertainty. It is propagated by Monte Carlo (JCGM 101).</li>' +
      '<li><b>Share and save:</b> <b>Copy link</b> shares a calculation with its inputs; <b>Saved runs</b> keeps named runs in this browser.</li>' +
      '<li><b>Further reading:</b> a curated, verified library of key works by topic, on the <a href="#/reading">further reading</a> page.</li>' +
      '<li><b>Export:</b> a Markdown report (with LaTeX), print to PDF, or BibTeX from the <a href="#/references">references</a> page.</li></ul></section>' +
      '<section class="panel prose"><h2>Report a problem</h2><p>Found an error in a formula, value or reference? Please ' +
      '<a href="' + REPO + '/issues/new?template=review-finding.md" target="_blank" rel="noopener">open a scientific review finding</a>. For app bugs, ' +
      '<a href="' + REPO + '/issues/new?template=bug-report.md" target="_blank" rel="noopener">report a bug</a> and use <b>Copy link</b> to include your inputs.</p></section>' +
      '<section class="panel prose"><h2>Version &amp; licence</h2><p>NanoCalc v' + esc(NC.version) + ' (' + doc('CHANGELOG.md', 'changelog') + '). MIT licence; source on <a href="' + REPO + '" target="_blank" rel="noopener">GitHub</a>. ' +
      'Equations are typeset with KaTeX (MIT), bundled for offline use.</p></section>' + footer();
  }

  /* ---------------- further reading (js/library.js) ---------------- */
  function renderReading(topicId) {
    document.title = 'Further reading · NanoCalc';
    const lib = NC.library || [], topics = NC.libraryTopics || [];
    const usedIn = {};
    NC.calculators.forEach(function (c) { (c.refs || []).forEach(function (id) { (usedIn[id] = usedIn[id] || []).push(c); }); });
    const KIND = { review: 'Review', book: 'Book', primary: 'Primary source', standard: 'Standard', data: 'Data & software' };
    let html = '<header class="calc-head"><nav class="crumb" aria-label="Breadcrumb"><a href="#/">Home</a></nav><h1>Further reading</h1>' +
      '<p class="lede">A curated library of ' + lib.length + ' key works on nanomaterials, each with a note on what it is good for. ' +
      'Every article and book was verified against Crossref or Open Library, and every standard was checked against the issuing body for its current edition. ' +
      'The <a href="' + REPO + '/blob/main/docs/REFERENCE-TREATISE.md" target="_blank" rel="noopener">full treatise</a> also lists every work the calculators cite, with its verification status.</p>' +
      '<div class="chips">' + topics.map(function (t) { return '<a class="chip" href="#/reading/' + t.id + '">' + esc(t.label) + '</a>'; }).join('') + '</div></header>' +
      '<section class="panel"><div class="panel-head"><h2 id="libCount">' + lib.length + ' works</h2><div class="actions">' +
      '<input id="libFilter" class="filter" type="search" placeholder="Filter: author, title, technique, year…" aria-label="Filter the library">' +
      '<button class="btn" id="libBib" type="button">Download BibTeX</button></div></div>';
    topics.forEach(function (t) {
      const items = lib.filter(function (e) { return e.topic === t.id; });
      if (!items.length) return;
      html += '<section class="lib-topic cat-block" id="g-' + t.id + '"><h3>' + esc(t.label) + '</h3><p class="muted">' + esc(t.blurb) + '</p><ol class="refs lib-list">' +
        items.map(function (e) {
          const r = e.ref ? NC.refs[e.ref] : e;
          if (!r) return '';
          const uses = e.ref && usedIn[e.ref] ? '<span class="used">Used in: ' + usedIn[e.ref].map(function (c) { return '<a href="#/calc/' + c.id + '">' + esc(c.title) + '</a>'; }).join(', ') + '</span>' : '';
          return '<li><span class="kind kind-' + e.kind + '">' + esc(KIND[e.kind] || e.kind) + '</span> ' + NC.formatRef(r) + '<span class="use">' + esc(e.use) + '</span>' + uses + '</li>';
        }).join('') + '</ol></section>';
    });
    main.innerHTML = html + '</section>' + footer();
    $('#libFilter').addEventListener('input', function (ev) {
      const words = ev.target.value.toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      document.querySelectorAll('.lib-topic').forEach(function (sec) {
        let any = false;
        sec.querySelectorAll('.lib-list > li').forEach(function (li) {
          const hay = (li.textContent + ' ' + sec.querySelector('h3').textContent).toLowerCase();
          const hit = words.every(function (w) { return hay.indexOf(w) >= 0; });
          li.hidden = !hit;
          if (hit) { shown++; any = true; }
        });
        sec.hidden = !any;
      });
      $('#libCount').textContent = words.length ? shown + ' of ' + lib.length + ' works' : lib.length + ' works';
    });
    $('#libBib').addEventListener('click', function () {
      const refs = lib.map(function (e) { return e.ref ? NC.refs[e.ref] : e; }).filter(Boolean);
      download('nanocalc-further-reading.bib', refs.map(function (r) { return NC.toBibTeX(r); }).join('\n\n') + '\n', 'application/x-bibtex');
    });
    return topicId ? document.getElementById('g-' + topicId) : null;
  }

  function renderNotFound(path) {
    document.title = 'Not found · NanoCalc';
    main.innerHTML = '<header class="calc-head"><nav class="crumb" aria-label="Breadcrumb"><a href="#/">Home</a></nav><h1>Page not found</h1>' +
      '<p class="lede">There is no page at “' + esc(path) + '”. The calculator may have been renamed. Search for it in the sidebar, or go to the <a href="#/">home page</a>.</p></header>' + footer();
  }

  /* ---------------- references page ---------------- */
  function renderReferences() {
    document.title = 'References · NanoCalc';
    const used = {};
    NC.calculators.forEach(function (c) {
      collectRefIds(c, null).forEach(function (id) { (used[id] = used[id] || []).push(c); });
    });
    const ids = Object.keys(NC.refs).sort(function (a, b) { return NC.refs[a].authors.localeCompare(NC.refs[b].authors); });
    main.innerHTML = '<header class="calc-head"><nav class="crumb" aria-label="Breadcrumb"><a href="#/">Home</a></nav><h1>References</h1>' +
      '<p class="lede">Every source the calculators cite, with the calculators that use it.</p></header>' +
      '<section class="panel"><div class="panel-head"><h2 id="refCount">' + ids.length + ' sources</h2><div class="actions">' +
      '<input id="refFilter" class="filter" type="search" placeholder="Filter by author, title, year, calculator…" aria-label="Filter references">' +
      '<button class="btn" id="bibBtn">Download BibTeX</button></div></div>' +
      '<ol class="refs refs-all">' + ids.map(function (id) {
        const u = used[id] || [];
        return '<li>' + NC.formatRef(NC.refs[id]) + (u.length ? '<span class="used">Used in: ' + u.map(function (c) { return '<a href="#/calc/' + c.id + '">' + esc(c.title) + '</a>'; }).join(', ') + '</span>' : '') + '</li>';
      }).join('') + '</ol><p class="disclaimer">Citations are given so you can trace every number. Check the original publications before using a result in your own work.</p></section>' + footer();
    $('#refFilter').addEventListener('input', function (e) {
      const words = e.target.value.toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      document.querySelectorAll('.refs-all > li').forEach(function (li) {
        const hit = words.every(function (w) { return li.textContent.toLowerCase().indexOf(w) >= 0; });
        li.hidden = !hit;
        if (hit) shown++;
      });
      $('#refCount').textContent = words.length ? shown + ' of ' + ids.length + ' sources' : ids.length + ' sources';
    });
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

  /* ---------------- sliders ---------------- */
  // Range for a number field: the input's own { range: [lo, hi], log, integer } when given, otherwise a
  // range around its current value (a decade either side, on a log scale). No slider for zero or negative
  // values without an explicit range, or when the input says slider: false.
  function sliderSpec(inp, val) {
    if (inp.slider === false) return null;
    const x = Number(val);
    let lo, hi, log;
    if (inp.range) { lo = inp.range[0]; hi = inp.range[1]; log = inp.log !== undefined ? !!inp.log : lo > 0 && hi / lo >= 100; }
    else if (inp.unit === '°') { lo = 0; hi = isFinite(x) && x > 90 ? 180 : 90; log = false; }
    else if (!(isFinite(x) && x > 0)) return null;
    else if (inp.unit === '' && x < 1 && /p\/p|fraction|ratio|coverage|probability/i.test(inp.label)) { lo = 0; hi = 1; log = false; }
    else { lo = x / 10; hi = x * 10; log = true; }
    if (isFinite(x) && (x < lo || x > hi)) {
      if (log && x > 0) { lo = Math.min(lo, x / 3); hi = Math.max(hi, x * 3); } else { lo = Math.min(lo, x); hi = Math.max(hi, x); }
    }
    return { lo: lo, hi: hi, log: log, int: !!inp.integer };
  }
  function sliderPos(sl, x) {
    if (!isFinite(x)) return 500;
    const t = sl.log ? Math.log(x / sl.lo) / Math.log(sl.hi / sl.lo) : (x - sl.lo) / (sl.hi - sl.lo || 1);
    return Math.round(1000 * Math.min(1, Math.max(0, t)));
  }
  function sliderValue(el) {
    const lo = +el.getAttribute('data-lo'), hi = +el.getAttribute('data-hi'), t = +el.value / 1000;
    const x = el.getAttribute('data-log') === '1' ? lo * Math.pow(hi / lo, t) : lo + t * (hi - lo);
    if (el.getAttribute('data-int')) return String(Math.round(x));
    if (Math.abs(x) < 1e-12) return '0';
    return String(Number(x.toPrecision(3)));
  }
  NC.sliderUtil = { spec: sliderSpec, pos: sliderPos };

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
      const sl = sliderSpec(inp, val);
      if (sl) {
        control += '<input type="range" class="slider" min="0" max="1000" step="1" value="' + sliderPos(sl, Number(val)) + '" data-for="' + inp.id + '"' +
          ' data-lo="' + sl.lo + '" data-hi="' + sl.hi + '" data-log="' + (sl.log ? 1 : 0) + '"' + (sl.int ? ' data-int="1"' : '') +
          ' aria-label="' + esc(inp.label) + ' slider" aria-valuetext="' + esc(val + (inp.unit ? ' ' + inp.unit : '')) + '">' +
          '<div class="slider-ends" aria-hidden="true"><span>' + esc(NC.fmt(sl.lo, 3)) + '</span><span>' + esc(NC.fmt(sl.hi, 3)) + '</span></div>';
      }
      extra = '<div class="field-msg" hidden></div>';
    }
    const help = inp.help ? '<div class="help">' + esc(inp.help) + '</div>' : '';
    return '<div class="field' + (inp.type === 'textarea' || inp.wide || inp.full ? ' wide' : '') + '" data-field="' + inp.id + '">' + label + control + extra + help + '</div>';
  }

  function renderCalc(def, urlState) {
    document.title = def.title + ' · NanoCalc';
    main.classList.add('wide');
    const cat = catOf(def);
    const sec = secOf(def) || { id: '', label: '' };
    const siblings = calcsIn(cat.id);
    const idx = siblings.indexOf(def);
    const prev = siblings[idx - 1], next = siblings[idx + 1];
    const related = siblings.length > 1
      ? '<nav class="related" aria-label="More in ' + esc(cat.label) + '"><h2>More in ' + esc(cat.label) + '</h2><div class="cards">' +
        siblings.filter(function (c) { return c !== def; }).map(calcCard).join('') + '</div>' +
        '<div class="pager">' + (prev ? '<a href="#/calc/' + prev.id + '">← ' + esc(prev.title) + '</a>' : '<span></span>') +
        (next ? '<a href="#/calc/' + next.id + '">' + esc(next.title) + ' →</a>' : '') + '</div></nav>'
      : '';
    const raw = Object.assign(defaults(def), urlState || store.get('nc:v:' + def.id) || {});
    const showUnc = hasUnc(raw) || !!store.get('nc:unc-open');
    const presets = def.presets && def.presets.length
      ? '<label class="preset">Preset: <select id="presetSel"><option value="">— choose —</option>' +
        def.presets.map(function (p, i) { return '<option value="' + i + '">' + esc(p.label) + '</option>'; }).join('') + '</select></label>'
      : '';
    main.innerHTML =
      '<header class="calc-head"><nav class="crumb" aria-label="Breadcrumb"><a href="#/">Home</a><span aria-hidden="true">›</span>' +
      '<a href="#/section/' + sec.id + '">' + esc(sec.label) + '</a><span aria-hidden="true">›</span>' +
      '<a href="#/section/' + sec.id + '/' + cat.id + '">' + esc(cat.label) + '</a></nav>' +
      '<h1>' + esc(def.title) + '</h1><p class="lede">' + esc(def.description) + '</p></header>' +
      '<div class="workspace"><section class="panel ws-inputs"><div class="panel-head"><h2>Inputs</h2><div class="actions">' + presets +
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
      '<div class="ws-out"><div id="calcError" hidden></div><div id="output" aria-live="polite"></div></div></div>' +
      '<div id="detail"></div>' + related + footer();

    const form = $('#form');
    const setValues = function (vals, clearUnc) {
      def.inputs.forEach(function (inp) {
        const el = form.elements[inp.id];
        if (el && vals[inp.id] !== undefined) { el.value = vals[inp.id]; if (inp.type === 'number') syncSlider(inp.id); }
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
    const run = function (live) {
      live = live === true;
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
        showError('<b>Check the inputs.</b><ul>' + errs.map(function (id) {
          const inp = def.inputs.find(function (i) { return i.id === id; });
          return '<li>' + esc(inp.label) + ': ' + esc(P.errors[id]) + '</li>';
        }).join('') + '</ul>');
        return;
      }
      const out = compute(def, P.v, unc, r, live);
      if (out && !live) recordHistory(def, r, out);
    };
    // Sliders move the number field and recalculate live (results and plots) once per animation frame;
    // steps, tables and the uncertainty follow when the slider stops.
    let frame = 0;
    function syncSlider(name) {
      const sl = form.querySelector('input.slider[data-for="' + name + '"]');
      if (!sl) return;
      const inp = def.inputs.find(function (i) { return i.id === name; }) || {};
      const p = NC.parseUnitDetailed ? NC.parseUnitDetailed(form.elements[name].value, inp.unit) : { value: Number(form.elements[name].value) };
      if (isFinite(p.value)) sl.value = sliderPos({ lo: +sl.getAttribute('data-lo'), hi: +sl.getAttribute('data-hi'), log: sl.getAttribute('data-log') === '1' }, p.value);
      sl.setAttribute('aria-valuetext', form.elements[name].value + (inp.unit ? ' ' + inp.unit : ''));
    }
    form.addEventListener('input', function (e) {
      const t = e.target;
      if (t.classList.contains('slider')) {
        const name = t.getAttribute('data-for');
        const inp = def.inputs.find(function (i) { return i.id === name; }) || {};
        form.elements[name].value = sliderValue(t);
        t.setAttribute('aria-valuetext', form.elements[name].value + (inp.unit ? ' ' + inp.unit : ''));
        clearTimeout(timer);
        if (!frame) frame = requestAnimationFrame(function () { frame = 0; run(true); });
        timer = setTimeout(run, 450);
        return;
      }
      if (t.name && form.elements[t.name] === t && !t.classList.contains('unc')) syncSlider(t.name);
      clearTimeout(timer); timer = setTimeout(run, 180);
    });
    form.addEventListener('change', function (e) {
      if (e.target.classList.contains('slider')) { clearTimeout(timer); if (frame) { cancelAnimationFrame(frame); frame = 0; } }
      run();
    });
    $('#output').addEventListener('click', function (e) {
      const id = e.target && e.target.id;
      if (!lastReport) return;
      if (id === 'copyBtn') copyText(lastReport(), 'Report copied to clipboard');
      else if (id === 'mdBtn') download('nanocalc-' + def.id + '.md', lastReport(), 'text/markdown');
      else if (id === 'printBtn') window.print();
    });
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

  function collectRefIds(refs, out) {
    const ids = [];
    const add = function (r) {
      (Array.isArray(r) ? r : r ? [r] : []).forEach(function (id) { if (NC.refs[id] && ids.indexOf(id) < 0) ids.push(id); });
    };
    if (out) {
      (out.steps || []).forEach(function (s) { add(s.ref); });
      (out.results || []).forEach(function (r) { add(r.ref); });
      add(out.refs);
    }
    add(refs);
    return ids;
  }

  function stepsHTML(steps, cite) {
    return '<ol class="steps">' + (steps || []).map(function (s) {
      if (s.kind === 'heading') return '<li class="heading">' + esc(s.title) + '</li>';
      const box = function (cls, plain, tex) {
        if (!plain && !tex) return '';
        const r = NC.renderMath(plain || '', tex);
        return '<div class="' + cls + (r.tex ? ' tex' : '') + (r.prose ? ' prose' : '') + '">' + r.html + '</div>';
      };
      return '<li class="step"><div class="step-title">' + esc(s.title) + cite(s.ref) + '</div>' +
        box('formula', s.formula, s.tex) + box('sub', s.sub, s.subTex) + box('res', s.result, s.resultTex) +
        (s.note ? '<div class="note">' + esc(s.note) + '</div>' : '') + '</li>';
    }).join('') + '</ol>';
  }

  /* Collapsible section whose open/closed state is remembered per kind. */
  function foldHTML(kind, title, body, openByDefault, extraAttrs) {
    const saved = store.get('nc:fold:' + kind);
    const open = saved === null || saved === undefined ? openByDefault : !!saved;
    return '<details class="panel fold" data-fold="' + kind + '"' + (open ? ' open' : '') + (extraAttrs || '') + '><summary><h2>' + title + '</h2></summary>' + body + '</details>';
  }

  /**
   * Render a calculation output (results, plots, tables, steps, notes, references) into el.
   * ctx: { refs: [ids], detailEl: element for the slow part (default: inside el), live: true to update only
   *        results and plots (fast, for slider drags), unc: true to show uncertainty placeholders,
   *        actions: html for the results header, report: true }
   * Plots become interactive with NC.plotMount when it is available, and keep their zoom across updates.
   * Returns { refIds, cite } for the caller.
   */
  function renderOutput(el, out, ctx) {
    ctx = ctx || {};
    let st = el.__nc;
    if (!st) {
      st = el.__nc = { ctrls: [], sig: null };
      el.innerHTML = '<div class="out-live"></div>' + (ctx.detailEl ? '' : '<div class="out-detail"></div>');
    }
    const liveEl = el.querySelector('.out-live');
    const detailEl = ctx.detailEl || el.querySelector('.out-detail');
    const refIds = collectRefIds(ctx.refs, out);
    if (ctx.unc) ['jcgm101', 'jcgm100'].forEach(function (id) { if (NC.refs[id] && refIds.indexOf(id) < 0) refIds.push(id); });
    const num = function (id) { return refIds.indexOf(id) + 1; };
    const cite = function (r) {
      const list = (Array.isArray(r) ? r : r ? [r] : []).filter(function (id) { return NC.refs[id]; });
      if (!list.length) return '';
      return '<sup class="cite">' + list.map(function (id) { return '<a href="#cite-' + id + '" data-ref="' + id + '" title="' + esc(NC.refs[id].authors + ' (' + NC.refs[id].year + ')') + '">[' + num(id) + ']</a>'; }).join('') + '</sup>';
    };

    /* ---- live part: warnings, results, figures and plots ---- */
    if (!st.head) {
      liveEl.innerHTML = '<section class="panel results-panel"><div class="panel-head"><h2>Results</h2><div class="actions no-print">' + (ctx.actions || '') + '</div></div>' +
        '<div class="warn-slot"></div><div class="results"></div></section><div class="plots"></div>';
      st.head = true;
    }
    liveEl.querySelector('.warn-slot').innerHTML = out.warnings && out.warnings.length
      ? '<div class="alert warn"><ul>' + out.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>' : '';
    liveEl.querySelector('.results').innerHTML = (out.results || []).map(function (r, i) {
      const isText = typeof r.value === 'string';
      const val = isText ? esc(r.value) : esc(NC.fmt(r.value, r.sig || 4));
      return '<div class="result' + (r.main ? ' main' : '') + (isText ? ' text' : '') + '" data-ri="' + i + '"><div class="k">' + esc(r.label) + cite(r.ref) + '</div><div class="v">' + val + (r.unit ? '<small>' + esc(r.unit) + '</small>' : '') + '</div>' +
        (ctx.unc && !isText ? '<div class="u pending">±…</div>' : '') + '</div>';
    }).join('');

    const figs = out.figures || [], plots = out.plots || [];
    const sig = figs.map(function (f) { return 'f:' + (f.title || ''); }).concat(plots.map(function (p) { return 'p:' + (p.title || '') + ':' + p.series.length; })).join('|');
    const plotsEl = liveEl.querySelector('.plots');
    const interactive = typeof NC.plotMount === 'function';
    if (sig !== st.sig) {
      st.ctrls.forEach(function (c) { if (c && c.destroy) c.destroy(); });
      st.ctrls = [];
      plotsEl.innerHTML = figs.map(function (fg, i) { return '<figure class="sketch" data-fig="' + i + '"><figcaption>' + esc(fg.title || '') + '</figcaption><div class="fig-body"></div></figure>'; }).join('') +
        plots.map(function (p, i) { return '<figure class="plotfig" data-plot="' + i + '"><figcaption>' + esc(p.title || '') + '</figcaption><div class="plot-host"></div></figure>'; }).join('');
      st.sig = sig;
    }
    figs.forEach(function (fg, i) { plotsEl.querySelector('[data-fig="' + i + '"] .fig-body').innerHTML = fg.svg; });
    plots.forEach(function (p, i) {
      const host = plotsEl.querySelector('[data-plot="' + i + '"] .plot-host');
      if (!interactive) { host.innerHTML = NC.plot(p); return; }
      if (st.ctrls[i]) st.ctrls[i].update(p);
      else st.ctrls[i] = NC.plotMount(host, p, { key: (ctx.key || '') + ':' + i });
    });
    plotsEl.hidden = !(figs.length || plots.length);

    /* ---- detail part: tables, uncertainty, steps, notes, references (skipped while dragging) ---- */
    if (!ctx.live) {
      let html = '';
      if (out.tables && out.tables.length) {
        html += foldHTML('tables', 'Tables', out.tables.map(function (t) {
          return '<h3>' + esc(t.title) + '</h3><div class="table-wrap"><table class="data"><thead><tr>' + t.columns.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') +
            '</tr></thead><tbody>' + t.rows.map(function (row) { return '<tr>' + row.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
        }).join(''), true);
      }
      if (ctx.unc) {
        html += '<section class="panel" id="uncPanel"><h2>Uncertainty' + cite(['jcgm101', 'jcgm100']) + '</h2>' +
          '<p class="unc-status">Propagating input uncertainties…</p><div class="unc-body"></div>' +
          '<p class="note">Method: Monte Carlo propagation of distributions (GUM Supplement 1). Each input with a ± value is sampled as an independent normal distribution with that standard uncertainty; the whole calculation is repeated for every trial. Each result is reported with the standard deviation of its trial values (standard uncertainty) and the 2.5th–97.5th percentile range (95 % coverage interval). Trials whose sampled inputs are outside the model’s valid range are discarded and counted. Correlations between inputs are not modelled. The step-by-step solution below uses the nominal values.</p></section>';
      }
      const nSteps = (out.steps || []).filter(function (s) { return s.kind !== 'heading'; }).length;
      html += foldHTML('steps', 'Step-by-step solution <span class="count">' + nSteps + ' steps</span>', stepsHTML(out.steps, cite), true);
      if (out.notes && out.notes.length) html += foldHTML('notes', 'Assumptions &amp; notes', '<ul class="notes">' + out.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>', true);
      html += foldHTML('refs', 'References <span class="count">' + refIds.length + '</span>', '<ol class="refs">' + refIds.map(function (id) {
        return '<li id="cite-' + id + '">' + NC.formatRef(NC.refs[id]) + '</li>';
      }).join('') + '</ol><p class="disclaimer">Constants: CODATA 2018. Check results against the original sources before publishing them.</p>', true);
      detailEl.innerHTML = html;
      detailEl.querySelectorAll('details.fold').forEach(function (d) {
        d.addEventListener('toggle', function () { store.set('nc:fold:' + d.getAttribute('data-fold'), d.open); });
      });
      st.stale = false;
    } else if (!st.stale) {
      st.stale = true;
      detailEl.classList.add('stale');
    }
    if (!ctx.live) detailEl.classList.remove('stale');
    return { refIds: refIds, cite: cite };
  }
  NC.renderOutput = renderOutput;

  // Printing shows every section, including collapsed ones.
  window.addEventListener('beforeprint', function () { document.querySelectorAll('details.fold').forEach(function (d) { d.open = true; }); });

  /* Citation links anywhere on the page open and highlight the reference (delegated once). */
  document.addEventListener('click', function (e) {
    const a = e.target.closest ? e.target.closest('a[data-ref]') : null;
    if (!a) return;
    e.preventDefault();
    const li = document.getElementById('cite-' + a.getAttribute('data-ref'));
    if (!li) return;
    const d = li.closest('details');
    if (d) d.open = true;
    li.scrollIntoView({ behavior: 'smooth', block: 'center' });
    li.classList.add('flash');
    setTimeout(function () { li.classList.remove('flash'); }, 1600);
  });

  /** Render a calculation into the calculator page; returns the output object, or null on error. */
  function compute(def, v, unc, raw, live) {
    const outEl = $('#output');
    const myToken = ++mcToken;
    let out;
    try {
      out = def.compute(v);
    } catch (e) {
      const msg = e instanceof NC.InputError ? '<b>Check the inputs.</b> ' : '<b>Calculation error.</b> ';
      if (!(e instanceof NC.InputError)) console.error(e);
      showError(msg + esc(e.message));
      return null;
    }
    hideError();
    const withUnc = !live && Object.keys(unc).length > 0;
    const state = { mc: null };
    const r = renderOutput(outEl, out, {
      refs: def.refs, detailEl: $('#detail'), live: live, unc: withUnc, key: def.id,
      actions: '<button class="btn" id="copyBtn" type="button">Copy report</button><button class="btn" id="mdBtn" type="button">Download .md</button><button class="btn" id="printBtn" type="button">Print / PDF</button>'
    });
    lastReport = function () { return markdownReport(def, v, out, r.refIds, unc, state.mc); };
    if (withUnc) runMonteCarlo(def, v, unc, out, myToken, state);
    return out;
  }
  let lastReport = null;
  function showError(html) {
    const box = $('#calcError');
    if (!box) return;
    box.innerHTML = '<div class="alert err" role="alert">' + html + '</div>';
    box.hidden = false;
    const o = $('#output');
    if (o) o.classList.add('stale');
  }
  function hideError() {
    const box = $('#calcError');
    if (box) { box.hidden = true; box.innerHTML = ''; }
    const o = $('#output');
    if (o) o.classList.remove('stale');
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
