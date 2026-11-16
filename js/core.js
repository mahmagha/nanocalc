/*
 * NanoCalc core: namespace, physical constants, number formatting, input
 * validation, data parsing, statistics and shared material data.
 *
 * Every calculator registers itself with NC.register(definition).
 * Plain scripts (no modules) so the app runs straight from index.html.
 */
(function (global) {
  'use strict';

  const NC = (global.NC = global.NC || {});
  /** App version; keep in step with package.json and CHANGELOG.md (checked by tools/lint.js). */
  NC.version = '0.8.0';

  /* ------------------------------------------------------------------ */
  /* Registry                                                            */
  /* ------------------------------------------------------------------ */

  NC.categories = [
    { id: 'size', label: 'Size-dependent properties', blurb: 'Quantum confinement, surface effects, melting, nanotube structure.' },
    { id: 'lab', label: 'Synthesis & dosing', blurb: 'Precursor masses, dilutions, particle number concentrations.' },
    { id: 'carbon', label: 'Carbon nanomaterials', blurb: 'Fullerenes, graphene, nanotubes and carbon dots.' },
    { id: 'soft', label: 'Soft nanomaterials', blurb: 'Liposomes, lipid nanoparticles, polymer nanoparticles and micelles.' },
    { id: 'xrd', label: 'Diffraction & crystal structure', blurb: 'XRD lattice parameters, crystallite size and strain, phases, SAED and HRTEM.' },
    { id: 'optical', label: 'Optical spectroscopy', blurb: 'Band gaps, plasmons (Mie/Gans), quantum dot and gold sizing, quantum yield.' },
    { id: 'colloid', label: 'Colloids', blurb: 'Hydrodynamic size, zeta potential, DLVO stability and sedimentation.' },
    { id: 'scatter', label: 'Scattering', blurb: 'SAXS, nanoparticle tracking and DLS correlation analysis.' },
    { id: 'surface', label: 'Surface area & porosity', blurb: 'BET surface area and Kelvin pore size.' },
    { id: 'micro', label: 'Electron microscopy', blurb: 'Particle size distribution statistics from TEM/SEM.' },
    { id: 'spectro', label: 'Raman & XPS', blurb: 'Graphene defects and crystallite size, XPS composition.' },
    { id: 'analysis', label: 'Elemental analysis', blurb: 'ICP-MS particle concentration, single-particle ICP-MS, EDX.' },
    { id: 'magnetic', label: 'Magnetism', blurb: 'Saturation magnetization, dead layer, blocking temperature.' },
    { id: 'electrochem', label: 'Electrochemistry & catalysis', blurb: 'Electrochemical surface area, dispersion, turnover frequency.' },
    { id: 'thermal', label: 'Thermal analysis', blurb: 'Ligand grafting density from TGA.' },
    { id: 'data', label: 'Spectrum & peak analysis', blurb: 'Import raw data, smooth, subtract baselines and fit peaks.' }
  ];

  NC.calculators = [];
  NC.byId = {};
  NC.register = function (def) {
    if (NC.byId[def.id]) throw new Error('Duplicate calculator id: ' + def.id);
    NC.calculators.push(def);
    NC.byId[def.id] = def;
  };

  /* ------------------------------------------------------------------ */
  /* Constants — CODATA 2018 (exact SI values where defined)             */
  /* ------------------------------------------------------------------ */

  NC.C = Object.freeze({
    h: 6.62607015e-34, // J s (exact)
    hbar: 1.054571817e-34, // J s
    e: 1.602176634e-19, // C (exact)
    me: 9.1093837015e-31, // kg
    eps0: 8.8541878128e-12, // F m^-1
    kB: 1.380649e-23, // J K^-1 (exact)
    NA: 6.02214076e23, // mol^-1 (exact)
    c: 299792458, // m s^-1 (exact)
    R: 8.314462618, // J mol^-1 K^-1
    a0: 5.29177210903e-11 // m (Bohr radius)
  });
  /** hc/e in eV·nm (from exact h, c, e) */
  NC.HC_EV_NM = (NC.C.h * NC.C.c) / NC.C.e * 1e9;
  /** Molar volume of an ideal gas at STP (273.15 K, 101.325 kPa), cm^3/mol */
  NC.VM_STP = 22413.97;

  /* ------------------------------------------------------------------ */
  /* Errors and validation                                               */
  /* ------------------------------------------------------------------ */

  class InputError extends Error {
    constructor(msg) {
      super(msg);
      this.name = 'InputError';
    }
  }
  NC.InputError = InputError;
  NC.fail = function (msg) {
    throw new InputError(msg);
  };

  /** Validate a numeric input and return it. */
  NC.need = function (x, label, opt) {
    opt = opt || {};
    if (typeof x !== 'number' || !isFinite(x)) NC.fail(label + ' is required and must be a number.');
    if (opt.positive && !(x > 0)) NC.fail(label + ' must be greater than zero.');
    if (opt.nonneg && x < 0) NC.fail(label + ' cannot be negative.');
    if (opt.min !== undefined && x < opt.min) NC.fail(label + ' must be at least ' + opt.min + '.');
    if (opt.max !== undefined && x > opt.max) NC.fail(label + ' must be at most ' + opt.max + '.');
    if (opt.gt !== undefined && !(x > opt.gt)) NC.fail(label + ' must be greater than ' + opt.gt + '.');
    if (opt.lt !== undefined && !(x < opt.lt)) NC.fail(label + ' must be less than ' + opt.lt + '.');
    if (opt.int && !Number.isInteger(x)) NC.fail(label + ' must be a whole number.');
    return x;
  };
  /** Optional number: returns null when blank. */
  NC.opt = function (x, label, opt) {
    if (typeof x !== 'number' || Number.isNaN(x)) return null;
    return NC.need(x, label, opt);
  };

  /* ------------------------------------------------------------------ */
  /* Formatting                                                          */
  /* ------------------------------------------------------------------ */

  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };

  /** Format a number to `sig` significant figures; scientific notation for very large/small values. */
  NC.fmt = function (x, sig) {
    sig = sig || 4;
    if (typeof x !== 'number' || Number.isNaN(x)) return '—';
    if (!isFinite(x)) return x > 0 ? '∞' : '−∞';
    if (x === 0) return '0';
    const a = Math.abs(x);
    if (a >= 1e5 || a < 1e-3) {
      const parts = x.toExponential(sig - 1).split('e');
      const mant = String(parseFloat(parts[0]));
      const exp = String(parseInt(parts[1], 10))
        .split('')
        .map(function (c) { return SUP[c] || c; })
        .join('');
      return mant.replace('-', '−') + '×10' + exp;
    }
    return String(parseFloat(x.toPrecision(sig))).replace('-', '−');
  };
  /** Fixed decimals (for angles, percentages). */
  NC.fix = function (x, d) {
    if (typeof x !== 'number' || !isFinite(x)) return '—';
    return x.toFixed(d === undefined ? 2 : d).replace('-', '−');
  };

  NC.esc = function (s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  NC.deg = function (r) { return (r * 180) / Math.PI; };
  NC.rad = function (d) { return (d * Math.PI) / 180; };

  /* ------------------------------------------------------------------ */
  /* Input definition helpers                                            */
  /* ------------------------------------------------------------------ */

  NC.num = function (id, label, unit, value, extra) {
    return Object.assign({ id: id, label: label, unit: unit || '', type: 'number', value: value }, extra || {});
  };
  /** options: array of [value, label] */
  NC.sel = function (id, label, options, value, extra) {
    return Object.assign({ id: id, label: label, type: 'select', options: options, value: value }, extra || {});
  };
  NC.data = function (id, label, value, extra) {
    return Object.assign({ id: id, label: label, type: 'textarea', value: value || '', rows: 8 }, extra || {});
  };

  /* ------------------------------------------------------------------ */
  /* Step recorder                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Each step: { title, formula, sub (substitution), result, ref (id or [ids]), note }
   * Headings group the steps that follow.
   */
  NC.Steps = class Steps {
    constructor() { this.items = []; }
    add(step) { this.items.push(Object.assign({ kind: 'step' }, step)); return this; }
    heading(title) { this.items.push({ kind: 'heading', title: title }); return this; }
  };

  /* ------------------------------------------------------------------ */
  /* Data parsing (pasted columns from Excel, CSV, instrument exports)   */
  /* ------------------------------------------------------------------ */

  /**
   * Parse rows of numbers. Options: { min, max, labels, label (first column is text), name }
   * Accepts tab, comma, semicolon or whitespace delimiters. A leading non-numeric line is
   * treated as a header. Lines starting with # are comments.
   */
  NC.parseRows = function (text, o) {
    o = o || {};
    const min = o.min || 1;
    const max = o.max || min;
    const rows = [];
    let headerSkipped = false;
    String(text || '')
      .split(/\r?\n/)
      .forEach(function (raw, i) {
        const line = raw.replace(/#.*$/, '').trim();
        if (!line) return;
        const parts = (/[\t,;]/.test(line) ? line.split(/\s*[\t,;]\s*/) : line.split(/\s+/)).filter(function (p) {
          return p !== '';
        });
        let label = null;
        if (o.label) label = parts.shift();
        const nums = parts.map(Number);
        const bad = nums.length < min || nums.slice(0, max).some(function (n) { return !isFinite(n); });
        if (bad) {
          if (rows.length === 0 && !headerSkipped) {
            headerSkipped = true;
            return;
          }
          NC.fail(
            (o.name ? o.name + ', line ' : 'Line ') + (i + 1) + ': expected ' + (o.label ? 'a label then ' : '') +
              (max > min ? min + '–' + max : min) + ' number(s)' + (o.labels ? ' (' + o.labels.join(', ') + ')' : '') +
              ', got "' + line + '".'
          );
        }
        const r = nums.slice(0, max);
        if (o.label) r.label = label;
        rows.push(r);
      });
    return rows;
  };

  /** Parse a list of numbers separated by any delimiter / newlines. */
  NC.parseList = function (text, name) {
    const out = [];
    String(text || '')
      .replace(/#.*$/gm, '')
      .split(/[\s,;]+/)
      .forEach(function (t) {
        if (t === '') return;
        const n = Number(t);
        if (!isFinite(n)) NC.fail((name || 'List') + ': "' + t + '" is not a number.');
        out.push(n);
      });
    return out;
  };

  /* ------------------------------------------------------------------ */
  /* Statistics                                                          */
  /* ------------------------------------------------------------------ */

  const T95 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131,
    2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];

  NC.stats = {
    sum: function (a) { return a.reduce(function (s, x) { return s + x; }, 0); },
    mean: function (a) { return NC.stats.sum(a) / a.length; },
    sd: function (a) {
      if (a.length < 2) return NaN;
      const m = NC.stats.mean(a);
      return Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1));
    },
    /** Quantile with linear interpolation (Hyndman & Fan type 7) on a sorted array. */
    quantile: function (sorted, p) {
      const h = (sorted.length - 1) * p;
      const lo = Math.floor(h);
      const hi = Math.ceil(h);
      return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
    },
    /** Two-sided 95 % Student t critical value. */
    t95: function (df) {
      if (df < 1) return NaN;
      if (df <= 30) return T95[df - 1];
      // Cornish–Fisher expansion of the t quantile about the normal quantile z = 1.959964
      // (Abramowitz & Stegun 26.7.5); error < 1e-5 for df > 30. Replaces a linear table
      // interpolation that rounded to 1.96 above df = 120 (≈0.4 % narrow at n = 300).
      const z = 1.959963984540054, z2 = z * z, v = df;
      return z + (z2 * z + z) / (4 * v) + (5 * z2 * z2 * z + 16 * z2 * z + 3 * z) / (96 * v * v) +
        (3 * Math.pow(z, 7) + 19 * z2 * z2 * z + 17 * z2 * z - 15 * z) / (384 * v * v * v);
    },
    /** Ordinary least-squares fit y = m x + b. */
    linreg: function (x, y) {
      const n = x.length;
      if (n < 2) NC.fail('At least two points are needed for a linear fit.');
      const mx = NC.stats.mean(x);
      const my = NC.stats.mean(y);
      let sxx = 0, sxy = 0, syy = 0;
      for (let i = 0; i < n; i++) {
        sxx += (x[i] - mx) * (x[i] - mx);
        sxy += (x[i] - mx) * (y[i] - my);
        syy += (y[i] - my) * (y[i] - my);
      }
      if (sxx === 0) NC.fail('All x values are identical; a line cannot be fitted.');
      const m = sxy / sxx;
      const b = my - m * mx;
      let ssr = 0;
      for (let i = 0; i < n; i++) ssr += Math.pow(y[i] - (m * x[i] + b), 2);
      const r2 = syy === 0 ? 1 : 1 - ssr / syy;
      const s2 = n > 2 ? ssr / (n - 2) : NaN;
      const seM = Math.sqrt(s2 / sxx);
      const sumx2 = x.reduce(function (s, v) { return s + v * v; }, 0);
      const seB = Math.sqrt((s2 * sumx2) / (n * sxx));
      return { m: m, b: b, r2: r2, seM: seM, seB: seB, n: n };
    }
  };

  /** Deterministic RNG (mulberry32) for reproducible example data. */
  NC.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  NC.randn = function (rand) {
    let u = 0;
    while (u === 0) u = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };

  /* ------------------------------------------------------------------ */
  /* Property correlations for water                                     */
  /* ------------------------------------------------------------------ */

  /** Dynamic viscosity of liquid water, Pa·s (Vogel-type correlation; T in K). */
  NC.waterViscosity = function (TK) {
    return 2.414e-5 * Math.pow(10, 247.8 / (TK - 140));
  };
  /** Relative permittivity of water, Malmberg & Maryott (1956); t in °C, 0–100 °C. */
  NC.waterPermittivity = function (tC) {
    return 87.74 - 0.40008 * tC + 9.398e-4 * tC * tC - 1.41e-6 * tC * tC * tC;
  };

  /* ------------------------------------------------------------------ */
  /* Material data (bulk values, CRC Handbook)                           */
  /* rho g/cm^3, M g/mol (per formula unit), Tm K, dHf kJ/mol            */
  /* ------------------------------------------------------------------ */

  /* group: 'metal' | 'oxide' | 'semi' (used to group material menus).
     Molar masses from IUPAC 2021 standard atomic weights. */
  NC.materials = {
    Au: { label: 'Gold (Au)', group: 'metal', rho: 19.32, M: 196.967, Tm: 1337.33, dHf: 12.55 },
    Ag: { label: 'Silver (Ag)', group: 'metal', rho: 10.5, M: 107.868, Tm: 1234.93, dHf: 11.28 },
    Pt: { label: 'Platinum (Pt)', group: 'metal', rho: 21.45, M: 195.084, Tm: 2041.4, dHf: 22.17 },
    Pd: { label: 'Palladium (Pd)', group: 'metal', rho: 12.0, M: 106.42, Tm: 1828.05, dHf: 16.7 },
    Rh: { label: 'Rhodium (Rh)', group: 'metal', rho: 12.4, M: 102.91 },
    Ir: { label: 'Iridium (Ir)', group: 'metal', rho: 22.56, M: 192.22 },
    Cu: { label: 'Copper (Cu)', group: 'metal', rho: 8.96, M: 63.546, Tm: 1357.77, dHf: 13.26 },
    Ni: { label: 'Nickel (Ni)', group: 'metal', rho: 8.908, M: 58.693 },
    Co: { label: 'Cobalt (Co)', group: 'metal', rho: 8.86, M: 58.933 },
    Fe: { label: 'Iron (Fe)', group: 'metal', rho: 7.874, M: 55.845 },
    Al: { label: 'Aluminium (Al)', group: 'metal', rho: 2.70, M: 26.982 },
    Fe3O4: { label: 'Magnetite (Fe₃O₄)', group: 'oxide', rho: 5.17, M: 231.533 },
    Fe2O3: { label: 'Hematite (α-Fe₂O₃)', group: 'oxide', rho: 5.25, M: 159.69 },
    TiO2a: { label: 'TiO₂ (anatase)', group: 'oxide', rho: 3.89, M: 79.866 },
    TiO2r: { label: 'TiO₂ (rutile)', group: 'oxide', rho: 4.23, M: 79.866 },
    ZnO: { label: 'Zinc oxide (ZnO)', group: 'oxide', rho: 5.61, M: 81.38 },
    SiO2: { label: 'Silica (amorphous SiO₂)', group: 'oxide', rho: 2.2, M: 60.084 },
    CeO2: { label: 'Ceria (CeO₂)', group: 'oxide', rho: 7.22, M: 172.115 },
    Al2O3: { label: 'Alumina (α-Al₂O₃)', group: 'oxide', rho: 3.99, M: 101.96 },
    ZrO2: { label: 'Zirconia (monoclinic ZrO₂)', group: 'oxide', rho: 5.68, M: 123.22 },
    Co3O4: { label: 'Cobalt oxide (Co₃O₄)', group: 'oxide', rho: 6.11, M: 240.80 },
    NiO: { label: 'Nickel oxide (NiO)', group: 'oxide', rho: 6.67, M: 74.692 },
    CuO: { label: 'Copper(II) oxide (CuO)', group: 'oxide', rho: 6.31, M: 79.545 },
    CdSe: { label: 'CdSe (wurtzite)', group: 'semi', rho: 5.81, M: 191.37 },
    CdS: { label: 'CdS', group: 'semi', rho: 4.82, M: 144.47 },
    CdTe: { label: 'CdTe', group: 'semi', rho: 5.85, M: 240.01 },
    PbS: { label: 'PbS', group: 'semi', rho: 7.60, M: 239.26 },
    PbSe: { label: 'PbSe', group: 'semi', rho: 8.10, M: 286.17 },
    ZnS: { label: 'ZnS (sphalerite)', group: 'semi', rho: 4.09, M: 97.44 },
    InP: { label: 'InP', group: 'semi', rho: 4.81, M: 145.79 },
    Si: { label: 'Silicon (Si)', group: 'semi', rho: 2.329, M: 28.085 }
  };
  NC.materialGroups = { metal: 'Metals', oxide: 'Oxides', semi: 'Semiconductors / quantum dots' };
  /* Where each value comes from. Densities: CRC Handbook (103rd ed.), Section 4 "Properties of the Elements
     and Inorganic Compounds", rounded, at room temperature, for the phase named in the label. Molar masses:
     sums of IUPAC 2021 standard atomic weights. Tm and ΔHf (metals only): CRC Handbook, Section 4/6. */
  NC.materialSources = {
    rho: { ref: 'crc', text: 'CRC Handbook of Chemistry and Physics, 103rd ed., Section 4 (room temperature, rounded; phase as labelled)' },
    M: { ref: 'ciaaw2021', text: 'Sum of IUPAC 2021 standard atomic weights for the formula unit' },
    Tm: { ref: 'crc', text: 'CRC Handbook of Chemistry and Physics, 103rd ed. (melting point of the element)' },
    dHf: { ref: 'crc', text: 'CRC Handbook of Chemistry and Physics, 103rd ed. (enthalpy of fusion of the element)' }
  };
  const PHASE_NOTES = {
    SiO2: 'Amorphous (vitreous) silica; Stöber silica is often less dense (≈1.9–2.1 g/cm³) because of microporosity.',
    TiO2a: 'Anatase; rutile is denser (4.23 g/cm³).',
    CdSe: 'Wurtzite phase; zinc-blende CdSe has a very similar density.',
    ZnS: 'Sphalerite (zinc blende); wurtzite ZnS is ≈4.09–4.10 g/cm³ as well.',
    ZrO2: 'Monoclinic (baddeleyite); tetragonal/cubic stabilized zirconia is denser (≈6.0–6.1 g/cm³).',
    Fe2O3: 'Hematite (α); maghemite (γ-Fe₂O₃) is less dense (≈4.9 g/cm³).',
    Al2O3: 'Corundum (α); transition aluminas (γ, δ, θ) are less dense.'
  };
  Object.keys(NC.materials).forEach(function (k) { if (PHASE_NOTES[k]) NC.materials[k].note = PHASE_NOTES[k]; });
  NC.materialPresets = function (keys, fields) {
    return keys.map(function (k) {
      const m = NC.materials[k];
      const values = {};
      fields.forEach(function (f) { values[f] = m[f]; });
      return { label: m.label, values: values };
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
