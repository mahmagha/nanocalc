/*
 * Cross-validation against established scientific software.
 * Reference values come from miepython, SciPy and NumPy (tests/validation/generate.py),
 * computed independently of NanoCalc's own code and committed as tests/validation/reference.json.
 */
'use strict';
module.exports = function (t) {
  const { NC, ok, near, fs, path, root } = t;
  const R = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'validation', 'reference.json'), 'utf8'));
  const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
  const worst = {};
  const track = (k, a, b) => { worst[k] = Math.max(worst[k] || 0, rel(a, b)); };

  // 1. Mie efficiencies vs miepython (both full series solutions)
  R.mie.forEach((c) => {
    const r = NC.optics.bhmie(c.x, NC.optics.cx(c.n, c.k));
    near(r.qext, c.qext, 1e-6, `Mie Q_ext vs miepython (m=${c.n}+${c.k}i, x=${c.x})`);
    near(r.qsca, c.qsca, 1e-6, `Mie Q_sca vs miepython (m=${c.n}+${c.k}i, x=${c.x})`);
    track('mie', r.qext, c.qext); track('mie', r.qsca, c.qsca);
  });

  // 2. Depolarization factor vs SciPy quadrature of the defining integral
  R.depolarization.forEach((c) => {
    const L = NC.optics.gansL(c.AR);
    near(L, c.L, c.AR < 1.01 ? 1e-4 : 1e-7, `Gans depolarization factor vs SciPy quad (AR=${c.AR})`);
    if (c.AR >= 1.01) track('depolarization', L, c.L);
  });

  // 3. Spheroid surface area vs SciPy integration of the surface of revolution
  R.spheroid_area.forEach((c) => {
    const A = NC.shapes.spheroid.A({ D: c.D, L: c.L });
    near(A, c.A, 1e-6, `Spheroid area vs SciPy quad (D=${c.D}, L=${c.L})`);
    track('spheroid_area', A, c.A);
  });

  // 4. Savitzky–Golay smoothing coefficients vs scipy.signal.savgol_coeffs
  R.savgol.forEach((c) => {
    const k = NC.peaks.sgCoeffs(c.win, c.order);
    const coeffs = k.center; // smoothing (zeroth-derivative) coefficients for the centre point
    const maxErr = Math.max(...c.coeffs.map((v, i) => Math.abs(coeffs[i] - v)));
    ok(maxErr < 1e-10, `Savitzky–Golay (${c.win}, ${c.order}) vs SciPy: max |Δ| = ${maxErr}`);
  });

  // 5. Least squares with standard errors vs scipy.stats.linregress
  {
    const c = R.linreg, fit = NC.stats.linreg(c.x, c.y);
    near(fit.m, c.slope, 1e-10, 'Linear fit slope vs SciPy linregress');
    near(fit.b, c.intercept, 1e-10, 'Linear fit intercept vs SciPy linregress');
    near(fit.r2, c.r2, 1e-10, 'Linear fit R² vs SciPy linregress');
    near(fit.seM, c.se_slope, 1e-8, 'Slope standard error vs SciPy linregress');
    near(fit.seB, c.se_intercept, 1e-8, 'Intercept standard error vs SciPy linregress');
    track('linreg', fit.seM, c.se_slope);
  }

  // 6. Two-Gaussian least-squares fit vs scipy.optimize.curve_fit
  {
    const c = R.peakfit, p = c.init;
    const init = [{ c: p[0], h: p[1], w: p[2] }, { c: p[3], h: p[4], w: p[5] }];
    const fit = NC.peaks.fitPeaks(c.x, c.y, init, 'gauss');
    const pk = fit.peaks.slice().sort((a, b) => a.c - b.c);
    const names = ['position', 'height', 'FWHM'];
    pk.forEach((q, i) => {
      [q.c, q.h, q.w].forEach((v, j) => {
        near(v, c.params[i * 3 + j], 1e-5, `Peak ${i + 1} ${names[j]} vs SciPy curve_fit`);
        track('peakfit params', v, c.params[i * 3 + j]);
      });
      near(q.seC, c.se[i * 3], 0.02, `Peak ${i + 1} position SE vs SciPy curve_fit`);
      near(q.seW, c.se[i * 3 + 2], 0.02, `Peak ${i + 1} FWHM SE vs SciPy curve_fit`);
      track('peakfit SE', q.seC, c.se[i * 3]); track('peakfit SE', q.seW, c.se[i * 3 + 2]);
    });
  }

  // 7. Particle-size statistics vs NumPy/SciPy, through the actual calculator
  {
    const c = R.psd;
    const out = NC.byId.psd.compute({ d: c.d.join('\n'), bins: 0 });
    const get = (label) => (out.results.find((r) => r.label.startsWith(label)) || {}).value;
    [['Mean diameter', c.mean], ['Standard deviation', c.sd], ['Median', c.median], ['D[3,2]', c.d32], ['D[4,3]', c.d43],
      ['Geometric mean', c.gmean], ['Geometric SD', c.gsd], ['95 % CI half-width', c.ci95]].forEach(([label, v]) => {
      near(get(label), v, label.startsWith('95') ? 1e-5 : 1e-9, `TEM statistics "${label}" vs NumPy/SciPy`);
      track('psd', get(label), v);
    });
  }

  // 7b. Student t quantile used for every 95 % confidence interval (table ≤ 30 df, Cornish–Fisher above)
  R.t975.forEach((c) => {
    near(NC.stats.t95(c.df), c.t, c.df <= 30 ? 2e-4 : 1e-5, `Student t(0.975, ${c.df}) vs SciPy`);
    track('t975', NC.stats.t95(c.df), c.t);
  });

  // 8. Physical constants: NanoCalc uses CODATA 2018; SciPy ships a newer CODATA edition.
  //    Exact SI constants must match exactly; measured ones within the 2018→2022 revision (< 5e-9).
  {
    const c = R.constants, C = NC.C;
    ['h', 'e', 'kB', 'NA', 'c'].forEach((k) => ok(C[k] === c[k], `Exact SI constant ${k} identical to SciPy (${C[k]} vs ${c[k]})`));
    ['hbar', 'me', 'eps0', 'R', 'a0'].forEach((k) => {
      near(C[k], c[k], 5e-9, `CODATA constant ${k} vs SciPy (edition difference allowed)`);
      track('constants', C[k], c[k]);
    });
  }

  // 9. Gas sorption vs pyGAPS (BET, t-plot, BJH) on the same synthetic isotherms
  if (R.sorption) {
    const S = R.sorption, a = S.adsorbate;
    const rowsOf = (c) => c.x.map((x, i) => [x, c.V[i]]);
    const dataOf = (c) => rowsOf(c).map((r) => r.join(', ')).join('\n');
    const runCalc = (id, v) => NC.byId[id].compute(v);
    const val = (o, re) => o.results.find((r) => re.test(r.label)).value;

    const b = S.bet;
    const ob = runCalc('bet', { sigma: a.sigma, xmin: b.xmin, xmax: b.xmax, data: dataOf(b) });
    near(val(ob, /surface area/i), b.area, 1e-6, 'BET area vs pyGAPS'); track('sorption', val(ob, /surface area/i), b.area);
    near(val(ob, /BET constant/i), b.C, 1e-6, 'BET constant C vs pyGAPS'); track('sorption', val(ob, /BET constant/i), b.C);

    S.tplot.forEach((c) => {
      const r = NC.sorption.tplot(rowsOf(c), { curve: c.curve, tmin: c.tmin, tmax: c.tmax, M: a.M, rho: a.rho });
      near(r.Sext, c.area, 1e-6, `t-plot external area vs pyGAPS (${c.curve})`); track('sorption', r.Sext, c.area);
      near(r.Vmic, c.Vmic, 1e-6, `t-plot micropore volume vs pyGAPS (${c.curve})`); track('sorption', r.Vmic, c.Vmic);
    });

    S.bjh.forEach((c) => {
      const r = NC.sorption.bjh(rowsOf(c), { curve: 'hj', gamma: a.gamma * 1e-3, T: a.T, M: a.M, rho: a.rho, fac: c.branch === 'ads' ? 1 : 2 });
      const iv = r.iv.slice().reverse(); // pyGAPS lists classes from small to large pores
      ok(iv.length === c.Vp.length, `BJH (${c.branch}) gives as many size classes as pyGAPS (${iv.length} vs ${c.Vp.length})`);
      let worstV = 0;
      iv.forEach((j, i) => {
        const scale = Math.max(...c.Vp.map(Math.abs));
        worstV = Math.max(worstV, Math.abs(j.Vp - c.Vp[i]) / scale);
        near(j.A, c.Ap[i], 1e-6, `BJH (${c.branch}) area of class ${i + 1} vs pyGAPS`);
        near(j.Dlo, c.Dlo[i], 1e-9, `BJH (${c.branch}) class ${i + 1} lower diameter vs pyGAPS`);
        near(j.dVdD, c.dVdD[i], 1e-6, `BJH (${c.branch}) dV/dD of class ${i + 1} vs pyGAPS`);
        track('sorption', j.Vp, c.Vp[i]);
      });
      ok(worstV < 1e-9, `BJH (${c.branch}) pore volume of every class vs pyGAPS (worst ${worstV.toExponential(1)} of the largest class)`);
      near(r.Vtot, c.Vp.reduce((s, x) => s + x, 0), 1e-9, `BJH (${c.branch}) total pore volume vs pyGAPS`);
    });
  }

  t.validationSummary = { software: R.software, generated: R.generated, worstRelativeDeviation: worst };
  console.log('    reference software: ' + Object.entries(R.software).map(([k, v]) => k + ' ' + v).join(', '));
  console.log('    worst relative deviation: ' + Object.entries(worst).map(([k, v]) => k + ' ' + v.toExponential(1)).join(', '));
};
