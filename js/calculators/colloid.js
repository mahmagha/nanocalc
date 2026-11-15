/* Light scattering & colloids: DLS hydrodynamic size, zeta potential. */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt, C = NC.C;

  /** Resolve temperature and viscosity (shared by DLS and zeta). */
  function viscosity(v, s) {
    const tC = NC.need(v.T, 'Temperature', { min: -20, max: 150 });
    const TK = tC + 273.15;
    let eta;
    if (v.visc === 'custom') {
      eta = NC.need(v.eta, 'Viscosity', { positive: true }) * 1e-3;
      s.add({ title: 'Medium viscosity (user value)', formula: 'η (mPa·s → Pa·s)', sub: 'η = ' + f(v.eta) + ' mPa·s', result: 'η = ' + f(eta) + ' Pa·s' });
    } else {
      if (tC < 0 || tC > 100) NC.fail('The automatic water viscosity covers 0–100 °C only. Enter a custom viscosity instead.');
      eta = NC.waterViscosity(TK);
      s.add({
        title: 'Viscosity of water at T',
        formula: 'η = 2.414×10⁻⁵ Pa·s × 10^[247.8 K / (T − 140 K)]', tex: "\\eta = 2.414\\times 10^{-5}\\ \\text{Pa}\\cdot\\text{s}\\times 10^{\\,247.8\\ \\text{K}/(T - 140\\ \\text{K})}",
        sub: 'T = ' + f(tC) + ' °C + 273.15 = ' + f(TK, 6) + ' K;   η = 2.414×10⁻⁵ × 10^(247.8 / ' + f(TK - 140, 5) + ')',
        result: 'η = ' + f(eta) + ' Pa·s = ' + f(eta * 1e3) + ' mPa·s',
        note: 'Vogel-type empirical correlation. Over 0–100 °C it agrees with the IAPWS formulation to within about 1 %.',
        ref: 'huber2009'
      });
    }
    return { tC: tC, TK: TK, eta: eta };
  }
  const tempInputs = [
    NC.num('T', 'Temperature T', '°C', 25),
    NC.sel('visc', 'Medium viscosity', [['water', 'Water (automatic, from T)'], ['custom', 'Custom value']], 'water'),
    NC.num('eta', 'Viscosity η', 'mPa·s', 0.89, { showIf: function (v) { return v.visc === 'custom'; } })
  ];

  /* ================================================================== */
  /* DLS — Stokes–Einstein                                               */
  /* ================================================================== */
  NC.register({
    id: 'dls',
    category: 'colloid',
    title: 'DLS hydrodynamic diameter (Stokes–Einstein)',
    short: 'Hydrodynamic size from a diffusion coefficient or correlation decay rate',
    description:
      'Turns a translational diffusion coefficient, or the decay rate of the field autocorrelation function g₁(τ), into a hydrodynamic diameter using the Stokes–Einstein equation. It also works in reverse, giving the diffusion coefficient expected for a given size.',
    refs: ['einstein1905', 'berne1976', 'iso22412', 'huber2009'],
    inputs: [
      NC.sel('mode', 'Calculate', [['D', 'Size from diffusion coefficient'], ['gamma', 'Size from decay rate Γ'], ['reverse', 'Diffusion coefficient from size']], 'D'),
      NC.num('Dt', 'Translational diffusion coefficient D', 'μm²/s', 4.9, { showIf: function (v) { return v.mode === 'D'; } }),
      NC.num('gamma', 'Decay rate Γ of g₁(τ)', 's⁻¹', 2000, { showIf: function (v) { return v.mode === 'gamma'; }, help: 'Use the decay rate of the field correlation g₁. The intensity correlation g₂ − 1 decays at 2Γ.' }),
      NC.num('n', 'Refractive index of medium n', '', 1.33, { showIf: function (v) { return v.mode === 'gamma'; } }),
      NC.num('lam', 'Laser wavelength λ₀ (vacuum)', 'nm', 633, { showIf: function (v) { return v.mode === 'gamma'; } }),
      NC.num('theta', 'Scattering angle θ', '°', 173, { showIf: function (v) { return v.mode === 'gamma'; } }),
      NC.num('dh', 'Hydrodynamic diameter d_h', 'nm', 100, { showIf: function (v) { return v.mode === 'reverse'; } })
    ].concat(tempInputs),
    example: { mode: 'D', Dt: 4.9, gamma: 2000, n: 1.33, lam: 633, theta: 173, dh: 100, T: 25, visc: 'water', eta: 0.89 },
    compute: function (v) {
      const s = new NC.Steps();
      const w = viscosity(v, s);
      const kT = C.kB * w.TK;
      s.add({ title: 'Thermal energy', formula: 'k_B·T', sub: f(C.kB) + ' J/K × ' + f(w.TK, 6) + ' K', result: 'k_B·T = ' + f(kT) + ' J', ref: 'codata2018' });
      s.add({ title: 'Stokes–Einstein equation', formula: 'D = k_B·T / (3π·η·d_h)   ⇔   d_h = k_B·T / (3π·η·D)', tex: "D = \\dfrac{k_B T}{3\\pi\\eta\\,d_h} \\;\\Leftrightarrow\\; d_h = \\dfrac{k_B T}{3\\pi\\eta D}", note: 'Assumes a sphere diffusing freely in a continuous medium, with no interactions between particles (dilute limit).', ref: 'einstein1905' });

      const results = [];
      let D, dh;
      if (v.mode === 'reverse') {
        dh = NC.need(v.dh, 'Hydrodynamic diameter', { positive: true });
        D = kT / (3 * Math.PI * w.eta * dh * 1e-9);
        s.add({ title: 'Diffusion coefficient', formula: 'D = k_B·T / (3π·η·d_h)', tex: "D = \\dfrac{k_B T}{3\\pi\\eta\\,d_h}", sub: 'D = ' + f(kT) + ' / (3π × ' + f(w.eta) + ' × ' + f(dh) + '×10⁻⁹ m)', result: 'D = ' + f(D) + ' m²/s = ' + f(D * 1e12) + ' μm²/s' });
        results.push({ label: 'Diffusion coefficient D', value: D * 1e12, unit: 'μm²/s', main: true });
      } else {
        if (v.mode === 'gamma') {
          const G = NC.need(v.gamma, 'Decay rate', { positive: true });
          const n = NC.need(v.n, 'Refractive index', { positive: true });
          const lam = NC.need(v.lam, 'Wavelength', { positive: true });
          const th = NC.need(v.theta, 'Scattering angle', { gt: 0, max: 180 });
          const q = (4 * Math.PI * n * Math.sin(NC.rad(th) / 2)) / (lam * 1e-9);
          s.add({ title: 'Scattering vector', formula: 'q = 4πn·sin(θ/2) / λ₀', tex: "q = \\dfrac{4\\pi n\\sin(\\theta/2)}{\\lambda_0}", sub: 'q = 4π × ' + f(n) + ' × sin(' + f(th) + '°/2) / (' + f(lam) + '×10⁻⁹ m)', result: 'q = ' + f(q) + ' m⁻¹', ref: 'berne1976' });
          D = G / (q * q);
          s.add({ title: 'Diffusion coefficient from the decay rate', formula: 'g₁(τ) = exp(−Γτ),   Γ = D·q²   ⇒   D = Γ / q²', tex: "g_1(\\tau) = e^{-\\Gamma\\tau},\\quad \\Gamma = Dq^2 \\;\\Rightarrow\\; D = \\dfrac{\\Gamma}{q^2}", sub: 'D = ' + f(G) + ' s⁻¹ / (' + f(q) + ' m⁻¹)²', result: 'D = ' + f(D) + ' m²/s = ' + f(D * 1e12) + ' μm²/s', ref: 'berne1976' });
          results.push({ label: 'Diffusion coefficient D', value: D * 1e12, unit: 'μm²/s' });
          results.push({ label: 'Scattering vector q', value: q, unit: 'm⁻¹' });
        } else {
          D = NC.need(v.Dt, 'Diffusion coefficient', { positive: true }) * 1e-12;
        }
        dh = kT / (3 * Math.PI * w.eta * D);
        s.add({ title: 'Hydrodynamic diameter', formula: 'd_h = k_B·T / (3π·η·D)', tex: "d_h = \\dfrac{k_B T}{3\\pi\\eta D}", sub: 'd_h = ' + f(kT) + ' J / (3π × ' + f(w.eta) + ' Pa·s × ' + f(D) + ' m²/s)', result: 'd_h = ' + f(dh) + ' m = ' + f(dh * 1e9) + ' nm' });
        dh *= 1e9;
        results.unshift({ label: 'Hydrodynamic diameter d_h', value: dh, unit: 'nm', main: true });
      }
      results.push({ label: 'Viscosity η', value: w.eta * 1e3, unit: 'mPa·s' });
      return {
        results: results,
        steps: s.items,
        notes: [
          'Cumulants analysis gives an intensity-weighted harmonic-mean size (the z-average). Large particles and aggregates dominate it, so it is usually larger than a number-weighted TEM diameter.',
          'The hydrodynamic diameter includes ligands, a polymer shell and the solvation layer. Report the temperature, viscosity, angle and analysis method as ISO 22412 requires.'
        ]
      };
    }
  });

  /* ================================================================== */
  /* Zeta potential                                                      */
  /* ================================================================== */
  function ohshimaF(ka) {
    return 1 + 1 / (2 * Math.pow(1 + 2.5 / (ka * (1 + 2 * Math.exp(-ka))), 3));
  }
  NC.register({
    id: 'zeta',
    category: 'colloid',
    title: 'Zeta potential from electrophoretic mobility',
    short: 'ζ from mobility (Smoluchowski, Hückel or Henry/Ohshima), plus Debye length',
    description:
      'Converts a measured electrophoretic mobility into a zeta potential. The Henry function f(κa) is evaluated with the Ohshima approximation, so the result is valid for any κa, not only the Smoluchowski (thin double layer) or Hückel (thick double layer) limits.',
    refs: ['delgado2005', 'ohshima1994', 'hunter1981', 'israelachvili2011', 'malmberg1956', 'huber2009'],
    inputs: [
      NC.num('mu', 'Electrophoretic mobility μ_e', 'μm·cm/(V·s)', 2),
      NC.sel('model', 'Model', [['smol', 'Smoluchowski (κa ≫ 1, f = 1.5)'], ['huckel', 'Hückel (κa ≪ 1, f = 1.0)'], ['henry', 'Henry function, Ohshima approximation']], 'smol'),
      NC.num('a', 'Particle radius a', 'nm', 50, { help: 'Used for κa in the Henry model.' }),
      NC.num('I', 'Ionic strength I (1:1 electrolyte)', 'mM', 1),
      NC.sel('epsMode', 'Permittivity of medium', [['water', 'Water (automatic, from T)'], ['custom', 'Custom value']], 'water'),
      NC.num('er', 'Relative permittivity εᵣ', '', 78.5, { showIf: function (v) { return v.epsMode === 'custom'; } })
    ].concat(tempInputs),
    example: { mu: 2, model: 'smol', a: 50, I: 1, epsMode: 'water', er: 78.5, T: 25, visc: 'water', eta: 0.89 },
    compute: function (v) {
      const s = new NC.Steps();
      const muIn = NC.need(v.mu, 'Mobility');
      const mu = muIn * 1e-8;
      s.add({ title: 'Mobility in SI units', formula: '1 μm·cm/(V·s) = 10⁻⁸ m²/(V·s)', sub: 'μ_e = ' + f(muIn) + ' × 10⁻⁸', result: 'μ_e = ' + f(mu) + ' m²/(V·s)' });
      const w = viscosity(v, s);
      let er;
      if (v.epsMode === 'custom') er = NC.need(v.er, 'Relative permittivity', { positive: true });
      else {
        if (w.tC < 0 || w.tC > 100) NC.fail('The automatic permittivity of water covers 0–100 °C only. Enter a custom value.');
        er = NC.waterPermittivity(w.tC);
        s.add({ title: 'Relative permittivity of water', formula: 'εᵣ = 87.740 − 0.40008t + 9.398×10⁻⁴t² − 1.410×10⁻⁶t³   (t in °C)', sub: 't = ' + f(w.tC), result: 'εᵣ = ' + f(er), ref: 'malmberg1956' });
      }
      const eps = er * C.eps0;

      const I = NC.opt(v.I, 'Ionic strength', { positive: true });
      let kinv = null, ka = null;
      if (I !== null) {
        kinv = Math.sqrt((eps * C.kB * w.TK) / (2 * C.NA * C.e * C.e * I * 1e-3 * 1000));
        s.add({
          title: 'Debye screening length (1:1 electrolyte)',
          formula: 'κ⁻¹ = √[εᵣε₀k_BT / (2N_A e² I)]   (I in mol/m³)', tex: "\\kappa^{-1} = \\sqrt{\\dfrac{\\varepsilon_r\\varepsilon_0 k_B T}{2N_A e^2 I}}\\quad(I\\ \\text{in mol/m}^3)",
          sub: 'κ⁻¹ = √[' + f(er) + ' × ' + f(C.eps0) + ' × ' + f(C.kB) + ' × ' + f(w.TK, 6) + ' / (2 × ' + f(C.NA) + ' × (' + f(C.e) + ')² × ' + f(I) + ')]',
          result: 'κ⁻¹ = ' + f(kinv * 1e9) + ' nm',
          ref: 'israelachvili2011'
        });
        const a = NC.opt(v.a, 'Particle radius', { positive: true });
        if (a !== null) {
          ka = (a * 1e-9) / kinv;
          s.add({ title: 'Dimensionless double-layer parameter', formula: 'κa = a / κ⁻¹', sub: 'κa = ' + f(a) + ' nm / ' + f(kinv * 1e9) + ' nm', result: 'κa = ' + f(ka) });
        }
      }

      let fk;
      if (v.model === 'huckel') {
        fk = 1;
        s.add({ title: 'Henry function, Hückel limit', formula: 'f(κa) → 1.0 for κa ≪ 1', result: 'f = 1.0', ref: 'delgado2005' });
      } else if (v.model === 'henry') {
        if (ka === null) NC.fail('The Henry model needs both the particle radius and the ionic strength to compute κa.');
        fk = ohshimaF(ka);
        s.add({
          title: 'Henry function (Ohshima approximation)',
          formula: 'f(κa) = 1 + 1 / {2·[1 + 2.5 / (κa·(1 + 2e^(−κa)))]³}', tex: "f(\\kappa a) = 1 + \\dfrac{1}{2\\left[1 + \\dfrac{2.5}{\\kappa a\\,(1 + 2e^{-\\kappa a})}\\right]^3}",
          sub: 'f = 1 + 1 / {2·[1 + 2.5 / (' + f(ka) + ' × (1 + 2e^(−' + f(ka) + ')))]³}',
          result: 'f(κa) = ' + f(fk),
          ref: 'ohshima1994'
        });
      } else {
        fk = 1.5;
        s.add({ title: 'Henry function, Smoluchowski limit', formula: 'f(κa) → 1.5 for κa ≫ 1', result: 'f = 1.5', ref: 'delgado2005' });
      }
      const zeta = (3 * w.eta * mu) / (2 * eps * fk);
      s.add({
        title: 'Zeta potential (Henry equation)',
        formula: 'μ_e = 2εᵣε₀ζ·f(κa) / (3η)   ⇒   ζ = 3η·μ_e / [2εᵣε₀·f(κa)]', tex: "\\mu_e = \\dfrac{2\\varepsilon_r\\varepsilon_0\\zeta f(\\kappa a)}{3\\eta} \\;\\Rightarrow\\; \\zeta = \\dfrac{3\\eta\\mu_e}{2\\varepsilon_r\\varepsilon_0 f(\\kappa a)}",
        sub: 'ζ = 3 × ' + f(w.eta) + ' × ' + f(mu) + ' / (2 × ' + f(er) + ' × ' + f(C.eps0) + ' × ' + f(fk) + ')',
        result: 'ζ = ' + f(zeta) + ' V = ' + f(zeta * 1e3) + ' mV',
        ref: ['delgado2005', 'hunter1981']
      });

      const warnings = [];
      if (v.model === 'smol' && ka !== null && ka < 20) warnings.push('κa = ' + f(ka, 3) + ' is not ≫ 1, so the Smoluchowski limit may overestimate |ζ|. Consider the Henry/Ohshima model.');
      if (v.model === 'huckel' && ka !== null && ka > 0.5) warnings.push('κa = ' + f(ka, 3) + ' is not ≪ 1, so the Hückel limit may be inaccurate. Consider the Henry/Ohshima model.');
      if (Math.abs(zeta * 1e3) > 50) warnings.push('At high |ζ|, double-layer relaxation (not included in Henry’s theory) can become important. See the IUPAC report.');

      return {
        results: [
          { label: 'Zeta potential ζ', value: zeta * 1e3, unit: 'mV', main: true },
          { label: 'Henry function f(κa)', value: fk },
          { label: 'Debye length κ⁻¹', value: kinv === null ? NaN : kinv * 1e9, unit: 'nm' },
          { label: 'κa', value: ka === null ? NaN : ka },
          { label: 'εᵣ used', value: er },
          { label: 'η used', value: w.eta * 1e3, unit: 'mPa·s' }
        ],
        steps: s.items,
        warnings: warnings,
        notes: [
          'A magnitude of |ζ| above roughly 30 mV is a common rule of thumb for electrostatically stabilized dispersions. It is not a guarantee: steric stabilization, ionic strength and specific ion effects also control stability.',
          'The Henry/Ohshima treatment assumes a rigid, non-conducting sphere with low ζ and no double-layer relaxation.'
        ]
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
