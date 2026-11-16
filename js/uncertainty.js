/*
 * Monte Carlo propagation of uncertainty (JCGM 101:2008) for any calculator.
 *
 * Each numeric input with a standard uncertainty u is sampled as an independent
 * normal N(x, u²); the calculator's compute() is re-run for every trial; each
 * numeric result is summarised by its mean, standard deviation (the standard
 * uncertainty) and the probabilistically symmetric 95 % coverage interval
 * (2.5th–97.5th percentiles). Trials whose inputs are invalid for the model
 * (compute throws) are discarded and counted.
 *
 * DOM-free: NC.mcPropagate works in Node. NC.mcRunner exposes the same engine in
 * chunks so the UI can stay responsive.
 */
(function (global) {
  'use strict';
  const NC = global.NC;

  NC.addRefs({
    jcgm101: { doi: '10.59161/JCGM101-2008',
      type: 'standard',
      authors: 'JCGM',
      title: 'JCGM 101:2008 Evaluation of measurement data — Supplement 1 to the “Guide to the expression of uncertainty in measurement” — Propagation of distributions using a Monte Carlo method',
      publisher: 'Joint Committee for Guides in Metrology (BIPM)',
      place: 'Sèvres',
      year: 2008
    },
    jcgm100: {
      type: 'standard',
      authors: 'JCGM',
      title: 'JCGM 100:2008 Evaluation of measurement data — Guide to the expression of uncertainty in measurement (GUM)',
      doi: '10.59161/JCGM100-2008E',
      publisher: 'Joint Committee for Guides in Metrology (BIPM)',
      place: 'Sèvres',
      year: 2008
    }
  });

  function nowMs() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }

  /**
   * Create a resumable Monte Carlo run.
   * values: parsed inputs (numbers / strings); unc: { inputId: standardUncertainty }.
   * opts: { seed, rng } — a seeded RNG makes runs reproducible.
   */
  NC.mcRunner = function (def, values, unc, opts) {
    opts = opts || {};
    const rand = opts.rng || (opts.seed !== undefined ? NC.rng(opts.seed) : Math.random);
    const ids = Object.keys(unc || {}).filter(function (k) {
      return unc[k] > 0 && typeof values[k] === 'number' && isFinite(values[k]);
    });
    const nominal = def.compute(values); // throws if the nominal inputs are invalid
    const labels = [];
    nominal.results.forEach(function (r) {
      if (typeof r.value === 'number' && isFinite(r.value) && labels.indexOf(r.label) < 0) labels.push(r.label);
    });
    const samples = {};
    labels.forEach(function (l) { samples[l] = []; });
    let total = 0, failed = 0;

    function step(n) {
      for (let i = 0; i < n; i++) {
        const v = Object.assign({}, values);
        ids.forEach(function (k) { v[k] = values[k] + unc[k] * NC.randn(rand); });
        total++;
        let out;
        try { out = def.compute(v); } catch (e) { failed++; continue; }
        const seen = {};
        out.results.forEach(function (r) { if (!(r.label in seen)) seen[r.label] = r.value; });
        labels.forEach(function (l) {
          const x = seen[l];
          if (typeof x === 'number' && isFinite(x)) samples[l].push(x);
        });
      }
    }

    function summary() {
      const res = {};
      labels.forEach(function (l) {
        const a = samples[l].slice().sort(function (p, q) { return p - q; });
        if (a.length < 2) return;
        const constant = a[0] === a[a.length - 1]; // all trials identical (e.g. result independent of the uncertain inputs)
        const mean = constant ? a[0] : NC.stats.mean(a);
        res[l] = {
          mean: mean,
          u: constant ? 0 : NC.stats.sd(a),
          lo: NC.stats.quantile(a, 0.025),
          hi: NC.stats.quantile(a, 0.975),
          n: a.length,
          nominal: nominal.results.find(function (r) { return r.label === l; }).value
        };
      });
      return { results: res, trials: total, failed: failed, inputs: ids.slice() };
    }
    return { step: step, summary: summary, get trials() { return total; }, inputs: ids, nominal: nominal };
  };

  /**
   * Synchronous propagation. opts.trials fixes the number of trials; otherwise trials are
   * added in blocks until opts.timeBudget ms (default 300) or opts.maxTrials (default 2000),
   * with at least opts.minTrials (default 200).
   */
  NC.mcPropagate = function (def, values, unc, opts) {
    opts = opts || {};
    const r = NC.mcRunner(def, values, unc, opts);
    if (opts.trials) { r.step(opts.trials); return r.summary(); }
    const minT = opts.minTrials || 200, maxT = opts.maxTrials || 2000, budget = opts.timeBudget || 300;
    const t0 = nowMs();
    r.step(minT);
    while (r.trials < maxT && nowMs() - t0 < budget) r.step(Math.min(100, maxT - r.trials));
    return r.summary();
  };

  /** Format "± u" with two significant figures for u. */
  NC.fmtUnc = function (u) { return '± ' + NC.fmt(u, 2); };
})(typeof window !== 'undefined' ? window : globalThis);
