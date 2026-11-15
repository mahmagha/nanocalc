/* Tests for js/calculators/analysis.js (PLAN.md workstream F). Values computed independently by hand. */
'use strict';
module.exports = function (t) {
  const { NC, run, res, near, ok, throwsInput } = t;
  const NA = 6.02214076e23, e = 1.602176634e-19, kB = 1.380649e-23, muB = 9.2740100783e-24;
  const sphereV = (D) => (Math.PI * D ** 3) / 6;

  ['icp2n', 'spicpms', 'edx', 'magnet', 'ecsa'].forEach((id) => ok(NC.byId[id], 'analysis: calculator ' + id + ' registered'));

  /* ---------- ICP-MS → particle number ---------- */
  // 10 µg/L Au as 20 nm spheres: N = 1e-8 g/mL / (19.32 g/cm³ × V × 1e-21)
  let o = run('icp2n');
  near(res(o, 'Particles per mL'), 1e-8 / (19.32 * sphereV(20) * 1e-21), 1e-9, 'icp2n: 10 µg/L Au, 20 nm spheres');
  near(res(o, 'Molar particle'), ((1e-8 / (19.32 * sphereV(20) * 1e-21)) * 1000 / NA) * 1e12, 1e-9, 'icp2n: molar concentration (pM)');
  // Dilution 10× multiplies the result by 10
  near(res(run('icp2n', { dil: 10 }), 'Particles per mL'), 10 * res(o, 'Particles per mL'), 1e-12, 'icp2n: dilution factor');
  // Fe in Fe3O4 from formula: w = 3×55.845/231.533; 1 mg/L Fe, 10 nm spheres
  const wFe = (3 * 55.845) / 231.533;
  o = run('icp2n', { c: 1, cunit: 'mgL', mat: 'Fe3O4', wmode: 'formula', nel: 3, Mel: 55.845, pshape: 'sphere', pD: 10 });
  near(res(o, 'Element mass fraction'), wFe, 1e-9, 'icp2n: w(Fe in Fe3O4)');
  near(res(o, 'Particles per mL'), (1e-6 / wFe) / (5.17 * sphereV(10) * 1e-21), 1e-9, 'icp2n: Fe3O4 particle number');
  // Cube shape: 20 nm Ag cubes
  near(res(run('icp2n', { mat: 'Ag', pshape: 'cube', pa: 20 }), 'Particles per mL'), 1e-8 / (10.5 * 8000 * 1e-21), 1e-9, 'icp2n: cube volume from builder shapes');
  throwsInput(() => run('icp2n', { wmode: 'direct', w: 1.5 }), 'icp2n: w > 1 rejected');

  /* ---------- spICP-MS ---------- */
  const Q = (350 * 1e-3) / 60, td = 3e-3, sd = 2000 * 1e9;
  const mref = 19.32 * sphereV(60) * 1e-21;
  const etaEx = (sd * mref) / (4994 * Q * td);
  o = run('spicpms');
  near(res(o, 'Transport efficiency'), etaEx * 100, 1e-9, 'spicpms: η by particle size method');
  near(etaEx, 0.05, 0.001, 'spicpms: example η ≈ 5 %');
  // diameter: m = I η Q td / sd, d = (6m/(πρ))^(1/3)
  const mel = (1000 * etaEx * Q * td) / sd;
  near(res(o, 'Particle diameter'), Math.cbrt((6 * mel) / (Math.PI * 19.32)) * 1e7, 1e-9, 'spicpms: particle diameter');
  near(res(o, 'Particle diameter'), 60 * Math.cbrt(1000 / 4994), 1e-9, 'spicpms: d scales as I^(1/3) relative to the reference');
  // Round trip: a sample pulse equal to the reference pulse gives the reference size
  near(res(run('spicpms', { Ip: 4994 }), 'Particle diameter'), 60, 1e-9, 'spicpms: size round-trip');
  near(res(o, 'Particles per mL (sample)'), (25 / (etaEx * Q)) * 1000, 1e-9, 'spicpms: number concentration with dilution');
  // Frequency method: η = f / (N Q)
  near(res(run('spicpms', { mode: 'freq', refN: 1e5, refF: 30 }), 'Transport efficiency'), (30 / (1e5 * Q)) * 100, 1e-9, 'spicpms: η by frequency method');
  // Known η, element fraction: Fe in Fe3O4 gives a larger particle for the same Fe mass
  o = run('spicpms', { mode: 'known', eta: 0.05, mat: 'Fe3O4', w: wFe, Ip: 1000 });
  const melK = (1000 * 0.05 * Q * td) / sd;
  near(res(o, 'Particle diameter'), Math.cbrt((6 * melK) / (Math.PI * 5.17 * wFe)) * 1e7, 1e-9, 'spicpms: compound particle with mass fraction');

  /* ---------- EDX (Cliff–Lorimer) ---------- */
  o = run('edx');
  const kIFe = 12000, kIO = 1.85 * 4000;
  const wtFe = (100 * kIFe) / (kIFe + kIO), wtO = 100 - wtFe;
  const atFe = (100 * (wtFe / 55.845)) / (wtFe / 55.845 + wtO / 15.999);
  const parts = String(res(o, 'Fe')).split('/').map(Number);
  near(parts[0], wtFe, 1e-3, 'edx: Fe wt% (Cliff–Lorimer)');
  near(parts[1], atFe, 1e-3, 'edx: Fe at% from standard atomic weights');
  near(wtO / wtFe, 1.85 * 4000 / 12000, 1e-12, 'edx: C_O/C_Fe = k·I_O/I_Fe');
  // Unknown element without an atomic weight → wt% only, with a warning
  o = run('edx', { data: 'Xx, 100, 1\nYy, 300, 1' });
  near(res(o, 'Xx'), 25, 1e-12, 'edx: wt% without atomic weights');
  ok(o.warnings.length === 1, 'edx: warns about missing atomic weights');
  throwsInput(() => run('edx', { data: 'Fe, 100, 1' }), 'edx: needs two elements');

  /* ---------- Magnetism ---------- */
  o = run('magnet');
  const mkg = 5.17 * 1000 * sphereV(10) * 1e-27;
  near(res(o, 'Moment per particle'), (80 * mkg) / muB, 1e-9, 'magnet: moment in Bohr magnetons');
  const tDead = 5 * (1 - Math.cbrt(80 / 92));
  near(res(o, 'Dead layer'), tDead, 1e-9, 'magnet: dead layer');
  near(Math.pow(1 - (2 * tDead) / 10, 3), 80 / 92, 1e-12, 'magnet: dead layer round-trip');
  const L = Math.log(100 / 1e-9);
  const TB = (1.1e4 * sphereV(10) * 1e-27) / (kB * L);
  near(res(run('magnet', { mode: 'tb', K: 1.1e4, D: 10, tm: 100, t0: 1e-9 }), 'Blocking temperature'), TB, 1e-9, 'magnet: T_B = KV/(k_B ln(τm/τ0))');
  near(L, 25.33, 0.001, 'magnet: ln(100 s / 1 ns) ≈ 25');
  near(res(run('magnet', { mode: 'k', TB: TB, D: 10, tm: 100, t0: 1e-9 }), 'Effective anisotropy'), 1.1e4, 1e-9, 'magnet: K from T_B round-trip');
  const Dsp = res(run('magnet', { mode: 'dsp', K: 1.1e4, T: 300, tm: 100, t0: 1e-9 }), 'Superparamagnetic');
  near(res(run('magnet', { mode: 'tb', K: 1.1e4, D: Dsp, tm: 100, t0: 1e-9 }), 'Blocking temperature'), 300, 1e-9, 'magnet: D_sp gives T_B = T');
  throwsInput(() => run('magnet', { mode: 'tb', tm: 1e-10, t0: 1e-9 }), 'magnet: τ_m must exceed τ₀');

  /* ---------- ECSA ---------- */
  o = run('ecsa');
  near(res(o, 'ECSA'), 5, 1e-12, 'ecsa: 1.05 mC H-UPD / 210 µC/cm² = 5 cm²');
  near(res(o, 'Mass-normalized'), 50, 1e-12, 'ecsa: 5 cm² / 10 µg Pt = 50 m²/g');
  const sites = 1.05e-3 / (e * NA);
  near(res(o, 'Dispersion (electrochemical)'), (100 * sites) / (10e-6 / 195.084), 1e-9, 'ecsa: electrochemical dispersion');
  near(res(o, 'Geometric SSA'), 6000 / (21.45 * 3), 1e-12, 'ecsa: geometric SSA of 3 nm Pt');
  near(res(o, 'Turnover frequency'), 1e-9 / sites, 1e-9, 'ecsa: TOF');
  near(res(run('ecsa', { mode: 'co', Q: 2.1 }), 'ECSA'), 5, 1e-12, 'ecsa: CO stripping 2.1 mC / 420 µC/cm² = 5 cm²');
  near(res(run('ecsa', { qmode: 'area', Aiv: 5.25e-5, nu: 0.05 }), 'ECSA'), 5, 1e-12, 'ecsa: charge from peak area / scan rate');
  near(210e-6 / e, 1.3107e15, 1e-4, 'ecsa: 210 µC/cm² ↔ 1.31×10¹⁵ sites/cm²');
  // CO stripping counts the same sites (2 e⁻ per CO)
  near(res(run('ecsa', { mode: 'co', Q: 2.1 }), 'Surface Pt sites'), sites, 1e-12, 'ecsa: same site count for CO and H-UPD');
};
