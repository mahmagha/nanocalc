/*
 * Typed units for number fields, plus small pure helpers for shareable URL state.
 *
 *   NC.parseUnitDetailed('5 Å', 'nm')   → { value: 0.5, converted: { from: 'Å', to: 'nm' } }
 *   NC.parseUnitDetailed('2 g/mol', 'nm') → { value: NaN, error: 'Cannot convert …' }
 *   NC.parseWithUnit(text, fieldUnit)   → number in the field's unit, or NaN
 *
 * Conversions are only made within one physical dimension (no energy ↔ wavelength).
 * DOM-free so it can be tested in Node.
 */
(function (global) {
  'use strict';
  const NC = global.NC;
  const E_CHARGE = 1.602176634e-19; // exact, CODATA 2018

  /* factor = value of 1 unit in the dimension's base unit */
  const DIMS = {
    length: { label: 'length', hint: 'e.g. 5 Å, 0.2 µm, 3 nm', units: { m: 1, cm: 1e-2, mm: 1e-3, 'µm': 1e-6, nm: 1e-9, 'Å': 1e-10, pm: 1e-12 } },
    area: { label: 'area', hint: 'e.g. 2 µm², 150 nm²', units: { m2: 1, cm2: 1e-4, mm2: 1e-6, 'µm2': 1e-12, nm2: 1e-18, 'Å2': 1e-20 } },
    volume: { label: 'volume', hint: 'e.g. 250 µL, 0.1 L', units: { m3: 1, L: 1e-3, mL: 1e-6, 'µL': 1e-9, nL: 1e-12, cm3: 1e-6, mm3: 1e-9, 'µm3': 1e-18, nm3: 1e-27 } },
    mass: { label: 'mass', hint: 'e.g. 25 mg, 0.1 g', units: { kg: 1, g: 1e-3, mg: 1e-6, 'µg': 1e-9, ng: 1e-12, pg: 1e-15, fg: 1e-18 } },
    massconc: { label: 'mass concentration', hint: 'e.g. 0.05 mg/mL, 50 mg/L', units: { 'g/L': 1, 'mg/mL': 1, 'µg/mL': 1e-3, 'ng/mL': 1e-6, 'mg/L': 1e-3, 'µg/L': 1e-6, 'g/mL': 1e3, 'kg/m3': 1 } },
    molar: { label: 'molar concentration', hint: 'e.g. 5 mM, 20 µM', units: { M: 1, mM: 1e-3, 'µM': 1e-6, nM: 1e-9, pM: 1e-12, 'mol/L': 1, 'mmol/L': 1e-3 } },
    time: { label: 'time', hint: 'e.g. 30 min, 2 h', units: { s: 1, ms: 1e-3, 'µs': 1e-6, ns: 1e-9, min: 60, h: 3600 } },
    rate: { label: 'rate', hint: 'e.g. 2 kHz', units: { 's-1': 1, '1/s': 1, 'ms-1': 1e3, Hz: 1, kHz: 1e3 } },
    energy: { label: 'energy', hint: 'e.g. 250 meV', units: { eV: 1, meV: 1e-3, keV: 1e3, J: 1 / E_CHARGE } },
    molarEnergy: { label: 'molar energy', hint: 'e.g. 3 kcal/mol', units: { 'kJ/mol': 1, 'J/mol': 1e-3, 'kcal/mol': 4.184 } },
    angle: { label: 'angle', hint: 'e.g. 0.5 rad', units: { '°': 1, deg: 1, rad: 180 / Math.PI, mrad: 0.18 / Math.PI } },
    temperature: { label: 'temperature', hint: 'e.g. 25 °C or 298 K', units: { K: 1, '°C': 1 } },
    density: { label: 'density', hint: 'e.g. 5240 kg/m³', units: { 'g/cm3': 1, 'g/mL': 1, 'kg/m3': 1e-3, 'kg/L': 1 } },
    molarMass: { label: 'molar mass', hint: 'e.g. 1.2 kDa', units: { 'g/mol': 1, 'kg/mol': 1000, Da: 1, kDa: 1000 } },
    specificArea: { label: 'specific surface area', hint: 'e.g. 1500 cm²/g', units: { 'm2/g': 1, 'cm2/g': 1e-4 } },
    diffusivity: { label: 'diffusion coefficient', hint: 'e.g. 4.9e-8 cm²/s', units: { 'm2/s': 1, 'cm2/s': 1e-4, 'µm2/s': 1e-12, 'nm2/s': 1e-18 } },
    viscosity: { label: 'viscosity', hint: 'e.g. 0.89 cP', units: { Pas: 1, mPas: 1e-3, cP: 1e-3, P: 0.1 } },
    surfaceEnergy: { label: 'surface energy', hint: 'e.g. 72 mN/m', units: { 'J/m2': 1, 'N/m': 1, 'mN/m': 1e-3, 'mJ/m2': 1e-3 } },
    wavenumber: { label: 'wavenumber', hint: 'e.g. 1580 cm⁻¹', units: { 'cm-1': 1, 'm-1': 0.01 } },
    molarVolume: { label: 'molar volume', hint: 'e.g. 0.03468 L/mol', units: { 'cm3/mol': 1, 'mL/mol': 1, 'L/mol': 1000, 'm3/mol': 1e6 } },
    numberConc: { label: 'number concentration', hint: 'e.g. 1e15 L⁻¹', units: { 'mL-1': 1, '/mL': 1, 'particles/mL': 1, 'cm-3': 1, 'L-1': 1e-3, '/L': 1e-3, 'm-3': 1e-6 } }
  };
  const ALIASES = {
    um: 'µm', angstrom: 'Å', ang: 'Å', 'Ångström': 'Å', A: null, // bare "A" is ambiguous (ampere/ångström) — refuse
    ml: 'mL', ul: 'µL', 'µl': 'µL', l: 'L', nl: 'nL',
    ug: 'µg', uM: 'µM', us: 'µs', 'mg/ml': 'mg/mL', 'ug/mL': 'µg/mL', 'µg/ml': 'µg/mL', 'ug/ml': 'µg/mL', 'ng/ml': 'ng/mL', 'g/l': 'g/L', 'mg/l': 'mg/L', 'ug/L': 'µg/L', 'mol/l': 'mol/L', 'mmol/l': 'mmol/L',
    degC: '°C', '℃': '°C', C: null, // bare "C" (coulomb?) refused
    degree: '°', degrees: '°',
    'g/ml': 'g/mL', 'kg/l': 'kg/L', 'um2': 'µm2', 'um3': 'µm3', 'um2/s': 'µm2/s', 'ml/mol': 'mL/mol', 'l/mol': 'L/mol',
    'mPa·s': 'mPas', 'Pa·s': 'Pas', cp: 'cP', 'ml-1': 'mL-1', '/ml': '/mL', 'particles/ml': 'particles/mL'
  };

  /** Canonical spelling: µ for both micro sign and Greek mu, ASCII exponents, no spaces or multiplication dots. */
  function norm(u) {
    return String(u || '')
      .replace(/μ/g, 'µ')
      .replace(/⁻¹/g, '-1').replace(/⁻²/g, '-2').replace(/⁻³/g, '-3')
      .replace(/²/g, '2').replace(/³/g, '3')
      .replace(/\^/g, '')
      .replace(/[\s·*⋅]/g, '');
  }
  const INDEX = {};
  Object.keys(DIMS).forEach(function (dim) {
    Object.keys(DIMS[dim].units).forEach(function (u) { INDEX[norm(u)] = { dim: dim, key: u, f: DIMS[dim].units[u] }; });
  });
  function lookup(u) {
    let n = norm(u);
    if (!n) return null;
    if (Object.prototype.hasOwnProperty.call(ALIASES, n)) {
      if (ALIASES[n] === null) return { ambiguous: true };
      n = norm(ALIASES[n]);
    }
    if (INDEX[n]) return INDEX[n];
    if (n[0] === 'u' && INDEX['µ' + n.slice(1)]) return INDEX['µ' + n.slice(1)]; // u-prefix for micro
    return null;
  }

  /**
   * Parse "number [unit]" into the field's unit.
   * opts.difference: treat temperatures as differences (no 273.15 offset), e.g. for uncertainties.
   */
  NC.parseUnitDetailed = function (text, fieldUnit, opts) {
    opts = opts || {};
    const s = String(text === undefined || text === null ? '' : text).trim().replace(/[−–]/g, '-');
    if (s === '') return { value: NaN, empty: true };
    const m = s.match(/^([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?)\s*(.*)$/);
    if (!m) return { value: NaN, error: '“' + s + '” is not a number.' };
    let numStr = m[1];
    if (numStr.indexOf(',') >= 0 && numStr.indexOf('.') < 0) numStr = numStr.replace(',', '.');
    const x = Number(numStr);
    if (!isFinite(x)) return { value: NaN, error: '“' + s + '” is not a number.' };
    const typed = m[2].trim();
    if (!typed) return { value: x };
    if (norm(typed) === norm(fieldUnit)) return { value: x };
    const from = lookup(typed);
    if (from && from.ambiguous) return { value: NaN, error: 'The unit “' + typed + '” is ambiguous. Write it out, e.g. Å or °C.' };
    if (!from) return { value: NaN, error: 'Unknown unit “' + typed + '”.' };
    const to = lookup(fieldUnit);
    if (!to || to.ambiguous) {
      return { value: NaN, error: fieldUnit ? 'This field only accepts ' + fieldUnit + '; remove “' + typed + '” or convert it yourself.' : 'This field has no unit; remove “' + typed + '”.' };
    }
    if (from.dim !== to.dim) {
      return { value: NaN, error: 'Cannot convert ' + typed + ' (' + DIMS[from.dim].label + ') to ' + fieldUnit + ' (' + DIMS[to.dim].label + ').' };
    }
    let value;
    if (from.dim === 'temperature' && !opts.difference) {
      const kelvin = from.key === 'K' ? x : x + 273.15;
      value = to.key === 'K' ? kelvin : kelvin - 273.15;
    } else {
      value = (x * from.f) / to.f;
    }
    return { value: value, converted: { from: typed, to: fieldUnit } };
  };
  NC.parseWithUnit = function (text, fieldUnit, opts) { return NC.parseUnitDetailed(text, fieldUnit, opts).value; };

  /** Short hint for a field, or '' when its unit is not convertible. */
  NC.unitHint = function (fieldUnit) {
    const u = lookup(fieldUnit);
    return u && !u.ambiguous ? 'Number in ' + fieldUnit + ', or add a unit (' + DIMS[u.dim].hint + ')' : '';
  };
  NC.unitDimension = function (fieldUnit) { const u = lookup(fieldUnit); return u && !u.ambiguous ? u.dim : null; };

  /* ------------------------------------------------------------------ */
  /* URL state: inputs encoded as URI-escaped JSON in #/calc/id?state=…  */
  /* ------------------------------------------------------------------ */
  NC.encodeState = function (obj) {
    const clean = {};
    Object.keys(obj || {}).forEach(function (k) {
      const v = obj[k];
      if (v !== undefined && v !== null && String(v) !== '') clean[k] = String(v);
    });
    return encodeURIComponent(JSON.stringify(clean));
  };
  NC.decodeState = function (str) {
    try {
      const o = JSON.parse(decodeURIComponent(str));
      if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
      const out = {};
      Object.keys(o).forEach(function (k) { if (typeof o[k] === 'string' || typeof o[k] === 'number') out[k] = String(o[k]); });
      return out;
    } catch (e) {
      return null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
