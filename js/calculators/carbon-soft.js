/* Carbon nanomaterials (graphene, nanotubes, fullerenes, carbon dots) and soft nanomaterials
   (liposomes, lipid nanoparticles, polymer nanoparticles and micelles). Workstream B. */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt, C = NC.C;

  NC.addRefs({
    kroto1985: { type: 'article', authors: 'Kroto, H. W.; Heath, J. R.; O’Brien, S. C.; Curl, R. F.; Smalley, R. E.', title: 'C60: Buckminsterfullerene', journal: 'Nature', year: 1985, volume: '318', pages: '162–163', doi: '10.1038/318162a0' },
    stoller2008: { doi: '10.1021/nl802558y', type: 'article', authors: 'Stoller, M. D.; Park, S.; Zhu, Y.; An, J.; Ruoff, R. S.', title: 'Graphene-based ultracapacitors', journal: 'Nano Lett.', year: 2008, volume: '8', pages: '3498–3502' },
    peigney2001: { doi: '10.1016/s0008-6223(00)00155-x', type: 'article', authors: 'Peigney, A.; Laurent, Ch.; Flahaut, E.; Bacsa, R. R.; Rousset, A.', title: 'Specific surface area of carbon nanotubes and bundles of carbon nanotubes', journal: 'Carbon', year: 2001, volume: '39', pages: '507–514' },
    nagle2000: { doi: '10.1016/s0304-4157(00)00016-2', type: 'article', authors: 'Nagle, J. F.; Tristram-Nagle, S.', title: 'Structure of lipid bilayers', journal: 'Biochim. Biophys. Acta', year: 2000, volume: '1469', pages: '159–195' },
    hou2021: { doi: '10.1038/s41578-021-00358-0', type: 'article', authors: 'Hou, X.; Zaks, T.; Langer, R.; Dong, Y.', title: 'Lipid nanoparticles for mRNA delivery', journal: 'Nat. Rev. Mater.', year: 2021, volume: '6', pages: '1078–1094' }
  });

  const MC = 12.011; // g/mol, conventional standard atomic weight of carbon (IUPAC 2021)
  const ACC = 0.142; // nm, C–C bond length in graphene/graphite
  const sigmaOf = function (acc) { return 2 / ((3 * Math.sqrt(3) / 2) * acc * acc); }; // atoms per nm²
  const gPerAtom = MC / C.NA;

  /* Shared graphene-lattice steps */
  function latticeSteps(s, acc) {
    const cell = (3 * Math.sqrt(3) / 2) * acc * acc;
    const sig = 2 / cell;
    s.add({ title: 'Area of the graphene unit cell (2 atoms)', formula: 'A_cell = (3√3/2)·a_C–C²', tex: String.raw`A_{\text{cell}} = \dfrac{3\sqrt{3}}{2}\,a_{\text{C–C}}^2`, sub: 'A_cell = 2.5981 × ' + f(acc) + '² nm²', result: 'A_cell = ' + f(cell) + ' nm²', ref: 'saito1998' });
    s.add({ title: 'Areal atom density of one graphene layer', formula: 'σ = 2 / A_cell', tex: String.raw`\sigma = \dfrac{2}{A_{\text{cell}}}`, sub: 'σ = 2 / ' + f(cell), result: 'σ = ' + f(sig) + ' atoms/nm²', ref: 'saito1998' });
    return sig;
  }

  /* ================================================================== */
  /* Graphene                                                            */
  /* ================================================================== */
  NC.register({
    id: 'graphene',
    category: 'carbon',
    title: 'Graphene sheets & flakes',
    short: 'Atoms per area, areal mass, theoretical surface area, layer count, flake atoms',
    description: 'From the graphene lattice, works out the number of atoms and the mass per unit area, the theoretical specific surface area (about 2630 m²/g for an isolated sheet with both sides exposed), the number of layers from a measured thickness, and the atoms and mass of a flake of given lateral size.',
    refs: ['saito1998', 'stoller2008', 'ciaaw2021', 'codata2018'],
    inputs: [
      NC.num('Lx', 'Flake length', 'nm', 1000),
      NC.num('Ly', 'Flake width', 'nm', 1000),
      NC.num('N', 'Number of layers', '', 1, { help: 'Leave as 1 for monolayer graphene.' }),
      NC.num('t', 'Measured flake thickness (optional)', 'nm', NaN, { help: 'For example from AFM. Leave blank to skip. AFM heights of single layers often read higher than 0.335 nm because of adsorbates and tip–substrate effects.' }),
      NC.num('acc', 'C–C bond length a_C–C', 'nm', ACC),
      NC.num('dint', 'Interlayer spacing', 'nm', 0.335)
    ],
    example: { Lx: 1000, Ly: 1000, N: 1, acc: ACC, dint: 0.335 },
    compute: function (v) {
      const s = new NC.Steps();
      const acc = NC.need(v.acc, 'C–C bond length', { positive: true });
      const Lx = NC.need(v.Lx, 'Flake length', { positive: true });
      const Ly = NC.need(v.Ly, 'Flake width', { positive: true });
      const N = NC.need(v.N, 'Number of layers', { positive: true, int: true });
      const dint = NC.need(v.dint, 'Interlayer spacing', { positive: true });
      const sig = latticeSteps(s, acc);
      const areal = sig * 1e18 * gPerAtom; // g/m²
      s.add({ title: 'Areal mass of one layer', formula: 'ρ_A = σ · M_C / N_A', tex: String.raw`\rho_A = \dfrac{\sigma\,M_C}{N_A}`, sub: 'ρ_A = ' + f(sig) + ' × 10¹⁸ m⁻² × ' + MC + ' g/mol / ' + f(C.NA) + ' mol⁻¹', result: 'ρ_A = ' + f(areal) + ' g/m² = ' + f(areal * 1000) + ' mg/m²', ref: ['ciaaw2021', 'codata2018'] });
      const ssa1 = 2 / areal;
      s.add({ title: 'Theoretical specific surface area (isolated sheet, both sides)', formula: 'S = 2 / ρ_A', tex: String.raw`S = \dfrac{2}{\rho_A}`, sub: 'S = 2 / ' + f(areal) + ' g/m²', result: 'S = ' + f(ssa1) + ' m²/g', note: 'This is the familiar ≈ 2630 m²/g upper bound. Restacking and aggregation reduce measured BET areas far below it.', ref: 'stoller2008' });
      const ssaN = ssa1 / N;
      if (N > 1) s.add({ title: 'Surface area of an N-layer stack (only the two outer faces exposed)', formula: 'S_N = S / N', tex: String.raw`S_N = \dfrac{S}{N}`, sub: 'S_N = ' + f(ssa1) + ' / ' + N, result: 'S_N = ' + f(ssaN) + ' m²/g' });
      const atoms = sig * Lx * Ly * N;
      s.add({ title: 'Atoms in the flake', formula: 'N_atoms = σ · L_x · L_y · N', tex: String.raw`N_{\text{atoms}} = \sigma\,L_x L_y\,N`, sub: 'N_atoms = ' + f(sig) + ' × ' + f(Lx) + ' × ' + f(Ly) + ' × ' + N, result: 'N_atoms = ' + f(atoms) });
      const mass = atoms * gPerAtom;
      s.add({ title: 'Mass of the flake', formula: 'm = N_atoms · M_C / N_A', tex: String.raw`m = \dfrac{N_{\text{atoms}}\,M_C}{N_A}`, sub: 'm = ' + f(atoms) + ' × ' + MC + ' / ' + f(C.NA), result: 'm = ' + f(mass) + ' g', ref: 'codata2018' });
      const results = [
        { label: 'Atoms per nm² (one layer)', value: sig, main: true },
        { label: 'Theoretical SSA (monolayer)', value: ssa1, unit: 'm²/g', main: true },
        { label: 'Areal mass (one layer)', value: areal * 1000, unit: 'mg/m²' },
        { label: 'SSA of this stack', value: ssaN, unit: 'm²/g' },
        { label: 'Atoms in flake', value: atoms, main: true },
        { label: 'Flake mass', value: mass, unit: 'g' }
      ];
      const tt = NC.opt(v.t, 'Thickness', { positive: true });
      const warnings = [];
      if (tt !== null) {
        const nl = tt / dint;
        s.add({ title: 'Layer count estimated from thickness', formula: 'N ≈ t / d_int', tex: String.raw`N \approx \dfrac{t}{d_{\text{int}}}`, sub: 'N ≈ ' + f(tt) + ' / ' + f(dint), result: 'N ≈ ' + f(nl, 3) + '  (≈ ' + Math.max(1, Math.round(nl)) + ' layers)', note: 'Interlayer spacing of graphite, 0.335 nm. Use Raman (2D-band shape) or optical contrast to confirm.', ref: 'saito1998' });
        results.push({ label: 'Layers from thickness', value: nl, sig: 3 });
        if (Math.abs(nl - N) > 0.5) warnings.push('The layer count estimated from the thickness (' + f(nl, 3) + ') differs from the number of layers entered (' + N + ').');
      }
      const pts = [];
      for (let k = 1; k <= 10; k++) pts.push([k, ssa1 / k]);
      return {
        results: results, steps: s.items, warnings: warnings,
        plots: [{ title: 'Accessible surface area versus layer count', xlabel: 'Number of layers N', ylabel: 'Specific surface area (m²/g)', zeroY: true, series: [{ name: 'S / N', mode: 'line', points: pts }, { name: 'This sample', mode: 'markers', color: 1, size: 5, points: [[N, ssaN]] }] }],
        notes: ['Ideal, flat, defect-free sheets are assumed. Edges, defects, functional groups (e.g. graphene oxide) and wrinkles change the mass per area.']
      };
    }
  });

  /* ================================================================== */
  /* Carbon nanotubes: atoms and mass per length                         */
  /* ================================================================== */
  NC.register({
    id: 'cntmass',
    category: 'carbon',
    title: 'Carbon nanotube mass & atoms per length',
    short: 'SWCNT/MWCNT atoms and mass per length, wall count, specific surface area',
    description: 'Treats each nanotube wall as a rolled graphene sheet. Gives atoms and mass per unit length, linear density and the geometric specific surface area for a single-walled tube (from its diameter or its (n, m) indices) or a multi-walled tube (from its inner and outer diameters).',
    refs: ['saito1998', 'peigney2001', 'ciaaw2021', 'codata2018'],
    inputs: [
      NC.sel('mode', 'Nanotube', [['swd', 'Single-walled, from diameter'], ['swnm', 'Single-walled, from (n, m)'], ['mw', 'Multi-walled, from inner and outer diameter']], 'swd'),
      NC.num('d', 'Diameter d', 'nm', 1.356, { showIf: function (v) { return v.mode === 'swd'; } }),
      NC.num('n', 'Chiral index n', '', 10, { showIf: function (v) { return v.mode === 'swnm'; } }),
      NC.num('m', 'Chiral index m', '', 10, { showIf: function (v) { return v.mode === 'swnm'; } }),
      NC.num('Di', 'Inner diameter (innermost wall)', 'nm', 5, { showIf: function (v) { return v.mode === 'mw'; } }),
      NC.num('Do', 'Outer diameter (outermost wall)', 'nm', 15, { showIf: function (v) { return v.mode === 'mw'; } }),
      NC.num('dw', 'Wall spacing', 'nm', 0.34, { showIf: function (v) { return v.mode === 'mw'; } }),
      NC.num('len', 'Tube length', 'µm', 1),
      NC.num('acc', 'C–C bond length a_C–C', 'nm', ACC)
    ],
    example: { mode: 'swd', d: 1.356, n: 10, m: 10, Di: 5, Do: 15, dw: 0.34, len: 1, acc: ACC },
    compute: function (v) {
      const s = new NC.Steps();
      const acc = NC.need(v.acc, 'C–C bond length', { positive: true });
      const len = NC.need(v.len, 'Tube length', { positive: true });
      const sig = latticeSteps(s, acc);
      let walls;
      if (v.mode === 'mw') {
        const Di = NC.need(v.Di, 'Inner diameter', { positive: true });
        const Do = NC.need(v.Do, 'Outer diameter', { positive: true });
        const dw = NC.need(v.dw, 'Wall spacing', { positive: true });
        if (Do < Di) NC.fail('The outer diameter must be at least the inner diameter.');
        const nw = Math.floor((Do - Di) / (2 * dw) + 1e-9) + 1;
        walls = [];
        for (let k = 0; k < nw; k++) walls.push(Di + 2 * k * dw);
        s.add({ title: 'Number of walls', formula: 'n_w = ⌊(D_o − D_i)/(2·d_w)⌋ + 1,   d_k = D_i + 2k·d_w', tex: String.raw`n_w = \left\lfloor \dfrac{D_o - D_i}{2d_w} \right\rfloor + 1,\quad d_k = D_i + 2k\,d_w`, sub: 'n_w = ⌊(' + f(Do) + ' − ' + f(Di) + ') / (2 × ' + f(dw) + ')⌋ + 1', result: 'n_w = ' + nw + ' walls, diameters ' + f(walls[0]) + ' … ' + f(walls[nw - 1]) + ' nm', note: 'Concentric walls separated by roughly the graphite interlayer spacing.', ref: 'saito1998' });
      } else {
        let d;
        if (v.mode === 'swnm') {
          const n = NC.need(v.n, 'Index n', { int: true, gt: 0 });
          const m = NC.need(v.m, 'Index m', { int: true, nonneg: true });
          if (m > n) NC.fail('By convention n ≥ m ≥ 0. Swap the indices.');
          d = (acc * Math.sqrt(3) * Math.sqrt(n * n + n * m + m * m)) / Math.PI;
          s.add({ title: 'Tube diameter from (n, m)', formula: 'd = √3·a_C–C·√(n² + nm + m²) / π', tex: String.raw`d = \dfrac{\sqrt{3}\,a_{\text{C–C}}\sqrt{n^2 + nm + m^2}}{\pi}`, sub: 'd = √3 × ' + f(acc) + ' × √(' + (n * n + n * m + m * m) + ') / π', result: 'd = ' + f(d) + ' nm', ref: 'saito1998' });
        } else {
          d = NC.need(v.d, 'Diameter', { positive: true });
        }
        walls = [d];
      }
      const perWall = walls.map(function (dk) { return Math.PI * dk * sig; });
      const atomsPerNm = perWall.reduce(function (a, b) { return a + b; }, 0);
      s.add({ title: 'Atoms per nanometre of tube (rolled graphene)', formula: 'N/L = Σ π·d_k·σ', tex: String.raw`\dfrac{N}{L} = \sum_k \pi\,d_k\,\sigma`, sub: walls.length === 1 ? 'N/L = π × ' + f(walls[0]) + ' × ' + f(sig) : 'N/L = π × ' + f(sig) + ' × (' + walls.map(function (x) { return f(x); }).join(' + ') + ')', result: 'N/L = ' + f(atomsPerNm) + ' atoms/nm', note: 'The circumference of each wall is π·d, so it holds exactly π·d·σ atoms per unit length.', ref: 'saito1998' });
      const gPerNm = atomsPerNm * gPerAtom;
      s.add({ title: 'Linear mass density', formula: 'λ_m = (N/L) · M_C / N_A', tex: String.raw`\lambda_m = \dfrac{N}{L}\,\dfrac{M_C}{N_A}`, sub: 'λ_m = ' + f(atomsPerNm) + ' × ' + MC + ' / ' + f(C.NA), result: 'λ_m = ' + f(gPerNm) + ' g/nm = ' + f(gPerNm * 1e9) + ' g/m = ' + f(gPerNm * 1e18) + ' ag/nm', ref: ['ciaaw2021', 'codata2018'] });
      const Lnm = len * 1000;
      const atoms = atomsPerNm * Lnm, mass = gPerNm * Lnm;
      s.add({ title: 'Atoms and mass of one tube', formula: 'N = (N/L)·L,   m = λ_m·L', tex: String.raw`N = \dfrac{N}{L}\,L,\quad m = \lambda_m L`, sub: 'L = ' + f(len) + ' µm = ' + f(Lnm) + ' nm', result: 'N = ' + f(atoms) + ';   m = ' + f(mass) + ' g' });
      const Dout = walls[walls.length - 1];
      const ssa = (Math.PI * Dout * 1e-18) / gPerNm; // m² per g (outer surface per nm length / mass per nm)
      s.add({ title: 'Geometric specific surface area (outer surface, ends neglected)', formula: 'S = π·d_outer / λ_m', tex: String.raw`S = \dfrac{\pi\,d_{\text{outer}}}{\lambda_m}`, sub: 'S = π × ' + f(Dout) + ' × 10⁻¹⁸ m²/nm / ' + f(gPerNm) + ' g/nm', result: 'S = ' + f(ssa) + ' m²/g', note: walls.length === 1 ? 'One side of a rolled graphene sheet: half of the ≈ 2630 m²/g of free graphene. Bundling lowers the accessible area.' : 'Only the outermost wall is exposed; inner walls add mass but no accessible area.', ref: 'peigney2001' });
      const results = [
        { label: 'Atoms per nm', value: atomsPerNm, main: true },
        { label: 'Linear density', value: gPerNm * 1e9, unit: 'g/m', main: true },
        { label: 'Specific surface area', value: ssa, unit: 'm²/g', main: true },
        { label: 'Walls', value: walls.length },
        { label: 'Atoms per tube', value: atoms },
        { label: 'Mass per tube', value: mass, unit: 'g' },
        { label: 'Tubes per gram', value: 1 / mass, unit: 'g⁻¹' }
      ];
      const tables = walls.length > 1 ? [{ title: 'Walls', columns: ['Wall', 'd (nm)', 'atoms/nm'], rows: walls.map(function (dk, i) { return [String(i + 1), f(dk), f(perWall[i])]; }) }] : [];
      return { results: results, steps: s.items, tables: tables, notes: ['Defects, caps and residual catalyst are neglected. Measured SSA of nanotube powders depends strongly on bundling and wall number.'] };
    }
  });

  /* ================================================================== */
  /* Fullerenes                                                          */
  /* ================================================================== */
  NC.register({
    id: 'fullerene',
    category: 'carbon',
    title: 'Fullerenes (C₆₀, C₇₀, Cₙ)',
    short: 'Molar mass, molecules per gram, cage diameter estimate',
    description: 'For a fullerene Cₙ: molar mass, mass of one molecule, molecules per gram, and an estimate of the cage diameter, treating the cage as a sphere covered with graphene-like atom density.',
    refs: ['kroto1985', 'saito1998', 'ciaaw2021', 'codata2018'],
    presets: [{ label: 'C₆₀', values: { n: 60 } }, { label: 'C₇₀', values: { n: 70 } }, { label: 'C₈₄', values: { n: 84 } }],
    inputs: [
      NC.num('n', 'Number of carbon atoms n', '', 60),
      NC.num('acc', 'C–C bond length a_C–C', 'nm', ACC)
    ],
    example: { n: 60, acc: ACC },
    compute: function (v) {
      const s = new NC.Steps();
      const n = NC.need(v.n, 'Number of atoms', { int: true, min: 20 });
      const acc = NC.need(v.acc, 'C–C bond length', { positive: true });
      if (n % 2 !== 0 || n === 22) NC.fail('Closed fullerene cages have an even number of atoms (20, 24, 26, …); 22 does not exist.');
      const M = n * MC;
      s.add({ title: 'Molar mass', formula: 'M = n · M_C', tex: String.raw`M = n\,M_C`, sub: 'M = ' + n + ' × ' + MC + ' g/mol', result: 'M = ' + f(M, 6) + ' g/mol', ref: ['kroto1985', 'ciaaw2021'] });
      const m1 = M / C.NA;
      s.add({ title: 'Mass of one molecule', formula: 'm = M / N_A', tex: String.raw`m = \dfrac{M}{N_A}`, sub: 'm = ' + f(M, 6) + ' / ' + f(C.NA), result: 'm = ' + f(m1) + ' g', ref: 'codata2018' });
      const sig = latticeSteps(s, acc);
      const dcage = Math.sqrt(n / (Math.PI * sig));
      s.add({ title: 'Cage diameter estimate (sphere with graphene atom density)', formula: 'π·d² = n / σ   ⇒   d = √(n / (π·σ))', tex: String.raw`\pi d^2 = \dfrac{n}{\sigma} \;\Rightarrow\; d = \sqrt{\dfrac{n}{\pi\sigma}}`, sub: 'd = √(' + n + ' / (π × ' + f(sig) + '))', result: 'd ≈ ' + f(dcage) + ' nm (nucleus to nucleus)', note: 'For C₆₀ this gives ≈ 0.71 nm, the measured nucleus-to-nucleus cage diameter. Larger cages such as C₇₀ are elongated, so this is an equivalent diameter. Adding twice the carbon van der Waals radius gives the outer size.' });
      return {
        results: [
          { label: 'Molar mass', value: M, unit: 'g/mol', sig: 6, main: true },
          { label: 'Cage diameter (estimate)', value: dcage, unit: 'nm', main: true },
          { label: 'Molecules per gram', value: 1 / m1, unit: 'g⁻¹', main: true },
          { label: 'Mass per molecule', value: m1, unit: 'g' }
        ],
        steps: s.items
      };
    }
  });

  /* ================================================================== */
  /* Carbon dots                                                         */
  /* ================================================================== */
  NC.register({
    id: 'cdots',
    category: 'carbon',
    title: 'Carbon dots: atoms & concentration',
    short: 'Atoms, mass and number concentration of carbon dots',
    description: 'Estimates the number of carbon atoms, the mass of one dot and the particle number concentration from the dot diameter and a density, assuming a dense, spherical, carbon-only particle.',
    refs: ['crc', 'ciaaw2021', 'codata2018'],
    inputs: [
      NC.num('D', 'Diameter D', 'nm', 3),
      NC.num('rho', 'Density ρ', 'g/cm³', 2.26, { help: '2.26 g/cm³ is crystalline graphite (CRC Handbook). Amorphous or oxygen-rich carbon dots are less dense; use a measured value if you have one.' }),
      NC.num('conc', 'Mass concentration (optional)', 'µg/mL', NaN, { help: 'Leave blank to skip.' })
    ],
    example: { D: 3, rho: 2.26, conc: 100 },
    compute: function (v) {
      const s = new NC.Steps();
      const D = NC.need(v.D, 'Diameter', { positive: true });
      const rho = NC.need(v.rho, 'Density', { positive: true });
      const V = (Math.PI * D * D * D) / 6;
      s.add({ title: 'Volume of one dot', formula: 'V = πD³/6', tex: String.raw`V = \dfrac{\pi D^3}{6}`, sub: 'V = π × ' + f(D) + '³ / 6', result: 'V = ' + f(V) + ' nm³' });
      const m = rho * V * 1e-21;
      s.add({ title: 'Mass of one dot', formula: 'm = ρ·V', sub: 'm = ' + f(rho) + ' g/cm³ × ' + f(V) + ' × 10⁻²¹ cm³', result: 'm = ' + f(m) + ' g', ref: 'crc' });
      const N = (m * C.NA) / MC;
      s.add({ title: 'Carbon atoms per dot', formula: 'N = m·N_A / M_C', tex: String.raw`N = \dfrac{m\,N_A}{M_C}`, sub: 'N = ' + f(m) + ' × ' + f(C.NA) + ' / ' + MC, result: 'N = ' + f(N), ref: ['ciaaw2021', 'codata2018'] });
      const results = [
        { label: 'Carbon atoms per dot', value: N, main: true },
        { label: 'Mass per dot', value: m, unit: 'g', main: true },
        { label: 'Molar mass of a dot', value: m * C.NA, unit: 'g/mol' },
        { label: 'Dots per gram', value: 1 / m, unit: 'g⁻¹' }
      ];
      const conc = NC.opt(v.conc, 'Mass concentration', { positive: true });
      if (conc !== null) {
        const n = (conc * 1e-6) / m;
        s.add({ title: 'Number concentration', formula: 'n = c_mass / m', tex: String.raw`n = \dfrac{c_{\text{mass}}}{m}`, sub: 'n = ' + f(conc) + ' × 10⁻⁶ g/mL / ' + f(m) + ' g', result: 'n = ' + f(n) + ' dots/mL;   ' + f((n * 1000) / C.NA * 1e6) + ' µM' });
        results.push({ label: 'Dots per mL', value: n, unit: 'mL⁻¹', main: true }, { label: 'Molar dot concentration', value: (n * 1000) / C.NA * 1e6, unit: 'µM' });
      }
      return {
        results: results, steps: s.items,
        notes: ['Real carbon dots contain O, N and H, and are often partly amorphous. Treat the atom count as a carbon-equivalent estimate.']
      };
    }
  });

  /* ================================================================== */
  /* Liposomes                                                           */
  /* ================================================================== */
  function lipidsPerVesicle(D, h, aL, nLam, drep) {
    let N = 0;
    const radii = [];
    for (let k = 0; k < nLam; k++) {
      const R = D / 2 - k * drep;
      radii.push(R);
      N += (4 * Math.PI * (R * R + (R - h) * (R - h))) / aL;
    }
    return { N: N, radii: radii, Rin: radii[radii.length - 1] - h };
  }
  NC.register({
    id: 'liposome',
    category: 'soft',
    title: 'Liposomes: lipids per vesicle & trapped volume',
    short: 'Lipids per vesicle, lamellarity, encapsulated volume, vesicle concentration',
    description: 'Counts the lipids in a spherical vesicle from its outer diameter, bilayer thickness and area per lipid (outer and inner leaflets), for unilamellar or multilamellar vesicles. Also gives the trapped aqueous volume, vesicles per mole of lipid, and the vesicle concentration and encapsulated volume fraction for a given lipid concentration.',
    refs: ['nagle2000', 'codata2018'],
    inputs: [
      NC.num('D', 'Outer diameter D', 'nm', 100),
      NC.num('h', 'Bilayer thickness h', 'nm', 5, { help: 'Typically about 4–5 nm (headgroup to headgroup), depending on the lipid. See Nagle & Tristram-Nagle (2000) for measured values.' }),
      NC.num('aL', 'Area per lipid a_L', 'nm²', 0.65, { help: 'Typically about 0.6–0.7 nm² for fluid phosphatidylcholines. It depends on lipid, phase and temperature; use a value measured for your lipid (Nagle & Tristram-Nagle 2000).' }),
      NC.num('nLam', 'Number of bilayers (lamellarity)', '', 1),
      NC.num('drep', 'Lamellar repeat spacing', 'nm', 6.5, { showIf: function (v) { return v.nLam > 1; }, help: 'Bilayer plus water layer between adjacent bilayers in multilamellar vesicles. Typically about 6–7 nm; measure by SAXS if possible.' }),
      NC.num('cL', 'Total lipid concentration (optional)', 'mM', NaN, { help: 'Leave blank to skip.' })
    ],
    example: { D: 100, h: 5, aL: 0.65, nLam: 1, drep: 6.5, cL: 10 },
    compute: function (v) {
      const s = new NC.Steps();
      const D = NC.need(v.D, 'Outer diameter', { positive: true });
      const h = NC.need(v.h, 'Bilayer thickness', { positive: true });
      const aL = NC.need(v.aL, 'Area per lipid', { positive: true });
      const nLam = NC.need(v.nLam, 'Number of bilayers', { int: true, min: 1 });
      const drep = nLam > 1 ? NC.need(v.drep, 'Lamellar repeat spacing', { positive: true }) : 0;
      if (nLam > 1 && drep < h) NC.fail('The lamellar repeat spacing must be at least the bilayer thickness.');
      const r = lipidsPerVesicle(D, h, aL, nLam, drep);
      if (!(r.Rin > 0)) NC.fail('The vesicle is too small for this many bilayers: no aqueous core would be left.');
      const R0 = D / 2;
      s.add({ title: 'Lipids in one bilayer (outer + inner leaflet)', formula: 'N = 4π[R² + (R − h)²] / a_L', tex: String.raw`N = \dfrac{4\pi\left[R^2 + (R - h)^2\right]}{a_L}`, sub: 'N = 4π × [' + f(R0) + '² + (' + f(R0) + ' − ' + f(h) + ')²] / ' + f(aL), result: 'N₁ = ' + f((4 * Math.PI * (R0 * R0 + (R0 - h) * (R0 - h))) / aL), note: 'Leaflet areas are taken at the outer and inner headgroup surfaces.', ref: 'nagle2000' });
      if (nLam > 1) s.add({ title: 'Multilamellar vesicle: sum over concentric bilayers', formula: 'R_k = R − k·d_rep,   N = Σ 4π[R_k² + (R_k − h)²] / a_L', tex: String.raw`R_k = R - k\,d_{\text{rep}},\quad N = \sum_{k=0}^{n-1} \dfrac{4\pi\left[R_k^2 + (R_k - h)^2\right]}{a_L}`, sub: 'R_k = ' + r.radii.map(function (x) { return f(x); }).join(', ') + ' nm', result: 'N = ' + f(r.N) });
      const Vin = (4 / 3) * Math.PI * Math.pow(r.Rin, 3); // nm³
      s.add({ title: 'Trapped aqueous volume (innermost core)', formula: 'V_in = (4/3)π(R_in)³,   R_in = R_(n−1) − h', tex: String.raw`V_{\text{in}} = \dfrac{4}{3}\pi R_{\text{in}}^3,\quad R_{\text{in}} = R_{n-1} - h`, sub: 'R_in = ' + f(r.Rin) + ' nm', result: 'V_in = ' + f(Vin) + ' nm³ = ' + f(Vin * 1e-24) + ' L' + (nLam > 1 ? ' (core only; water between bilayers not counted)' : '') });
      const perMol = C.NA / r.N;
      const trapped = (Vin * 1e-24 * C.NA) / r.N; // L per mol lipid
      s.add({ title: 'Vesicles and trapped volume per mole of lipid', formula: 'n_ves = N_A / N,   V_trap = V_in·N_A / N', tex: String.raw`n_{\text{ves}} = \dfrac{N_A}{N},\quad V_{\text{trap}} = \dfrac{V_{\text{in}}\,N_A}{N}`, sub: 'n_ves = ' + f(C.NA) + ' / ' + f(r.N), result: 'n_ves = ' + f(perMol) + ' vesicles/mol;   V_trap = ' + f(trapped) + ' L/mol lipid', ref: 'codata2018' });
      const results = [
        { label: 'Lipids per vesicle', value: r.N, main: true },
        { label: 'Trapped volume per mol lipid', value: trapped, unit: 'L/mol', main: true },
        { label: 'Vesicles per mol lipid', value: perMol, unit: 'mol⁻¹' },
        { label: 'Aqueous core diameter', value: 2 * r.Rin, unit: 'nm' },
        { label: 'Trapped volume per vesicle', value: Vin, unit: 'nm³' }
      ];
      const cL = NC.opt(v.cL, 'Lipid concentration', { positive: true });
      if (cL !== null) {
        const nv = (cL * 1e-3 * perMol) / 1000; // per mL
        const phi = cL * 1e-3 * trapped;
        s.add({ title: 'Vesicle concentration and encapsulated volume fraction', formula: 'c_ves = c_L·N_A / N,   φ = c_L·V_trap', tex: String.raw`c_{\text{ves}} = \dfrac{c_L\,N_A}{N},\quad \varphi = c_L\,V_{\text{trap}}`, sub: 'c_L = ' + f(cL) + ' mM', result: 'c_ves = ' + f(nv) + ' vesicles/mL;   φ = ' + NC.fix(phi * 100, 2) + ' % of the volume is inside vesicles', note: 'φ is the maximum passive encapsulation efficiency for a solute dissolved before vesicle formation.' });
        results.push({ label: 'Vesicles per mL', value: nv, unit: 'mL⁻¹', main: true }, { label: 'Encapsulated volume fraction', value: phi * 100, unit: '%' });
      }
      const pts = [];
      for (let d = Math.max(2 * h * nLam + 4, 20); d <= Math.max(400, 2 * D); d += 5) {
        const q = lipidsPerVesicle(d, h, aL, nLam, drep);
        if (q.Rin > 0) pts.push([d, q.N]);
      }
      return {
        results: results, steps: s.items,
        plots: [{ title: 'Lipids per vesicle versus diameter', xlabel: 'Outer diameter D (nm)', ylabel: 'Lipids per vesicle', zeroY: true, series: [{ name: nLam + ' bilayer' + (nLam > 1 ? 's' : ''), mode: 'line', points: pts }, { name: 'This vesicle', mode: 'markers', color: 1, size: 5, points: [[D, r.N]] }] }],
        notes: ['Spherical vesicles with a uniform area per lipid are assumed. Cholesterol and lipid mixtures change a_L; use a composition-weighted average.']
      };
    }
  });

  /* ================================================================== */
  /* Lipid nanoparticles: N/P ratio                                      */
  /* ================================================================== */
  NC.register({
    id: 'lnp',
    category: 'soft',
    title: 'Lipid nanoparticles: N/P ratio & lipid amounts',
    short: 'Ionizable lipid and helper-lipid amounts for an mRNA dose at a target N/P',
    description: 'From the nucleic-acid mass and a target N/P ratio (moles of ionizable amine per mole of nucleic-acid phosphate), works out the amount of ionizable lipid, then the amounts of the helper lipids from the molar ratio of the formulation.',
    refs: ['hou2021', 'codata2018'],
    inputs: [
      NC.num('mRNA', 'Nucleic acid mass', 'µg', 100),
      NC.num('Mnt', 'Average mass per nucleotide', 'g/mol', 330, { help: 'About 320–340 g/mol for single-stranded RNA (one phosphate per nucleotide). Use the exact value from your sequence if known.' }),
      NC.num('NP', 'Target N/P ratio', '', 6),
      NC.num('amines', 'Ionizable amines per lipid molecule', '', 1),
      NC.num('x1', 'Ionizable lipid (mol %)', 'mol %', 50),
      NC.num('M1', 'Ionizable lipid molar mass', 'g/mol', 700, { help: 'Replace with the molar mass of your ionizable lipid.' }),
      NC.num('x2', 'Phospholipid, e.g. DSPC (mol %)', 'mol %', 10),
      NC.num('M2', 'Phospholipid molar mass', 'g/mol', 790.15, { help: 'DSPC: 790.15 g/mol.' }),
      NC.num('x3', 'Cholesterol (mol %)', 'mol %', 38.5),
      NC.num('M3', 'Cholesterol molar mass', 'g/mol', 386.65),
      NC.num('x4', 'PEG-lipid (mol %)', 'mol %', 1.5),
      NC.num('M4', 'PEG-lipid molar mass', 'g/mol', 2509, { help: 'PEG-lipids are polydisperse; use the average molar mass from your supplier.' })
    ],
    presetNote: 'Default molar ratio 50 : 10 : 38.5 : 1.5 (ionizable : phospholipid : cholesterol : PEG-lipid) is a commonly used starting point; check it against your formulation.',
    example: { mRNA: 100, Mnt: 330, NP: 6, amines: 1, x1: 50, M1: 700, x2: 10, M2: 790.15, x3: 38.5, M3: 386.65, x4: 1.5, M4: 2509 },
    compute: function (v) {
      const s = new NC.Steps();
      const mR = NC.need(v.mRNA, 'Nucleic acid mass', { positive: true });
      const Mnt = NC.need(v.Mnt, 'Mass per nucleotide', { positive: true });
      const NP = NC.need(v.NP, 'N/P ratio', { positive: true });
      const am = NC.need(v.amines, 'Amines per lipid', { positive: true });
      const comp = [
        ['Ionizable lipid', NC.need(v.x1, 'Ionizable lipid mol %', { positive: true }), NC.need(v.M1, 'Ionizable lipid molar mass', { positive: true })],
        ['Phospholipid', NC.need(v.x2, 'Phospholipid mol %', { nonneg: true }), NC.need(v.M2, 'Phospholipid molar mass', { positive: true })],
        ['Cholesterol', NC.need(v.x3, 'Cholesterol mol %', { nonneg: true }), NC.need(v.M3, 'Cholesterol molar mass', { positive: true })],
        ['PEG-lipid', NC.need(v.x4, 'PEG-lipid mol %', { nonneg: true }), NC.need(v.M4, 'PEG-lipid molar mass', { positive: true })]
      ];
      const sumx = comp.reduce(function (a, c) { return a + c[1]; }, 0);
      const warnings = [];
      if (Math.abs(sumx - 100) > 0.01) warnings.push('The mol % values add up to ' + f(sumx) + ' %, not 100 %; they are normalized.');
      const nP = mR / Mnt; // µmol
      s.add({ title: 'Moles of phosphate in the nucleic acid', formula: 'n_P = m_NA / M_nt', tex: String.raw`n_P = \dfrac{m_{\text{NA}}}{M_{\text{nt}}}`, sub: 'n_P = ' + f(mR) + ' µg / ' + f(Mnt) + ' g/mol', result: 'n_P = ' + f(nP) + ' µmol', note: 'One phosphate per nucleotide.' });
      const nN = NP * nP;
      s.add({ title: 'Moles of ionizable amine for the target N/P', formula: 'n_N = (N/P) · n_P', tex: String.raw`n_N = \left(\dfrac{N}{P}\right) n_P`, sub: 'n_N = ' + f(NP) + ' × ' + f(nP), result: 'n_N = ' + f(nN) + ' µmol', ref: 'hou2021' });
      const nIon = nN / am;
      s.add({ title: 'Moles of ionizable lipid', formula: 'n_ion = n_N / (amines per lipid)', tex: String.raw`n_{\text{ion}} = \dfrac{n_N}{\text{amines per lipid}}`, sub: 'n_ion = ' + f(nN) + ' / ' + f(am), result: 'n_ion = ' + f(nIon) + ' µmol' });
      const nTot = nIon / (comp[0][1] / sumx);
      s.add({ title: 'Total lipid from the molar ratio', formula: 'n_total = n_ion / x_ion', tex: String.raw`n_{\text{total}} = \dfrac{n_{\text{ion}}}{x_{\text{ion}}}`, sub: 'n_total = ' + f(nIon) + ' / ' + f(comp[0][1] / sumx), result: 'n_total = ' + f(nTot) + ' µmol' });
      const rows = comp.map(function (c) {
        const n = (nTot * c[1]) / sumx;
        return { name: c[0], x: (100 * c[1]) / sumx, n: n, m: n * c[2] };
      });
      const mLip = rows.reduce(function (a, r) { return a + r.m; }, 0);
      s.add({ title: 'Mass of each lipid', formula: 'm_i = n_total · x_i · M_i', tex: String.raw`m_i = n_{\text{total}}\,x_i\,M_i`, sub: rows.map(function (r) { return r.name + ': ' + f(r.n) + ' µmol'; }).join(';  '), result: rows.map(function (r) { return r.name + ' ' + f(r.m) + ' µg'; }).join(';  ') });
      s.add({ title: 'Total lipid to nucleic acid weight ratio', formula: 'w = Σm_i / m_NA', tex: String.raw`w = \dfrac{\sum m_i}{m_{\text{NA}}}`, sub: 'w = ' + f(mLip) + ' / ' + f(mR), result: 'w = ' + f(mLip / mR, 3) + ' : 1' });
      return {
        results: [
          { label: 'Ionizable lipid', value: rows[0].m, unit: 'µg', main: true },
          { label: 'Total lipid', value: mLip, unit: 'µg', main: true },
          { label: 'Lipid : nucleic acid (w/w)', value: mLip / mR, sig: 3, main: true },
          { label: 'Phosphate', value: nP, unit: 'µmol' },
          { label: 'Ionizable amine', value: nN, unit: 'µmol' },
          { label: 'Total lipid', value: nTot, unit: 'µmol' }
        ],
        steps: s.items, warnings: warnings,
        tables: [{ title: 'Lipid amounts', columns: ['Component', 'mol %', 'µmol', 'µg'], rows: rows.map(function (r) { return [r.name, NC.fix(r.x, 2), f(r.n), f(r.m)]; }) }],
        notes: ['N/P counts protonatable amines of the ionizable lipid only. Some groups define it per lipid molecule; set "amines per lipid" accordingly.']
      };
    }
  });

  /* ================================================================== */
  /* Polymer nanoparticles and micelles                                  */
  /* ================================================================== */
  NC.register({
    id: 'polymernp',
    category: 'soft',
    title: 'Polymer nanoparticles & micelle aggregation number',
    short: 'Chains per polymer particle; micelle aggregation number',
    description: 'Counts polymer chains in a dense spherical polymer nanoparticle from its size, density and number-average molar mass. For block-copolymer micelles, gives the aggregation number from the core radius and core-block molar mass, or from the micelle and unimer molar masses.',
    refs: ['israelachvili2011', 'codata2018'],
    inputs: [
      NC.sel('mode', 'Calculate', [['chains', 'Chains per polymer nanoparticle'], ['core', 'Micelle aggregation number from core size'], ['mass', 'Micelle aggregation number from molar masses']], 'chains'),
      NC.num('D', 'Particle diameter D', 'nm', 100, { showIf: function (v) { return v.mode === 'chains'; } }),
      NC.num('Rc', 'Micelle core radius R_c', 'nm', 10, { showIf: function (v) { return v.mode === 'core'; } }),
      NC.num('rho', 'Polymer (core) density ρ', 'g/cm³', 1.3, { showIf: function (v) { return v.mode !== 'mass'; }, help: 'Bulk density of the polymer (or of the core-forming block). For example, PLGA is about 1.3 g/cm³ and polystyrene about 1.05 g/cm³; check your polymer’s data sheet.' }),
      NC.num('Mn', 'Molar mass M_n (chain, or core block)', 'g/mol', 30000, { showIf: function (v) { return v.mode !== 'mass'; } }),
      NC.num('Mmic', 'Micelle molar mass', 'g/mol', 2.5e6, { showIf: function (v) { return v.mode === 'mass'; }, help: 'For example from static light scattering or SEC-MALS.' }),
      NC.num('Muni', 'Unimer molar mass', 'g/mol', 25000, { showIf: function (v) { return v.mode === 'mass'; } })
    ],
    example: { mode: 'chains', D: 100, Rc: 10, rho: 1.3, Mn: 30000, Mmic: 2.5e6, Muni: 25000 },
    compute: function (v) {
      const s = new NC.Steps();
      if (v.mode === 'mass') {
        const Mm = NC.need(v.Mmic, 'Micelle molar mass', { positive: true });
        const Mu = NC.need(v.Muni, 'Unimer molar mass', { positive: true });
        const Nagg = Mm / Mu;
        s.add({ title: 'Aggregation number from molar masses', formula: 'N_agg = M_micelle / M_unimer', tex: String.raw`N_{\text{agg}} = \dfrac{M_{\text{micelle}}}{M_{\text{unimer}}}`, sub: 'N_agg = ' + f(Mm) + ' / ' + f(Mu), result: 'N_agg = ' + f(Nagg), ref: 'israelachvili2011' });
        return { results: [{ label: 'Aggregation number', value: Nagg, main: true }], steps: s.items };
      }
      const rho = NC.need(v.rho, 'Density', { positive: true });
      const Mn = NC.need(v.Mn, 'Molar mass', { positive: true });
      let V, label;
      if (v.mode === 'core') {
        const Rc = NC.need(v.Rc, 'Core radius', { positive: true });
        V = (4 / 3) * Math.PI * Rc * Rc * Rc;
        s.add({ title: 'Core volume', formula: 'V_c = (4/3)π·R_c³', tex: String.raw`V_c = \dfrac{4}{3}\pi R_c^3`, sub: 'V_c = (4/3)π × ' + f(Rc) + '³', result: 'V_c = ' + f(V) + ' nm³' });
        label = 'Aggregation number';
      } else {
        const D = NC.need(v.D, 'Diameter', { positive: true });
        V = (Math.PI * D * D * D) / 6;
        s.add({ title: 'Particle volume', formula: 'V = πD³/6', tex: String.raw`V = \dfrac{\pi D^3}{6}`, sub: 'V = π × ' + f(D) + '³ / 6', result: 'V = ' + f(V) + ' nm³' });
        label = 'Chains per particle';
      }
      const m = rho * V * 1e-21;
      s.add({ title: 'Polymer mass', formula: 'm = ρ·V', sub: 'm = ' + f(rho) + ' g/cm³ × ' + f(V) + ' × 10⁻²¹ cm³', result: 'm = ' + f(m) + ' g' });
      const N = (m * C.NA) / Mn;
      s.add({ title: v.mode === 'core' ? 'Aggregation number (chains whose core blocks fill the core)' : 'Chains per particle', formula: 'N = ρ·V·N_A / M_n', tex: String.raw`N = \dfrac{\rho V N_A}{M_n}`, sub: 'N = ' + f(m) + ' g × ' + f(C.NA) + ' / ' + f(Mn), result: 'N = ' + f(N), note: v.mode === 'core' ? 'Assumes a dry, solvent-free core of bulk density. Swollen cores give lower aggregation numbers.' : 'Uses the number-average molar mass, so N is the number of chains.', ref: v.mode === 'core' ? ['israelachvili2011', 'codata2018'] : 'codata2018' });
      return {
        results: [{ label: label, value: N, main: true }, { label: 'Mass per particle', value: m, unit: 'g' }, { label: 'Volume', value: V, unit: 'nm³' }],
        steps: s.items
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
