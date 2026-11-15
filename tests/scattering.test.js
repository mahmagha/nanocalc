/* Workstream D: scattering (Guinier, Porod, NTA, DLS cumulants) — known-value checks on synthetic data. */
'use strict';
module.exports = function (t) {
  const { NC, run, res, near, ok, throwsInput } = t;

  const sphereP = (q, R) => {
    const x = q * R;
    if (x < 1e-6) return 1;
    const a = (3 * (Math.sin(x) - x * Math.cos(x))) / (x * x * x);
    return a * a;
  };

  /* ---- Guinier: exact sphere form factor, R = 10 nm → Rg = √(3/5)·10 = 7.746 nm ---- */
  {
    const R = 10, rows = [];
    for (let q = 0.004; q <= 0.8; q += 0.004) rows.push(q + ', ' + 1000 * sphereP(q, R));
    const o = run('guinier', { qunit: 'nm', data: rows.join('\n'), qmin: '', qmax: '' });
    // Fitting a sphere up to q·Rg = 1.3 carries a known systematic bias of ~2 % (higher-order terms)
    near(res(o, 'Radius of gyration'), Math.sqrt(3 / 5) * R, 0.02, 'Guinier Rg of a 10 nm sphere (auto range)');
    near(res(o, 'Sphere radius'), R, 0.02, 'Guinier sphere radius 10 nm');
    // a narrower range (q·Rg < 0.8) reduces the bias
    const on = run('guinier', { qunit: 'nm', data: rows.join('\n'), qmin: 0.004, qmax: 0.8 / 7.746 });
    near(res(on, 'Sphere radius'), R, 0.01, 'Guinier sphere radius, q·Rg < 0.8');
    ok(Math.abs(res(on, 'Sphere radius') - R) < Math.abs(res(o, 'Sphere radius') - R), 'narrower Guinier range is less biased');
    ok(res(o, 'q_max·Rg') < 1.3, 'Guinier auto range respects q·Rg < 1.3');
    near(res(o, 'I₀'), 1000, 0.01, 'Guinier I0');
    // Å⁻¹ input gives the same Rg (q values ten times smaller)
    const rowsA = [];
    for (let q = 0.004; q <= 0.8; q += 0.004) rowsA.push(q / 10 + ', ' + 1000 * sphereP(q, R));
    near(res(run('guinier', { qunit: 'A', data: rowsA.join('\n'), qmin: '', qmax: '' }), 'Radius of gyration'), res(o, 'Radius of gyration'), 1e-9, 'Guinier Å⁻¹ unit conversion');
    // user range respected
    const ou = run('guinier', { qunit: 'nm', data: rows.join('\n'), qmin: 0.004, qmax: 0.1 });
    ok(res(ou, 'q_max·Rg') <= 0.1 * 7.8, 'Guinier user range used');
    // rising intensity has no Guinier region
    throwsInput(() => run('guinier', { qunit: 'nm', data: '0.01, 1\n0.02, 2\n0.03, 3\n0.04, 4\n0.05, 5', qmin: '', qmax: '' }), 'Guinier with increasing I');
    // synthetic Guinier law recovers Rg exactly
    const rg = 5, gl = [];
    for (let q = 0.01; q <= 0.25; q += 0.01) gl.push(q + ', ' + 50 * Math.exp(-(q * q * rg * rg) / 3));
    near(res(run('guinier', { qunit: 'nm', data: gl.join('\n'), qmin: '', qmax: '' }), 'Radius of gyration'), rg, 1e-6, 'Guinier exact Gaussian data');
  }

  /* ---- Porod: polydisperse spheres; S/V = 3⟨R²⟩/⟨R³⟩ ---- */
  {
    const Rs = [], ws = [];
    for (let i = -30; i <= 30; i++) { Rs.push(10 * (1 + 0.1 * (i / 10))); ws.push(Math.exp(-0.5 * Math.pow(i / 10, 2))); }
    const rows = [];
    for (let q = 0.005; q <= 3.0001; q += 0.005) {
      let I = 0;
      Rs.forEach((R, j) => { const V = (4 / 3) * Math.PI * R ** 3; I += ws[j] * V * V * sphereP(q, R); });
      rows.push(q + ', ' + I);
    }
    let m2 = 0, m3 = 0;
    Rs.forEach((R, j) => { m2 += ws[j] * R * R; m3 += ws[j] * R ** 3; });
    const SVexp = (3 * m2) / m3;
    const o = run('porod', { qunit: 'nm', data: rows.join('\n'), pmin: '', pmax: '', bg: 'none', sys: 'dilute', rho: '' });
    near(res(o, 'S/V of particles'), SVexp, 0.03, 'Porod S/V of polydisperse spheres = 3⟨R²⟩/⟨R³⟩');
    // constant background is recovered by the background fit
    const rowsB = rows.map((l) => { const [q, I] = l.split(', ').map(Number); return q + ', ' + (I + 2e-3 * 1e6); });
    const oB = run('porod', { qunit: 'nm', data: rowsB.join('\n'), pmin: '', pmax: '', bg: 'fit', sys: 'dilute', rho: '' });
    near(res(oB, 'S/V of particles'), SVexp, 0.05, 'Porod with fitted background');
    // two-phase form divided by φ equals the dilute particle S/V
    const o2 = run('porod', { qunit: 'nm', data: rows.join('\n'), pmin: '', pmax: '', bg: 'none', sys: 'twophase', phi: 0.2, rho: '' });
    near(res(o2, 'S/V of sample'), 0.2 * res(o2, 'S/V of particles'), 1e-9, 'Porod two-phase: S/V_sample = φ·S/V_particles');
    near(res(o2, 'S/V of particles') * 0.2 / (0.2 * 0.8), res(o, 'S/V of particles'), 1e-9, 'Porod two-phase reduces to dilute form');
    // mass-specific surface: 1000·(S/V)/ρ
    const oR = run('porod', { qunit: 'nm', data: rows.join('\n'), pmin: '', pmax: '', bg: 'none', sys: 'dilute', rho: 19.32 });
    near(res(oR, 'Specific surface area'), (1000 * res(oR, 'S/V of particles')) / 19.32, 1e-12, 'Porod m²/g conversion');
  }

  /* ---- NTA: 100 nm sphere, water, 25 °C → D = kT/(3πηd) ---- */
  {
    const TK = 298.15, eta = NC.waterViscosity(TK), d = 100e-9;
    const D = (NC.C.kB * TK) / (3 * Math.PI * eta * d) * 1e12; // µm²/s
    const rows = [];
    for (let k = 1; k <= 6; k++) rows.push(k * 0.0333 + ', ' + 4 * D * k * 0.0333);
    const o = run('nta', { mode: 'msd', data: rows.join('\n'), T: 25, visc: 'water', count: 50, fw: 100, fh: 80, depth: 10, dil: 100 });
    near(res(o, 'Hydrodynamic diameter'), 100, 1e-6, 'NTA d_h from MSD fit');
    near(res(o, 'Diffusion coefficient'), D, 1e-9, 'NTA D from slope/4');
    near(res(o, 'Concentration (original)'), (50 / (100 * 80 * 10 * 1e-12)) * 100, 1e-12, 'NTA concentration with dilution');
    const o1 = run('nta', { mode: 'single', msd: 4 * D * 0.05, dt: 0.05, T: 25, visc: 'water', count: '' });
    near(res(o1, 'Hydrodynamic diameter'), 100, 1e-9, 'NTA single-lag d_h');
    throwsInput(() => run('nta', { mode: 'msd', data: '0.1, 1\n0.2, 0.5\n0.3, 0.2' }), 'NTA decreasing MSD');
  }

  /* ---- Cumulants: monodisperse g₂ = 1 + β·e^(−2Γτ) ---- */
  {
    const G = 2500, beta = 0.85, rows = [];
    for (let e = 0; e <= 4; e += 0.1) { const tau = Math.pow(10, e); rows.push(tau + ', ' + (1 + beta * Math.exp(-2 * G * tau * 1e-6))); }
    const o = run('cumulants', { data: rows.join('\n'), base: 1, cut: 0.05, n: 1.33, lam: 633, theta: 173, T: 25, visc: 'water' });
    near(res(o, 'Decay rate'), G, 1e-6, 'Cumulants Γ (monodisperse)');
    ok(Math.abs(res(o, 'Polydispersity')) < 1e-6, 'Cumulants PDI ≈ 0 for monodisperse data: ' + res(o, 'Polydispersity'));
    near(res(o, 'Intercept'), beta, 1e-6, 'Cumulants intercept β');
    // z-average consistent with Stokes–Einstein via q
    const q = (4 * Math.PI * 1.33 * Math.sin(NC.rad(173) / 2)) / 633e-9;
    const TK = 298.15, eta = NC.waterViscosity(TK);
    near(res(o, 'z-average'), ((NC.C.kB * TK) / (3 * Math.PI * eta * (G / (q * q)))) * 1e9, 1e-6, 'Cumulants z-average d_h');
    // polydisperse synthetic with known μ2: PDI recovered
    const mu2 = 0.15 * G * G, rowsP = [];
    // exact quadratic model, only over its physical (decaying) short-time range: τ ≤ 400 µs
    for (let e = 0; e <= 2.6; e += 0.05) { const tau = Math.pow(10, e) * 1e-6; rowsP.push(tau * 1e6 + ', ' + (1 + beta * Math.exp(-2 * G * tau + mu2 * tau * tau))); }
    const oP = run('cumulants', { data: rowsP.join('\n'), base: 1, cut: 0.1, n: 1.33, lam: 633, theta: 173, T: 25, visc: 'water' });
    near(res(oP, 'Polydispersity'), 0.15, 1e-6, 'Cumulants PDI recovered (0.15)');
    // example (80 nm, PDI 0.1, noisy) gives sensible values
    const oe = run('cumulants');
    near(res(oe, 'z-average'), 80, 0.05, 'Cumulants example ≈ 80 nm');
  }
};
