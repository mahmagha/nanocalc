/*
 * Optics: Mie theory (spheres), Gans theory (spheroids / nanorods), model-based
 * Ag/Au size from the plasmon peak, relative photoluminescence quantum yield,
 * and the Urbach energy.
 *
 * Dielectric functions come from a free-electron Drude model with editable
 * parameters, or from an n, k table pasted by the user. No tabulated optical
 * constants are built in.
 */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt, C = NC.C, PI = Math.PI;
  const HBAR_EVS = C.hbar / C.e; // ħ in eV·s

  NC.addRefs({
    bohren1983: { type: 'book', authors: 'Bohren, C. F.; Huffman, D. R.', title: 'Absorption and Scattering of Light by Small Particles', publisher: 'Wiley', place: 'New York', year: 1983 },
    mie1908: { type: 'article', authors: 'Mie, G.', title: 'Beiträge zur Optik trüber Medien, speziell kolloidaler Metallösungen', journal: 'Ann. Phys.', year: 1908, volume: '330', pages: '377–445', doi: '10.1002/andp.19083300302' },
    gans1912: { doi: '10.1002/andp.19123420503', type: 'article', authors: 'Gans, R.', title: 'Über die Form ultramikroskopischer Goldteilchen', journal: 'Ann. Phys.', year: 1912, volume: '342', pages: '881–900' },
    kreibig1995: { type: 'book', authors: 'Kreibig, U.; Vollmer, M.', title: 'Optical Properties of Metal Clusters', publisher: 'Springer', place: 'Berlin', year: 1995 },
    ashcroft1976: { type: 'book', authors: 'Ashcroft, N. W.; Mermin, N. D.', title: 'Solid State Physics', publisher: 'Holt, Rinehart and Winston', place: 'New York', year: 1976 },
    brouwer2011: { type: 'article', authors: 'Brouwer, A. M.', title: 'Standards for photoluminescence quantum yield measurements in solution (IUPAC Technical Report)', journal: 'Pure Appl. Chem.', year: 2011, volume: '83', pages: '2213–2228', doi: '10.1351/PAC-REP-10-09-31' },
    urbach1953: { type: 'article', authors: 'Urbach, F.', title: 'The long-wavelength edge of photographic sensitivity and of the electronic absorption of solids', journal: 'Phys. Rev.', year: 1953, volume: '92', pages: '1324', doi: '10.1103/PhysRev.92.1324' }
  });

  /* ------------------------------------------------------------------ */
  /* Complex arithmetic                                                  */
  /* ------------------------------------------------------------------ */
  const cx = function (re, im) { return { re: re, im: im || 0 }; };
  const cadd = function (a, b) { return cx(a.re + b.re, a.im + b.im); };
  const csub = function (a, b) { return cx(a.re - b.re, a.im - b.im); };
  const cmul = function (a, b) { return cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re); };
  const cdiv = function (a, b) {
    const d = b.re * b.re + b.im * b.im;
    return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
  };
  const cabs2 = function (a) { return a.re * a.re + a.im * a.im; };
  const csqrt = function (a) { // principal root (Re ≥ 0)
    const r = Math.sqrt(Math.sqrt(cabs2(a)));
    const th = Math.atan2(a.im, a.re) / 2;
    return cx(r * Math.cos(th), r * Math.sin(th));
  };
  const fc = function (z, sig) {
    sig = sig || 4;
    return f(z.re, sig) + (z.im >= 0 ? ' + ' : ' − ') + f(Math.abs(z.im), sig) + 'i';
  };

  /* ------------------------------------------------------------------ */
  /* Mie theory: BHMIE (Bohren & Huffman 1983, Appendix A)               */
  /* x = size parameter in the medium, m = relative complex index.       */
  /* ------------------------------------------------------------------ */
  function bhmie(x, m) {
    const nstop = Math.max(1, Math.round(x + 4 * Math.cbrt(x) + 2));
    const y = cmul(m, cx(x));
    const nmx = Math.round(Math.max(nstop, Math.sqrt(cabs2(y))) + 15);
    const D = new Array(nmx + 1);
    D[nmx] = cx(0, 0);
    for (let n = nmx; n >= 2; n--) {
      const ny = cdiv(cx(n), y);
      D[n - 1] = csub(ny, cdiv(cx(1), cadd(D[n], ny)));
    }
    let psi0 = Math.cos(x), psi1 = Math.sin(x), chi0 = -Math.sin(x), chi1 = Math.cos(x);
    let xi1 = cx(psi1, -chi1);
    let qsca = 0, qext = 0, a1 = null, b1 = null;
    for (let n = 1; n <= nstop; n++) {
      const psi = ((2 * n - 1) * psi1) / x - psi0;
      const chi = ((2 * n - 1) * chi1) / x - chi0;
      const xi = cx(psi, -chi);
      const da = cadd(cdiv(D[n], m), cx(n / x));
      const an = cdiv(csub(cmul(da, cx(psi)), cx(psi1)), csub(cmul(da, xi), xi1));
      const db = cadd(cmul(m, D[n]), cx(n / x));
      const bn = cdiv(csub(cmul(db, cx(psi)), cx(psi1)), csub(cmul(db, xi), xi1));
      qsca += (2 * n + 1) * (cabs2(an) + cabs2(bn));
      qext += (2 * n + 1) * (an.re + bn.re);
      if (n === 1) { a1 = an; b1 = bn; }
      psi0 = psi1; psi1 = psi; chi0 = chi1; chi1 = chi; xi1 = cx(psi1, -chi1);
    }
    qsca *= 2 / (x * x);
    qext *= 2 / (x * x);
    return { qext: qext, qsca: qsca, qabs: qext - qsca, nstop: nstop, a1: a1, b1: b1 };
  }

  /* ------------------------------------------------------------------ */
  /* Dielectric functions                                                */
  /* ------------------------------------------------------------------ */
  /** Drude: ε(E) = ε∞ − ωp²/(E² + iγE), all energies in eV. */
  function drude(E, epsInf, wp, gam) {
    const den = E * E + gam * gam;
    return cx(epsInf - (wp * wp) / den, (wp * wp * gam) / (E * den));
  }

  /* Free-electron values (Ashcroft & Mermin 1976): n_e (Table 1.1), τ at 273 K (Table 1.3), v_F (Table 2.1).
     ωp = √(n e²/(ε₀ mₑ)), γ = ħ/τ. ε∞ is an adjustable background permittivity, not a measured constant. */
  function freeElectron(nE, tau, vF, epsInf, label) {
    const wp = (C.hbar * Math.sqrt((nE * C.e * C.e) / (C.eps0 * C.me))) / C.e;
    return { label: label, values: { model: 'drude', epsInf: epsInf, wp: +wp.toFixed(3), gam: +(HBAR_EVS / tau).toFixed(4), vF: vF } };
  }
  const PRESETS = [
    freeElectron(5.86e28, 4.0e-14, 1.39, 5.0, 'Silver (Ag), free-electron Drude model'),
    freeElectron(5.9e28, 3.0e-14, 1.4, 11, 'Gold (Au), free-electron Drude model')
  ];
  const PRESET_NOTE = 'Presets build a free-electron Drude model: ωp from the conduction-electron density, γ = ħ/τ from the 273 K relaxation time, and v_F (all from Ashcroft & Mermin). ε∞ (5 for Ag, 11 for Au) is an adjustable background permittivity that places the resonance near where it is observed; it is not a measured constant. Gold has strong interband absorption below ~600 nm that a Drude model does not capture, so for quantitative Au spectra paste measured n, k data.';

  function dielectricInputs(defaults) {
    const isD = function (v) { return v.model === 'drude'; };
    return [
      NC.sel('model', 'Dielectric function', [['drude', 'Drude model (free electrons)'], ['nk', 'Pasted n, k table']], 'drude'),
      NC.num('epsInf', 'Background permittivity ε∞', '', defaults.epsInf, { showIf: isD }),
      NC.num('wp', 'Plasma energy ħωp', 'eV', defaults.wp, { showIf: isD }),
      NC.num('gam', 'Bulk damping ħγ', 'eV', defaults.gam, { showIf: isD }),
      NC.sel('damp', 'Size-dependent damping', [['on', 'On: γ(R) = γ + A·ħv_F/R'], ['off', 'Off (bulk γ)']], 'on', { showIf: isD }),
      NC.num('A', 'Surface-scattering constant A', '', 1, { showIf: function (v) { return isD(v) && v.damp === 'on'; }, help: 'Order-unity, model-dependent constant (Kreibig & Vollmer). 1 is a neutral default; adjust it to your system.' }),
      NC.num('vF', 'Fermi velocity v_F', '10⁶ m/s', defaults.vF, { showIf: function (v) { return isD(v) && v.damp === 'on'; } }),
      NC.data('nk', 'Optical constants: λ (nm), n, k', '', { rows: 8, placeholder: 'λ (nm), n, k — one row per wavelength, from a source you cite\n400, 1.47, 1.95\n…', showIf: function (v) { return v.model === 'nk'; } })
    ];
  }

  /** Build ε(λ) from inputs. R in nm (for size damping). */
  function dielectric(v, R) {
    if (v.model === 'nk') {
      const rows = NC.parseRows(v.nk, { min: 3, max: 3, labels: ['λ (nm)', 'n', 'k'], name: 'n, k table' }).sort(function (a, b) { return a[0] - b[0]; });
      if (rows.length < 2) NC.fail('Paste at least two rows of λ (nm), n, k.');
      rows.forEach(function (r) { if (!(r[0] > 0) || r[2] < 0) NC.fail('n, k table: wavelengths must be positive and k ≥ 0.'); });
      let clamped = false;
      const eps = function (lam) {
        let n, k;
        if (lam <= rows[0][0]) { n = rows[0][1]; k = rows[0][2]; if (lam < rows[0][0]) clamped = true; }
        else if (lam >= rows[rows.length - 1][0]) { const r = rows[rows.length - 1]; n = r[1]; k = r[2]; if (lam > r[0]) clamped = true; }
        else {
          let i = 1;
          while (rows[i][0] < lam) i++;
          const r0 = rows[i - 1], r1 = rows[i], t = (lam - r0[0]) / (r1[0] - r0[0]);
          n = r0[1] + t * (r1[1] - r0[1]);
          k = r0[2] + t * (r1[2] - r0[2]);
        }
        return cmul(cx(n, k), cx(n, k));
      };
      return {
        eps: eps,
        warn: function () { return clamped ? ['Part of the wavelength range lies outside the pasted n, k table; the nearest table value was used there.'] : []; },
        addSteps: function (s, lam) {
          const e = eps(lam), nk = csqrt(e);
          s.add({ title: 'Optical constants at λ = ' + f(lam) + ' nm (linear interpolation of the pasted table)', formula: 'ε = (n + ik)²', tex: String.raw`\varepsilon = (n + ik)^2`, sub: 'n = ' + f(nk.re) + ', k = ' + f(nk.im), result: 'ε = ' + fc(e) });
        }
      };
    }
    const epsInf = NC.need(v.epsInf, 'Background permittivity ε∞', { positive: true });
    const wp = NC.need(v.wp, 'Plasma energy', { positive: true });
    const gam = NC.need(v.gam, 'Damping', { nonneg: true });
    let gEff = gam, extra = 0;
    if (v.damp === 'on') {
      const A = NC.need(v.A, 'Surface-scattering constant A', { nonneg: true });
      const vF = NC.need(v.vF, 'Fermi velocity', { positive: true });
      extra = (A * HBAR_EVS * vF * 1e6) / (R * 1e-9);
      gEff = gam + extra;
    }
    if (!(gEff > 0)) NC.fail('The total damping γ must be greater than zero.');
    return {
      eps: function (lam) { return drude(NC.HC_EV_NM / lam, epsInf, wp, gEff); },
      gEff: gEff,
      warn: function () { return []; },
      addSteps: function (s, lam) {
        if (v.damp === 'on') {
          s.add({ title: 'Size-dependent damping (surface scattering of conduction electrons)', formula: 'ħγ(R) = ħγ_bulk + A·ħv_F/R', tex: String.raw`\hbar\gamma(R) = \hbar\gamma_{\text{bulk}} + A\,\dfrac{\hbar v_F}{R}`, sub: 'ħγ = ' + f(gam) + ' + ' + f(v.A) + ' × ' + f(HBAR_EVS) + ' eV·s × ' + f(v.vF) + '×10⁶ m/s / (' + f(R) + '×10⁻⁹ m)', result: 'ħγ = ' + f(gEff) + ' eV', ref: 'kreibig1995' });
        }
        const E = NC.HC_EV_NM / lam, e = drude(E, epsInf, wp, gEff);
        s.add({ title: 'Dielectric function at λ = ' + f(lam) + ' nm (Drude model)', formula: 'E = hc/λ;   ε(E) = ε∞ − ωp² / (E² + iγE)', tex: String.raw`E = \dfrac{hc}{\lambda};\quad \varepsilon(E) = \varepsilon_\infty - \dfrac{\omega_p^2}{E^2 + i\gamma E}`, sub: 'E = ' + f(E) + ' eV;   ε = ' + f(epsInf) + ' − ' + f(wp) + '² / (' + f(E) + '² + i × ' + f(gEff) + ' × ' + f(E) + ')', result: 'ε = ' + fc(e), ref: ['kreibig1995', 'ashcroft1976'] });
      }
    };
  }

  function lambdaGrid(v, defMin, defMax) {
    const a = NC.need(v.lmin, 'Start wavelength', { positive: true });
    const b = NC.need(v.lmax, 'End wavelength', { positive: true });
    const st = NC.need(v.lstep, 'Wavelength step', { positive: true });
    if (b <= a) NC.fail('The end wavelength must be larger than the start wavelength.');
    const n = Math.floor((b - a) / st) + 1;
    if (n > 2001) NC.fail('Too many wavelengths (' + n + '). Use a larger step (at most 2000 points).');
    const out = [];
    for (let i = 0; i < n; i++) out.push(a + i * st);
    return out;
  }

  /** Index of the maximum, and parabolic refinement of its position. */
  function peakOf(xs, ys) {
    let p = 0;
    for (let i = 1; i < ys.length; i++) if (ys[i] > ys[p]) p = i;
    let xp = xs[p];
    if (p > 0 && p < ys.length - 1) {
      const y0 = ys[p - 1], y1 = ys[p], y2 = ys[p + 1];
      const den = y0 - 2 * y1 + y2;
      if (den < 0) xp = xs[p] + ((xs[p + 1] - xs[p]) * (y0 - y2)) / (2 * den);
    }
    return { i: p, x: xp, y: ys[p], edge: p === 0 || p === ys.length - 1 };
  }
  /** Full width at half maximum around index p (linear interpolation); NaN if a side never drops below half. */
  function fwhmOf(xs, ys, p) {
    const half = ys[p] / 2;
    let L = NaN, R = NaN;
    for (let i = p; i > 0; i--) if (ys[i - 1] < half) { L = xs[i - 1] + ((half - ys[i - 1]) * (xs[i] - xs[i - 1])) / (ys[i] - ys[i - 1]); break; }
    for (let i = p; i < ys.length - 1; i++) if (ys[i + 1] < half) { R = xs[i] + ((ys[i] - half) * (xs[i + 1] - xs[i])) / (ys[i] - ys[i + 1]); break; }
    return R - L;
  }

  /** Mie spectrum for a sphere of diameter D (nm) in medium index nm. */
  function mieSpectrum(lams, D, nmed, eps) {
    const R = D / 2, qe = [], qs = [], qa = [];
    lams.forEach(function (lam) {
      const m = cdiv(csqrt(eps(lam)), cx(nmed));
      const r = bhmie((2 * PI * nmed * R) / lam, m);
      qe.push(r.qext); qs.push(r.qsca); qa.push(r.qabs);
    });
    return { qe: qe, qs: qs, qa: qa };
  }

  /* Depolarization factor along the long axis of a prolate spheroid (aspect ratio AR = c/a ≥ 1). */
  function gansL(AR) {
    if (Math.abs(AR - 1) < 1e-9) return 1 / 3;
    const e = Math.sqrt(1 - 1 / (AR * AR));
    return ((1 - e * e) / (e * e)) * (-1 + Math.log((1 + e) / (1 - e)) / (2 * e));
  }
  /** Quasi-static polarizability (volume units) of an ellipsoid along an axis with depolarization factor L. */
  function gansAlpha(eps, epsm, L, V) {
    const d = csub(eps, cx(epsm));
    return cdiv(cmul(cx(V), d), cadd(cx(epsm), cmul(cx(L), d)));
  }

  NC.optics = { cx: cx, cmul: cmul, cdiv: cdiv, cadd: cadd, csub: csub, csqrt: csqrt, cabs2: cabs2, bhmie: bhmie, drude: drude, gansL: gansL, gansAlpha: gansAlpha, peakOf: peakOf, fwhmOf: fwhmOf, mieSpectrum: mieSpectrum, presets: PRESETS };

  const nmedInput = NC.num('nmed', 'Refractive index of the medium', '', 1.333, { help: 'Water ≈ 1.333 in the visible.' });
  const gridInputs = function (a, b, st) {
    return [NC.num('lmin', 'Start wavelength', 'nm', a), NC.num('lmax', 'End wavelength', 'nm', b), NC.num('lstep', 'Wavelength step', 'nm', st)];
  };
  const agDefaults = PRESETS[0].values, auDefaults = PRESETS[1].values;

  /* ================================================================== */
  /* Mie theory                                                          */
  /* ================================================================== */
  NC.register({
    id: 'mie',
    category: 'optical',
    title: 'Mie theory: extinction spectrum of a sphere',
    short: 'Exact extinction, scattering and absorption spectra of a metal or dielectric sphere',
    description:
      'Solves Maxwell’s equations exactly for a homogeneous sphere (Mie theory, Bohren–Huffman algorithm). Gives the extinction, scattering and absorption efficiencies and cross-sections across the spectrum, the plasmon peak position and width, and the molar extinction coefficient. The dielectric function comes from a Drude model or from n, k data you paste.',
    refs: ['mie1908', 'bohren1983', 'kreibig1995', 'ashcroft1976', 'codata2018'],
    presets: PRESETS,
    presetNote: PRESET_NOTE,
    inputs: [NC.num('D', 'Sphere diameter D', 'nm', 40), nmedInput].concat(dielectricInputs(agDefaults), gridInputs(300, 800, 2)),
    example: Object.assign({ D: 40, nmed: 1.333, damp: 'on', A: 1, lmin: 300, lmax: 800, lstep: 2 }, agDefaults),
    compute: function (v) {
      const s = new NC.Steps();
      const D = NC.need(v.D, 'Diameter', { positive: true });
      const nmed = NC.need(v.nmed, 'Medium refractive index', { positive: true });
      const lams = lambdaGrid(v);
      const diel = dielectric(v, D / 2);
      const sp = mieSpectrum(lams, D, nmed, diel.eps);
      const pk = peakOf(lams, sp.qe);
      const fw = fwhmOf(lams, sp.qe, pk.i);
      const lam = pk.x;
      const R = D / 2;

      s.heading('1 · Optical constants at the extinction peak');
      diel.addSteps(s, lam);
      const e = diel.eps(lam), np = csqrt(e), m = cdiv(np, cx(nmed));
      s.add({ title: 'Relative complex refractive index', formula: 'm = √ε / n_med', tex: String.raw`m = \dfrac{\sqrt{\varepsilon}}{n_{\text{med}}}`, sub: 'm = (' + fc(np) + ') / ' + f(nmed), result: 'm = ' + fc(m), ref: 'bohren1983' });
      s.heading('2 · Mie series');
      const x = (2 * PI * nmed * R) / lam;
      s.add({ title: 'Size parameter', formula: 'x = 2π·n_med·R / λ', tex: String.raw`x = \dfrac{2\pi\,n_{\text{med}}\,R}{\lambda}`, sub: 'x = 2π × ' + f(nmed) + ' × ' + f(R) + ' / ' + f(lam), result: 'x = ' + f(x), ref: 'bohren1983' });
      const r = bhmie(x, m);
      s.add({ title: 'Number of terms in the series', formula: 'N = x + 4x^(1/3) + 2  (rounded)', tex: String.raw`N = x + 4x^{1/3} + 2`, sub: 'N = ' + f(x) + ' + 4 × ' + f(x) + '^(1/3) + 2', result: 'N = ' + r.nstop, ref: 'bohren1983' });
      s.add({
        title: 'Scattering coefficients (Riccati–Bessel functions ψₙ, ξₙ)',
        formula: 'aₙ = [mψₙ(mx)ψₙ′(x) − ψₙ(x)ψₙ′(mx)] / [mψₙ(mx)ξₙ′(x) − ξₙ(x)ψₙ′(mx)];  bₙ likewise with m moved',
        tex: String.raw`a_n = \dfrac{m\psi_n(mx)\psi_n'(x) - \psi_n(x)\psi_n'(mx)}{m\psi_n(mx)\xi_n'(x) - \xi_n(x)\psi_n'(mx)},\quad b_n = \dfrac{\psi_n(mx)\psi_n'(x) - m\psi_n(x)\psi_n'(mx)}{\psi_n(mx)\xi_n'(x) - m\xi_n(x)\psi_n'(mx)}`,
        sub: 'Evaluated with downward recursion for the logarithmic derivative Dₙ(mx) and upward recursion for ψₙ(x), χₙ(x)',
        result: 'a₁ = ' + fc(r.a1) + ';   b₁ = ' + fc(r.b1),
        note: 'a₁ is the electric dipole term that carries the plasmon resonance of small particles; higher terms (quadrupole, …) grow with size.',
        ref: ['mie1908', 'bohren1983']
      });
      s.add({
        title: 'Efficiencies',
        formula: 'Q_ext = (2/x²)·Σ(2n + 1)·Re(aₙ + bₙ);   Q_sca = (2/x²)·Σ(2n + 1)·(|aₙ|² + |bₙ|²);   Q_abs = Q_ext − Q_sca',
        tex: String.raw`Q_{\text{ext}} = \dfrac{2}{x^2}\sum_{n=1}^{N}(2n+1)\,\mathrm{Re}(a_n + b_n),\quad Q_{\text{sca}} = \dfrac{2}{x^2}\sum_{n=1}^{N}(2n+1)\left(|a_n|^2 + |b_n|^2\right),\quad Q_{\text{abs}} = Q_{\text{ext}} - Q_{\text{sca}}`,
        result: 'Q_ext = ' + f(r.qext) + ';   Q_sca = ' + f(r.qsca) + ';   Q_abs = ' + f(r.qabs),
        ref: 'bohren1983'
      });
      s.heading('3 · Cross-sections and extinction coefficient');
      const G = PI * R * R;
      s.add({ title: 'Cross-sections', formula: 'C = Q·πR²', tex: String.raw`C = Q\,\pi R^2`, sub: 'πR² = π × ' + f(R) + '² = ' + f(G) + ' nm²', result: 'C_ext = ' + f(r.qext * G) + ' nm²;   C_sca = ' + f(r.qsca * G) + ' nm²;   C_abs = ' + f(r.qabs * G) + ' nm²' });
      const Ccm = r.qext * G * 1e-14;
      const epsM = (C.NA * Ccm) / (1000 * Math.LN10);
      s.add({ title: 'Molar extinction coefficient at the peak', formula: 'ε_M = N_A·C_ext / (1000·ln 10)   (C_ext in cm²)', tex: String.raw`\varepsilon_M = \dfrac{N_A\,C_{\text{ext}}}{1000\ln 10}`, sub: 'ε_M = ' + f(C.NA) + ' × ' + f(Ccm) + ' / (1000 × 2.3026)', result: 'ε_M = ' + f(epsM) + ' M⁻¹·cm⁻¹', ref: 'codata2018' });
      s.add({ title: 'Plasmon peak and width', formula: 'λ_max = argmax Q_ext(λ) (parabolic refinement);  FWHM from the half-maximum crossings', result: 'λ_max = ' + f(lam) + ' nm;   FWHM = ' + f(fw) + ' nm' });

      const warnings = diel.warn();
      if (pk.edge) warnings.push('The extinction maximum is at the edge of the wavelength range; widen the range to find the peak.');
      if (!isFinite(fw)) warnings.push('The peak does not fall to half its height on both sides inside the range, so the FWHM is not defined here.');
      return {
        results: [
          { label: 'Plasmon peak λ_max', value: lam, unit: 'nm', main: true },
          { label: 'FWHM', value: fw, unit: 'nm', main: true },
          { label: 'Molar extinction coefficient', value: epsM, unit: 'M⁻¹cm⁻¹', main: true },
          { label: 'Q_ext at peak', value: r.qext },
          { label: 'Q_sca at peak', value: r.qsca },
          { label: 'Q_abs at peak', value: r.qabs },
          { label: 'C_ext at peak', value: r.qext * G, unit: 'nm²' },
          { label: 'Scattering fraction', value: (100 * r.qsca) / r.qext, unit: '%' }
        ],
        steps: s.items,
        warnings: warnings,
        plots: [{
          title: 'Mie efficiencies', xlabel: 'Wavelength λ (nm)', ylabel: 'Efficiency Q', zeroY: true,
          series: [
            { name: 'Extinction', mode: 'line', points: lams.map(function (l, i) { return [l, sp.qe[i]]; }) },
            { name: 'Scattering', mode: 'line', color: 3, points: lams.map(function (l, i) { return [l, sp.qs[i]]; }) },
            { name: 'Absorption', mode: 'line', color: 4, dashed: true, points: lams.map(function (l, i) { return [l, sp.qa[i]]; }) }
          ]
        }],
        notes: [
          'Mie theory is exact for a homogeneous sphere; the accuracy of the spectrum is set by the dielectric function. A Drude model is a model, not measured data.',
          'Cross-sections are per particle. Multiply by the particle number concentration and path length (and divide by ln 10) to predict absorbance.'
        ]
      };
    }
  });

  /* ================================================================== */
  /* Gans theory for nanorods                                            */
  /* ================================================================== */
  NC.register({
    id: 'gans',
    category: 'optical',
    title: 'Gans theory: nanorod plasmon bands',
    short: 'Longitudinal and transverse plasmon peaks of rods modelled as prolate spheroids',
    description:
      'Quasi-static (Gans) theory for a prolate spheroid of the rod’s length and diameter. Gives the depolarization factors, the longitudinal and transverse plasmon peaks, the orientation-averaged extinction spectrum, and how the longitudinal peak moves with aspect ratio.',
    refs: ['gans1912', 'bohren1983', 'kreibig1995', 'ashcroft1976'],
    presets: PRESETS,
    presetNote: PRESET_NOTE,
    inputs: [NC.num('D', 'Rod diameter D', 'nm', 15), NC.num('L', 'Rod length L', 'nm', 50), nmedInput].concat(dielectricInputs(auDefaults), gridInputs(400, 1200, 2)),
    example: Object.assign({ D: 15, L: 50, nmed: 1.333, damp: 'on', A: 1, lmin: 400, lmax: 1200, lstep: 2 }, auDefaults),
    compute: function (v) {
      const s = new NC.Steps();
      const D = NC.need(v.D, 'Diameter', { positive: true });
      const L = NC.need(v.L, 'Length', { positive: true });
      if (L < D) NC.fail('The length must be at least the diameter (aspect ratio ≥ 1, a prolate rod).');
      const nmed = NC.need(v.nmed, 'Medium refractive index', { positive: true });
      const lams = lambdaGrid(v);
      const diel = dielectric(v, D / 2);
      const AR = L / D, a = D / 2, c = L / 2, V = (4 / 3) * PI * a * a * c, epsm = nmed * nmed;

      s.heading('1 · Geometry and depolarization factors');
      s.add({ title: 'Rod modelled as a prolate spheroid', formula: 'AR = L/D;   V = (4/3)π·a²·c,   a = D/2, c = L/2', tex: String.raw`\text{AR} = \dfrac{L}{D};\quad V = \dfrac{4}{3}\pi a^2 c`, sub: 'AR = ' + f(L) + ' / ' + f(D) + ';   V = (4/3)π × ' + f(a) + '² × ' + f(c), result: 'AR = ' + f(AR) + ';   V = ' + f(V) + ' nm³', ref: 'gans1912' });
      const Lp = gansL(AR), Lt = (1 - Lp) / 2, e = Math.sqrt(1 - 1 / (AR * AR));
      s.add({
        title: 'Depolarization factors',
        formula: 'e = √(1 − 1/AR²);   L_∥ = [(1 − e²)/e²]·[−1 + ln((1 + e)/(1 − e)) / (2e)];   L_⊥ = (1 − L_∥)/2',
        tex: String.raw`e = \sqrt{1 - \dfrac{1}{\text{AR}^2}};\quad L_\parallel = \dfrac{1 - e^2}{e^2}\left[-1 + \dfrac{1}{2e}\ln\dfrac{1 + e}{1 - e}\right];\quad L_\perp = \dfrac{1 - L_\parallel}{2}`,
        sub: 'e = ' + f(e),
        result: 'L_∥ = ' + f(Lp) + ';   L_⊥ = ' + f(Lt) + '   (sphere: 1/3)',
        ref: ['gans1912', 'bohren1983']
      });
      s.heading('2 · Polarizabilities and cross-sections');
      s.add({
        title: 'Quasi-static polarizability along each axis',
        formula: 'αᵢ = V(ε − ε_m) / [ε_m + Lᵢ(ε − ε_m)],   ε_m = n_med²',
        tex: String.raw`\alpha_i = \dfrac{V(\varepsilon - \varepsilon_m)}{\varepsilon_m + L_i(\varepsilon - \varepsilon_m)},\quad \varepsilon_m = n_{\text{med}}^2`,
        sub: 'ε_m = ' + f(nmed) + '² = ' + f(epsm),
        result: 'Resonance when Re ε = −ε_m(1 − Lᵢ)/Lᵢ:  longitudinal −' + f((epsm * (1 - Lp)) / Lp) + ',  transverse −' + f((epsm * (1 - Lt)) / Lt),
        ref: 'bohren1983'
      });
      const k = function (lam) { return (2 * PI * nmed) / lam; };
      const cExt = function (alpha, lam) { const kk = k(lam); return kk * alpha.im + (Math.pow(kk, 4) * cabs2(alpha)) / (6 * PI); };
      const cl = [], ct = [], cavg = [];
      lams.forEach(function (lam) {
        const ep = diel.eps(lam);
        const x1 = cExt(gansAlpha(ep, epsm, Lp, V), lam), x2 = cExt(gansAlpha(ep, epsm, Lt, V), lam);
        cl.push(x1); ct.push(x2); cavg.push((x1 + 2 * x2) / 3);
      });
      s.add({ title: 'Cross-sections (absorption + dipole scattering) and orientation average', formula: 'C_ext,i = k·Im αᵢ + k⁴|αᵢ|²/(6π),   k = 2π·n_med/λ;   ⟨C_ext⟩ = (C_∥ + 2C_⊥)/3', tex: String.raw`C_{\text{ext},i} = k\,\mathrm{Im}\,\alpha_i + \dfrac{k^4|\alpha_i|^2}{6\pi},\quad \langle C_{\text{ext}}\rangle = \dfrac{C_\parallel + 2C_\perp}{3}`, result: 'Computed at ' + lams.length + ' wavelengths', ref: 'bohren1983' });
      const pl = peakOf(lams, cl), pt = peakOf(lams, ct);
      diel.addSteps(s, pl.x);
      s.add({ title: 'Plasmon peaks', formula: 'λ_L = argmax C_∥(λ);   λ_T = argmax C_⊥(λ)', result: 'λ_L = ' + f(pl.x) + ' nm (longitudinal);   λ_T = ' + f(pt.x) + ' nm (transverse)' });

      // longitudinal peak vs aspect ratio (absorption, unit volume)
      const curve = [];
      for (let ar = 1; ar <= 6.0001; ar += 0.1) {
        const Lx = gansL(ar), ys = lams.map(function (lam) { return k(lam) * gansAlpha(diel.eps(lam), epsm, Lx, 1).im; });
        const p = peakOf(lams, ys);
        if (!p.edge) curve.push([ar, p.x]);
      }
      const warnings = diel.warn();
      if (pl.edge) warnings.push('The longitudinal peak lies at the edge of the wavelength range; extend the range.');
      if (L > 100) warnings.push('Quasi-static theory neglects retardation; for rods longer than ~100 nm the predicted peaks are increasingly too blue. Use full electrodynamic methods.');
      return {
        results: [
          { label: 'Longitudinal peak λ_L', value: pl.x, unit: 'nm', main: true },
          { label: 'Transverse peak λ_T', value: pt.x, unit: 'nm', main: true },
          { label: 'Aspect ratio', value: AR, main: true },
          { label: 'L_∥', value: Lp },
          { label: 'L_⊥', value: Lt },
          { label: 'C_ext,∥ at λ_L', value: pl.y, unit: 'nm²' },
          { label: 'Volume', value: V, unit: 'nm³' }
        ],
        steps: s.items,
        warnings: warnings,
        plots: [
          { title: 'Extinction cross-section', xlabel: 'Wavelength λ (nm)', ylabel: 'C_ext (nm²)', zeroY: true, series: [
            { name: 'Orientation average', mode: 'line', points: lams.map(function (l, i) { return [l, cavg[i]]; }) },
            { name: 'Longitudinal (∥)', mode: 'line', color: 1, dashed: true, points: lams.map(function (l, i) { return [l, cl[i]]; }) },
            { name: 'Transverse (⊥)', mode: 'line', color: 3, dashed: true, points: lams.map(function (l, i) { return [l, ct[i]]; }) }
          ] },
          { title: 'Longitudinal peak versus aspect ratio', xlabel: 'Aspect ratio L/D', ylabel: 'λ_L (nm)', series: [
            { name: 'Gans model', mode: 'line', points: curve },
            { name: 'This rod', mode: 'markers', color: 1, size: 5, points: [[AR, pl.x]] }
          ] }
        ],
        notes: [
          'Real nanorods are cylinders with rounded caps, not spheroids; at equal aspect ratio the spheroid model tends to place the longitudinal peak differently from measurements. Treat absolute positions as model estimates and trends as robust.',
          'Size damping uses the rod radius D/2 as the characteristic length.'
        ]
      };
    }
  });

  /* ================================================================== */
  /* Model-based size from the plasmon peak                              */
  /* ================================================================== */
  /** Peak position and FWHM of Q_ext for a sphere: 4 nm scan (300–900 nm), golden-section peak, bisected half-maximum crossings. */
  function peakAndWidth(D, nmed, eps) {
    const q = function (l) { return bhmie((PI * nmed * D) / l, cdiv(csqrt(eps(l)), cx(nmed))).qext; };
    const lams = [], ys = [];
    for (let l = 300; l <= 900; l += 4) { lams.push(l); ys.push(q(l)); }
    const p = peakOf(lams, ys);
    let lo = Math.max(300, lams[p.i] - 4), hi = Math.min(900, lams[p.i] + 4);
    const g = (Math.sqrt(5) - 1) / 2;
    let c1 = hi - g * (hi - lo), c2 = lo + g * (hi - lo), f1 = q(c1), f2 = q(c2);
    for (let it = 0; it < 18; it++) {
      if (f1 > f2) { hi = c2; c2 = c1; f2 = f1; c1 = hi - g * (hi - lo); f1 = q(c1); }
      else { lo = c1; c1 = c2; f1 = f2; c2 = lo + g * (hi - lo); f2 = q(c2); }
    }
    const lmax = (lo + hi) / 2, half = q(lmax) / 2;
    const bisect = function (a, b) { // q(a) and q(b) straddle half
      let fa = q(a) - half;
      for (let it = 0; it < 12; it++) {
        const mid = (a + b) / 2, fm = q(mid) - half;
        if ((fm < 0) === (fa < 0)) { a = mid; fa = fm; } else b = mid;
      }
      return (a + b) / 2;
    };
    let left = NaN, right = NaN;
    for (let i = p.i; i > 0; i--) if (ys[i - 1] < half) { left = bisect(lams[i - 1], Math.min(lams[i], lmax)); break; }
    for (let i = p.i; i < ys.length - 1; i++) if (ys[i + 1] < half) { right = bisect(lams[i + 1], Math.max(lams[i], lmax)); break; }
    return { lmax: lmax, fwhm: right - left, edge: p.edge };
  }
  NC.optics.peakAndWidth = peakAndWidth;

  NC.register({
    id: 'agsize',
    category: 'optical',
    title: 'Ag / Au sphere size from the plasmon peak (Mie model)',
    short: 'Estimate the diameter of Ag or Au spheres by inverting a Mie model of the plasmon peak',
    description:
      'Computes the plasmon peak position (and width) of spheres from 5 to 150 nm with Mie theory and a Drude model, then finds the diameter that matches your measured peak (and, if given, width). Model-based: the answer is only as good as the dielectric model and the assumption of isolated, spherical particles.',
    refs: ['mie1908', 'bohren1983', 'kreibig1995', 'ashcroft1976'],
    presets: PRESETS,
    presetNote: PRESET_NOTE,
    inputs: [NC.num('lpeak', 'Measured plasmon peak λ_max', 'nm', 410), NC.num('fwhm', 'Measured peak width FWHM (optional)', 'nm', NaN, { help: 'Optional consistency check: a much broader measured band than the model predicts indicates polydispersity, aggregation or non-spherical particles.' }), nmedInput].concat(dielectricInputs(agDefaults)),
    example: Object.assign({ lpeak: 410, nmed: 1.333, damp: 'on', A: 1 }, agDefaults),
    compute: function (v) {
      const s = new NC.Steps();
      const lm = NC.need(v.lpeak, 'Measured peak', { positive: true });
      const wm = NC.opt(v.fwhm, 'Measured width', { positive: true });
      const nmed = NC.need(v.nmed, 'Medium refractive index', { positive: true });
      if (v.model === 'nk') NC.fail('Size inversion uses the Drude model, because size-dependent damping needs it. Choose the Drude model.');
      // Follow the dipole branch: λ_max(D) rises with D until, for large spheres, the broad dipole band is
      // overtaken by a multipole peak and λ_max jumps back. The grid stops at that switch, so the inversion is unique.
      const grid = [];
      let Dswitch = null;
      for (let Dd = 5; Dd <= 150.0001; Dd += 2.5) {
        const pw = peakAndWidth(Dd, nmed, dielectric(v, Dd / 2).eps);
        if (grid.length && pw.lmax < grid[grid.length - 1].l - 0.05) { Dswitch = Dd; break; }
        grid.push({ D: Dd, l: pw.lmax, w: pw.fwhm });
      }
      const Dtop = grid[grid.length - 1].D;
      s.add({ title: 'Model: Mie theory with a Drude dielectric function (dipole branch)', formula: 'λ_max(D) and FWHM(D) from Q_ext(λ) for D = 5, 7.5, … nm', result: 'Model peak range ' + f(grid[0].l) + '–' + f(grid[grid.length - 1].l) + ' nm for D = 5–' + f(Dtop) + ' nm', note: Dswitch ? 'Above ~' + f(Dswitch) + ' nm the extinction maximum switches to a multipole (quadrupole) band, so larger sizes cannot be read from the main peak.' : undefined, ref: ['mie1908', 'bohren1983'] });
      let best = null;
      for (let i = 1; i < grid.length && !best; i++) {
        const a = grid[i - 1], b = grid[i];
        if ((a.l - lm) * (b.l - lm) <= 0 && a.l !== b.l) {
          const t = (lm - a.l) / (b.l - a.l);
          best = { D: a.D + t * (b.D - a.D), w: a.w + t * (b.w - a.w) };
        }
      }
      if (!best) NC.fail('No sphere diameter between 5 and ' + f(Dtop) + ' nm reproduces a peak at ' + f(lm) + ' nm with these model parameters (model range ' + f(grid[0].l) + '–' + f(grid[grid.length - 1].l) + ' nm). Check the medium index and model parameters.');
      s.add({ title: 'Diameter where the model peak equals the measured peak', formula: 'λ_max(D) = λ_measured   (linear interpolation between grid points)', sub: 'λ_measured = ' + f(lm) + ' nm', result: 'D = ' + f(best.D, 3) + ' nm;   model FWHM there = ' + f(best.w, 3) + ' nm' });
      const warnings = [];
      const flat = grid.filter(function (g) { return g.D <= 20; });
      const spread = Math.max.apply(null, flat.map(function (g) { return g.l; })) - Math.min.apply(null, flat.map(function (g) { return g.l; }));
      if (best.D < 20 && spread < 5) warnings.push('Below ~20 nm the model peak barely moves with size (' + f(spread, 2) + ' nm over 5–20 nm), so the peak position alone cannot determine the size reliably. Use TEM.');
      if (wm !== null) {
        const rel = (wm - best.w) / best.w;
        s.add({ title: 'Consistency check with the measured width', formula: '(FWHM_measured − FWHM_model) / FWHM_model', sub: '(' + f(wm) + ' − ' + f(best.w) + ') / ' + f(best.w), result: NC.fix(100 * rel, 0) + ' %' });
        if (rel > 0.3) warnings.push('The measured band is much broader than the model predicts for a single size. This points to polydispersity, aggregation or non-spherical particles.');
        if (rel < -0.3) warnings.push('The measured band is narrower than the model predicts; the damping parameters (γ, A) may be too large for this sample.');
      }
      return {
        results: [
          { label: 'Estimated diameter', value: best.D, unit: 'nm', main: true, sig: 3 },
          { label: 'Model FWHM at that size', value: best.w, unit: 'nm', main: true },
          { label: 'Valid model range', value: '5–' + f(Dtop) + ' nm' }
        ],
        steps: s.items,
        warnings: warnings,
        tables: [{ title: 'Model grid (every 4th point)', columns: ['D (nm)', 'λ_max (nm)', 'FWHM (nm)'], rows: grid.filter(function (g, i) { return i % 4 === 0; }).map(function (g) { return [f(g.D), f(g.l), f(g.w)]; }) }],
        plots: [{
          title: 'Model plasmon peak versus diameter', xlabel: 'Diameter D (nm)', ylabel: 'λ_max (nm)',
          series: [
            { name: 'Mie + Drude model', mode: 'line', points: grid.map(function (g) { return [g.D, g.l]; }) },
            { name: 'Measured peak', mode: 'line', dashed: true, color: 2, points: [[5, lm], [150, lm]] },
            { name: 'Estimate', mode: 'markers', color: 1, size: 5, points: [[best.D, lm]] }
          ]
        }],
        notes: ['Model-based estimate. Aggregation, non-spherical shapes, shells and the medium index all shift the peak. Confirm with TEM or DLS.']
      };
    }
  });

  /* ================================================================== */
  /* Relative photoluminescence quantum yield                            */
  /* ================================================================== */
  NC.register({
    id: 'plqy',
    category: 'optical',
    title: 'Photoluminescence quantum yield (relative method)',
    short: 'Quantum yield of a sample against a reference standard',
    description:
      'Relative photoluminescence quantum yield from integrated emission, absorbance at the excitation wavelength and solvent refractive indices of the sample and a reference standard, following the IUPAC technical report (Brouwer 2011).',
    refs: ['brouwer2011'],
    inputs: [
      NC.num('F', 'Integrated emission, sample F', '', 1.2e6),
      NC.num('Fr', 'Integrated emission, reference F_ref', '', 1.0e6),
      NC.num('A', 'Absorbance at excitation, sample A', '', 0.05),
      NC.num('Ar', 'Absorbance at excitation, reference A_ref', '', 0.06),
      NC.num('n', 'Solvent refractive index, sample n', '', 1.333),
      NC.num('nr', 'Solvent refractive index, reference n_ref', '', 1.333),
      NC.num('phiR', 'Quantum yield of the reference Φ_ref', '', 0.5, { help: 'Use the value recommended for your standard and conditions (see Brouwer 2011).' })
    ],
    example: { F: 1.2e6, Fr: 1.0e6, A: 0.05, Ar: 0.06, n: 1.333, nr: 1.333, phiR: 0.5 },
    compute: function (v) {
      const s = new NC.Steps();
      const F = NC.need(v.F, 'Sample emission', { positive: true }), Fr = NC.need(v.Fr, 'Reference emission', { positive: true });
      const A = NC.need(v.A, 'Sample absorbance', { positive: true }), Ar = NC.need(v.Ar, 'Reference absorbance', { positive: true });
      const n = NC.need(v.n, 'Sample refractive index', { positive: true }), nr = NC.need(v.nr, 'Reference refractive index', { positive: true });
      const phiR = NC.need(v.phiR, 'Reference quantum yield', { positive: true, max: 1 });
      const fS = 1 - Math.pow(10, -A), fR = 1 - Math.pow(10, -Ar);
      s.add({ title: 'Fraction of excitation light absorbed (absorptance)', formula: 'f = 1 − 10^(−A)', tex: String.raw`f = 1 - 10^{-A}`, sub: 'f = 1 − 10^(−' + f(A) + ');   f_ref = 1 − 10^(−' + f(Ar) + ')', result: 'f = ' + f(fS) + ';   f_ref = ' + f(fR), ref: 'brouwer2011' });
      const phi = phiR * (F / Fr) * (fR / fS) * ((n * n) / (nr * nr));
      s.add({ title: 'Relative quantum yield', formula: 'Φ = Φ_ref · (F/F_ref) · (f_ref/f) · (n²/n_ref²)', tex: String.raw`\Phi = \Phi_{\text{ref}}\,\dfrac{F}{F_{\text{ref}}}\,\dfrac{f_{\text{ref}}}{f}\,\dfrac{n^2}{n_{\text{ref}}^2}`, sub: 'Φ = ' + f(phiR) + ' × (' + f(F) + '/' + f(Fr) + ') × (' + f(fR) + '/' + f(fS) + ') × (' + f(n) + '²/' + f(nr) + '²)', result: 'Φ = ' + f(phi) + '  (' + NC.fix(phi * 100, 1) + ' %)', ref: 'brouwer2011' });
      const phiLin = phiR * (F / Fr) * (Ar / A) * ((n * n) / (nr * nr));
      s.add({ title: 'For comparison: the common linear approximation f ≈ A', formula: 'Φ ≈ Φ_ref · (F/F_ref) · (A_ref/A) · (n²/n_ref²)', tex: String.raw`\Phi \approx \Phi_{\text{ref}}\,\dfrac{F}{F_{\text{ref}}}\,\dfrac{A_{\text{ref}}}{A}\,\dfrac{n^2}{n_{\text{ref}}^2}`, result: 'Φ ≈ ' + f(phiLin) });
      const warnings = [];
      if (A > 0.1 || Ar > 0.1) warnings.push('Absorbance above 0.1 causes inner-filter effects and re-absorption. Dilute both solutions (A ≲ 0.1, ideally ≲ 0.05).');
      if (phi > 1) warnings.push('The result exceeds 1, which is not physical. Check the integrations, absorbances and the reference value.');
      return {
        results: [{ label: 'Quantum yield Φ', value: phi, main: true }, { label: 'Quantum yield', value: phi * 100, unit: '%', main: true }, { label: 'Linear approximation', value: phiLin }],
        steps: s.items,
        warnings: warnings,
        notes: ['Measure sample and reference with the same excitation wavelength, slits and detector settings, and correct emission spectra for the instrument response before integrating.']
      };
    }
  });

  /* ================================================================== */
  /* Urbach energy                                                       */
  /* ================================================================== */
  NC.register({
    id: 'urbach',
    category: 'optical',
    title: 'Urbach energy from the absorption tail',
    short: 'Width of the exponential band tail (disorder) from UV-vis data',
    description:
      'Below the band gap, the absorption coefficient often decays exponentially, α ∝ exp(E/E_U). The Urbach energy E_U, from a linear fit of ln α against photon energy, measures the width of the band tail (structural and thermal disorder).',
    refs: ['urbach1953', 'codata2018'],
    inputs: [
      NC.num('emin', 'Fit range start (optional)', 'eV', NaN, { help: 'Leave both blank to choose the tail automatically: from 2 % to 50 % of the maximum absorbance, below the edge.' }),
      NC.num('emax', 'Fit range end (optional)', 'eV', NaN),
      NC.data('data', 'Spectrum: λ (nm), absorbance (or α)', '', { placeholder: '350, 1.23\n352, 1.20\n…' })
    ],
    example: function () {
      const rows = [];
      for (let lam = 350; lam <= 700; lam += 2) {
        const E = NC.HC_EV_NM / lam;
        const A = E < 2.5 ? Math.exp((E - 2.5) / 0.08) : 1 + 0.3 * Math.sqrt(E - 2.5);
        rows.push(lam + ', ' + A.toPrecision(6));
      }
      return { data: rows.join('\n') };
    },
    compute: function (v) {
      const s = new NC.Steps();
      const rows = NC.parseRows(v.data, { min: 2, max: 2, labels: ['λ (nm)', 'absorbance'], name: 'Spectrum' });
      if (rows.length < 5) NC.fail('Paste at least 5 data rows.');
      const pts = rows.filter(function (r) { return r[0] > 0 && r[1] > 0; }).map(function (r) { return { E: NC.HC_EV_NM / r[0], A: r[1] }; }).sort(function (a, b) { return a.E - b.E; });
      if (pts.length < 5) NC.fail('At least 5 rows with positive absorbance are needed (ln α requires α > 0).');
      s.add({ title: 'Photon energy and logarithm of the absorption', formula: 'E = hc/λ;   y = ln α  (α ∝ absorbance; the scale factor only shifts y)', tex: String.raw`E = \dfrac{hc}{\lambda};\quad y = \ln\alpha`, sub: 'e.g. λ = ' + f(rows[0][0]) + ' nm → E = ' + f(NC.HC_EV_NM / rows[0][0]) + ' eV', result: pts.length + ' points', ref: 'codata2018' });
      const emin = NC.opt(v.emin, 'Fit start'), emax = NC.opt(v.emax, 'Fit end');
      let fit, how;
      if (emin !== null && emax !== null) {
        if (emax <= emin) NC.fail('The fit range end must be larger than its start.');
        fit = pts.filter(function (p) { return p.E >= emin && p.E <= emax; });
        how = 'user range';
      } else {
        const Amax = Math.max.apply(null, pts.map(function (p) { return p.A; }));
        let edge = pts.length - 1;
        for (let i = 0; i < pts.length; i++) if (pts[i].A >= 0.5 * Amax) { edge = i; break; }
        fit = pts.slice(0, edge).filter(function (p) { return p.A >= 0.02 * Amax; });
        how = 'automatic: 2–50 % of the maximum, below the edge';
      }
      if (fit.length < 4) NC.fail('Fewer than 4 points in the fit range. Widen the range or give it explicitly.');
      const lr = NC.stats.linreg(fit.map(function (p) { return p.E; }), fit.map(function (p) { return Math.log(p.A); }));
      if (!(lr.m > 0)) NC.fail('ln α does not increase with energy in this range, so there is no Urbach tail to fit.');
      const EU = 1 / lr.m;
      s.add({ title: 'Linear fit of the tail', formula: 'ln α = E/E_U + const   (least squares)', tex: String.raw`\ln\alpha = \dfrac{E}{E_U} + \text{const}`, sub: fit.length + ' points, ' + f(fit[0].E) + '–' + f(fit[fit.length - 1].E) + ' eV (' + how + ')', result: 'slope = ' + f(lr.m) + ' eV⁻¹;   R² = ' + NC.fix(lr.r2, 5), ref: 'urbach1953' });
      s.add({ title: 'Urbach energy', formula: 'E_U = 1 / slope', tex: String.raw`E_U = \dfrac{1}{\text{slope}}`, sub: 'E_U = 1 / ' + f(lr.m), result: 'E_U = ' + f(EU) + ' eV = ' + f(EU * 1000) + ' meV', ref: 'urbach1953' });
      const warnings = [];
      if (lr.r2 < 0.98) warnings.push('The tail is not well described by a single exponential in this range (R² = ' + NC.fix(lr.r2, 3) + '). Adjust the range.');
      const x0 = fit[0].E, x1 = fit[fit.length - 1].E;
      return {
        results: [{ label: 'Urbach energy E_U', value: EU * 1000, unit: 'meV', main: true }, { label: 'R²', value: lr.r2, sig: 5 }, { label: 'Fit range', value: f(x0) + '–' + f(x1) + ' eV' }],
        steps: s.items,
        warnings: warnings,
        plots: [{
          title: 'ln α versus photon energy', xlabel: 'Photon energy E (eV)', ylabel: 'ln α (arb.)',
          series: [
            { name: 'Data', mode: 'line', points: pts.map(function (p) { return [p.E, Math.log(p.A)]; }) },
            { name: 'Fit points', mode: 'markers', color: 3, size: 3, points: fit.map(function (p) { return [p.E, Math.log(p.A)]; }) },
            { name: 'Fit', mode: 'line', color: 1, points: [[x0, lr.m * x0 + lr.b], [x1, lr.m * x1 + lr.b]] }
          ]
        }],
        notes: ['Scattering, reflection losses and sub-gap defect absorption also raise the apparent tail; subtract a baseline first where possible.']
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
