/* Synthesis & dosing: solution preparation and particle number concentration. */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt, C = NC.C;

  /* ================================================================== */
  /* Solution preparation                                                 */
  /* ================================================================== */
  const precursors = [
    ['HAuCl₄·3H₂O', 393.83], ['AgNO₃', 169.87], ['Trisodium citrate dihydrate', 294.1], ['NaBH₄', 37.83],
    ['Cd(OAc)₂·2H₂O', 266.53], ['Zn(OAc)₂·2H₂O', 219.51], ['Titanium isopropoxide (TTIP)', 284.22],
    ['TEOS', 208.33], ['FeCl₃·6H₂O', 270.3], ['FeCl₂·4H₂O', 198.81]
  ];
  NC.register({
    id: 'solution',
    category: 'lab',
    title: 'Precursor mass & dilution',
    short: 'Mass of reagent for a target concentration, or C₁V₁ = C₂V₂',
    description: 'Works out how much precursor to weigh for a solution of given molarity and volume (with a purity correction), or the stock volume needed for a dilution.',
    refs: ['ciaaw2021', 'iupacGreen'],
    presets: precursors.map(function (p) { return { label: p[0] + ' (' + p[1] + ' g/mol)', values: { M: p[1] } }; }),
    presetNote: 'Molar masses calculated from IUPAC standard atomic weights. Check the hydration state on your reagent bottle.',
    inputs: [
      NC.sel('mode', 'Calculate', [['mass', 'Mass of precursor to weigh'], ['dilution', 'Dilution of a stock solution']], 'mass'),
      NC.num('M', 'Molar mass M', 'g/mol', 393.83, { showIf: function (v) { return v.mode === 'mass'; } }),
      NC.num('C', 'Target concentration', 'mM', 1, { showIf: function (v) { return v.mode === 'mass'; } }),
      NC.num('V', 'Solution volume', 'mL', 100, { showIf: function (v) { return v.mode === 'mass'; } }),
      NC.num('purity', 'Reagent purity', '%', 100, { showIf: function (v) { return v.mode === 'mass'; } }),
      NC.num('C1', 'Stock concentration C₁', 'any unit', 10, { showIf: function (v) { return v.mode === 'dilution'; } }),
      NC.num('C2', 'Target concentration C₂', 'same unit', 1, { showIf: function (v) { return v.mode === 'dilution'; } }),
      NC.num('V2', 'Final volume V₂', 'mL', 50, { showIf: function (v) { return v.mode === 'dilution'; } })
    ],
    example: { mode: 'mass', M: 393.83, C: 1, V: 100, purity: 100 },
    compute: function (v) {
      const s = new NC.Steps();
      if (v.mode === 'dilution') {
        const C1 = NC.need(v.C1, 'Stock concentration', { positive: true });
        const C2 = NC.need(v.C2, 'Target concentration', { positive: true });
        const V2 = NC.need(v.V2, 'Final volume', { positive: true });
        if (C2 > C1) NC.fail('The target concentration cannot be higher than the stock concentration.');
        const V1 = (C2 * V2) / C1;
        s.add({ title: 'Conservation of amount of substance', formula: 'C₁V₁ = C₂V₂   ⇒   V₁ = C₂V₂ / C₁', sub: 'V₁ = ' + f(C2) + ' × ' + f(V2) + ' mL / ' + f(C1), result: 'V₁ = ' + f(V1) + ' mL', ref: 'iupacGreen' });
        s.add({ title: 'Diluent to add', formula: 'V_solvent = V₂ − V₁', sub: 'V = ' + f(V2) + ' − ' + f(V1), result: 'V_solvent = ' + f(V2 - V1) + ' mL', note: 'Assumes volumes are additive. For accurate work, make up to the mark in a volumetric flask.' });
        return {
          results: [{ label: 'Stock volume V₁', value: V1, unit: 'mL', main: true }, { label: 'Diluent volume', value: V2 - V1, unit: 'mL', main: true }, { label: 'Dilution factor', value: C1 / C2, unit: '×' }],
          steps: s.items
        };
      }
      const M = NC.need(v.M, 'Molar mass', { positive: true });
      const Cm = NC.need(v.C, 'Concentration', { positive: true });
      const V = NC.need(v.V, 'Volume', { positive: true });
      const p = NC.need(v.purity, 'Purity', { positive: true, max: 100 });
      const n = (Cm / 1000) * (V / 1000);
      s.add({ title: 'Amount of substance needed', formula: 'n = C · V', sub: 'n = ' + f(Cm / 1000) + ' mol/L × ' + f(V / 1000) + ' L', result: 'n = ' + f(n) + ' mol = ' + f(n * 1e3) + ' mmol', ref: 'iupacGreen' });
      const m = n * M * 1000;
      s.add({ title: 'Mass of pure compound', formula: 'm = n · M', sub: 'm = ' + f(n) + ' mol × ' + f(M) + ' g/mol', result: 'm = ' + f(m) + ' mg', ref: 'ciaaw2021' });
      const mw = m / (p / 100);
      s.add({ title: 'Correct for purity', formula: 'm_weigh = m / (purity/100)', sub: 'm_weigh = ' + f(m) + ' mg / ' + f(p / 100), result: 'm_weigh = ' + f(mw) + ' mg' });
      return {
        results: [{ label: 'Mass to weigh', value: mw, unit: 'mg', main: true }, { label: 'Amount', value: n * 1e3, unit: 'mmol' }],
        steps: s.items,
        warnings: mw < 5 ? ['Less than 5 mg is hard to weigh accurately. Consider making a more concentrated stock and diluting it.'] : []
      };
    }
  });

  /* ================================================================== */
  /* Particle number concentration                                        */
  /* ================================================================== */
  NC.register({
    id: 'npconc',
    category: 'lab',
    title: 'Nanoparticle number & molar concentration',
    short: 'Particles/mL, nanomolar particle concentration and surface area dose',
    description: 'Converts a mass concentration of spherical nanoparticles into a number concentration, molar particle concentration and total surface area per mL. It can also give the mass concentration needed for a target particle number.',
    refs: ['codata2018', 'crc'],
    presets: NC.materialPresets(['Au', 'Ag', 'Pt', 'Fe3O4', 'TiO2a', 'ZnO', 'SiO2', 'CeO2'], ['rho']),
    presetNote: 'Bulk densities (CRC Handbook).',
    inputs: [
      NC.num('cm', 'Mass concentration', 'µg/mL', 50),
      NC.num('D', 'Particle diameter D', 'nm', 20),
      NC.num('rho', 'Density ρ', 'g/cm³', 19.32),
      NC.num('target', 'Target number concentration (optional)', 'particles/mL', NaN, { help: 'Leave blank to skip' })
    ],
    example: { cm: 50, D: 20, rho: 19.32, target: 1e11 },
    compute: function (v) {
      const s = new NC.Steps();
      const cm = NC.need(v.cm, 'Mass concentration', { positive: true });
      const D = NC.need(v.D, 'Diameter', { positive: true });
      const rho = NC.need(v.rho, 'Density', { positive: true });
      const target = NC.opt(v.target, 'Target number concentration', { positive: true });
      const V = ((Math.PI * D * D * D) / 6) * 1e-21; // cm^3
      const mp = rho * V;
      s.add({ title: 'Mass of one particle', formula: 'm_p = ρ · πD³/6', sub: 'm_p = ' + f(rho) + ' g/cm³ × ' + f(V) + ' cm³', result: 'm_p = ' + f(mp) + ' g' });
      const N = (cm * 1e-6) / mp;
      s.add({ title: 'Number concentration', formula: 'N = c_m / m_p', sub: 'N = ' + f(cm * 1e-6) + ' g/mL / ' + f(mp) + ' g', result: 'N = ' + f(N) + ' particles/mL' });
      const cM = (N * 1000) / C.NA;
      s.add({ title: 'Molar particle concentration', formula: 'c = N · 1000 / N_A', sub: 'c = ' + f(N) + ' × 1000 / ' + f(C.NA), result: 'c = ' + f(cM) + ' mol/L = ' + f(cM * 1e9) + ' nM', ref: 'codata2018' });
      const SA = N * Math.PI * D * D * 1e-14; // cm^2/mL
      s.add({ title: 'Total particle surface area per mL', formula: 'A = N · πD²', sub: 'A = ' + f(N) + ' × π × ' + f(D) + '² nm² × 10⁻¹⁴ cm²/nm²', result: 'A = ' + f(SA) + ' cm²/mL' });
      const results = [
        { label: 'Number concentration', value: N, unit: 'particles/mL', main: true },
        { label: 'Molar particle conc.', value: cM * 1e9, unit: 'nM', main: true },
        { label: 'Surface area dose', value: SA, unit: 'cm²/mL', main: true },
        { label: 'Particle mass', value: mp, unit: 'g' }
      ];
      if (target !== null) {
        const req = target * mp * 1e6;
        s.add({ title: 'Mass concentration for the target number', formula: 'c_m = N_target · m_p', sub: 'c_m = ' + f(target) + ' × ' + f(mp) + ' g', result: 'c_m = ' + f(req) + ' µg/mL  (dilute ' + f(cm / req) + '× from the current sample)' });
        results.push({ label: 'Mass conc. for target', value: req, unit: 'µg/mL' });
      }
      return { results: results, steps: s.items, notes: ['Assumes dense, spherical, monodisperse particles with bulk density. Polydispersity changes the number concentration strongly, since it scales as 1/D³.'] };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
