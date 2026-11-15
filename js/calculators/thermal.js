/* Thermal analysis: ligand grafting density from TGA. */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt, C = NC.C;

  NC.register({
    id: 'tga',
    category: 'thermal',
    title: 'Ligand grafting density from TGA',
    short: 'Ligands per particle and per nm² from TGA mass loss',
    description:
      'Uses the organic mass loss and inorganic residue from thermogravimetric analysis, together with the core size and density, to estimate the number of ligands per nanoparticle and the surface grafting density.',
    refs: ['mansfield2014', 'crc', 'codata2018'],
    presets: NC.materialPresets(['Au', 'Ag', 'Fe3O4', 'SiO2', 'TiO2a'], ['rho']),
    presetNote: 'Core densities are bulk values (CRC Handbook).',
    inputs: [
      NC.num('D', 'Core diameter D', 'nm', 10),
      NC.num('rho', 'Core density ρ', 'g/cm³', 19.32),
      NC.num('loss', 'Organic (ligand) mass loss', '%', 5),
      NC.num('res', 'Residual (core) mass', '%', 95),
      NC.num('M', 'Ligand molar mass', 'g/mol', 200)
    ],
    example: { D: 10, rho: 19.32, loss: 5, res: 95, M: 200 },
    compute: function (v) {
      const s = new NC.Steps();
      const D = NC.need(v.D, 'Core diameter', { positive: true });
      const rho = NC.need(v.rho, 'Core density', { positive: true });
      const wo = NC.need(v.loss, 'Organic mass loss', { positive: true, max: 100 });
      const wc = NC.need(v.res, 'Residual mass', { positive: true, max: 100 });
      const M = NC.need(v.M, 'Ligand molar mass', { positive: true });
      if (wo + wc > 100.5) NC.fail('Organic loss plus residue cannot exceed 100 %.');
      const V = (Math.PI * D * D * D) / 6;
      const mp = rho * V * 1e-21;
      s.add({ title: 'Mass of one core', formula: 'm_p = ρ · πD³/6', sub: 'm_p = ' + f(rho) + ' g/cm³ × ' + f(V) + ' nm³ × 10⁻²¹ cm³/nm³', result: 'm_p = ' + f(mp) + ' g', ref: 'crc' });
      const np = wc / 100 / mp;
      s.add({ title: 'Particles per gram of sample', formula: 'N_p = w_core / m_p', sub: 'N_p = ' + f(wc / 100) + ' g / ' + f(mp) + ' g', result: 'N_p = ' + f(np) + ' per g' });
      const nl = (wo / 100 / M) * C.NA;
      s.add({ title: 'Ligand molecules per gram of sample', formula: 'N_L = (w_org / M) · N_A', sub: 'N_L = (' + f(wo / 100) + ' g / ' + f(M) + ' g/mol) × ' + f(C.NA) + ' mol⁻¹', result: 'N_L = ' + f(nl) + ' per g', ref: 'codata2018' });
      const per = nl / np;
      s.add({ title: 'Ligands per particle', formula: 'n = N_L / N_p', sub: 'n = ' + f(nl) + ' / ' + f(np), result: 'n = ' + f(per) });
      const A = Math.PI * D * D;
      const sigma = per / A;
      s.add({ title: 'Grafting density', formula: 'σ = n / (πD²)', sub: 'σ = ' + f(per) + ' / (π × ' + f(D) + '²) = ' + f(per) + ' / ' + f(A) + ' nm²', result: 'σ = ' + f(sigma) + ' ligands/nm²;   footprint = ' + f(1 / sigma) + ' nm²/ligand', ref: 'mansfield2014' });
      return {
        results: [
          { label: 'Grafting density σ', value: sigma, unit: 'nm⁻²', main: true },
          { label: 'Ligands per particle', value: per, main: true },
          { label: 'Footprint per ligand', value: 1 / sigma, unit: 'nm²', main: true },
          { label: 'Particle mass', value: mp, unit: 'g' },
          { label: 'Particles per g sample', value: np, unit: 'g⁻¹' }
        ],
        steps: s.items,
        notes: [
          'This mass balance assumes monodisperse, spherical, dense cores, that all of the organic mass loss is bound ligand (no free ligand, solvent or water), and that the ligand burns off completely without leaving residue.',
          'Use the core diameter from TEM. The hydrodynamic size includes the ligand shell and solvation layer, so it is the wrong value here.'
        ]
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
