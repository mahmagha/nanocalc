/* Crystal structure: lattice parameters (least squares), size–strain plot, RIR phase
   quantification, SAED ring analysis and HRTEM lattice fringes. */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt, C = NC.C;

  NC.addRefs({
    chung1974: { type: 'article', authors: 'Chung, F. H.', title: 'Quantitative interpretation of X-ray diffraction patterns of mixtures. I. Matrix-flushing method for quantitative multicomponent analysis', journal: 'J. Appl. Crystallogr.', year: 1974, volume: '7', pages: '519–525' },
    hubbard1988: { type: 'article', authors: 'Hubbard, C. R.; Snyder, R. L.', title: 'RIR — measurement and use in quantitative XRD', journal: 'Powder Diffr.', year: 1988, volume: '3', pages: '74–77' },
    klug1974: { type: 'book', authors: 'Klug, H. P.; Alexander, L. E.', title: 'X-Ray Diffraction Procedures for Polycrystalline and Amorphous Materials', edition: '2nd ed.', publisher: 'Wiley', place: 'New York', year: 1974 },
    williams2009: { type: 'book', authors: 'Williams, D. B.; Carter, C. B.', title: 'Transmission Electron Microscopy: A Textbook for Materials Science', edition: '2nd ed.', publisher: 'Springer', place: 'New York', year: 2009 }
  });

  const WAVELENGTHS = [
    { label: 'Cu Kα₁ (0.1540593 nm)', values: { lambda: 0.1540593 } },
    { label: 'Cu Kα weighted (0.15418 nm)', values: { lambda: 0.15418 } },
    { label: 'Co Kα₁ (0.1788965 nm)', values: { lambda: 0.1788965 } },
    { label: 'Mo Kα₁ (0.0709317 nm)', values: { lambda: 0.0709317 } }
  ];
  const WL_NOTE = 'Cu Kα₁ and Co Kα₁ wavelengths are from Hölzer et al. (1997), Mo Kα₁ from International Tables for Crystallography Vol. C.';

  /* ---------------- small linear-algebra helpers ---------------- */
  /** Inverse of a small square matrix (Gauss–Jordan). */
  function inv(M) {
    const n = M.length;
    const A = M.map(function (r, i) { return r.concat(Array.from({ length: n }, function (_, j) { return i === j ? 1 : 0; })); });
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-300) NC.fail('The reflections do not determine every lattice parameter (singular system). Add reflections with different (hkl) combinations.');
      const tmp = A[c]; A[c] = A[p]; A[p] = tmp;
      const piv = A[c][c];
      for (let j = 0; j < 2 * n; j++) A[c][j] /= piv;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const fac = A[r][c];
        for (let j = 0; j < 2 * n; j++) A[r][j] -= fac * A[c][j];
      }
    }
    return A.map(function (r) { return r.slice(n); });
  }
  /** Least squares y = X p (no intercept). Returns p, standard errors, residuals. */
  function lsq(X, y) {
    const n = X.length, m = X[0].length;
    const XtX = Array.from({ length: m }, function (_, i) { return Array.from({ length: m }, function (_, j) { let s = 0; for (let r = 0; r < n; r++) s += X[r][i] * X[r][j]; return s; }); });
    const Xty = Array.from({ length: m }, function (_, i) { let s = 0; for (let r = 0; r < n; r++) s += X[r][i] * y[r]; return s; });
    const Inv = inv(XtX);
    const p = Inv.map(function (row) { return row.reduce(function (s, v, j) { return s + v * Xty[j]; }, 0); });
    const resid = y.map(function (yy, r) { return yy - X[r].reduce(function (s, v, j) { return s + v * p[j]; }, 0); });
    const dof = n - m;
    const s2 = dof > 0 ? resid.reduce(function (s, e) { return s + e * e; }, 0) / dof : NaN;
    const se = Inv.map(function (row, i) { return Math.sqrt(s2 * row[i]); });
    return { p: p, se: se, resid: resid, dof: dof };
  }

  /* ---------------- cubic selection rules / hkl helpers ---------------- */
  const RULES = {
    sc: { label: 'Simple cubic (all hkl)', ok: function () { return true; } },
    fcc: { label: 'Face-centred cubic (h, k, l all odd or all even)', ok: function (h, k, l) { const o = (h & 1) + (k & 1) + (l & 1); return o === 0 || o === 3; } },
    bcc: { label: 'Body-centred cubic (h + k + l even)', ok: function (h, k, l) { return (h + k + l) % 2 === 0; } },
    diamond: { label: 'Diamond cubic (fcc rule and h + k + l ≠ 4n + 2)', ok: function (h, k, l) { const o = (h & 1) + (k & 1) + (l & 1); if (o === 3) return true; if (o !== 0) return false; return (h + k + l) % 4 === 0; } }
  };
  const STRUCT_OPTIONS = Object.keys(RULES).map(function (k) { return [k, RULES[k].label]; });
  /** Allowed families {h≥k≥l≥0} up to hmax, sorted by h²+k²+l². */
  function families(rule, hmax) {
    const out = [];
    for (let h = 1; h <= hmax; h++) for (let k = 0; k <= h; k++) for (let l = 0; l <= k; l++) if (RULES[rule].ok(h, k, l)) out.push({ h: h, k: k, l: l, N: h * h + k * k + l * l });
    out.sort(function (a, b) { return a.N - b.N; });
    return out;
  }
  const hklStr = function (q) { return '(' + q.h + q.k + q.l + ')'; };
  /** Nearest allowed families to spacing d for cubic lattice parameter a. */
  function matchD(d, a, rule, count) {
    return families(rule, 8)
      .map(function (q) { const dc = a / Math.sqrt(q.N); return { q: q, dc: dc, err: (100 * (d - dc)) / dc }; })
      .sort(function (x, y) { return Math.abs(x.err) - Math.abs(y.err); })
      .slice(0, count || 1);
  }
  /** All sign/permutation variants of a family. */
  function variants(q) {
    const base = [q.h, q.k, q.l];
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const seen = {}, out = [];
    perms.forEach(function (p) {
      for (let s = 0; s < 8; s++) {
        const v = [base[p[0]] * (s & 1 ? -1 : 1), base[p[1]] * (s & 2 ? -1 : 1), base[p[2]] * (s & 4 ? -1 : 1)];
        const key = v.join(',');
        if (!seen[key]) { seen[key] = 1; out.push(v); }
      }
    });
    return out;
  }
  function cubicAngle(u, v) {
    const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const c = dot / (Math.hypot(u[0], u[1], u[2]) * Math.hypot(v[0], v[1], v[2]));
    return NC.deg(Math.acos(Math.max(-1, Math.min(1, c))));
  }

  /* ================================================================== */
  /* 1 · Lattice parameters by least squares                            */
  /* ================================================================== */
  const SYSTEMS = {
    cubic: {
      label: 'Cubic', params: ['a'],
      row: function (h, k, l) { return [h * h + k * k + l * l]; },
      formula: '1/d² = (h² + k² + l²) / a²', tex: '\\dfrac{1}{d^2} = \\dfrac{h^2 + k^2 + l^2}{a^2}',
      unknowns: 'A = 1/a²'
    },
    tetragonal: {
      label: 'Tetragonal', params: ['a', 'c'],
      row: function (h, k, l) { return [h * h + k * k, l * l]; },
      formula: '1/d² = (h² + k²) / a² + l² / c²', tex: '\\dfrac{1}{d^2} = \\dfrac{h^2 + k^2}{a^2} + \\dfrac{l^2}{c^2}',
      unknowns: 'A = 1/a²,  C = 1/c²'
    },
    hexagonal: {
      label: 'Hexagonal', params: ['a', 'c'],
      row: function (h, k, l) { return [(4 / 3) * (h * h + h * k + k * k), l * l]; },
      formula: '1/d² = 4(h² + hk + k²) / (3a²) + l² / c²', tex: '\\dfrac{1}{d^2} = \\dfrac{4\\,(h^2 + hk + k^2)}{3a^2} + \\dfrac{l^2}{c^2}',
      unknowns: 'A = 1/a²,  C = 1/c²'
    },
    orthorhombic: {
      label: 'Orthorhombic', params: ['a', 'b', 'c'],
      row: function (h, k, l) { return [h * h, k * k, l * l]; },
      formula: '1/d² = h²/a² + k²/b² + l²/c²', tex: '\\dfrac{1}{d^2} = \\dfrac{h^2}{a^2} + \\dfrac{k^2}{b^2} + \\dfrac{l^2}{c^2}',
      unknowns: 'A = 1/a²,  B = 1/b²,  C = 1/c²'
    }
  };
  function twoTheta(d, lam) { const s = lam / (2 * d); return s >= 1 ? NaN : 2 * NC.deg(Math.asin(s)); }
  function synthLattice(sys, pars, lam, hkls) {
    return hkls.map(function (q) {
      const row = SYSTEMS[sys].row(q[0], q[1], q[2]);
      const coef = SYSTEMS[sys].params.map(function (p) { return 1 / (pars[p] * pars[p]); });
      const Q = row.reduce(function (s, x, i) { return s + x * coef[i]; }, 0);
      return NC.fix(twoTheta(1 / Math.sqrt(Q), lam), 4) + ', ' + q.join(', ');
    }).join('\n');
  }
  NC.synthLattice = synthLattice;

  NC.register({
    id: 'lattice',
    category: 'xrd',
    title: 'Lattice parameters (least squares)',
    short: 'Cubic, tetragonal, hexagonal or orthorhombic cell from several indexed peaks',
    description:
      'Refines the unit-cell parameters from several indexed reflections by linear least squares on 1/d². Works for cubic, tetragonal, hexagonal and orthorhombic cells, gives standard errors and the cell volume, and shows how well each peak is reproduced.',
    refs: ['cullity2001', 'bragg1913', 'holzer1997', 'itcC2004'],
    presets: WAVELENGTHS,
    presetNote: WL_NOTE,
    inputs: [
      NC.sel('sys', 'Crystal system', Object.keys(SYSTEMS).map(function (k) { return [k, SYSTEMS[k].label]; }), 'cubic'),
      NC.num('lambda', 'X-ray wavelength λ', 'nm', 0.1540593),
      NC.data('data', 'Indexed peaks: 2θ (°), h, k, l', '', { placeholder: '38.184, 1, 1, 1\n44.381, 2, 0, 0\n…' })
    ],
    example: function () {
      return { sys: 'hexagonal', lambda: 0.1540593, data: synthLattice('hexagonal', { a: 0.3250, c: 0.5207 }, 0.1540593, [[1, 0, 0], [0, 0, 2], [1, 0, 1], [1, 0, 2], [1, 1, 0], [1, 0, 3], [1, 1, 2], [2, 0, 1]]) };
    },
    compute: function (v) {
      const s = new NC.Steps();
      const sys = SYSTEMS[v.sys];
      if (!sys) NC.fail('Choose a crystal system.');
      const lam = NC.need(v.lambda, 'Wavelength', { positive: true });
      const rows = NC.parseRows(v.data, { min: 4, max: 4, labels: ['2θ', 'h', 'k', 'l'], name: 'Peaks' });
      const m = sys.params.length;
      if (rows.length < m) NC.fail('A ' + sys.label.toLowerCase() + ' cell has ' + m + ' unknown(s); enter at least ' + m + ' indexed peaks (more gives standard errors).');
      rows.forEach(function (r, i) {
        if (!(r[0] > 0 && r[0] < 180)) NC.fail('Peak ' + (i + 1) + ': 2θ must be between 0 and 180°.');
        if (![r[1], r[2], r[3]].every(Number.isInteger)) NC.fail('Peak ' + (i + 1) + ': h, k, l must be whole numbers.');
        if (r[1] === 0 && r[2] === 0 && r[3] === 0) NC.fail('Peak ' + (i + 1) + ': (000) is not a reflection.');
      });
      s.add({ title: 'Quadratic form for a ' + sys.label.toLowerCase() + ' cell', formula: sys.formula, tex: sys.tex, note: 'Linear in the unknowns ' + sys.unknowns + ', so they can be fitted by ordinary least squares.', ref: 'cullity2001' });
      const d = rows.map(function (r) { return lam / (2 * Math.sin(NC.rad(r[0] / 2))); });
      const r0 = rows[0];
      s.add({ title: "Bragg's law for each peak", formula: 'd = λ / (2 sin θ)', tex: 'd = \\dfrac{\\lambda}{2\\sin\\theta}', sub: 'e.g. d = ' + f(lam) + ' / (2 sin ' + f(r0[0] / 2, 6) + '°)', result: 'd₁ = ' + f(d[0], 6) + ' nm  (all peaks in the table)', ref: 'bragg1913' });
      const X = rows.map(function (r) { return sys.row(r[1], r[2], r[3]); });
      const Q = d.map(function (dd) { return 1 / (dd * dd); });
      const fit = lsq(X, Q);
      if (fit.p.some(function (p) { return !(p > 0); })) NC.fail('The fit gives a non-physical (negative) value of 1/a². Check the indexing and the crystal system.');
      s.add({ title: 'Least-squares solution of the normal equations', formula: 'p = (XᵀX)⁻¹ Xᵀ Q,   Q = 1/d²', tex: '\\mathbf{p} = (X^{\\mathsf T}X)^{-1}X^{\\mathsf T}\\mathbf{Q},\\quad Q_i = 1/d_i^2', sub: rows.length + ' peaks, ' + m + ' unknown(s), ' + fit.dof + ' degree(s) of freedom', result: fit.p.map(function (p, i) { return (sys.params[i] === 'a' ? 'A' : sys.params[i] === 'b' ? 'B' : 'C') + ' = ' + f(p, 6) + ' nm⁻²'; }).join(';   ') });
      const par = {}, se = {};
      sys.params.forEach(function (p, i) {
        par[p] = 1 / Math.sqrt(fit.p[i]);
        se[p] = fit.se[i] / (2 * Math.pow(fit.p[i], 1.5));
      });
      s.add({ title: 'Lattice parameters and standard errors', formula: 'a = 1/√A,   σ_a = σ_A / (2A^(3/2))', tex: 'a = \\dfrac{1}{\\sqrt{A}},\\quad \\sigma_a = \\dfrac{\\sigma_A}{2A^{3/2}}', result: sys.params.map(function (p) { return p + ' = ' + f(par[p], 6) + (isFinite(se[p]) ? ' ± ' + f(se[p], 2) : '') + ' nm'; }).join(';   '), note: fit.dof > 0 ? 'Standard errors from the residual scatter of 1/d².' : 'Exactly determined: no standard errors without extra peaks.' });
      let V;
      if (v.sys === 'cubic') V = Math.pow(par.a, 3);
      else if (v.sys === 'tetragonal') V = par.a * par.a * par.c;
      else if (v.sys === 'hexagonal') V = (Math.sqrt(3) / 2) * par.a * par.a * par.c;
      else V = par.a * par.b * par.c;
      const Vf = { cubic: 'V = a³', tetragonal: 'V = a²c', hexagonal: 'V = (√3/2)·a²c', orthorhombic: 'V = abc' }[v.sys];
      const Vt = { cubic: 'V = a^3', tetragonal: 'V = a^2 c', hexagonal: 'V = \\dfrac{\\sqrt{3}}{2}\\,a^2 c', orthorhombic: 'V = abc' }[v.sys];
      s.add({ title: 'Unit-cell volume', formula: Vf, tex: Vt, result: 'V = ' + f(V, 6) + ' nm³', ref: 'cullity2001' });
      const tbl = rows.map(function (r, i) {
        const Qc = X[i].reduce(function (sum, x, j) { return sum + x * fit.p[j]; }, 0);
        const dc = 1 / Math.sqrt(Qc), ttc = twoTheta(dc, lam);
        return { r: r, d: d[i], dc: dc, ttc: ttc, dtt: r[0] - ttc };
      });
      const rms = Math.sqrt(tbl.reduce(function (a, t) { return a + t.dtt * t.dtt; }, 0) / tbl.length);
      s.add({ title: 'Check: recalculated peak positions', formula: 'Δ2θ = 2θ_obs − 2θ_calc', tex: '\\Delta 2\\theta = 2\\theta_{\\text{obs}} - 2\\theta_{\\text{calc}}', result: 'rms Δ2θ = ' + NC.fix(rms, 5) + '°', note: 'Large or systematic residuals suggest a wrong index, the wrong crystal system or a sample-height error.' });
      const results = sys.params.map(function (p) { return { label: 'Lattice parameter ' + p, value: par[p], unit: 'nm', sig: 6, main: true }; });
      sys.params.forEach(function (p) { if (isFinite(se[p])) results.push({ label: 'Std. error of ' + p, value: se[p], unit: 'nm', sig: 2 }); });
      results.push({ label: 'Cell volume V', value: V, unit: 'nm³', sig: 6 });
      if (par.c && v.sys !== 'orthorhombic') results.push({ label: 'Axial ratio c/a', value: par.c / par.a, sig: 5 });
      results.push({ label: 'rms Δ2θ', value: rms, unit: '°', sig: 3 });
      const warnings = [];
      if (fit.dof === 0) warnings.push('Only as many peaks as unknowns: the parameters are exact solutions without error estimates. Add more reflections.');
      if (rms > 0.05) warnings.push('rms residual above 0.05°: check indexing, crystal system and instrument zero offset.');
      return {
        results: results,
        steps: s.items,
        warnings: warnings,
        tables: [{ title: 'Per-peak fit', columns: ['2θ obs (°)', 'hkl', 'd obs (nm)', 'd calc (nm)', '2θ calc (°)', 'Δ2θ (°)'], rows: tbl.map(function (t) { return [NC.fix(t.r[0], 4), '(' + t.r[1] + ' ' + t.r[2] + ' ' + t.r[3] + ')', f(t.d, 6), f(t.dc, 6), NC.fix(t.ttc, 4), NC.fix(t.dtt, 4)]; }) }],
        plots: [{ title: 'Fit residuals', xlabel: '2θ (°)', ylabel: 'Δ2θ (°)', series: [{ name: 'Residual', mode: 'markers', points: tbl.map(function (t) { return [t.r[0], t.dtt]; }) }] }],
        notes: ['Peak positions should be corrected for instrument zero shift and sample displacement (e.g. with an internal Si standard) before refining.', 'Least squares on 1/d² weights high-angle peaks less than a fit in 2θ; high-angle reflections still carry the most precise information about the cell.']
      };
    }
  });

  /* ================================================================== */
  /* 2 · Size–strain plot                                               */
  /* ================================================================== */
  function synthSSP(D, eps, K, lam, tts) {
    return tts.map(function (tt) {
      const th = NC.rad(tt / 2), d = lam / (2 * Math.sin(th)), ds = 1 / d;
      const a = K / D, b = 2 * eps * ds; // reciprocal-space size and strain breadths
      const bstar = (a + Math.sqrt(a * a + 4 * b * b)) / 2;
      const beta = (bstar * lam) / Math.cos(th);
      return NC.fix(tt, 4) + ', ' + NC.fix(NC.deg(beta), 5);
    }).join('\n');
  }
  NC.synthSSP = synthSSP;
  NC.register({
    id: 'ssp',
    category: 'xrd',
    title: 'Size–strain plot (SSP)',
    short: 'Crystallite size and microstrain with Lorentzian size / Gaussian strain broadening',
    description:
      'An alternative to the Williamson–Hall plot that gives less weight to high-angle reflections. Size broadening is treated as Lorentzian and strain broadening as Gaussian; a straight-line fit gives the crystallite size from the slope and the apparent strain from the intercept.',
    refs: ['klug1974', 'williamson1953', 'holder2019', 'langford1978'],
    presets: WAVELENGTHS,
    presetNote: WL_NOTE,
    inputs: [
      NC.num('lambda', 'X-ray wavelength λ', 'nm', 0.1540593),
      NC.num('K', 'Shape factor K', '', 0.9, { help: 'Usually 0.89–0.94 (Langford & Wilson 1978); K = 3/4 is also used with integral breadths in the SSP.' }),
      NC.data('data', 'Peaks: 2θ (°), corrected breadth β (°)', '', { placeholder: '38.18, 0.52\n44.39, 0.58\n…', help: 'Enter breadths already corrected for instrumental broadening.' })
    ],
    example: function () { return { lambda: 0.1540593, K: 0.9, data: synthSSP(15, 0.002, 0.9, 0.1540593, [38.18, 44.39, 64.58, 77.55, 81.72]) }; },
    compute: function (v) {
      const s = new NC.Steps();
      const lam = NC.need(v.lambda, 'Wavelength', { positive: true });
      const K = NC.need(v.K, 'Shape factor', { positive: true });
      const rows = NC.parseRows(v.data, { min: 2, max: 2, labels: ['2θ', 'β'], name: 'Peaks' });
      if (rows.length < 2) NC.fail('Enter at least two peaks (three or more recommended).');
      s.add({
        title: 'Size–strain relation (reciprocal-space form)',
        formula: '(β*/d*)² = (K/D)·(β*/d*²) + (η/2)²,   β* = β·cosθ/λ,  d* = 1/d',
        tex: '\\left(\\dfrac{\\beta^*}{d^*}\\right)^2 = \\dfrac{K}{D}\\,\\dfrac{\\beta^*}{d^{*2}} + \\left(\\dfrac{\\eta}{2}\\right)^2,\\quad \\beta^* = \\dfrac{\\beta\\cos\\theta}{\\lambda},\\ d^* = \\dfrac{1}{d}',
        note: 'Equivalent to (d·β·cosθ)² = (Kλ/D)(d²·β·cosθ) + (ηλ/2)². Many papers drop the λ factors; this form keeps the units consistent. η is the apparent strain; η = 4ε for the ε of the Williamson–Hall equation β·cosθ = Kλ/D + 4ε·sinθ.',
        ref: 'klug1974'
      });
      const pts = rows.map(function (r, i) {
        if (!(r[0] > 0 && r[0] < 180) || !(r[1] > 0)) NC.fail('Peak ' + (i + 1) + ': need 0 < 2θ < 180° and a positive breadth.');
        const th = NC.rad(r[0] / 2), d = lam / (2 * Math.sin(th)), b = NC.rad(r[1]);
        const bs = (b * Math.cos(th)) / lam;
        return { tt: r[0], d: d, b: b, x: bs * d * d, y: Math.pow(bs * d, 2) };
      });
      const p0 = pts[0];
      s.add({ title: 'Transform each peak', formula: 'x = β*/d*² = d²·β·cosθ/λ,   y = (β*/d*)² = (d·β·cosθ/λ)²', tex: 'x = \\dfrac{d^2\\beta\\cos\\theta}{\\lambda},\\quad y = \\left(\\dfrac{d\\,\\beta\\cos\\theta}{\\lambda}\\right)^2', sub: 'e.g. peak 1: d = ' + f(p0.d) + ' nm, β = ' + f(p0.b) + ' rad', result: 'x₁ = ' + f(p0.x) + ' nm,  y₁ = ' + f(p0.y) + '  (all values in the table)' });
      const fit = NC.stats.linreg(pts.map(function (p) { return p.x; }), pts.map(function (p) { return p.y; }));
      s.add({ title: 'Least-squares line y = m·x + b', formula: 'm = K/D,   b = (η/2)²', tex: 'm = \\dfrac{K}{D},\\quad b = \\left(\\dfrac{\\eta}{2}\\right)^2', result: 'm = ' + f(fit.m) + ' nm⁻¹;   b = ' + f(fit.b) + ';   R² = ' + NC.fix(fit.r2, 4) });
      const warnings = [];
      let D = NaN, eta = NaN;
      if (fit.m > 0) {
        D = K / fit.m;
        s.add({ title: 'Crystallite size from the slope', formula: 'D = K / m', tex: 'D = \\dfrac{K}{m}', sub: 'D = ' + f(K) + ' / ' + f(fit.m), result: 'D = ' + f(D) + ' nm', ref: 'klug1974' });
      } else warnings.push('Non-positive slope: size broadening cannot be separated from the data.');
      if (fit.b >= 0) {
        eta = 2 * Math.sqrt(fit.b);
        s.add({ title: 'Apparent strain from the intercept', formula: 'η = 2√b,   ε (W–H convention) = η/4', tex: '\\eta = 2\\sqrt{b},\\quad \\varepsilon_{\\text{WH}} = \\eta/4', sub: 'η = 2 × √' + f(fit.b), result: 'η = ' + f(eta) + ';   ε = ' + f(eta / 4), ref: 'klug1974' });
      } else warnings.push('Negative intercept: strain is negligible or the data are noisy (treated as zero strain).');
      if (fit.r2 < 0.9) warnings.push('Poor linear fit (R² < 0.9): anisotropic broadening or uncorrected instrumental broadening may be present.');
      return {
        results: [
          { label: 'Crystallite size D', value: D, unit: 'nm', main: true },
          { label: 'Microstrain ε (W–H convention)', value: isFinite(eta) ? eta / 4 : 0, main: true },
          { label: 'Apparent strain η', value: isFinite(eta) ? eta : 0 },
          { label: 'R²', value: fit.r2, sig: 4 }
        ],
        steps: s.items,
        warnings: warnings,
        tables: [{ title: 'Size–strain data', columns: ['2θ (°)', 'd (nm)', 'β (rad)', 'x = d²βcosθ/λ (nm)', 'y = (dβcosθ/λ)²'], rows: pts.map(function (p) { return [NC.fix(p.tt, 4), f(p.d, 5), f(p.b, 4), f(p.x, 5), f(p.y, 5)]; }) }],
        plots: [{
          title: 'Size–strain plot', xlabel: 'd²·β·cosθ / λ (nm)', ylabel: '(d·β·cosθ / λ)²',
          series: [
            { name: 'Peaks', mode: 'markers', points: pts.map(function (p) { return [p.x, p.y]; }) },
            { name: 'Linear fit', mode: 'line', color: 1, points: (function () { const xs = pts.map(function (p) { return p.x; }); const x1 = Math.max.apply(null, xs) * 1.05; return [[0, fit.b], [x1, fit.b + fit.m * x1]]; })() }
          ]
        }],
        notes: ['Compared with Williamson–Hall, the SSP weights low-angle reflections more, where data are usually more precise; the two should agree within uncertainties for isotropic samples.', 'Correct the breadths for instrumental broadening before fitting.']
      };
    }
  });

  /* ================================================================== */
  /* 3 · RIR phase quantification                                       */
  /* ================================================================== */
  NC.register({
    id: 'rir',
    category: 'xrd',
    title: 'Phase quantification (RIR method)',
    short: 'Weight fractions of crystalline phases from peak intensities and RIR values',
    description:
      'Estimates the weight fractions of the crystalline phases in a mixture from the intensity of each phase’s strongest peak and its Reference Intensity Ratio (RIR, I/I_corundum). Assumes all phases are crystalline and identified (normalized RIR, matrix-flushing method).',
    refs: ['chung1974', 'hubbard1988', 'cullity2001'],
    inputs: [
      NC.data('rows', 'Phases: name, strongest-peak intensity, RIR (I/I_c)', 'Anatase, 1520, 3.3\nRutile, 640, 3.4', { rows: 6, help: 'RIR values come from the ICDD PDF card of each phase (or from your own measurement against corundum). The example values are illustrative only.' })
    ],
    example: { rows: 'Anatase, 1520, 3.3\nRutile, 640, 3.4' },
    compute: function (v) {
      const s = new NC.Steps();
      const rows = NC.parseRows(v.rows, { label: true, min: 2, max: 2, labels: ['intensity', 'RIR'], name: 'Phases' });
      if (rows.length < 2) NC.fail('Enter at least two phases.');
      rows.forEach(function (r) { if (!(r[0] >= 0) || !(r[1] > 0)) NC.fail(r.label + ': intensity must be ≥ 0 and RIR > 0.'); });
      s.add({ title: 'Normalized RIR (matrix-flushing) equation', formula: 'X_i = (I_i / RIR_i) / Σ_j (I_j / RIR_j)', tex: 'X_i = \\dfrac{I_i/\\mathrm{RIR}_i}{\\sum_j I_j/\\mathrm{RIR}_j}', note: 'Valid when all phases are crystalline and included; amorphous content needs an internal standard.', ref: ['chung1974', 'hubbard1988'] });
      const q = rows.map(function (r) { return r[0] / r[1]; });
      const tot = NC.stats.sum(q);
      if (!(tot > 0)) NC.fail('At least one phase must have a non-zero intensity.');
      s.add({ title: 'Intensity divided by RIR for each phase', formula: 'I_i / RIR_i', sub: rows.map(function (r, i) { return r.label + ': ' + f(r[0]) + ' / ' + f(r[1]) + ' = ' + f(q[i]); }).join(';   '), result: 'Σ = ' + f(tot) });
      const X = q.map(function (x) { return (100 * x) / tot; });
      s.add({ title: 'Weight fractions', formula: 'X_i = (I_i/RIR_i) / Σ × 100 %', sub: rows.map(function (r, i) { return r.label + ': ' + f(q[i]) + ' / ' + f(tot); }).join(';   '), result: rows.map(function (r, i) { return r.label + ' = ' + NC.fix(X[i], 1) + ' wt%'; }).join(';   ') });
      return {
        results: rows.map(function (r, i) { return { label: r.label, value: X[i], unit: 'wt%', main: i < 3 }; }),
        steps: s.items,
        tables: [{ title: 'Phase composition', columns: ['Phase', 'Intensity', 'RIR', 'I/RIR', 'wt%'], rows: rows.map(function (r, i) { return [r.label, f(r[0]), f(r[1]), f(q[i]), NC.fix(X[i], 2)]; }) }],
        plots: [{ title: 'Phase fractions', xlabel: 'Phase (in table order)', ylabel: 'wt%', series: [{ name: 'wt%', mode: 'bars', points: X.map(function (x, i) { return [i + 0.6, i + 1.4, x]; }) }], zeroY: true, xmin: 0.4, xmax: rows.length + 0.6 }],
        notes: ['Use integrated intensities of the same reflection used to define each RIR (normally the strongest line).', 'Preferred orientation, microabsorption and amorphous content bias RIR results; typical accuracy is a few wt%.']
      };
    }
  });

  /* ================================================================== */
  /* 4 · SAED                                                           */
  /* ================================================================== */
  function electronLambda(kV) {
    const V = kV * 1000;
    return (C.h / Math.sqrt(2 * C.me * C.e * V * (1 + (C.e * V) / (2 * C.me * C.c * C.c)))) * 1e9; // nm
  }
  NC.electronLambda = electronLambda;
  const MEAS = [['R_mm', 'Ring radius (mm on the detector)'], ['D_mm', 'Ring diameter (mm on the detector)'], ['R_inv', 'Ring radius (nm⁻¹, calibrated software)'], ['D_inv', 'Ring diameter (nm⁻¹, calibrated software)']];
  function synthSAED(kV, Lmm, a, rule, n) {
    const lamL = electronLambda(kV) * Lmm;
    return families(rule, 6).slice(0, n).map(function (q) { return NC.fix(lamL / (a / Math.sqrt(q.N)), 4); }).join('\n');
  }
  NC.synthSAED = synthSAED;
  NC.register({
    id: 'saed',
    category: 'xrd',
    title: 'Electron diffraction (SAED) ring analysis',
    short: 'Electron wavelength, d-spacings from ring radii, ring indexing (fcc, bcc, diamond)',
    description:
      'Computes the relativistic electron wavelength, converts measured SAED ring radii or diameters into d-spacings (from the microscope camera length, a calibration ring, or calibrated reciprocal-space units), and indexes the rings against a cubic lattice with fcc, bcc or diamond selection rules.',
    refs: ['williams2009', 'cullity2001', 'codata2018'],
    inputs: [
      NC.sel('cal', 'Calibration', [['L', 'Accelerating voltage + camera length'], ['std', 'Known standard ring (camera constant)'], ['inv', 'Measurements already in nm⁻¹']], 'L'),
      NC.num('kV', 'Accelerating voltage', 'kV', 200, { showIf: function (v) { return v.cal === 'L'; } }),
      NC.num('L', 'Camera length L', 'mm', 300, { showIf: function (v) { return v.cal === 'L'; } }),
      NC.num('dstd', 'Standard ring d-spacing', 'nm', 0.23545, { showIf: function (v) { return v.cal === 'std'; }, help: 'e.g. Au (111) = 0.2355 nm' }),
      NC.num('Rstd', 'Standard ring measurement', 'mm', 3.196, { showIf: function (v) { return v.cal === 'std'; }, help: 'Same kind of measurement (radius or diameter) as the rings below.' }),
      NC.sel('meas', 'Ring measurement', MEAS, 'R_mm'),
      NC.data('rings', 'Ring measurements (one per line)', '', { rows: 6, placeholder: '3.196\n3.690\n…' }),
      NC.sel('rule', 'Index against', STRUCT_OPTIONS, 'fcc'),
      NC.num('a', 'Cubic lattice parameter a (optional)', 'nm', 0.4078, { help: 'Leave blank to skip indexing.' })
    ],
    example: function () { return { cal: 'L', kV: 200, L: 300, meas: 'R_mm', rule: 'fcc', a: 0.4078, rings: synthSAED(200, 300, 0.4078, 'fcc', 4) }; },
    compute: function (v) {
      const s = new NC.Steps();
      const meas = v.meas;
      const isDiam = meas === 'D_mm' || meas === 'D_inv';
      const inv = meas === 'R_inv' || meas === 'D_inv';
      const vals = NC.parseList(v.rings, 'Rings');
      if (!vals.length) NC.fail('Enter at least one ring measurement.');
      vals.forEach(function (x) { if (!(x > 0)) NC.fail('Ring measurements must be positive.'); });
      const R = vals.map(function (x) { return isDiam ? x / 2 : x; });
      if (isDiam) s.add({ title: 'Diameters to radii', formula: 'R = D/2', sub: 'e.g. R₁ = ' + f(vals[0]) + ' / 2', result: 'R₁ = ' + f(R[0]) });
      let d, lam = NaN, lamL = NaN;
      if (inv || v.cal === 'inv') {
        if (!inv) NC.fail('With “Measurements already in nm⁻¹”, choose an nm⁻¹ ring measurement type.');
        d = R.map(function (r) { return 1 / r; });
        s.add({ title: 'd-spacing from reciprocal-space radius', formula: 'd = 1 / g,   g = R (nm⁻¹)', tex: 'd = \\dfrac{1}{g}', sub: 'd₁ = 1 / ' + f(R[0]), result: 'd₁ = ' + f(d[0], 5) + ' nm', ref: 'williams2009' });
      } else {
        if (v.cal === 'std') {
          const dstd = NC.need(v.dstd, 'Standard d-spacing', { positive: true });
          let Rstd = NC.need(v.Rstd, 'Standard ring measurement', { positive: true });
          if (isDiam) Rstd /= 2;
          lamL = Rstd * dstd;
          s.add({ title: 'Camera constant from the standard ring', formula: 'λL = R_std · d_std', tex: '\\lambda L = R_{\\text{std}}\\,d_{\\text{std}}', sub: 'λL = ' + f(Rstd) + ' mm × ' + f(dstd) + ' nm', result: 'λL = ' + f(lamL) + ' nm·mm', ref: 'williams2009' });
        } else {
          const kV = NC.need(v.kV, 'Accelerating voltage', { positive: true });
          const L = NC.need(v.L, 'Camera length', { positive: true });
          lam = electronLambda(kV);
          s.add({ title: 'Relativistic electron wavelength', formula: 'λ = h / √[2m₀eV·(1 + eV/(2m₀c²))]', tex: '\\lambda = \\dfrac{h}{\\sqrt{2m_0 eV\\left(1 + \\dfrac{eV}{2m_0c^2}\\right)}}', sub: 'V = ' + f(kV * 1000) + ' V;   eV/(2m₀c²) = ' + f((C.e * kV * 1000) / (2 * C.me * C.c * C.c)), result: 'λ = ' + f(lam * 1000, 5) + ' pm', ref: ['williams2009', 'codata2018'] });
          lamL = lam * L;
          s.add({ title: 'Camera constant', formula: 'λL', sub: 'λL = ' + f(lam, 5) + ' nm × ' + f(L) + ' mm', result: 'λL = ' + f(lamL) + ' nm·mm', note: 'The nominal camera length is often only accurate to a few percent; calibrate with a standard for precise work.' });
        }
        d = R.map(function (r) { return lamL / r; });
        s.add({ title: 'd-spacing of each ring', formula: 'R·d = λL   ⇒   d = λL / R', tex: 'R\\,d = \\lambda L \\;\\Rightarrow\\; d = \\dfrac{\\lambda L}{R}', sub: 'd₁ = ' + f(lamL) + ' / ' + f(R[0]), result: 'd₁ = ' + f(d[0], 5) + ' nm  (all rings in the table)', ref: 'williams2009' });
      }
      const a = NC.opt(v.a, 'Lattice parameter', { positive: true });
      const rule = RULES[v.rule] ? v.rule : 'fcc';
      let rows, idx = [];
      if (a !== null) {
        idx = d.map(function (dd) { return matchD(dd, a, rule, 1)[0]; });
        s.add({ title: 'Index each ring against the cubic lattice', formula: 'd_hkl = a / √(h² + k² + l²),   allowed hkl: ' + RULES[rule].label, tex: 'd_{hkl} = \\dfrac{a}{\\sqrt{h^2 + k^2 + l^2}}', sub: 'a = ' + f(a) + ' nm', result: idx.map(function (m, i) { return 'ring ' + (i + 1) + ' → ' + hklStr(m.q); }).join(',  '), ref: 'cullity2001' });
        const ratios = d.map(function (dd) { return Math.pow(d[0] / dd, 2); });
        s.add({ title: 'Ratio check (independent of calibration)', formula: '(d₁/d_i)² = N_i / N₁,   N = h² + k² + l²', tex: '\\left(\\dfrac{d_1}{d_i}\\right)^2 = \\dfrac{N_i}{N_1}', result: ratios.map(function (r) { return f(r, 4); }).join(' : '), note: 'fcc gives 3 : 4 : 8 : 11 : 12 …, bcc 2 : 4 : 6 : 8 …, diamond 3 : 8 : 11 : 16 …; dividing by the first value removes calibration errors.' });
      }
      rows = d.map(function (dd, i) {
        const r = [String(i + 1), f(vals[i], 5), f(dd, 5)];
        if (idx.length) r.push(hklStr(idx[i].q), f(idx[i].dc, 5), NC.fix(idx[i].err, 2));
        return r;
      });
      const warnings = [];
      if (idx.some(function (m) { return Math.abs(m.err) > 2; })) warnings.push('At least one ring deviates by more than 2 % from the nearest allowed reflection: check calibration, the lattice parameter or the structure type.');
      const results = [];
      if (isFinite(lam)) results.push({ label: 'Electron wavelength λ', value: lam * 1000, unit: 'pm', sig: 5, main: true });
      if (isFinite(lamL)) results.push({ label: 'Camera constant λL', value: lamL, unit: 'nm·mm', main: true });
      results.push({ label: 'd of first ring', value: d[0], unit: 'nm', sig: 5, main: true });
      if (idx.length) results.push({ label: 'First ring index', value: hklStr(idx[0].q) });
      return {
        results: results,
        steps: s.items,
        warnings: warnings,
        tables: [{ title: 'Rings', columns: idx.length ? ['Ring', 'Measured', 'd (nm)', 'hkl', 'd_hkl (nm)', 'Deviation (%)'] : ['Ring', 'Measured', 'd (nm)'], rows: rows }],
        notes: ['Ring radii are best measured as half the ring diameter, which cancels errors in locating the pattern centre.']
      };
    }
  });

  /* ================================================================== */
  /* 5 · HRTEM lattice fringes                                          */
  /* ================================================================== */
  NC.register({
    id: 'hrtem',
    category: 'xrd',
    title: 'HRTEM lattice fringes',
    short: 'Fringe spacing from a fringe count or FFT spot, interplanar angle, hkl matching',
    description:
      'Gets the lattice-fringe spacing from the distance across several fringes or from an FFT spot position, optionally adds a second fringe set and the angle between them, and matches the fringes to (hkl) planes of a cubic lattice.',
    refs: ['williams2009', 'cullity2001'],
    inputs: [
      NC.sel('mode', 'Measurement', [['count', 'Distance across n fringes'], ['fft', 'FFT spot position']], 'count'),
      NC.num('dist', 'Distance across the fringes', 'nm', 2.355, { showIf: function (v) { return v.mode === 'count'; } }),
      NC.num('n', 'Number of fringe spacings n', '', 10, { showIf: function (v) { return v.mode === 'count'; }, help: 'Count spacings (gaps), not lines: 11 lines enclose 10 spacings.' }),
      NC.num('g', 'FFT spot distance', 'nm⁻¹', 4.247, { showIf: function (v) { return v.mode === 'fft'; } }),
      NC.sel('gref', 'Spot distance measured', [['centre', 'from the centre spot'], ['pair', 'between two opposite spots (= 2g)']], 'centre', { showIf: function (v) { return v.mode === 'fft'; } }),
      NC.num('d2', 'Second fringe spacing (optional)', 'nm', 0.2039, { help: 'Spacing of a second fringe set in the same crystal, measured the same way and already converted to nm.' }),
      NC.num('phi', 'Measured angle between the fringe sets (optional)', '°', 54.74),
      NC.sel('rule', 'Lattice type', STRUCT_OPTIONS, 'fcc'),
      NC.num('a', 'Cubic lattice parameter a (optional)', 'nm', 0.4078)
    ],
    example: { mode: 'count', dist: 2.355, n: 10, d2: 0.2039, phi: 54.74, rule: 'fcc', a: 0.4078 },
    compute: function (v) {
      const s = new NC.Steps();
      let d1;
      if (v.mode === 'fft') {
        let g = NC.need(v.g, 'FFT spot distance', { positive: true });
        if (v.gref === 'pair') {
          s.add({ title: 'Half the distance between opposite spots', formula: 'g = (spot-to-spot distance) / 2', sub: 'g = ' + f(g) + ' / 2', result: 'g = ' + f(g / 2) + ' nm⁻¹' });
          g /= 2;
        }
        d1 = 1 / g;
        s.add({ title: 'Fringe spacing from the FFT', formula: 'd = 1 / g', tex: 'd = \\dfrac{1}{g}', sub: 'd = 1 / ' + f(g) + ' nm⁻¹', result: 'd = ' + f(d1, 5) + ' nm', note: 'Requires a correctly calibrated image pixel size.', ref: 'williams2009' });
      } else {
        const dist = NC.need(v.dist, 'Distance', { positive: true });
        const n = NC.need(v.n, 'Number of spacings', { positive: true, int: true });
        d1 = dist / n;
        s.add({ title: 'Average fringe spacing', formula: 'd = (distance across n spacings) / n', tex: 'd = \\dfrac{\\text{distance}}{n}', sub: 'd = ' + f(dist) + ' nm / ' + n, result: 'd = ' + f(d1, 5) + ' nm', note: 'Averaging over many fringes reduces the reading error by about 1/n.', ref: 'williams2009' });
      }
      const d2 = NC.opt(v.d2, 'Second spacing', { positive: true });
      const phi = NC.opt(v.phi, 'Angle', { min: 0, max: 180 });
      const a = NC.opt(v.a, 'Lattice parameter', { positive: true });
      const rule = RULES[v.rule] ? v.rule : 'fcc';
      const results = [{ label: 'Fringe spacing d', value: d1, unit: 'nm', sig: 5, main: true }];
      const tables = [];
      const warnings = [];
      if (a !== null) {
        const c1 = matchD(d1, a, rule, 4);
        s.add({ title: 'Candidate planes for fringe set 1', formula: 'd_hkl = a / √(h² + k² + l²)', tex: 'd_{hkl} = \\dfrac{a}{\\sqrt{h^2 + k^2 + l^2}}', sub: 'a = ' + f(a) + ' nm, ' + RULES[rule].label, result: 'best: ' + hklStr(c1[0].q) + ' (d = ' + f(c1[0].dc, 5) + ' nm, ' + NC.fix(c1[0].err, 2) + ' %)', ref: 'cullity2001' });
        results.push({ label: 'Fringe set 1 index', value: '{' + c1[0].q.h + c1[0].q.k + c1[0].q.l + '}', main: true });
        tables.push({ title: 'Candidates for fringe set 1', columns: ['{hkl}', 'd_hkl (nm)', 'Deviation (%)'], rows: c1.map(function (m) { return ['{' + m.q.h + m.q.k + m.q.l + '}', f(m.dc, 5), NC.fix(m.err, 2)]; }) });
        if (Math.abs(c1[0].err) > 3) warnings.push('Fringe set 1 deviates more than 3 % from every allowed plane: check the pixel calibration or the phase.');
        if (d2 !== null) {
          const c2 = matchD(d2, a, rule, 4);
          s.add({ title: 'Candidate planes for fringe set 2', formula: 'same as above', sub: 'd₂ = ' + f(d2, 5) + ' nm', result: 'best: ' + hklStr(c2[0].q) + ' (' + NC.fix(c2[0].err, 2) + ' %)' });
          if (phi !== null) {
            // search variant pairs of the best two families for each set for the angle closest to phi
            let best = null;
            c1.slice(0, 2).forEach(function (m1) {
              c2.slice(0, 2).forEach(function (m2) {
                const u = [m1.q.h, m1.q.k, m1.q.l];
                variants(m2.q).forEach(function (w) {
                  const ang = cubicAngle(u, w);
                  const score = Math.abs(ang - phi) + 2 * (Math.abs(m1.err) + Math.abs(m2.err));
                  if (!best || score < best.score) best = { u: u, w: w, ang: ang, score: score };
                });
              });
            });
            s.add({ title: 'Angle between the two plane normals (cubic)', formula: 'cos φ = (h₁h₂ + k₁k₂ + l₁l₂) / [√(h₁² + k₁² + l₁²)·√(h₂² + k₂² + l₂²)]', tex: '\\cos\\varphi = \\dfrac{h_1h_2 + k_1k_2 + l_1l_2}{\\sqrt{h_1^2 + k_1^2 + l_1^2}\\,\\sqrt{h_2^2 + k_2^2 + l_2^2}}', sub: 'measured φ = ' + f(phi) + '°', result: '(' + best.u.join(' ') + ') and (' + best.w.join(' ') + '): φ = ' + NC.fix(best.ang, 2) + '°  (Δ = ' + NC.fix(best.ang - phi, 2) + '°)', ref: 'cullity2001' });
            const zone = [best.u[1] * best.w[2] - best.u[2] * best.w[1], best.u[2] * best.w[0] - best.u[0] * best.w[2], best.u[0] * best.w[1] - best.u[1] * best.w[0]];
            const gcd = function (x, y) { return y ? gcd(y, x % y) : Math.abs(x); };
            const gz = zone.reduce(function (g, x) { return gcd(g, x); }, 0) || 1;
            const z = zone.map(function (x) { return x / gz; });
            s.add({ title: 'Zone axis (beam direction)', formula: '[uvw] = (h₁k₁l₁) × (h₂k₂l₂)', tex: '[uvw] = (h_1k_1l_1)\\times(h_2k_2l_2)', result: '[' + z.join(' ') + ']', note: 'For cubic crystals the plane normal (hkl) is parallel to the direction [hkl].', ref: 'williams2009' });
            results.push({ label: 'Calculated interplanar angle', value: best.ang, unit: '°', sig: 4 }, { label: 'Zone axis', value: '[' + z.join(' ') + ']', main: true });
            if (Math.abs(best.ang - phi) > 3) warnings.push('The best angle differs by more than 3° from the measured one: the assignment is uncertain.');
          }
        }
      } else if (d2 !== null) {
        results.push({ label: 'Second fringe spacing', value: d2, unit: 'nm', sig: 5 });
      }
      return { results: results, steps: s.items, warnings: warnings, tables: tables, notes: ['HRTEM fringe contrast depends on defocus and thickness; spacings are reliable, but fringe positions are not atom positions.', 'Matching uses a cubic lattice only; for other systems compare spacings with the reference pattern.'] };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
