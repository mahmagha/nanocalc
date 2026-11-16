/*
 * In-page smoke test of the running app. Injected into the page (Playwright in CI, or pasted into any
 * browser's console) and run with:  await NCSmoke({ calculators: true })
 * Returns { failures: [..], stats: {..} }; an empty failures list is a pass.
 *
 * Checks
 *  - every calculator page loads its example with no error box, no flagged input and sliders inside the input limits
 *  - no horizontal page overflow at the current window width
 *  - site search: accents ignored, short words match whole words, protocols are found
 *  - particle designer computes, protocol pages render steps with checkboxes, projects compare predicted with measured
 * It uses only the page's own code and DOM; it changes localStorage (projects, history) of the page it runs in.
 */
(function () {
  'use strict';
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  async function until(fn, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 3000)) { const v = fn(); if (v) return v; await wait(30); }
    return null;
  }
  const overflow = () => document.documentElement.scrollWidth > window.innerWidth + 1;
  const go = async (hash) => { location.hash = hash; await wait(60); };

  window.NCSmoke = async function (opts) {
    opts = opts || {};
    const NC = window.NC, F = [], S = { calculators: 0, sliders: 0, overflowPages: 0 };
    const fail = (m) => F.push(m);

    /* calculators */
    if (opts.calculators !== false) {
      for (const def of NC.calculators) {
        await go('#/calc/' + def.id);
        // wait for this calculator's page (the previous one may still be finishing a heavy calculation)
        if (!(await until(() => document.title.indexOf(def.title) === 0 && document.querySelector('#form'), 15000))) { fail(def.id + ': page did not render'); continue; }
        const ex = document.querySelector('#exBtn');
        if (ex) ex.click();
        await wait(250);
        S.calculators++;
        const err = document.querySelector('#calcError');
        if (err && !err.hidden) fail(def.id + ': error with its example: ' + err.textContent.trim().slice(0, 140));
        document.querySelectorAll('#form .field.invalid').forEach((w) => { if (!w.hidden) fail(def.id + '.' + w.getAttribute('data-field') + ': example value flagged'); });
        const L = NC.inputLimits(def);
        document.querySelectorAll('#form input.slider').forEach((sl) => {
          S.sliders++;
          const l = L[sl.getAttribute('data-for')];
          if (!l) return;
          [0, 1].forEach((t) => {
            const lo = +sl.getAttribute('data-lo'), hi = +sl.getAttribute('data-hi');
            let x = sl.getAttribute('data-log') === '1' ? lo * Math.pow(hi / lo, t) : lo + t * (hi - lo);
            x = sl.getAttribute('data-int') ? Math.round(x) : Number(x.toPrecision(3));
            const e = NC.limitError(x, '', l);
            if (e) fail(def.id + '.' + sl.getAttribute('data-for') + ': slider end ' + x + ' not allowed (' + e + ')');
          });
        });
        if (overflow()) { S.overflowPages++; fail(def.id + ': page wider than the window (' + document.documentElement.scrollWidth + ' > ' + window.innerWidth + ')'); }
      }
    }

    /* search */
    const titles = (q) => NC.search.query(q).map((r) => r.kind + ':' + r.title);
    if (!titles('stober').some((t) => /^protocol:.*Stöber/.test(t))) fail('search: "stober" does not find the Stöber protocol');
    if (titles('TEM').some((t) => /Melting/.test(t))) fail('search: "TEM" matches "temperature"');
    if (!titles('citrate').some((t) => /^protocol:Citrate-reduced gold/.test(t))) fail('search: "citrate" does not find the citrate gold protocol');
    if (!titles('core shell').some((t) => /^page:Particle designer/.test(t))) fail('search: "core shell" does not find the designer');
    const box = document.querySelector('#search');
    box.focus(); box.value = 'zeta'; box.dispatchEvent(new Event('input', { bubbles: true }));
    if (!(await until(() => document.querySelector('#searchPanel .search-hit')))) fail('search: the results panel does not open');
    box.value = ''; box.dispatchEvent(new Event('input', { bubbles: true })); box.blur();

    /* pages: home, designer, protocols, projects */
    for (const h of ['#/', '#/design', '#/synthesis', '#/synthesis/citrate-gold', '#/projects', '#/reading', '#/references', '#/about']) {
      await go(h);
      await wait(h === '#/design' ? 700 : 250);
      if (document.querySelector('main .alert.err')) fail(h + ': error box: ' + document.querySelector('main .alert.err').textContent.slice(0, 120));
      if (overflow()) { S.overflowPages++; fail(h + ': page wider than the window'); }
    }
    await go('#/design');
    if (!(await until(() => /λ_max/.test((document.querySelector('.dz-live') || {}).textContent || ''), 4000))) fail('designer: no extinction peak in the results');
    await go('#/synthesis/citrate-gold');
    await until(() => document.querySelector('.pv-check input'));
    if (document.querySelectorAll('.pv-check input').length < 3) fail('protocol: steps have no checkboxes');

    /* projects: one design, one measurement, compared */
    const P = NC.projects;
    const p = P.create('Smoke test ' + Date.now());
    P.setDesign(p.id, NC.designer.defaults());
    const dls = NC.byId.dls, ex = typeof dls.example === 'function' ? dls.example() : dls.example;
    const v = {}; dls.inputs.forEach((i) => { v[i.id] = ex[i.id] !== undefined ? ex[i.id] : i.value; });
    P.addMeasurement(p.id, dls, {}, dls.compute(v));
    P.addManual(p.id, 'lam', 530, 'smoke');
    const cmp = P.compare(P.get(p.id));
    if (!cmp.rows.some((r) => r.q === 'lam' && r.predicted && r.measured.length)) fail('projects: predicted and measured λ_max are not compared');
    await go('#/projects/' + encodeURIComponent(p.id));
    if (!(await until(() => document.querySelector('.proj-cmp')))) fail('projects: comparison table missing');
    P.remove(p.id);
    await go('#/');
    return { failures: F, stats: S };
  };
})();
