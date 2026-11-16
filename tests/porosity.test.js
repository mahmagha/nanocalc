/* Porosity calculators (js/calculators/porosity.js): t-plot and BJH. Known-answer and self-consistency checks;
 * the comparison with pyGAPS is in validation.test.js. */
'use strict';
module.exports = function (t) {
  const { NC, run, res, near, ok, throwsInput } = t;
  const S = NC.sorption;
  const N2 = { M: 28.0134, rho: 0.808, gamma: 8.85e-3, T: 77.35 };
  const k = S.liquidFactor(N2.M, N2.rho);
  const VL = N2.M / N2.rho * 1e-6;

  // Thickness curves at known points
  near(S.T_CURVES.hj.t(0.5), Math.sqrt(0.1399 / (0.034 + Math.log10(2))), 1e-12, 'Harkins–Jura t(0.5)');
  near(S.T_CURVES.hj.t(0.5), 0.6462, 1e-4, 'Harkins–Jura t(0.5) ≈ 6.46 Å');
  near(S.T_CURVES.halsey.t(Math.exp(-5)), 0.354, 1e-12, 'Halsey t = 0.354 nm when ln(p/p₀) = −5');
  near(k, 28.0134 / (0.808 * 22413.97), 1e-12, 'gas-to-liquid factor for N₂');
  near(k * 1e3, 1.5468, 1e-3, 'S_ext = 1.547 × slope (cm³ STP g⁻¹ nm⁻¹), the classic 15.47 per Å');
  // Kelvin radius agrees with the single-point Kelvin calculator
  near(S.kelvinRadius(0.5, 8.85e-3, 34.68e-6, 77.35, 2), res(run('kelvin', { x: 0.5, film: 'none' }), 'Kelvin radius'), 1e-9, 'BJH Kelvin radius = Kelvin calculator');

  // t-plot on a flat, non-porous surface: exactly linear, so area is exact and intercept zero
  {
    const rows = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4].map((x) => [x, 50 * S.T_CURVES.hj.t(x) * 1e-3 / k]);
    const r = S.tplot(rows, { curve: 'hj', tmin: 0.3, tmax: 0.6, M: N2.M, rho: N2.rho });
    near(r.Sext, 50, 1e-9, 't-plot recovers 50 m²/g on a non-porous surface');
    ok(Math.abs(r.Vmic) < 1e-12, 't-plot intercept is zero without micropores (' + r.Vmic + ')');
  }
  // Example: 0.10 cm³/g micropores + 80 m²/g external area
  {
    const o = run('tplot');
    near(res(o, 'External surface area'), 80, 0.005, 't-plot example external area');
    near(res(o, 'Micropore volume'), 0.10, 0.005, 't-plot example micropore volume');
    ok(o.warnings.length === 0, 't-plot example has no warnings');
    throwsInput(() => run('tplot', { tmin: 0.5, tmax: 0.4 }), 't-plot rejects an empty t range');
    throwsInput(() => run('tplot', { tmin: 1.5, tmax: 2 }), 't-plot needs 3 points in range');
  }

  // BJH: one pore size (8 nm cylinders, 0.5 cm³/g, no external area) → volume lands in the class containing 8 nm
  {
    const rows = [];
    for (let x = 0.98; x > 0.43; x -= 0.01) {
      const tt = S.T_CURVES.hj.t(x), rc = S.kelvinRadius(x, N2.gamma, VL, N2.T, 2) + tt, r = 4;
      const Vliq = r <= rc ? 0.5 : 0.5 * (1 - Math.pow((r - tt) / r, 2));
      rows.push([Math.round(x * 100) / 100, Vliq / k]);
    }
    const b = S.bjh(rows, { curve: 'hj', gamma: N2.gamma, T: N2.T, M: N2.M, rho: N2.rho, fac: 2 });
    let top = b.iv[0];
    b.iv.forEach((j) => { if (j.Vp > top.Vp) top = j; });
    ok(top.Dlo <= 8 && 8 <= top.Dhi, 'BJH puts the largest volume in the class containing 8 nm (' + top.Dlo.toFixed(2) + '–' + top.Dhi.toFixed(2) + ' nm)');
    near(b.Vtot, 0.5, 0.03, 'BJH total volume ≈ 0.5 cm³/g for monodisperse 8 nm pores');
    ok(top.Vp / b.Vtot > 0.85, 'BJH: most of the volume is in one class (' + (top.Vp / b.Vtot).toFixed(3) + ')');
  }
  // Example: Gaussian pores, mean 7 nm, 0.60 cm³/g, + 30 m²/g external area
  {
    const o = run('bjh');
    const mode = res(o, 'Mode pore diameter');
    ok(mode > 6.6 && mode < 7.4, 'BJH example mode ≈ 7 nm (' + mode + ')');
    near(res(o, 'BJH pore volume'), 0.62, 0.05, 'BJH example volume ≈ pores + film');
    ok(o.warnings.length === 0, 'BJH example has no warnings (' + o.warnings.join(' | ') + ')');
    ok(o.tables[0].rows.length === res(o, 'Size classes') * 1, 'BJH table lists every class');
    const low = run('bjh', { data: 'p/p0, V\n0.99, 400\n0.8, 380\n0.6, 300\n0.40, 120\n0.36, 110' });
    ok(low.warnings.some((w) => /cavitation/.test(w)), 'BJH warns about cavitation below 0.42 on desorption');
    ok(!run('bjh', { branch: 'ads', data: 'p/p0, V\n0.99, 400\n0.8, 380\n0.6, 300\n0.40, 120\n0.36, 110' }).warnings.some((w) => /cavitation/.test(w)), 'no cavitation warning on the adsorption branch');
    // adsorption branch: cylindrical meniscus halves the Kelvin radius
    near(S.kelvinRadius(0.7, N2.gamma, VL, N2.T, 1) * 2, S.kelvinRadius(0.7, N2.gamma, VL, N2.T, 2), 1e-12, 'cylindrical meniscus gives half the Kelvin radius');
    throwsInput(() => run('bjh', { data: '0.9, 100\n0.8, 90\n0.7, 80' }), 'BJH needs at least 4 points');
    throwsInput(() => run('bjh', { xmin: 0.9, xmax: 0.5 }), 'BJH rejects an empty pressure range');
  }
};
