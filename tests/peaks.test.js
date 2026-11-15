/* Tests for js/calculators/peaks.js (Workstream H: spectrum & peak analysis). */
'use strict';
module.exports = function (t) {
  const { NC, run, near, ok, throwsInput } = t;
  const P = NC.peaks;
  ok(P && typeof P.lm === 'function', 'NC.peaks helpers are exposed');
  if (!P) return;

  /* Savitzky–Golay: 5-point quadratic = (−3, 12, 17, 12, −3)/35 (Savitzky & Golay 1964, Table I) */
  const c5 = P.sgCoeffs(5, 2).center.map((c) => c * 35);
  [-3, 12, 17, 12, -3].forEach((e, i) => near(c5[i] + 100, e + 100, 1e-9, 'SG 5/2 coefficient ' + i));
  const c7 = P.sgCoeffs(7, 2).center.map((c) => c * 21); // 7-point quadratic: (−2, 3, 6, 7, 6, 3, −2)/21
  [-2, 3, 6, 7, 6, 3, -2].forEach((e, i) => near(c7[i] + 100, e + 100, 1e-9, 'SG 7/2 coefficient ' + i));
  // SG of order p reproduces any polynomial of degree ≤ p exactly, including at the ends
  const xs = Array.from({ length: 40 }, (_, i) => i);
  const quad = xs.map((x) => 3 - 0.5 * x + 0.02 * x * x);
  const sm = P.sgSmooth(quad, 9, 2);
  ok(sm.every((v, i) => Math.abs(v - quad[i]) < 1e-9), 'SG (9, 2) leaves a quadratic unchanged, edges included');

  /* Shirley: monotonic, meets the end levels */
  {
    const x = [], y = [];
    for (let i = 0; i <= 400; i++) {
      const e = 280 + i * 0.05; // binding energy ascending
      const step = 100 + 400 / (1 + Math.exp(-(e - 285) / 0.4)); // higher background on the high-BE side
      y.push(step + 2000 * Math.exp(-4 * Math.LN2 * ((e - 285) / 1.2) ** 2));
      x.push(e);
    }
    const sh = P.shirley(x, y, { navg: 3 });
    let mono = true;
    for (let i = 1; i < sh.B.length; i++) if (sh.B[i] < sh.B[i - 1] - 1e-9) mono = false;
    ok(mono, 'Shirley background is monotonic');
    near(sh.B[0], sh.L, 1e-12, 'Shirley meets the low end level');
    near(sh.B[sh.B.length - 1], sh.R, 1e-12, 'Shirley meets the high end level');
    // the background must rise across the peak (step on the high-BE side)
    ok(sh.B[sh.B.length - 1] - sh.B[0] > 300, 'Shirley background rises by the step height');
  }

  /* Levenberg–Marquardt on known functions */
  {
    const x = Array.from({ length: 50 }, (_, i) => i * 0.1);
    const y = x.map((xi) => 5 * Math.exp(-1.3 * xi));
    const r = P.lm((p) => x.map((xi) => p[0] * Math.exp(-p[1] * xi)), [1, 0.2], y, { tol: 1e-14 });
    near(r.p[0], 5, 1e-6, 'LM exponential amplitude');
    near(r.p[1], 1.3, 1e-6, 'LM exponential rate');
    ok(r.converged, 'LM exponential converged');
    const yg = x.map((xi) => 2 * Math.exp(-((xi - 2.2) ** 2) / (2 * 0.4 * 0.4)));
    const g = P.lm((p) => x.map((xi) => p[0] * Math.exp(-((xi - p[1]) ** 2) / (2 * p[2] * p[2]))), [1, 2.5, 0.8], yg, { tol: 1e-14 });
    near(g.p[1], 2.2, 1e-6, 'LM Gaussian centre');
    near(Math.abs(g.p[2]), 0.4, 1e-6, 'LM Gaussian sigma');
  }

  /* Parsing: header, comments, delimiters, decimal commas, descending x */
  {
    const p = P.parseSpectrum('Energy;Counts\n# comment\n3,5;10\n2,5;20\n1.5\t30\n0.5, 40\n-0.5 5e1\n');
    ok(p.x.length === 5 && p.x[0] === -0.5 && p.y[4] === 10 && p.y[0] === 50, 'parser handles headers, comments, ; tab comma space, decimal commas, sorting: ' + JSON.stringify(p));
  }

  /* Full calculator: 3 known peaks (Gaussian + pseudo-Voigts) on a sloped baseline with noise */
  {
    const truth = [
      { c: 30.0, h: 800, w: 0.8, eta: 0.0 },
      { c: 34.5, h: 500, w: 1.1, eta: 0.3 },
      { c: 41.0, h: 300, w: 1.5, eta: 0.5 }
    ];
    const rand = NC.rng(7);
    const lines = ['x, y'];
    for (let i = 0; i <= 1500; i++) {
      const x = 20 + i * 0.02;
      let y = 40 + 1.5 * (x - 20);
      truth.forEach((p) => {
        const u = (x - p.c) / p.w;
        y += p.eta * p.h / (1 + 4 * u * u) + (1 - p.eta) * p.h * Math.exp(-4 * Math.LN2 * u * u);
      });
      y += 3 * NC.randn(rand);
      lines.push(x.toFixed(2) + ', ' + y.toFixed(3));
    }
    const out = run('peakfit', { tech: 'xrd', data: lines.join('\n'), smooth: 'none', base: 'linear', detect: 'auto', prom: 5, maxp: 6, model: 'pv', xmin: '', xmax: '' });
    ok(out.fit.peaks.length === 3, 'found exactly 3 peaks (got ' + out.fit.peaks.length + ')');
    out.fit.peaks.forEach((p, k) => {
      const tr = truth[k];
      if (!tr) return;
      const area = tr.h * tr.w * (tr.eta * Math.PI / 2 + (1 - tr.eta) * Math.sqrt(Math.PI / (4 * Math.LN2)));
      ok(Math.abs(p.c - tr.c) <= 0.005 * tr.w, 'peak ' + (k + 1) + ' position within 0.5 % of FWHM: ' + p.c + ' vs ' + tr.c);
      near(p.w, tr.w, 0.03, 'peak ' + (k + 1) + ' FWHM within 3 %');
      near(p.area, area, 0.03, 'peak ' + (k + 1) + ' area within 3 %');
      ok(p.seC > 0 && p.seW > 0 && p.seArea > 0, 'peak ' + (k + 1) + ' has positive standard errors');
    });
    ok(out.fit.r2 > 0.99, 'R² > 0.99 (' + out.fit.r2 + ')');
    // "Ready to paste" lines parse as Scherrer input
    const paste = out.tables.find((tb) => /Ready to paste/.test(tb.title));
    ok(paste && paste.rows.length === 3, 'ready-to-paste table present');
    if (paste) {
      const sch = run('scherrer', { data: paste.rows.map((r) => r[0]).join('\n'), corr: 'none' });
      ok(sch.results.length > 0, 'ready-to-paste lines are accepted by the Scherrer calculator');
    }
    // manual positions give the same answer
    const man = run('peakfit', { tech: 'xrd', data: lines.join('\n'), base: 'linear', detect: 'manual', pos: '30, 34.5, 41', model: 'pv', xmin: '', xmax: '' });
    ok(man.fit.peaks.length === 3 && Math.abs(man.fit.peaks[1].c - 34.5) < 0.01, 'manual positions converge to the same peaks');
    // Gaussian-only model on Gaussian data
    const g = run('peakfit', { tech: 'generic', data: lines.join('\n'), base: 'linear', detect: 'manual', pos: '30', model: 'gauss', xmin: 27, xmax: 32.5 });
    near(g.fit.peaks[0].w, 0.8, 0.03, 'Gaussian model recovers the pure Gaussian FWHM');
  }

  /* XPS: Shirley + pseudo-Voigt; ready-to-paste lines accepted by the XPS calculator */
  {
    const lines = [];
    const rand = NC.rng(11);
    for (let i = 0; i <= 600; i++) {
      const e = 280 + i * 0.025;
      let y = 200 + 300 / (1 + Math.exp(-(e - 284.8) / 0.5));
      y += 3000 * Math.exp(-4 * Math.LN2 * ((e - 284.8) / 1.1) ** 2) + 900 * Math.exp(-4 * Math.LN2 * ((e - 286.4) / 1.2) ** 2);
      y += 15 * NC.randn(rand);
      lines.push(e.toFixed(3) + '\t' + y.toFixed(1));
    }
    const out = run('peakfit', { tech: 'xps', data: lines.join('\n'), base: 'shirley', detect: 'manual', pos: '284.8, 286.4', model: 'gauss', xmin: '', xmax: '' });
    ok(out.fit.peaks.length === 2 && Math.abs(out.fit.peaks[0].c - 284.8) < 0.02 && Math.abs(out.fit.peaks[1].c - 286.4) < 0.05, 'XPS peaks recovered on a Shirley background');
    const paste = out.tables.find((tb) => /XPS/.test(tb.title));
    if (paste) {
      const xps = run('xps', { data: paste.rows.map((r) => r[0]).join('\n') });
      ok(xps.results.length > 0, 'XPS ready-to-paste lines are accepted by the XPS calculator');
    } else ok(false, 'XPS ready-to-paste table present');
  }

  /* Polynomial baseline (iterative asymmetric and regions) */
  {
    const lines = [];
    for (let i = 0; i <= 800; i++) {
      const x = 200 + i * 2;
      const y = 1000 + 0.8 * (x - 200) - 3e-4 * (x - 200) ** 2 + 400 * Math.exp(-4 * Math.LN2 * ((x - 1000) / 30) ** 2) + 250 * Math.exp(-4 * Math.LN2 * ((x - 1350) / 40) ** 2);
      lines.push(x + ' ' + y.toFixed(3));
    }
    const out = run('peakfit', { tech: 'raman', data: lines.join('\n'), base: 'poly', bpo: 2, breg: '', detect: 'auto', prom: 5, maxp: 4, model: 'gauss', xmin: '', xmax: '' });
    ok(out.fit.peaks.length === 2, 'Raman: two peaks on a curved background (got ' + out.fit.peaks.length + ')');
    if (out.fit.peaks.length === 2) near(out.fit.peaks[0].w, 30, 0.05, 'Raman: FWHM after iterative polynomial baseline');
    const out2 = run('peakfit', { tech: 'raman', data: lines.join('\n'), base: 'poly', bpo: 2, breg: '200, 850\n1150, 1250\n1500, 1800', detect: 'manual', pos: '1000, 1350', model: 'gauss', xmin: '', xmax: '' });
    near(out2.fit.peaks[0].area, 400 * 30 * Math.sqrt(Math.PI / (4 * Math.LN2)), 0.01, 'Raman: area with region-based polynomial baseline');
  }

  /* Speed: 2000 points, 10 peaks */
  {
    const lines = [];
    for (let i = 0; i < 2000; i++) {
      const x = i * 0.05;
      let y = 10;
      for (let k = 0; k < 10; k++) y += 100 * Math.exp(-4 * Math.LN2 * ((x - (5 + k * 9.5)) / 1.2) ** 2);
      lines.push(x.toFixed(2) + ',' + y.toFixed(4));
    }
    const t0 = Date.now();
    const out = run('peakfit', { tech: 'generic', data: lines.join('\n'), base: 'linear', detect: 'auto', prom: 5, maxp: 10, model: 'pv', xmin: '', xmax: '' });
    const ms = Date.now() - t0;
    ok(out.fit.peaks.length === 10, '10 peaks fitted (got ' + out.fit.peaks.length + ')');
    ok(ms < 1000, '2000 points × 10 pseudo-Voigt peaks fitted in ' + ms + ' ms');
    // a model mismatch (constant offset, no baseline) must still terminate quickly
    const t1 = Date.now();
    run('peakfit', { tech: 'generic', data: lines.join('\n'), base: 'none', detect: 'auto', prom: 5, maxp: 10, model: 'pv', xmin: '', xmax: '' });
    ok(Date.now() - t1 < 1500, 'fit with an unmodelled offset stops early (' + (Date.now() - t1) + ' ms)');
  }

  /* Input errors */
  throwsInput(() => run('peakfit', { data: '1, 2\n3, 4' }), 'too few points');
  throwsInput(() => run('peakfit', { smooth: 'sg', sgw: 6 }), 'even SG window');
  throwsInput(() => run('peakfit', { detect: 'manual', pos: '500' }), 'manual peak outside range');
};
