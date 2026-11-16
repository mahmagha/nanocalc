/*
 * Colloids and synthesis (PLAN.md workstream G):
 *   dlvo        DLVO interaction energy between two identical spheres
 *   sediment    Stokes settling, diffusion, Péclet number, centrifugation
 *   seedgrowth  seed-mediated growth: final size or precursor needed
 *   yield       synthesis yield and conversion mass balance
 *   nucleation  classical nucleation theory: critical radius and barrier
 *   ripening    Ostwald ripening (LSW): r³ − r₀³ = K·t
 *
 * Load after nanoparticle.js (seedgrowth uses NC.shapes at run time).
 */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt, C = NC.C;
  const G0 = 9.80665; // standard acceleration of gravity, m/s² (defined value)

  NC.addRefs({
    derjaguin1941: { type: 'article', authors: 'Derjaguin, B.; Landau, L.', title: 'Theory of the stability of strongly charged lyophobic sols and of the adhesion of strongly charged particles in solutions of electrolytes', journal: 'Acta Physicochim. URSS', year: 1941, volume: '14', pages: '633–662' },
    verwey1948: { type: 'book', authors: 'Verwey, E. J. W.; Overbeek, J. Th. G.', title: 'Theory of the Stability of Lyophobic Colloids', publisher: 'Elsevier', place: 'Amsterdam', year: 1948 },
    hamaker1937: { doi: '10.1016/s0031-8914(37)80203-7', type: 'article', authors: 'Hamaker, H. C.', title: 'The London–van der Waals attraction between spherical particles', journal: 'Physica', year: 1937, volume: '4', pages: '1058–1072' },
    stokes1851: { type: 'article', authors: 'Stokes, G. G.', title: 'On the effect of the internal friction of fluids on the motion of pendulums', journal: 'Trans. Camb. Philos. Soc.', year: 1851, volume: '9', pages: '8–106' },
    teeguarden2007: { doi: '10.1093/toxsci/kfl165', type: 'article', authors: 'Teeguarden, J. G.; Hinderliter, P. M.; Orr, G.; Thrall, B. D.; Pounds, J. G.', title: 'Particokinetics in vitro: dosimetry considerations for in vitro nanoparticle toxicity assessments', journal: 'Toxicol. Sci.', year: 2007, volume: '95', pages: '300–312' },
    lamer1950: { type: 'article', authors: 'LaMer, V. K.; Dinegar, R. H.', title: 'Theory, production and mechanism of formation of monodispersed hydrosols', journal: 'J. Am. Chem. Soc.', year: 1950, volume: '72', pages: '4847–4854', doi: '10.1021/ja01167a001' },
    thanh2014: { type: 'article', authors: 'Thanh, N. T. K.; Maclean, N.; Mahiddine, S.', title: 'Mechanisms of nucleation and growth of nanoparticles in solution', journal: 'Chem. Rev.', year: 2014, volume: '114', pages: '7610–7630', doi: '10.1021/cr400544s' },
    lifshitz1961: { type: 'article', authors: 'Lifshitz, I. M.; Slyozov, V. V.', title: 'The kinetics of precipitation from supersaturated solid solutions', journal: 'J. Phys. Chem. Solids', year: 1961, volume: '19', pages: '35–50', doi: '10.1016/0022-3697(61)90054-3' },
    wagner1961: { doi: '10.1002/bbpc.19610650704', type: 'article', authors: 'Wagner, C.', title: 'Theorie der Alterung von Niederschlägen durch Umlösen (Ostwald-Reifung)', journal: 'Z. Elektrochem.', year: 1961, volume: '65', pages: '581–591' },
    jana2001: { type: 'article', authors: 'Jana, N. R.; Gearheart, L.; Murphy, C. J.', title: 'Seeding growth for size control of 5−40 nm diameter gold nanoparticles', journal: 'Langmuir', year: 2001, volume: '17', pages: '6782–6786', doi: '10.1021/la0104323' },
    bastus2011: { type: 'article', authors: 'Bastús, N. G.; Comenge, J.; Puntes, V.', title: 'Kinetically controlled seeded growth synthesis of citrate-stabilized gold nanoparticles of up to 200 nm: size focusing versus Ostwald ripening', journal: 'Langmuir', year: 2011, volume: '27', pages: '11098–11105', doi: '10.1021/la201938u' }
  });

  /* ---------------- shared helpers ---------------- */
  const matOpts = Object.keys(NC.materials).map(function (k) {
    return [k, NC.materials[k].label, NC.materialGroups ? NC.materialGroups[NC.materials[k].group] : undefined];
  }).concat([['custom', 'Custom material…', 'Other']]);
  const metalOpts = matOpts.filter(function (o) { return o[0] === 'custom' || NC.materials[o[0]].group === 'metal'; });
  const custom = function (key) { return function (v) { return v[key] === 'custom'; }; };

  function material(v, key, rhoKey, MKey) {
    if (v[key] === 'custom') {
      return {
        rho: rhoKey ? NC.need(v[rhoKey], 'Density', { positive: true }) : NaN,
        M: MKey ? NC.need(v[MKey], 'Molar mass', { positive: true }) : NaN,
        label: 'custom material', custom: true
      };
    }
    const m = NC.materials[v[key]];
    if (!m) NC.fail('Choose a material.');
    return { rho: m.rho, M: m.M, label: m.label };
  }

  /** Human-readable duration. */
  function fmtTime(sec) {
    if (!isFinite(sec)) return '∞';
    const a = Math.abs(sec);
    if (a < 1) return f(sec * 1000, 3) + ' ms';
    if (a < 120) return f(sec, 3) + ' s';
    if (a < 7200) return f(sec / 60, 3) + ' min';
    if (a < 2 * 86400) return f(sec / 3600, 3) + ' h';
    if (a < 2 * 365.25 * 86400) return f(sec / 86400, 3) + ' days';
    return f(sec / (365.25 * 86400), 3) + ' years';
  }
  NC.fmtTime = NC.fmtTime || fmtTime;

  /** Records temperature, k_BT and water/custom viscosity steps; returns { TK, kT, eta }. */
  function mediumSteps(s, v, needEta) {
    const tC = NC.need(v.T, 'Temperature', { min: -20, max: 150 });
    const TK = tC + 273.15;
    const kT = C.kB * TK;
    s.add({ title: 'Thermal energy', formula: 'k_B·T', sub: f(C.kB) + ' J/K × ' + f(TK, 6) + ' K', result: 'k_B·T = ' + f(kT) + ' J', ref: 'codata2018' });
    let eta = NaN;
    if (needEta) {
      if (v.visc === 'custom') {
        eta = NC.need(v.eta, 'Viscosity', { positive: true }) * 1e-3;
        s.add({ title: 'Medium viscosity (entered)', formula: 'η (mPa·s → Pa·s)', result: 'η = ' + f(eta) + ' Pa·s' });
      } else {
        if (tC < 0 || tC > 100) NC.fail('The water viscosity correlation covers 0–100 °C. Enter a custom viscosity instead.');
        eta = NC.waterViscosity(TK);
        s.add({ title: 'Viscosity of water at ' + f(tC) + ' °C', formula: 'η = 2.414×10⁻⁵ Pa·s × 10^[247.8 K / (T − 140 K)]', tex: String.raw`\eta = 2.414\times 10^{-5}\ \text{Pa}\cdot\text{s}\times 10^{\,247.8\ \text{K}/(T - 140\ \text{K})}`, sub: 'T = ' + f(TK, 6) + ' K', result: 'η = ' + f(eta) + ' Pa·s', note: 'Vogel-type correlation; agrees with the IAPWS formulation to about 1 % between 0 and 100 °C.', ref: 'huber2009' });
      }
    }
    return { tC: tC, TK: TK, kT: kT, eta: eta };
  }
  const tempInputs = [
    NC.num('T', 'Temperature', '°C', 25),
    NC.sel('visc', 'Medium viscosity', [['water', 'Water (automatic, from T)'], ['custom', 'Custom']], 'water'),
    NC.num('eta', 'Viscosity η', 'mPa·s', 0.89, { showIf: function (v) { return v.visc === 'custom'; } })
  ];

  /* ================================================================== */
  /* DLVO                                                                */
  /* ================================================================== */
  function vdw(model, AH, a, h) {
    if (model === 'full') {
      const r = 2 * a + h;
      const d2 = h * (4 * a + h); // r² − 4a², written to avoid cancellation at small h
      return -(AH / 6) * ((2 * a * a) / d2 + (2 * a * a) / (r * r) + Math.log(d2 / (r * r)));
    }
    return -(AH * a) / (12 * h);
  }
  function edl(er, a, psi, kappa, h) {
    return 2 * Math.PI * er * C.eps0 * a * psi * psi * Math.log(1 + Math.exp(-kappa * h));
  }
  NC.dlvo = { vdw: vdw, edl: edl };

  NC.register({
    id: 'dlvo',
    category: 'colloid',
    title: 'DLVO interaction energy',
    short: 'Van der Waals + double-layer energy between two particles; energy barrier',
    description:
      'Classical DLVO theory for two identical spheres in a 1:1 electrolyte. Van der Waals attraction (Hamaker) is added to electrostatic double-layer repulsion (Derjaguin approximation, constant low potential). The calculator gives the energy at a chosen separation, the full energy curve, the height of the energy barrier and any secondary minimum.',
    refs: ['derjaguin1941', 'verwey1948', 'hamaker1937', 'israelachvili2011', 'hunter1981', 'malmberg1956', 'codata2018'],
    inputs: [
      NC.num('D', 'Particle diameter D', 'nm', 20),
      NC.num('AH', 'Hamaker constant A_H', '×10⁻²⁰ J', 10, { help: 'System-specific: look up a value for your particle, medium and particle pair. Order of magnitude in water: metals ~10–40, oxides ~1–5, polymers ~0.3–1 (×10⁻²⁰ J).' }),
      NC.num('psi', 'Surface potential ψ₀ (zeta potential as proxy)', 'mV', -30),
      NC.num('I', 'Ionic strength (1:1 electrolyte)', 'mM', 1),
      NC.num('T', 'Temperature', '°C', 25),
      NC.sel('epsMode', 'Medium permittivity', [['water', 'Water (automatic, from T)'], ['custom', 'Custom']], 'water'),
      NC.num('er', 'Relative permittivity εᵣ', '', 78.5, { showIf: function (v) { return v.epsMode === 'custom'; } }),
      NC.sel('model', 'Van der Waals expression', [['derjaguin', 'Derjaguin (h ≪ a): −A_H·a/(12h)'], ['full', 'Full Hamaker sphere–sphere']], 'full'),
      NC.num('h', 'Evaluate at separation h', 'nm', 2)
    ],
    example: { D: 20, AH: 10, psi: -30, I: 1, T: 25, epsMode: 'water', model: 'full', h: 2 },
    compute: function (v) {
      const s = new NC.Steps();
      const D = NC.need(v.D, 'Particle diameter', { positive: true });
      const a = (D / 2) * 1e-9;
      const AH = NC.need(v.AH, 'Hamaker constant', { positive: true }) * 1e-20;
      const psi = NC.need(v.psi, 'Surface potential', { min: -300, max: 300 }) * 1e-3;
      const I = NC.need(v.I, 'Ionic strength', { positive: true }); // mM = mol/m³
      const hEval = NC.need(v.h, 'Separation', { positive: true });
      const med = mediumSteps(s, v, false);
      let er;
      if (v.epsMode === 'custom') er = NC.need(v.er, 'Relative permittivity', { positive: true });
      else {
        if (med.tC < 0 || med.tC > 100) NC.fail('The water permittivity correlation covers 0–100 °C. Enter a custom value instead.');
        er = NC.waterPermittivity(med.tC);
        s.add({ title: 'Relative permittivity of water', formula: 'εᵣ = 87.740 − 0.40008t + 9.398×10⁻⁴t² − 1.410×10⁻⁶t³   (t in °C)', sub: 't = ' + f(med.tC), result: 'εᵣ = ' + f(er), ref: 'malmberg1956' });
      }
      const kappa = Math.sqrt((2 * C.NA * C.e * C.e * I) / (er * C.eps0 * med.kT));
      s.add({
        title: 'Debye screening length (1:1 electrolyte)',
        formula: 'κ⁻¹ = √[εᵣε₀k_BT / (2N_A e² I)]   (I in mol/m³; 1 mM = 1 mol/m³)',
        tex: String.raw`\kappa^{-1} = \sqrt{\dfrac{\varepsilon_r\varepsilon_0 k_B T}{2N_A e^2 I}}\quad(1\ \text{mM} = 1\ \text{mol/m}^3)`,
        sub: 'κ⁻¹ = √[' + f(er) + ' × ' + f(C.eps0) + ' × ' + f(med.kT) + ' / (2 × ' + f(C.NA) + ' × ' + f(C.e) + '² × ' + f(I) + ')]',
        result: 'κ⁻¹ = ' + f(1e9 / kappa) + ' nm;   κa = ' + f(kappa * a),
        ref: 'israelachvili2011'
      });
      const h = hEval * 1e-9;
      const Vw = vdw(v.model, AH, a, h);
      if (v.model === 'full') {
        s.add({
          title: 'Van der Waals attraction (Hamaker, two equal spheres)',
          formula: 'V_vdW = −(A_H/6)·[2a²/(r² − 4a²) + 2a²/r² + ln((r² − 4a²)/r²)],   r = 2a + h',
          tex: String.raw`V_{\text{vdW}} = -\dfrac{A_H}{6}\left[\dfrac{2a^2}{r^2 - 4a^2} + \dfrac{2a^2}{r^2} + \ln\dfrac{r^2 - 4a^2}{r^2}\right],\quad r = 2a + h`,
          sub: 'a = ' + f(D / 2) + ' nm, h = ' + f(hEval) + ' nm, r = ' + f(D + hEval) + ' nm, A_H = ' + f(AH) + ' J',
          result: 'V_vdW = ' + f(Vw) + ' J = ' + f(Vw / med.kT) + ' k_BT',
          ref: ['hamaker1937', 'israelachvili2011']
        });
      } else {
        s.add({
          title: 'Van der Waals attraction (Derjaguin approximation, h ≪ a)',
          formula: 'V_vdW = −A_H·a / (12h)',
          tex: String.raw`V_{\text{vdW}} = -\dfrac{A_H\,a}{12h}`,
          sub: 'V_vdW = −' + f(AH) + ' × ' + f(a) + ' / (12 × ' + f(h) + ')',
          result: 'V_vdW = ' + f(Vw) + ' J = ' + f(Vw / med.kT) + ' k_BT',
          ref: ['hamaker1937', 'israelachvili2011']
        });
      }
      const Ve = edl(er, a, psi, kappa, h);
      s.add({
        title: 'Electrostatic double-layer repulsion (constant potential, low potential, Derjaguin)',
        formula: 'V_EDL = 2π·εᵣε₀·a·ψ₀²·ln(1 + e^(−κh))',
        tex: String.raw`V_{\text{EDL}} = 2\pi\varepsilon_r\varepsilon_0\,a\,\psi_0^2\,\ln\!\left(1 + e^{-\kappa h}\right)`,
        sub: 'V_EDL = 2π × ' + f(er) + ' × ' + f(C.eps0) + ' × ' + f(a) + ' × (' + f(psi) + ')² × ln(1 + e^(−' + f(kappa * h) + '))',
        result: 'V_EDL = ' + f(Ve) + ' J = ' + f(Ve / med.kT) + ' k_BT',
        note: 'Assumes identical spheres, |ψ₀| below about 25–50 mV, κa ≳ 5 and h ≪ a.',
        ref: ['derjaguin1941', 'verwey1948']
      });
      const Vt = Vw + Ve;
      s.add({ title: 'Total DLVO energy at h = ' + f(hEval) + ' nm', formula: 'V_T = V_vdW + V_EDL', tex: String.raw`V_T = V_{\text{vdW}} + V_{\text{EDL}}`, sub: 'V_T = ' + f(Vw / med.kT) + ' + ' + f(Ve / med.kT) + ' k_BT', result: 'V_T = ' + f(Vt / med.kT) + ' k_BT' });

      // energy curve
      const hmax = Math.min(200, Math.max(30, (8 / kappa) * 1e9));
      const H = [], VT = [], VW = [], VE = [];
      for (let i = 0; i < 500; i++) {
        const hi = 0.1 * Math.pow(hmax / 0.1, i / 499);
        const w = vdw(v.model, AH, a, hi * 1e-9) / med.kT, e = edl(er, a, psi, kappa, hi * 1e-9) / med.kT;
        H.push(hi); VW.push(w); VE.push(e); VT.push(w + e);
      }
      let ib = -1;
      for (let i = 1; i < VT.length - 1; i++) if (VT[i] >= VT[i - 1] && VT[i] >= VT[i + 1] && (ib < 0 || VT[i] > VT[ib])) ib = i;
      let barrier = NaN, hb = NaN, sec = NaN, hs = NaN;
      if (ib > 0 && VT[ib] > 0) {
        barrier = VT[ib]; hb = H[ib];
        let im = -1;
        for (let i = ib + 1; i < VT.length - 1; i++) if (VT[i] <= VT[i - 1] && VT[i] <= VT[i + 1] && VT[i] < 0 && (im < 0 || VT[i] < VT[im])) im = i;
        if (im > 0) { sec = VT[im]; hs = H[im]; }
      }
      s.add({
        title: 'Energy barrier and secondary minimum (from the curve, h = 0.1–' + f(hmax, 3) + ' nm)',
        formula: 'Barrier: highest local maximum of V_T(h);  secondary minimum: deepest local minimum beyond it',
        result: isFinite(barrier)
          ? 'Barrier = ' + f(barrier) + ' k_BT at h = ' + f(hb) + ' nm' + (isFinite(sec) ? ';   secondary minimum = ' + f(sec) + ' k_BT at h = ' + f(hs) + ' nm' : ';   no secondary minimum in range')
          : 'No energy barrier: the particles attract at all separations, so aggregation is expected (fast coagulation)'
      });

      const warnings = [];
      if (kappa * a < 5) warnings.push('κa = ' + f(kappa * a) + ' is below ~5, so the Derjaguin double-layer expression is only approximate.');
      if (Math.abs(psi) > 0.05) warnings.push('|ψ₀| > 50 mV: the low-potential expression overestimates the repulsion at large potentials.');
      if (v.model !== 'full' && h > a / 2) warnings.push('h is not much smaller than a: use the full Hamaker expression.');
      if (isFinite(barrier) && barrier < 15) warnings.push('The barrier is below ~15 k_BT. As a rule of thumb, such dispersions are often considered only weakly stabilized.');

      const ymax = isFinite(barrier) ? Math.max(5, barrier * 1.35) : Math.max(5, Math.max.apply(null, VE) * 1.2);
      const ymin = -Math.max(10, Math.min(100, isFinite(sec) ? Math.abs(sec) * 3 + 5 : 20, isFinite(barrier) ? barrier * 1.5 : 30));
      const clip = function (arr) { return H.map(function (hh, i) { return [hh, Math.max(ymin * 1.6, Math.min(ymax * 1.6, arr[i]))]; }); };
      const markers = [];
      if (isFinite(barrier)) markers.push([hb, barrier]);
      if (isFinite(sec)) markers.push([hs, sec]);
      return {
        results: [
          { label: 'Total energy at h', value: Vt / med.kT, unit: 'k_BT', main: true },
          { label: 'Energy barrier', value: isFinite(barrier) ? barrier : 'none', unit: isFinite(barrier) ? 'k_BT' : '', main: true },
          { label: 'Barrier position', value: isFinite(hb) ? hb : 'none', unit: isFinite(hb) ? 'nm' : '' },
          { label: 'Secondary minimum', value: isFinite(sec) ? sec : 'none', unit: isFinite(sec) ? 'k_BT' : '' },
          { label: 'Debye length κ⁻¹', value: 1e9 / kappa, unit: 'nm', main: true },
          { label: 'κa', value: kappa * a }
        ],
        steps: s.items,
        warnings: warnings,
        plots: [{
          title: 'DLVO interaction energy', xlabel: 'Surface separation h (nm)', ylabel: 'V / k_BT', xmin: 0, xmax: hmax, ymin: ymin, ymax: ymax,
          series: [
            { name: 'Total', mode: 'line', points: clip(VT) },
            { name: 'Van der Waals', mode: 'line', dashed: true, color: 2, points: clip(VW) },
            { name: 'Double layer', mode: 'line', dashed: true, color: 3, points: clip(VE) },
            { name: 'Barrier / secondary min.', mode: 'markers', color: 1, size: 5, points: markers }
          ]
        }],
        notes: [
          'The zeta potential is used in place of the surface (Stern) potential. This usually underestimates the true surface potential.',
          'The Hamaker constant is system-specific and is the largest source of uncertainty; report the value and its source.',
          'Non-DLVO forces (steric, hydration, depletion, magnetic) are not included. Polymer- or ligand-coated particles may be stable without an electrostatic barrier.'
        ]
      };
    }
  });

  /* ================================================================== */
  /* Sedimentation and centrifugation                                    */
  /* ================================================================== */
  NC.register({
    id: 'sediment',
    category: 'colloid',
    title: 'Sedimentation & centrifugation',
    short: 'Stokes settling velocity, settling time, Péclet number, time to pellet',
    description:
      'How fast particles settle under gravity or in a centrifuge, compared with how fast they diffuse. Uses Stokes drag on a sphere (volume-equivalent diameter) and the Stokes–Einstein diffusion coefficient. Useful for in vitro dosimetry, storage stability and purification by centrifugation.',
    refs: ['stokes1851', 'einstein1905', 'teeguarden2007', 'huber2009', 'crc', 'codata2018'],
    inputs: [
      NC.sel('mat', 'Particle material', matOpts, 'Au'),
      NC.num('rho', 'Particle density ρ_p', 'g/cm³', 19.32, { showIf: custom('mat') }),
      NC.num('D', 'Particle diameter (volume-equivalent) d', 'nm', 100),
      NC.num('rhof', 'Fluid density ρ_f', 'g/cm³', 0.997, { help: 'Water: 0.997 g/cm³ at 25 °C, 0.998 at 20 °C.' })
    ].concat(tempInputs, [
      NC.num('H', 'Settling height H (liquid column / tube path)', 'mm', 10),
      NC.num('rcf', 'Centrifuge RCF', '× g', 10000)
    ]),
    example: { mat: 'Au', D: 100, rhof: 0.997, T: 25, visc: 'water', H: 10, rcf: 10000 },
    compute: function (v) {
      const s = new NC.Steps();
      const m = material(v, 'mat', 'rho', null);
      const d = NC.need(v.D, 'Particle diameter', { positive: true });
      const rhof = NC.need(v.rhof, 'Fluid density', { positive: true });
      const H = NC.need(v.H, 'Settling height', { positive: true }) * 1e-3;
      const rcf = NC.need(v.rcf, 'RCF', { positive: true });
      const med = mediumSteps(s, v, true);
      const r = (d / 2) * 1e-9;
      const drho = (m.rho - rhof) * 1000; // kg/m³
      const vs = (2 * drho * G0 * r * r) / (9 * med.eta);
      const vabs = Math.abs(vs);
      s.add({
        title: 'Stokes settling velocity (gravity)',
        formula: 'v = 2(ρ_p − ρ_f)·g·r² / (9η)',
        tex: String.raw`v = \dfrac{2(\rho_p - \rho_f)\,g\,r^2}{9\eta}`,
        sub: 'v = 2 × (' + f(m.rho * 1000) + ' − ' + f(rhof * 1000) + ') kg/m³ × 9.80665 m/s² × (' + f(r) + ' m)² / (9 × ' + f(med.eta) + ' Pa·s)',
        result: 'v = ' + f(vs) + ' m/s = ' + f(vs * 1e9) + ' nm/s = ' + f(vs * 3.6e6) + ' mm/h',
        note: 'Valid for low Reynolds number and a dilute dispersion of non-interacting spheres; Brownian motion is treated separately below.' + (drho < 0 ? ' The particles are less dense than the fluid, so they rise (cream).' : ''),
        ref: 'stokes1851'
      });
      const sCoef = vs / G0;
      s.add({ title: 'Sedimentation coefficient', formula: 's = v / g   (1 S = 10⁻¹³ s)', tex: String.raw`s = \dfrac{v}{g}\quad(1\ \text{S} = 10^{-13}\ \text{s})`, sub: 's = ' + f(vs) + ' / 9.80665', result: 's = ' + f(sCoef) + ' s = ' + f(sCoef / 1e-13) + ' S' });
      const tSet = drho === 0 ? Infinity : H / vabs;
      s.add({ title: 'Time to settle through H by gravity', formula: 't_sed = H / v', tex: String.raw`t_{\text{sed}} = \dfrac{H}{v}`, sub: 't_sed = ' + f(H) + ' m / ' + f(vabs) + ' m/s', result: 't_sed = ' + f(tSet) + ' s = ' + fmtTime(tSet) });
      const Dt = med.kT / (3 * Math.PI * med.eta * 2 * r);
      s.add({ title: 'Diffusion coefficient (Stokes–Einstein)', formula: 'D = k_BT / (3πη·d)', tex: String.raw`D = \dfrac{k_B T}{3\pi\eta\,d}`, sub: 'D = ' + f(med.kT) + ' / (3π × ' + f(med.eta) + ' × ' + f(2 * r) + ')', result: 'D = ' + f(Dt) + ' m²/s = ' + f(Dt * 1e12) + ' µm²/s', ref: 'einstein1905' });
      const tDiff = (H * H) / (2 * Dt);
      s.add({ title: 'Time to diffuse a distance H (1D)', formula: 't_diff = H² / (2D)', tex: String.raw`t_{\text{diff}} = \dfrac{H^2}{2D}`, sub: 't_diff = (' + f(H) + ')² / (2 × ' + f(Dt) + ')', result: 't_diff = ' + fmtTime(tDiff) });
      const Pe = (vabs * H) / Dt;
      s.add({
        title: 'Péclet number (settling vs. diffusion over H)',
        formula: 'Pe = v·H / D',
        tex: String.raw`\mathrm{Pe} = \dfrac{v\,H}{D}`,
        sub: 'Pe = ' + f(vabs) + ' × ' + f(H) + ' / ' + f(Dt),
        result: 'Pe = ' + f(Pe) + (Pe > 1 ? '  ⇒  settling dominates' : '  ⇒  diffusion dominates'),
        note: 'In in vitro assays the dose reaching cells depends on both transport routes (particokinetics).',
        ref: 'teeguarden2007'
      });
      const vc = vabs * rcf, tPel = drho === 0 ? Infinity : H / vc;
      s.add({ title: 'Centrifugation at ' + f(rcf) + ' × g', formula: 'v_c = v·RCF,   t_pellet ≈ H / v_c', tex: String.raw`v_c = v\cdot\text{RCF},\quad t_{\text{pellet}} \approx \dfrac{H}{v_c}`, sub: 'v_c = ' + f(vabs) + ' × ' + f(rcf) + ' = ' + f(vc) + ' m/s', result: 't_pellet ≈ ' + fmtTime(tPel), note: 'Treats RCF as constant along the tube; in a rotor it grows with radius, so this is an upper-bound estimate for the given RCF at the top of the liquid.' });
      return {
        results: [
          { label: 'Settling velocity', value: vs * 1e9, unit: 'nm/s', main: true },
          { label: 'Settling time over H', value: fmtTime(tSet), main: true },
          { label: 'Péclet number', value: Pe, main: true },
          { label: 'Time to pellet (centrifuge)', value: fmtTime(tPel), main: true },
          { label: 'Diffusion coefficient', value: Dt * 1e12, unit: 'µm²/s' },
          { label: 'Diffusion time over H', value: fmtTime(tDiff) },
          { label: 'Sedimentation coefficient', value: sCoef / 1e-13, unit: 'S' }
        ],
        steps: s.items,
        warnings: d > 5000 ? ['Above a few µm, check that the Reynolds number is still ≪ 1.'] : [],
        notes: ['Aggregation increases the effective size and speeds settling dramatically (v ∝ d²). Measured hydrodynamic sizes include ligand shells, which lower the effective density.']
      };
    }
  });

  /* ================================================================== */
  /* Seed-mediated growth                                                */
  /* ================================================================== */
  const SHAPE_FALLBACK = [['sphere', 'Sphere'], ['cube', 'Cube'], ['octahedron', 'Octahedron'], ['tetrahedron', 'Tetrahedron'], ['decahedron', 'Decahedron'], ['icosahedron', 'Icosahedron'], ['cuboctahedron', 'Cuboctahedron'], ['truncoct', 'Truncated octahedron'], ['rod', 'Rod'], ['cylinder', 'Cylinder'], ['spheroid', 'Spheroid'], ['prism', 'Triangular nanoplate']];
  // Only shapes whose dimensions dimsFor() knows how to build (others, e.g. multi-parameter shapes, are excluded).
  const shapeOpts = SHAPE_FALLBACK
    .filter(function (o) { return !NC.shapes || NC.shapes[o[0]]; })
    .map(function (o) { return NC.shapes ? [o[0], NC.shapes[o[0]].label] : o; });
  const AR_SHAPES = ['rod', 'cylinder', 'spheroid', 'prism'];
  function dimsFor(key, size, ar) {
    if (key === 'rod' || key === 'cylinder' || key === 'spheroid') return { D: size, L: size * ar };
    if (key === 'prism') return { a: size, h: size / ar };
    if (key === 'sphere') return { D: size };
    return { a: size };
  }
  function shapeOf(key) {
    if (!NC.shapes) NC.fail('Shape data are not loaded (nanoparticle.js must load before this calculator).');
    const sh = NC.shapes[key];
    if (!sh || !SHAPE_FALLBACK.some(function (o) { return o[0] === key; })) NC.fail('Choose one of the listed seed shapes.');
    return sh;
  }

  NC.register({
    id: 'seedgrowth',
    category: 'lab',
    title: 'Seed-mediated growth',
    short: 'Final particle size from precursor added to seeds, or precursor needed for a target size',
    description:
      'In seeded growth the number of particles stays fixed while new material deposits on the seeds, so the particle volume grows in proportion to the mass added. Works for any seed shape (shape kept during growth), with a reduction yield and a multi-step growth table.',
    refs: ['jana2001', 'bastus2011', 'thanh2014', 'crc', 'ciaaw2021', 'codata2018'],
    inputs: [
      NC.sel('mat', 'Metal (or material) deposited', metalOpts, 'Au'),
      NC.num('rho', 'Density ρ', 'g/cm³', 19.32, { showIf: custom('mat') }),
      NC.num('M', 'Molar mass M', 'g/mol', 196.967, { showIf: custom('mat') }),
      NC.sel('shape', 'Seed shape (kept during growth)', shapeOpts, 'sphere'),
      NC.num('ds', 'Seed size (diameter D, or edge a for polyhedra)', 'nm', 12),
      NC.num('ar', 'Aspect ratio (L/D for rods, cylinders, spheroids; a/h for plates)', '', 3, { showIf: function (v) { return AR_SHAPES.indexOf(v.shape) >= 0; } }),
      NC.sel('seedMode', 'Number of seeds from', [['mass', 'Metal concentration of the seed solution (all reduced into seeds)'], ['conc', 'Particle concentration of the seed solution']], 'mass'),
      NC.num('seedC', 'Metal concentration of seed solution', 'mM', 0.25, { showIf: function (v) { return v.seedMode === 'mass'; } }),
      NC.num('seedN', 'Seed particle concentration', 'particles/mL', 1e12, { showIf: function (v) { return v.seedMode === 'conc'; } }),
      NC.num('Vseed', 'Volume of seed solution used', 'mL', 1),
      NC.sel('mode', 'Calculate', [['forward', 'Final size from precursor added'], ['target', 'Precursor needed for a target size']], 'forward'),
      NC.num('nadd', 'Precursor added per step', 'µmol', 0.25, { showIf: function (v) { return v.mode === 'forward'; } }),
      NC.num('steps', 'Number of growth steps', '', 3, { showIf: function (v) { return v.mode === 'forward'; } }),
      NC.num('dt', 'Target size', 'nm', 30, { showIf: function (v) { return v.mode === 'target'; } }),
      NC.num('yieldPct', 'Fraction of added precursor that deposits on seeds', '%', 100)
    ],
    example: { mat: 'Au', shape: 'sphere', ds: 12, seedMode: 'mass', seedC: 0.25, Vseed: 1, mode: 'forward', nadd: 0.25, steps: 3, yieldPct: 100 },
    compute: function (v) {
      const s = new NC.Steps();
      const m = material(v, 'mat', 'rho', 'M');
      const sh = shapeOf(v.shape);
      const ds = NC.need(v.ds, 'Seed size', { positive: true });
      const ar = AR_SHAPES.indexOf(v.shape) >= 0 ? NC.need(v.ar, 'Aspect ratio', { positive: true }) : 1;
      if (v.shape === 'rod' && ar < 1) NC.fail('For a rod the aspect ratio L/D must be at least 1.');
      const Vseed = NC.need(v.Vseed, 'Seed solution volume', { positive: true });
      const Y = NC.need(v.yieldPct, 'Deposition fraction', { positive: true, max: 100 }) / 100;
      const dSeed = dimsFor(v.shape, ds, ar);
      const Vs = sh.V(dSeed);
      s.add({ title: 'Volume of one seed (' + sh.label + ')', formula: sh.Vf, tex: sh.Vt ? 'V = ' + sh.Vt : undefined, sub: sh.sub(dSeed)[0], result: 'V_seed = ' + f(Vs) + ' nm³' });
      const ms = m.rho * Vs * 1e-21;
      s.add({ title: 'Mass of one seed', formula: 'm_seed = ρ·V_seed', tex: String.raw`m_{\text{seed}} = \rho\,V_{\text{seed}}`, sub: 'm_seed = ' + f(m.rho) + ' g/cm³ × ' + f(Vs) + ' × 10⁻²¹ cm³', result: 'm_seed = ' + f(ms) + ' g', ref: 'crc' });
      let N, mSeedTot;
      if (v.seedMode === 'conc') {
        const cN = NC.need(v.seedN, 'Seed particle concentration', { positive: true });
        N = cN * Vseed;
        mSeedTot = N * ms;
        s.add({ title: 'Number of seeds', formula: 'N = c_seed · V', tex: String.raw`N = c_{\text{seed}}\,V`, sub: 'N = ' + f(cN) + ' mL⁻¹ × ' + f(Vseed) + ' mL', result: 'N = ' + f(N) + ';   total seed mass = ' + f(mSeedTot) + ' g' });
      } else {
        const cM = NC.need(v.seedC, 'Seed metal concentration', { positive: true });
        const nSeed = cM * 1e-3 * Vseed * 1e-3;
        mSeedTot = nSeed * m.M;
        N = mSeedTot / ms;
        s.add({ title: 'Metal in the seed solution', formula: 'n = C·V,   m = n·M', tex: String.raw`n = C\,V,\quad m = n\,M`, sub: 'n = ' + f(cM) + ' mM × ' + f(Vseed) + ' mL = ' + f(nSeed) + ' mol', result: 'm_seeds = ' + f(mSeedTot) + ' g', ref: 'ciaaw2021' });
        s.add({ title: 'Number of seeds', formula: 'N = m_seeds / m_seed', tex: String.raw`N = \dfrac{m_{\text{seeds}}}{m_{\text{seed}}}`, sub: 'N = ' + f(mSeedTot) + ' / ' + f(ms), result: 'N = ' + f(N), note: 'Assumes all metal in the seed solution is in the seeds.' });
      }
      s.add({
        title: 'Growth law (particle number conserved)',
        formula: 'V_f / V_s = 1 + m_added / m_seeds   ⇒   d_f = d_s·(1 + m_added/m_seeds)^(1/3)',
        tex: String.raw`\dfrac{V_f}{V_s} = 1 + \dfrac{m_{\text{added}}}{m_{\text{seeds}}} \;\Rightarrow\; d_f = d_s\left(1 + \dfrac{m_{\text{added}}}{m_{\text{seeds}}}\right)^{1/3}`,
        note: 'Assumes no secondary nucleation, no Ostwald ripening and growth that keeps the seed shape.',
        ref: ['jana2001', 'bastus2011']
      });
      const sizeFor = function (mAdd) { return ds * Math.cbrt(1 + mAdd / mSeedTot); };
      let results, tables = [], curveMax, marker;
      if (v.mode === 'target') {
        const dt = NC.need(v.dt, 'Target size', { positive: true });
        if (dt <= ds) NC.fail('The target size must be larger than the seed size.');
        const k3 = Math.pow(dt / ds, 3);
        const mAdd = mSeedTot * (k3 - 1);
        const nDep = mAdd / m.M, nReq = nDep / Y;
        s.add({ title: 'Mass that must deposit', formula: 'm_added = m_seeds·[(d_t/d_s)³ − 1]', tex: String.raw`m_{\text{added}} = m_{\text{seeds}}\left[\left(\dfrac{d_t}{d_s}\right)^3 - 1\right]`, sub: 'm_added = ' + f(mSeedTot) + ' × [(' + f(dt) + '/' + f(ds) + ')³ − 1] = ' + f(mSeedTot) + ' × ' + f(k3 - 1), result: 'm_added = ' + f(mAdd) + ' g' });
        s.add({ title: 'Precursor to add', formula: 'n = m_added / (M · Y)', tex: String.raw`n = \dfrac{m_{\text{added}}}{M\,Y}`, sub: 'n = ' + f(mAdd) + ' / (' + f(m.M) + ' × ' + f(Y) + ')', result: 'n = ' + f(nReq * 1e6) + ' µmol' });
        results = [
          { label: 'Precursor needed', value: nReq * 1e6, unit: 'µmol', main: true },
          { label: 'Volume growth factor', value: k3, main: true },
          { label: 'Number of seeds', value: N },
          { label: 'Mass deposited', value: mAdd * 1e3, unit: 'mg' }
        ];
        curveMax = nReq * 1.5; marker = [nReq * 1e6, dt];
      } else {
        const nadd = NC.need(v.nadd, 'Precursor per step', { positive: true }) * 1e-6;
        const k = NC.need(v.steps, 'Number of steps', { int: true, min: 1, max: 50 });
        const rows = [];
        let mCum = 0, dPrev = ds;
        for (let i = 1; i <= k; i++) {
          mCum += nadd * Y * m.M;
          const di = sizeFor(mCum);
          rows.push([String(i), f(nadd * 1e6 * i), f(mCum * 1e3), f(di), f(Math.pow(di / dPrev, 3))]);
          dPrev = di;
        }
        const mTot = k * nadd * Y * m.M;
        const df = sizeFor(mTot);
        s.add({ title: 'Mass deposited after ' + k + ' step' + (k > 1 ? 's' : ''), formula: 'm_added = k · n_step · Y · M', tex: String.raw`m_{\text{added}} = k\,n_{\text{step}}\,Y\,M`, sub: 'm_added = ' + k + ' × ' + f(nadd) + ' mol × ' + f(Y) + ' × ' + f(m.M) + ' g/mol', result: 'm_added = ' + f(mTot) + ' g' });
        s.add({ title: 'Final size', formula: 'd_f = d_s·(1 + m_added/m_seeds)^(1/3)', tex: String.raw`d_f = d_s\left(1 + \dfrac{m_{\text{added}}}{m_{\text{seeds}}}\right)^{1/3}`, sub: 'd_f = ' + f(ds) + ' × (1 + ' + f(mTot) + ' / ' + f(mSeedTot) + ')^(1/3)', result: 'd_f = ' + f(df) + ' nm' });
        tables.push({ title: 'Growth steps', columns: ['Step', 'Cumulative precursor (µmol)', 'Cumulative deposited (mg)', 'Size (nm)', 'Volume ratio vs. previous'], rows: rows });
        results = [
          { label: 'Final size', value: df, unit: 'nm', main: true },
          { label: 'Volume growth factor', value: 1 + mTot / mSeedTot, main: true },
          { label: 'Number of seeds', value: N },
          { label: 'Mass deposited', value: mTot * 1e3, unit: 'mg' }
        ];
        curveMax = k * nadd * 1.5; marker = [k * nadd * 1e6, df];
      }
      const curve = [];
      for (let i = 0; i <= 100; i++) {
        const n = (curveMax * i) / 100;
        curve.push([n * 1e6, sizeFor(n * Y * m.M)]);
      }
      return {
        results: results,
        steps: s.items,
        tables: tables,
        plots: [{ title: 'Size versus precursor added', xlabel: 'Precursor added (µmol)', ylabel: 'Particle size (nm)', series: [{ name: 'Seeded growth', mode: 'line', points: curve }, { name: 'This calculation', mode: 'markers', color: 1, size: 5, points: [marker] }] }],
        notes: ['Secondary nucleation (new small particles) and incomplete reduction reduce the growth; check by TEM and by ICP of the supernatant.', 'Size = diameter for spheres, rods, cylinders and spheroids, and edge length for polyhedra and plates; aspect ratio is held fixed.']
      };
    }
  });

  /* ================================================================== */
  /* Yield and conversion                                                */
  /* ================================================================== */
  NC.register({
    id: 'yield',
    category: 'lab',
    title: 'Synthesis yield & conversion',
    short: 'Theoretical mass from the limiting precursor, % yield, % conversion from ICP',
    description:
      'Mass balance for a nanoparticle synthesis: the theoretical product mass from the limiting precursor and stoichiometry, the isolated yield, and optionally the conversion of the precursor element from ICP of the supernatant.',
    refs: ['iupacGreen', 'ciaaw2021'],
    inputs: [
      NC.num('n', 'Limiting precursor amount', 'mmol', 0.1),
      NC.num('nu', 'Product formula units per precursor', 'mol/mol', 1, { help: 'e.g. 1 for HAuCl₄ → Au, 1/3 for 3 Fe²⁺/Fe³⁺ → Fe₃O₄ (per Fe), 1 for Cd(OAc)₂ → CdSe.' }),
      NC.sel('mat', 'Product', matOpts, 'Au'),
      NC.num('M', 'Product molar mass', 'g/mol', 196.967, { showIf: custom('mat') }),
      NC.num('mact', 'Isolated product mass', 'mg', 17.5),
      NC.num('C0', 'Element concentration at start (optional)', 'mg/L', NaN, { help: 'Leave blank to skip. Same element and volume as the supernatant value below.' }),
      NC.num('Csup', 'Element concentration in supernatant (optional, ICP)', 'mg/L', NaN)
    ],
    example: { n: 0.1, nu: 1, mat: 'Au', mact: 17.5, C0: 197, Csup: 9.8 },
    compute: function (v) {
      const s = new NC.Steps();
      const n = NC.need(v.n, 'Precursor amount', { positive: true });
      const nu = NC.need(v.nu, 'Stoichiometric ratio', { positive: true });
      const m = material(v, 'mat', null, 'M');
      const mact = NC.need(v.mact, 'Isolated mass', { nonneg: true });
      const mTh = n * nu * m.M; // mmol·g/mol = mg
      s.add({ title: 'Theoretical product mass', formula: 'm_th = n_precursor · ν · M_product', tex: String.raw`m_{\text{th}} = n_{\text{precursor}}\,\nu\,M_{\text{product}}`, sub: 'm_th = ' + f(n) + ' mmol × ' + f(nu) + ' × ' + f(m.M) + ' g/mol', result: 'm_th = ' + f(mTh) + ' mg', ref: ['iupacGreen', 'ciaaw2021'] });
      const Yp = (100 * mact) / mTh;
      s.add({ title: 'Isolated yield', formula: 'Yield = m_isolated / m_th × 100 %', tex: String.raw`\text{Yield} = \dfrac{m_{\text{isolated}}}{m_{\text{th}}}\times 100\,\%`, sub: 'Yield = ' + f(mact) + ' / ' + f(mTh) + ' × 100 %', result: 'Yield = ' + f(Yp) + ' %' });
      const results = [{ label: 'Theoretical mass', value: mTh, unit: 'mg', main: true }, { label: 'Yield', value: Yp, unit: '%', main: true }];
      const warnings = [];
      if (Yp > 100) warnings.push('Yield above 100 %: the product probably still contains ligands, salts or solvent. Check by TGA or elemental analysis.');
      const C0 = NC.opt(v.C0, 'Starting concentration', { positive: true });
      const Cs = NC.opt(v.Csup, 'Supernatant concentration', { nonneg: true });
      if (C0 !== null && Cs !== null) {
        const conv = 100 * (1 - Cs / C0);
        s.add({ title: 'Conversion of the precursor element (ICP of supernatant)', formula: 'X = 1 − C_supernatant / C_0', tex: String.raw`X = 1 - \dfrac{C_{\text{supernatant}}}{C_0}`, sub: 'X = 1 − ' + f(Cs) + ' / ' + f(C0), result: 'X = ' + f(conv) + ' %', note: 'Assumes the supernatant volume equals the reaction volume and that particles were fully removed before analysis.' });
        results.push({ label: 'Conversion', value: conv, unit: '%', main: true });
        if (Cs > C0) warnings.push('The supernatant concentration exceeds the starting concentration: check units, dilution factors or volumes.');
      }
      return { results: results, steps: s.items, warnings: warnings };
    }
  });

  /* ================================================================== */
  /* Classical nucleation                                                */
  /* ================================================================== */
  function cnt(gamma, vmol, kT, S) {
    const L = kT * Math.log(S);
    return { r: (2 * gamma * vmol) / L, dG: (16 * Math.PI * Math.pow(gamma, 3) * vmol * vmol) / (3 * L * L) };
  }
  NC.register({
    id: 'nucleation',
    category: 'lab',
    title: 'Classical nucleation (critical nucleus)',
    short: 'Critical radius, nucleation barrier and nucleus size versus supersaturation',
    description:
      'Classical nucleation theory for a spherical nucleus: the critical radius r*, the free-energy barrier ΔG* and the number of formula units in the critical nucleus, as functions of supersaturation S. This is the quantitative basis of the LaMer burst-nucleation picture.',
    refs: ['thanh2014', 'lamer1950', 'crc', 'codata2018'],
    inputs: [
      NC.sel('mat', 'Material', matOpts, 'Au'),
      NC.num('rho', 'Density ρ', 'g/cm³', 19.32, { showIf: custom('mat') }),
      NC.num('M', 'Molar mass M', 'g/mol', 196.967, { showIf: custom('mat') }),
      NC.num('gamma', 'Surface (interfacial) energy γ', 'J/m²', 0.3, { help: 'Illustrative default. The solid–solution interfacial energy is uncertain and system-specific; enter a literature value for your system.' }),
      NC.num('T', 'Temperature', '°C', 25),
      NC.num('S', 'Supersaturation S = C/C_eq', '', 10)
    ],
    example: { mat: 'Au', gamma: 0.3, T: 25, S: 10 },
    compute: function (v) {
      const s = new NC.Steps();
      const m = material(v, 'mat', 'rho', 'M');
      const gamma = NC.need(v.gamma, 'Interfacial energy', { positive: true });
      const S = NC.need(v.S, 'Supersaturation', { gt: 1 });
      const tC = NC.need(v.T, 'Temperature', { min: -50, max: 1500 });
      const TK = tC + 273.15, kT = C.kB * TK;
      const vmol = (m.M / m.rho) * 1e-6 / C.NA; // m³ per formula unit
      s.add({ title: 'Volume of one formula unit', formula: 'v = M / (ρ·N_A)', tex: String.raw`v = \dfrac{M}{\rho\,N_A}`, sub: 'v = ' + f(m.M) + ' / (' + f(m.rho) + ' × ' + f(C.NA) + ') cm³', result: 'v = ' + f(vmol) + ' m³ = ' + f(vmol * 1e27) + ' nm³', ref: ['crc', 'codata2018'] });
      s.add({ title: 'Driving force per formula unit', formula: 'Δμ = k_BT·ln S', tex: String.raw`\Delta\mu = k_B T\ln S`, sub: 'Δμ = ' + f(kT) + ' J × ln ' + f(S), result: 'Δμ = ' + f(kT * Math.log(S)) + ' J = ' + f(Math.log(S)) + ' k_BT' });
      const c = cnt(gamma, vmol, kT, S);
      s.add({ title: 'Critical radius', formula: 'r* = 2γv / (k_BT·ln S)', tex: String.raw`r^{*} = \dfrac{2\gamma v}{k_B T\ln S}`, sub: 'r* = 2 × ' + f(gamma) + ' × ' + f(vmol) + ' / ' + f(kT * Math.log(S)), result: 'r* = ' + f(c.r * 1e9) + ' nm', ref: 'thanh2014' });
      s.add({ title: 'Nucleation barrier', formula: 'ΔG* = 16πγ³v² / [3(k_BT·ln S)²]', tex: String.raw`\Delta G^{*} = \dfrac{16\pi\gamma^3 v^2}{3\,(k_B T\ln S)^2}`, sub: 'ΔG* = 16π × ' + f(gamma) + '³ × (' + f(vmol) + ')² / [3 × (' + f(kT * Math.log(S)) + ')²]', result: 'ΔG* = ' + f(c.dG) + ' J = ' + f(c.dG / kT) + ' k_BT', ref: 'thanh2014' });
      const nStar = ((4 / 3) * Math.PI * Math.pow(c.r, 3)) / vmol;
      s.add({ title: 'Formula units in the critical nucleus', formula: 'n* = (4/3)π·r*³ / v', tex: String.raw`n^{*} = \dfrac{\tfrac{4}{3}\pi r^{*3}}{v}`, sub: 'n* = (4/3)π × (' + f(c.r) + ')³ / ' + f(vmol), result: 'n* = ' + f(nStar) });
      const rC = [], gC = [];
      const Smax = Math.max(50, S * 3);
      for (let i = 0; i <= 200; i++) {
        const Si = 1.2 * Math.pow(Smax / 1.2, i / 200);
        const ci = cnt(gamma, vmol, kT, Si);
        rC.push([Si, ci.r * 1e9]);
        gC.push([Si, ci.dG / kT]);
      }
      const gCap = Math.max(100, (c.dG / kT) * 3);
      return {
        results: [
          { label: 'Critical radius r*', value: c.r * 1e9, unit: 'nm', main: true },
          { label: 'Nucleation barrier ΔG*', value: c.dG / kT, unit: 'k_BT', main: true },
          { label: 'Units in critical nucleus', value: nStar, main: true },
          { label: 'Barrier in J', value: c.dG, unit: 'J' }
        ],
        steps: s.items,
        warnings: nStar < 10 ? ['The critical nucleus contains fewer than ~10 units; continuum CNT is not quantitative at this size.'] : [],
        plots: [
          { title: 'Critical radius versus supersaturation', xlabel: 'Supersaturation S', ylabel: 'r* (nm)', ymin: 0, ymax: Math.min(rC[0][1], Math.max(c.r * 1e9 * 4, 2)), series: [{ name: 'r*', mode: 'line', points: rC }, { name: 'This S', mode: 'markers', color: 1, size: 5, points: [[S, c.r * 1e9]] }] },
          { title: 'Nucleation barrier versus supersaturation', xlabel: 'Supersaturation S', ylabel: 'ΔG* / k_BT', ymin: 0, ymax: gCap, series: [{ name: 'ΔG*', mode: 'line', points: gC.map(function (p) { return [p[0], Math.min(p[1], gCap * 1.5)]; }) }, { name: 'This S', mode: 'markers', color: 1, size: 5, points: [[S, c.dG / kT]] }] }
        ],
        notes: [
          'In the LaMer picture, burst nucleation happens once S is high enough that ΔG* falls to a few tens of k_BT; nucleation then lowers S and growth takes over.',
          'Results scale as γ³ and are therefore very sensitive to the interfacial energy, which is rarely known accurately.'
        ]
      };
    }
  });

  /* ================================================================== */
  /* Ostwald ripening (LSW)                                              */
  /* ================================================================== */
  NC.register({
    id: 'ripening',
    category: 'lab',
    title: 'Ostwald ripening (LSW)',
    short: 'Mean radius versus time, r³ − r₀³ = K·t; rate constant from data or parameters',
    description:
      'Lifshitz–Slyozov–Wagner theory of diffusion-limited Ostwald ripening: the cube of the mean radius grows linearly in time. Get the rate constant K from two size measurements, or from physical parameters, then predict the mean size at any time.',
    refs: ['lifshitz1961', 'wagner1961', 'thanh2014', 'crc', 'codata2018'],
    inputs: [
      NC.sel('mode', 'Rate constant from', [['fit', 'Two measured mean radii'], ['params', 'Physical parameters']], 'fit'),
      NC.num('r1', 'Mean radius at first time', 'nm', 2, { limits: { positive: true }, showIf: function (v) { return v.mode === 'fit'; } }),
      NC.num('t1', 'First time', 'h', 0, { limits: { nonneg: true }, showIf: function (v) { return v.mode === 'fit'; } }),
      NC.num('r2', 'Mean radius at second time', 'nm', 3, { limits: { positive: true }, showIf: function (v) { return v.mode === 'fit'; } }),
      NC.num('t2', 'Second time', 'h', 2, { limits: { nonneg: true }, showIf: function (v) { return v.mode === 'fit'; } }),
      NC.sel('mat', 'Material (for molar volume)', matOpts, 'Au', { showIf: function (v) { return v.mode === 'params'; } }),
      NC.num('rho', 'Density ρ', 'g/cm³', 19.32, { showIf: function (v) { return v.mode === 'params' && v.mat === 'custom'; } }),
      NC.num('M', 'Molar mass M', 'g/mol', 196.967, { showIf: function (v) { return v.mode === 'params' && v.mat === 'custom'; } }),
      NC.num('gamma', 'Interfacial energy γ', 'J/m²', 0.3, { showIf: function (v) { return v.mode === 'params'; }, help: 'Illustrative default; enter a literature value.' }),
      NC.num('Dm', 'Diffusion coefficient of the solute D', '×10⁻⁹ m²/s', 1, { showIf: function (v) { return v.mode === 'params'; }, help: 'Small molecules and ions in water are typically ~0.5–2 ×10⁻⁹ m²/s; look up your species.' }),
      NC.num('cinf', 'Equilibrium solubility c∞ (bulk solid)', 'mol/m³', 0.001, { showIf: function (v) { return v.mode === 'params'; }, help: '1 mol/m³ = 1 mM. Enter the solubility of the bulk solid in your medium.' }),
      NC.num('T', 'Temperature', '°C', 25, { showIf: function (v) { return v.mode === 'params'; } }),
      NC.num('r0', 'Starting mean radius r₀', 'nm', 2, { showIf: function (v) { return v.mode === 'params'; } }),
      NC.num('t', 'Predict at time t', 'h', 6)
    ],
    example: { mode: 'fit', r1: 2, t1: 0, r2: 3, t2: 2, t: 6 },
    compute: function (v) {
      const s = new NC.Steps();
      let K, r0, t0;
      s.add({ title: 'LSW law (diffusion-limited coarsening, long-time limit)', formula: 'r̄³ − r̄₀³ = K·(t − t₀)', tex: String.raw`\bar{r}^{\,3} - \bar{r}_0^{\,3} = K\,(t - t_0)`, ref: ['lifshitz1961', 'wagner1961'] });
      if (v.mode === 'params') {
        const m = material(v, 'mat', 'rho', 'M');
        const gamma = NC.need(v.gamma, 'Interfacial energy', { positive: true });
        const Dm = NC.need(v.Dm, 'Diffusion coefficient', { positive: true }) * 1e-9;
        const cinf = NC.need(v.cinf, 'Solubility', { positive: true });
        const TK = NC.need(v.T, 'Temperature', { min: -50, max: 1500 }) + 273.15;
        const Vm = (m.M / m.rho) * 1e-6; // m³/mol
        s.add({ title: 'Molar volume of the solid', formula: 'V_m = M / ρ', tex: String.raw`V_m = \dfrac{M}{\rho}`, sub: 'V_m = ' + f(m.M) + ' / ' + f(m.rho) + ' cm³/mol', result: 'V_m = ' + f(Vm) + ' m³/mol', ref: 'crc' });
        K = (8 * gamma * Dm * cinf * Vm * Vm) / (9 * C.R * TK);
        s.add({
          title: 'LSW rate constant',
          formula: 'K = 8γ·D·c∞·V_m² / (9RT)',
          tex: String.raw`K = \dfrac{8\gamma\,D\,c_\infty V_m^2}{9RT}`,
          sub: 'K = 8 × ' + f(gamma) + ' × ' + f(Dm) + ' × ' + f(cinf) + ' × (' + f(Vm) + ')² / (9 × ' + f(C.R) + ' × ' + f(TK, 6) + ')',
          result: 'K = ' + f(K) + ' m³/s = ' + f(K * 1e27) + ' nm³/s',
          note: 'Units: γ in J/m², D in m²/s, c∞ in mol/m³, V_m in m³/mol give K in m³/s.',
          ref: ['lifshitz1961', 'wagner1961', 'thanh2014']
        });
        K *= 1e27; // nm³/s
        r0 = NC.need(v.r0, 'Starting radius', { positive: true });
        t0 = 0;
      } else {
        const r1 = NC.need(v.r1, 'First radius', { positive: true });
        const r2 = NC.need(v.r2, 'Second radius', { positive: true });
        const t1 = NC.need(v.t1, 'First time', { nonneg: true });
        const t2 = NC.need(v.t2, 'Second time', { nonneg: true });
        if (!(t2 > t1)) NC.fail('The second time must be later than the first.');
        if (!(r2 > r1)) NC.fail('In Ostwald ripening the mean radius grows: the second radius must be larger.');
        K = (Math.pow(r2, 3) - Math.pow(r1, 3)) / ((t2 - t1) * 3600);
        s.add({ title: 'Rate constant from two measurements', formula: 'K = (r̄₂³ − r̄₁³) / (t₂ − t₁)', tex: String.raw`K = \dfrac{\bar{r}_2^{\,3} - \bar{r}_1^{\,3}}{t_2 - t_1}`, sub: 'K = (' + f(r2) + '³ − ' + f(r1) + '³) nm³ / (' + f((t2 - t1) * 3600) + ' s)', result: 'K = ' + f(K) + ' nm³/s = ' + f(K * 3600) + ' nm³/h' });
        r0 = r1; t0 = t1;
      }
      const t = NC.need(v.t, 'Prediction time', { nonneg: true });
      const r = Math.cbrt(Math.pow(r0, 3) + K * (t - t0) * 3600);
      if (!isFinite(r) || r <= 0) NC.fail('The prediction time is before the particles would have formed in this model.');
      s.add({ title: 'Mean radius at t = ' + f(t) + ' h', formula: 'r̄(t) = [r̄₀³ + K·(t − t₀)]^(1/3)', tex: String.raw`\bar{r}(t) = \left[\bar{r}_0^{\,3} + K\,(t - t_0)\right]^{1/3}`, sub: 'r̄ = [' + f(r0) + '³ + ' + f(K) + ' × ' + f((t - t0) * 3600) + ']^(1/3)', result: 'r̄ = ' + f(r) + ' nm  (diameter ' + f(2 * r) + ' nm)' });
      const tEnd = Math.max(t, t0 + 1) * 1.3;
      const curve = [];
      for (let i = 0; i <= 100; i++) {
        const ti = t0 + ((tEnd - t0) * i) / 100;
        curve.push([ti, Math.cbrt(Math.pow(r0, 3) + K * (ti - t0) * 3600)]);
      }
      const pts = [[t, r]];
      if (v.mode === 'fit') pts.push([NC.need(v.t1, 't1'), NC.need(v.r1, 'r1')], [NC.need(v.t2, 't2'), NC.need(v.r2, 'r2')]);
      return {
        results: [
          { label: 'Mean radius at t', value: r, unit: 'nm', main: true },
          { label: 'Mean diameter at t', value: 2 * r, unit: 'nm' },
          { label: 'Rate constant K', value: K, unit: 'nm³/s', main: true },
          { label: 'Rate constant K (per hour)', value: K * 3600, unit: 'nm³/h' }
        ],
        steps: s.items,
        plots: [{ title: 'LSW coarsening', xlabel: 'Time (h)', ylabel: 'Mean radius r̄ (nm)', series: [{ name: 'r̄(t)', mode: 'line', points: curve }, { name: v.mode === 'fit' ? 'Data and prediction' : 'Prediction', mode: 'markers', color: 1, size: 5, points: pts }] }],
        notes: [
          'LSW applies to dilute systems in the late, self-similar stage of diffusion-limited ripening; interface-limited ripening gives r̄² ∝ t instead.',
          'Check that r̄³ is linear in time over your data before trusting the rate constant.'
        ]
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
