/*
 * Porosity from gas-sorption isotherms (PLAN.md Plan 3):
 *   t-plot (Lippens & de Boer): micropore volume and external surface area
 *   BJH (Barrett, Joyner & Halenda): mesopore size distribution from a full isotherm branch
 * Shared numerical cores are exposed as NC.sorption for the tests and the pyGAPS cross-validation.
 */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt, C = NC.C;

  NC.addRefs({
    lippens1965: { doi: '10.1016/0021-9517(65)90307-6', type: 'article', authors: 'Lippens, B. C.; de Boer, J. H.', title: 'Studies on pore systems in catalysts: V. The t method', journal: 'J. Catal.', year: 1965, volume: '4', pages: '319–323' },
    halsey1948: { doi: '10.1063/1.1746689', type: 'article', authors: 'Halsey, G.', title: 'Physical adsorption on non-uniform surfaces', journal: 'J. Chem. Phys.', year: 1948, volume: '16', pages: '931–937' },
    iacomi2019: { doi: '10.1007/s10450-019-00168-5', type: 'article', authors: 'Iacomi, P.; Llewellyn, P. L.', title: 'pyGAPS: a Python-based framework for adsorption isotherm processing and material characterisation', journal: 'Adsorption', year: 2019, volume: '25', pages: '1533–1542' }
  });

  /* ------------------------------------------------------------------ */
  /* Shared cores                                                        */
  /* ------------------------------------------------------------------ */
  const T_CURVES = {
    hj: {
      label: 'Harkins–Jura (N₂, 77 K)',
      ref: 'harkins1944',
      formula: 't [nm] = [0.1399 / (0.034 − log₁₀(p/p₀))]^½',
      tex: 't\\,[\\mathrm{nm}] = \\left[\\dfrac{0.1399}{0.034 - \\log_{10}(p/p_0)}\\right]^{1/2}',
      t: function (x) { return Math.sqrt(0.1399 / (0.034 - Math.log10(x))); }
    },
    halsey: {
      label: 'Halsey (N₂, 77 K)',
      ref: 'halsey1948',
      formula: 't [nm] = 0.354 · [−5 / ln(p/p₀)]^⅓',
      tex: 't\\,[\\mathrm{nm}] = 0.354\\left[\\dfrac{-5}{\\ln(p/p_0)}\\right]^{1/3}',
      t: function (x) { return 0.354 * Math.cbrt(-5 / Math.log(x)); }
    }
  };
  const tOptions = Object.keys(T_CURVES).map(function (k) { return [k, T_CURVES[k].label]; });

  /** Gas volume at STP (cm³/g) → liquid volume (cm³/g): factor M / (ρ_L · V_mol). */
  function liquidFactor(M, rho) { return M / (rho * NC.VM_STP); }

  /** Kelvin radius in nm; fac = 2 for a hemispherical meniscus, 1 for a cylindrical one. */
  function kelvinRadius(x, gamma, VL, T, fac) {
    return (-fac * gamma * VL) / (C.R * T * Math.log(x)) * 1e9;
  }

  /**
   * t-plot: straight line V_ads = s·t + i over t in [tmin, tmax].
   * Returns slope, intercept, external area (m²/g) and micropore volume (cm³ liquid/g).
   */
  function tplot(rows, opt) {
    const tc = T_CURVES[opt.curve];
    const all = rows.map(function (r) { return { x: r[0], V: r[1], t: tc.t(r[0]) }; });
    const fit = all.filter(function (p) { return p.t >= opt.tmin - 1e-12 && p.t <= opt.tmax + 1e-12; });
    if (fit.length < 3) NC.fail('Only ' + fit.length + ' point(s) have a film thickness between ' + opt.tmin + ' and ' + opt.tmax + ' nm. At least 3 are needed.');
    const lr = NC.stats.linreg(fit.map(function (p) { return p.t; }), fit.map(function (p) { return p.V; }));
    const k = liquidFactor(opt.M, opt.rho);
    return { all: all, fit: fit, lr: lr, k: k, Sext: lr.m * k * 1e3, Vmic: lr.b * k };
  }

  /**
   * BJH (Barrett, Joyner & Halenda 1951) for cylindrical pores, in the form used by pyGAPS
   * (psd_bjh): intervals between successive points, from high to low pressure.
   * rows: [p/p0, V (cm³ STP/g)]; returns per-interval arrays, highest pressure first.
   */
  function bjh(rows, opt) {
    const tc = T_CURVES[opt.curve];
    const k = liquidFactor(opt.M, opt.rho);
    const VL = opt.M / opt.rho * 1e-6; // m³/mol
    const pts = rows.slice().sort(function (a, b) { return b[0] - a[0]; }).map(function (r) {
      const t = tc.t(r[0]);
      const rk = kelvinRadius(r[0], opt.gamma, VL, opt.T, opt.fac);
      return { x: r[0], Vg: r[1], V: r[1] * k, t: t, rk: rk, rp: rk + t };
    });
    const iv = [];
    for (let n = 1; n < pts.length; n++) {
      const a = pts[n - 1], b = pts[n];
      const dV = a.V - b.V, dt = a.t - b.t;
      const tbar = (a.t + b.t) / 2, rkbar = (a.rk + b.rk) / 2, rpbar = (a.rp + b.rp) / 2;
      const R = Math.pow(rpbar / (rkbar + dt), 2);
      let sumA = 0;
      iv.forEach(function (j) { sumA += (j.rpbar - tbar) / j.rpbar * j.A; });
      const dVt = dt * sumA * 1e-3; // nm × m² = 1e-3 cm³
      const Vp = (dV - dVt) * R;
      const A = 2 * Vp / rpbar * 1e3; // cm³/nm → m²
      iv.push({ xHi: a.x, xLo: b.x, dV: dV, dt: dt, tbar: tbar, rkbar: rkbar, rpbar: rpbar, R: R, sumA: sumA, dVt: dVt, Vp: Vp, A: A,
        Dhi: 2 * a.rp, Dlo: 2 * b.rp, Dbar: 2 * rpbar, dVdD: Vp / (2 * (a.rp - b.rp)) });
    }
    let cum = 0, cumA = 0;
    iv.forEach(function (j) { cum += j.Vp; cumA += j.A; j.cumV = cum; j.cumA = cumA; });
    return { pts: pts, iv: iv, k: k, Vtot: cum, Atot: cumA };
  }

  NC.sorption = { T_CURVES: T_CURVES, tplot: tplot, bjh: bjh, kelvinRadius: kelvinRadius, liquidFactor: liquidFactor };

  function parseIsotherm(text) {
    const rows = NC.parseRows(text, { min: 2, labels: ['p/p₀', 'V_ads'], name: 'Isotherm data' });
    if (!rows.length) NC.fail('Paste the isotherm data (p/p₀, adsorbed volume) to run the analysis.');
    rows.forEach(function (r) {
      if (!(r[0] > 0 && r[0] < 1)) NC.fail('Relative pressures must lie between 0 and 1 (found ' + r[0] + ').');
      if (!(r[1] >= 0)) NC.fail('Adsorbed volumes must not be negative (found ' + r[1] + ').');
    });
    return rows;
  }

  const N2 = { M: 28.0134, rho: 0.808, gamma: 8.85, T: 77.35 };
  const adsorbateInputs = [
    NC.num('M', 'Molar mass of adsorptive M', 'g/mol', N2.M),
    NC.num('rho', 'Liquid density of adsorptive ρ_L', 'g/cm³', N2.rho)
  ];
  const n2Preset = { label: 'N₂ at 77 K', values: { M: N2.M, rho: N2.rho } };
  const n2Note = 'Liquid N₂ at 77 K: ρ_L = 0.808 g/cm³ and γ = 8.85 mN/m (Lowell et al. 2004); M from the IUPAC standard atomic weights. The t-curves are for N₂ at 77 K only.';

  /* ------------------------------------------------------------------ */
  /* Example isotherms (synthetic, from the models themselves)           */
  /* ------------------------------------------------------------------ */
  // t-plot: micropores (0.10 cm³/g liquid, Langmuir filling, K = 10⁵) + 80 m²/g external surface
  function tplotExample() {
    const k = liquidFactor(N2.M, N2.rho), hj = T_CURVES.hj.t;
    const lines = ['p/p0, V_ads'];
    const xs = [0.005, 0.01, 0.02, 0.03, 0.05, 0.07, 0.09, 0.11, 0.13, 0.15, 0.18, 0.21, 0.24, 0.27, 0.30, 0.35, 0.40, 0.45, 0.50];
    xs.forEach(function (x) {
      const Vliq = 0.10 * 1e5 * x / (1 + 1e5 * x) + 80 * hj(x) * 1e-3;
      lines.push(x.toFixed(3) + ', ' + (Vliq / k).toFixed(3));
    });
    return lines.join('\n');
  }

  // BJH: Gaussian distribution of cylindrical pores (mean 7 nm, sd 0.8 nm, 0.60 cm³/g)
  // plus 30 m²/g of external surface; desorption branch built with the same Kelvin + t model.
  function bjhExample() {
    const k = liquidFactor(N2.M, N2.rho), hj = T_CURVES.hj.t, VL = N2.M / N2.rho * 1e-6;
    const lines = ['p/p0, V_ads (desorption)'];
    const nD = 600, Dmin = 3, Dmax = 12, dD = (Dmax - Dmin) / nD, sd = 0.8, mean = 7, Vp0 = 0.60;
    const xs = [];
    for (let x = 0.99; x > 0.425; x -= 0.02) xs.push(Math.round(x * 1000) / 1000);
    xs.forEach(function (x) {
      const t = hj(x), rc = kelvinRadius(x, N2.gamma * 1e-3, VL, N2.T, 2) + t;
      let V = 30 * t * 1e-3;
      for (let i = 0; i < nD; i++) {
        const D = Dmin + (i + 0.5) * dD, r = D / 2;
        const w = Vp0 * Math.exp(-0.5 * Math.pow((D - mean) / sd, 2)) / (sd * Math.sqrt(2 * Math.PI)) * dD;
        V += r <= rc ? w : w * (1 - Math.pow((r - t) / r, 2));
      }
      lines.push(x.toFixed(2) + ', ' + (V / k).toFixed(3));
    });
    return lines.join('\n');
  }

  /* ------------------------------------------------------------------ */
  /* t-plot                                                              */
  /* ------------------------------------------------------------------ */
  NC.register({
    id: 'tplot',
    category: 'surface',
    title: 't-plot (micropore volume and external area)',
    short: 'Micropore volume and external surface area from the adsorbed amount against film thickness',
    description:
      'Converts each relative pressure into the statistical thickness t of the adsorbed film on a non-porous reference surface, then fits a straight line to V_ads against t. The slope gives the external (non-micropore) surface area and the intercept gives the micropore volume.',
    refs: ['lippens1965', 'harkins1944', 'halsey1948', 'thommes2015', 'lowell2004'],
    presets: [n2Preset],
    presetNote: n2Note,
    inputs: [
      NC.sel('curve', 'Thickness curve t(p/p₀)', tOptions, 'hj'),
      NC.num('tmin', 'Fit range: smallest t', 'nm', 0.35),
      NC.num('tmax', 'Fit range: largest t', 'nm', 0.5)
    ].concat(adsorbateInputs, [
      NC.data('data', 'Isotherm data: p/p₀, V_ads (cm³ STP per g)', '', { placeholder: '0.10, 72.4\n0.15, 75.0\n…', help: 'Adsorption branch, two columns. A header line is skipped.' })
    ]),
    example: function () { return { curve: 'hj', tmin: 0.35, tmax: 0.5, M: N2.M, rho: N2.rho, data: tplotExample() }; },
    compute: function (v) {
      const s = new NC.Steps();
      const tmin = NC.need(v.tmin, 'Smallest t', { positive: true });
      const tmax = NC.need(v.tmax, 'Largest t', { positive: true });
      if (tmax <= tmin) NC.fail('The largest t of the fit range must be larger than the smallest.');
      const M = NC.need(v.M, 'Molar mass', { positive: true });
      const rho = NC.need(v.rho, 'Liquid density', { positive: true });
      const tc = T_CURVES[v.curve] || T_CURVES.hj;
      const rows = parseIsotherm(v.data).sort(function (a, b) { return a[0] - b[0]; });
      const r = tplot(rows, { curve: v.curve in T_CURVES ? v.curve : 'hj', tmin: tmin, tmax: tmax, M: M, rho: rho });
      const p0 = r.fit[0];

      s.add({ title: 'Statistical film thickness', formula: tc.formula, tex: tc.tex, sub: 'e.g. first fitted point, p/p₀ = ' + f(p0.x), result: 't = ' + f(p0.t) + ' nm  (' + r.fit.length + ' points with ' + f(tmin) + ' ≤ t ≤ ' + f(tmax) + ' nm, see table)', note: 'The t-curve is the film thickness on a non-porous reference solid. It should match the surface chemistry of the sample.', ref: tc.ref });
      s.add({ title: 't-plot', formula: 'V_ads = s·t + i', note: 'On a surface without micropores the line passes through the origin. Filled micropores add a constant amount, which shows up as a positive intercept.', ref: 'lippens1965' });
      s.add({ title: 'Least-squares line', formula: 'V_ads = s·t + i', result: 's = ' + f(r.lr.m) + ' cm³ STP g⁻¹ nm⁻¹,   i = ' + f(r.lr.b) + ' cm³ STP/g,   R² = ' + NC.fix(r.lr.r2, 6) });
      s.add({ title: 'Gas volume to liquid volume', formula: 'k = M / (ρ_L · V_mol)', tex: 'k = \\dfrac{M}{\\rho_L V_{\\text{mol}}}', sub: 'k = ' + f(M) + ' / (' + f(rho) + ' × ' + f(NC.VM_STP, 7) + ')', result: 'k = ' + f(r.k) + ' cm³ liquid per cm³ STP', note: 'Assumes the adsorbed film has the density of the bulk liquid.', ref: 'lowell2004' });
      s.add({ title: 'External surface area', formula: 'S_ext = s · k · 10³', tex: 'S_{\\text{ext}} = s\\,k \\times 10^{3}', sub: 'S_ext = ' + f(r.lr.m) + ' × ' + f(r.k) + ' × 10³', result: 'S_ext = ' + f(r.Sext) + ' m²/g', note: 'A film of thickness t (nm) on area S (m²) holds S·t·10⁻³ cm³ of liquid, so the slope in liquid volume per nm, times 10³, is the area in m².', ref: ['lippens1965', 'lowell2004'] });
      s.add({ title: 'Micropore volume', formula: 'V_mic = i · k', tex: 'V_{\\text{mic}} = i\\,k', sub: 'V_mic = ' + f(r.lr.b) + ' × ' + f(r.k), result: 'V_mic = ' + f(r.Vmic) + ' cm³/g', ref: ['lippens1965', 'thommes2015'] });

      const warnings = [];
      if (r.lr.b < 0 && Math.abs(r.Vmic) > 0.002) warnings.push('The intercept is negative. The t-curve does not match this surface, or the fit range includes capillary condensation. Choose another t-curve or a lower range.');
      if (r.lr.r2 < 0.995) warnings.push('R² = ' + NC.fix(r.lr.r2, 4) + ', so the t-plot is not straight in this range. Mesopore filling or incomplete micropore filling may be inside the range.');
      if (tmin < 0.35) warnings.push('t below about 0.35 nm (one layer of N₂) is usually affected by micropore filling, so the line should start above it.');
      const tmaxAll = Math.max.apply(null, r.all.map(function (p) { return p.t; }));
      return {
        results: [
          { label: 'External surface area S_ext', value: r.Sext, unit: 'm²/g', main: true },
          { label: 'Micropore volume V_mic', value: r.Vmic, unit: 'cm³/g', main: true },
          { label: 'Slope s', value: r.lr.m, unit: 'cm³ STP g⁻¹ nm⁻¹' },
          { label: 'Intercept i', value: r.lr.b, unit: 'cm³ STP/g' },
          { label: 'R² of t-plot fit', value: r.lr.r2, sig: 6 },
          { label: 'Points used', value: String(r.fit.length) }
        ],
        steps: s.items,
        warnings: warnings,
        tables: [{
          title: 'Isotherm points with film thickness',
          columns: ['p/p₀', 'V_ads (cm³ STP/g)', 't (nm)', 'In fit'],
          rows: r.all.map(function (p) { return [f(p.x), f(p.V), f(p.t), p.t >= tmin - 1e-12 && p.t <= tmax + 1e-12 ? 'yes' : '']; })
        }],
        plots: [{
          title: 't-plot', xlabel: 'Film thickness t (nm)', ylabel: 'V_ads (cm³ STP/g)',
          series: [
            { name: 'All points', mode: 'markers', hollow: true, points: r.all.map(function (p) { return [p.t, p.V]; }) },
            { name: 'Fit points', mode: 'markers', color: 1, points: r.fit.map(function (p) { return [p.t, p.V]; }) },
            { name: 'Linear fit', mode: 'line', color: 1, points: [[0, r.lr.b], [tmaxAll, r.lr.m * tmaxAll + r.lr.b]] }
          ],
          xmin: 0, zeroY: true
        }],
        notes: ['Report the t-curve and the t range with the result. IUPAC (2015) notes that the t-plot micropore volume is approximate; NLDFT kernels give a fuller picture for micropores.']
      };
    }
  });

  /* ------------------------------------------------------------------ */
  /* BJH                                                                 */
  /* ------------------------------------------------------------------ */
  NC.register({
    id: 'bjh',
    category: 'surface',
    title: 'BJH pore-size distribution',
    short: 'Mesopore volume and area distribution from a full desorption or adsorption branch',
    description:
      'Steps down the isotherm from high to low pressure. In each interval the newly emptied pores are sized with the Kelvin equation plus the film thickness, and their volume is corrected for the film that thins in pores emptied earlier (Barrett, Joyner & Halenda 1951). Gives the pore volume and area in each size class, dV/dD, and the totals.',
    refs: ['bjh1951', 'thomson1871', 'harkins1944', 'halsey1948', 'thommes2015', 'lowell2004', 'iacomi2019'],
    presets: [{ label: 'N₂ at 77 K', values: { M: N2.M, rho: N2.rho, gamma: N2.gamma, T: N2.T } }],
    presetNote: n2Note,
    inputs: [
      NC.sel('branch', 'Isotherm branch', [['des', 'Desorption (hemispherical meniscus)'], ['ads', 'Adsorption (cylindrical meniscus)']], 'des'),
      NC.sel('curve', 'Thickness curve t(p/p₀)', tOptions, 'hj'),
      NC.num('xmin', 'Use points from p/p₀', '', 0.35),
      NC.num('xmax', 'up to p/p₀', '', 0.995),
      NC.num('gamma', 'Surface tension of adsorptive γ', 'mN/m', N2.gamma),
      NC.num('T', 'Temperature T', 'K', N2.T)
    ].concat(adsorbateInputs, [
      NC.data('data', 'Isotherm branch: p/p₀, V_ads (cm³ STP per g)', '', { placeholder: '0.99, 420\n0.97, 418\n…', help: 'One branch, two columns, in any order. A header line is skipped.' })
    ]),
    example: function () { return { branch: 'des', curve: 'hj', xmin: 0.35, xmax: 0.995, gamma: N2.gamma, T: N2.T, M: N2.M, rho: N2.rho, data: bjhExample() }; },
    compute: function (v) {
      const s = new NC.Steps();
      const xmin = NC.need(v.xmin, 'Lowest p/p₀', { gt: 0, lt: 1 });
      const xmax = NC.need(v.xmax, 'Highest p/p₀', { gt: 0, lt: 1 });
      if (xmax <= xmin) NC.fail('The highest p/p₀ must be larger than the lowest.');
      const gamma = NC.need(v.gamma, 'Surface tension', { positive: true }) * 1e-3;
      const T = NC.need(v.T, 'Temperature', { positive: true });
      const M = NC.need(v.M, 'Molar mass', { positive: true });
      const rho = NC.need(v.rho, 'Liquid density', { positive: true });
      const curve = v.curve in T_CURVES ? v.curve : 'hj';
      const tc = T_CURVES[curve];
      const fac = v.branch === 'ads' ? 1 : 2;
      const rows = parseIsotherm(v.data).filter(function (r) { return r[0] >= xmin - 1e-12 && r[0] <= xmax + 1e-12; });
      if (rows.length < 4) NC.fail('Only ' + rows.length + ' point(s) lie between p/p₀ = ' + xmin + ' and ' + xmax + '. At least 4 are needed.');
      const r = bjh(rows, { curve: curve, gamma: gamma, T: T, M: M, rho: rho, fac: fac });
      const VL = M / rho;
      const p1 = r.pts[0], j1 = r.iv[0], j2 = r.iv[1];

      s.add({ title: 'Liquid volume adsorbed', formula: 'V_liq = V_ads · M / (ρ_L · V_mol)', tex: 'V_{\\text{liq}} = V_{\\text{ads}}\\,\\dfrac{M}{\\rho_L V_{\\text{mol}}}', sub: 'first point: V_liq = ' + f(p1.Vg) + ' × ' + f(M) + ' / (' + f(rho) + ' × ' + f(NC.VM_STP, 7) + ')', result: 'V_liq = ' + f(p1.V) + ' cm³/g at p/p₀ = ' + f(p1.x), ref: 'lowell2004' });
      s.add({ title: 'Kelvin radius at each point', formula: 'r_K = −' + (fac === 2 ? '2' : '') + 'γ·V_L / [R·T·ln(p/p₀)],   V_L = M/ρ_L', sub: 'r_K = −' + fac + ' × ' + f(gamma) + ' N/m × ' + f(VL * 1e-6) + ' m³/mol / (' + f(C.R) + ' × ' + f(T) + ' × ln ' + f(p1.x) + ')', result: 'r_K = ' + f(p1.rk) + ' nm at p/p₀ = ' + f(p1.x), note: fac === 2 ? 'Desorption from an open cylindrical pore proceeds from a hemispherical meniscus.' : 'Condensation on the adsorption branch starts from a cylindrical film (meniscus factor 1).', ref: ['thomson1871', 'lowell2004'] });
      s.add({ title: 'Film thickness and pore radius', formula: tc.formula + ';   r_p = r_K + t', sub: 'p/p₀ = ' + f(p1.x) + ': t = ' + f(p1.t) + ' nm', result: 'r_p = ' + f(p1.rk) + ' + ' + f(p1.t) + ' = ' + f(p1.rp) + ' nm', ref: [tc.ref, 'bjh1951'] });
      s.add({
        title: 'Volume of pores emptied in interval n',
        formula: 'V_p,n = R_n·[ΔV_n − Δt_n · Σ_j c_j·A_p,j],   R_n = [r̄_p,n / (r̄_K,n + Δt_n)]²,   c_j = (r̄_p,j − t̄_n)/r̄_p,j',
        tex: 'V_{p,n} = R_n\\Big[\\Delta V_n - \\Delta t_n \\sum_{j<n} c_j A_{p,j}\\Big],\\quad R_n = \\left(\\dfrac{\\bar r_{p,n}}{\\bar r_{K,n} + \\Delta t_n}\\right)^2,\\quad c_j = \\dfrac{\\bar r_{p,j} - \\bar t_n}{\\bar r_{p,j}}',
        note: 'ΔV_n is the liquid desorbed between two points. Part of it comes from the film thinning by Δt_n on the walls of pores already emptied (area A_p,j); the rest is the core of newly emptied pores, which R_n scales up to the full pore volume.',
        ref: 'bjh1951'
      });
      s.add({ title: 'Interval 1 (no earlier pores)', formula: 'V_p,1 = R_1·ΔV_1', sub: 'R_1 = [' + f(j1.rpbar) + ' / (' + f(j1.rkbar) + ' + ' + f(j1.dt) + ')]² = ' + f(j1.R) + ';   ΔV_1 = ' + f(j1.dV) + ' cm³/g', result: 'V_p,1 = ' + f(j1.Vp) + ' cm³/g', ref: 'bjh1951' });
      if (j2) s.add({ title: 'Interval 2 (film correction)', formula: 'V_p,2 = R_2·[ΔV_2 − Δt_2·c_1·A_p,1]', sub: 'V_p,2 = ' + f(j2.R) + ' × [' + f(j2.dV) + ' − ' + f(j2.dt) + ' nm × ' + f(j2.sumA) + ' m²/g × 10⁻³]', result: 'V_p,2 = ' + f(j2.Vp) + ' cm³/g', note: 'nm × m² = 10⁻³ cm³.', ref: 'bjh1951' });
      s.add({ title: 'Pore area of each class', formula: 'A_p = 2·V_p / r̄_p  (cylinder)', tex: 'A_p = \\dfrac{2 V_p}{\\bar r_p}', sub: 'A_p,1 = 2 × ' + f(j1.Vp) + ' cm³/g / ' + f(j1.rpbar) + ' nm × 10³', result: 'A_p,1 = ' + f(j1.A) + ' m²/g', ref: 'bjh1951' });
      s.add({ title: 'Distribution and totals', formula: 'dV/dD = V_p,n / (D_n−1 − D_n);   V_BJH = Σ V_p;   S_BJH = Σ A_p', result: 'V_BJH = ' + f(r.Vtot) + ' cm³/g;   S_BJH = ' + f(r.Atot) + ' m²/g', ref: 'bjh1951' });

      let mode = r.iv[0];
      r.iv.forEach(function (j) { if (j.dVdD > mode.dVdD) mode = j; });
      const Dmean = 4 * r.Vtot / r.Atot * 1e3;
      s.add({ title: 'Mode and mean pore diameter', formula: 'D_mode at the maximum of dV/dD;   D̄ = 4·V_BJH / S_BJH', tex: '\\bar D = \\dfrac{4 V_{\\text{BJH}}}{S_{\\text{BJH}}}', sub: 'D̄ = 4 × ' + f(r.Vtot) + ' cm³/g / ' + f(r.Atot) + ' m²/g × 10³', result: 'D_mode = ' + f(mode.Dbar) + ' nm;   D̄ = ' + f(Dmean) + ' nm', ref: 'lowell2004' });

      const warnings = [];
      const neg = r.iv.filter(function (j) { return j.Vp < 0; }).length;
      if (neg) warnings.push(neg + ' interval(s) give a negative pore volume: the film correction is larger than the desorbed amount. This happens at low pressure or when the t-curve does not suit the surface.');
      if (fac === 2 && r.pts[r.pts.length - 1].x < 0.42) warnings.push('Desorption points below p/p₀ ≈ 0.42 (N₂, 77 K) are affected by cavitation, which creates a false peak near 3.8 nm. Raise the lower limit or use the adsorption branch.');
      if (Math.min.apply(null, r.iv.map(function (j) { return j.Dlo; })) < 2) warnings.push('Some classes are below 2 nm (micropores), where the Kelvin equation does not apply.');
      return {
        results: [
          { label: 'BJH pore volume V_BJH', value: r.Vtot, unit: 'cm³/g', main: true },
          { label: 'BJH pore area S_BJH', value: r.Atot, unit: 'm²/g', main: true },
          { label: 'Mode pore diameter', value: mode.Dbar, unit: 'nm', main: true },
          { label: 'Mean pore diameter 4V/A', value: Dmean, unit: 'nm' },
          { label: 'Size classes', value: String(r.iv.length) },
          { label: 'Size range', value: f(r.iv[r.iv.length - 1].Dlo) + '–' + f(r.iv[0].Dhi) + ' nm' }
        ],
        steps: s.items,
        warnings: warnings,
        tables: [{
          title: 'BJH table (from high to low pressure)',
          columns: ['p/p₀ range', 'D range (nm)', 'D̄ (nm)', 'ΔV_liq (cm³/g)', 'V_p (cm³/g)', 'ΣV_p (cm³/g)', 'A_p (m²/g)', 'dV/dD (cm³ g⁻¹ nm⁻¹)'],
          rows: r.iv.map(function (j) { return [f(j.xHi) + '–' + f(j.xLo), f(j.Dhi) + '–' + f(j.Dlo), f(j.Dbar), f(j.dV), f(j.Vp), f(j.cumV), f(j.A), f(j.dVdD)]; })
        }],
        plots: [
          {
            title: 'Pore-size distribution', xlabel: 'Pore diameter D (nm)', ylabel: 'dV/dD (cm³ g⁻¹ nm⁻¹)',
            series: [{ name: 'BJH', mode: 'line', markers: true, points: r.iv.slice().reverse().map(function (j) { return [j.Dbar, j.dVdD]; }) }],
            xmin: 0, xmax: Math.min(Math.max(30, mode.Dbar * 3), r.iv[0].Dhi), zeroY: true
          },
          {
            title: 'Cumulative pore volume', xlabel: 'Pore diameter D (nm)', ylabel: 'Cumulative V_p (cm³/g)',
            series: [{ name: 'Pores larger than D', mode: 'line', color: 1, points: r.iv.map(function (j) { return [j.Dlo, j.cumV]; }) }],
            xmin: 0, xmax: Math.min(Math.max(30, mode.Dbar * 3), r.iv[0].Dhi), zeroY: true
          },
          {
            title: 'Isotherm branch used', xlabel: 'p/p₀', ylabel: 'V_ads (cm³ STP/g)',
            series: [{ name: v.branch === 'ads' ? 'Adsorption' : 'Desorption', mode: 'markers', points: r.pts.map(function (p) { return [p.x, p.Vg]; }) }],
            xmin: 0, zeroY: true
          }
        ],
        notes: [
          'This is the original BJH algorithm for open cylindrical pores, in the same form as the open-source package pyGAPS (Iacomi & Llewellyn 2019), against which it is cross-validated.',
          'Kelvin-based methods underestimate pore sizes below about 10 nm by up to 20–30 %. IUPAC (2015) recommends NLDFT or QSDFT for ordered mesoporous materials.'
        ]
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
