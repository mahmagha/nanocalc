/* UV-vis spectroscopy: Tauc band gap, QD sizing (Yu 2003), Au NP sizing (Haiss 2007), Beer–Lambert. */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt;

  /* ================================================================== */
  /* Tauc plot                                                           */
  /* ================================================================== */
  const TRANS = {
    da: { p: 2, label: 'direct allowed', ps: '2' },
    ia: { p: 0.5, label: 'indirect allowed', ps: '1/2' },
    df: { p: 2 / 3, label: 'direct forbidden', ps: '2/3' },
    if: { p: 1 / 3, label: 'indirect forbidden', ps: '1/3' }
  };

  NC.register({
    id: 'tauc',
    category: 'optical',
    title: 'Optical band gap (Tauc plot)',
    short: 'Band gap from UV-vis absorbance or diffuse reflectance',
    description:
      'Turns a UV-vis absorption or diffuse-reflectance spectrum into a Tauc plot, (αhν)^p against hν, fits the linear absorption edge and reads the band gap from where the fit crosses the energy axis.',
    refs: ['tauc1966', 'kubelka1931', 'makula2018', 'codata2018'],
    inputs: [
      NC.sel('dtype', 'Data type', [['abs', 'Absorbance A'], ['refl', 'Diffuse reflectance R (%) → Kubelka–Munk']], 'abs'),
      NC.sel('trans', 'Transition type', [['da', 'Direct allowed  (αhν)²'], ['ia', 'Indirect allowed  (αhν)^½'], ['df', 'Direct forbidden  (αhν)^⅔'], ['if', 'Indirect forbidden  (αhν)^⅓']], 'da'),
      NC.num('t', 'Film thickness (optional)', 'nm', NaN, { showIf: function (v) { return v.dtype === 'abs'; }, help: 'If given, α = 2.303·A/t. If left blank, A is used as a quantity proportional to α, which does not change the extrapolated band gap.' }),
      NC.num('emin', 'Fit range start (optional)', 'eV', NaN, { help: 'Leave both blank to select the steepest linear region automatically.' }),
      NC.num('emax', 'Fit range end (optional)', 'eV', NaN),
      NC.data('data', 'Spectrum: λ (nm), A or R (%)', '', { placeholder: '300, 0.512\n302, 0.498\n…', rows: 10 })
    ],
    example: function () {
      const lines = ['# Synthetic direct-gap spectrum, Eg = 3.20 eV', 'wavelength_nm, absorbance'];
      for (let lam = 300; lam <= 500; lam += 2) {
        const E = 1239.84 / lam;
        const A = 0.01 + (E > 3.2 ? (1.5 * Math.sqrt(E - 3.2)) / E : 0);
        lines.push(lam + ', ' + A.toFixed(4));
      }
      return { dtype: 'abs', trans: 'da', t: NaN, emin: NaN, emax: NaN, data: lines.join('\n') };
    },
    compute: function (v) {
      const s = new NC.Steps();
      const tr = TRANS[v.trans] || TRANS.da;
      const p = tr.p;
      const rows = NC.parseRows(v.data, { min: 2, labels: ['λ (nm)', v.dtype === 'refl' ? 'R (%)' : 'A'], name: 'Spectrum' });
      if (rows.length < 5) NC.fail('Enter at least 5 data points (wavelength, signal).');
      const t = v.dtype === 'abs' ? NC.opt(v.t, 'Film thickness', { positive: true }) : null;

      const pts = rows.map(function (r) {
        const lam = NC.need(r[0], 'Wavelength', { positive: true });
        const E = NC.HC_EV_NM / lam;
        let a;
        if (v.dtype === 'refl') {
          const R = r[1] / 100;
          if (!(R > 0 && R <= 1)) NC.fail('Reflectance values must be between 0 and 100 %. Got ' + r[1] + '.');
          a = ((1 - R) * (1 - R)) / (2 * R);
        } else {
          a = t ? (2.302585 * r[1]) / (t * 1e-7) : r[1];
        }
        const base = Math.max(a * E, 0);
        return { lam: lam, sig: r[1], E: E, a: a, y: Math.pow(base, p) };
      });
      pts.sort(function (p1, p2) { return p1.E - p2.E; });

      const r0 = pts[pts.length - 1];
      s.add({ title: 'Photon energy for each point', formula: 'E = hν = hc/λ', sub: 'e.g. E = ' + f(NC.HC_EV_NM, 7) + ' eV·nm / ' + f(r0.lam) + ' nm', result: 'E = ' + f(r0.E) + ' eV', ref: 'codata2018' });
      if (v.dtype === 'refl') {
        s.add({ title: 'Kubelka–Munk function (proportional to α)', formula: 'F(R) = (1 − R)² / (2R),   R as a fraction', sub: 'e.g. R = ' + f(r0.sig / 100) + ':  F = (1 − ' + f(r0.sig / 100) + ')² / (2 × ' + f(r0.sig / 100) + ')', result: 'F(R) = ' + f(r0.a), ref: 'kubelka1931' });
      } else if (t) {
        s.add({ title: 'Absorption coefficient', formula: 'α = 2.303 · A / t', sub: 'e.g. α = 2.303 × ' + f(r0.sig) + ' / (' + f(t) + ' × 10⁻⁷ cm)', result: 'α = ' + f(r0.a) + ' cm⁻¹' });
      } else {
        s.add({ title: 'Absorption coefficient (relative)', formula: 'α ∝ A', result: 'No thickness given, so A is used in place of α. Scaling the y-axis by a constant does not move the x-intercept.' });
      }
      s.add({ title: 'Tauc transformation (' + tr.label + ' transition)', formula: '(αhν)^p = B·(hν − Eg),   p = ' + tr.ps, sub: 'e.g. (' + f(r0.a) + ' × ' + f(r0.E) + ')^' + tr.ps, result: '(αhν)^p = ' + f(r0.y), ref: 'tauc1966' });

      const emin = NC.opt(v.emin, 'Fit range start');
      const emax = NC.opt(v.emax, 'Fit range end');
      let fitPts, fit, how;
      if (emin !== null || emax !== null) {
        const lo = emin !== null ? emin : -Infinity, hi = emax !== null ? emax : Infinity;
        if (lo >= hi) NC.fail('The fit range start must be lower than its end.');
        fitPts = pts.filter(function (q) { return q.E >= lo && q.E <= hi; });
        if (fitPts.length < 3) NC.fail('Only ' + fitPts.length + ' points fall inside the fit range. At least 3 are needed.');
        fit = NC.stats.linreg(fitPts.map(function (q) { return q.E; }), fitPts.map(function (q) { return q.y; }));
        how = 'user-selected range';
      } else {
        const n = pts.length;
        const w = Math.max(5, Math.round(n * 0.1));
        if (n < w) NC.fail('Not enough points for automatic fitting.');
        let best = null, bestScore = -Infinity;
        let fb = null, fbScore = -Infinity;
        for (let i = 0; i + w <= n; i++) {
          const win = pts.slice(i, i + w);
          const r = NC.stats.linreg(win.map(function (q) { return q.E; }), win.map(function (q) { return q.y; }));
          if (!(r.m > 0)) continue;
          if (r.r2 >= 0.99 && r.m > bestScore) { bestScore = r.m; best = { win: win, r: r }; }
          if (r.m * r.r2 > fbScore) { fbScore = r.m * r.r2; fb = { win: win, r: r }; }
        }
        const pick = best || fb;
        if (!pick) NC.fail('No rising absorption edge found. Check the data or set the fit range by hand.');
        fitPts = pick.win;
        fit = pick.r;
        how = 'automatic (steepest ' + w + '-point window' + (best ? ' with R² ≥ 0.99' : ', R² < 0.99') + ')';
      }
      if (!(fit.m > 0)) NC.fail('The fitted slope is not positive, so this region is not an absorption edge. Choose a different fit range.');
      const Eg = -fit.b / fit.m;
      const e1 = fitPts[0].E, e2 = fitPts[fitPts.length - 1].E;
      s.add({ title: 'Linear fit of the absorption edge', formula: '(αhν)^p = m·hν + b   (least squares)', sub: fitPts.length + ' points, ' + f(e1) + '–' + f(e2) + ' eV (' + how + ')', result: 'm = ' + f(fit.m) + ',  b = ' + f(fit.b) + ',  R² = ' + NC.fix(fit.r2, 4) });
      s.add({ title: 'Extrapolate to (αhν)^p = 0', formula: 'Eg = −b / m', sub: 'Eg = −(' + f(fit.b) + ') / ' + f(fit.m), result: 'Eg = ' + f(Eg) + ' eV  (λ_edge = ' + f(NC.HC_EV_NM / Eg) + ' nm)', ref: 'tauc1966' });

      const warnings = [];
      if (fit.r2 < 0.98) warnings.push('The linear fit is poor (R² < 0.98). Check the fit range.');
      if (Eg < pts[0].E || Eg > pts[pts.length - 1].E) warnings.push('The extrapolated band gap lies outside the measured energy range.');
      const ytop = fit.m * e2 + fit.b;
      return {
        results: [
          { label: 'Band gap Eg', value: Eg, unit: 'eV', main: true },
          { label: 'Absorption edge λ', value: NC.HC_EV_NM / Eg, unit: 'nm', main: true },
          { label: 'Fit R²', value: fit.r2, unit: '', sig: 4 },
          { label: 'Fit range', value: f(e1) + '–' + f(e2) + ' eV' },
          { label: 'Transition', value: tr.label }
        ],
        steps: s.items,
        warnings: warnings,
        plots: [{
          title: 'Tauc plot', xlabel: 'Photon energy hν (eV)', ylabel: '(αhν)^' + tr.ps + (t || v.dtype === 'refl' ? '' : ' (arb. units)'),
          series: [
            { name: 'Data', mode: 'line', points: pts.map(function (q) { return [q.E, q.y]; }) },
            { name: 'Fit region', mode: 'markers', color: 1, points: fitPts.map(function (q) { return [q.E, q.y]; }) },
            { name: 'Extrapolation', mode: 'line', dashed: true, color: 2, points: [[Eg, 0], [e2, ytop]] }
          ],
          zeroY: true
        }],
        notes: [
          'Pick the transition type that matches the material, because the exponent changes the answer. For doped, modified or composite materials with sub-gap absorption, Makuła et al. (2018) recommend taking Eg where the edge fit crosses a baseline fitted to the sub-gap tail, rather than where it crosses zero.'
        ]
      };
    }
  });

  /* ================================================================== */
  /* QD size and concentration (Yu et al. 2003)                          */
  /* ================================================================== */
  const YU = {
    CdSe: { D: function (l) { return 1.6122e-9 * Math.pow(l, 4) - 2.6575e-6 * Math.pow(l, 3) + 1.6242e-3 * l * l - 0.4277 * l + 41.57; }, Dtxt: 'D = (1.6122×10⁻⁹)λ⁴ − (2.6575×10⁻⁶)λ³ + (1.6242×10⁻³)λ² − 0.4277λ + 41.57', k: 5857, p: 2.65, range: [450, 650] },
    CdTe: { D: function (l) { return 9.8127e-7 * Math.pow(l, 3) - 1.7147e-3 * l * l + 1.0064 * l - 194.84; }, Dtxt: 'D = (9.8127×10⁻⁷)λ³ − (1.7147×10⁻³)λ² + 1.0064λ − 194.84', k: 10043, p: 2.12, range: [500, 720] },
    CdS: { D: function (l) { return -6.6521e-8 * Math.pow(l, 3) + 1.9557e-4 * l * l - 9.2352e-2 * l + 13.29; }, Dtxt: 'D = (−6.6521×10⁻⁸)λ³ + (1.9557×10⁻⁴)λ² − (9.2352×10⁻²)λ + 13.29', k: 21536, p: 2.3, range: [300, 480] }
  };

  NC.register({
    id: 'qdyu',
    category: 'optical',
    title: 'Quantum dot size & concentration (Yu 2003)',
    short: 'CdSe, CdTe, CdS nanocrystal size and molar concentration from the first exciton peak',
    description:
      'Uses the empirical calibration of Yu, Qu, Guo & Peng (2003) to get the diameter of CdSe, CdTe or CdS quantum dots from the first excitonic absorption peak. If you enter the absorbance at that peak, it also gives the molar extinction coefficient and the particle concentration.',
    refs: ['yu2003', 'jasieniak2009', 'swinehart1962', 'codata2018'],
    inputs: [
      NC.sel('mat', 'Material', [['CdSe', 'CdSe'], ['CdTe', 'CdTe'], ['CdS', 'CdS']], 'CdSe'),
      NC.num('lam', 'First exciton absorption peak λ', 'nm', 550),
      NC.num('A', 'Absorbance at the peak (optional)', '', 0.1),
      NC.num('l', 'Path length', 'cm', 1)
    ],
    example: { mat: 'CdSe', lam: 550, A: 0.1, l: 1 },
    compute: function (v) {
      const s = new NC.Steps();
      const m = YU[v.mat] || YU.CdSe;
      const mat = YU[v.mat] ? v.mat : 'CdSe';
      const lam = NC.need(v.lam, 'Peak wavelength', { positive: true });
      const D = m.D(lam);
      s.add({ title: 'Diameter from the empirical sizing curve (' + mat + ')', formula: m.Dtxt + '   (D in nm, λ in nm)', sub: 'λ = ' + f(lam) + ' nm', result: 'D = ' + f(D) + ' nm', ref: 'yu2003' });
      if (!(D > 0)) NC.fail('The calibration gives a non-physical diameter (' + f(D) + ' nm) at this wavelength. The wavelength is outside the range of the calibration.');
      const eps = m.k * Math.pow(D, m.p);
      s.add({ title: 'Molar extinction coefficient at the first exciton peak', formula: 'ε = ' + m.k + ' · D^' + m.p + '   (M⁻¹·cm⁻¹)', sub: 'ε = ' + m.k + ' × ' + f(D) + '^' + m.p, result: 'ε = ' + f(eps) + ' M⁻¹·cm⁻¹', ref: 'yu2003' });

      const results = [
        { label: 'Diameter D', value: D, unit: 'nm', main: true },
        { label: 'Extinction coefficient ε', value: eps, unit: 'M⁻¹·cm⁻¹', main: true }
      ];
      const A = NC.opt(v.A, 'Absorbance', { nonneg: true });
      if (A !== null) {
        const l = NC.need(v.l, 'Path length', { positive: true });
        const c = A / (eps * l);
        s.add({ title: 'Particle concentration (Beer–Lambert)', formula: 'c = A / (ε·l)', sub: 'c = ' + f(A) + ' / (' + f(eps) + ' × ' + f(l) + ')', result: 'c = ' + f(c) + ' M = ' + f(c * 1e6) + ' μM', ref: 'swinehart1962' });
        const N = (c * NC.C.NA) / 1000;
        s.add({ title: 'Number concentration', formula: 'N = c · N_A / 1000   (per mL)', sub: 'N = ' + f(c) + ' × ' + f(NC.C.NA) + ' / 1000', result: 'N = ' + f(N) + ' particles/mL', ref: 'codata2018' });
        results.push({ label: 'Concentration c', value: c * 1e6, unit: 'μM', main: true }, { label: 'Particles per mL', value: N, unit: 'mL⁻¹' });
      }
      const warnings = [];
      if (D < 1 || D > 10) warnings.push('D = ' + f(D) + ' nm is outside ~1–10 nm, so this is an extrapolation beyond the calibration data of Yu et al. and is unreliable.');
      if (A !== null && A > 1.5) warnings.push('Absorbance above ~1.5 may be outside the linear Beer–Lambert range. Dilute the sample and measure again.');

      const curve = [];
      for (let x = m.range[0]; x <= m.range[1]; x += 2) curve.push([x, m.D(x)]);
      return {
        results: results,
        steps: s.items,
        warnings: warnings,
        plots: [{
          title: mat + ' sizing curve', xlabel: 'First exciton peak λ (nm)', ylabel: 'Diameter D (nm)',
          series: [{ name: 'Yu et al. (2003)', mode: 'line', points: curve }, { name: 'This sample', mode: 'markers', color: 1, size: 5, points: [[lam, D]] }]
        }],
        notes: [
          'Yu et al. based their extinction coefficients on the absorbance at the first exciton peak. Inhomogeneous broadening, i.e. a wide size distribution, can bias the concentration. See the original paper for their linewidth correction.',
          'For CdSe, Jasieniak et al. (2009) published a refined sizing and extinction calibration that you may prefer for precise work.'
        ]
      };
    }
  });

  /* ================================================================== */
  /* Gold nanoparticle size and concentration (Haiss et al. 2007)        */
  /* ================================================================== */
  NC.register({
    id: 'haiss',
    category: 'optical',
    title: 'Gold nanoparticle size & concentration (Haiss 2007)',
    short: 'Au NP diameter and number concentration from the UV-vis spectrum',
    description:
      'Estimates the diameter of spherical gold nanoparticles from the ratio of the absorbance at the surface plasmon resonance peak to the absorbance at 450 nm, then the number concentration from A₄₅₀, following Haiss et al. (2007). For larger particles it can also size them from the SPR peak position.',
    refs: ['haiss2007', 'codata2018'],
    inputs: [
      NC.num('Aspr', 'Absorbance at SPR peak A_spr', '', 0.8),
      NC.num('A450', 'Absorbance at 450 nm A₄₅₀', '', 0.5),
      NC.num('lspr', 'SPR peak wavelength λ_spr (optional)', 'nm', NaN, { help: 'Optional. Used for the peak-position method, which Haiss et al. recommend only for d > 25 nm.' })
    ],
    example: { Aspr: 0.8, A450: 0.5, lspr: NaN },
    compute: function (v) {
      const s = new NC.Steps();
      const Aspr = NC.need(v.Aspr, 'A_spr', { positive: true });
      const A450 = NC.need(v.A450, 'A₄₅₀', { positive: true });
      const ratio = Aspr / A450;
      s.add({ title: 'Absorbance ratio', formula: 'r = A_spr / A₄₅₀', sub: 'r = ' + f(Aspr) + ' / ' + f(A450), result: 'r = ' + f(ratio) });
      const d = Math.exp(3.0 * ratio - 2.2);
      s.add({ title: 'Diameter from the absorbance ratio', formula: 'd = exp(B₁·r − B₂),   B₁ = 3.00,  B₂ = 2.20', sub: 'd = exp(3.00 × ' + f(ratio) + ' − 2.20)', result: 'd = ' + f(d) + ' nm', ref: 'haiss2007' });
      const g = -0.295 + 1.36 * Math.exp(-Math.pow((d - 96.8) / 78.2, 2));
      if (!(g > 0)) NC.fail('The concentration formula is not defined for d = ' + f(d) + ' nm.');
      const N = (A450 * 1e14) / (d * d * g);
      s.add({ title: 'Number concentration from A₄₅₀', formula: 'N = A₄₅₀ × 10¹⁴ / { d² · [−0.295 + 1.36·exp(−((d − 96.8)/78.2)²)] }   (particles/mL)', sub: 'N = ' + f(A450) + ' × 10¹⁴ / (' + f(d) + '² × ' + f(g) + ')', result: 'N = ' + f(N) + ' particles/mL', ref: 'haiss2007' });
      const cnM = ((N * 1000) / NC.C.NA) * 1e9;
      s.add({ title: 'Molar particle concentration', formula: 'c = N × 1000 / N_A', sub: 'c = ' + f(N) + ' × 1000 / ' + f(NC.C.NA) + ' mol⁻¹', result: 'c = ' + f(cnM) + ' nM', ref: 'codata2018' });

      const results = [
        { label: 'Diameter d (ratio method)', value: d, unit: 'nm', main: true },
        { label: 'Particles per mL', value: N, unit: 'mL⁻¹', main: true },
        { label: 'Molar concentration', value: cnM, unit: 'nM', main: true },
        { label: 'A_spr / A₄₅₀', value: ratio, unit: '' }
      ];
      const warnings = [];
      const lspr = NC.opt(v.lspr, 'SPR wavelength', { positive: true });
      if (lspr !== null) {
        if (lspr <= 512 + 6.53) {
          warnings.push('λ_spr must be above ~519 nm for the peak-position method. Skipped.');
        } else {
          const d2 = Math.log((lspr - 512) / 6.53) / 0.0216;
          s.add({ title: 'Diameter from SPR peak position', formula: 'd = ln[(λ_spr − λ₀)/L₁] / L₂,   λ₀ = 512 nm,  L₁ = 6.53,  L₂ = 0.0216', sub: 'd = ln[(' + f(lspr) + ' − 512) / 6.53] / 0.0216', result: 'd = ' + f(d2) + ' nm', note: 'Haiss et al. recommend this method only for d > 25 nm.', ref: 'haiss2007' });
          results.push({ label: 'Diameter d (SPR position)', value: d2, unit: 'nm' });
          if (d2 < 25) warnings.push('The peak-position method is recommended only for d > 25 nm. Use the ratio result for smaller particles.');
        }
      }
      if (d < 5 || d > 100) warnings.push('d = ' + f(d) + ' nm is outside the usual range of this calibration. Check the validated range in Haiss et al. (2007).');
      return {
        results: results,
        steps: s.items,
        warnings: warnings,
        notes: ['The calibration is for spherical, citrate-type gold nanoparticles in water. Non-spherical particles, aggregation, other solvents or shells change the spectrum. Check that your system falls within the range validated in the paper.']
      };
    }
  });

  /* ================================================================== */
  /* Beer–Lambert                                                        */
  /* ================================================================== */
  NC.register({
    id: 'beer',
    category: 'optical',
    title: 'Beer–Lambert law',
    short: 'Solve A = ε·l·c for concentration, absorbance or ε',
    description: 'Relates absorbance to concentration, path length and molar extinction coefficient. Enter any three to solve for the fourth.',
    refs: ['swinehart1962'],
    inputs: [
      NC.sel('mode', 'Solve for', [['c', 'Concentration c'], ['A', 'Absorbance A'], ['eps', 'Extinction coefficient ε']], 'c'),
      NC.num('A', 'Absorbance A', '', 0.5, { showIf: function (v) { return v.mode !== 'A'; } }),
      NC.num('eps', 'Molar extinction coefficient ε', 'M⁻¹·cm⁻¹', 100000, { showIf: function (v) { return v.mode !== 'eps'; } }),
      NC.num('l', 'Path length l', 'cm', 1),
      NC.num('c', 'Concentration c', 'μM', 5, { showIf: function (v) { return v.mode !== 'c'; } })
    ],
    example: { mode: 'c', A: 0.5, eps: 100000, l: 1, c: 5 },
    compute: function (v) {
      const s = new NC.Steps();
      const l = NC.need(v.l, 'Path length', { positive: true });
      s.add({ title: 'Beer–Lambert law', formula: 'A = ε · l · c', ref: 'swinehart1962' });
      let A, eps, c;
      if (v.mode === 'A') {
        eps = NC.need(v.eps, 'ε', { positive: true });
        c = NC.need(v.c, 'Concentration', { nonneg: true });
        A = eps * l * c * 1e-6;
        s.add({ title: 'Absorbance', formula: 'A = ε·l·c', sub: 'A = ' + f(eps) + ' × ' + f(l) + ' × ' + f(c) + '×10⁻⁶ M', result: 'A = ' + f(A) });
      } else if (v.mode === 'eps') {
        A = NC.need(v.A, 'Absorbance', { nonneg: true });
        c = NC.need(v.c, 'Concentration', { positive: true });
        eps = A / (l * c * 1e-6);
        s.add({ title: 'Extinction coefficient', formula: 'ε = A / (l·c)', sub: 'ε = ' + f(A) + ' / (' + f(l) + ' × ' + f(c) + '×10⁻⁶ M)', result: 'ε = ' + f(eps) + ' M⁻¹·cm⁻¹' });
      } else {
        A = NC.need(v.A, 'Absorbance', { nonneg: true });
        eps = NC.need(v.eps, 'ε', { positive: true });
        c = (A / (eps * l)) * 1e6;
        s.add({ title: 'Concentration', formula: 'c = A / (ε·l)', sub: 'c = ' + f(A) + ' / (' + f(eps) + ' × ' + f(l) + ')', result: 'c = ' + f(c * 1e-6) + ' M = ' + f(c) + ' μM' });
      }
      const warnings = [];
      if (A > 1.5) warnings.push('Absorbance above ~1.5 is often outside the linear range, because of stray light and instrument limits. Dilute the sample and measure again.');
      return {
        results: [
          { label: 'Absorbance A', value: A, unit: '', main: v.mode === 'A' },
          { label: 'Extinction coefficient ε', value: eps, unit: 'M⁻¹·cm⁻¹', main: v.mode === 'eps' },
          { label: 'Concentration c', value: c, unit: 'μM', main: v.mode === 'c' },
          { label: 'Transmittance T', value: Math.pow(10, -A) * 100, unit: '%' }
        ],
        steps: s.items,
        warnings: warnings
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
