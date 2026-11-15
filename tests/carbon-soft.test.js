/* Workstream B: carbon and soft nanomaterials — independent hand checks. */
'use strict';
module.exports = function (t) {
  const { NC, run, res, near, ok, throwsInput } = t;
  const NA = 6.02214076e23, MC = 12.011;

  // Graphene: σ = 2/((3√3/2)·0.142²) ≈ 38.18 atoms/nm²; SSA ≈ 2630 m²/g
  const sig = 2 / ((3 * Math.sqrt(3) / 2) * 0.142 * 0.142);
  near(sig, 38.18, 0.001, 'graphene atom density hand value');
  let o = run('graphene');
  near(res(o, 'Atoms per nm²'), sig, 1e-12, 'graphene atoms per nm²');
  near(res(o, 'Theoretical SSA'), 2630, 0.01, 'graphene theoretical SSA ≈ 2630 m²/g');
  near(res(o, 'Theoretical SSA'), 2 / (sig * 1e18 * MC / NA), 1e-12, 'graphene SSA = 2/areal mass');
  near(res(o, 'Atoms in flake'), sig * 1e6, 1e-12, '1 µm² monolayer atom count');
  o = run('graphene', { N: 3, t: 1.0 });
  near(res(o, 'SSA of this stack'), res(o, 'Theoretical SSA') / 3, 1e-12, 'trilayer SSA = S/3');
  near(res(o, 'Layers from thickness'), 1.0 / 0.335, 1e-12, 'layers from thickness');

  // (10,10) SWCNT: armchair translation period a = √3·a_CC holds 4n = 40 atoms → 162.6 atoms/nm
  const perNm = 40 / (Math.sqrt(3) * 0.142);
  o = run('cntmass', { mode: 'swnm', n: 10, m: 10 });
  near(res(o, 'Atoms per nm'), perNm, 1e-9, '(10,10) atoms per nm from unit cell');
  // diameter consistent with the existing cnt calculator
  const dcnt = res(run('cnt', { mode: 'nm', n: 10, m: 10 }), 'Diameter');
  near(res(run('cntmass', { mode: 'swd', d: dcnt }), 'Atoms per nm'), perNm, 1e-9, 'cntmass from cnt diameter');
  near(res(o, 'Specific surface area'), res(run('graphene'), 'Theoretical SSA') / 2, 1e-9, 'SWCNT SSA = half of graphene');
  // MWCNT 5–15 nm, 0.34 nm spacing → ⌊10/0.68⌋ + 1 = 15 walls
  o = run('cntmass', { mode: 'mw', Di: 5, Do: 15, dw: 0.34 });
  near(res(o, 'Walls'), 15, 0, 'MWCNT wall count');
  let sumd = 0;
  for (let k = 0; k < 15; k++) sumd += 5 + 2 * k * 0.34;
  near(res(o, 'Atoms per nm'), Math.PI * sig * sumd, 1e-12, 'MWCNT atoms per nm');
  throwsInput(() => run('cntmass', { mode: 'mw', Di: 10, Do: 5 }), 'MWCNT outer < inner');

  // Fullerene C60: M = 720.66 g/mol; d ≈ 0.71 nm
  o = run('fullerene', { n: 60 });
  near(res(o, 'Molar mass'), 60 * MC, 1e-12, 'C60 molar mass');
  near(res(o, 'Cage diameter'), 0.71, 0.01, 'C60 cage diameter ≈ 0.71 nm');
  throwsInput(() => run('fullerene', { n: 61 }), 'odd fullerene');

  // Carbon dot D = 3 nm, ρ = 2.26: N = ρ(πD³/6)·10⁻²¹·N_A/M_C ≈ 1602
  o = run('cdots', { D: 3, rho: 2.26, conc: '' });
  near(res(o, 'Carbon atoms'), 2.26 * (Math.PI * 27 / 6) * 1e-21 * NA / MC, 1e-12, 'carbon dot atoms');
  near(res(o, 'Carbon atoms'), 1602, 0.001, 'carbon dot ≈ 1602 atoms');

  // Liposome 100 nm, h = 5, a_L = 0.65: N = 4π(50² + 45²)/0.65 ≈ 87,481
  o = run('liposome', { D: 100, h: 5, aL: 0.65, nLam: 1, cL: '' });
  near(res(o, 'Lipids per vesicle'), 4 * Math.PI * (2500 + 2025) / 0.65, 1e-12, 'unilamellar lipid count');
  near(res(o, 'Lipids per vesicle'), 87481, 0.0005, 'unilamellar ≈ 87,481 lipids');
  near(res(o, 'Trapped volume per mol'), (4 / 3) * Math.PI * 45 ** 3 * 1e-24 * NA / (4 * Math.PI * 4525 / 0.65), 1e-12, 'trapped volume per mol lipid');
  o = run('liposome', { D: 100, h: 5, aL: 0.65, nLam: 2, drep: 6.5, cL: '' });
  near(res(o, 'Lipids per vesicle'), 4 * Math.PI * (2500 + 2025 + 43.5 ** 2 + 38.5 ** 2) / 0.65, 1e-12, 'bilamellar lipid count');
  o = run('liposome', { D: 100, h: 5, aL: 0.65, nLam: 1, cL: 10 });
  near(res(o, 'Vesicles per mL'), 10e-3 * NA / (4 * Math.PI * 4525 / 0.65) / 1000, 1e-12, 'vesicles per mL at 10 mM');
  throwsInput(() => run('liposome', { D: 20, h: 5, nLam: 3, drep: 6.5 }), 'too many bilayers');

  // LNP: 100 µg mRNA, 330 g/mol, N/P 6 → 1.818 µmol amine → 1272.7 µg ionizable lipid (700 g/mol)
  o = run('lnp');
  const nP = 100 / 330, nN = 6 * nP, nTot = nN / 0.5;
  near(res(o, 'Ionizable lipid'), nN * 700, 1e-12, 'LNP ionizable lipid mass');
  near(res(o, 'Total lipid'), nN * 700 + nTot * (0.1 * 790.15 + 0.385 * 386.65 + 0.015 * 2509), 1e-12, 'LNP total lipid mass');

  // Polymer NP: D = 100 nm, ρ = 1.3, Mn = 30 kg/mol → ≈ 13,664 chains
  o = run('polymernp', { mode: 'chains', D: 100, rho: 1.3, Mn: 30000 });
  near(res(o, 'Chains per particle'), 1.3 * (Math.PI * 1e6 / 6) * 1e-21 * NA / 30000, 1e-12, 'polymer chains per particle');
  near(res(run('polymernp', { mode: 'mass', Mmic: 2.5e6, Muni: 25000 }), 'Aggregation number'), 100, 1e-12, 'micelle Nagg from masses');
  o = run('polymernp', { mode: 'core', Rc: 10, rho: 1.05, Mn: 10000 });
  near(res(o, 'Aggregation number'), 1.05 * (4 / 3) * Math.PI * 1000 * 1e-21 * NA / 10000, 1e-12, 'micelle Nagg from core');

  // New references resolve
  ['kroto1985', 'stoller2008', 'peigney2001', 'nagle2000', 'hou2021'].forEach((id) => ok(NC.refs[id] && NC.refs[id].id === id, 'reference ' + id));
};
