/* Surface area & porosity: BET multipoint surface area, Kelvin / Harkins–Jura pore size. */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt, C = NC.C;

  /* ================================================================== */
  /* BET                                                                 */
  /* ================================================================== */
  function betExample() {
    const Vm = 50, Cc = 100, lines = ['p/p0, V_ads'];
    for (let i = 1; i <= 20; i++) {
      const x = 0.02 * i;
      const V = (Vm * Cc * x) / ((1 - x) * (1 - x + Cc * x));
      lines.push(x.toFixed(2) + ', ' + V.toFixed(4));
    }
    return lines.join('\n');
  }

  NC.register({
    id: 'bet',
    category: 'surface',
    title: 'BET specific surface area',
    short: 'Multipoint BET analysis of a gas adsorption isotherm with Rouquerol checks',
    description:
      'Fits the linearized BET equation to adsorption data over a chosen relative-pressure range. Gives the monolayer capacity, the BET constant C and the specific surface area, and checks the Rouquerol consistency criteria recommended by IUPAC.',
    refs: ['bet1938', 'thommes2015', 'rouquerol2007', 'lowell2004', 'codata2018'],
    presets: [
      { label: 'N₂ at 77 K (σ = 0.162 nm²)', values: { sigma: 0.162 } },
      { label: 'Ar at 87 K (σ = 0.142 nm²)', values: { sigma: 0.142 } },
      { label: 'Kr at 77 K (σ = 0.202 nm²)', values: { sigma: 0.202 } }
    ],
    presetNote: 'Molecular cross-sectional areas as listed in the IUPAC 2015 report (Thommes et al.). IUPAC recommends Ar at 87 K for polar surfaces.',
    inputs: [
      NC.num('sigma', 'Adsorbate cross-sectional area σ', 'nm²', 0.162),
      NC.num('xmin', 'Fit range: lowest p/p₀', '', 0.05),
      NC.num('xmax', 'Fit range: highest p/p₀', '', 0.3),
      NC.data('data', 'Isotherm data: p/p₀, V_ads (cm³ STP per g)', '', { placeholder: '0.05, 38.2\n0.10, 45.1\n…', help: 'Paste two columns from your instrument export. A header line is skipped.' })
    ],
    example: function () { return { sigma: 0.162, xmin: 0.05, xmax: 0.3, data: betExample() }; },
    compute: function (v) {
      const s = new NC.Steps();
      const sigma = NC.need(v.sigma, 'Cross-sectional area', { positive: true });
      const xmin = NC.need(v.xmin, 'Lowest p/p₀', { gt: 0, lt: 1 });
      const xmax = NC.need(v.xmax, 'Highest p/p₀', { gt: 0, lt: 1 });
      if (xmax <= xmin) NC.fail('The highest p/p₀ of the fit range must be larger than the lowest.');
      const rows = NC.parseRows(v.data, { min: 2, labels: ['p/p₀', 'V_ads'], name: 'Isotherm data' });
      if (!rows.length) NC.fail('Paste the isotherm data (p/p₀, adsorbed volume) to run the analysis.');
      rows.forEach(function (r) {
        if (!(r[0] > 0 && r[0] < 1)) NC.fail('Relative pressures must lie between 0 and 1 (found ' + r[0] + ').');
        if (!(r[1] > 0)) NC.fail('Adsorbed volumes must be positive (found ' + r[1] + ').');
      });
      rows.sort(function (a, b) { return a[0] - b[0]; });
      const fit = rows.filter(function (r) { return r[0] >= xmin - 1e-12 && r[0] <= xmax + 1e-12; });
      if (fit.length < 3) NC.fail('Only ' + fit.length + ' point(s) fall in the fit range ' + xmin + '–' + xmax + '. At least 3 are needed.');

      s.add({
        title: 'Linearized BET equation',
        formula: 'x / [V(1 − x)] = 1/(V_m·C) + [(C − 1)/(V_m·C)]·x,   x = p/p₀', tex: "\\dfrac{x}{V(1 - x)} = \\dfrac{1}{V_m C} + \\dfrac{C - 1}{V_m C}\\,x,\\quad x = p/p_0",
        note: 'Plotting the left-hand side against x gives a straight line with slope s = (C − 1)/(V_m C) and intercept i = 1/(V_m C).',
        ref: 'bet1938'
      });
      const X = fit.map(function (r) { return r[0]; });
      const Y = fit.map(function (r) { return r[0] / (r[1] * (1 - r[0])); });
      s.add({ title: 'Transform the data in the fit range', formula: 'y = x / [V(1 − x)]', tex: "y = \\dfrac{x}{V(1 - x)}", sub: 'e.g. first point: y = ' + f(X[0]) + ' / [' + f(fit[0][1]) + ' × (1 − ' + f(X[0]) + ')]', result: 'y₁ = ' + f(Y[0]) + ' g/cm³ STP  (' + fit.length + ' points, see table)' });
      const lr = NC.stats.linreg(X, Y);
      s.add({ title: 'Least-squares line', formula: 'y = s·x + i', result: 's = ' + f(lr.m) + ',   i = ' + f(lr.b) + ',   R² = ' + NC.fix(lr.r2, 6) });
      if (!(lr.b > 0)) NC.fail('The BET intercept is not positive (i = ' + f(lr.b) + '), so C would be negative. This is typical of microporous materials. Move the fit range to lower p/p₀ (see the Rouquerol criteria).');
      const Vm = 1 / (lr.m + lr.b);
      const Cc = 1 + lr.m / lr.b;
      s.add({ title: 'Monolayer capacity and BET constant', formula: 'V_m = 1/(s + i),   C = 1 + s/i', tex: "V_m = \\dfrac{1}{s + i},\\quad C = 1 + \\dfrac{s}{i}", sub: 'V_m = 1/(' + f(lr.m) + ' + ' + f(lr.b) + ');   C = 1 + ' + f(lr.m) + '/' + f(lr.b), result: 'V_m = ' + f(Vm) + ' cm³ STP/g;   C = ' + f(Cc), ref: 'bet1938' });
      const S = (Vm * C.NA * sigma * 1e-18) / NC.VM_STP;
      s.add({
        title: 'Specific surface area',
        formula: 'S_BET = V_m · N_A · σ / V_mol', tex: "S_{\\text{BET}} = \\dfrac{V_m N_A \\sigma}{V_{\\text{mol}}}",
        sub: 'S = ' + f(Vm) + ' cm³/g × ' + f(C.NA) + ' mol⁻¹ × ' + f(sigma) + '×10⁻¹⁸ m² / ' + f(NC.VM_STP, 7) + ' cm³/mol',
        result: 'S_BET = ' + f(S) + ' m²/g',
        note: 'V_mol is the molar volume of an ideal gas at STP (273.15 K, 101.325 kPa).',
        ref: ['thommes2015', 'codata2018']
      });

      // Rouquerol criteria
      const q = fit.map(function (r) { return r[1] * (1 - r[0]); });
      let mono = true;
      for (let i = 1; i < q.length; i++) if (q[i] <= q[i - 1]) mono = false;
      const xm = 1 / (Math.sqrt(Cc) + 1);
      const inRange = xm >= fit[0][0] && xm <= fit[fit.length - 1][0];
      s.add({ title: 'Rouquerol consistency criteria', formula: '(1) V(1 − x) increases over the range;  (2) C > 0;  (3) p/p₀ at monolayer = 1/(√C + 1) lies in the range', sub: 'p/p₀(V_m) = 1/(√' + f(Cc) + ' + 1)', result: 'p/p₀(V_m) = ' + f(xm) + '; criteria: ' + [mono, Cc > 0, inRange].map(function (b) { return b ? 'pass' : 'fail'; }).join(', '), ref: ['rouquerol2007', 'thommes2015'] });

      const warnings = [];
      if (!mono) warnings.push('V(1 − p/p₀) does not increase steadily over the fit range (Rouquerol criterion 1). Lower the upper limit of the range.');
      if (!inRange) warnings.push('The monolayer pressure 1/(√C + 1) lies outside the fit range (Rouquerol criterion 3).');
      if (lr.r2 < 0.999) warnings.push('R² = ' + NC.fix(lr.r2, 4) + ' < 0.999, so the BET plot is not very linear in this range.');
      if (Cc > 500) warnings.push('A very high C (> 500) suggests micropore filling, so the BET area is an apparent value only.');

      const xLine = [Math.min(xmin, X[0]) * 0.9, Math.max(xmax, X[X.length - 1]) * 1.05];
      return {
        results: [
          { label: 'BET surface area S_BET', value: S, unit: 'm²/g', main: true },
          { label: 'Monolayer capacity V_m', value: Vm, unit: 'cm³ STP/g', main: true },
          { label: 'BET constant C', value: Cc, main: true },
          { label: 'R² of BET fit', value: lr.r2, sig: 6 },
          { label: 'p/p₀ at monolayer', value: xm },
          { label: 'Points used', value: String(fit.length) }
        ],
        steps: s.items,
        warnings: warnings,
        tables: [
          {
            title: 'Rouquerol criteria',
            columns: ['Criterion', 'Value', 'Result'],
            rows: [
              ['V(1 − p/p₀) increases with p/p₀', mono ? 'monotonic' : 'not monotonic', mono ? 'pass' : 'fail'],
              ['C > 0', f(Cc), Cc > 0 ? 'pass' : 'fail'],
              ['1/(√C + 1) within fit range', f(xm) + ' (range ' + f(fit[0][0]) + '–' + f(fit[fit.length - 1][0]) + ')', inRange ? 'pass' : 'fail']
            ]
          },
          {
            title: 'Points in the fit range',
            columns: ['p/p₀', 'V_ads (cm³/g)', 'x/[V(1−x)]', 'V(1−x)'],
            rows: fit.map(function (r, i) { return [f(r[0]), f(r[1]), f(Y[i]), f(q[i])]; })
          }
        ],
        plots: [
          {
            title: 'BET plot', xlabel: 'p/p₀', ylabel: 'x / [V(1 − x)]  (g/cm³)',
            series: [
              { name: 'Fit points', mode: 'markers', points: X.map(function (x, i) { return [x, Y[i]]; }) },
              { name: 'Linear fit', mode: 'line', color: 1, points: xLine.map(function (x) { return [x, lr.m * x + lr.b]; }) }
            ],
            zeroY: true
          },
          {
            title: 'Adsorption isotherm', xlabel: 'p/p₀', ylabel: 'V_ads (cm³ STP/g)',
            series: [
              { name: 'All data', mode: 'markers', hollow: true, points: rows.map(function (r) { return [r[0], r[1]]; }) },
              { name: 'Fit range', mode: 'markers', color: 1, points: fit.map(function (r) { return [r[0], r[1]]; }) }
            ],
            xmin: 0, zeroY: true
          }
        ],
        notes: ['For microporous materials (types I and II/I composite isotherms), the BET area is an apparent “BET area”, not a true geometric area. Always report the p/p₀ range you used.']
      };
    }
  });

  /* ================================================================== */
  /* Kelvin equation + Harkins–Jura film thickness                       */
  /* ================================================================== */
  NC.register({
    id: 'kelvin',
    category: 'surface',
    title: 'Kelvin pore size (with Harkins–Jura film)',
    short: 'Mesopore radius from the relative pressure of capillary condensation',
    description:
      'Uses the Kelvin equation to find the meniscus radius at a given relative pressure. Adding the thickness of the adsorbed multilayer (Harkins–Jura t-curve) gives the pore radius, as in the classic BJH approach.',
    refs: ['thomson1871', 'bjh1951', 'harkins1944', 'thommes2015', 'lowell2004'],
    presets: [{ label: 'N₂ at 77.35 K', values: { gamma: 8.85, Vm: 34.68, T: 77.35 } }],
    presetNote: 'Liquid-nitrogen properties at 77 K as tabulated by Lowell et al. (surface tension 8.85 mN/m, molar volume 34.68 cm³/mol).',
    inputs: [
      NC.num('x', 'Relative pressure p/p₀', '', 0.5),
      NC.num('gamma', 'Surface tension of adsorptive γ', 'mN/m', 8.85),
      NC.num('Vm', 'Molar volume of liquid adsorptive V_L', 'cm³/mol', 34.68),
      NC.num('T', 'Temperature T', 'K', 77.35),
      NC.num('theta', 'Contact angle θ', '°', 0),
      NC.sel('men', 'Meniscus geometry', [['hemi', 'Hemispherical (cylindrical pore, desorption) — factor 2'], ['cyl', 'Cylindrical (open cylinder, adsorption) — factor 1']], 'hemi'),
      NC.sel('film', 'Add adsorbed film thickness t', [['hj', 'Yes, Harkins–Jura t-curve (N₂)'], ['none', 'No (meniscus radius only)']], 'hj')
    ],
    example: { x: 0.5, gamma: 8.85, Vm: 34.68, T: 77.35, theta: 0, men: 'hemi', film: 'hj' },
    compute: function (v) {
      const s = new NC.Steps();
      const x = NC.need(v.x, 'Relative pressure', { gt: 0, lt: 1 });
      const g = NC.need(v.gamma, 'Surface tension', { positive: true }) * 1e-3;
      const Vl = NC.need(v.Vm, 'Molar volume', { positive: true }) * 1e-6;
      const T = NC.need(v.T, 'Temperature', { positive: true });
      const th = NC.need(v.theta, 'Contact angle', { min: 0, lt: 90 });
      const fac = v.men === 'cyl' ? 1 : 2;
      const cos = Math.cos(NC.rad(th));
      const rk = (-fac * g * Vl * cos) / (C.R * T * Math.log(x));
      s.add({
        title: 'Kelvin equation',
        formula: 'ln(p/p₀) = −' + (fac === 2 ? '2' : '') + 'γ·V_L·cosθ / (r_K·R·T)   ⇒   r_K = −' + (fac === 2 ? '2' : '') + 'γ·V_L·cosθ / [R·T·ln(p/p₀)]',
        sub: 'r_K = −' + fac + ' × ' + f(g) + ' N/m × ' + f(Vl) + ' m³/mol × ' + f(cos) + ' / (' + f(C.R) + ' × ' + f(T) + ' × ln ' + f(x) + ')',
        result: 'r_K = ' + f(rk * 1e9) + ' nm',
        note: fac === 2 ? 'A hemispherical meniscus (both principal radii equal) applies to desorption from a cylindrical pore.' : 'A cylindrical meniscus (one principal radius infinite) applies to condensation in an open-ended cylinder during adsorption.',
        ref: ['thomson1871', 'lowell2004']
      });
      let t = 0;
      if (v.film !== 'none') {
        const tA = Math.sqrt(13.99 / (0.034 - Math.log10(x)));
        t = tA / 10;
        s.add({ title: 'Statistical film thickness (Harkins–Jura)', formula: 't [Å] = [13.99 / (0.034 − log₁₀(p/p₀))]^½', tex: "t\\,[\\text{Å}] = \\left[\\dfrac{13.99}{0.034 - \\log_{10}(p/p_0)}\\right]^{1/2}", sub: 't = [13.99 / (0.034 − log₁₀ ' + f(x) + ')]^½ = [13.99 / ' + f(0.034 - Math.log10(x)) + ']^½', result: 't = ' + f(tA) + ' Å = ' + f(t) + ' nm', ref: 'harkins1944' });
      }
      const rp = rk * 1e9 + t;
      s.add({ title: 'Pore radius and diameter', formula: 'r_p = r_K + t,   d_p = 2r_p', sub: 'r_p = ' + f(rk * 1e9) + ' + ' + f(t), result: 'r_p = ' + f(rp) + ' nm;   d_p = ' + f(2 * rp) + ' nm', ref: 'bjh1951' });

      const curve = [];
      for (let xx = 0.3; xx <= 0.99 + 1e-9; xx += 0.005) {
        const r = (-fac * g * Vl * cos) / (C.R * T * Math.log(xx)) * 1e9;
        const tt = v.film !== 'none' ? Math.sqrt(13.99 / (0.034 - Math.log10(xx))) / 10 : 0;
        curve.push([xx, 2 * (r + tt)]);
      }
      const warnings = [];
      if (x < 0.42 && fac === 2) warnings.push('For N₂ at 77 K, capillary evaporation below p/p₀ ≈ 0.42 is usually caused by cavitation, so the Kelvin size can be misleading.');
      if (2 * rp < 2) warnings.push('Pores below ~2 nm are micropores, where the Kelvin equation does not apply.');
      return {
        results: [
          { label: 'Pore diameter d_p', value: 2 * rp, unit: 'nm', main: true },
          { label: 'Pore radius r_p', value: rp, unit: 'nm', main: true },
          { label: 'Kelvin radius r_K', value: rk * 1e9, unit: 'nm' },
          { label: 'Film thickness t', value: t, unit: 'nm' }
        ],
        steps: s.items,
        warnings: warnings,
        plots: [{
          title: 'Pore diameter versus relative pressure', xlabel: 'p/p₀', ylabel: 'Pore diameter d_p (nm)',
          series: [{ name: 'Kelvin' + (v.film !== 'none' ? ' + t' : ''), mode: 'line', points: curve }, { name: 'This point', mode: 'markers', color: 1, size: 5, points: [[x, 2 * rp]] }],
          ymin: 0, ymax: Math.min(Math.max(60, 2 * rp * 1.2), 200)
        }],
        notes: ['Kelvin-based methods such as BJH underestimate pore sizes below ~10 nm by up to 20–30 %. IUPAC (2015) recommends NLDFT/QSDFT kernels for micro- and mesopores.']
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
