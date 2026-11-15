/* Size-dependent properties: quantum confinement, particle geometry, melting point, CNT structure. */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt, C = NC.C;

  /* ================================================================== */
  /* Brus equation                                                       */
  /* ================================================================== */
  NC.register({
    id: 'brus',
    category: 'size',
    title: 'Quantum confinement (Brus equation)',
    short: 'Band gap of a semiconductor nanocrystal from its size, or size from band gap',
    description:
      'Effective-mass estimate of the lowest excited-state energy of a spherical semiconductor nanocrystal. Works in both directions: band gap from diameter, or diameter from a measured absorption energy or wavelength.',
    refs: ['brus1984', 'madelung2004', 'kittel2005', 'codata2018'],
    presets: [
      { label: 'CdSe', values: { Eg: 1.74, me: 0.13, mh: 0.45, er: 10.6 } },
      { label: 'CdS', values: { Eg: 2.42, me: 0.21, mh: 0.8, er: 8.9 } },
      { label: 'CdTe', values: { Eg: 1.5, me: 0.1, mh: 0.4, er: 10.2 } },
      { label: 'PbS', values: { Eg: 0.41, me: 0.085, mh: 0.085, er: 17.2 } },
      { label: 'InP', values: { Eg: 1.34, me: 0.08, mh: 0.6, er: 12.4 } },
      { label: 'ZnO', values: { Eg: 3.37, me: 0.24, mh: 0.59, er: 8.5 } }
    ],
    presetNote:
      'Preset values are typical bulk parameters (see Madelung, Semiconductors: Data Handbook). Published values vary with crystal phase and source, so check them against the literature you are citing.',
    inputs: [
      NC.sel('mode', 'Calculate', [['size', 'Band gap from diameter'], ['energy', 'Diameter from band gap energy'], ['wavelength', 'Diameter from absorption wavelength']], 'size'),
      NC.num('d', 'Particle diameter d', 'nm', 5, { showIf: function (v) { return v.mode === 'size'; } }),
      NC.num('E', 'Nanocrystal band gap E', 'eV', 2.2, { showIf: function (v) { return v.mode === 'energy'; } }),
      NC.num('lam', 'First exciton absorption λ', 'nm', 560, { showIf: function (v) { return v.mode === 'wavelength'; } }),
      NC.num('Eg', 'Bulk band gap Eg', 'eV', 1.74),
      NC.num('me', 'Electron effective mass mₑ*', 'm₀', 0.13),
      NC.num('mh', 'Hole effective mass mₕ*', 'm₀', 0.45),
      NC.num('er', 'Relative permittivity εᵣ', '', 10.6)
    ],
    example: { mode: 'size', d: 5, Eg: 1.74, me: 0.13, mh: 0.45, er: 10.6 },
    compute: function (v) {
      const s = new NC.Steps();
      const Eg = NC.need(v.Eg, 'Bulk band gap', { positive: true });
      const mE = NC.need(v.me, 'Electron effective mass', { positive: true });
      const mH = NC.need(v.mh, 'Hole effective mass', { positive: true });
      const er = NC.need(v.er, 'Relative permittivity', { positive: true });
      const A = ((C.hbar * C.hbar * Math.PI * Math.PI) / (2 * C.me)) * (1 / mE + 1 / mH);
      const B = (1.786 * C.e * C.e) / (4 * Math.PI * C.eps0 * er);
      const Aev = (A / C.e) * 1e18; // eV nm^2
      const Bev = (B / C.e) * 1e9; // eV nm

      s.add({
        title: 'Brus equation (effective-mass approximation)',
        formula: 'E(R) = Eg + ħ²π²/(2R²) · [1/(mₑ*m₀) + 1/(mₕ*m₀)] − 1.786·e²/(4πε₀εᵣR)', tex: "E(R) = E_g + \\dfrac{\\hbar^2\\pi^2}{2R^2}\\left[\\dfrac{1}{m_e^{*}m_0} + \\dfrac{1}{m_h^{*}m_0}\\right] - \\dfrac{1.786\\,e^2}{4\\pi\\varepsilon_0\\varepsilon_r R}",
        note: 'Terms: the bulk gap, the kinetic (confinement) energy of the electron and hole, and the screened electron–hole Coulomb attraction. The smaller polarization term (≈ −0.248 E*Ry) is left out, as is usual.',
        ref: 'brus1984'
      });
      s.add({
        title: 'Confinement prefactor A (so that the confinement term = A/R²)',
        formula: 'A = ħ²π²/(2m₀) · (1/mₑ* + 1/mₕ*)', tex: "A = \\dfrac{\\hbar^2\\pi^2}{2m_0}\\left(\\dfrac{1}{m_e^{*}} + \\dfrac{1}{m_h^{*}}\\right)",
        sub: 'A = (' + f(C.hbar) + ' J·s)² · π² / (2 × ' + f(C.me) + ' kg) × (1/' + mE + ' + 1/' + mH + ')',
        result: 'A = ' + f(A) + ' J·m² = ' + f(Aev) + ' eV·nm²',
        ref: 'codata2018'
      });
      s.add({
        title: 'Coulomb prefactor B (so that the Coulomb term = B/R)',
        formula: 'B = 1.786·e² / (4πε₀εᵣ)', tex: "B = \\dfrac{1.786\\,e^2}{4\\pi\\varepsilon_0\\varepsilon_r}",
        sub: 'B = 1.786 × (' + f(C.e) + ' C)² / (4π × ' + f(C.eps0) + ' F·m⁻¹ × ' + er + ')',
        result: 'B = ' + f(B) + ' J·m = ' + f(Bev) + ' eV·nm',
        ref: 'codata2018'
      });

      let R, E;
      if (v.mode === 'size') {
        const d = NC.need(v.d, 'Diameter', { positive: true });
        R = d / 2;
        s.add({ title: 'Radius', formula: 'R = d / 2', sub: 'R = ' + f(d) + ' nm / 2', result: 'R = ' + f(R) + ' nm' });
        const Ec = Aev / (R * R), Eq = Bev / R;
        E = Eg + Ec - Eq;
        s.add({
          title: 'Evaluate E(R)',
          formula: 'E = Eg + A/R² − B/R', tex: "E = E_g + \\dfrac{A}{R^2} - \\dfrac{B}{R}",
          sub: 'E = ' + f(Eg) + ' + ' + f(Aev) + '/' + f(R) + '² − ' + f(Bev) + '/' + f(R) + ' = ' + f(Eg) + ' + ' + f(Ec) + ' − ' + f(Eq),
          result: 'E = ' + f(E) + ' eV'
        });
      } else {
        if (v.mode === 'wavelength') {
          const lam = NC.need(v.lam, 'Wavelength', { positive: true });
          E = NC.HC_EV_NM / lam;
          s.add({ title: 'Photon energy', formula: 'E = hc / λ', tex: "E = \\dfrac{hc}{\\lambda}", sub: 'E = ' + f(NC.HC_EV_NM, 7) + ' eV·nm / ' + f(lam) + ' nm', result: 'E = ' + f(E) + ' eV', ref: 'codata2018' });
        } else {
          E = NC.need(v.E, 'Band gap energy', { positive: true });
        }
        const dE = E - Eg;
        if (dE <= 0) NC.fail('The nanocrystal energy (' + f(E) + ' eV) must be larger than the bulk band gap (' + f(Eg) + ' eV) for a confinement solution.');
        R = (-Bev + Math.sqrt(Bev * Bev + 4 * dE * Aev)) / (2 * dE);
        s.add({
          title: 'Solve the Brus equation for R (positive root of a quadratic)',
          formula: '(E − Eg)·R² + B·R − A = 0  ⇒  R = [−B + √(B² + 4(E − Eg)A)] / [2(E − Eg)]', tex: "(E-E_g)R^2 + BR - A = 0 \\;\\Rightarrow\\; R = \\dfrac{-B + \\sqrt{B^2 + 4(E-E_g)A}}{2(E-E_g)}",
          sub: 'R = [−' + f(Bev) + ' + √(' + f(Bev) + '² + 4 × ' + f(dE) + ' × ' + f(Aev) + ')] / (2 × ' + f(dE) + ')',
          result: 'R = ' + f(R) + ' nm  ⇒  d = ' + f(2 * R) + ' nm'
        });
      }
      const lamOut = NC.HC_EV_NM / E;
      if (v.mode !== 'wavelength')
        s.add({ title: 'Corresponding wavelength', formula: 'λ = hc / E', tex: "\\lambda = \\dfrac{hc}{E}", sub: 'λ = ' + f(NC.HC_EV_NM, 7) + ' eV·nm / ' + f(E) + ' eV', result: 'λ = ' + f(lamOut) + ' nm', ref: 'codata2018' });

      const mu = (mE * mH) / (mE + mH);
      const aB = (er * C.a0 * 1e9) / mu;
      s.add({
        title: 'Exciton Bohr radius (to judge the confinement regime)',
        formula: 'a_B = εᵣ · (m₀/μ) · a₀,   μ = mₑ*·mₕ*/(mₑ* + mₕ*)', tex: "a_B = \\varepsilon_r\\,\\dfrac{m_0}{\\mu}\\,a_0,\\quad \\mu = \\dfrac{m_e^{*}m_h^{*}}{m_e^{*}+m_h^{*}}",
        sub: 'μ = ' + f(mE) + ' × ' + f(mH) + ' / (' + f(mE) + ' + ' + f(mH) + ') = ' + f(mu) + ' m₀;   a_B = ' + er + ' × ' + f(C.a0 * 1e9, 6) + ' nm / ' + f(mu),
        result: 'a_B = ' + f(aB) + ' nm;   R/a_B = ' + f(R / aB, 3),
        ref: 'kittel2005'
      });

      const regime = R < aB ? 'Strong confinement (R < a_B)' : 'Weak/intermediate confinement (R ≥ a_B)';
      const warnings = [];
      if (R < 1.5) warnings.push('At radii below ~1.5 nm the effective-mass approximation usually overestimates the band gap. Treat this as a rough estimate.');
      if (R > 3 * aB) warnings.push('The particle is much larger than the exciton Bohr radius, so confinement effects are small.');

      const curve = [];
      const dmax = Math.max(12, 2.6 * R * 2);
      for (let d = 1.5; d <= dmax; d += dmax / 200) {
        const r = d / 2;
        curve.push([d, Eg + Aev / (r * r) - Bev / r]);
      }
      return {
        results: [
          { label: 'Band gap E', value: E, unit: 'eV', main: true },
          { label: 'Wavelength λ', value: lamOut, unit: 'nm', main: true },
          { label: 'Diameter d', value: 2 * R, unit: 'nm', main: true },
          { label: 'Exciton Bohr radius a_B', value: aB, unit: 'nm' },
          { label: 'Regime', value: regime }
        ],
        steps: s.items,
        warnings: warnings,
        plots: [{
          title: 'Brus band gap versus diameter',
          xlabel: 'Diameter d (nm)', ylabel: 'Band gap E (eV)',
          series: [
            { name: 'Brus model', mode: 'line', points: curve },
            { name: 'This calculation', mode: 'markers', points: [[2 * R, E]], color: 1, size: 5 }
          ],
          ymin: Math.max(0, Eg - 0.2), ymax: Math.max(E, Eg) + 1.0
        }],
        notes: [
          'The Brus model usually overestimates confinement energies for small nanocrystals. For CdSe, CdTe and CdS, the empirical sizing curves of Yu et al. (2003), in the UV-vis section, are generally more reliable.'
        ]
      };
    }
  });

  /* ================================================================== */
  /* Particle geometry / surface atoms / SSA                              */
  /* ================================================================== */
  NC.register({
    id: 'particle',
    category: 'size',
    title: 'Particle geometry, atom count & surface area',
    short: 'Atoms per particle, surface-atom fraction, specific surface area',
    description:
      'For a dense spherical particle, works out the volume, mass, number of atoms (or formula units), the fraction of atoms at the surface, and the geometric specific surface area. It can also work backwards from a BET surface area to the equivalent spherical diameter.',
    refs: ['roduner2006', 'lowell2004', 'kittel2005', 'crc', 'codata2018'],
    presets: NC.materialPresets(['Au', 'Ag', 'Pt', 'Pd', 'Cu', 'Fe3O4', 'TiO2a', 'TiO2r', 'ZnO', 'SiO2', 'CeO2', 'CdSe'], ['rho', 'M']),
    presetNote: 'Bulk densities and molar masses (CRC Handbook). For oxides and other compounds, “atoms” means formula units.',
    inputs: [
      NC.sel('mode', 'Calculate from', [['D', 'Particle diameter'], ['ssa', 'Measured specific surface area (BET)']], 'D'),
      NC.num('D', 'Particle diameter D', 'nm', 5, { showIf: function (v) { return v.mode === 'D'; } }),
      NC.num('ssa', 'Specific surface area', 'm²/g', 60, { showIf: function (v) { return v.mode === 'ssa'; } }),
      NC.num('rho', 'Density ρ', 'g/cm³', 19.32),
      NC.num('M', 'Molar mass M (per atom / formula unit)', 'g/mol', 196.967)
    ],
    example: { mode: 'D', D: 5, rho: 19.32, M: 196.967 },
    compute: function (v) {
      const s = new NC.Steps();
      const rho = NC.need(v.rho, 'Density', { positive: true });
      const M = NC.need(v.M, 'Molar mass', { positive: true });
      let D;
      if (v.mode === 'ssa') {
        const ssa = NC.need(v.ssa, 'Specific surface area', { positive: true });
        D = 6000 / (rho * ssa);
        s.add({
          title: 'Equivalent spherical diameter from surface area',
          formula: 'D = 6 / (ρ · S)   ⇒   D[nm] = 6000 / (ρ[g/cm³] · S[m²/g])', tex: "D = \\dfrac{6}{\\rho S} \\;\\Rightarrow\\; D\\,[\\text{nm}] = \\dfrac{6000}{\\rho\\,[\\text{g/cm}^3]\\;S\\,[\\text{m}^2/\\text{g}]}",
          sub: 'D = 6000 / (' + f(rho) + ' × ' + f(ssa) + ')',
          result: 'D = ' + f(D) + ' nm',
          note: 'Assumes dense, non-porous, monodisperse spheres with fully accessible surfaces.',
          ref: 'lowell2004'
        });
      } else {
        D = NC.need(v.D, 'Diameter', { positive: true });
      }
      const V = (Math.PI * D * D * D) / 6; // nm^3
      const A = Math.PI * D * D; // nm^2
      s.add({ title: 'Particle volume and surface area', formula: 'V = πD³/6,   A = πD²', sub: 'V = π × ' + f(D) + '³ / 6;   A = π × ' + f(D) + '²', result: 'V = ' + f(V) + ' nm³;   A = ' + f(A) + ' nm²' });
      const mp = rho * V * 1e-21; // g
      s.add({ title: 'Mass of one particle', formula: 'm = ρ·V   (1 nm³ = 10⁻²¹ cm³)', sub: 'm = ' + f(rho) + ' g/cm³ × ' + f(V) + ' × 10⁻²¹ cm³', result: 'm = ' + f(mp) + ' g' });
      const N = (mp * C.NA) / M;
      s.add({ title: 'Atoms (formula units) per particle', formula: 'N = m·N_A / M', tex: "N = \\dfrac{m\\,N_A}{M}", sub: 'N = ' + f(mp) + ' g × ' + f(C.NA) + ' mol⁻¹ / ' + f(M) + ' g/mol', result: 'N = ' + f(N), ref: 'codata2018' });
      const ssa = 6000 / (rho * D);
      if (v.mode !== 'ssa')
        s.add({ title: 'Specific surface area (geometric)', formula: 'S = A/m = 6/(ρD)   ⇒   S[m²/g] = 6000/(ρ[g/cm³]·D[nm])', tex: "S = \\dfrac{A}{m} = \\dfrac{6}{\\rho D} \\;\\Rightarrow\\; S\\,[\\text{m}^2/\\text{g}] = \\dfrac{6000}{\\rho\\,[\\text{g/cm}^3]\\;D\\,[\\text{nm}]}", sub: 'S = 6000 / (' + f(rho) + ' × ' + f(D) + ')', result: 'S = ' + f(ssa) + ' m²/g', ref: 'lowell2004' });
      const rws = Math.cbrt((3 * M) / (4 * Math.PI * rho * C.NA)) * 1e7; // nm
      const dat = 2 * rws;
      s.add({
        title: 'Effective atomic diameter (Wigner–Seitz sphere)',
        formula: 'r_ws = [3M / (4πρN_A)]^(1/3),   d_at = 2r_ws', tex: "r_{ws} = \\left(\\dfrac{3M}{4\\pi\\rho N_A}\\right)^{1/3},\\quad d_{at} = 2r_{ws}",
        sub: 'r_ws = [3 × ' + f(M) + ' / (4π × ' + f(rho) + ' × ' + f(C.NA) + ')]^(1/3) cm',
        result: 'r_ws = ' + f(rws) + ' nm;   d_at = ' + f(dat) + ' nm',
        ref: 'kittel2005'
      });
      const Fs = D > 2 * dat ? 1 - Math.pow((D - 2 * dat) / D, 3) : 1;
      s.add({
        title: 'Fraction of atoms in the outermost shell (geometric shell model)',
        formula: 'F = 1 − [(D − 2d_at)/D]³', tex: "F = 1 - \\left(\\dfrac{D - 2d_{at}}{D}\\right)^3",
        sub: 'F = 1 − [(' + f(D) + ' − 2 × ' + f(dat) + ') / ' + f(D) + ']³',
        result: 'F = ' + f(Fs, 3) + '  (' + NC.fix(Fs * 100, 1) + ' %)  ⇒  N_surface ≈ ' + f(Fs * N),
        note: 'A one-atom-thick shell is treated as “surface”. This is a geometric estimate; the exact value depends on crystal structure and particle shape.',
        ref: 'roduner2006'
      });
      const perGram = 1 / mp;
      s.add({ title: 'Particles per gram and molar mass of a particle', formula: 'n = 1/m;   M_p = m·N_A', sub: 'n = 1 / ' + f(mp) + ' g;   M_p = ' + f(mp) + ' × ' + f(C.NA), result: 'n = ' + f(perGram) + ' g⁻¹;   M_p = ' + f(mp * C.NA) + ' g/mol' });

      const curve = [];
      for (let d = Math.max(2.2 * dat, 0.8); d <= Math.max(50, D * 1.5); d *= 1.03) curve.push([d, 100 * (1 - Math.pow((d - 2 * dat) / d, 3))]);
      return {
        results: [
          { label: 'Diameter D', value: D, unit: 'nm', main: v.mode === 'ssa' },
          { label: 'Atoms per particle N', value: N, unit: '', main: true },
          { label: 'Surface-atom fraction', value: Fs * 100, unit: '%', main: true },
          { label: 'Specific surface area', value: ssa, unit: 'm²/g', main: v.mode !== 'ssa' },
          { label: 'Particle mass', value: mp, unit: 'g' },
          { label: 'Particles per gram', value: perGram, unit: 'g⁻¹' },
          { label: 'Molar mass of one particle', value: mp * C.NA, unit: 'g/mol' }
        ],
        steps: s.items,
        plots: [{
          title: 'Surface-atom fraction versus size', xlabel: 'Diameter D (nm)', ylabel: 'Atoms in surface shell (%)',
          series: [{ name: 'Shell model', mode: 'line', points: curve }, { name: 'This particle', mode: 'markers', points: [[D, Fs * 100]], color: 1, size: 5 }],
          ymin: 0, ymax: 100
        }]
      };
    }
  });

  /* ================================================================== */
  /* Melting point depression                                            */
  /* ================================================================== */
  NC.register({
    id: 'melting',
    category: 'size',
    title: 'Melting point depression (Gibbs–Thomson)',
    short: 'Size-dependent melting temperature of a nanoparticle',
    description:
      'Estimates the melting temperature of a spherical nanoparticle with the Gibbs–Thomson relation for a solid sphere in its own melt. The temperature drop scales as 1/D.',
    refs: ['pawlow1909', 'buffat1976', 'roduner2006', 'crc'],
    presets: NC.materialPresets(['Au', 'Ag', 'Cu', 'Pt', 'Pd'], ['Tm', 'dHf', 'M', 'rho']),
    presetNote: 'Bulk melting points, enthalpies of fusion and densities come from the CRC Handbook. The solid–liquid interfacial energy σ_sl is not set by the presets, so enter a literature value for your system.',
    inputs: [
      NC.num('D', 'Particle diameter D', 'nm', 5),
      NC.num('Tm', 'Bulk melting point T_m', 'K', 1337.33),
      NC.num('dHf', 'Molar enthalpy of fusion ΔH_f', 'kJ/mol', 12.55),
      NC.num('M', 'Molar mass M', 'g/mol', 196.967),
      NC.num('rho', 'Solid density ρ_s', 'g/cm³', 19.32),
      NC.num('sig', 'Solid–liquid interfacial energy σ_sl', 'J/m²', 0.27, { help: 'Material-specific and uncertain. 0.27 J/m² is an often-quoted estimate for gold; replace it with a value from the literature for your material.' })
    ],
    example: { D: 5, Tm: 1337.33, dHf: 12.55, M: 196.967, rho: 19.32, sig: 0.27 },
    compute: function (v) {
      const s = new NC.Steps();
      const D = NC.need(v.D, 'Diameter', { positive: true });
      const Tm = NC.need(v.Tm, 'Bulk melting point', { positive: true });
      const dH = NC.need(v.dHf, 'Enthalpy of fusion', { positive: true });
      const M = NC.need(v.M, 'Molar mass', { positive: true });
      const rho = NC.need(v.rho, 'Density', { positive: true });
      const sig = NC.need(v.sig, 'Interfacial energy', { nonneg: true });
      const L = (dH * 1e6) / M; // J/kg
      s.add({ title: 'Specific (mass) latent heat of fusion', formula: 'L = ΔH_f / M', tex: "L = \\dfrac{\\Delta H_f}{M}", sub: 'L = ' + f(dH) + ' × 10³ J/mol / (' + f(M) + ' × 10⁻³ kg/mol)', result: 'L = ' + f(L) + ' J/kg' });
      const rhoSI = rho * 1000;
      const factor = (4 * sig) / (L * rhoSI * D * 1e-9);
      s.add({
        title: 'Gibbs–Thomson relation for a sphere of diameter D',
        formula: 'T_m(D) = T_m,bulk · [1 − 4σ_sl / (L·ρ_s·D)]', tex: "T_m(D) = T_{m,\\text{bulk}}\\left[1 - \\dfrac{4\\sigma_{sl}}{L\\,\\rho_s\\,D}\\right]",
        sub: '4σ_sl/(Lρ_sD) = 4 × ' + f(sig) + ' / (' + f(L) + ' × ' + f(rhoSI) + ' × ' + f(D) + '×10⁻⁹) = ' + f(factor),
        result: 'T_m(D) = ' + f(Tm) + ' × (1 − ' + f(factor) + ') = ' + f(Tm * (1 - factor)) + ' K',
        note: 'Equivalent to the classic Pawlow / Gibbs–Thomson treatment; Buffat & Borel tested such models against gold particles.',
        ref: ['pawlow1909', 'buffat1976']
      });
      if (factor >= 1) NC.fail('With these parameters the model predicts no solid phase at this size. The continuum model is not valid here.');
      const T = Tm * (1 - factor);
      const curve = [];
      const dmin = Math.max((4 * sig) / (L * rhoSI * 1e-9) * 1.2, 1);
      for (let d = dmin; d <= Math.max(50, 2 * D); d *= 1.03) curve.push([d, Tm * (1 - (4 * sig) / (L * rhoSI * d * 1e-9))]);
      return {
        results: [
          { label: 'Melting point T_m(D)', value: T, unit: 'K', main: true },
          { label: 'In °C', value: T - 273.15, unit: '°C', main: true },
          { label: 'Depression ΔT', value: Tm - T, unit: 'K' },
          { label: 'Relative depression', value: factor * 100, unit: '%' }
        ],
        steps: s.items,
        warnings: D < 2 ? ['Below ~2 nm, continuum thermodynamics becomes unreliable and atomistic effects dominate.'] : [],
        plots: [{
          title: 'Melting point versus size', xlabel: 'Diameter D (nm)', ylabel: 'T_m (K)',
          series: [{ name: 'Gibbs–Thomson', mode: 'line', points: curve }, { name: 'This particle', mode: 'markers', points: [[D, T]], color: 1, size: 5 }, { name: 'Bulk T_m', mode: 'line', dashed: true, color: 2, points: [[curve[0][0], Tm], [curve[curve.length - 1][0], Tm]] }]
        }],
        notes: ['The result depends strongly on σ_sl, which is poorly known for most materials. Report the value you used.']
      };
    }
  });

  /* ================================================================== */
  /* Carbon nanotube structure                                           */
  /* ================================================================== */
  function cntDiameter(n, m, acc) {
    return (acc * Math.sqrt(3) * Math.sqrt(n * n + n * m + m * m)) / Math.PI;
  }
  NC.register({
    id: 'cnt',
    category: 'size',
    title: 'Carbon nanotube structure (n, m)',
    short: 'Diameter, chiral angle and metallicity of a SWCNT, or (n, m) from its RBM',
    description:
      'From the chiral indices (n, m), gives the diameter, chiral angle, type and expected electronic character of a single-walled carbon nanotube, plus its predicted radial breathing mode (RBM). It can also go the other way: from a measured RBM frequency it finds the diameter and lists candidate (n, m) indices.',
    refs: ['saito1998', 'jorio2001'],
    inputs: [
      NC.sel('mode', 'Calculate', [['nm', 'Structure from (n, m)'], ['rbm', 'Diameter and (n, m) candidates from RBM']], 'nm'),
      NC.num('n', 'Chiral index n', '', 10, { showIf: function (v) { return v.mode === 'nm'; } }),
      NC.num('m', 'Chiral index m', '', 10, { showIf: function (v) { return v.mode === 'nm'; } }),
      NC.num('rbm', 'RBM frequency ω_RBM', 'cm⁻¹', 180, { showIf: function (v) { return v.mode === 'rbm'; } }),
      NC.num('A', 'RBM constant A (ω = A/d + B)', 'cm⁻¹·nm', 248),
      NC.num('B', 'RBM constant B', 'cm⁻¹', 0),
      NC.num('acc', 'C–C bond length a_C–C', 'nm', 0.142)
    ],
    presetNote: 'A = 248 cm⁻¹·nm, B = 0 are the values Jorio et al. (2001) found for isolated SWCNTs on Si/SiO₂. Bundled or solution-dispersed tubes need different constants (B > 0).',
    example: { mode: 'nm', n: 10, m: 10, A: 248, B: 0, acc: 0.142 },
    compute: function (v) {
      const s = new NC.Steps();
      const acc = NC.need(v.acc, 'C–C bond length', { positive: true });
      const a = acc * Math.sqrt(3);
      const A = NC.need(v.A, 'RBM constant A', { positive: true });
      const B = NC.need(v.B, 'RBM constant B');
      s.add({ title: 'Graphene lattice constant', formula: 'a = √3 · a_C–C', sub: 'a = √3 × ' + f(acc) + ' nm', result: 'a = ' + f(a) + ' nm', ref: 'saito1998' });

      if (v.mode === 'rbm') {
        const w = NC.need(v.rbm, 'RBM frequency', { positive: true });
        if (w <= B) NC.fail('The RBM frequency must be larger than the constant B.');
        const d = A / (w - B);
        s.add({ title: 'Diameter from the radial breathing mode', formula: 'ω_RBM = A/d + B   ⇒   d = A / (ω_RBM − B)', tex: "\\omega_{\\text{RBM}} = \\dfrac{A}{d} + B \\;\\Rightarrow\\; d = \\dfrac{A}{\\omega_{\\text{RBM}} - B}", sub: 'd = ' + f(A) + ' / (' + f(w) + ' − ' + f(B) + ')', result: 'd = ' + f(d) + ' nm', ref: 'jorio2001' });
        const cands = [];
        for (let n = 3; n <= 45; n++) for (let m = 0; m <= n; m++) cands.push({ n: n, m: m, d: cntDiameter(n, m, acc) });
        cands.sort(function (p, q) { return Math.abs(p.d - d) - Math.abs(q.d - d); });
        const top = cands.slice(0, 10);
        s.add({ title: 'Candidate (n, m) assignments', formula: 'd(n, m) = a·√(n² + nm + m²) / π', result: 'The ten (n, m) whose diameters are closest to ' + f(d) + ' nm are listed in the table.', note: 'An unambiguous assignment needs resonance information, e.g. a Kataura plot with the excitation energy. The diameter alone is not enough.', ref: 'saito1998' });
        return {
          results: [{ label: 'Diameter d', value: d, unit: 'nm', main: true }, { label: 'Closest (n, m)', value: '(' + top[0].n + ', ' + top[0].m + ')', main: true }],
          steps: s.items,
          tables: [{
            title: 'Closest (n, m) candidates',
            columns: ['(n, m)', 'd (nm)', 'Δd (nm)', 'Chiral angle (°)', 'Type'],
            rows: top.map(function (c) {
              const th = NC.deg(Math.atan((Math.sqrt(3) * c.m) / (2 * c.n + c.m)));
              return ['(' + c.n + ', ' + c.m + ')', f(c.d), f(c.d - d, 2), NC.fix(th, 1), (c.n - c.m) % 3 === 0 ? 'metallic' : 'semiconducting'];
            })
          }]
        };
      }

      const n = NC.need(v.n, 'Index n', { int: true, gt: 0 });
      const m = NC.need(v.m, 'Index m', { int: true, nonneg: true });
      if (m > n) NC.fail('By convention n ≥ m ≥ 0. Swap the indices.');
      const d = cntDiameter(n, m, acc);
      s.add({ title: 'Tube diameter', formula: 'd = a·√(n² + nm + m²) / π', tex: "d = \\dfrac{a\\sqrt{n^2 + nm + m^2}}{\\pi}", sub: 'd = ' + f(a) + ' × √(' + n + '² + ' + n + '·' + m + ' + ' + m + '²) / π = ' + f(a) + ' × ' + f(Math.sqrt(n * n + n * m + m * m)) + ' / π', result: 'd = ' + f(d) + ' nm', ref: 'saito1998' });
      const th = NC.deg(Math.atan((Math.sqrt(3) * m) / (2 * n + m)));
      s.add({ title: 'Chiral angle', formula: 'θ = arctan[√3·m / (2n + m)]', tex: "\\theta = \\arctan\\dfrac{\\sqrt{3}\\,m}{2n + m}", sub: 'θ = arctan[√3 × ' + m + ' / (2 × ' + n + ' + ' + m + ')]', result: 'θ = ' + NC.fix(th, 2) + '°  (0° zigzag … 30° armchair)', ref: 'saito1998' });
      const type = m === 0 ? 'Zigzag' : n === m ? 'Armchair' : 'Chiral';
      const metallic = (n - m) % 3 === 0;
      const elec = n === m ? 'Metallic' : metallic ? 'Metallic (small curvature-induced gap)' : 'Semiconducting';
      s.add({ title: 'Electronic character (zone-folding rule)', formula: '(n − m) mod 3 = 0 ⇒ metallic; otherwise semiconducting', sub: '(' + n + ' − ' + m + ') mod 3 = ' + ((n - m) % 3), result: type + ', ' + elec.toLowerCase(), ref: 'saito1998' });
      const w = A / d + B;
      s.add({ title: 'Expected radial breathing mode', formula: 'ω_RBM = A/d + B', tex: "\\omega_{\\text{RBM}} = \\dfrac{A}{d} + B", sub: 'ω = ' + f(A) + ' / ' + f(d) + ' + ' + f(B), result: 'ω_RBM = ' + f(w) + ' cm⁻¹', ref: 'jorio2001' });
      return {
        results: [
          { label: 'Diameter d', value: d, unit: 'nm', main: true },
          { label: 'Chiral angle θ', value: th, unit: '°', main: true },
          { label: 'Type', value: type, main: true },
          { label: 'Electronic character', value: elec },
          { label: 'Predicted ω_RBM', value: w, unit: 'cm⁻¹' }
        ],
        steps: s.items
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
