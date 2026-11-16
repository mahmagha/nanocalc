/*
 * Elemental, magnetic and electrochemical analysis (PLAN.md workstream F):
 * ICP-MS/OES → particle number, single-particle ICP-MS, EDX (Cliff–Lorimer),
 * magnetism (moment, dead layer, blocking temperature), Pt ECSA / dispersion / TOF.
 */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt, C = NC.C;
  const PI = Math.PI;
  const MU_B = 9.2740100783e-24; // Bohr magneton, J/T (CODATA 2018)
  const FARADAY = C.e * C.NA; // C/mol (exact)

  NC.addRefs({
    pace2011: { doi: '10.1021/ac201952t', type: 'article', authors: 'Pace, H. E.; Rogers, N. J.; Jarolimek, C.; Coleman, V. A.; Higgins, C. P.; Ranville, J. F.', title: 'Determining transport efficiency for the purpose of counting and sizing nanoparticles via single particle inductively coupled plasma mass spectrometry', journal: 'Anal. Chem.', year: 2011, volume: '83', pages: '9361–9369' },
    laborda2014: { doi: '10.1021/ac402980q', type: 'article', authors: 'Laborda, F.; Bolea, E.; Jiménez-Lamana, J.', title: 'Single particle inductively coupled plasma mass spectrometry: a powerful tool for nanoanalysis', journal: 'Anal. Chem.', year: 2014, volume: '86', pages: '2270–2278' },
    cliff1975: { doi: '10.1111/j.1365-2818.1975.tb03895.x', type: 'article', authors: 'Cliff, G.; Lorimer, G. W.', title: 'The quantitative analysis of thin specimens', journal: 'J. Microsc.', year: 1975, volume: '103', pages: '203–207' },
    bean1959: { doi: '10.1063/1.2185850', type: 'article', authors: 'Bean, C. P.; Livingston, J. D.', title: 'Superparamagnetism', journal: 'J. Appl. Phys.', year: 1959, volume: '30', pages: 'S120–S129' },
    neel1949: { type: 'article', authors: 'Néel, L.', title: 'Théorie du traînage magnétique des ferromagnétiques en grains fins avec applications aux terres cuites', journal: 'Ann. Géophys.', year: 1949, volume: '5', pages: '99–136' },
    cullity2009: { doi: '10.1002/9780470386323', type: 'book', authors: 'Cullity, B. D.; Graham, C. D.', title: 'Introduction to Magnetic Materials', edition: '2nd ed.', publisher: 'Wiley-IEEE Press', place: 'Hoboken, NJ', year: 2009 },
    trasatti1991: { doi: '10.1351/pac199163050711', type: 'article', authors: 'Trasatti, S.; Petrii, O. A.', title: 'Real surface area measurements in electrochemistry', journal: 'Pure Appl. Chem.', year: 1991, volume: '63', pages: '711–734' },
    boudart1995: { doi: '10.1021/cr00035a009', type: 'article', authors: 'Boudart, M.', title: 'Turnover rates in heterogeneous catalysis', journal: 'Chem. Rev.', year: 1995, volume: '95', pages: '661–666' }
  });

  /* ---------- shared helpers ---------- */
  const SHAPES = NC.shapes || {
    sphere: { label: 'Sphere', dims: ['D'], V: function (d) { return (PI * Math.pow(d.D, 3)) / 6; } }
  };
  const shapeOptions = Object.keys(SHAPES).map(function (k) { return [k, SHAPES[k].label]; });
  const matOptions = Object.keys(NC.materials).map(function (k) {
    const m = NC.materials[k];
    return [k, m.label, NC.materialGroups ? NC.materialGroups[m.group] : undefined];
  }).concat([['custom', 'Custom material…', NC.materialGroups ? 'Other' : undefined]]);
  const dimNames = { D: 'Diameter D', a: 'Edge length a', L: 'Total length L', h: 'Plate thickness h' };
  function shapeInputs(prefix, showBase) {
    const sb = showBase || function () { return true; };
    return ['D', 'a', 'L', 'h'].map(function (k) {
      const def = { D: 20, a: 20, L: 60, h: 8 }[k];
      return NC.num(prefix + k, dimNames[k], 'nm', def, {
        showIf: function (v) { const s = SHAPES[v[prefix + 'shape']]; return sb(v) && !!s && s.dims.indexOf(k) >= 0; }
      });
    });
  }
  /** Particle volume (nm³) from the chosen shape and recorded steps. */
  function particleVolume(s, v, prefix) {
    const key = v[prefix + 'shape'] || 'sphere';
    const shape = SHAPES[key];
    if (!shape) NC.fail('Choose a particle shape.');
    const d = {};
    shape.dims.forEach(function (k) { d[k] = NC.need(v[prefix + k], dimNames[k], { positive: true }); });
    if (key === 'rod' && d.L < d.D) NC.fail('For a rod the total length L must be at least the diameter D.');
    const V = shape.V(d);
    s.add({
      title: 'Particle volume (' + shape.label.toLowerCase() + ')',
      formula: shape.Vf || 'V = πD³/6',
      tex: shape.Vt ? 'V = ' + shape.Vt : undefined,
      sub: shape.sub ? shape.sub(d)[0] : 'V = π × ' + f(d.D) + '³ / 6',
      result: 'V = ' + f(V) + ' nm³'
    });
    return { V: V, d: d, shape: shape, key: key };
  }
  function material(key, rho, label) {
    if (key === 'custom') return { rho: NC.need(rho, label + ' density', { positive: true }), label: 'custom material', custom: true };
    const m = NC.materials[key];
    if (!m) NC.fail('Choose a material.');
    return { rho: m.rho, M: m.M, label: m.label };
  }

  /* Abridged standard atomic weights (IUPAC/CIAAW 2021, conventional values) for EDX atomic %. */
  const ATW = {
    H: 1.008, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Na: 22.99, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974,
    S: 32.06, Cl: 35.45, K: 39.098, Ca: 40.078, Ti: 47.867, V: 50.942, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933,
    Ni: 58.693, Cu: 63.546, Zn: 65.38, Ga: 69.723, Ge: 72.63, As: 74.922, Se: 78.971, Br: 79.904, Y: 88.906, Zr: 91.224,
    Nb: 92.906, Mo: 95.95, Ru: 101.07, Rh: 102.91, Pd: 106.42, Ag: 107.87, Cd: 112.41, In: 114.82, Sn: 118.71, Sb: 121.76,
    Te: 127.6, I: 126.9, Cs: 132.91, Ba: 137.33, La: 138.91, Ce: 140.12, Nd: 144.24, Gd: 157.25, W: 183.84, Ir: 192.22,
    Pt: 195.08, Au: 196.97, Hg: 200.59, Pb: 207.2, Bi: 208.98
  };

  /* ================================================================== */
  /* 1 · ICP-MS / OES element concentration → particle number           */
  /* ================================================================== */
  NC.register({
    id: 'icp2n',
    category: 'analysis',
    title: 'ICP-MS/OES → particle number concentration',
    short: 'Element mass concentration to particles per mL, for any particle shape',
    description:
      'Converts the element concentration measured by ICP-MS or ICP-OES (after full digestion) into a particle number concentration. It uses the particle material, shape and size, and the element’s mass fraction in the compound.',
    refs: ['laborda2014', 'crc', 'ciaaw2021', 'codata2018'],
    inputs: [
      NC.num('c', 'Measured element concentration', '', 10),
      NC.sel('cunit', 'Concentration unit', [['ugL', 'µg/L (ppb)'], ['mgL', 'mg/L (ppm)']], 'ugL'),
      NC.num('dil', 'Dilution factor (sample → measured solution)', '×', 1, { help: 'For example 10 if the dispersion was diluted 10-fold before measurement.' }),
      NC.sel('mat', 'Particle material', matOptions, 'Au'),
      NC.num('rho', 'Density ρ', 'g/cm³', 19.32, { showIf: function (v) { return v.mat === 'custom'; } }),
      NC.sel('wmode', 'Element mass fraction w', [['pure', 'Pure element (w = 1)'], ['formula', 'From formula (n atoms of the element per formula unit)'], ['direct', 'Enter w directly']], 'pure'),
      NC.num('nel', 'Atoms of the element per formula unit n', '', 1, { showIf: function (v) { return v.wmode === 'formula'; } }),
      NC.num('Mel', 'Atomic weight of the element', 'g/mol', 196.97, { showIf: function (v) { return v.wmode === 'formula'; } }),
      NC.num('Mc', 'Molar mass of the compound (custom material only)', 'g/mol', NaN, { showIf: function (v) { return v.wmode === 'formula' && v.mat === 'custom'; } }),
      NC.num('w', 'Element mass fraction w', '', 1, { showIf: function (v) { return v.wmode === 'direct'; } }),
      NC.sel('pshape', 'Particle shape', shapeOptions, 'sphere')
    ].concat(shapeInputs('p')),
    example: { c: 10, cunit: 'ugL', dil: 1, mat: 'Au', wmode: 'pure', pshape: 'sphere', pD: 20 },
    presetNote: 'Assumes the element comes only from the particles (no dissolved ions) and the digestion is complete. Measure the dissolved fraction separately (e.g. by ultrafiltration) and subtract it.',
    compute: function (v) {
      const s = new NC.Steps();
      const c = NC.need(v.c, 'Element concentration', { positive: true });
      const dil = NC.need(v.dil, 'Dilution factor', { positive: true });
      const m = material(v.mat, v.rho, 'Material');
      const cgml = c * (v.cunit === 'mgL' ? 1e-6 : 1e-9) * dil; // g/mL in the original sample
      s.add({
        title: 'Element mass concentration in the original dispersion',
        formula: 'c_el = c_measured × dilution   (1 µg/L = 10⁻⁹ g/mL; 1 mg/L = 10⁻⁶ g/mL)',
        sub: 'c_el = ' + f(c) + ' ' + (v.cunit === 'mgL' ? 'mg/L' : 'µg/L') + ' × ' + f(dil),
        result: 'c_el = ' + f(cgml) + ' g/mL'
      });
      let w;
      if (v.wmode === 'formula') {
        const n = NC.need(v.nel, 'Atoms per formula unit', { positive: true });
        const Mel = NC.need(v.Mel, 'Atomic weight', { positive: true });
        const Mc = m.custom ? NC.need(v.Mc, 'Compound molar mass', { positive: true }) : m.M;
        w = (n * Mel) / Mc;
        s.add({ title: 'Element mass fraction in the compound', formula: 'w = n·M_el / M_compound', tex: 'w = \\dfrac{n\\,M_{\\text{el}}}{M_{\\text{compound}}}', sub: 'w = ' + f(n) + ' × ' + f(Mel) + ' / ' + f(Mc), result: 'w = ' + f(w), ref: 'ciaaw2021' });
      } else if (v.wmode === 'direct') {
        w = NC.need(v.w, 'Mass fraction', { positive: true, max: 1 });
      } else {
        w = 1;
      }
      if (w > 1) NC.fail('The element mass fraction cannot exceed 1. Check n, the atomic weight and the molar mass.');
      const cp = cgml / w;
      s.add({ title: 'Mass concentration of particle material', formula: 'c_p = c_el / w', tex: 'c_p = \\dfrac{c_{\\text{el}}}{w}', sub: 'c_p = ' + f(cgml) + ' / ' + f(w), result: 'c_p = ' + f(cp) + ' g/mL' });
      const pv = particleVolume(s, v, 'p');
      const mp = m.rho * pv.V * 1e-21;
      s.add({ title: 'Mass of one particle', formula: 'm_p = ρ·V   (1 nm³ = 10⁻²¹ cm³)', sub: 'm_p = ' + f(m.rho) + ' g/cm³ × ' + f(pv.V) + ' × 10⁻²¹ cm³', result: 'm_p = ' + f(mp) + ' g', ref: m.custom ? undefined : 'crc' });
      const N = cp / mp;
      s.add({ title: 'Particle number concentration', formula: 'N = c_p / m_p', tex: 'N = \\dfrac{c_p}{m_p}', sub: 'N = ' + f(cp) + ' / ' + f(mp), result: 'N = ' + f(N) + ' particles/mL' });
      const cM = (N * 1000) / C.NA;
      s.add({ title: 'Molar particle concentration', formula: 'c = N × 1000 / N_A', tex: 'c = \\dfrac{N\\times 1000}{N_A}', sub: 'c = ' + f(N) + ' × 1000 / ' + f(C.NA), result: 'c = ' + f(cM) + ' mol/L = ' + f(cM * 1e12) + ' pM', ref: 'codata2018' });
      return {
        results: [
          { label: 'Particles per mL', value: N, unit: 'mL⁻¹', main: true },
          { label: 'Molar particle conc.', value: cM * 1e12, unit: 'pM', main: true },
          { label: 'Particle mass concentration', value: cp * 1e6, unit: 'µg/mL' },
          { label: 'Mass of one particle', value: mp, unit: 'g' },
          { label: 'Element mass fraction w', value: w, sig: 4 }
        ],
        steps: s.items,
        notes: [
          'Total digestion measures all of the element: particles plus dissolved ions. The particle number is overestimated if a dissolved fraction is present.',
          'The size is taken as monodisperse. For a size distribution, use the volume-weighted mean diameter, D[3,0], i.e. the cube root of the mean of D³.'
        ]
      };
    }
  });

  /* ================================================================== */
  /* 2 · Single-particle ICP-MS                                          */
  /* ================================================================== */
  const isEtaMode = function (m) { return function (v) { return v.mode === m; }; };
  NC.register({
    id: 'spicpms',
    category: 'analysis',
    title: 'Single-particle ICP-MS (spICP-MS)',
    short: 'Transport efficiency, particle size and number concentration from pulses',
    description:
      'Works out the transport efficiency η by the particle-size or particle-frequency method (Pace et al. 2011). It then converts a sample pulse intensity into particle mass and equivalent spherical diameter, and the pulse frequency into a particle number concentration.',
    refs: ['pace2011', 'laborda2014', 'crc', 'codata2018'],
    inputs: [
      NC.sel('mode', 'Transport efficiency η from', [['size', 'Particle size method (reference NPs of known size)'], ['freq', 'Particle frequency method (reference NPs of known number concentration)'], ['known', 'Known η']], 'size'),
      NC.num('eta', 'Transport efficiency η', '', 0.05, { showIf: isEtaMode('known'), help: 'Fraction of the aspirated sample that reaches the plasma (typically a few %).' }),
      NC.num('Q', 'Sample flow rate', 'µL/min', 350),
      NC.num('td', 'Dwell time', 'ms', 3),
      NC.num('sd', 'Dissolved-standard calibration slope', 'counts per dwell per (µg/L)', 2000, { showIf: function (v) { return v.mode !== 'freq'; } }),
      NC.sel('refmat', 'Reference particle material', matOptions, 'Au', { showIf: isEtaMode('size') }),
      NC.num('refrho', 'Reference density', 'g/cm³', 19.32, { showIf: function (v) { return v.mode === 'size' && v.refmat === 'custom'; } }),
      NC.num('refD', 'Reference particle diameter', 'nm', 60, { showIf: isEtaMode('size') }),
      NC.num('refI', 'Mean pulse intensity of reference particles', 'counts', 4994, { showIf: isEtaMode('size') }),
      NC.num('refN', 'Reference particle number concentration', 'particles/mL', 1e5, { showIf: isEtaMode('freq') }),
      NC.num('refF', 'Reference pulse frequency', 'events/s', 30, { showIf: isEtaMode('freq') }),
      NC.sel('mat', 'Sample particle material', matOptions, 'Au'),
      NC.num('rho', 'Sample density', 'g/cm³', 19.32, { showIf: function (v) { return v.mat === 'custom'; } }),
      NC.num('w', 'Element mass fraction in the particle w', '', 1, { help: '1 for pure metals; e.g. 0.7236 for Fe in Fe₃O₄.' }),
      NC.num('Ip', 'Sample pulse intensity (one particle)', 'counts', 1000, { help: 'Background-corrected counts of a single particle event (or the mean).' }),
      NC.num('fs', 'Sample pulse frequency', 'events/s', 25),
      NC.num('dil', 'Dilution factor', '×', 1000)
    ],
    example: { mode: 'size', Q: 350, td: 3, sd: 2000, refmat: 'Au', refD: 60, refI: 4994, mat: 'Au', w: 1, Ip: 1000, fs: 25, dil: 1000 },
    presetNote: 'The dissolved slope must be measured under the same conditions (dwell time, flow) as the particles. The calculator assumes the particle and dissolved responses are the same per unit mass of element.',
    compute: function (v) {
      const s = new NC.Steps();
      const Qul = NC.need(v.Q, 'Flow rate', { positive: true });
      const tdms = NC.need(v.td, 'Dwell time', { positive: true });
      const Q = (Qul * 1e-3) / 60; // mL/s
      const td = tdms * 1e-3; // s
      s.add({ title: 'Flow rate and dwell time in SI-friendly units', formula: 'Q[mL/s] = Q[µL/min] × 10⁻³ / 60,   t_d[s] = t_d[ms] × 10⁻³', sub: 'Q = ' + f(Qul) + ' × 10⁻³ / 60;   t_d = ' + f(tdms) + ' × 10⁻³', result: 'Q = ' + f(Q) + ' mL/s;   t_d = ' + f(td) + ' s' });
      let sd = null;
      if (v.mode !== 'freq') {
        const sdIn = NC.need(v.sd, 'Calibration slope', { positive: true });
        sd = sdIn * 1e9; // counts per dwell per (g/mL)
        s.add({ title: 'Dissolved calibration slope in mass units', formula: 's_d[counts per (g/mL)] = s_d[counts per (µg/L)] × 10⁹', sub: 's_d = ' + f(sdIn) + ' × 10⁹', result: 's_d = ' + f(sd) + ' counts per dwell per (g/mL)', ref: 'laborda2014' });
      }
      let eta;
      if (v.mode === 'known') {
        eta = NC.need(v.eta, 'Transport efficiency', { positive: true, max: 1 });
      } else if (v.mode === 'freq') {
        const Nref = NC.need(v.refN, 'Reference number concentration', { positive: true });
        const fref = NC.need(v.refF, 'Reference pulse frequency', { positive: true });
        eta = fref / (Nref * Q);
        s.add({ title: 'Transport efficiency, particle frequency method', formula: 'η = f_ref / (N_ref·Q)', tex: '\\eta = \\dfrac{f_{\\text{ref}}}{N_{\\text{ref}}\\,Q}', sub: 'η = ' + f(fref) + ' / (' + f(Nref) + ' × ' + f(Q) + ')', result: 'η = ' + f(eta) + '  (' + NC.fix(eta * 100, 2) + ' %)', ref: 'pace2011' });
      } else {
        const rm = material(v.refmat, v.refrho, 'Reference');
        const Dref = NC.need(v.refD, 'Reference diameter', { positive: true });
        const Iref = NC.need(v.refI, 'Reference intensity', { positive: true });
        const mref = rm.rho * ((PI * Math.pow(Dref, 3)) / 6) * 1e-21;
        s.add({ title: 'Mass of one reference particle (sphere)', formula: 'm_ref = ρ_ref·πD_ref³/6', tex: 'm_{\\text{ref}} = \\rho_{\\text{ref}}\\,\\dfrac{\\pi D_{\\text{ref}}^3}{6}', sub: 'm_ref = ' + f(rm.rho) + ' × π × ' + f(Dref) + '³ / 6 × 10⁻²¹', result: 'm_ref = ' + f(mref) + ' g', ref: rm.custom ? undefined : 'crc' });
        eta = (sd * mref) / (Iref * Q * td);
        s.add({ title: 'Transport efficiency, particle size method', formula: 'η = s_d·m_ref / (I_ref·Q·t_d)', tex: '\\eta = \\dfrac{s_d\\,m_{\\text{ref}}}{I_{\\text{ref}}\\,Q\\,t_d}', sub: 'η = ' + f(sd) + ' × ' + f(mref) + ' / (' + f(Iref) + ' × ' + f(Q) + ' × ' + f(td) + ')', result: 'η = ' + f(eta) + '  (' + NC.fix(eta * 100, 2) + ' %)', note: 'Equates the response per unit mass of particles with that of the dissolved standard, delivered at η·Q·t_d·c per dwell.', ref: 'pace2011' });
      }
      if (eta > 1) NC.fail('The transport efficiency came out above 1 (' + f(eta) + '). Check the units of the slope, flow rate and dwell time.');
      const results = [{ label: 'Transport efficiency η', value: eta * 100, unit: '%', main: true }];
      const m = material(v.mat, v.rho, 'Sample');
      const w = NC.need(v.w, 'Element mass fraction', { positive: true, max: 1 });
      if (sd !== null) {
        const Ip = NC.need(v.Ip, 'Pulse intensity', { positive: true });
        const mel = (Ip * eta * Q * td) / sd;
        s.add({ title: 'Element mass in one particle', formula: 'm_el = I_p·η·Q·t_d / s_d', tex: 'm_{\\text{el}} = \\dfrac{I_p\\,\\eta\\,Q\\,t_d}{s_d}', sub: 'm_el = ' + f(Ip) + ' × ' + f(eta) + ' × ' + f(Q) + ' × ' + f(td) + ' / ' + f(sd), result: 'm_el = ' + f(mel) + ' g = ' + f(mel * 1e18) + ' ag', ref: 'pace2011' });
        const d = Math.cbrt((6 * mel) / (PI * m.rho * w)) * 1e7;
        s.add({ title: 'Equivalent spherical diameter', formula: 'd = [6·m_el / (π·ρ·w)]^(1/3)', tex: 'd = \\left(\\dfrac{6\\,m_{\\text{el}}}{\\pi\\,\\rho\\,w}\\right)^{1/3}', sub: 'd = [6 × ' + f(mel) + ' / (π × ' + f(m.rho) + ' × ' + f(w) + ')]^(1/3) cm', result: 'd = ' + f(d) + ' nm', note: 'Assumes a solid sphere of bulk density. For other shapes this is the volume-equivalent diameter.', ref: 'laborda2014' });
        results.push({ label: 'Particle diameter', value: d, unit: 'nm', main: true }, { label: 'Element mass per particle', value: mel * 1e18, unit: 'ag' });
      } else {
        s.add({ title: 'Particle size not available', result: 'The frequency method gives η but no mass calibration. Add a dissolved-standard slope (size or known-η mode) to size particles.' });
      }
      const fs = NC.opt(v.fs, 'Pulse frequency', { nonneg: true });
      if (fs !== null) {
        const dil = NC.need(v.dil, 'Dilution factor', { positive: true });
        const Nm = fs / (eta * Q);
        s.add({ title: 'Particle number concentration (measured solution)', formula: 'N = f / (η·Q)', tex: 'N = \\dfrac{f}{\\eta\\,Q}', sub: 'N = ' + f(fs) + ' / (' + f(eta) + ' × ' + f(Q) + ')', result: 'N = ' + f(Nm) + ' particles/mL', ref: 'pace2011' });
        s.add({ title: 'Correct for dilution', formula: 'N_sample = N × dilution', sub: 'N_sample = ' + f(Nm) + ' × ' + f(dil), result: 'N_sample = ' + f(Nm * dil) + ' particles/mL' });
        results.push({ label: 'Particles per mL (sample)', value: Nm * dil, unit: 'mL⁻¹', main: true }, { label: 'Particles per mL (measured)', value: Nm, unit: 'mL⁻¹' });
      }
      const warnings = [];
      if (eta < 0.005 || eta > 0.2) warnings.push('η = ' + NC.fix(eta * 100, 2) + ' % is unusual for conventional nebulizers (typically a few %). Check the inputs.');
      return {
        results: results,
        steps: s.items,
        warnings: warnings,
        notes: ['Pulse frequency must stay low enough that two particles rarely arrive in one dwell (single-particle condition).', 'Small particles near the detection limit are missed, which biases mean sizes upward.']
      };
    }
  });

  /* ================================================================== */
  /* 3 · EDX quantification (Cliff–Lorimer)                              */
  /* ================================================================== */
  NC.register({
    id: 'edx',
    category: 'analysis',
    title: 'EDX quantification (Cliff–Lorimer)',
    short: 'Weight and atomic % from X-ray intensities and k-factors (thin specimens)',
    description:
      'Thin-film (TEM/STEM) EDX quantification: the concentration ratio of two elements equals their intensity ratio times a k-factor. Gives normalized weight % and atomic % for all elements.',
    refs: ['cliff1975', 'ciaaw2021'],
    inputs: [
      NC.data('data', 'Element, intensity (counts), k-factor [, atomic weight g/mol]', '', { placeholder: 'Fe, 12000, 1.00\nO, 4000, 1.85\n# atomic weight is looked up for common element symbols', help: 'k-factors relative to one reference element (k = 1). They are instrument-specific: use values measured on standards or supplied by your EDX software.' })
    ],
    example: { data: 'Fe, 12000, 1.00\nO, 4000, 1.85' },
    compute: function (v) {
      const s = new NC.Steps();
      const rows = NC.parseRows(v.data, { label: true, min: 2, max: 3, labels: ['intensity', 'k-factor', 'atomic weight'], name: 'Data' });
      if (rows.length < 2) NC.fail('Enter at least two elements.');
      const els = rows.map(function (r) {
        const sym = String(r.label).trim().split(/\s+/)[0];
        const M = r.length > 2 ? r[2] : ATW[sym];
        if (!(r[0] >= 0)) NC.fail(sym + ': intensity must be ≥ 0.');
        if (!(r[1] > 0)) NC.fail(sym + ': k-factor must be > 0.');
        return { label: String(r.label).trim(), sym: sym, I: r[0], k: r[1], M: M };
      });
      s.add({ title: 'Cliff–Lorimer ratio equation', formula: 'C_A / C_B = k_AB · I_A / I_B', tex: '\\dfrac{C_A}{C_B} = k_{AB}\\,\\dfrac{I_A}{I_B}', note: 'Valid for thin specimens where absorption and fluorescence are negligible.', ref: 'cliff1975' });
      const kI = els.map(function (e) { return e.k * e.I; });
      const sum = kI.reduce(function (a, b) { return a + b; }, 0);
      if (!(sum > 0)) NC.fail('All intensities are zero.');
      s.add({ title: 'k-weighted intensities', formula: 'k_i·I_i', sub: els.map(function (e, i) { return e.label + ': ' + f(e.k) + ' × ' + f(e.I) + ' = ' + f(kI[i]); }).join(';   '), result: 'Σ k_i·I_i = ' + f(sum) });
      const wt = kI.map(function (x) { return (100 * x) / sum; });
      s.add({ title: 'Normalized weight fractions', formula: 'C_i = k_i·I_i / Σ_j k_j·I_j × 100 %', tex: 'C_i = \\dfrac{k_i I_i}{\\sum_j k_j I_j}\\times 100\\,\\%', result: els.map(function (e, i) { return e.label + ' = ' + NC.fix(wt[i], 2) + ' wt%'; }).join(';   '), ref: 'cliff1975' });
      let at = null;
      const missing = els.filter(function (e) { return !(e.M > 0); }).map(function (e) { return e.label; });
      if (!missing.length) {
        const nm = wt.map(function (x, i) { return x / els[i].M; });
        const ns = nm.reduce(function (a, b) { return a + b; }, 0);
        at = nm.map(function (x) { return (100 * x) / ns; });
        s.add({ title: 'Weight % → atomic %', formula: 'x_i = (C_i / M_i) / Σ_j (C_j / M_j) × 100 %', tex: 'x_i = \\dfrac{C_i / M_i}{\\sum_j C_j / M_j}\\times 100\\,\\%', sub: els.map(function (e) { return e.sym + ': M = ' + f(e.M); }).join(';   '), result: els.map(function (e, i) { return e.label + ' = ' + NC.fix(at[i], 2) + ' at%'; }).join(';   '), ref: 'ciaaw2021' });
      }
      const warnings = missing.length ? ['No atomic weight for ' + missing.join(', ') + ': add it as a fourth column to get atomic %.'] : [];
      const series = [{ name: 'wt%', mode: 'bars', points: els.map(function (e, i) { return [i + 0.1, i + 0.5, wt[i]]; }) }];
      if (at) series.push({ name: 'at%', mode: 'bars', color: 3, points: els.map(function (e, i) { return [i + 0.5, i + 0.9, at[i]]; }) });
      return {
        results: els.map(function (e, i) { return { label: e.label + (at ? ' (wt% / at%)' : ' (wt%)'), value: at ? NC.fix(wt[i], 2) + ' / ' + NC.fix(at[i], 2) : wt[i], unit: at ? '' : '%', main: i < 3 }; }),
        steps: s.items,
        warnings: warnings,
        tables: [{ title: 'Composition', columns: ['Element', 'Intensity', 'k', 'wt%', 'at%'], rows: els.map(function (e, i) { return [e.label, f(e.I), f(e.k), NC.fix(wt[i], 2), at ? NC.fix(at[i], 2) : '—']; }) }],
        plots: [{ title: 'Composition (bars in element order: ' + els.map(function (e) { return e.sym; }).join(', ') + ')', xlabel: 'Element index', ylabel: '%', series: series, legend: true, ymin: 0, xmin: 0, xmax: els.length }],
        notes: ['k-factors depend on the microscope, detector and accelerating voltage; the illustrative example values are not general.', 'Thick or strongly absorbing samples (SEM bulk EDX) need ZAF / φ(ρz) corrections instead.']
      };
    }
  });

  /* ================================================================== */
  /* 4 · Magnetism                                                       */
  /* ================================================================== */
  const magMats = ['Fe3O4', 'Fe2O3', 'Fe', 'Co', 'Ni', 'Co3O4', 'NiO'].filter(function (k) { return NC.materials[k]; });
  const magOptions = magMats.map(function (k) { return [k, NC.materials[k].label]; }).concat([['custom', 'Custom material…']]);
  const mm = function (list) { return function (v) { return list.indexOf(v.mode) >= 0; }; };
  NC.register({
    id: 'magnet',
    category: 'magnetic',
    title: 'Magnetic nanoparticles: moment, dead layer, blocking temperature',
    short: 'Per-particle moment, magnetic dead layer, Néel–Arrhenius blocking temperature',
    description:
      'Converts a measured saturation magnetization (VSM/SQUID) into the moment per particle, estimates a magnetically dead surface layer, and relates anisotropy, volume and blocking temperature through the Néel–Arrhenius law. It also gives the largest superparamagnetic diameter at a temperature.',
    refs: ['cullity2009', 'bean1959', 'neel1949', 'codata2018', 'crc'],
    inputs: [
      NC.sel('mode', 'Calculate', [['ms', 'Moment per particle and dead layer (from M_s)'], ['tb', 'Blocking temperature from K and D'], ['k', 'Anisotropy constant from T_B and D'], ['dsp', 'Superparamagnetic limit diameter at temperature T']], 'ms'),
      NC.sel('mat', 'Material (density)', magOptions, 'Fe3O4'),
      NC.num('rho', 'Density ρ', 'g/cm³', 5.17, { showIf: function (v) { return v.mat === 'custom'; } }),
      NC.num('D', 'Particle diameter D', 'nm', 10, { showIf: mm(['ms', 'tb', 'k']) }),
      NC.num('Ms', 'Measured saturation magnetization M_s', 'A·m²/kg (= emu/g)', 80, { showIf: mm(['ms']), help: 'Per mass of magnetic material. Subtract ligand/shell mass (e.g. from TGA) first.' }),
      NC.num('Msb', 'Bulk M_s of the material (optional)', 'A·m²/kg (= emu/g)', NaN, { showIf: mm(['ms']), help: 'Enter a literature bulk value (e.g. from Cullity & Graham) to estimate the magnetic dead layer.' }),
      NC.num('K', 'Effective anisotropy constant K', 'J/m³', 1.1e4, { showIf: mm(['tb', 'dsp']), help: 'Effective K of the nanoparticles. It often differs from bulk because of surface and shape anisotropy.' }),
      NC.num('TB', 'Blocking temperature T_B', 'K', 50, { showIf: mm(['k']) }),
      NC.num('T', 'Temperature T', 'K', 300, { showIf: mm(['dsp']) }),
      NC.num('tm', 'Measurement time τ_m', 's', 100, { showIf: mm(['tb', 'k', 'dsp']), help: '~100 s for DC magnetometry; much shorter for AC susceptibility or Mössbauer.' }),
      NC.num('t0', 'Attempt time τ₀', 's', 1e-9, { showIf: mm(['tb', 'k', 'dsp']), help: 'Typically 10⁻⁹–10⁻¹⁰ s.' })
    ],
    example: { mode: 'ms', mat: 'Fe3O4', D: 10, Ms: 80, Msb: 92 },
    presetNote: 'Densities are bulk values (CRC Handbook). Saturation magnetization and anisotropy depend strongly on size, surface, crystallinity and temperature, so no fixed values are built in: enter measured or cited ones.',
    compute: function (v) {
      const s = new NC.Steps();
      const rho = v.mat === 'custom' ? NC.need(v.rho, 'Density', { positive: true }) : NC.materials[v.mat].rho;
      const results = [], warnings = [], plots = [];
      const lnRatio = function () {
        const tm = NC.need(v.tm, 'Measurement time', { positive: true });
        const t0 = NC.need(v.t0, 'Attempt time', { positive: true });
        if (tm <= t0) NC.fail('The measurement time must be longer than the attempt time.');
        const L = Math.log(tm / t0);
        s.add({ title: 'Néel–Arrhenius relaxation: blocking condition', formula: 'τ = τ₀·exp(KV / k_BT);  blocked when τ = τ_m  ⇒  KV = ln(τ_m/τ₀)·k_B·T_B', tex: '\\tau = \\tau_0\\,e^{KV/k_BT}\\;\\Rightarrow\\; KV = \\ln\\!\\left(\\dfrac{\\tau_m}{\\tau_0}\\right) k_B T_B', sub: 'ln(τ_m/τ₀) = ln(' + f(tm) + ' / ' + f(t0) + ')', result: 'ln(τ_m/τ₀) = ' + f(L), note: 'For DC measurements (τ_m ≈ 100 s, τ₀ ≈ 10⁻⁹ s) this gives the familiar KV ≈ 25 k_BT_B.', ref: ['neel1949', 'bean1959'] });
        return L;
      };
      if (v.mode === 'ms') {
        const D = NC.need(v.D, 'Diameter', { positive: true });
        const Ms = NC.need(v.Ms, 'Saturation magnetization', { positive: true });
        s.add({ title: 'Unit equivalence', formula: '1 emu/g = 1 A·m²/kg', result: 'M_s = ' + f(Ms) + ' A·m²/kg', ref: 'cullity2009' });
        const Vm3 = ((PI * Math.pow(D, 3)) / 6) * 1e-27;
        const mkg = rho * 1000 * Vm3;
        s.add({ title: 'Mass of one particle (sphere)', formula: 'm = ρ·πD³/6', tex: 'm = \\rho\\,\\dfrac{\\pi D^3}{6}', sub: 'm = ' + f(rho * 1000) + ' kg/m³ × π × (' + f(D) + '×10⁻⁹ m)³ / 6', result: 'm = ' + f(mkg) + ' kg', ref: v.mat === 'custom' ? undefined : 'crc' });
        const mu = Ms * mkg;
        s.add({ title: 'Magnetic moment per particle', formula: 'μ_p = M_s·m', tex: '\\mu_p = M_s\\,m', sub: 'μ_p = ' + f(Ms) + ' × ' + f(mkg), result: 'μ_p = ' + f(mu) + ' A·m²' });
        const nB = mu / MU_B;
        s.add({ title: 'In Bohr magnetons', formula: 'μ_p / μ_B,   μ_B = 9.2740100783×10⁻²⁴ J/T', tex: '\\dfrac{\\mu_p}{\\mu_B},\\quad \\mu_B = 9.2740100783\\times 10^{-24}\\ \\text{J/T}', sub: f(mu) + ' / ' + f(MU_B), result: 'μ_p = ' + f(nB) + ' μ_B', ref: 'codata2018' });
        const Mv = Ms * rho * 1000;
        s.add({ title: 'Volume magnetization', formula: 'M = M_s·ρ', sub: 'M = ' + f(Ms) + ' A·m²/kg × ' + f(rho * 1000) + ' kg/m³', result: 'M = ' + f(Mv / 1000) + ' kA/m' });
        results.push({ label: 'Moment per particle', value: nB, unit: 'μ_B', main: true }, { label: 'Moment per particle', value: mu, unit: 'A·m²' }, { label: 'Volume magnetization', value: Mv / 1000, unit: 'kA/m' });
        const Msb = NC.opt(v.Msb, 'Bulk saturation magnetization', { positive: true });
        if (Msb !== null) {
          const r = Ms / Msb;
          if (r >= 1) {
            warnings.push('The measured M_s is not below the bulk value, so no dead layer can be estimated.');
          } else {
            const t = (D / 2) * (1 - Math.cbrt(r));
            s.add({ title: 'Magnetically dead surface layer (core–shell model)', formula: 'M_s / M_s,bulk = (1 − 2t/D)³   ⇒   t = (D/2)·[1 − (M_s/M_s,bulk)^(1/3)]', tex: '\\dfrac{M_s}{M_{s,\\text{bulk}}} = \\left(1 - \\dfrac{2t}{D}\\right)^3 \\;\\Rightarrow\\; t = \\dfrac{D}{2}\\left[1 - \\left(\\dfrac{M_s}{M_{s,\\text{bulk}}}\\right)^{1/3}\\right]', sub: 't = (' + f(D) + '/2) × [1 − (' + f(Ms) + '/' + f(Msb) + ')^(1/3)] = ' + f(D / 2) + ' × (1 − ' + f(Math.cbrt(r)) + ')', result: 't = ' + f(t) + ' nm  (M_s/M_s,bulk = ' + NC.fix(r * 100, 1) + ' %)', note: 'Treats the reduction as a non-magnetic shell of uniform thickness; spin canting, cation disorder and residual ligand mass also lower M_s.' });
            results.push({ label: 'Dead layer thickness', value: t, unit: 'nm', main: true }, { label: 'M_s / M_s,bulk', value: r * 100, unit: '%' });
          }
        }
      } else if (v.mode === 'tb' || v.mode === 'k') {
        const D = NC.need(v.D, 'Diameter', { positive: true });
        const V = ((PI * Math.pow(D, 3)) / 6) * 1e-27;
        s.add({ title: 'Particle volume (sphere)', formula: 'V = πD³/6', tex: 'V = \\dfrac{\\pi D^3}{6}', sub: 'V = π × (' + f(D) + '×10⁻⁹ m)³ / 6', result: 'V = ' + f(V) + ' m³' });
        const L = lnRatio();
        if (v.mode === 'tb') {
          const K = NC.need(v.K, 'Anisotropy constant', { positive: true });
          const TB = (K * V) / (C.kB * L);
          s.add({ title: 'Blocking temperature', formula: 'T_B = K·V / [k_B·ln(τ_m/τ₀)]', tex: 'T_B = \\dfrac{K V}{k_B \\ln(\\tau_m/\\tau_0)}', sub: 'T_B = ' + f(K) + ' × ' + f(V) + ' / (' + f(C.kB) + ' × ' + f(L) + ')', result: 'T_B = ' + f(TB) + ' K', ref: ['bean1959', 'codata2018'] });
          results.push({ label: 'Blocking temperature T_B', value: TB, unit: 'K', main: true }, { label: 'Energy barrier KV', value: (K * V) / (C.kB), unit: 'K (in k_B units)' });
          const curve = [];
          for (let d = 2; d <= Math.max(30, 2 * D); d += 0.5) curve.push([d, (K * ((PI * d * d * d) / 6) * 1e-27) / (C.kB * L)]);
          plots.push({ title: 'Blocking temperature versus diameter', xlabel: 'Diameter D (nm)', ylabel: 'T_B (K)', series: [{ name: 'Néel–Arrhenius', mode: 'line', points: curve }, { name: 'This particle', mode: 'markers', color: 1, size: 5, points: [[D, TB]] }], ymin: 0 });
        } else {
          const TB = NC.need(v.TB, 'Blocking temperature', { positive: true });
          const K = (L * C.kB * TB) / V;
          s.add({ title: 'Effective anisotropy constant', formula: 'K = ln(τ_m/τ₀)·k_B·T_B / V', tex: 'K = \\dfrac{\\ln(\\tau_m/\\tau_0)\\,k_B T_B}{V}', sub: 'K = ' + f(L) + ' × ' + f(C.kB) + ' × ' + f(TB) + ' / ' + f(V), result: 'K = ' + f(K) + ' J/m³ = ' + f(K / 1000) + ' kJ/m³', ref: ['bean1959', 'codata2018'] });
          results.push({ label: 'Effective anisotropy K', value: K, unit: 'J/m³', main: true });
        }
      } else {
        const K = NC.need(v.K, 'Anisotropy constant', { positive: true });
        const T = NC.need(v.T, 'Temperature', { positive: true });
        const L = lnRatio();
        const V = (L * C.kB * T) / K;
        const Dsp = Math.cbrt((6 * V) / PI) * 1e9;
        s.add({ title: 'Largest superparamagnetic volume and diameter at T', formula: 'V_sp = ln(τ_m/τ₀)·k_B·T / K,   D_sp = (6V_sp/π)^(1/3)', tex: 'V_{sp} = \\dfrac{\\ln(\\tau_m/\\tau_0)\\,k_B T}{K},\\quad D_{sp} = \\left(\\dfrac{6V_{sp}}{\\pi}\\right)^{1/3}', sub: 'V_sp = ' + f(L) + ' × ' + f(C.kB) + ' × ' + f(T) + ' / ' + f(K), result: 'V_sp = ' + f(V) + ' m³;   D_sp = ' + f(Dsp) + ' nm', note: 'Particles smaller than D_sp appear superparamagnetic on this measurement time scale.', ref: ['bean1959', 'codata2018'] });
        results.push({ label: 'Superparamagnetic limit D_sp', value: Dsp, unit: 'nm', main: true }, { label: 'Critical volume V_sp', value: V, unit: 'm³' });
      }
      return {
        results: results,
        steps: s.items,
        warnings: warnings,
        plots: plots,
        notes: ['Single-domain, non-interacting particles with uniaxial anisotropy are assumed. Dipolar interactions in concentrated samples raise the apparent T_B.', 'Use the mass of magnetic material only (subtract organic coating measured by TGA) before comparing M_s with bulk.']
      };
    }
  });

  /* ================================================================== */
  /* 5 · Pt ECSA, dispersion and TOF                                     */
  /* ================================================================== */
  NC.register({
    id: 'ecsa',
    category: 'electrochem',
    title: 'Electrochemical surface area (Pt), dispersion & TOF',
    short: 'Pt ECSA from H-UPD or CO stripping charge; utilization, dispersion, turnover frequency',
    description:
      'Converts the hydrogen underpotential deposition (H-UPD) or CO-stripping charge of a Pt electrode into its electrochemically active surface area. It normalizes per mass of Pt, compares with the geometric surface area of the particles, estimates the dispersion and gives a turnover frequency from a reaction rate.',
    refs: ['trasatti1991', 'boudart1995', 'codata2018', 'kittel2005', 'roduner2006', 'crc'],
    inputs: [
      NC.sel('mode', 'Method', [['hupd', 'H-UPD (210 µC/cm², 1 e⁻ per surface Pt)'], ['co', 'CO stripping (420 µC/cm², 2 e⁻ per CO)']], 'hupd'),
      NC.sel('qmode', 'Charge given as', [['charge', 'Charge Q'], ['area', 'Integrated CV peak area and scan rate']], 'charge'),
      NC.num('Q', 'Charge Q (double-layer corrected)', 'mC', 1.05, { showIf: function (v) { return v.qmode === 'charge'; } }),
      NC.num('Aiv', 'Integrated peak area ∫I dE', 'A·V', 5.25e-5, { showIf: function (v) { return v.qmode === 'area'; } }),
      NC.num('nu', 'Scan rate ν', 'V/s', 0.05, { showIf: function (v) { return v.qmode === 'area'; } }),
      NC.num('qs', 'Specific charge (override, optional)', 'µC/cm²', NaN, { help: 'Leave blank to use 210 (H-UPD) or 420 (CO) µC/cm².' }),
      NC.num('mPt', 'Pt mass on the electrode', 'µg', 10),
      NC.num('D', 'Mean Pt particle diameter (optional)', 'nm', 3, { help: 'Used to compare with the geometric surface area and the geometric dispersion.' }),
      NC.num('rate', 'Reaction rate (optional)', 'mol/s', NaN, { help: 'Moles of product per second at the electrode, for the turnover frequency.' })
    ],
    example: { mode: 'hupd', qmode: 'charge', Q: 1.05, mPt: 10, D: 3, rate: 1e-9 },
    presetNote: 'The 210 µC/cm² (H-UPD) and 420 µC/cm² (CO) conversion factors are conventions for polycrystalline Pt. Report which one you used and how the double-layer charge was subtracted.',
    compute: function (v) {
      const s = new NC.Steps();
      const co = v.mode === 'co';
      const qsDefault = co ? 420 : 210;
      const qsO = NC.opt(v.qs, 'Specific charge', { positive: true });
      const qs = qsO !== null ? qsO : qsDefault;
      const z = co ? 2 : 1;
      let QmC;
      if (v.qmode === 'area') {
        const A = NC.need(v.Aiv, 'Peak area', { positive: true });
        const nu = NC.need(v.nu, 'Scan rate', { positive: true });
        QmC = (A / nu) * 1000;
        s.add({ title: 'Charge from the voltammetric peak', formula: 'Q = (∫I dE) / ν', tex: 'Q = \\dfrac{\\int I\\,dE}{\\nu}', sub: 'Q = ' + f(A) + ' A·V / ' + f(nu) + ' V/s', result: 'Q = ' + f(QmC / 1000) + ' C = ' + f(QmC) + ' mC' });
      } else {
        QmC = NC.need(v.Q, 'Charge', { positive: true });
      }
      const ecsa = (QmC * 1000) / qs; // cm²
      s.add({ title: 'Electrochemically active surface area', formula: 'ECSA = Q / q_s   (q_s = ' + qs + ' µC/cm²' + (qsO === null ? ', ' + (co ? 'CO stripping' : 'H-UPD') + ' convention' : ', user value') + ')', tex: '\\text{ECSA} = \\dfrac{Q}{q_s}', sub: 'ECSA = ' + f(QmC * 1000) + ' µC / ' + f(qs) + ' µC/cm²', result: 'ECSA = ' + f(ecsa) + ' cm²', ref: 'trasatti1991' });
      const mPt = NC.need(v.mPt, 'Pt mass', { positive: true });
      const ecsaM = (ecsa * 1e-4) / (mPt * 1e-6);
      s.add({ title: 'Mass-normalized ECSA', formula: 'ECSA_m = ECSA / m_Pt', tex: '\\text{ECSA}_m = \\dfrac{\\text{ECSA}}{m_{\\text{Pt}}}', sub: 'ECSA_m = ' + f(ecsa) + ' × 10⁻⁴ m² / (' + f(mPt) + ' × 10⁻⁶ g)', result: 'ECSA_m = ' + f(ecsaM) + ' m²/g_Pt' });
      const sites = (QmC * 1e-3) / (z * FARADAY);
      s.add({ title: 'Surface Pt sites from the charge', formula: 'n_s = Q / (z·F),   F = e·N_A,   z = ' + z + ' e⁻ per site', tex: 'n_s = \\dfrac{Q}{z F},\\quad F = e N_A', sub: 'n_s = ' + f(QmC * 1e-3) + ' C / (' + z + ' × ' + f(FARADAY) + ' C/mol)', result: 'n_s = ' + f(sites) + ' mol;   site density q_s/(z·e) = ' + f((qs * 1e-6) / (z * C.e)) + ' cm⁻²', note: 'Equivalent statement of the convention: 210 µC/cm² ÷ e = 1.31×10¹⁵ Pt atoms per cm².', ref: 'codata2018' });
      const MPt = NC.materials.Pt ? NC.materials.Pt.M : 195.084;
      const rhoPt = NC.materials.Pt ? NC.materials.Pt.rho : 21.45;
      const nTot = (mPt * 1e-6) / MPt;
      const disp = sites / nTot;
      s.add({ title: 'Dispersion from the electrochemical sites', formula: 'Dispersion = n_s / n_Pt,total,   n_Pt = m_Pt / M_Pt', tex: '\\text{Dispersion} = \\dfrac{n_s}{n_{\\text{Pt}}},\\quad n_{\\text{Pt}} = \\dfrac{m_{\\text{Pt}}}{M_{\\text{Pt}}}', sub: 'n_Pt = ' + f(mPt) + '×10⁻⁶ g / ' + f(MPt) + ' g/mol = ' + f(nTot) + ' mol', result: 'Dispersion = ' + NC.fix(disp * 100, 1) + ' %', ref: 'boudart1995' });
      const results = [
        { label: 'ECSA', value: ecsa, unit: 'cm²', main: true },
        { label: 'Mass-normalized ECSA', value: ecsaM, unit: 'm²/g_Pt', main: true },
        { label: 'Dispersion (electrochemical)', value: disp * 100, unit: '%', main: true },
        { label: 'Surface Pt sites', value: sites, unit: 'mol' }
      ];
      const warnings = [];
      if (disp > 1) warnings.push('The dispersion is above 100 %: the charge is too large for the Pt mass. Check the double-layer correction and the loading.');
      const D = NC.opt(v.D, 'Particle diameter', { positive: true });
      if (D !== null) {
        const ssa = 6000 / (rhoPt * D);
        s.add({ title: 'Geometric surface area of spherical Pt particles', formula: 'S_geo[m²/g] = 6000 / (ρ[g/cm³]·D[nm])', tex: 'S_{\\text{geo}} = \\dfrac{6000}{\\rho\\,D}', sub: 'S_geo = 6000 / (' + f(rhoPt) + ' × ' + f(D) + ')', result: 'S_geo = ' + f(ssa) + ' m²/g;   utilization = ECSA_m / S_geo = ' + NC.fix((100 * ecsaM) / ssa, 1) + ' %', ref: 'crc' });
        const dat = 2 * Math.cbrt((3 * MPt) / (4 * PI * rhoPt * C.NA)) * 1e7;
        const Fg = D > 2 * dat ? 1 - Math.pow((D - 2 * dat) / D, 3) : 1;
        s.add({ title: 'Geometric dispersion (one-atom shell of a sphere)', formula: 'F = 1 − [(D − 2d_at)/D]³,   d_at = 2·[3M/(4πρN_A)]^(1/3)', tex: 'F = 1 - \\left(\\dfrac{D - 2d_{at}}{D}\\right)^3,\\quad d_{at} = 2\\left(\\dfrac{3M}{4\\pi\\rho N_A}\\right)^{1/3}', sub: 'd_at = ' + f(dat) + ' nm', result: 'F = ' + NC.fix(Fg * 100, 1) + ' %', ref: ['kittel2005', 'roduner2006'] });
        results.push({ label: 'Geometric SSA', value: ssa, unit: 'm²/g' }, { label: 'Pt utilization', value: (100 * ecsaM) / ssa, unit: '%' }, { label: 'Geometric dispersion', value: Fg * 100, unit: '%' });
        if (ecsaM > ssa * 1.05) warnings.push('ECSA exceeds the geometric area of spheres of this size. Check the charge, the loading or the particle size.');
      }
      const rate = NC.opt(v.rate, 'Reaction rate', { positive: true });
      if (rate !== null) {
        const tof = rate / sites;
        s.add({ title: 'Turnover frequency', formula: 'TOF = rate / n_s', tex: '\\text{TOF} = \\dfrac{\\text{rate}}{n_s}', sub: 'TOF = ' + f(rate) + ' mol/s / ' + f(sites) + ' mol', result: 'TOF = ' + f(tof) + ' s⁻¹', note: 'Counts every electrochemically accessible surface Pt atom as an active site, which gives a lower bound on the true per-site rate.', ref: 'boudart1995' });
        results.push({ label: 'Turnover frequency', value: tof, unit: 's⁻¹', main: true });
      }
      return {
        results: results,
        steps: s.items,
        warnings: warnings,
        notes: ['Subtract the double-layer charging current before integrating the H-UPD or CO-stripping region.', 'For alloys and shape-controlled Pt the per-site charge differs from the polycrystalline convention.']
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
