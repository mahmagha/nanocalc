/* X-ray diffraction: Bragg's law, Scherrer crystallite size, Williamson–Hall size/strain. */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt;

  const WAVELENGTHS = [
    { label: 'Cu Kα₁ (0.1540593 nm)', values: { lambda: 0.1540593 } },
    { label: 'Cu Kα weighted (0.15418 nm)', values: { lambda: 0.15418 } },
    { label: 'Co Kα₁ (0.1788965 nm)', values: { lambda: 0.1788965 } },
    { label: 'Mo Kα₁ (0.0709317 nm)', values: { lambda: 0.0709317 } }
  ];
  const WL_NOTE = 'Cu Kα₁ and Co Kα₁ wavelengths are from Hölzer et al. (1997), Mo Kα₁ from International Tables for Crystallography Vol. C. The Cu Kα value is the intensity-weighted Kα₁/Kα₂ average.';

  /* ================================================================== */
  /* Bragg's law                                                         */
  /* ================================================================== */
  NC.register({
    id: 'bragg',
    category: 'xrd',
    title: "Bragg's law & cubic lattice parameter",
    short: 'd-spacing from 2θ, lattice parameter, or predicted peak position',
    description:
      "Converts a diffraction angle to an interplanar spacing with Bragg's law. Given Miller indices, it also gives the cubic lattice parameter. It can also predict the 2θ position of an (hkl) reflection from a known cubic lattice parameter.",
    refs: ['bragg1913', 'cullity2001', 'holzer1997', 'itcC2004'],
    presets: WAVELENGTHS,
    presetNote: WL_NOTE,
    inputs: [
      NC.sel('mode', 'Calculate', [['d', 'd-spacing (and a) from 2θ'], ['predict', '2θ from lattice parameter and (hkl)']], 'd'),
      NC.num('lambda', 'X-ray wavelength λ', 'nm', 0.1540593, { limits: { positive: true } }),
      NC.num('n', 'Diffraction order n', '', 1),
      NC.num('tt', 'Peak position 2θ', '°', 38.18, { showIf: function (v) { return v.mode === 'd'; } }),
      NC.num('a', 'Cubic lattice parameter a', 'nm', 0.4078, { showIf: function (v) { return v.mode === 'predict'; } }),
      NC.num('h', 'Miller index h', '', 1),
      NC.num('k', 'Miller index k', '', 1),
      NC.num('l', 'Miller index l', '', 1)
    ],
    example: { mode: 'd', lambda: 0.1540593, n: 1, tt: 38.18, a: 0.4078, h: 1, k: 1, l: 1 },
    compute: function (v) {
      const s = new NC.Steps();
      const lam = NC.need(v.lambda, 'Wavelength', { positive: true });
      const n = NC.need(v.n, 'Diffraction order', { int: true, gt: 0 });
      const h = isFinite(v.h) ? NC.need(v.h, 'h', { int: true }) : 0;
      const k = isFinite(v.k) ? NC.need(v.k, 'k', { int: true }) : 0;
      const l = isFinite(v.l) ? NC.need(v.l, 'l', { int: true }) : 0;
      const hkl2 = h * h + k * k + l * l;
      const hklStr = '(' + h + ' ' + k + ' ' + l + ')';

      if (v.mode === 'predict') {
        const a = NC.need(v.a, 'Lattice parameter', { positive: true });
        if (hkl2 === 0) NC.fail('Enter non-zero Miller indices (hkl).');
        const d = a / Math.sqrt(hkl2);
        s.add({ title: 'Interplanar spacing of a cubic lattice', formula: 'd_hkl = a / √(h² + k² + l²)', tex: "d_{hkl} = \\dfrac{a}{\\sqrt{h^2 + k^2 + l^2}}", sub: 'd = ' + f(a) + ' nm / √' + hkl2, result: 'd' + hklStr + ' = ' + f(d) + ' nm', ref: 'cullity2001' });
        const sinT = (n * lam) / (2 * d);
        if (sinT > 1) NC.fail('nλ/(2d) = ' + f(sinT) + ' > 1, so this reflection cannot be reached at this wavelength.');
        const th = NC.deg(Math.asin(sinT));
        s.add({ title: "Bragg's law solved for θ", formula: 'nλ = 2d·sinθ   ⇒   θ = arcsin[nλ / (2d)]', tex: "n\\lambda = 2d\\sin\\theta \\;\\Rightarrow\\; \\theta = \\arcsin\\dfrac{n\\lambda}{2d}", sub: 'θ = arcsin[' + n + ' × ' + f(lam) + ' / (2 × ' + f(d) + ')] = arcsin(' + f(sinT) + ')', result: 'θ = ' + NC.fix(th, 3) + '°   ⇒   2θ = ' + NC.fix(2 * th, 3) + '°', ref: 'bragg1913' });
        return {
          results: [
            { label: 'Peak position 2θ', value: 2 * th, unit: '°', main: true },
            { label: 'd-spacing d' + hklStr, value: d, unit: 'nm', main: true },
            { label: 'd-spacing (Å)', value: d * 10, unit: 'Å' }
          ],
          steps: s.items
        };
      }

      const tt = NC.need(v.tt, '2θ', { gt: 0, lt: 180 });
      const th = tt / 2;
      s.add({ title: 'Bragg angle', formula: 'θ = 2θ / 2', sub: 'θ = ' + f(tt) + '° / 2', result: 'θ = ' + f(th, 5) + '°' });
      const sinT = Math.sin(NC.rad(th));
      const d = (n * lam) / (2 * sinT);
      s.add({ title: "Bragg's law", formula: 'nλ = 2d·sinθ   ⇒   d = nλ / (2 sinθ)', tex: "n\\lambda = 2d\\sin\\theta \\;\\Rightarrow\\; d = \\dfrac{n\\lambda}{2\\sin\\theta}", sub: 'd = ' + n + ' × ' + f(lam) + ' nm / (2 × sin ' + f(th, 5) + '°) = ' + f(n * lam) + ' / (2 × ' + f(sinT, 5) + ')', result: 'd = ' + f(d, 5) + ' nm = ' + f(d * 10, 5) + ' Å', ref: 'bragg1913' });
      const results = [
        { label: 'd-spacing d', value: d, unit: 'nm', main: true, sig: 5 },
        { label: 'd-spacing (Å)', value: d * 10, unit: 'Å', sig: 5 }
      ];
      if (hkl2 > 0) {
        const a = d * Math.sqrt(hkl2);
        s.add({ title: 'Cubic lattice parameter', formula: 'a = d_hkl · √(h² + k² + l²)', tex: "a = d_{hkl}\\sqrt{h^2 + k^2 + l^2}", sub: 'a = ' + f(d, 5) + ' nm × √' + hkl2 + ' (for ' + hklStr + ')', result: 'a = ' + f(a, 5) + ' nm', note: 'Valid only for cubic crystals and a correctly indexed reflection.', ref: 'cullity2001' });
        results.push({ label: 'Lattice parameter a (cubic)', value: a, unit: 'nm', main: true, sig: 5 });
      }
      return { results: results, steps: s.items };
    }
  });

  /* ================================================================== */
  /* Shared peak parsing and broadening correction                       */
  /* ================================================================== */
  const PEAK_INPUTS = [
    NC.num('lambda', 'X-ray wavelength λ', 'nm', 0.1540593, { limits: { positive: true } }),
    NC.num('K', 'Shape factor K', '', 0.9, { limits: { positive: true }, help: 'Usually 0.89–0.94, depending on crystallite shape and on whether FWHM or integral breadth is used (Langford & Wilson 1978).' }),
    NC.sel('corr', 'Instrumental broadening correction', [['none', 'None'], ['gaussian', 'Gaussian: β = √(β_obs² − β_inst²)'], ['lorentzian', 'Lorentzian: β = β_obs − β_inst']], 'gaussian'),
    NC.num('inst', 'Default instrumental FWHM', '°', 0.05, { limits: { nonneg: true }, help: 'Used for rows without a third column. Measure it on a standard such as LaB₆ or Si.' })
  ];
  const PEAK_DATA = NC.data('data', 'Peaks: 2θ (°), FWHM (°) [, instrumental FWHM (°)]', '', { placeholder: '38.18, 0.52\n44.39, 0.58\n64.58, 0.71' });

  function readPeaks(v, s) {
    const lam = NC.need(v.lambda, 'Wavelength', { positive: true });
    const K = NC.need(v.K, 'Shape factor K', { positive: true });
    const corr = v.corr || 'none';
    const instDef = isFinite(v.inst) ? NC.need(v.inst, 'Instrumental FWHM', { nonneg: true }) : 0;
    const rows = NC.parseRows(v.data, { min: 2, max: 3, labels: ['2θ', 'FWHM', 'instrumental FWHM'], name: 'Peaks' });
    if (!rows.length) NC.fail('Enter at least one peak (2θ and FWHM, in degrees).');
    return {
      lam: lam,
      K: K,
      corr: corr,
      peaks: rows.map(function (r, i) {
        const tt = r[0], bo = r[1];
        const bi = corr === 'none' ? 0 : r.length > 2 ? r[2] : instDef;
        if (!(tt > 0 && tt < 180)) NC.fail('Peak ' + (i + 1) + ': 2θ must be between 0 and 180°.');
        if (!(bo > 0)) NC.fail('Peak ' + (i + 1) + ': FWHM must be positive.');
        if (corr !== 'none' && bi >= bo) NC.fail('Peak ' + (i + 1) + ': the observed FWHM (' + bo + '°) must be larger than the instrumental FWHM (' + bi + '°).');
        const b = corr === 'gaussian' ? Math.sqrt(bo * bo - bi * bi) : corr === 'lorentzian' ? bo - bi : bo;
        const th = NC.rad(tt / 2);
        return { tt: tt, bo: bo, bi: bi, bDeg: b, b: NC.rad(b), th: th };
      })
    };
  }
  function corrStep(s, P, p) {
    if (P.corr === 'gaussian')
      s.add({ title: 'Remove instrumental broadening (Gaussian profiles)', formula: 'β = √(β_obs² − β_inst²)', sub: 'β = √(' + f(p.bo) + '² − ' + f(p.bi) + '²)°', result: 'β = ' + f(p.bDeg) + '°', ref: 'holder2019' });
    else if (P.corr === 'lorentzian')
      s.add({ title: 'Remove instrumental broadening (Lorentzian profiles)', formula: 'β = β_obs − β_inst', sub: 'β = ' + f(p.bo) + '° − ' + f(p.bi) + '°', result: 'β = ' + f(p.bDeg) + '°', ref: 'holder2019' });
  }

  const AU_PEAKS = [38.18, 44.39, 64.58, 77.55, 81.72];
  function exampleData(D, eps, lam, K, withStrain) {
    return AU_PEAKS.map(function (tt) {
      const th = NC.rad(tt / 2);
      const b = (K * lam) / (D * Math.cos(th)) + (withStrain ? 4 * eps * Math.tan(th) : 0);
      return tt + ', ' + NC.deg(b).toFixed(4);
    }).join('\n');
  }

  /* ================================================================== */
  /* Scherrer                                                            */
  /* ================================================================== */
  NC.register({
    id: 'scherrer',
    category: 'xrd',
    title: 'Scherrer crystallite size',
    short: 'Crystallite size from XRD peak broadening',
    description:
      'Estimates the mean crystallite size from the width of one or more diffraction peaks, with an optional correction for instrumental broadening.',
    refs: ['scherrer1918', 'patterson1939', 'langford1978', 'holder2019', 'holzer1997'],
    presets: WAVELENGTHS,
    presetNote: WL_NOTE,
    inputs: PEAK_INPUTS.concat([PEAK_DATA]),
    example: function () {
      return { lambda: 0.1540593, K: 0.9, corr: 'none', inst: 0.05, data: exampleData(15, 0, 0.1540593, 0.9, false) };
    },
    compute: function (v) {
      const s = new NC.Steps();
      const P = readPeaks(v, s);
      s.add({ title: 'Scherrer equation', formula: 'D = Kλ / (β·cosθ)   (β = FWHM in radians, θ = Bragg angle)', tex: "D = \\dfrac{K\\lambda}{\\beta\\cos\\theta}\\qquad(\\beta = \\text{FWHM in radians},\\ \\theta = \\text{Bragg angle})", note: 'Gives the volume-weighted mean column length normal to the diffracting planes.', ref: ['scherrer1918', 'patterson1939'] });
      const Ds = [];
      const rows = [];
      P.peaks.forEach(function (p, i) {
        s.heading('Peak ' + (i + 1) + ' (2θ = ' + f(p.tt) + '°)');
        corrStep(s, P, p);
        s.add({ title: 'Convert to radians and Bragg angle', formula: 'β[rad] = β[°]·π/180,   θ = 2θ/2', sub: 'β = ' + f(p.bDeg) + ' × π/180;   θ = ' + f(p.tt) + '/2 = ' + f(p.tt / 2) + '°', result: 'β = ' + f(p.b) + ' rad;   cosθ = ' + f(Math.cos(p.th), 5) });
        const D = (P.K * P.lam) / (p.b * Math.cos(p.th));
        s.add({ title: 'Crystallite size', formula: 'D = Kλ / (β·cosθ)', tex: "D = \\dfrac{K\\lambda}{\\beta\\cos\\theta}", sub: 'D = ' + f(P.K) + ' × ' + f(P.lam) + ' nm / (' + f(p.b) + ' × ' + f(Math.cos(p.th), 5) + ')', result: 'D = ' + f(D) + ' nm', ref: 'scherrer1918' });
        Ds.push(D);
        rows.push([f(p.tt), f(p.bo), P.corr === 'none' ? '—' : f(p.bi), f(p.bDeg), f(D)]);
      });
      const mean = NC.stats.mean(Ds);
      const sd = NC.stats.sd(Ds);
      const results = [{ label: Ds.length > 1 ? 'Mean crystallite size' : 'Crystallite size D', value: mean, unit: 'nm', main: true }];
      if (Ds.length > 1) {
        s.heading('Average over peaks');
        s.add({ title: 'Mean and standard deviation', formula: 'D̄ = ΣDᵢ/N,   s = √[Σ(Dᵢ − D̄)²/(N − 1)]', tex: "\\bar{D} = \\dfrac{\\sum D_i}{N},\\quad s = \\sqrt{\\dfrac{\\sum (D_i - \\bar{D})^2}{N - 1}}", sub: 'N = ' + Ds.length, result: 'D̄ = ' + f(mean) + ' nm;   s = ' + f(sd) + ' nm' });
        results.push({ label: 'Standard deviation', value: sd, unit: 'nm' });
        results.push({ label: 'Peaks used', value: Ds.length, unit: '' });
      }
      const warnings = [];
      if (Ds.some(function (d) { return d > 150; })) warnings.push('Sizes above ~100–200 nm are unreliable, because the size broadening becomes comparable to the instrumental broadening.');
      if (Ds.length > 1 && sd / mean > 0.25) warnings.push('Sizes from different peaks disagree by more than 25 %. Strain broadening or anisotropic crystallite shape may be present; try the Williamson–Hall analysis.');
      return {
        results: results,
        steps: s.items,
        warnings: warnings,
        tables: [{ title: 'Per-peak results', columns: ['2θ (°)', 'FWHM obs (°)', 'FWHM inst (°)', 'β corrected (°)', 'D (nm)'], rows: rows }],
        notes: [
          'Scherrer sizes are a lower bound on the crystallite size, because strain and defects also broaden peaks. They are not the same as particle sizes from TEM, since one particle can contain several crystallites.',
          'K depends on crystallite shape and on how width is defined (FWHM or integral breadth). Report the K you used (Langford & Wilson 1978).',
          'The method is reliable roughly below 100–200 nm (Holder & Schaak 2019).'
        ]
      };
    }
  });

  /* ================================================================== */
  /* Williamson–Hall                                                     */
  /* ================================================================== */
  NC.register({
    id: 'wh',
    category: 'xrd',
    title: 'Williamson–Hall size & strain',
    short: 'Separate crystallite size and microstrain from several peaks',
    description:
      'Uniform deformation model: plots β·cosθ against 4·sinθ for several reflections. The intercept gives the crystallite size (Kλ/D) and the slope gives the microstrain ε.',
    refs: ['williamson1953', 'holder2019', 'langford1978', 'holzer1997'],
    presets: WAVELENGTHS,
    presetNote: WL_NOTE,
    inputs: PEAK_INPUTS.concat([PEAK_DATA]),
    example: function () {
      return { lambda: 0.1540593, K: 0.9, corr: 'none', inst: 0.05, data: exampleData(20, 0.002, 0.1540593, 0.9, true) };
    },
    compute: function (v) {
      const s = new NC.Steps();
      const P = readPeaks(v, s);
      if (P.peaks.length < 2) NC.fail('A Williamson–Hall plot needs at least two peaks (three or more recommended).');
      s.add({
        title: 'Williamson–Hall relation (uniform deformation model)',
        formula: 'β·cosθ = Kλ/D + 4ε·sinθ', tex: "\\beta\\cos\\theta = \\dfrac{K\\lambda}{D} + 4\\varepsilon\\sin\\theta",
        note: 'Size broadening goes as 1/cosθ and strain broadening as tanθ. Multiplying by cosθ gives a straight line in sinθ.',
        ref: 'williamson1953'
      });
      const xs = [], ys = [], rows = [];
      P.peaks.forEach(function (p, i) {
        if (P.corr !== 'none') { s.heading('Peak ' + (i + 1) + ' (2θ = ' + f(p.tt) + '°)'); corrStep(s, P, p); }
        const x = 4 * Math.sin(p.th), y = p.b * Math.cos(p.th);
        xs.push(x); ys.push(y);
        rows.push([f(p.tt), f(p.bDeg), f(p.b), f(x, 5), f(y, 5)]);
      });
      s.heading('Linear fit');
      s.add({ title: 'Transform each peak', formula: 'x = 4·sinθ,   y = β[rad]·cosθ', result: 'Values for all ' + xs.length + ' peaks are listed in the table.' });
      const fit = NC.stats.linreg(xs, ys);
      s.add({ title: 'Least-squares line y = m·x + b', formula: 'm = Σ(x − x̄)(y − ȳ) / Σ(x − x̄)²,   b = ȳ − m·x̄', tex: "m = \\dfrac{\\sum (x - \\bar{x})(y - \\bar{y})}{\\sum (x - \\bar{x})^2},\\quad b = \\bar{y} - m\\,\\bar{x}", result: 'm = ' + f(fit.m) + (isFinite(fit.seM) ? ' ± ' + f(fit.seM, 2) : '') + ';   b = ' + f(fit.b) + (isFinite(fit.seB) ? ' ± ' + f(fit.seB, 2) : '') + ' rad;   R² = ' + f(fit.r2, 4) });
      const warnings = [];
      let D = NaN;
      if (fit.b > 0) {
        D = (P.K * P.lam) / fit.b;
        s.add({ title: 'Crystallite size from the intercept', formula: 'D = Kλ / b', tex: "D = \\dfrac{K\\lambda}{b}", sub: 'D = ' + f(P.K) + ' × ' + f(P.lam) + ' nm / ' + f(fit.b), result: 'D = ' + f(D) + ' nm', ref: 'williamson1953' });
      } else {
        warnings.push('The intercept is zero or negative, so no crystallite size can be extracted. Broadening may be strain-dominated, the size may exceed the method’s range, or the data may be too noisy.');
      }
      s.add({ title: 'Microstrain from the slope', formula: 'ε = m', result: 'ε = ' + f(fit.m) + '  (' + f(fit.m * 100, 3) + ' %)', ref: 'williamson1953' });
      if (P.peaks.length === 2) warnings.push('With only two peaks the line passes exactly through both points, so the fit quality cannot be judged. Use three or more reflections.');
      if (P.peaks.length > 2 && fit.r2 < 0.8) warnings.push('R² < 0.8: the uniform deformation model fits poorly. Anisotropic size or strain may be present.');
      if (fit.m < 0) warnings.push('Negative slope (strain): this usually points to data problems or anisotropic broadening rather than a real negative strain.');

      const xmin = 0, xmax = Math.max.apply(null, xs) * 1.08;
      return {
        results: [
          { label: 'Crystallite size D', value: D, unit: 'nm', main: true },
          { label: 'Microstrain ε', value: fit.m, unit: '', main: true },
          { label: 'Microstrain', value: fit.m * 100, unit: '%' },
          { label: 'R²', value: fit.r2, unit: '' }
        ],
        steps: s.items,
        warnings: warnings,
        tables: [{ title: 'Williamson–Hall data', columns: ['2θ (°)', 'β (°)', 'β (rad)', '4 sinθ', 'β cosθ'], rows: rows }],
        plots: [{
          title: 'Williamson–Hall plot', xlabel: '4 sinθ', ylabel: 'β cosθ (rad)',
          series: [
            { name: 'Peaks', mode: 'markers', points: xs.map(function (x, i) { return [x, ys[i]]; }), size: 5 },
            { name: 'Linear fit', mode: 'line', color: 1, points: [[xmin, fit.b], [xmax, fit.m * xmax + fit.b]] }
          ],
          xmin: xmin, zeroY: true
        }],
        notes: [
          'The uniform deformation model assumes isotropic strain. Anisotropic materials may need size-strain plots or full-pattern (Rietveld) analysis (Holder & Schaak 2019).',
          'Correct for instrumental broadening first. It affects the intercept, and therefore D, much more than the slope.'
        ]
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
