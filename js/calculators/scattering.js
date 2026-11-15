/* Scattering: SAXS Guinier and Porod analysis, nanoparticle tracking (NTA), DLS cumulants. */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt, C = NC.C, S = NC.stats;

  NC.addRefs({
    guinier1955: { type: 'book', authors: 'Guinier, A.; Fournet, G.', title: 'Small-Angle Scattering of X-Rays', publisher: 'Wiley', place: 'New York', year: 1955 },
    porod1951: { type: 'article', authors: 'Porod, G.', title: 'Die Röntgenkleinwinkelstreuung von dichtgepackten kolloiden Systemen, I. Teil', journal: 'Kolloid-Z.', year: 1951, volume: '124', pages: '83–114' },
    glatter1982: { type: 'book', authors: 'Glatter, O.; Kratky, O., Eds.', title: 'Small Angle X-ray Scattering', publisher: 'Academic Press', place: 'London', year: 1982 },
    koppel1972: { type: 'article', authors: 'Koppel, D. E.', title: 'Analysis of macromolecular polydispersity in intensity correlation spectroscopy: the method of cumulants', journal: 'J. Chem. Phys.', year: 1972, volume: '57', pages: '4814–4820', doi: '10.1063/1.1678153' },
    frisken2001: { type: 'article', authors: 'Frisken, B. J.', title: 'Revisiting the method of cumulants for the analysis of dynamic light-scattering data', journal: 'Appl. Opt.', year: 2001, volume: '40', pages: '4087–4091', doi: '10.1364/AO.40.004087' },
    filipe2010: { type: 'article', authors: 'Filipe, V.; Hawe, A.; Jiskoot, W.', title: 'Critical evaluation of nanoparticle tracking analysis (NTA) by NanoSight for the measurement of nanoparticles and protein aggregates', journal: 'Pharm. Res.', year: 2010, volume: '27', pages: '796–810' },
    qian1991: { type: 'article', authors: 'Qian, H.; Sheetz, M. P.; Elson, E. L.', title: 'Single particle tracking. Analysis of diffusion and flow in two-dimensional systems', journal: 'Biophys. J.', year: 1991, volume: '60', pages: '910–921' }
  });

  /* ---------- shared helpers ---------- */
  const qOpts = [['nm', 'nm⁻¹'], ['A', 'Å⁻¹']];
  const qToNm = function (unit) { return unit === 'A' ? 10 : 1; };

  /** Least-squares quadratic y = c0 + c1 x + c2 x² (normal equations, Cramer's rule). */
  function quadfit(x, y) {
    const n = x.length;
    let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
    for (let i = 0; i < n; i++) {
      const xi = x[i], x2 = xi * xi;
      s1 += xi; s2 += x2; s3 += x2 * xi; s4 += x2 * x2;
      t0 += y[i]; t1 += xi * y[i]; t2 += x2 * y[i];
    }
    const det3 = function (a) {
      return a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
    };
    const M = [[s0, s1, s2], [s1, s2, s3], [s2, s3, s4]];
    const D = det3(M);
    if (!isFinite(D) || Math.abs(D) < 1e-300) NC.fail('The quadratic fit is singular; supply more distinct points.');
    const col = function (k) { return M.map(function (row, r) { return row.map(function (v, c) { return c === k ? [t0, t1, t2][r] : v; }); }); };
    const c = [det3(col(0)) / D, det3(col(1)) / D, det3(col(2)) / D];
    let ssr = 0, syy = 0;
    const my = t0 / n;
    for (let i = 0; i < n; i++) { const p = c[0] + c[1] * x[i] + c[2] * x[i] * x[i]; ssr += Math.pow(y[i] - p, 2); syy += Math.pow(y[i] - my, 2); }
    return { c0: c[0], c1: c[1], c2: c[2], r2: syy ? 1 - ssr / syy : 1 };
  }

  /** Medium viscosity: water correlation (as in the DLS calculator) or a user value. */
  function viscosity(v, s) {
    const tC = NC.need(v.T, 'Temperature', { min: -20, max: 150 });
    const TK = tC + 273.15;
    let eta;
    if (v.visc === 'custom') {
      eta = NC.need(v.eta, 'Viscosity', { positive: true }) * 1e-3;
      s.add({ title: 'Medium viscosity (user value)', formula: 'η (mPa·s → Pa·s)', sub: 'η = ' + f(v.eta) + ' mPa·s', result: 'η = ' + f(eta) + ' Pa·s' });
    } else {
      eta = NC.waterViscosity(TK);
      s.add({ title: 'Viscosity of water at ' + f(tC) + ' °C', formula: 'η = 2.414×10⁻⁵ Pa·s × 10^[247.8 K / (T − 140 K)]', tex: String.raw`\eta = 2.414\times 10^{-5}\ \text{Pa}\cdot\text{s}\times 10^{\,247.8\ \text{K}/(T - 140\ \text{K})}`, sub: 'T = ' + f(TK, 5) + ' K', result: 'η = ' + f(eta) + ' Pa·s', note: 'Empirical correlation, within about 1 % of the IAPWS reference values between 0 and 100 °C.', ref: 'huber2009' });
    }
    return { TK: TK, eta: eta, tC: tC };
  }
  function stokesEinstein(s, w, Dm2s, label) {
    const dh = (C.kB * w.TK) / (3 * Math.PI * w.eta * Dm2s);
    s.add({ title: label || 'Hydrodynamic diameter (Stokes–Einstein)', formula: 'd_h = k_B·T / (3π·η·D)', tex: String.raw`d_h = \dfrac{k_B T}{3\pi\eta D}`, sub: 'd_h = ' + f(C.kB) + ' × ' + f(w.TK, 5) + ' / (3π × ' + f(w.eta) + ' × ' + f(Dm2s) + ')', result: 'd_h = ' + f(dh * 1e9) + ' nm', ref: ['einstein1905', 'codata2018'] });
    return dh * 1e9;
  }
  const viscInputs = [
    NC.num('T', 'Temperature T', '°C', 25),
    NC.sel('visc', 'Medium viscosity', [['water', 'Water (automatic, from T)'], ['custom', 'Custom value']], 'water'),
    NC.num('eta', 'Viscosity η', 'mPa·s', 0.89, { showIf: function (v) { return v.visc === 'custom'; } })
  ];

  /* Exact sphere form factor, used by the examples. */
  function sphereP(q, R) {
    const x = q * R;
    if (x < 1e-6) return 1;
    const a = (3 * (Math.sin(x) - x * Math.cos(x))) / (x * x * x);
    return a * a;
  }

  /* ================================================================== */
  /* Guinier                                                             */
  /* ================================================================== */
  NC.register({
    id: 'guinier',
    category: 'scatter',
    title: 'SAXS Guinier analysis (radius of gyration)',
    short: 'Radius of gyration Rg and I(0) from the low-q region of a SAXS/SANS curve',
    description:
      'Fits ln I = ln I₀ − q²Rg²/3 to the low-q part of a small-angle scattering curve. The fit range is chosen automatically so that q_max·Rg < 1.3, or you can set it yourself. For a homogeneous sphere it also gives the radius R = √(5/3)·Rg.',
    refs: ['guinier1955', 'glatter1982'],
    inputs: [
      NC.sel('qunit', 'Unit of q', qOpts, 'nm'),
      NC.data('data', 'Scattering curve: q, I(q)', '', { placeholder: '0.01, 1520\n0.02, 1480\n…', rows: 9 }),
      NC.num('qmin', 'Fit range: q min (optional)', 'same unit as q', NaN),
      NC.num('qmax', 'Fit range: q max (optional)', 'same unit as q', NaN)
    ],
    example: function () {
      const rand = NC.rng(11), R = 8, rows = [];
      for (let q = 0.01; q <= 0.6001; q += 0.01) rows.push(q.toFixed(3) + ', ' + (1000 * sphereP(q, R) * (1 + 0.005 * NC.randn(rand))).toPrecision(6));
      return { qunit: 'nm', data: rows.join('\n'), qmin: '', qmax: '' };
    },
    compute: function (v) {
      const s = new NC.Steps();
      const k = qToNm(v.qunit);
      const rows = NC.parseRows(v.data, { min: 2, max: 2, labels: ['q', 'I(q)'], name: 'Scattering curve' })
        .map(function (r) { return [r[0] * k, r[1]]; })
        .filter(function (r) { return r[0] > 0 && r[1] > 0; })
        .sort(function (a, b) { return a[0] - b[0]; });
      if (rows.length < 4) NC.fail('Enter at least 4 points with q > 0 and I > 0.');
      if (k !== 1) s.add({ title: 'Convert q to nm⁻¹', formula: 'q[nm⁻¹] = 10 × q[Å⁻¹]', result: rows.length + ' points converted' });

      const qmin = NC.opt(v.qmin, 'q min', { nonneg: true }), qmax = NC.opt(v.qmax, 'q max', { positive: true });
      const fitOn = function (lo, hi) {
        const pts = rows.filter(function (r) { return r[0] >= lo && r[0] <= hi; });
        if (pts.length < 3) return null;
        const lr = S.linreg(pts.map(function (r) { return r[0] * r[0]; }), pts.map(function (r) { return Math.log(r[1]); }));
        return { pts: pts, lr: lr };
      };
      let fit, how;
      if (qmin !== null || qmax !== null) {
        fit = fitOn(qmin === null ? 0 : qmin * k, qmax === null ? Infinity : qmax * k);
        if (!fit) NC.fail('The chosen q range contains fewer than 3 points.');
        how = 'user range';
      } else {
        // automatic: start with the first points, then keep q ≤ 1.3/Rg until the range stops changing
        fit = fitOn(0, rows[Math.min(rows.length, 8) - 1][0]);
        for (let it = 0; it < 30; it++) {
          if (fit.lr.m >= 0) break;
          const rg = Math.sqrt(-3 * fit.lr.m);
          const lim = Math.max(1.3 / rg, rows[2][0]);
          const next = fitOn(0, lim);
          if (!next || next.pts.length === fit.pts.length) { fit = next || fit; break; }
          fit = next;
        }
        how = 'automatic, q·Rg < 1.3';
      }
      if (fit.lr.m >= 0) NC.fail('ln I does not decrease with q² at low q, so there is no Guinier region. This often means aggregation or interparticle interference; check the low-q data.');
      const lr = fit.lr;
      const Rg = Math.sqrt(-3 * lr.m);
      const RgSE = isFinite(lr.seM) ? (3 * lr.seM) / (2 * Rg) : NaN;
      const I0 = Math.exp(lr.b);
      const q1 = fit.pts[0][0], q2 = fit.pts[fit.pts.length - 1][0];

      s.add({ title: 'Guinier approximation', formula: 'I(q) ≈ I₀·exp(−q²Rg²/3)   ⇒   ln I = ln I₀ − (Rg²/3)·q²', tex: String.raw`I(q) \approx I_0\, e^{-q^2 R_g^2/3} \;\Rightarrow\; \ln I = \ln I_0 - \dfrac{R_g^2}{3}\,q^2`, note: 'Valid at small q, roughly q·Rg < 1.3 for compact particles, and for dilute, non-interacting particles.', ref: ['guinier1955', 'glatter1982'] });
      s.add({ title: 'Linear fit of ln I against q²', formula: 'ln I = b + m·q²   (least squares)', sub: fit.pts.length + ' points, q = ' + f(q1) + '–' + f(q2) + ' nm⁻¹ (' + how + ')', result: 'm = ' + f(lr.m) + ' ± ' + f(lr.seM, 2) + ' nm²;   b = ' + f(lr.b) + ';   R² = ' + NC.fix(lr.r2, 5) });
      s.add({ title: 'Radius of gyration', formula: 'Rg = √(−3m)', tex: String.raw`R_g = \sqrt{-3m},\qquad \sigma_{R_g} = \dfrac{3\,\sigma_m}{2R_g}`, sub: 'Rg = √(−3 × ' + f(lr.m) + ')', result: 'Rg = ' + f(Rg) + ' ± ' + f(RgSE, 2) + ' nm', ref: 'guinier1955' });
      s.add({ title: 'Forward scattering', formula: 'I₀ = e^b', tex: 'I_0 = e^{b}', sub: 'I₀ = exp(' + f(lr.b) + ')', result: 'I₀ = ' + f(I0) });
      const qRg = q2 * Rg;
      s.add({ title: 'Validity check', formula: 'q_max·Rg < 1.3', tex: String.raw`q_{\max} R_g < 1.3`, sub: 'q_max·Rg = ' + f(q2) + ' × ' + f(Rg), result: 'q_max·Rg = ' + f(qRg, 3) + (qRg < 1.3 ? '  (OK)' : '  (too large)'), ref: 'glatter1982' });
      const R = Math.sqrt(5 / 3) * Rg;
      s.add({ title: 'Equivalent homogeneous sphere', formula: 'Rg² = (3/5)·R²   ⇒   R = √(5/3)·Rg', tex: String.raw`R_g^2 = \tfrac{3}{5}R^2 \;\Rightarrow\; R = \sqrt{5/3}\,R_g`, sub: 'R = 1.2910 × ' + f(Rg), result: 'R = ' + f(R) + ' nm;   D = ' + f(2 * R) + ' nm', ref: 'guinier1955' });

      const warnings = [];
      if (qRg >= 1.3) warnings.push('q_max·Rg = ' + f(qRg, 3) + ' exceeds 1.3, so the Guinier approximation is being used outside its range. Narrow the fit range.');
      if (fit.pts.length < 5) warnings.push('Only ' + fit.pts.length + ' points are in the Guinier range; Rg is poorly determined. Measure to lower q if possible.');
      const all = rows.map(function (r) { return [r[0] * r[0], Math.log(r[1])]; });
      const xMax = Math.min(all[all.length - 1][0], Math.pow(2.5 / Rg, 2));
      return {
        results: [
          { label: 'Radius of gyration Rg', value: Rg, unit: 'nm', main: true },
          { label: 'Sphere radius R', value: R, unit: 'nm', main: true },
          { label: 'Sphere diameter', value: 2 * R, unit: 'nm' },
          { label: 'Rg standard error', value: RgSE, unit: 'nm' },
          { label: 'I₀', value: I0 },
          { label: 'q_max·Rg', value: qRg, sig: 3 },
          { label: 'Points fitted', value: fit.pts.length }
        ],
        steps: s.items,
        warnings: warnings,
        plots: [{
          title: 'Guinier plot', xlabel: 'q² (nm⁻²)', ylabel: 'ln I',
          series: [
            { name: 'Data', mode: 'markers', hollow: true, color: 2, points: all.filter(function (p) { return p[0] <= xMax; }) },
            { name: 'Fitted points', mode: 'markers', points: fit.pts.map(function (r) { return [r[0] * r[0], Math.log(r[1])]; }) },
            { name: 'Guinier fit', mode: 'line', color: 1, points: [[0, lr.b], [xMax, lr.b + lr.m * xMax]] }
          ]
        }],
        notes: ['Rg is the intensity-weighted (z-average) radius of gyration, so it is dominated by the largest particles in a polydisperse sample.', 'Subtract the solvent/buffer scattering before the analysis.']
      };
    }
  });

  /* ================================================================== */
  /* Porod                                                               */
  /* ================================================================== */
  NC.register({
    id: 'porod',
    category: 'scatter',
    title: 'SAXS Porod analysis (invariant & specific surface)',
    short: 'Porod constant, scattering invariant and surface-to-volume ratio',
    description:
      'For sharp interfaces, I(q) → K_P/q⁴ at high q (Porod law). Together with the scattering invariant Q = ∫q²I dq this gives the surface-to-volume ratio without knowing the contrast: S/V = π·φ(1 − φ)·K_P/Q. For dilute particles this reduces to S/V_particles = π·K_P/Q.',
    refs: ['porod1951', 'glatter1982'],
    inputs: [
      NC.sel('qunit', 'Unit of q', qOpts, 'nm'),
      NC.data('data', 'Scattering curve: q, I(q)  (solvent-subtracted)', '', { rows: 9 }),
      NC.num('pmin', 'Porod range: q min (optional)', 'same unit as q', NaN, { help: 'Leave blank to use the last 25 % of the q range.' }),
      NC.num('pmax', 'Porod range: q max (optional)', 'same unit as q', NaN),
      NC.sel('bg', 'Constant background', [['fit', 'Fit it (I·q⁴ = K_P + B·q⁴)'], ['none', 'None (already subtracted)']], 'none'),
      NC.sel('sys', 'System', [['dilute', 'Dilute particles: S/V of the particles'], ['twophase', 'Two-phase system with volume fraction φ']], 'dilute'),
      NC.num('phi', 'Volume fraction φ of the particle phase', '', 0.3, { showIf: function (v) { return v.sys === 'twophase'; } }),
      NC.num('rho', 'Particle density (optional, for m²/g)', 'g/cm³', NaN)
    ],
    example: function () {
      // polydisperse spheres (mean R = 10 nm, 10 % Gaussian), number-weighted I = Σ n·V²·P(q)
      const Rs = [], ws = [];
      for (let i = -30; i <= 30; i++) { const R = 10 * (1 + 0.1 * (i / 10)); Rs.push(R); ws.push(Math.exp(-0.5 * Math.pow(i / 10, 2))); }
      const rows = [];
      for (let q = 0.005; q <= 3.0001; q += 0.005) {
        let I = 0;
        Rs.forEach(function (R, j) { const V = (4 / 3) * Math.PI * R * R * R; I += ws[j] * V * V * sphereP(q, R); });
        rows.push(q.toFixed(3) + ', ' + (I * 1e-6).toPrecision(7));
      }
      return { qunit: 'nm', data: rows.join('\n'), pmin: '', pmax: '', bg: 'none', sys: 'dilute' };
    },
    compute: function (v) {
      const s = new NC.Steps();
      const k = qToNm(v.qunit);
      const rows = NC.parseRows(v.data, { min: 2, max: 2, labels: ['q', 'I(q)'], name: 'Scattering curve' })
        .map(function (r) { return [r[0] * k, r[1]]; })
        .filter(function (r) { return r[0] > 0; })
        .sort(function (a, b) { return a[0] - b[0]; });
      if (rows.length < 10) NC.fail('Enter at least 10 points with q > 0.');
      const qLast = rows[rows.length - 1][0], qFirst = rows[0][0];
      const pmin = NC.opt(v.pmin, 'Porod q min', { positive: true }), pmax = NC.opt(v.pmax, 'Porod q max', { positive: true });
      const lo = pmin !== null ? pmin * k : qFirst + 0.75 * (qLast - qFirst);
      const hi = pmax !== null ? pmax * k : qLast;
      const P = rows.filter(function (r) { return r[0] >= lo && r[0] <= hi; });
      if (P.length < 3) NC.fail('The Porod range contains fewer than 3 points.');

      s.add({ title: 'Porod law (sharp interfaces)', formula: 'I(q) → K_P / q⁴ + B   for q → ∞,   K_P = 2π(Δρ)²·S/V', tex: String.raw`I(q) \to \dfrac{K_P}{q^4} + B,\qquad K_P = 2\pi(\Delta\rho)^2\,\dfrac{S}{V}`, ref: ['porod1951', 'glatter1982'] });
      let K, B = 0;
      if (v.bg === 'fit') {
        const lr = S.linreg(P.map(function (r) { return Math.pow(r[0], 4); }), P.map(function (r) { return r[1] * Math.pow(r[0], 4); }));
        K = lr.b; B = lr.m;
        s.add({ title: 'Porod constant and background', formula: 'I·q⁴ = K_P + B·q⁴   (linear fit against q⁴)', tex: String.raw`I q^4 = K_P + B\,q^4`, sub: P.length + ' points, q = ' + f(P[0][0]) + '–' + f(P[P.length - 1][0]) + ' nm⁻¹;  R² = ' + NC.fix(lr.r2, 4), result: 'K_P = ' + f(K) + ' (I·nm⁻⁴);   B = ' + f(B) + ' (I units)' });
      } else {
        K = S.mean(P.map(function (r) { return r[1] * Math.pow(r[0], 4); }));
        s.add({ title: 'Porod constant from the plateau', formula: 'K_P = ⟨I·q⁴⟩ over the Porod range', tex: String.raw`K_P = \left\langle I\,q^4 \right\rangle_{\text{Porod range}}`, sub: P.length + ' points, q = ' + f(P[0][0]) + '–' + f(P[P.length - 1][0]) + ' nm⁻¹', result: 'K_P = ' + f(K) + ' (I·nm⁻⁴)' });
      }
      if (!(K > 0)) NC.fail('The Porod constant is not positive. Check the Porod range and background subtraction.');

      // invariant: trapezoid over the data + low-q (flat) and high-q (Porod) extrapolations
      let Qm = 0;
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1], b = rows[i];
        Qm += 0.5 * (b[0] - a[0]) * (a[0] * a[0] * (a[1] - B) + b[0] * b[0] * (b[1] - B));
      }
      const Qlo = ((rows[0][1] - B) * Math.pow(qFirst, 3)) / 3;
      const Qhi = K / qLast;
      const Q = Qm + Qlo + Qhi;
      s.add({ title: 'Scattering invariant', formula: 'Q = ∫₀^∞ q²·[I(q) − B] dq = Q_data + Q_low + Q_high', tex: String.raw`Q = \int_0^\infty q^2\,[I(q) - B]\,dq = Q_{\text{data}} + \underbrace{\tfrac{1}{3}I(q_1)\,q_1^3}_{Q_{\text{low}}} + \underbrace{K_P/q_n}_{Q_{\text{high}}}`, sub: 'Q_data = ' + f(Qm) + ' (trapezoid rule);  Q_low = ' + f(Qlo) + ' (I flat below q₁);  Q_high = ' + f(Qhi) + ' (Porod tail)', result: 'Q = ' + f(Q) + ' (I·nm⁻³)', note: 'Q = 2π²(Δρ)²φ(1 − φ). The extrapolations assume a flat intensity below the first point and Porod behaviour beyond the last.', ref: 'glatter1982' });

      const results = [], warnings = [];
      let SVp;
      if (v.sys === 'twophase') {
        const phi = NC.need(v.phi, 'Volume fraction φ', { gt: 0, lt: 1 });
        const SVt = (Math.PI * phi * (1 - phi) * K) / Q;
        SVp = SVt / phi;
        s.add({ title: 'Specific surface (two-phase system)', formula: 'S/V = π·φ(1 − φ)·K_P / Q   (per unit sample volume)', tex: String.raw`\dfrac{S}{V} = \pi\,\varphi(1-\varphi)\,\dfrac{K_P}{Q}`, sub: 'S/V = π × ' + f(phi) + ' × ' + f(1 - phi) + ' × ' + f(K) + ' / ' + f(Q), result: 'S/V = ' + f(SVt) + ' nm⁻¹ of sample;   per particle-phase volume: ' + f(SVp) + ' nm⁻¹', note: 'Dividing K_P = 2π(Δρ)²S/V by Q = 2π²(Δρ)²φ(1 − φ) cancels the unknown contrast Δρ. Units: (I·nm⁻⁴)/(I·nm⁻³) = nm⁻¹.', ref: 'porod1951' });
        results.push({ label: 'S/V of sample', value: SVt, unit: 'nm⁻¹', main: true });
      } else {
        SVp = (Math.PI * K) / Q;
        s.add({ title: 'Specific surface of dilute particles', formula: 'S/V_particles = π·K_P / Q   (φ ≪ 1)', tex: String.raw`\dfrac{S}{V_{\text{particles}}} = \pi\,\dfrac{K_P}{Q}\qquad(\varphi \ll 1)`, sub: 'S/V = π × ' + f(K) + ' / ' + f(Q), result: 'S/V = ' + f(SVp) + ' nm⁻¹', note: 'Dilute limit of S/V = πφ(1 − φ)K_P/Q divided by φ. Units: (I·nm⁻⁴)/(I·nm⁻³) = nm⁻¹; the contrast cancels.', ref: 'porod1951' });
      }
      const Req = 3 / SVp;
      s.add({ title: 'Equivalent sphere (for orientation)', formula: 'S/V = 3/R   ⇒   R = 3/(S/V)', tex: String.raw`\dfrac{S}{V} = \dfrac{3}{R} \;\Rightarrow\; R = \dfrac{3}{S/V}`, sub: 'R = 3 / ' + f(SVp), result: 'R = ' + f(Req) + ' nm  (for polydisperse spheres this is ⟨R³⟩/⟨R²⟩)' });
      results.push({ label: 'S/V of particles', value: SVp, unit: 'nm⁻¹', main: true }, { label: 'Equivalent sphere radius', value: Req, unit: 'nm', main: true }, { label: 'Porod constant K_P', value: K }, { label: 'Invariant Q', value: Q });
      const rho = NC.opt(v.rho, 'Density', { positive: true });
      if (rho !== null) {
        const ssa = (1000 * SVp) / rho;
        s.add({ title: 'Specific surface area per mass', formula: 'S_m = (S/V)/ρ   ⇒   S_m[m²/g] = 1000·(S/V)[nm⁻¹] / ρ[g/cm³]', tex: String.raw`S_m\,[\text{m}^2/\text{g}] = \dfrac{1000\,(S/V)\,[\text{nm}^{-1}]}{\rho\,[\text{g/cm}^3]}`, sub: 'S_m = 1000 × ' + f(SVp) + ' / ' + f(rho), result: 'S_m = ' + f(ssa) + ' m²/g' });
        results.push({ label: 'Specific surface area', value: ssa, unit: 'm²/g', main: true });
      }
      const extra = (Qlo + Qhi) / Q;
      if (extra > 0.3) warnings.push(NC.fix(extra * 100, 0) + ' % of the invariant comes from extrapolation beyond the measured q range, so Q and S/V are uncertain. Extend the q range if possible.');
      const curve = rows.map(function (r) { return [r[0], (r[1] - B) * Math.pow(r[0], 4)]; });
      return {
        results: results,
        steps: s.items,
        warnings: warnings,
        plots: [{
          title: 'Porod plot', xlabel: 'q (nm⁻¹)', ylabel: '(I − B)·q⁴', zeroY: true,
          series: [{ name: 'Data', mode: 'line', points: curve }, { name: 'K_P (plateau)', mode: 'line', dashed: true, color: 1, points: [[P[0][0], K], [P[P.length - 1][0], K]] }]
        }],
        notes: ['Porod analysis needs sharp interfaces and accurate background subtraction; a diffuse interface makes I·q⁴ fall at high q, and residual background makes it rise.', 'Q is the integral over all q; the reported extrapolations show how much of it was not measured.']
      };
    }
  });

  /* ================================================================== */
  /* NTA                                                                 */
  /* ================================================================== */
  NC.register({
    id: 'nta',
    category: 'scatter',
    title: 'Nanoparticle tracking analysis (NTA)',
    short: 'Size from 2D mean-squared displacement; number concentration from counts',
    description:
      'Particle tracking follows individual particles in 2D. The mean-squared displacement grows as MSD = 4D·Δt, which gives the diffusion coefficient and, through Stokes–Einstein, the hydrodynamic diameter. The particle count in a known imaged volume gives the number concentration.',
    refs: ['qian1991', 'filipe2010', 'einstein1905'],
    inputs: [
      NC.sel('mode', 'Diffusion input', [['msd', 'MSD at several lag times (fit)'], ['single', 'One MSD at one lag time']], 'msd'),
      NC.data('data', 'Lag time Δt (s), MSD (µm²)', '', { rows: 7, showIf: function (v) { return v.mode === 'msd'; } }),
      NC.num('msd', 'Mean-squared displacement', 'µm²', 0.65, { showIf: function (v) { return v.mode === 'single'; } }),
      NC.num('dt', 'Lag time Δt', 's', 0.0333, { showIf: function (v) { return v.mode === 'single'; } })
    ].concat(viscInputs).concat([
      NC.num('count', 'Mean particles per frame (optional)', '', NaN, { help: 'Leave blank to skip the concentration.' }),
      NC.num('fw', 'Field of view width', 'µm', 100),
      NC.num('fh', 'Field of view height', 'µm', 80),
      NC.num('depth', 'Illuminated depth', 'µm', 10),
      NC.num('dil', 'Dilution factor', '×', 1)
    ]),
    example: function () {
      const D = 4.905, rows = []; // 100 nm sphere in water at 25 °C
      for (let k = 1; k <= 8; k++) { const t = k / 30; rows.push(t.toFixed(4) + ', ' + (4 * D * t + 0.004).toFixed(4)); }
      return { mode: 'msd', data: rows.join('\n'), T: 25, visc: 'water', count: 50, fw: 100, fh: 80, depth: 10, dil: 100 };
    },
    compute: function (v) {
      const s = new NC.Steps();
      let D, extra = [];
      if (v.mode === 'single') {
        const msd = NC.need(v.msd, 'MSD', { positive: true }), dt = NC.need(v.dt, 'Lag time', { positive: true });
        D = msd / (4 * dt);
        s.add({ title: '2D diffusion: MSD = 4D·Δt', formula: 'D = MSD / (4·Δt)', tex: String.raw`\langle r^2 \rangle = 4D\,\Delta t \;\Rightarrow\; D = \dfrac{\text{MSD}}{4\,\Delta t}`, sub: 'D = ' + f(msd) + ' µm² / (4 × ' + f(dt) + ' s)', result: 'D = ' + f(D) + ' µm²/s', note: 'A single lag time cannot separate diffusion from localization error; prefer a fit over several lag times.', ref: 'qian1991' });
      } else {
        const rows = NC.parseRows(v.data, { min: 2, max: 2, labels: ['Δt (s)', 'MSD (µm²)'], name: 'MSD table' });
        if (rows.length < 3) NC.fail('Enter at least 3 lag times.');
        const lr = S.linreg(rows.map(function (r) { return r[0]; }), rows.map(function (r) { return r[1]; }));
        if (!(lr.m > 0)) NC.fail('MSD does not increase with lag time; the particles are not diffusing (check drift and units).');
        D = lr.m / 4;
        s.add({ title: '2D diffusion with localization error', formula: 'MSD(Δt) = 4D·Δt + 4σ²   (straight-line fit)', tex: String.raw`\text{MSD}(\Delta t) = 4D\,\Delta t + 4\sigma_{\text{loc}}^2`, sub: rows.length + ' lag times;  slope = ' + f(lr.m) + ' ± ' + f(lr.seM, 2) + ' µm²/s;  intercept = ' + f(lr.b) + ' µm²;  R² = ' + NC.fix(lr.r2, 5), result: 'D = slope/4 = ' + f(D) + ' µm²/s' + (lr.b > 0 ? ';   σ_loc = ' + f(Math.sqrt(lr.b / 4) * 1000) + ' nm' : ''), note: 'The intercept absorbs the static localization error; a negative intercept usually reflects motion blur or noise.', ref: 'qian1991' });
        extra = rows.map(function (r) { return [r[0], r[1]]; });
        extra.lr = lr;
      }
      const w = viscosity(v, s);
      const Dm2 = D * 1e-12;
      s.add({ title: 'Convert D to SI', formula: '1 µm²/s = 10⁻¹² m²/s', result: 'D = ' + f(Dm2) + ' m²/s' });
      const dh = stokesEinstein(s, w, Dm2);
      const results = [{ label: 'Hydrodynamic diameter d_h', value: dh, unit: 'nm', main: true }, { label: 'Diffusion coefficient D', value: D, unit: 'µm²/s', main: true }];
      const count = NC.opt(v.count, 'Particles per frame', { nonneg: true });
      if (count !== null) {
        const fw = NC.need(v.fw, 'Field width', { positive: true }), fh = NC.need(v.fh, 'Field height', { positive: true });
        const dz = NC.need(v.depth, 'Depth', { positive: true }), dil = NC.need(v.dil, 'Dilution factor', { min: 1 });
        const Vum3 = fw * fh * dz, VmL = Vum3 * 1e-12;
        s.add({ title: 'Imaged volume', formula: 'V = width × height × depth   (1 µm³ = 10⁻¹² mL)', sub: 'V = ' + f(fw) + ' × ' + f(fh) + ' × ' + f(dz) + ' µm³', result: 'V = ' + f(Vum3) + ' µm³ = ' + f(VmL) + ' mL' });
        const cMeas = count / VmL, c0 = cMeas * dil;
        s.add({ title: 'Number concentration', formula: 'c = (N_frame / V) × dilution', tex: String.raw`c = \dfrac{\bar N_{\text{frame}}}{V}\times f_{\text{dil}}`, sub: 'c = (' + f(count) + ' / ' + f(VmL) + ' mL) × ' + f(dil), result: 'c = ' + f(c0) + ' particles/mL  (measured: ' + f(cMeas) + ' /mL)', note: 'NTA works best at about 10⁷–10⁹ particles/mL in the measured sample; the illuminated depth is instrument-specific.', ref: 'filipe2010' });
        results.push({ label: 'Concentration (original)', value: c0, unit: 'mL⁻¹', main: true }, { label: 'Concentration (measured)', value: cMeas, unit: 'mL⁻¹' });
      }
      const plots = [];
      if (extra.length) {
        const tmax = extra[extra.length - 1][0];
        plots.push({ title: 'MSD versus lag time', xlabel: 'Δt (s)', ylabel: 'MSD (µm²)', xmin: 0, zeroY: true, series: [{ name: 'Data', mode: 'markers', points: extra }, { name: 'Fit', mode: 'line', color: 1, points: [[0, extra.lr.b], [tmax, extra.lr.b + extra.lr.m * tmax]] }] });
      }
      return {
        results: results,
        steps: s.items,
        plots: plots,
        notes: ['NTA sizes are number-weighted per tracked particle; the reported value here is the diameter for the mean D. Short tracks broaden the size distribution.', 'Particles much smaller than about 30–50 nm (low scattering) may not be detected, which biases the concentration.']
      };
    }
  });

  /* ================================================================== */
  /* DLS cumulants                                                       */
  /* ================================================================== */
  NC.register({
    id: 'cumulants',
    category: 'scatter',
    title: 'DLS cumulant analysis of g₂(τ)',
    short: 'Decay rate, polydispersity index and z-average size from a raw correlation curve',
    description:
      'Fits the intensity autocorrelation g₂(τ) with the second-order cumulant expansion ln(g₂ − 1) = ln β − 2Γτ + μ₂τ². This gives the mean decay rate Γ, the polydispersity index PDI = μ₂/Γ², and the z-average hydrodynamic diameter (ISO 22412).',
    refs: ['koppel1972', 'frisken2001', 'iso22412', 'berne1976'],
    inputs: [
      NC.data('data', 'Correlation: τ (µs), g₂(τ)', '', { rows: 9 }),
      NC.num('base', 'Baseline of g₂', '', 1, { help: 'Long-time limit of g₂; 1 for a normalized correlation function.' }),
      NC.num('cut', 'Use points with g₂ − 1 above this fraction of its maximum', '', 0.1),
      NC.num('n', 'Refractive index of medium', '', 1.33),
      NC.num('lam', 'Laser wavelength λ₀', 'nm', 633),
      NC.num('theta', 'Scattering angle θ', '°', 173)
    ].concat(viscInputs),
    example: function () {
      const TK = 298.15, eta = NC.waterViscosity(TK), dh = 80e-9;
      const D = (C.kB * TK) / (3 * Math.PI * eta * dh);
      const q = (4 * Math.PI * 1.33 * Math.sin(NC.rad(173) / 2)) / 633e-9;
      // g₁ from a Gaussian distribution of decay rates (relative SD √0.1, i.e. PDI ≈ 0.1)
      const G = D * q * q, rand = NC.rng(5), rows = [], comps = [];
      for (let i = -30; i <= 30; i++) { const z = i / 10, Gi = G * (1 + Math.sqrt(0.1) * z); if (Gi > 0) comps.push([Gi, Math.exp(-0.5 * z * z)]); }
      const wsum = comps.reduce(function (a, c) { return a + c[1]; }, 0);
      for (let e = 0; e <= 4.0001; e += 0.1) {
        const tau = Math.pow(10, e) * 1e-6;
        const g1 = comps.reduce(function (a, c) { return a + c[1] * Math.exp(-c[0] * tau); }, 0) / wsum;
        const y = 0.9 * g1 * g1;
        rows.push((tau * 1e6).toPrecision(5) + ', ' + (1 + y * (1 + 0.003 * NC.randn(rand))).toPrecision(6));
      }
      return { data: rows.join('\n'), base: 1, cut: 0.1, n: 1.33, lam: 633, theta: 173, T: 25, visc: 'water' };
    },
    compute: function (v) {
      const s = new NC.Steps();
      const rows = NC.parseRows(v.data, { min: 2, max: 2, labels: ['τ (µs)', 'g₂'], name: 'Correlation data' }).sort(function (a, b) { return a[0] - b[0]; });
      if (rows.length < 5) NC.fail('Enter at least 5 points of the correlation function.');
      const base = NC.need(v.base, 'Baseline', { positive: true });
      const cut = NC.need(v.cut, 'Cutoff fraction', { gt: 0, lt: 1 });
      const ys = rows.map(function (r) { return r[1] / base - 1; });
      const ymax = Math.max.apply(null, ys);
      if (!(ymax > 0)) NC.fail('g₂ never rises above the baseline; check the baseline value.');
      const use = rows.map(function (r, i) { return { t: r[0], y: ys[i] }; }).filter(function (p) { return p.t > 0 && p.y > cut * ymax; });
      if (use.length < 4) NC.fail('Fewer than 4 points lie above the cutoff; lower the cutoff fraction.');
      s.add({ title: 'Siegert relation and cumulant expansion', formula: 'g₂(τ) = B·[1 + β·|g₁(τ)|²],   ln g₁ = −Γτ + (μ₂/2)·τ² − …', tex: String.raw`g_2(\tau) = B\left[1 + \beta\,|g_1(\tau)|^2\right],\qquad \ln g_1 = -\Gamma\tau + \tfrac{\mu_2}{2}\tau^2 - \ldots`, note: 'The cumulant expansion describes the decay around the mean rate Γ; μ₂ is the variance of the distribution of decay rates.', ref: ['koppel1972', 'berne1976'] });
      const fit = quadfit(use.map(function (p) { return p.t; }), use.map(function (p) { return Math.log(p.y); }));
      s.add({ title: 'Second-order cumulant fit', formula: 'ln[g₂/B − 1] = ln β − 2Γτ + μ₂τ²   (least squares)', tex: String.raw`\ln\!\left[\dfrac{g_2}{B} - 1\right] = \ln\beta - 2\Gamma\tau + \mu_2\tau^2`, sub: use.length + ' points with g₂/B − 1 > ' + f(cut) + ' × ' + f(ymax) + ';  τ = ' + f(use[0].t) + '–' + f(use[use.length - 1].t) + ' µs;  R² = ' + NC.fix(fit.r2, 5), result: 'c₀ = ' + f(fit.c0) + ',  c₁ = ' + f(fit.c1) + ' µs⁻¹,  c₂ = ' + f(fit.c2) + ' µs⁻²', ref: ['koppel1972', 'frisken2001'] });
      const G = (-fit.c1 / 2) * 1e6, mu2 = fit.c2 * 1e12, beta = Math.exp(fit.c0);
      if (!(G > 0)) NC.fail('The fitted decay rate is not positive; check the data and the fit range.');
      const PDI = mu2 / (G * G);
      s.add({ title: 'Mean decay rate, intercept and polydispersity', formula: 'Γ = −c₁/2,   μ₂ = c₂,   β = e^c₀,   PDI = μ₂/Γ²', tex: String.raw`\Gamma = -\dfrac{c_1}{2},\quad \mu_2 = c_2,\quad \beta = e^{c_0},\quad \text{PDI} = \dfrac{\mu_2}{\Gamma^2}`, sub: 'Γ = ' + f(-fit.c1 / 2) + ' µs⁻¹;  μ₂ = ' + f(fit.c2) + ' µs⁻²', result: 'Γ = ' + f(G) + ' s⁻¹;   β = ' + f(beta, 3) + ';   PDI = ' + f(PDI, 3), ref: ['koppel1972', 'iso22412'] });
      const n = NC.need(v.n, 'Refractive index', { positive: true }), lam = NC.need(v.lam, 'Wavelength', { positive: true }), th = NC.need(v.theta, 'Scattering angle', { gt: 0, lt: 180 });
      const q = (4 * Math.PI * n * Math.sin(NC.rad(th) / 2)) / (lam * 1e-9);
      s.add({ title: 'Scattering vector', formula: 'q = 4πn·sin(θ/2) / λ₀', tex: String.raw`q = \dfrac{4\pi n\sin(\theta/2)}{\lambda_0}`, sub: 'q = 4π × ' + f(n) + ' × sin(' + f(th) + '°/2) / (' + f(lam) + '×10⁻⁹ m)', result: 'q = ' + f(q) + ' m⁻¹', ref: 'berne1976' });
      const D = G / (q * q);
      s.add({ title: 'Diffusion coefficient', formula: 'D = Γ / q²', tex: String.raw`D = \dfrac{\Gamma}{q^2}`, sub: 'D = ' + f(G) + ' / (' + f(q) + ')²', result: 'D = ' + f(D) + ' m²/s = ' + f(D * 1e12) + ' µm²/s' });
      const w = viscosity(v, s);
      const dz = stokesEinstein(s, w, D, 'z-average hydrodynamic diameter (Stokes–Einstein)');
      const warnings = [];
      if (PDI > 0.7) warnings.push('PDI > 0.7: the sample is very broadly distributed and the cumulant result is not meaningful; use a distribution analysis.');
      else if (PDI < -0.05) warnings.push('Negative PDI: the fit range or baseline is probably wrong (or noise dominates).');
      if (beta < 0.1) warnings.push('Low intercept β: weak correlation signal (dust, low count rate or misaligned optics).');
      const tmax = use[use.length - 1].t;
      return {
        results: [
          { label: 'z-average diameter', value: dz, unit: 'nm', main: true },
          { label: 'Polydispersity index PDI', value: PDI, sig: 3, main: true },
          { label: 'Decay rate Γ', value: G, unit: 's⁻¹', main: true },
          { label: 'Diffusion coefficient D', value: D * 1e12, unit: 'µm²/s' },
          { label: 'Intercept β', value: beta, sig: 3 },
          { label: 'Second cumulant μ₂', value: mu2, unit: 's⁻²' }
        ],
        steps: s.items,
        warnings: warnings,
        plots: [{
          title: 'Correlation function', xlabel: 'log₁₀ τ (µs)', ylabel: 'g₂/B − 1', zeroY: true,
          series: [
            { name: 'Data', mode: 'markers', hollow: true, color: 2, points: rows.filter(function (r) { return r[0] > 0; }).map(function (r) { return [Math.log10(r[0]), r[1] / base - 1]; }) },
            { name: 'Cumulant fit', mode: 'line', color: 1, points: rows.filter(function (r) { return r[0] > 0 && r[0] <= tmax * 1.5; }).map(function (r) { return [Math.log10(r[0]), Math.exp(fit.c0 + fit.c1 * r[0] + fit.c2 * r[0] * r[0])]; }) }
          ]
        }],
        notes: ['The z-average is intensity-weighted, so a few large particles or aggregates dominate it.', 'A PDI below about 0.1 is commonly taken to indicate a narrow distribution; the cumulant method itself assumes a reasonably narrow, monomodal sample.']
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
