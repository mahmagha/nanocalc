/* Tests for js/calculators/structure.js (PLAN.md workstream E). */
'use strict';
module.exports = function (t) {
  const { NC, run, res, near, ok, throwsInput } = t;
  const lam = 0.1540593;

  /* ---- lattice: cubic Au and hexagonal ZnO recovered from synthetic peaks ---- */
  const au = NC.synthLattice('cubic', { a: 0.4078 }, lam, [[1, 1, 1], [2, 0, 0], [2, 2, 0], [3, 1, 1], [2, 2, 2]]);
  let o = run('lattice', { sys: 'cubic', lambda: lam, data: au });
  ok(Math.abs(res(o, 'Lattice parameter a') - 0.4078) < 1e-4, 'lattice: cubic Au a = 0.4078 nm, got ' + res(o, 'Lattice parameter a'));
  near(res(o, 'Cell volume'), Math.pow(0.4078, 3), 1e-3, 'lattice: cubic cell volume');
  o = run('lattice', {}); // example: hexagonal ZnO
  ok(Math.abs(res(o, 'Lattice parameter a') - 0.3250) < 1e-4, 'lattice: ZnO a = 0.3250 nm, got ' + res(o, 'Lattice parameter a'));
  ok(Math.abs(res(o, 'Lattice parameter c') - 0.5207) < 1e-4, 'lattice: ZnO c = 0.5207 nm, got ' + res(o, 'Lattice parameter c'));
  near(res(o, 'Axial ratio'), 0.5207 / 0.3250, 1e-3, 'lattice: ZnO c/a');
  near(res(o, 'Cell volume'), (Math.sqrt(3) / 2) * 0.325 * 0.325 * 0.5207, 1e-3, 'lattice: hexagonal volume');
  // tetragonal anatase-like and orthorhombic
  const ana = NC.synthLattice('tetragonal', { a: 0.3785, c: 0.9514 }, lam, [[1, 0, 1], [0, 0, 4], [2, 0, 0], [1, 0, 5], [2, 1, 1], [2, 0, 4]]);
  o = run('lattice', { sys: 'tetragonal', lambda: lam, data: ana });
  ok(Math.abs(res(o, 'Lattice parameter a') - 0.3785) < 1e-4 && Math.abs(res(o, 'Lattice parameter c') - 0.9514) < 1e-4, 'lattice: tetragonal a, c recovered');
  const orth = NC.synthLattice('orthorhombic', { a: 0.5, b: 0.6, c: 0.7 }, lam, [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1], [2, 1, 0], [0, 1, 2]]);
  o = run('lattice', { sys: 'orthorhombic', lambda: lam, data: orth });
  ok(['a', 'b', 'c'].every((p, i) => Math.abs(res(o, 'Lattice parameter ' + p) - [0.5, 0.6, 0.7][i]) < 1e-4), 'lattice: orthorhombic a, b, c recovered');
  throwsInput(() => run('lattice', { sys: 'hexagonal', data: '34.4, 0, 0, 2' }), 'lattice: too few peaks for hexagonal');
  throwsInput(() => run('lattice', { sys: 'tetragonal', data: '30, 1, 0, 0\n40, 2, 0, 0' }), 'lattice: c undetermined (no l ≠ 0) is singular');

  /* ---- SSP recovers D and ε from synthetic data built with the same model ---- */
  o = run('ssp', {});
  near(res(o, 'Crystallite size'), 15, 1e-3, 'ssp: D = 15 nm recovered');
  near(res(o, 'Microstrain'), 0.002, 1e-3, 'ssp: ε = 0.002 recovered');
  o = run('ssp', { data: NC.synthSSP(40, 0, 0.9, lam, [30, 45, 60, 75]) });
  near(res(o, 'Crystallite size'), 40, 1e-4, 'ssp: strain-free sample (input rounded to 1e-5°)');

  /* ---- RIR: hand example. I/RIR = 1520/3.3 = 460.61, 640/3.4 = 188.24 → 70.99 / 29.01 wt% ---- */
  o = run('rir', {});
  near(o.results[0].value, (100 * 1520 / 3.3) / (1520 / 3.3 + 640 / 3.4), 1e-9, 'rir: anatase wt%');
  near(o.results[0].value + o.results[1].value, 100, 1e-12, 'rir: fractions sum to 100');
  near(o.results[0].value, 70.99, 1e-3, 'rir: hand value 70.99 wt%');
  throwsInput(() => run('rir', { rows: 'A, 100, 1' }), 'rir: needs two phases');

  /* ---- SAED: relativistic wavelengths and fcc ring indexing ---- */
  near(NC.electronLambda(200) * 1000, 2.508, 1e-3, 'saed: λ(200 kV) = 2.508 pm');
  near(NC.electronLambda(300) * 1000, 1.969, 1e-3, 'saed: λ(300 kV) = 1.969 pm');
  near(NC.electronLambda(100) * 1000, 3.701, 1e-3, 'saed: λ(100 kV) = 3.701 pm');
  o = run('saed', {});
  const idx = o.tables[0].rows.map((r) => r[3]);
  ok(JSON.stringify(idx) === JSON.stringify(['(111)', '(200)', '(220)', '(311)']), 'saed: Au rings indexed 111, 200, 220, 311 — got ' + idx.join(' '));
  near(res(o, 'd of first ring'), 0.4078 / Math.sqrt(3), 1e-3, 'saed: d(111) of Au');
  // calibration via standard ring gives the same d
  const lamL = NC.electronLambda(200) * 300;
  o = run('saed', { cal: 'std', dstd: 0.4078 / Math.sqrt(3), Rstd: lamL / (0.4078 / Math.sqrt(3)), meas: 'R_mm', rings: String(lamL / (0.4078 / 2)) });
  near(res(o, 'd of first ring'), 0.2039, 1e-3, 'saed: standard-ring calibration');
  // diameters in nm⁻¹: D = 2/d
  o = run('saed', { cal: 'inv', meas: 'D_inv', rings: String(2 / 0.2355), a: '', rule: 'fcc' });
  near(res(o, 'd of first ring'), 0.2355, 1e-9, 'saed: reciprocal diameters');
  // bcc and diamond rules
  o = run('saed', { cal: 'inv', meas: 'R_inv', rule: 'bcc', a: 0.2866, rings: [2, 4, 6].map((N) => Math.sqrt(N) / 0.2866).join('\n') });
  ok(JSON.stringify(o.tables[0].rows.map((r) => r[3])) === JSON.stringify(['(110)', '(200)', '(211)']), 'saed: bcc Fe 110, 200, 211');
  o = run('saed', { cal: 'inv', meas: 'R_inv', rule: 'diamond', a: 0.5431, rings: [3, 8, 11, 16].map((N) => Math.sqrt(N) / 0.5431).join('\n') });
  ok(JSON.stringify(o.tables[0].rows.map((r) => r[3])) === JSON.stringify(['(111)', '(220)', '(311)', '(400)']), 'saed: diamond Si 111, 220, 311, 400 (no 200, 222)');

  /* ---- HRTEM ---- */
  o = run('hrtem', {});
  near(res(o, 'Fringe spacing'), 0.2355, 1e-9, 'hrtem: 2.355 nm / 10 fringes');
  ok(res(o, 'Fringe set 1 index') === '{111}', 'hrtem: indexed {111}');
  near(res(o, 'Calculated interplanar angle'), 54.7356, 1e-4, 'hrtem: (111)/(200) angle 54.74°');
  ok(res(o, 'Zone axis') === '[0 1 -1]' || /\[(-?\d+ ){2}-?\d+\]/.test(res(o, 'Zone axis')), 'hrtem: zone axis given');
  o = run('hrtem', { mode: 'fft', g: 2 * 4.2463, gref: 'pair', d2: '', phi: '' });
  near(res(o, 'Fringe spacing'), 1 / 4.2463, 1e-9, 'hrtem: FFT opposite spots halved');
  throwsInput(() => run('hrtem', { mode: 'count', n: 2.5 }), 'hrtem: fringe count must be whole');
};
