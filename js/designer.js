/*
 * Layered particle designer (engine, no DOM).
 *
 * A spherical core with any number of concentric shells, an optional ligand
 * shell, a medium and a batch. compute(design) returns the standard NanoCalc
 * output { results, steps, tables, plots, figures, warnings, notes, refs, route }:
 *   1. geometry and composition of every layer, batch amounts
 *   2. optical spectrum by multilayer Mie theory (Yang 2003 recursion),
 *      cross-checked in tests against bhmie (homogeneous sphere) and an
 *      independent Bohren–Huffman coated-sphere routine (bhcoat, below)
 *   3. ligands per particle, ligand amounts, ligand-shell thickness,
 *      hydrodynamic diameter estimate
 *   4. a synthesis route with stoichiometric precursor amounts
 *
 * Design format (all lengths in nm):
 *   { core: { material, D, rho?, M?, optical },
 *     shells: [{ material, t, rho?, M?, optical }],
 *     ligand: { key, mode: 'footprint'|'density', value, length?, Mw?, nC?, a?, excess? } | null,
 *     medium: { n },
 *     batch: { volumeMl, massConc? (µg/mL), particleConc? (mL⁻¹) },
 *     lambda: { min, max, step } }
 *   optical: { model: 'drude', preset: 'Ag'|'Au'|'custom', epsInf, wp, gam, damp, A, vF }
 *          | { model: 'n', n, k } | { model: 'sellmeier', preset: 'SiO2' } | { model: 'nk', table } | { model: 'none' }
 */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt, PI = Math.PI;
  const NA = NC.C.NA;

  NC.addRefs({
    yang2003: { type: 'article', authors: 'Yang, W.', title: 'Improved recursive algorithm for light scattering by a multilayered sphere', journal: 'Appl. Opt.', year: 2003, volume: '42', pages: '1710–1720', doi: '10.1364/AO.42.001710' },
    malitson1965: { type: 'article', authors: 'Malitson, I. H.', title: 'Interspecimen comparison of the refractive index of fused silica', journal: 'J. Opt. Soc. Am.', year: 1965, volume: '55', pages: '1205–1209', doi: '10.1364/JOSA.55.001205' },
    love2005: { type: 'article', authors: 'Love, J. C.; Estroff, L. A.; Kriebel, J. K.; Nuzzo, R. G.; Whitesides, G. M.', title: 'Self-assembled monolayers of thiolates on metals as a form of nanotechnology', journal: 'Chem. Rev.', year: 2005, volume: '105', pages: '1103–1169', doi: '10.1021/cr0300789' },
    degennes1980: { type: 'article', authors: 'de Gennes, P. G.', title: 'Conformations of polymers attached to an interface', journal: 'Macromolecules', year: 1980, volume: '13', pages: '1069–1075', doi: '10.1021/ma60077a009' },
    alexander1977: { type: 'article', authors: 'Alexander, S.', title: 'Adsorption of chain molecules with a polar head: a scaling description', journal: 'J. Phys. (Paris)', year: 1977, volume: '38', pages: '983–987', doi: '10.1051/jphys:01977003808098300' }
  });

  /* ------------------------------------------------------------------ */
  /* Complex arithmetic (local, so the engine does not depend on load    */
  /* order; same conventions as NC.optics: {re, im}, m = n + ik)         */
  /* ------------------------------------------------------------------ */
  const cx = function (re, im) { return { re: re, im: im || 0 }; };
  const add = function (a, b) { return { re: a.re + b.re, im: a.im + b.im }; };
  const sub = function (a, b) { return { re: a.re - b.re, im: a.im - b.im }; };
  const mul = function (a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; };
  const div = function (a, b) {
    const d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  };
  const scl = function (a, s) { return { re: a.re * s, im: a.im * s }; };
  const abs2 = function (a) { return a.re * a.re + a.im * a.im; };
  const cabs = function (a) { return Math.sqrt(abs2(a)); };
  const csqrt = function (a) {
    const r = Math.sqrt(Math.sqrt(abs2(a))), th = Math.atan2(a.im, a.re) / 2;
    return { re: r * Math.cos(th), im: r * Math.sin(th) };
  };
  /** e^{iz} */
  const cexpi = function (z) { const e = Math.exp(-z.im); return { re: e * Math.cos(z.re), im: e * Math.sin(z.re) }; };
  const csin = function (z) { return { re: Math.sin(z.re) * Math.cosh(z.im), im: Math.cos(z.re) * Math.sinh(z.im) }; };
  const ccos = function (z) { return { re: Math.cos(z.re) * Math.cosh(z.im), im: -Math.sin(z.re) * Math.sinh(z.im) }; };
  const I = { re: 0, im: 1 };
  const ONE = { re: 1, im: 0 };
  const fc = function (z, sig) { sig = sig || 4; return f(z.re, sig) + (z.im >= 0 ? ' + ' : ' − ') + f(Math.abs(z.im), sig) + 'i'; };

  /* ------------------------------------------------------------------ */
  /* Multilayer Mie theory: Yang (2003) recursive algorithm              */
  /* xs[l] = 2π·n_med·r_l/λ (size parameter of the outer interface of    */
  /* layer l, increasing outward), ms[l] = relative complex index of     */
  /* layer l (layer 0 is the core).                                      */
  /* ------------------------------------------------------------------ */

  /** Logarithmic derivative D1_n(z) = ψ_n′/ψ_n by downward recurrence from nmx (Yang 2003 eq. 13). */
  function logDerivDown(z, nmx, nstop) {
    const D = new Array(nstop + 1);
    let d = cx(0, 0);
    for (let n = nmx; n >= 1; n--) {
      const nz = div(cx(n), z);
      d = sub(nz, div(ONE, add(d, nz))); // D_{n-1}
      if (n - 1 <= nstop) D[n - 1] = d;
    }
    return D;
  }
  /** D3_n(z) = ξ_n′/ξ_n by upward recurrence through ψ_nξ_n (Yang 2003 eqs. 18–21). */
  function logDeriv3(z, D1, nstop) {
    const D3 = new Array(nstop + 1);
    // ψ0ξ0 = ½[1 − e^{2iz}]
    const e2 = cexpi(scl(z, 2));
    let pz = scl(sub(ONE, e2), 0.5);
    D3[0] = I;
    for (let n = 1; n <= nstop; n++) {
      const nz = div(cx(n), z);
      pz = mul(pz, mul(sub(nz, D1[n - 1]), sub(nz, D3[n - 1])));
      D3[n] = add(D1[n], div(I, pz));
    }
    return D3;
  }

  function mieMulti(xs, ms) {
    const L = xs.length;
    if (!L || ms.length !== L) throw new Error('mieMulti: xs and ms must have the same length');
    const xL = xs[L - 1];
    const nstop = Math.max(1, Math.round(xL + 4 * Math.cbrt(xL) + 2));
    let zmax = nstop;
    for (let l = 0; l < L; l++) {
      const ml = cabs(ms[l]);
      zmax = Math.max(zmax, ml * xs[l]);
      if (l > 0) zmax = Math.max(zmax, ml * xs[l - 1]);
    }
    // Start of the downward recurrence for D1. The error of the arbitrary start value decays only once
    // n exceeds |z| by several widths of the Airy transition (~|z|^(1/3)); "+ 15" alone (Bohren–Huffman)
    // leaves ~1e-8 errors at |z| ≈ 40, which the layer recursion (unlike a homogeneous sphere) exposes.
    const nmx = Math.round(zmax + 4 * Math.cbrt(zmax) + 15);

    // core: Ha = Hb = D1_n(m1 x1)
    let Ha = logDerivDown(scl(ms[0], xs[0]), nmx, nstop);
    let Hb = Ha.slice();
    for (let l = 1; l < L; l++) {
      const m = ms[l], mp = ms[l - 1];
      const z1 = scl(m, xs[l - 1]), z2 = scl(m, xs[l]);
      const D1a = logDerivDown(z1, nmx, nstop), D1b = logDerivDown(z2, nmx, nstop);
      const D3a = logDeriv3(z1, D1a, nstop), D3b = logDeriv3(z2, D1b, nstop);
      // Q_0 = [ψ0/ξ0](z1) / [ψ0/ξ0](z2) = e^{2i(z2−z1)}·(e^{2iz1} − 1)/(e^{2iz2} − 1)  (stable for Im z ≥ 0)
      let Q = mul(cexpi(scl(sub(z2, z1), 2)), div(sub(cexpi(scl(z1, 2)), ONE), sub(cexpi(scl(z2, 2)), ONE)));
      const r2 = (xs[l - 1] / xs[l]) * (xs[l - 1] / xs[l]);
      const nHa = new Array(nstop + 1), nHb = new Array(nstop + 1);
      for (let n = 1; n <= nstop; n++) {
        // Q_n = Q_{n−1}·(x_{l−1}/x_l)²·[z2D1_n(z2) + n][n − z2D3_{n−1}(z2)] / ([z1D1_n(z1) + n][n − z1D3_{n−1}(z1)])
        const num = mul(add(mul(z2, D1b[n]), cx(n)), sub(cx(n), mul(z2, D3b[n - 1])));
        const den = mul(add(mul(z1, D1a[n]), cx(n)), sub(cx(n), mul(z1, D3a[n - 1])));
        Q = scl(mul(Q, div(num, den)), r2);
        // electric (a) recursion
        const G1 = sub(mul(m, Ha[n]), mul(mp, D1a[n]));
        const G2 = sub(mul(m, Ha[n]), mul(mp, D3a[n]));
        const QG1 = mul(Q, G1);
        nHa[n] = div(sub(mul(G2, D1b[n]), mul(QG1, D3b[n])), sub(G2, QG1));
        // magnetic (b) recursion
        const G1b = sub(mul(mp, Hb[n]), mul(m, D1a[n]));
        const G2b = sub(mul(mp, Hb[n]), mul(m, D3a[n]));
        const QG1b = mul(Q, G1b);
        nHb[n] = div(sub(mul(G2b, D1b[n]), mul(QG1b, D3b[n])), sub(G2b, QG1b));
      }
      Ha = nHa; Hb = nHb;
    }

    // scattering coefficients at the outer surface (real x_L), Riccati–Bessel ψ, χ (ξ = ψ − iχ) upward
    const x = xL, mL = ms[L - 1];
    let psi0 = Math.cos(x), psi1 = Math.sin(x), chi0 = -Math.sin(x), chi1 = Math.cos(x);
    let xi1 = cx(psi1, -chi1);
    let qsca = 0, qext = 0, qbk = cx(0, 0);
    const an = [], bn = [];
    for (let n = 1; n <= nstop; n++) {
      const psi = ((2 * n - 1) * psi1) / x - psi0;
      const chi = ((2 * n - 1) * chi1) / x - chi0;
      const xi = cx(psi, -chi);
      const ha = add(div(Ha[n], mL), cx(n / x));
      const a = div(sub(scl(ha, psi), cx(psi1)), sub(mul(ha, xi), xi1));
      const hb = add(mul(mL, Hb[n]), cx(n / x));
      const b = div(sub(scl(hb, psi), cx(psi1)), sub(mul(hb, xi), xi1));
      an.push(a); bn.push(b);
      qsca += (2 * n + 1) * (abs2(a) + abs2(b));
      qext += (2 * n + 1) * (a.re + b.re);
      qbk = add(qbk, scl(sub(a, b), (2 * n + 1) * (n % 2 ? -1 : 1)));
      psi0 = psi1; psi1 = psi; chi0 = chi1; chi1 = chi; xi1 = cx(psi1, -chi1);
    }
    qsca *= 2 / (x * x);
    qext *= 2 / (x * x);
    return { qext: qext, qsca: qsca, qabs: qext - qsca, qback: abs2(qbk) / (x * x), nstop: nstop, nmx: nmx, an: an, bn: bn };
  }

  /* ------------------------------------------------------------------ */
  /* Coated sphere: BHCOAT (Bohren & Huffman 1983, Appendix B).          */
  /* Independent of mieMulti: upward logarithmic derivatives and the     */
  /* χ functions of the shell, as in the original routine.               */
  /* x = core size parameter, y = outer size parameter, m1 core, m2      */
  /* shell (relative indices).                                           */
  /* ------------------------------------------------------------------ */
  function bhcoat(x, y, m1, m2, del) {
    const DEL = del === undefined ? 1e-8 : del; // B&H: drop the core terms once they are below DEL
    const x1 = scl(m1, x), x2 = scl(m2, x), y2 = scl(m2, y);
    const nstop = Math.round(y + 4 * Math.cbrt(y) + 2);
    const refrel = div(m2, m1);
    const cot = function (z) { return div(ccos(z), csin(z)); };
    let d0x1 = cot(x1), d0x2 = cot(x2), d0y2 = cot(y2);
    let psi0y = Math.cos(y), psi1y = Math.sin(y), chi0y = -Math.sin(y), chi1y = Math.cos(y);
    let xi1y = cx(psi1y, -chi1y);
    let chi0y2 = scl(csin(y2), -1), chi1y2 = ccos(y2), chi0x2 = scl(csin(x2), -1), chi1x2 = ccos(x2);
    let qsca = 0, qext = 0, iflag = false;
    let d1x1 = d0x1, d1x2 = d0x2;
    for (let n = 1; n <= nstop; n++) {
      const rn = n;
      const psiy = ((2 * rn - 1) * psi1y) / y - psi0y;
      const chiy = ((2 * rn - 1) * chi1y) / y - chi0y;
      const xiy = cx(psiy, -chiy);
      const ny2 = div(cx(rn), y2);
      const d1y2 = sub(div(ONE, sub(ny2, d0y2)), ny2);
      let chix2 = chi1x2, chiy2 = chi1y2, dnbar = d1y2, gnbar = d1y2;
      if (!iflag) {
        const nx1 = div(cx(rn), x1), nx2 = div(cx(rn), x2);
        d1x1 = sub(div(ONE, sub(nx1, d0x1)), nx1);
        d1x2 = sub(div(ONE, sub(nx2, d0x2)), nx2);
        chix2 = sub(mul(div(cx(2 * rn - 1), x2), chi1x2), chi0x2);
        chiy2 = sub(mul(div(cx(2 * rn - 1), y2), chi1y2), chi0y2);
        const chipx2 = sub(chi1x2, mul(div(cx(rn), x2), chix2));
        const chipy2 = sub(chi1y2, mul(div(cx(rn), y2), chiy2));
        let ancap = sub(mul(refrel, d1x1), d1x2);
        ancap = div(ancap, sub(mul(mul(refrel, d1x1), chix2), chipx2));
        ancap = div(ancap, sub(mul(chix2, d1x2), chipx2));
        const brack = mul(ancap, sub(mul(chiy2, d1y2), chipy2));
        let bncap = sub(mul(refrel, d1x2), d1x1);
        bncap = div(bncap, sub(mul(refrel, chipx2), mul(d1x1, chix2)));
        bncap = div(bncap, sub(mul(chix2, d1x2), chipx2));
        const crack = mul(bncap, sub(mul(chiy2, d1y2), chipy2));
        const ad = cabs(d1y2);
        if (cabs(mul(brack, chipy2)) > DEL * ad || cabs(mul(brack, chiy2)) > DEL || cabs(mul(crack, chipy2)) > DEL * ad || cabs(mul(crack, chiy2)) > DEL) {
          dnbar = div(sub(d1y2, mul(brack, chipy2)), sub(ONE, mul(brack, chiy2)));
          gnbar = div(sub(d1y2, mul(crack, chipy2)), sub(ONE, mul(crack, chiy2)));
        } else {
          iflag = true; // the core no longer affects higher orders: continue as a homogeneous sphere of the shell
        }
      }
      const ha = add(div(dnbar, m2), cx(rn / y));
      const an = div(sub(scl(ha, psiy), cx(psi1y)), sub(mul(ha, xiy), xi1y));
      const hb = add(mul(m2, gnbar), cx(rn / y));
      const bn = div(sub(scl(hb, psiy), cx(psi1y)), sub(mul(hb, xiy), xi1y));
      qsca += (2 * rn + 1) * (abs2(an) + abs2(bn));
      qext += (2 * rn + 1) * (an.re + bn.re);
      psi0y = psi1y; psi1y = psiy; chi0y = chi1y; chi1y = chiy; xi1y = cx(psi1y, -chi1y);
      chi0x2 = chi1x2; chi1x2 = chix2; chi0y2 = chi1y2; chi1y2 = chiy2;
      d0x1 = d1x1; d0x2 = d1x2; d0y2 = d1y2;
    }
    qsca *= 2 / (y * y);
    qext *= 2 / (y * y);
    return { qext: qext, qsca: qsca, qabs: qext - qsca, nstop: nstop };
  }

  /* ------------------------------------------------------------------ */
  /* Formula masses (IUPAC 2021 standard atomic weights, conventional)   */
  /* ------------------------------------------------------------------ */
  const AW = { H: 1.008, C: 12.011, N: 14.007, O: 15.999, Na: 22.990, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ti: 47.867, Fe: 55.845, Zn: 65.38, Se: 78.971, Br: 79.904, Cd: 112.41, Pt: 195.084, Au: 196.967, Ag: 107.868, Cu: 63.546, Pd: 106.42 };
  /** Parse a formula such as "C19H42BrN", "Si(OC2H5)4" or "HAuCl4·3H2O" into element counts. */
  function parseFormula(s) {
    const parts = String(s).split('·');
    const total = {};
    parts.forEach(function (p) {
      const m = /^(\d+)(.*)$/.exec(p);
      const mult = m ? Number(m[1]) : 1;
      const body = m ? m[2] : p;
      let i = 0;
      const group = function () {
        const out = {};
        while (i < body.length && body[i] !== ')') {
          let part;
          if (body[i] === '(') { i++; part = group(); i++; }
          else {
            const e = /^[A-Z][a-z]?/.exec(body.slice(i));
            if (!e || AW[e[0]] === undefined) throw new Error('Unknown element in formula ' + s);
            i += e[0].length;
            part = {}; part[e[0]] = 1;
          }
          const c = /^\d+/.exec(body.slice(i));
          const k = c ? Number(c[0]) : 1;
          if (c) i += c[0].length;
          Object.keys(part).forEach(function (el) { out[el] = (out[el] || 0) + part[el] * k; });
        }
        return out;
      };
      const g = group();
      Object.keys(g).forEach(function (el) { total[el] = (total[el] || 0) + g[el] * mult; });
    });
    return total;
  }
  function formulaMass(s) {
    const c = parseFormula(s);
    return Object.keys(c).reduce(function (sum, el) { return sum + AW[el] * c[el]; }, 0);
  }

  /* Chemical formula of each material preset (for the element mass balance). */
  const FORMULA = { Au: 'Au', Ag: 'Ag', Pt: 'Pt', Pd: 'Pd', Cu: 'Cu', Fe: 'Fe', SiO2: 'SiO2', TiO2a: 'TiO2', TiO2r: 'TiO2', Fe3O4: 'Fe3O4', Fe2O3: 'Fe2O3', ZnS: 'ZnS', CdSe: 'CdSe', CdS: 'CdS' };
  /* Precursors with a fixed stoichiometry to the formula unit (mol precursor per mol formula unit). */
  const PRECURSORS = {
    SiO2: [{ name: 'TEOS, tetraethyl orthosilicate', formula: 'Si(OC2H5)4', per: 1 }],
    Au: [{ name: 'HAuCl₄·3H₂O', formula: 'HAuCl4·3H2O', per: 1 }],
    Ag: [{ name: 'AgNO₃', formula: 'AgNO3', per: 1 }],
    Pt: [{ name: 'H₂PtCl₆·6H₂O', formula: 'H2PtCl6·6H2O', per: 1 }],
    TiO2a: [{ name: 'Titanium(IV) isopropoxide, Ti(OCH(CH₃)₂)₄', formula: 'Ti(OC3H7)4', per: 1 }],
    TiO2r: [{ name: 'Titanium(IV) isopropoxide, Ti(OCH(CH₃)₂)₄', formula: 'Ti(OC3H7)4', per: 1 }],
    Fe3O4: [{ name: 'Fe(acac)₃, iron(III) acetylacetonate', formula: 'Fe(C5H7O2)3', per: 3 }]
  };

  /* ------------------------------------------------------------------ */
  /* Ligands                                                             */
  /* ------------------------------------------------------------------ */
  const ALKANETHIOL_FOOTPRINT = 0.214; // nm², (√3×√3)R30° on Au(111), Love et al. 2005
  const PEG_MONOMER = 'C2H4O';
  const LIGANDS = {
    alkanethiol: { label: 'Alkanethiol SAM, HS(CH₂)ₙ₋₁CH₃', footprint: ALKANETHIOL_FOOTPRINT, needsN: true },
    'PEG-thiol': { label: 'Thiol-PEG (HS–PEG), polymer brush', polymer: true },
    MUA: { label: '11-Mercaptoundecanoic acid (MUA)', formula: 'C11H22O2S' },
    citrate: { label: 'Citrate (C₆H₅O₇³⁻)', formula: 'C6H5O7' },
    CTAB: { label: 'CTAB (cetyltrimethylammonium bromide)', formula: 'C19H42BrN' },
    'oleic-acid': { label: 'Oleic acid', formula: 'C18H34O2' },
    oleylamine: { label: 'Oleylamine', formula: 'C18H37N' },
    TOPO: { label: 'TOPO (trioctylphosphine oxide)', formula: 'C24H51OP' },
    TDPA: { label: 'TDPA (tetradecylphosphonic acid)', formula: 'C14H31O3P' },
    custom: { label: 'Other ligand (enter its molar mass)' }
  };

  /* ------------------------------------------------------------------ */
  /* Optical models                                                      */
  /* ------------------------------------------------------------------ */
  function drudePreset(key) {
    const P = (NC.optics && NC.optics.presets) || [];
    const want = key === 'Ag' ? /^Silver/ : /^Gold/;
    const p = P.filter(function (q) { return want.test(q.label); })[0];
    return p ? p.values : null;
  }
  function defaultOptical(material) {
    if (material === 'Au' || material === 'Ag') return { model: 'drude', preset: material, damp: material === 'Ag' };
    if (material === 'SiO2') return { model: 'sellmeier', preset: 'SiO2' };
    return { model: 'none' };
  }
  /** Malitson (1965) Sellmeier equation for fused silica, λ in µm, 0.21–3.71 µm, 20 °C. */
  function nSilica(lamNm) {
    const l2 = (lamNm / 1000) * (lamNm / 1000);
    return Math.sqrt(1 + (0.6961663 * l2) / (l2 - 0.0684043 * 0.0684043) + (0.4079426 * l2) / (l2 - 0.1162414 * 0.1162414) + (0.8974794 * l2) / (l2 - 9.896161 * 9.896161));
  }
  function drudeEps(E, epsInf, wp, gam) {
    const den = E * E + gam * gam;
    return cx(epsInf - (wp * wp) / den, (wp * wp * gam) / (E * den));
  }
  const HBAR_EVS = NC.C.hbar / NC.C.e;

  /** Build a refractive-index function N(λ) (complex, absolute) for a layer. R = core radius for size damping. */
  function opticalModel(o, name, isCore, R) {
    o = o || { model: 'none' };
    const model = o.model || 'none';
    if (model === 'none') return null;
    if (model === 'n') {
      const n = NC.need(o.n, name + ': refractive index n', { positive: true });
      const k = NC.need(o.k === undefined || o.k === null || o.k === '' ? 0 : Number(o.k), name + ': extinction coefficient k', { nonneg: true });
      const N = cx(n, k);
      return { N: function () { return N; }, model: model, describe: 'constant n + ik = ' + fc(N) + ' (your value)', refs: [] };
    }
    if (model === 'sellmeier') {
      return {
        N: function (lam) { return cx(nSilica(lam), 0); }, model: model, range: [210, 3710],
        describe: 'Sellmeier equation for fused silica (Malitson 1965)', refs: ['malitson1965']
      };
    }
    if (model === 'nk') {
      const rows = NC.parseRows(o.table, { min: 3, max: 3, labels: ['λ (nm)', 'n', 'k'], name: name + ': n, k table' }).sort(function (a, b) { return a[0] - b[0]; });
      if (rows.length < 2) NC.fail(name + ': paste at least two rows of λ (nm), n, k.');
      rows.forEach(function (r) { if (!(r[0] > 0) || !(r[1] > 0) || r[2] < 0) NC.fail(name + ': n, k table wavelengths and n must be positive and k ≥ 0.'); });
      return {
        model: model, range: [rows[0][0], rows[rows.length - 1][0]], table: true,
        describe: 'pasted n, k table (' + rows.length + ' rows, linear interpolation)', refs: [],
        N: function (lam) {
          if (lam <= rows[0][0]) return cx(rows[0][1], rows[0][2]);
          const last = rows[rows.length - 1];
          if (lam >= last[0]) return cx(last[1], last[2]);
          let i = 1;
          while (rows[i][0] < lam) i++;
          const r0 = rows[i - 1], r1 = rows[i], t = (lam - r0[0]) / (r1[0] - r0[0]);
          return cx(r0[1] + t * (r1[1] - r0[1]), r0[2] + t * (r1[2] - r0[2]));
        }
      };
    }
    if (model === 'drude') {
      const p = o.preset && o.preset !== 'custom' ? drudePreset(o.preset) : null;
      if (o.preset && o.preset !== 'custom' && !p) NC.fail(name + ': the ' + o.preset + ' Drude preset needs js/calculators/optics.js.');
      const pick = function (k) { return o[k] !== undefined && o[k] !== null && o[k] !== '' ? Number(o[k]) : p ? p[k] : undefined; };
      const epsInf = NC.need(pick('epsInf'), name + ': background permittivity ε∞', { positive: true });
      const wp = NC.need(pick('wp'), name + ': plasma energy ħωp', { positive: true });
      const gam = NC.need(pick('gam'), name + ': damping ħγ', { positive: true });
      let gEff = gam, dampNote = null;
      if (o.damp && isCore) {
        const A = NC.need(o.A === undefined || o.A === null || o.A === '' ? 1 : Number(o.A), name + ': surface-scattering constant A', { nonneg: true });
        const vF = NC.need(pick('vF'), name + ': Fermi velocity v_F', { positive: true });
        gEff = gam + (A * HBAR_EVS * vF * 1e6) / (R * 1e-9);
        dampNote = { A: A, vF: vF, gam: gam, R: R };
      }
      return {
        model: model, epsInf: epsInf, wp: wp, gEff: gEff, damp: dampNote, shellDampIgnored: !!(o.damp && !isCore),
        describe: 'Drude model ε∞ = ' + f(epsInf) + ', ħωp = ' + f(wp) + ' eV, ħγ = ' + f(gEff) + ' eV' + (p ? ' (' + o.preset + ' free-electron preset)' : ' (your values)'),
        refs: ['kreibig1995', 'ashcroft1976'],
        eps: function (lam) { return drudeEps(NC.HC_EV_NM / lam, epsInf, wp, gEff); },
        N: function (lam) { return csqrt(drudeEps(NC.HC_EV_NM / lam, epsInf, wp, gEff)); }
      };
    }
    NC.fail(name + ': unknown optical model "' + model + '".');
  }

  /* ------------------------------------------------------------------ */
  /* Defaults and example designs                                        */
  /* ------------------------------------------------------------------ */
  const clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  const BASE = {
    medium: { n: 1.333 },
    batch: { volumeMl: 10, massConc: 50 },
    lambda: { min: 300, max: 900, step: 2 }
  };
  const PRESET_DESIGNS = [
    {
      id: 'au-sio2', label: 'Au@SiO₂ (20 nm core, 15 nm silica shell)',
      design: { core: { material: 'Au', D: 20, optical: { model: 'drude', preset: 'Au', damp: true } }, shells: [{ material: 'SiO2', t: 15, optical: { model: 'sellmeier', preset: 'SiO2' } }], ligand: null }
    },
    {
      id: 'fe3o4-sio2-au', label: 'Fe₃O₄@SiO₂@Au nanoshell-type (10 nm core, 30 nm silica, 8 nm gold)',
      design: { core: { material: 'Fe3O4', D: 10, optical: { model: 'none' } }, shells: [{ material: 'SiO2', t: 30, optical: { model: 'sellmeier', preset: 'SiO2' } }, { material: 'Au', t: 8, optical: { model: 'drude', preset: 'Au' } }], ligand: null }
    },
    {
      id: 'cdse-zns', label: 'CdSe/ZnS quantum dot with oleylamine (4 nm core, 1 nm shell)',
      design: { core: { material: 'CdSe', D: 4, optical: { model: 'none' } }, shells: [{ material: 'ZnS', t: 1, optical: { model: 'none' } }], ligand: { key: 'oleylamine', mode: 'density', value: null, length: null, excess: 1 }, medium: { n: 1.496 }, batch: { volumeMl: 5, massConc: 1000 }, lambda: { min: 300, max: 700, step: 2 } }
    },
    {
      id: 'au-peg', label: 'Au–PEG-thiol (20 nm Au, 5 kDa mPEG-SH, 1 chain/nm²)',
      design: { core: { material: 'Au', D: 20, optical: { model: 'drude', preset: 'Au', damp: true } }, shells: [], ligand: { key: 'PEG-thiol', mode: 'density', value: 1, Mw: 5000, a: 0.35, excess: 10 } }
    }
  ];
  function presetDesigns() {
    return PRESET_DESIGNS.map(function (p) {
      return { id: p.id, label: p.label, design: Object.assign(clone(BASE), clone(p.design)) };
    });
  }
  function defaults() { return presetDesigns()[0].design; }

  /* ------------------------------------------------------------------ */
  /* Validation                                                          */
  /* ------------------------------------------------------------------ */
  function material(layer, name) {
    if (!layer || typeof layer !== 'object') NC.fail(name + ' is missing.');
    const key = layer.material;
    if (key === 'custom') {
      return {
        key: 'custom', custom: true, label: layer.label || 'custom material',
        rho: NC.need(layer.rho, name + ': density ρ (custom material)', { positive: true }),
        M: NC.need(layer.M, name + ': molar mass M (custom material)', { positive: true })
      };
    }
    const m = NC.materials[key];
    if (!m) NC.fail(name + ': choose a material (unknown "' + key + '").');
    const rho = layer.rho !== undefined && layer.rho !== null && layer.rho !== '' ? NC.need(Number(layer.rho), name + ': density ρ', { positive: true }) : m.rho;
    const M = layer.M !== undefined && layer.M !== null && layer.M !== '' ? NC.need(Number(layer.M), name + ': molar mass M', { positive: true }) : m.M;
    return { key: key, label: m.label, short: key.replace(/(\d)/g, function (d) { return '₀₁₂₃₄₅₆₇₈₉'[d]; }).replace(/[ar]$/, ''), rho: rho, M: M, overridden: rho !== m.rho || M !== m.M, note: m.note };
  }
  const shortName = function (m) { return m.custom ? m.label : m.short; };
  const subDigits = function (s) { return String(s).replace(/(\d)/g, function (d) { return '₀₁₂₃₄₅₆₇₈₉'[d]; }); };

  function lambdaGrid(l) {
    l = l || {};
    const a = NC.need(l.min, 'Start wavelength', { positive: true });
    const b = NC.need(l.max, 'End wavelength', { positive: true });
    const st = NC.need(l.step, 'Wavelength step', { positive: true });
    if (b <= a) NC.fail('The end wavelength must be larger than the start wavelength.');
    const n = Math.floor((b - a) / st + 1e-9) + 1;
    if (n > 2001) NC.fail('Too many wavelengths (' + n + '). Use a larger step (at most 2001 points).');
    if (n < 3) NC.fail('Use at least three wavelengths (smaller step or wider range).');
    const out = [];
    for (let i = 0; i < n; i++) out.push(a + i * st);
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Geometry                                                            */
  /* ------------------------------------------------------------------ */
  function geometry(design) {
    if (!design || typeof design !== 'object') NC.fail('No design given.');
    const core = design.core;
    if (!core) NC.fail('The design needs a core.');
    const D = NC.need(Number(core.D), 'Core diameter', { positive: true, max: 20000 });
    const shells = design.shells || [];
    if (!Array.isArray(shells)) NC.fail('Shells must be a list.');
    if (shells.length > 12) NC.fail('At most 12 shells are supported.');
    const layers = [];
    let r = D / 2;
    const cm = material(core, 'Core');
    layers.push({ role: 'core', name: 'Core', mat: cm, rIn: 0, rOut: r, t: D, src: core });
    shells.forEach(function (s, i) {
      const name = 'Shell ' + (i + 1);
      const t = NC.need(Number(s && s.t), name + ' thickness', { positive: true, max: 20000 });
      const m = material(s, name);
      layers.push({ role: 'shell', name: name, mat: m, rIn: r, rOut: r + t, t: t, src: s, index: i });
      r += t;
    });
    let Vtot = 0, mtot = 0;
    layers.forEach(function (L) {
      L.V = (4 / 3) * PI * (Math.pow(L.rOut, 3) - Math.pow(L.rIn, 3));
      L.mass = L.mat.rho * L.V * 1e-21;
      L.N = (L.mass * NA) / L.mat.M;
      Vtot += L.V; mtot += L.mass;
    });
    layers.forEach(function (L) { L.vf = L.V / Vtot; L.wf = L.mass / mtot; });
    const R = r;
    const A = 4 * PI * R * R;
    return { layers: layers, R: R, Dout: 2 * R, V: Vtot, mass: mtot, rhoEff: mtot / (Vtot * 1e-21), A: A, ssa: (A * 1e-18) / mtot };
  }

  /* ------------------------------------------------------------------ */
  /* Optical spectrum                                                    */
  /* ------------------------------------------------------------------ */
  function spectrum(geo, design, lams) {
    const nmed = NC.need(Number(design.medium && design.medium.n), 'Refractive index of the medium', { positive: true });
    const models = geo.layers.map(function (L) {
      return opticalModel(L.src.optical || defaultOptical(L.mat.key), L.name + ' (' + shortName(L.mat) + ')', L.role === 'core', geo.layers[0].rOut);
    });
    const missing = geo.layers.filter(function (L, i) { return !models[i]; }).map(function (L) { return L.name + ' (' + shortName(L.mat) + ')'; });
    if (missing.length) return { missing: missing, nmed: nmed };
    const radii = geo.layers.map(function (L) { return L.rOut; });
    const qe = [], qs = [], qa = [];
    for (let j = 0; j < lams.length; j++) {
      const lam = lams[j], k = (2 * PI * nmed) / lam;
      const xs = radii.map(function (r) { return k * r; });
      const ms = models.map(function (mo) { return scl(mo.N(lam), 1 / nmed); });
      const r = mieMulti(xs, ms);
      qe.push(r.qext); qs.push(r.qsca); qa.push(r.qabs);
    }
    return { models: models, nmed: nmed, qe: qe, qs: qs, qa: qa, radii: radii };
  }

  /* ------------------------------------------------------------------ */
  /* Cross-section drawing (to scale)                                    */
  /* ------------------------------------------------------------------ */
  let svgSeq = 0;
  function niceBar(len) {
    const p = Math.pow(10, Math.floor(Math.log10(len)));
    const m = len / p;
    return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
  }
  function crossSection(geo, lig) {
    const W = 360, H = 240, cxp = 120, cyp = 112, Rpx = 92;
    const Rlig = geo.R + (lig && lig.thickness > 0 ? lig.thickness : 0);
    const s = Rpx / Rlig;
    const id = 'dzh' + (++svgSeq);
    const labels = [];
    if (lig && lig.thickness > 0) labels.push({ r: (geo.R + lig.thickness / 2) * s, text: lig.label + ', ' + f(lig.thickness, 3) + ' nm (estimate)' });
    // each shell is a stroke of its exact thickness centred on its mid-radius (to scale)
    let rings = '';
    geo.layers.forEach(function (L, i) {
      const col = 'var(--s' + (i % 5) + ')';
      if (i === 0) rings += '<circle cx="' + cxp + '" cy="' + cyp + '" r="' + Math.max(0.4, L.rOut * s).toFixed(2) + '" style="fill:' + col + ';fill-opacity:.9;stroke:' + col + ';stroke-width:.8"/>';
      else {
        const rm = ((L.rIn + L.rOut) / 2) * s, w = Math.max(0.6, (L.rOut - L.rIn) * s);
        rings += '<circle cx="' + cxp + '" cy="' + cyp + '" r="' + rm.toFixed(2) + '" style="fill:none;stroke:' + col + ';stroke-opacity:.75;stroke-width:' + w.toFixed(2) + '"/>';
      }
      labels.push({ r: (i === 0 ? L.rOut * 0.5 : (L.rIn + L.rOut) / 2) * s, text: (i === 0 ? shortName(L.mat) + ' core, D = ' + f(2 * L.rOut, 3) + ' nm' : shortName(L.mat) + ' shell, ' + f(L.t, 3) + ' nm'), i: i });
    });
    const ligRing = lig && lig.thickness > 0 ? '<circle cx="' + cxp + '" cy="' + cyp + '" r="' + (((geo.R + Rlig) / 2) * s).toFixed(2) + '" style="fill:none;stroke:url(#' + id + ');stroke-width:' + Math.max(0.6, lig.thickness * s).toFixed(2) + '"/>' +
      '<circle cx="' + cxp + '" cy="' + cyp + '" r="' + (Rlig * s).toFixed(2) + '" style="fill:none;stroke:var(--muted);stroke-dasharray:3 2;stroke-width:.8"/>' : '';
    let out = '<defs><pattern id="' + id + '" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" style="fill:var(--surface)"/><line x1="0" y1="0" x2="0" y2="5" style="stroke:var(--muted);stroke-width:1.4"/></pattern></defs>' + ligRing + rings;
    // labels with leader lines, stacked on the right, ordered outer → inner from top
    labels.sort(function (a, b) { return b.r - a.r; });
    const x0 = 232, n = labels.length, gap = Math.min(26, 196 / Math.max(1, n)), top = Math.max(14, cyp - ((n - 1) * gap) / 2);
    labels.forEach(function (lb, k) {
      const ang = n > 1 ? -0.55 + (1.1 * k) / (n - 1) : -0.3;
      const px = cxp + lb.r * Math.cos(ang), py = cyp + lb.r * Math.sin(ang);
      const ty = top + k * gap;
      out += '<polyline points="' + px.toFixed(1) + ',' + py.toFixed(1) + ' ' + (x0 - 8) + ',' + ty.toFixed(1) + ' ' + (x0 - 2) + ',' + ty.toFixed(1) + '" style="fill:none;stroke:var(--text);stroke-width:.7"/>' +
        '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="1.6" style="fill:var(--text)"/>';
      const words = NC.esc(lb.text).split(', ');
      out += '<text x="' + x0 + '" y="' + (ty + 3.5).toFixed(1) + '" style="fill:var(--text);font-size:10.5px">' + words[0] + (words.length > 1 ? '<tspan x="' + x0 + '" dy="11" style="fill:var(--muted)">' + words.slice(1).join(', ') + '</tspan>' : '') + '</text>';
    });
    // scale bar
    const bar = niceBar(Rlig * 0.8), bpx = bar * s;
    out += '<g><line x1="' + (cxp - bpx / 2).toFixed(1) + '" y1="224" x2="' + (cxp + bpx / 2).toFixed(1) + '" y2="224" style="stroke:var(--text);stroke-width:2"/>' +
      '<line x1="' + (cxp - bpx / 2).toFixed(1) + '" y1="220" x2="' + (cxp - bpx / 2).toFixed(1) + '" y2="228" style="stroke:var(--text);stroke-width:1"/>' +
      '<line x1="' + (cxp + bpx / 2).toFixed(1) + '" y1="220" x2="' + (cxp + bpx / 2).toFixed(1) + '" y2="228" style="stroke:var(--text);stroke-width:1"/>' +
      '<text x="' + cxp + '" y="238" text-anchor="middle" style="fill:var(--text);font-size:10.5px">' + f(bar) + ' nm</text></g>';
    const aria = 'Cross-section to scale. ' + geo.layers.map(function (L, i) { return i === 0 ? shortName(L.mat) + ' core, diameter ' + f(2 * L.rOut, 3) + ' nm' : shortName(L.mat) + ' shell ' + f(L.t, 3) + ' nm thick'; }).join('; ') +
      (lig && lig.thickness > 0 ? '; ligand shell about ' + f(lig.thickness, 3) + ' nm' : '') + '. Outer diameter ' + f(geo.Dout, 4) + ' nm. Scale bar ' + f(bar) + ' nm.';
    return '<svg class="designer-xsec" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + NC.esc(aria) + '" xmlns="http://www.w3.org/2000/svg"><title>' + NC.esc(aria) + '</title>' + out + '</svg>';
  }

  /* ------------------------------------------------------------------ */
  /* Protocol lookup (js/protocols.js, optional)                         */
  /* ------------------------------------------------------------------ */
  /** role, key (material or ligand key), on = material underneath (shells, ligands). */
  function protocols(role, key, on) {
    if (typeof NC.protocolsFor !== 'function') return { available: false, list: [] };
    let list = [];
    try { list = NC.protocolsFor(role, key, on) || []; } catch (e) { list = []; }
    // the designer builds spheres: leave out protocols whose matching entry makes another shape (e.g. rods)
    const spherical = function (p) {
      if (!Array.isArray(p.makes)) return true;
      return p.makes.some(function (m) {
        const k = role === 'ligand' ? m.ligand : m.material;
        return m.role === role && (key === undefined || key === null || k === key || k === '*') && (!m.shape || m.shape === 'sphere');
      });
    };
    return { available: true, list: list.filter(function (p) { return p && p.id && spherical(p); }).map(function (p) { return { id: p.id, title: p.title || p.name || p.id }; }) };
  }

  /* ------------------------------------------------------------------ */
  /* compute                                                             */
  /* ------------------------------------------------------------------ */
  function compute(design) {
    const s = new NC.Steps();
    const warnings = [], notes = [], results = [], tables = [], plots = [], route = [];
    const refs = ['crc', 'ciaaw2021', 'codata2018'];
    const useRef = function (r) { [].concat(r || []).forEach(function (id) { if (refs.indexOf(id) < 0) refs.push(id); }); };
    const geo = geometry(design);
    const L = geo.layers;
    const mfmt = function (g) { return g >= 1 ? f(g) + ' g' : g >= 1e-3 ? f(g * 1e3) + ' mg' : f(g * 1e6) + ' µg'; };

    /* ---- 1 · geometry and composition ---- */
    s.heading('1 · Geometry and composition');
    L.forEach(function (Ly) {
      const m = Ly.mat;
      s.add({ title: Ly.name + ': ' + (m.custom ? m.label : m.label), formula: 'ρ (density),  M (molar mass per formula unit)', result: 'ρ = ' + f(m.rho) + ' g/cm³;   M = ' + f(m.M) + ' g/mol', note: (m.custom ? 'Custom material: your values.' : m.overridden ? 'Edited from the preset values.' : 'Bulk values.') + (m.note ? ' ' + m.note : ''), ref: m.custom || m.overridden ? undefined : ['crc', 'ciaaw2021'] });
    });
    const rList = L.map(function (Ly, i) { return 'r' + subDigits(i + 1) + ' = ' + f(Ly.rOut); }).join(', ');
    s.add({ title: 'Radius of every interface', formula: 'r₁ = D/2;   rᵢ = rᵢ₋₁ + tᵢ', tex: String.raw`r_1 = \dfrac{D}{2};\quad r_i = r_{i-1} + t_i`, sub: 'D = ' + f(2 * L[0].rOut) + ' nm' + L.slice(1).map(function (Ly, i) { return ', t' + subDigits(i + 2) + ' = ' + f(Ly.t); }).join(''), result: rList + ' nm;   outer diameter D_out = ' + f(geo.Dout) + ' nm' });
    L.forEach(function (Ly, i) {
      const lbl = Ly.name + ' (' + shortName(Ly.mat) + ')';
      if (i === 0) s.add({ title: 'Volume of the ' + lbl.replace('Core', 'core'), formula: 'V = (4/3)·π·r₁³', tex: String.raw`V_1 = \tfrac{4}{3}\pi r_1^3`, sub: 'V = (4/3)π × ' + f(Ly.rOut) + '³', result: 'V = ' + f(Ly.V) + ' nm³' });
      else s.add({ title: 'Volume of ' + lbl, formula: 'V = (4/3)·π·(rᵢ³ − rᵢ₋₁³)', tex: String.raw`V_i = \tfrac{4}{3}\pi\left(r_i^3 - r_{i-1}^3\right)`, sub: 'V = (4/3)π × (' + f(Ly.rOut) + '³ − ' + f(Ly.rIn) + '³)', result: 'V = ' + f(Ly.V) + ' nm³' });
      s.add({ title: 'Mass and formula units of ' + lbl, formula: 'm = ρ·V (1 nm³ = 10⁻²¹ cm³);   N = m·N_A / M', tex: String.raw`m_i = \rho_i V_i;\quad N_i = \dfrac{m_i N_A}{M_i}`, sub: 'm = ' + f(Ly.mat.rho) + ' × ' + f(Ly.V) + ' × 10⁻²¹ g;   N = ' + f(Ly.mass) + ' × ' + f(NA) + ' / ' + f(Ly.mat.M), result: 'm = ' + f(Ly.mass) + ' g;   N = ' + f(Ly.N) + ' formula units', ref: 'codata2018' });
    });
    s.add({ title: 'Total volume, mass and fractions', formula: 'V = ΣVᵢ;   m = Σmᵢ;   φᵢ = Vᵢ/V;   wᵢ = mᵢ/m', tex: String.raw`V = \sum_i V_i;\quad m = \sum_i m_i;\quad \varphi_i = \dfrac{V_i}{V};\quad w_i = \dfrac{m_i}{m}`, sub: 'V = ' + L.map(function (Ly) { return f(Ly.V); }).join(' + ') + ' nm³;   m = ' + L.map(function (Ly) { return f(Ly.mass); }).join(' + ') + ' g', result: 'V = ' + f(geo.V) + ' nm³;   m = ' + f(geo.mass) + ' g;   ' + L.map(function (Ly) { return shortName(Ly.mat) + ': φ = ' + NC.fix(100 * Ly.vf, 1) + ' %, w = ' + NC.fix(100 * Ly.wf, 1) + ' %'; }).join(';  ') });
    s.add({ title: 'Effective particle density', formula: 'ρ_eff = m / V', tex: String.raw`\rho_{\text{eff}} = \dfrac{m}{V}`, sub: 'ρ_eff = ' + f(geo.mass) + ' g / (' + f(geo.V) + ' × 10⁻²¹ cm³)', result: 'ρ_eff = ' + f(geo.rhoEff) + ' g/cm³', note: 'Inorganic part only (ligands excluded). Sets sedimentation and centrifugation behaviour.' });
    s.add({ title: 'Outer surface area and specific surface area', formula: 'A = 4π·R²;   SSA = A / m', tex: String.raw`A = 4\pi R^2;\quad \mathrm{SSA} = \dfrac{A}{m}`, sub: 'A = 4π × ' + f(geo.R) + '² nm²;   SSA = ' + f(geo.A) + ' × 10⁻¹⁸ m² / ' + f(geo.mass) + ' g', result: 'A = ' + f(geo.A) + ' nm²;   SSA = ' + f(geo.ssa) + ' m²/g', note: 'Outer (geometric) surface of a smooth sphere; a porous shell has a much larger BET area.' });

    results.push(
      { label: 'Outer diameter', value: geo.Dout, unit: 'nm', main: true },
      { label: 'Mass per particle', value: geo.mass, unit: 'g' },
      { label: 'Effective density', value: geo.rhoEff, unit: 'g/cm³' },
      { label: 'Specific surface area', value: geo.ssa, unit: 'm²/g' }
    );
    tables.push({
      title: 'Layers',
      columns: ['Layer', 'Material', 'r inner (nm)', 'r outer (nm)', 'Thickness (nm)', 'Volume (nm³)', 'Mass (g)', 'Formula units', 'Volume %', 'Mass %'],
      rows: L.map(function (Ly) { return [Ly.name, Ly.mat.custom ? Ly.mat.label : Ly.mat.label, f(Ly.rIn), f(Ly.rOut), Ly.role === 'core' ? 'D = ' + f(2 * Ly.rOut) : f(Ly.t), f(Ly.V), f(Ly.mass), f(Ly.N), NC.fix(100 * Ly.vf, 1), NC.fix(100 * Ly.wf, 1)]; })
    });

    /* ---- 2 · batch ---- */
    const b = design.batch || {};
    let nPerMl = null, Ntot = null, cM = null, Vml = null;
    const hasMass = b.massConc !== undefined && b.massConc !== null && b.massConc !== '';
    const hasNum = b.particleConc !== undefined && b.particleConc !== null && b.particleConc !== '';
    if (hasMass || hasNum) {
      s.heading('2 · Batch');
      Vml = NC.need(Number(b.volumeMl), 'Batch volume', { positive: true });
      let cmass;
      if (hasMass) {
        cmass = NC.need(Number(b.massConc), 'Mass concentration', { positive: true });
        nPerMl = (cmass * 1e-6) / geo.mass;
        s.add({ title: 'Particle number concentration from the mass concentration', formula: 'n = c_mass / m', tex: String.raw`n = \dfrac{c_{\text{mass}}}{m}`, sub: 'n = ' + f(cmass) + ' × 10⁻⁶ g/mL / ' + f(geo.mass) + ' g', result: 'n = ' + f(nPerMl) + ' particles/mL', note: 'c_mass is the mass of inorganic particle (core + shells) per mL.' });
      } else {
        nPerMl = NC.need(Number(b.particleConc), 'Particle number concentration', { positive: true });
        cmass = nPerMl * geo.mass * 1e6;
        s.add({ title: 'Mass concentration from the particle number concentration', formula: 'c_mass = n·m', tex: String.raw`c_{\text{mass}} = n\,m`, sub: 'c_mass = ' + f(nPerMl) + ' mL⁻¹ × ' + f(geo.mass) + ' g', result: 'c_mass = ' + f(cmass) + ' µg/mL' });
      }
      cM = (nPerMl * 1000) / NA;
      s.add({ title: 'Molar particle concentration', formula: 'c = n × 1000 / N_A', tex: String.raw`c = \dfrac{1000\,n}{N_A}`, sub: 'c = ' + f(nPerMl) + ' × 1000 / ' + f(NA), result: 'c = ' + f(cM * 1e9) + ' nM', ref: 'codata2018' });
      Ntot = nPerMl * Vml;
      s.add({ title: 'Particles in the batch and mass of each layer', formula: 'N_p = n·V_batch;   m_i,batch = N_p·mᵢ', tex: String.raw`N_p = n\,V_{\text{batch}};\quad m_{i,\text{batch}} = N_p\,m_i`, sub: 'N_p = ' + f(nPerMl) + ' × ' + f(Vml) + ' mL', result: 'N_p = ' + f(Ntot) + ';   ' + L.map(function (Ly) { return shortName(Ly.mat) + ': ' + mfmt(Ntot * Ly.mass); }).join(';  ') });
      results.push({ label: 'Particles per mL', value: nPerMl, unit: 'mL⁻¹', main: true }, { label: 'Molar particle conc.', value: cM * 1e9, unit: 'nM' }, { label: hasMass ? 'Particles in batch' : 'Mass concentration', value: hasMass ? Ntot : cmass, unit: hasMass ? '' : 'µg/mL' });
      tables.push({
        title: 'Batch: ' + f(Vml) + ' mL, ' + f(nPerMl) + ' particles/mL',
        columns: ['Layer', 'Material', 'Mass in batch', 'Amount (formula units)'],
        rows: L.map(function (Ly) { return [Ly.name, shortName(Ly.mat), mfmt(Ntot * Ly.mass), f((Ntot * Ly.N) / NA * 1e6) + ' µmol']; })
      });
    }

    /* ---- 3 · optics ---- */
    const lams = lambdaGrid(design.lambda);
    const sp = spectrum(geo, design, lams);
    let opt = null;
    s.heading('3 · Optical spectrum (multilayer Mie theory)');
    if (sp.missing) {
      warnings.push('No optical spectrum: optical constants are needed for ' + sp.missing.join(', ') + '. Choose a constant n + ik or paste an n, k table from a source you cite; NanoCalc has no built-in data it is certain of for these materials.');
      s.add({ title: 'Optical constants', formula: 'Every layer needs a complex refractive index N = n + ik', result: 'Missing for ' + sp.missing.join(', ') });
    } else {
      useRef(['yang2003', 'bohren1983', 'mie1908']);
      const pk = NC.optics.peakOf(lams, sp.qe);
      const fw = NC.optics.fwhmOf(lams, sp.qe, pk.i);
      const lam = pk.x, nmed = sp.nmed, kk = (2 * PI * nmed) / lam;
      s.add({ title: 'Medium', formula: 'n_med (real, non-absorbing)', result: 'n_med = ' + f(nmed), note: 'Water is n ≈ 1.333 in the visible (CRC Handbook).' });
      sp.models.forEach(function (mo, i) {
        const Ly = L[i], N = mo.N(lam), m = scl(N, 1 / nmed);
        useRef(mo.refs);
        if (mo.damp) {
          s.add({ title: Ly.name + ': size-dependent damping', formula: 'ħγ(R) = ħγ_bulk + A·ħv_F/R', tex: String.raw`\hbar\gamma(R) = \hbar\gamma_{\text{bulk}} + A\,\dfrac{\hbar v_F}{R}`, sub: 'ħγ = ' + f(mo.damp.gam) + ' + ' + f(mo.damp.A) + ' × ' + f(HBAR_EVS) + ' eV·s × ' + f(mo.damp.vF) + '×10⁶ m/s / (' + f(mo.damp.R) + '×10⁻⁹ m)', result: 'ħγ = ' + f(mo.gEff) + ' eV', ref: 'kreibig1995' });
        }
        if (mo.model === 'drude') {
          const E = NC.HC_EV_NM / lam, e = mo.eps(lam);
          s.add({ title: Ly.name + ' (' + shortName(Ly.mat) + '): Drude dielectric function at λ = ' + f(lam) + ' nm', formula: 'E = hc/λ;   ε = ε∞ − ωp²/(E² + iγE);   N = √ε', tex: String.raw`E = \dfrac{hc}{\lambda};\quad \varepsilon = \varepsilon_\infty - \dfrac{\omega_p^2}{E^2 + i\gamma E};\quad N = \sqrt{\varepsilon}`, sub: 'E = ' + f(E) + ' eV;   ' + mo.describe, result: 'ε = ' + fc(e) + ';   N = ' + fc(N) + ';   m = N/n_med = ' + fc(m), ref: ['kreibig1995', 'ashcroft1976'], note: mo.shellDampIgnored ? 'Size-dependent damping is applied only to a metal core (sphere radius R); this shell uses the bulk damping.' : undefined });
        } else if (mo.model === 'sellmeier') {
          s.add({ title: Ly.name + ' (' + shortName(Ly.mat) + '): refractive index at λ = ' + f(lam) + ' nm (Sellmeier, fused silica)', formula: 'n² − 1 = Σ Bⱼλ²/(λ² − Cⱼ²),  B = 0.6961663, 0.4079426, 0.8974794;  C = 0.0684043, 0.1162414, 9.896161 µm', tex: String.raw`n^2 - 1 = \sum_{j=1}^{3} \dfrac{B_j\lambda^2}{\lambda^2 - C_j^2}`, sub: 'λ = ' + f(lam / 1000) + ' µm', result: 'n = ' + f(N.re, 5) + ';   m = n/n_med = ' + f(m.re, 5), ref: 'malitson1965', note: 'Fused (bulk) silica at 20 °C, valid 0.21–3.71 µm. Stöber and other sol–gel silica can be porous and have a lower index; enter a measured value if you have one.' });
        } else {
          s.add({ title: Ly.name + ' (' + shortName(Ly.mat) + '): refractive index at λ = ' + f(lam) + ' nm', formula: 'N = n + ik (' + mo.describe + ');   m = N / n_med', tex: String.raw`m = \dfrac{n + ik}{n_{\text{med}}}`, result: 'N = ' + fc(N) + ';   m = ' + fc(m) });
        }
        if (mo.range && (lams[0] < mo.range[0] || lams[lams.length - 1] > mo.range[1])) {
          warnings.push(Ly.name + ' (' + shortName(Ly.mat) + '): part of the wavelength range lies outside the ' + (mo.table ? 'pasted n, k table (the nearest table value was used there)' : 'validity range of the Sellmeier equation (' + mo.range[0] + '–' + mo.range[1] + ' nm)') + '.');
        }
      });
      const xs = sp.radii.map(function (r) { return kk * r; });
      const ms = sp.models.map(function (mo) { return scl(mo.N(lam), 1 / nmed); });
      const r = mieMulti(xs, ms);
      s.add({ title: 'Size parameter of every interface', formula: 'xᵢ = 2π·n_med·rᵢ / λ', tex: String.raw`x_i = \dfrac{2\pi\,n_{\text{med}}\,r_i}{\lambda}`, sub: 'λ = ' + f(lam) + ' nm, n_med = ' + f(nmed), result: xs.map(function (x, i) { return 'x' + subDigits(i + 1) + ' = ' + f(x); }).join(';   '), ref: 'bohren1983' });
      s.add({ title: 'Number of terms', formula: 'N = x_L + 4·x_L^(1/3) + 2 (rounded)', tex: String.raw`N = x_L + 4x_L^{1/3} + 2`, sub: 'x_L = ' + f(xs[xs.length - 1]), result: 'N = ' + r.nstop + ' terms;   downward recurrence of D⁽¹⁾ₙ starts at n = ' + r.nmx, ref: 'yang2003' });
      s.add({
        title: 'Logarithmic derivatives in every layer',
        formula: 'D⁽¹⁾ₙ₋₁(z) = n/z − 1/[D⁽¹⁾ₙ(z) + n/z] (downward);   D⁽³⁾ₙ(z) = D⁽¹⁾ₙ(z) + i/[ψₙ(z)ξₙ(z)] (upward)',
        tex: String.raw`D^{(1)}_{n-1}(z) = \dfrac{n}{z} - \dfrac{1}{D^{(1)}_n(z) + n/z},\quad D^{(3)}_n(z) = D^{(1)}_n(z) + \dfrac{i}{\psi_n(z)\,\xi_n(z)}`,
        sub: 'z = mᵢxᵢ and mᵢxᵢ₋₁ for each layer; ψₙξₙ = ψₙ₋₁ξₙ₋₁·(n/z − D⁽¹⁾ₙ₋₁)(n/z − D⁽³⁾ₙ₋₁), ψ₀ξ₀ = ½(1 − e²ⁱᶻ)',
        result: 'Evaluated for ' + L.length + ' layer' + (L.length > 1 ? 's' : '') + ' (both recurrences are stable for absorbing and thick layers)',
        ref: 'yang2003'
      });
      if (L.length > 1) {
        s.add({
          title: 'Recursion through the layers (Yang 2003)',
          formula: 'Hᵃₙ(mₗxₗ) = [G₂D⁽¹⁾ₙ(mₗxₗ) − QₙG₁D⁽³⁾ₙ(mₗxₗ)] / (G₂ − QₙG₁),  G₁,₂ = mₗHᵃₙ(mₗ₋₁xₗ₋₁) − mₗ₋₁D⁽¹,³⁾ₙ(mₗxₗ₋₁);  Hᵇₙ likewise with mₗ ↔ mₗ₋₁',
          tex: String.raw`H^a_n(m_l x_l) = \dfrac{G_2 D^{(1)}_n(m_l x_l) - Q^{(l)}_n G_1 D^{(3)}_n(m_l x_l)}{G_2 - Q^{(l)}_n G_1},\quad G_{1,2} = m_l H^a_n(m_{l-1}x_{l-1}) - m_{l-1} D^{(1,3)}_n(m_l x_{l-1})`,
          sub: 'Core: Hᵃₙ = Hᵇₙ = D⁽¹⁾ₙ(m₁x₁);   Qₙ = [ψₙ/ξₙ](mₗxₗ₋₁) / [ψₙ/ξₙ](mₗxₗ), by upward recurrence',
          result: 'Hᵃₙ, Hᵇₙ at the outer surface for n = 1…' + r.nstop,
          ref: 'yang2003'
        });
      }
      s.add({
        title: 'Scattering coefficients at the outer surface',
        formula: 'aₙ = [(Hᵃₙ/m_L + n/x_L)ψₙ(x_L) − ψₙ₋₁(x_L)] / [(Hᵃₙ/m_L + n/x_L)ξₙ(x_L) − ξₙ₋₁(x_L)];   bₙ with m_L·Hᵇₙ',
        tex: String.raw`a_n = \dfrac{\left(H^a_n/m_L + n/x_L\right)\psi_n(x_L) - \psi_{n-1}(x_L)}{\left(H^a_n/m_L + n/x_L\right)\xi_n(x_L) - \xi_{n-1}(x_L)},\quad b_n = \dfrac{\left(m_L H^b_n + n/x_L\right)\psi_n(x_L) - \psi_{n-1}(x_L)}{\left(m_L H^b_n + n/x_L\right)\xi_n(x_L) - \xi_{n-1}(x_L)}`,
        result: 'a₁ = ' + fc(r.an[0]) + ';   b₁ = ' + fc(r.bn[0]),
        note: 'With one layer this is exactly the homogeneous-sphere (Bohren–Huffman) result.',
        ref: ['yang2003', 'bohren1983']
      });
      s.add({
        title: 'Efficiencies (relative to the outer cross-section πR²)',
        formula: 'Q_ext = (2/x_L²)·Σ(2n + 1)·Re(aₙ + bₙ);   Q_sca = (2/x_L²)·Σ(2n + 1)(|aₙ|² + |bₙ|²);   Q_abs = Q_ext − Q_sca',
        tex: String.raw`Q_{\text{ext}} = \dfrac{2}{x_L^2}\sum_{n}(2n+1)\,\mathrm{Re}(a_n + b_n),\quad Q_{\text{sca}} = \dfrac{2}{x_L^2}\sum_{n}(2n+1)\left(|a_n|^2 + |b_n|^2\right)`,
        result: 'Q_ext = ' + f(r.qext) + ';   Q_sca = ' + f(r.qsca) + ';   Q_abs = ' + f(r.qabs),
        ref: 'bohren1983'
      });
      const G = PI * geo.R * geo.R;
      const Cext = r.qext * G, Ccm = Cext * 1e-14;
      const epsM = (NA * Ccm) / (1000 * Math.LN10);
      s.add({ title: 'Cross-sections', formula: 'C = Q·πR²', tex: String.raw`C = Q\,\pi R^2`, sub: 'πR² = π × ' + f(geo.R) + '² = ' + f(G) + ' nm²', result: 'C_ext = ' + f(Cext) + ' nm²;   C_sca = ' + f(r.qsca * G) + ' nm²;   C_abs = ' + f(r.qabs * G) + ' nm²' });
      useRef('swinehart1962');
      s.add({ title: 'Molar extinction coefficient (per mole of particles)', formula: 'A = n·C_ext·l / ln 10 = ε·c·l with c = 1000·n/N_A   ⇒   ε = N_A·C_ext / (1000·ln 10)   (C_ext in cm²)', tex: String.raw`\varepsilon = \dfrac{N_A\,C_{\text{ext}}}{1000\,\ln 10}`, sub: 'ε = ' + f(NA) + ' × ' + f(Ccm) + ' cm² / (1000 × ' + f(Math.LN10) + ')', result: 'ε = ' + f(epsM) + ' M⁻¹·cm⁻¹', ref: ['swinehart1962', 'bohren1983', 'codata2018'], note: 'Transmitted intensity I = I₀·e^(−n·C_ext·l) (n per cm³); converting to decadic absorbance and molar concentration gives ε.' });
      s.add({ title: 'Extinction peak and width', formula: 'λ_max = argmax Q_ext(λ) (parabolic refinement);   FWHM from the half-maximum crossings', result: 'λ_max = ' + f(lam) + ' nm;   FWHM = ' + f(fw) + ' nm' });
      results.push(
        { label: 'Extinction peak λ_max', value: lam, unit: 'nm', main: true },
        { label: 'FWHM', value: fw, unit: 'nm' },
        { label: 'Molar extinction coefficient', value: epsM, unit: 'M⁻¹cm⁻¹', main: true },
        { label: 'C_ext at peak', value: Cext, unit: 'nm²' },
        { label: 'Q_ext at peak', value: r.qext },
        { label: 'Scattering fraction', value: (100 * r.qsca) / r.qext, unit: '%' }
      );
      if (cM !== null) {
        const Abs = epsM * cM;
        s.add({ title: 'Predicted absorbance of the batch (1 cm path)', formula: 'A = ε·c·l', tex: String.raw`A = \varepsilon\,c\,l`, sub: 'A = ' + f(epsM) + ' × ' + f(cM) + ' M × 1 cm', result: 'A = ' + f(Abs) + ' at ' + f(lam) + ' nm', ref: 'swinehart1962', note: Abs > 1.5 ? 'Above ≈1.5 most spectrometers are no longer linear; dilute before measuring.' : undefined });
        results.push({ label: 'Absorbance of batch (1 cm)', value: Abs });
      }
      if (pk.edge) warnings.push('The extinction maximum is at the edge of the wavelength range; widen the range to find the peak.');
      if (!isFinite(fw)) warnings.push('The peak does not fall to half its height on both sides inside the range, so the FWHM is not defined here.');
      const pts = function (ys, sc) { return lams.map(function (l, i) { return [l, ys[i] * (sc || 1)]; }); };
      plots.push({
        title: 'Efficiencies', xlabel: 'Wavelength λ (nm)', ylabel: 'Efficiency Q', zeroY: true,
        series: [{ name: 'Extinction', mode: 'line', points: pts(sp.qe) }, { name: 'Scattering', mode: 'line', color: 3, points: pts(sp.qs) }, { name: 'Absorption', mode: 'line', color: 4, dashed: true, points: pts(sp.qa) }]
      });
      const toEps = (G * 1e-14 * NA) / (1000 * Math.LN10);
      plots.push({ title: 'Molar extinction coefficient', xlabel: 'Wavelength λ (nm)', ylabel: 'ε (M⁻¹ cm⁻¹)', zeroY: true, series: [{ name: 'ε', mode: 'line', points: pts(sp.qe, toEps) }] });
      if (sp.models.some(function (mo) { return mo.model === 'drude'; })) notes.push('Metal layers use a free-electron Drude model. It places the plasmon resonance roughly but misses interband absorption (strong in gold below ≈600 nm); for quantitative spectra paste measured n, k data.');
      opt = { lam: lam, fw: fw, epsM: epsM, Cext: Cext };
    }

    /* ---- 4 · ligands ---- */
    let lig = null;
    if (design.ligand && design.ligand.key) {
      s.heading('4 · Ligands and surface');
      lig = ligandSteps(design.ligand, geo, s, warnings, useRef, Ntot);
      if (lig) {
        if (lig.N !== undefined) results.push({ label: 'Ligands per particle', value: lig.N, main: true });
        if (lig.thickness > 0) results.push({ label: 'Hydrodynamic diameter (estimate)', value: geo.Dout + 2 * lig.thickness, unit: 'nm' });
      }
    }

    /* ---- 5 · route ---- */
    s.heading((design.ligand && design.ligand.key ? '5' : '4') + ' · Synthesis route (mass balance)');
    buildRoute(geo, lig, Ntot, Vml, s, route, warnings);

    notes.push('Geometry uses bulk densities and perfectly concentric, smooth spheres.');
    notes.push('Precursor amounts are stoichiometric minima from a mass balance; published protocols use excess reagents and their yields are below 100 %.');
    return {
      results: results, steps: s.items, tables: tables, plots: plots,
      figures: [{ title: 'Cross-section (to scale)', svg: crossSection(geo, lig) }],
      warnings: warnings, notes: notes, refs: refs, route: route,
      geometry: geo, optics: opt, ligand: lig
    };
  }

  function ligandSteps(lg, geo, s, warnings, useRef, Ntot) {
    const def = LIGANDS[lg.key];
    if (!def) NC.fail('Unknown ligand "' + lg.key + '".');
    const out = { key: lg.key, label: def.label.replace(/,.*$/, '') };
    // molar mass
    let Mw = null, Mnote = '';
    if (def.formula) { Mw = formulaMass(def.formula); Mnote = def.formula; }
    else if (def.needsN && lg.nC !== undefined && lg.nC !== null && lg.nC !== '') {
      const n = NC.need(Number(lg.nC), 'Alkanethiol chain length (number of carbons)', { int: true, min: 1, max: 30 });
      Mnote = 'C' + n + 'H' + (2 * n + 2) + 'S';
      Mw = formulaMass(Mnote);
    }
    if (lg.Mw !== undefined && lg.Mw !== null && lg.Mw !== '' && !def.formula) { Mw = NC.need(Number(lg.Mw), 'Ligand molar mass', { positive: true }); Mnote = 'your value'; }
    if (Mw !== null) s.add({ title: 'Molar mass of ' + out.label, formula: Mnote && Mnote !== 'your value' ? 'M = Σ (atomic weights) for ' + Mnote : 'M (entered)', result: 'M = ' + f(Mw) + ' g/mol', ref: Mnote && Mnote !== 'your value' ? 'ciaaw2021' : undefined, note: lg.key === 'citrate' ? 'Citrate trianion; the adsorbed form and counter-ions depend on pH.' : lg.key === 'oleic-acid' ? 'Neutral acid; it binds as oleate (one H less).' : undefined });
    // surface density
    let sigma = null, cited = false;
    const val = lg.value === undefined || lg.value === null || lg.value === '' ? null : Number(lg.value);
    if (val === null && lg.key === 'alkanethiol') { sigma = 1 / ALKANETHIOL_FOOTPRINT; cited = true; }
    else if (val !== null) {
      if (lg.mode === 'footprint') { NC.need(val, 'Ligand footprint', { positive: true }); sigma = 1 / val; cited = lg.key === 'alkanethiol' && Math.abs(val - ALKANETHIOL_FOOTPRINT) < 5e-4; }
      else { sigma = NC.need(val, 'Ligand grafting density', { positive: true }); cited = lg.key === 'alkanethiol' && Math.abs(val - 1 / ALKANETHIOL_FOOTPRINT) < 0.005; }
    }
    if (sigma === null) {
      warnings.push(out.label + ': enter a grafting density (molecules/nm²) or footprint (nm² per molecule) from a measurement or a source you cite; NanoCalc has no value it is certain of for this ligand.');
      return out;
    }
    if (sigma > 20) warnings.push('A grafting density above 20 molecules/nm² is unphysical for a monolayer; check the value and its unit.');
    if (cited) {
      useRef('love2005');
      s.add({ title: 'Alkanethiolate SAM density on Au(111)', formula: 'σ = 1 / a_mol,   a_mol = 21.4 Å² for the (√3×√3)R30° lattice', tex: String.raw`\sigma = \dfrac{1}{a_{\text{mol}}}`, sub: 'σ = 1 / 0.214 nm²', result: 'σ = ' + f(sigma) + ' molecules/nm²', ref: 'love2005', note: 'Flat Au(111) value. On small, curved particles thiol densities are often higher because of edges and vertices; use a measured value (TGA, XPS) when you have one.' });
    } else {
      s.add({ title: 'Grafting density', formula: lg.mode === 'footprint' ? 'σ = 1 / footprint' : 'σ (entered)', sub: lg.mode === 'footprint' ? 'σ = 1 / ' + f(val) + ' nm²' : undefined, result: 'σ = ' + f(sigma) + ' molecules/nm²', note: 'Your value.' });
    }
    out.sigma = sigma;
    out.N = sigma * geo.A;
    s.add({ title: 'Ligands per particle', formula: 'N_L = σ·4πR²', tex: String.raw`N_L = \sigma\,4\pi R^2`, sub: 'N_L = ' + f(sigma) + ' × 4π × ' + f(geo.R) + '²', result: 'N_L = ' + f(out.N) + ' per particle' });
    if (Mw !== null) {
      out.Mw = Mw;
      out.massPer = (out.N * Mw) / NA;
      s.add({ title: 'Ligand mass per particle and organic mass fraction', formula: 'm_L = N_L·M / N_A;   w_L = m_L / (m_L + m)', tex: String.raw`m_L = \dfrac{N_L M}{N_A};\quad w_L = \dfrac{m_L}{m_L + m}`, sub: 'm_L = ' + f(out.N) + ' × ' + f(Mw) + ' / ' + f(NA), result: 'm_L = ' + f(out.massPer) + ' g;   w_L = ' + NC.fix((100 * out.massPer) / (out.massPer + geo.mass), 2) + ' % (what TGA would measure as organic mass loss)', ref: 'codata2018' });
    }
    // thickness
    if (def.polymer) {
      useRef(['degennes1980', 'alexander1977']);
      const MwP = NC.need(Mw, 'PEG molar mass', { positive: true });
      const a = NC.need(Number(lg.a), 'PEG monomer size a', { positive: true, max: 2 });
      const Nm = MwP / formulaMass(PEG_MONOMER);
      const RF = a * Math.pow(Nm, 0.6);
      const Dg = 1 / Math.sqrt(sigma);
      s.add({ title: 'Degree of polymerisation', formula: 'N = M / M_monomer,  M(C₂H₄O) = ' + f(formulaMass(PEG_MONOMER)) + ' g/mol', tex: String.raw`N = \dfrac{M}{M_{\mathrm{C_2H_4O}}}`, sub: 'N = ' + f(MwP) + ' / ' + f(formulaMass(PEG_MONOMER)), result: 'N ≈ ' + f(Nm), note: 'End groups neglected.', ref: 'ciaaw2021' });
      s.add({ title: 'Flory radius of one chain (good solvent)', formula: 'R_F = a·N^(3/5)', tex: String.raw`R_F = a\,N^{3/5}`, sub: 'R_F = ' + f(a) + ' × ' + f(Nm) + '^0.6', result: 'R_F = ' + f(RF) + ' nm', ref: 'degennes1980', note: 'Scaling estimate; prefactors of order one are omitted. a = ' + f(a) + ' nm is your monomer size (the value often used for PEG is about 0.35 nm; it is an assumption, not a measured constant).' });
      s.add({ title: 'Distance between grafting points', formula: 'D = σ^(−1/2)', tex: String.raw`D = \sigma^{-1/2}`, sub: 'D = ' + f(sigma) + '^(−1/2)', result: 'D = ' + f(Dg) + ' nm  ⇒  ' + (Dg > RF ? 'D > R_F: mushroom regime' : 'D < R_F: brush regime'), ref: 'degennes1980' });
      if (Dg > RF) {
        out.thickness = RF; out.regime = 'mushroom';
        s.add({ title: 'Layer thickness (mushroom)', formula: 'L ≈ R_F', result: 'L ≈ ' + f(RF) + ' nm (scaling estimate)', ref: 'degennes1980' });
      } else {
        out.thickness = Nm * Math.pow(a, 5 / 3) * Math.pow(sigma, 1 / 3); out.regime = 'brush';
        s.add({ title: 'Brush height (Alexander–de Gennes)', formula: 'L ≈ N·a·(a/D)^(2/3) = N·a^(5/3)·σ^(1/3)', tex: String.raw`L \approx N a \left(\dfrac{a}{D}\right)^{2/3} = N a^{5/3} \sigma^{1/3}`, sub: 'L = ' + f(Nm) + ' × ' + f(a) + '^(5/3) × ' + f(sigma) + '^(1/3)', result: 'L ≈ ' + f(out.thickness) + ' nm (scaling estimate)', ref: ['alexander1977', 'degennes1980'], note: 'Flat-surface scaling. On a particle with R comparable to L the chains splay out and the brush is thinner than this.' });
      }
      out.label = 'PEG ' + out.regime;
    } else if (lg.length !== undefined && lg.length !== null && lg.length !== '') {
      out.thickness = NC.need(Number(lg.length), 'Ligand shell thickness', { positive: true, max: 100 });
      s.add({ title: 'Ligand shell thickness', formula: 'L (entered)', result: 'L = ' + f(out.thickness) + ' nm', note: 'Your value.' });
    }
    if (out.thickness > 0) {
      const Dh = geo.Dout + 2 * out.thickness;
      s.add({ title: 'Hydrodynamic diameter (estimate)', formula: 'D_h ≈ D_out + 2L', tex: String.raw`D_h \approx D_{\text{out}} + 2L`, sub: 'D_h = ' + f(geo.Dout) + ' + 2 × ' + f(out.thickness), result: 'D_h ≈ ' + f(Dh) + ' nm', note: 'Geometric estimate only. DLS reports an intensity-weighted hydrodynamic size that also includes bound solvent and is sensitive to aggregates.' });
    }
    // batch amounts
    if (Ntot !== null && Mw !== null) {
      const excess = NC.need(lg.excess === undefined || lg.excess === null || lg.excess === '' ? 1 : Number(lg.excess), 'Ligand excess factor', { min: 1, max: 1e6 });
      const mol = (Ntot * out.N) / NA;
      out.molBound = mol; out.molAdd = mol * excess; out.massAdd = mol * excess * Mw;
      s.add({ title: 'Ligand for the batch', formula: 'n_L = N_p·N_L / N_A;   n_add = excess × n_L;   m_add = n_add·M', tex: String.raw`n_L = \dfrac{N_p N_L}{N_A};\quad n_{\text{add}} = x\,n_L;\quad m_{\text{add}} = n_{\text{add}} M`, sub: 'n_L = ' + f(Ntot) + ' × ' + f(out.N) + ' / ' + f(NA) + ';   excess = ' + f(excess), result: 'bound: ' + f(mol * 1e9) + ' nmol;   to add: ' + f(out.molAdd * 1e9) + ' nmol = ' + f(out.massAdd * 1e3) + ' mg', ref: 'codata2018', note: excess === 1 ? 'Excess 1 is the amount bound in a full monolayer; ligand exchange is normally done with a large excess.' : 'Excess factor is your choice.' });
    }
    return out;
  }

  function buildRoute(geo, lig, Ntot, Vml, s, route, warnings) {
    const L = geo.layers;
    const noLib = 'no protocol in the library yet';
    let step = 0;
    const outer = L[L.length - 1].mat.key;
    L.forEach(function (Ly, i) {
      step++;
      const role = Ly.role;
      const pr = protocols(role, Ly.mat.key, i > 0 ? L[i - 1].mat.key : undefined);
      let amount = '', note = '', molFU = null;
      const precursors = [];
      if (Ntot !== null) {
        molFU = (Ntot * Ly.V * 1e-21 * Ly.mat.rho) / Ly.mat.M;
        const parts = [f(molFU * 1e6) + ' µmol ' + shortName(Ly.mat) + ' (' + f(Ntot * Ly.mass * 1e3) + ' mg)'];
        const formula = FORMULA[Ly.mat.key];
        const pre = PRECURSORS[Ly.mat.key];
        let preTxt = '';
        if (pre) {
          pre.forEach(function (p) {
            const Mp = formulaMass(p.formula), mol = molFU * p.per;
            precursors.push({ name: p.name, formula: p.formula, M: Mp, mol: mol, mass: mol * Mp });
            preTxt += (preTxt ? '; ' : '') + p.name + ': ' + f(mol * 1e6) + ' µmol = ' + f(mol * Mp * 1e3) + ' mg (M = ' + f(Mp) + ' g/mol, ' + p.per + ' mol per mol ' + shortName(Ly.mat) + ')';
          });
          parts.push(preTxt);
        } else if (formula) {
          const c = parseFormula(formula);
          const els = Object.keys(c).filter(function (e) { return e !== 'O'; });
          preTxt = els.map(function (e) { return f(molFU * c[e] * 1e6) + ' µmol ' + e; }).join(' + ') + ' (any precursor, ' + els.map(function (e) { return c[e] + ' ' + e; }).join(' : ') + ' per formula unit)';
          parts.push(preTxt);
        }
        amount = parts.join(' → ');
        s.add({
          title: 'Step ' + step + ': ' + (role === 'core' ? 'core synthesis' : 'growth of ' + Ly.name.toLowerCase()) + ' (' + shortName(Ly.mat) + ')',
          formula: 'n = N_p·V_' + (role === 'core' ? 'core' : 'shell') + '·ρ / M' + (pre ? ';   n_precursor = ν·n' : ''),
          tex: String.raw`n = \dfrac{N_p\,V\,\rho}{M}` + (pre ? String.raw`;\quad n_{\text{precursor}} = \nu\,n` : ''),
          sub: 'n = ' + f(Ntot) + ' × ' + f(Ly.V) + ' × 10⁻²¹ cm³ × ' + f(Ly.mat.rho) + ' g/cm³ / ' + f(Ly.mat.M) + ' g/mol',
          result: amount,
          ref: pre || formula ? ['ciaaw2021', 'codata2018'] : 'codata2018',
          note: 'Stoichiometric minimum for ' + f(Ntot) + ' particles (' + f(Vml) + ' mL batch); real protocols use excess and yields below 100 %.' + (role === 'shell' ? ' Assumes all of the precursor deposits on the particles (no separate nucleation).' : '')
        });
      } else {
        amount = 'set a batch concentration to get amounts';
      }
      if (!pr.available) note = noLib;
      else if (!pr.list.length) note = noLib + ' for ' + (role === 'core' ? 'a ' + shortName(Ly.mat) + ' core' : 'a ' + shortName(Ly.mat) + ' shell');
      route.push({ step: step, role: role, material: Ly.mat.key, label: role === 'core' ? 'Core: ' + Ly.mat.label + ', D = ' + f(2 * Ly.rOut) + ' nm' : Ly.name + ': ' + Ly.mat.label + ', ' + f(Ly.t) + ' nm', protocols: pr.list, amount: amount, note: note, mol: molFU, precursors: precursors });
    });
    if (lig && lig.key) {
      step++;
      const pr = protocols('ligand', lig.key, outer);
      const amount = lig.massAdd !== undefined ? f(lig.molAdd * 1e9) + ' nmol (' + f(lig.massAdd * 1e3) + ' mg) including the excess factor; ' + f(lig.molBound * 1e9) + ' nmol bind in a full layer' : lig.N !== undefined ? f(lig.N) + ' ligands per particle' : 'enter a grafting density';
      route.push({ step: step, role: 'ligand', ligand: lig.key, label: 'Ligand exchange / functionalisation: ' + LIGANDS[lig.key].label, protocols: pr.list, amount: amount, note: !pr.available || !pr.list.length ? noLib : '' });
    }
    step++;
    const pp = protocols('purification', outer);
    route.push({ step: step, role: 'purification', label: 'Purification (remove excess reagents and free ligand)', protocols: pp.list, amount: '', note: !pp.available || !pp.list.length ? noLib : '' });
    if (Ntot === null) warnings.push('Set a batch volume and a mass or particle concentration to get layer, precursor and ligand amounts.');
  }

  NC.designer = {
    compute: compute,
    defaults: defaults,
    presets: presetDesigns,
    mieMulti: mieMulti,
    bhcoat: bhcoat,
    geometry: geometry,
    crossSection: crossSection,
    formulaMass: formulaMass,
    parseFormula: parseFormula,
    nSilica: nSilica,
    defaultOptical: defaultOptical,
    ligands: LIGANDS,
    precursors: PRECURSORS,
    ALKANETHIOL_FOOTPRINT: ALKANETHIOL_FOOTPRINT
  };
})(typeof window !== 'undefined' ? window : globalThis);
