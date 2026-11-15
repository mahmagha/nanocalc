/* Tests for the platform layer: typed units, URL state, Monte Carlo uncertainty. */
module.exports = function (t) {
  const { NC, ok, near, inputs } = t;

  /* ---------- units ---------- */
  const P = NC.parseWithUnit;
  near(P('5 Å', 'nm'), 0.5, 1e-12, '5 Å → nm');
  near(P('0.2 µm', 'nm'), 200, 1e-12, '0.2 µm → nm');
  near(P('0.2 μm', 'nm'), 200, 1e-12, '0.2 μm (Greek mu) → nm');
  near(P('3 um', 'nm'), 3000, 1e-12, '3 um → nm');
  near(P('1e-3 mm', 'nm'), 1000, 1e-12, '1e-3 mm → nm');
  near(P('25 °C', 'K'), 298.15, 1e-12, '25 °C → K');
  near(P('298.15 K', '°C'), 25, 1e-9, '298.15 K → °C');
  near(P('2 mg/mL', 'µg/mL'), 2000, 1e-12, '2 mg/mL → µg/mL');
  near(P('50 mg/L', 'µg/mL'), 50, 1e-12, '50 mg/L → µg/mL');
  near(P('5 mM', 'μM'), 5000, 1e-12, '5 mM → μM (field written with Greek mu)');
  near(P('0.5 rad', '°'), 28.6478897565, 1e-9, '0.5 rad → °');
  near(P('250 meV', 'eV'), 0.25, 1e-12, '250 meV → eV');
  near(P('5240 kg/m³', 'g/cm³'), 5.24, 1e-12, 'kg/m³ → g/cm³');
  near(P('0.89 cP', 'mPa·s'), 0.89, 1e-12, 'cP → mPa·s');
  near(P('72 mN/m', 'J/m²'), 0.072, 1e-12, 'mN/m → J/m²');
  near(P('4.9e-8 cm²/s', 'μm²/s'), 4.9, 1e-12, 'cm²/s → μm²/s');
  near(P('1,5', 'nm'), 1.5, 1e-12, 'decimal comma');
  near(P('−2.5', 'nm'), -2.5, 1e-12, 'Unicode minus');
  near(P('7', 'nm'), 7, 1e-12, 'bare number keeps the field unit');
  near(P('7 nm', 'nm'), 7, 1e-12, 'same unit');
  near(NC.parseWithUnit('0.5 K', '°C', { difference: true }), 0.5, 1e-12, 'temperature difference has no offset');
  ok(Number.isNaN(P('5 g/mol', 'nm')), 'incompatible units give NaN');
  ok(/Cannot convert/.test(NC.parseUnitDetailed('5 g/mol', 'nm').error), 'incompatible units explain why');
  ok(Number.isNaN(P('2 eV', 'nm')), 'no energy ↔ wavelength conversion');
  ok(Number.isNaN(P('5 furlongs', 'nm')), 'unknown unit gives NaN');
  ok(/Unknown unit/.test(NC.parseUnitDetailed('5 furlongs', 'nm').error), 'unknown unit message');
  ok(Number.isNaN(P('5 A', 'nm')), 'bare "A" is refused as ambiguous');
  ok(Number.isNaN(P('3 nm', '')), 'unit typed into a dimensionless field is refused');
  ok(Number.isNaN(P('abc', 'nm')), 'text is not a number');
  ok(NC.parseUnitDetailed('', 'nm').empty === true, 'empty input is flagged as empty');
  ok(NC.unitHint('nm').indexOf('Å') >= 0 && NC.unitHint('m₀') === '', 'unit hints only for convertible units');

  /* ---------- URL state ---------- */
  const st = { D: '20', mat: 'Ag', data: '38.2, 0.5\n44.4 0.6 # % & ? = /', u_D: '0.5', empty: '' };
  const round = NC.decodeState(NC.encodeState(st));
  ok(round && round.D === '20' && round.mat === 'Ag' && round.data === st.data && round.u_D === '0.5' && !('empty' in round), 'state encode/decode round trip');
  ok(/^[A-Za-z0-9%\-_.!~*'()]+$/.test(NC.encodeState(st)), 'encoded state is URL-safe');
  ok(NC.decodeState('%7Bbroken') === null && NC.decodeState(encodeURIComponent('[1,2]')) === null, 'invalid state is rejected');

  /* ---------- Monte Carlo propagation ---------- */
  // Scherrer D = Kλ/(β cosθ): with u(K) and u(λ) only, the model is a product, so to first order
  // u(D)/D = √[(u_K/K)² + (u_λ/λ)²].
  const def = NC.byId.scherrer;
  const v = inputs('scherrer', { lambda: 0.15406, K: 0.9, corr: 'none', data: '38.2, 0.5' });
  const D0 = def.compute(v).results.find((r) => typeof r.value === 'number').value;
  const label = def.compute(v).results.find((r) => typeof r.value === 'number').label;
  const uK = 0.02, uL = 0.0005;
  const analytic = D0 * Math.sqrt(Math.pow(uK / 0.9, 2) + Math.pow(uL / 0.15406, 2));
  const mc = NC.mcPropagate(def, v, { K: uK, lambda: uL }, { trials: 4000, seed: 42 });
  ok(mc.trials === 4000 && mc.failed === 0, 'MC ran 4000 trials without failures');
  near(mc.results[label].u, analytic, 0.05, 'MC standard uncertainty matches first-order propagation (Scherrer)');
  near(mc.results[label].mean, D0, 0.01, 'MC mean close to nominal for a near-linear model');
  ok(mc.results[label].lo < D0 && mc.results[label].hi > D0, '95 % interval brackets the nominal value');
  near((mc.results[label].hi - mc.results[label].lo) / 2, 1.96 * analytic, 0.08, '95 % half-width ≈ 1.96 u for a near-normal output');
  const mc2 = NC.mcPropagate(def, v, { K: uK, lambda: uL }, { trials: 500, seed: 42 });
  const mc3 = NC.mcPropagate(def, v, { K: uK, lambda: uL }, { trials: 500, seed: 42 });
  ok(mc2.results[label].u === mc3.results[label].u, 'seeded runs are reproducible');
  // Adaptive mode respects the minimum trial count
  const ad = NC.mcPropagate(def, v, { K: uK }, { seed: 1, timeBudget: 1 });
  ok(ad.trials >= 200 && ad.trials <= 2000, 'adaptive run uses 200–2000 trials (' + ad.trials + ')');
  // Trials outside the model's valid range are discarded and counted (wall thicker than the cage)
  const hol = NC.byId.nanoparticle;
  const hv = inputs('nanoparticle', { struct: 'hollow', shape: 'cube', a: 10, w: 4.9, conc: '' });
  const mh = NC.mcPropagate(hol, hv, { w: 0.2 }, { trials: 400, seed: 7 });
  ok(mh.failed > 50 && mh.failed < 350, 'invalid trials are discarded and counted (' + mh.failed + ' of 400)');
  // Zero or missing uncertainties propagate nothing
  const none = NC.mcPropagate(def, v, {}, { trials: 50, seed: 3 });
  ok(none.inputs.length === 0 && none.results[label].u === 0, 'no uncertainties → zero spread');
  ok(NC.refs.jcgm101 && NC.refs.jcgm100, 'JCGM references registered');
};
