/* Optics (Workstream C): Mie, Gans, Ag size inversion, PLQY, Urbach. */
'use strict';
module.exports = function (t) {
  const { NC, run, res, near, ok, throwsInput } = t;
  const O = NC.optics;
  const cx = O.cx;

  // Clausius–Mossotti factor p = (m² − 1)/(m² + 2)
  const cm = (m) => { const m2 = O.cmul(m, m); return O.cdiv(O.csub(m2, cx(1)), O.cadd(m2, cx(2))); };

  // 1. Small-x limit: Mie → quasi-static dipole (Q_abs = 4x·Im p, Q_sca = (8/3)x⁴|p|²)
  {
    const m = cx(1.5, 0.1), x = 0.01, r = O.bhmie(x, m), p = cm(m);
    near(r.qabs, 4 * x * p.im, 1e-3, 'Mie small-x absorption = dipole');
    near(r.qsca, (8 / 3) * Math.pow(x, 4) * O.cabs2(p), 1e-3, 'Mie small-x scattering = Rayleigh');
    // metal-like index (Drude Ag near resonance in water), still small x
    const e = O.drude(3.0, 5, 8.989, 0.05), mm = O.cdiv(O.csqrt(e), cx(1.333)), pm = cm(mm), r2 = O.bhmie(0.005, mm);
    near(r2.qabs, 4 * 0.005 * pm.im, 1e-3, 'Mie small-x absorption = dipole (metal)');
  }
  // 2. Non-absorbing sphere: Q_ext (from Re(a+b)) equals Q_sca (from |a|²+|b|²) — independent sums
  [0.5, 1, 5, 20].forEach((x) => {
    const r = O.bhmie(x, cx(1.5, 0));
    near(r.qext, r.qsca, 1e-9, 'Non-absorbing sphere x=' + x + ': Q_ext = Q_sca');
  });
  // 3. Large x: extinction paradox, Q_ext → 2
  near(O.bhmie(500, cx(1.33, 0)).qext, 2, 0.05, 'Mie large-x extinction paradox Q_ext ≈ 2');
  // 4. Absorbing sphere: Q_abs ≥ 0 and Q_ext > Q_sca
  { const r = O.bhmie(3, cx(0.2, 3.5)); ok(r.qabs > 0 && r.qext > r.qsca, 'Absorbing sphere: Q_abs > 0'); }

  // 5. Gans: L = 1/3 reproduces the sphere dipole α = 4πR³(ε − ε_m)/(ε + 2ε_m)
  {
    const eps = cx(-10, 1.2), em = 1.777, R = 7, V = (4 / 3) * Math.PI * R ** 3;
    const g = O.gansAlpha(eps, em, 1 / 3, V);
    const sph = O.cdiv(O.cmul(cx(4 * Math.PI * R ** 3), O.csub(eps, cx(em))), O.cadd(eps, cx(2 * em)));
    near(g.re, sph.re, 1e-12, 'Gans L=1/3 equals sphere (Re)');
    near(g.im, sph.im, 1e-12, 'Gans L=1/3 equals sphere (Im)');
    near(O.gansL(1), 1 / 3, 1e-12, 'Depolarization factor of a sphere');
  }
  // 6. Depolarization factor vs numerical integral L_c = (abc/2)∫ds/[(s+c²)√((s+a²)(s+b²)(s+c²))]
  [1.5, 3, 6].forEach((AR) => {
    const a = 1, c = AR, N = 200000;
    let sum = 0;
    for (let i = 0; i < N; i++) { // midpoint rule with s = c²·u/(1−u)
      const u = (i + 0.5) / N, sv = (c * c * u) / (1 - u), ds = (c * c) / ((1 - u) * (1 - u));
      sum += ds / ((sv + c * c) * Math.sqrt((sv + a * a) * (sv + a * a) * (sv + c * c)));
    }
    const Lnum = (a * a * c / 2) * sum / N;
    near(O.gansL(AR), Lnum, 1e-4, 'L_∥ closed form = integral (AR ' + AR + ')');
    const Lp = O.gansL(AR);
    near(Lp + 2 * ((1 - Lp) / 2), 1, 1e-12, 'L_∥ + 2L_⊥ = 1 (AR ' + AR + ')');
  });
  // Longitudinal peak red-shifts with aspect ratio
  {
    const a = res(run('gans', { D: 15, L: 30 }), 'Longitudinal'), b = res(run('gans', { D: 15, L: 60 }), 'Longitudinal');
    ok(b > a, 'Gans: longer rods have redder longitudinal peaks (' + a + ' → ' + b + ')');
    ok(res(run('gans', { D: 15, L: 15 }), 'Longitudinal') === res(run('gans', { D: 15, L: 15 }), 'Transverse'), 'Gans AR=1: both peaks coincide');
  }

  // 7. Drude small-sphere resonance: Re ε(E) = −2ε_m ⇒ E = √(ωp²/(ε∞ + 2ε_m) − γ²)
  {
    const nmed = 1.333, em = nmed * nmed, epsInf = 5, wp = 8.989, gam = 0.0165;
    const E = Math.sqrt((wp * wp) / (epsInf + 2 * em) - gam * gam);
    const out = run('mie', { D: 4, nmed, model: 'drude', epsInf, wp, gam, damp: 'off', lmin: 300, lmax: 600, lstep: 0.5 });
    near(res(out, 'Plasmon peak'), NC.HC_EV_NM / E, 0.003, 'Mie small Ag sphere peak at Re ε = −2ε_m (Fröhlich)');
  }
  // Mie molar extinction coefficient definition
  {
    const out = run('mie');
    const Cext = res(out, 'C_ext at peak');
    near(res(out, 'Molar extinction'), (NC.C.NA * Cext * 1e-14) / (1000 * Math.LN10), 1e-9, 'Molar extinction from C_ext');
    ok(res(out, 'Plasmon peak') > 370 && res(out, 'Plasmon peak') < 440, 'Ag 40 nm example peak is in the Ag plasmon region: ' + res(out, 'Plasmon peak'));
  }
  // Pasted n,k table reproduces the Drude result at the table points
  {
    const lams = [];
    for (let l = 300; l <= 600; l += 5) lams.push(l);
    const rows = lams.map((l) => { const n = O.csqrt(O.drude(NC.HC_EV_NM / l, 5, 8.989, 0.05)); return l + ', ' + n.re + ', ' + n.im; }).join('\n');
    const a = run('mie', { D: 30, model: 'nk', nk: rows, lmin: 300, lmax: 600, lstep: 5 });
    const b = run('mie', { D: 30, model: 'drude', epsInf: 5, wp: 8.989, gam: 0.05, damp: 'off', lmin: 300, lmax: 600, lstep: 5 });
    // spectra agree exactly at the table wavelengths (the plotted grid); the refined peak lies between them
    const sa = a.plots[0].series[0].points, sb = b.plots[0].series[0].points;
    ok(sa.length === sb.length && sa.every((p, i) => Math.abs(p[1] - sb[i][1]) <= 1e-9 * Math.abs(sb[i][1])), 'n,k table equals Drude at table points (whole spectrum)');
    near(res(a, 'Plasmon peak'), res(b, 'Plasmon peak'), 2e-3, 'n,k table and Drude give the same peak');
  }

  // 8. Ag size inversion recovers a model-generated size
  {
    const vals = O.presets[0].values;
    const R = 30, extra = (1 * (NC.C.hbar / NC.C.e) * vals.vF * 1e6) / (R * 1e-9);
    const eps = (l) => O.drude(NC.HC_EV_NM / l, vals.epsInf, vals.wp, vals.gam + extra);
    const pw = O.peakAndWidth(60, 1.333, eps);
    const out = run('agsize', { lpeak: pw.lmax, fwhm: pw.fwhm });
    near(res(out, 'Estimated diameter'), 60, 0.05, 'Ag size inversion recovers 60 nm');
    throwsInput(() => run('agsize', { lpeak: 250 }), 'Peak outside model range');
  }

  // 9. PLQY hand calculation
  {
    const fS = 1 - Math.pow(10, -0.05), fR = 1 - Math.pow(10, -0.06);
    near(res(run('plqy'), 'Quantum yield Φ'), 0.5 * 1.2 * (fR / fS), 1e-12, 'PLQY relative method');
    const n2 = res(run('plqy', { n: 1.5, nr: 1.333 }), 'Quantum yield Φ') / res(run('plqy'), 'Quantum yield Φ');
    near(n2, (1.5 * 1.5) / (1.333 * 1.333), 1e-12, 'PLQY refractive-index correction n²/n_ref²');
    ok(run('plqy', { A: 0.2 }).warnings.length > 0, 'PLQY warns above A = 0.1');
  }

  // 10. Urbach energy recovered from synthetic data (E_U = 80 meV)
  near(res(run('urbach'), 'Urbach energy'), 80, 1e-4, 'Urbach energy recovered from synthetic tail');
  near(res(run('urbach', { emin: 2.25, emax: 2.45 }), 'Urbach energy'), 80, 1e-4, 'Urbach energy with a user range');
};
