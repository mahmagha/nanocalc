/* Workstream G tests: DLVO, sedimentation, seeded growth, yield, nucleation, LSW ripening.
   Expected values are computed independently from the textbook formulas. */
'use strict';
module.exports = function (t) {
  const { NC, run, res, near, ok, throwsInput } = t;
  const kB = 1.380649e-23, NA = 6.02214076e23, e = 1.602176634e-19, eps0 = 8.8541878128e-12, R = 8.314462618;

  /* ---- sedimentation: 100 nm Au in water, η = 0.8903 mPa·s ---- */
  {
    const r = 50e-9, eta = 0.8903e-3, drho = (19.32 - 0.997) * 1000;
    const v = (2 * drho * 9.80665 * r * r) / (9 * eta); // ≈ 1.121e-7 m/s
    const o = run('sediment', { mat: 'Au', D: 100, rhof: 0.997, T: 25, visc: 'custom', eta: 0.8903, H: 10, rcf: 10000 });
    near(res(o, 'Settling velocity'), v * 1e9, 1e-9, 'Stokes velocity of 100 nm Au');
    near(v * 1e9, 112.1, 0.002, 'Stokes velocity ≈ 112 nm/s (hand value)');
    const D = (kB * 298.15) / (3 * Math.PI * eta * 100e-9);
    near(res(o, 'Diffusion coefficient'), D * 1e12, 1e-9, 'Stokes–Einstein D for 100 nm');
    near(res(o, 'Péclet number'), (v * 0.01) / D, 1e-9, 'Péclet number vH/D');
    near(res(o, 'Sedimentation coefficient'), v / 9.80665 / 1e-13, 1e-9, 'Sedimentation coefficient in S');
    ok(/min|h|s/.test(res(o, 'Time to pellet')), 'pellet time formatted');
  }

  /* ---- DLVO: Derjaguin vdW and EDL at h = 2 nm by hand ---- */
  {
    const a = 50e-9, AH = 1e-19, psi = -0.025, I = 10, TK = 298.15, er = 78.5, h = 2e-9;
    const kT = kB * TK;
    const kappa = Math.sqrt((2 * NA * e * e * I) / (er * eps0 * kT));
    const Vw = -(AH * a) / (12 * h);
    const Ve = 2 * Math.PI * er * eps0 * a * psi * psi * Math.log(1 + Math.exp(-kappa * h));
    const o = run('dlvo', { D: 100, AH: 10, psi: -25, I: 10, T: 25, epsMode: 'custom', er: 78.5, model: 'derjaguin', h: 2 });
    near(res(o, 'Total energy at h'), (Vw + Ve) / kT, 1e-9, 'DLVO total at h = 2 nm (Derjaguin)');
    near(res(o, 'Debye length'), 1e9 / kappa, 1e-9, 'Debye length at 10 mM');
    near(1e9 / kappa, 3.04, 0.01, 'Debye length ≈ 3.04 nm at 10 mM (0.304/√I rule)');
    // full Hamaker → Derjaguin limit as h/a → 0 (the gap shrinks as h decreases)
    const gap = (hh) => Math.abs(NC.dlvo.vdw('full', AH, a, hh) / NC.dlvo.vdw('derjaguin', AH, a, hh) - 1);
    ok(gap(1e-12) < 1e-3 && gap(1e-12) < gap(1e-10) && gap(1e-10) < gap(1e-9), 'Full Hamaker expression approaches Derjaguin as h/a → 0: ' + gap(1e-12) + ', ' + gap(1e-10) + ', ' + gap(1e-9));
    // far apart, the full expression decays as −(16/9)·A·a⁶/r⁶ (two point-like spheres)
    const rr = 2 * a + 2000e-9, far = NC.dlvo.vdw('full', AH, a, 2000e-9);
    near(far, -(16 / 9) * AH * a ** 6 / rr ** 6, 0.02, 'Full Hamaker expression has the 1/r⁶ far-field limit');
    // a strongly charged dispersion has a barrier; zero charge has none
    const charged = run('dlvo', { D: 100, AH: 1, psi: -40, I: 1, model: 'full' });
    ok(typeof res(charged, 'Energy barrier') === 'number' && res(charged, 'Energy barrier') > 15, 'charged particles: barrier > 15 kT');
    const neutral = run('dlvo', { D: 100, AH: 10, psi: 0, I: 1, model: 'full' });
    ok(res(neutral, 'Energy barrier') === 'none', 'uncharged particles: no barrier');
  }

  /* ---- seeded growth ---- */
  {
    // seed mass = added mass → volume doubles → d × 2^(1/3)
    const ms = 19.32 * (Math.PI * 12 ** 3 / 6) * 1e-21;
    const N = 1e12;
    const mSeeds = ms * N;
    const nadd = mSeeds / 196.967; // mol of Au that equals the seed mass
    const o = run('seedgrowth', { mat: 'Au', shape: 'sphere', ds: 12, seedMode: 'conc', seedN: 1e12, Vseed: 1, mode: 'forward', nadd: nadd * 1e6, steps: 1, yieldPct: 100 });
    near(res(o, 'Final size'), 12 * Math.cbrt(2), 1e-9, 'Doubling the volume gives d × 2^(1/3)');
    near(res(o, 'Number of seeds'), 1e12, 1e-12, 'Seed count from concentration × volume');
    // target mode is the inverse of forward mode
    const tgt = run('seedgrowth', { mat: 'Au', shape: 'sphere', ds: 12, seedMode: 'conc', seedN: 1e12, Vseed: 1, mode: 'target', dt: 12 * Math.cbrt(2), yieldPct: 100 });
    near(res(tgt, 'Precursor needed'), nadd * 1e6, 1e-9, 'Target mode inverts forward mode');
    // 50 % deposition needs twice the precursor
    const half = run('seedgrowth', { mat: 'Au', shape: 'sphere', ds: 12, seedMode: 'conc', seedN: 1e12, Vseed: 1, mode: 'target', dt: 12 * Math.cbrt(2), yieldPct: 50 });
    near(res(half, 'Precursor needed'), 2 * nadd * 1e6, 1e-9, '50 % deposition doubles the precursor');
    // seeds from mass: all metal in seeds → m_seeds = C·V·M; growth for a cube seed keeps cube scaling
    const cube = run('seedgrowth', { mat: 'Ag', shape: 'cube', ds: 20, seedMode: 'mass', seedC: 0.1, Vseed: 2, mode: 'forward', nadd: 0.2 * 7, steps: 1, yieldPct: 100 });
    near(res(cube, 'Final size'), 20 * 2, 1e-9, 'Cube seeds: adding 7× the seed mass doubles the edge');
    throwsInput(() => run('seedgrowth', { mode: 'target', dt: 5, ds: 12 }), 'target smaller than seed');
  }

  /* ---- yield ---- */
  {
    const o = run('yield', { n: 0.1, nu: 1, mat: 'Au', mact: 17.5, C0: 197, Csup: 9.8 });
    near(res(o, 'Theoretical mass'), 0.1 * 196.967, 1e-12, 'Theoretical Au mass from 0.1 mmol');
    near(res(o, 'Yield'), (100 * 17.5) / (0.1 * 196.967), 1e-12, 'Isolated yield');
    near(res(o, 'Conversion'), 100 * (1 - 9.8 / 197), 1e-12, 'Conversion from ICP');
  }

  /* ---- nucleation: Au, γ = 0.3 J/m², 25 °C, S = 10 ---- */
  {
    const v = (196.967 / 19.32) * 1e-6 / NA, kT = kB * 298.15, L = kT * Math.log(10);
    const r = (2 * 0.3 * v) / L, dG = (16 * Math.PI * 0.027 * v * v) / (3 * L * L);
    const o = run('nucleation', { mat: 'Au', gamma: 0.3, T: 25, S: 10 });
    near(res(o, 'Critical radius'), r * 1e9, 1e-9, 'CNT critical radius');
    near(res(o, 'Nucleation barrier'), dG / kT, 1e-9, 'CNT barrier in kT');
    near(res(o, 'Units in critical nucleus'), ((4 / 3) * Math.PI * r ** 3) / v, 1e-9, 'CNT nucleus size');
    throwsInput(() => run('nucleation', { S: 1 }), 'S must exceed 1');
  }

  /* ---- LSW ripening: parameters → K, then fitting two points recovers K ---- */
  {
    const gamma = 0.3, D = 1e-9, c = 1e-3, Vm = (196.967 / 19.32) * 1e-6, TK = 298.15;
    const K = ((8 * gamma * D * c * Vm * Vm) / (9 * R * TK)) * 1e27; // nm³/s
    const p = run('ripening', { mode: 'params', mat: 'Au', gamma: 0.3, Dm: 1, cinf: 1e-3, T: 25, r0: 2, t: 10 });
    near(res(p, 'Rate constant K'), K, 1e-9, 'LSW rate constant from parameters');
    const r10 = res(p, 'Mean radius at t');
    near(r10, Math.cbrt(8 + K * 36000), 1e-9, 'LSW prediction r(10 h)');
    const fit = run('ripening', { mode: 'fit', r1: 2, t1: 0, r2: r10, t2: 10, t: 10 });
    near(res(fit, 'Rate constant K'), K, 1e-9, 'Fitting two points recovers K (round trip)');
    throwsInput(() => run('ripening', { mode: 'fit', r1: 3, t1: 0, r2: 2, t2: 1 }), 'shrinking radius rejected');
  }
};
