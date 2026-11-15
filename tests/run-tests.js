#!/usr/bin/env node
/*
 * NanoCalc test suite — runs every calculator in a sandbox and checks results
 * against hand-calculated or literature values. Usage: node tests/run-tests.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).filter((s) => !s.endsWith('app.js'));

const ctx = { console, Math, JSON };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
scripts.forEach((s) => vm.runInContext(fs.readFileSync(path.join(root, s), 'utf8'), ctx, { filename: s }));
const NC = ctx.NC;

let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; failures.push(msg); }
}
function near(actual, expected, relTol, msg) {
  const good = typeof actual === 'number' && Math.abs(actual - expected) <= Math.abs(expected) * relTol;
  ok(good, msg + ': expected ≈' + expected + ', got ' + actual);
}

/* Fill numeric/select defaults the way the UI does, then overlay values. */
function inputs(id, over) {
  const def = NC.byId[id];
  const ex = typeof def.example === 'function' ? def.example() : def.example || {};
  const raw = {};
  def.inputs.forEach((i) => { raw[i.id] = i.value; });
  Object.assign(raw, ex, over || {});
  const v = {};
  def.inputs.forEach((i) => {
    const x = raw[i.id];
    v[i.id] = i.type === 'number' ? (x === '' || x === undefined || x === null ? NaN : Number(x)) : String(x === undefined ? '' : x);
  });
  return v;
}
function run(id, over) { return NC.byId[id].compute(inputs(id, over)); }
function res(out, labelStart) {
  const r = out.results.find((x) => x.label.toLowerCase().startsWith(labelStart.toLowerCase()));
  return r ? r.value : undefined;
}
function throwsInput(fn, msg) {
  try { fn(); ok(false, msg + ' (expected an input error)'); }
  catch (e) { ok(e instanceof NC.InputError, msg + ' (wrong error type: ' + e.message + ')'); }
}

/* ---------- integrity: every calculator, example, reference ---------- */
const catIds = NC.categories.map((c) => c.id);
NC.calculators.forEach((def) => {
  ok(catIds.includes(def.category), def.id + ': unknown category ' + def.category);
  (def.refs || []).forEach((r) => ok(NC.refs[r], def.id + ': missing ref ' + r));
  ok(def.inputs.every((i) => i.id && i.label), def.id + ': every input needs id and label');
  let out;
  try { out = run(def.id); } catch (e) { ok(false, def.id + ': example threw ' + e.message); return; }
  ok(out.results && out.results.length > 0, def.id + ': example gives results');
  ok(out.steps && out.steps.length > 0, def.id + ': example gives steps');
  out.steps.forEach((s) => [].concat(s.ref || []).forEach((r) => ok(NC.refs[r], def.id + ': step cites missing ref ' + r)));
  out.results.forEach((r) => ok(typeof r.value === 'string' || isFinite(r.value) || Number.isNaN(r.value), def.id + ': result ' + r.label + ' is not a number'));
  (out.plots || []).forEach((p) => ok(NC.plot(p).startsWith('<svg'), def.id + ': plot renders'));
  // presets must only set existing inputs
  (def.presets || []).forEach((p) => Object.keys(p.values).forEach((k) => ok(def.inputs.some((i) => i.id === k), def.id + ': preset ' + p.label + ' sets unknown input ' + k)));
});
ok(NC.calculators.length >= 20, 'expected at least 20 calculators, found ' + NC.calculators.length);

/* ---------- known values ---------- */
// Brus: CdSe d = 5 nm → E ≈ 2.24 eV (hand calculation), a_B ≈ 5.6 nm
let o = run('brus', { mode: 'size', d: 5 });
near(res(o, 'Band gap'), 2.239, 0.005, 'Brus CdSe 5 nm');
near(res(o, 'Exciton Bohr'), 5.56, 0.01, 'Brus CdSe Bohr radius');
o = run('brus', { mode: 'energy', E: res(run('brus', { mode: 'size', d: 4 }), 'Band gap') });
near(res(o, 'Diameter'), 4, 1e-6, 'Brus inverse round-trip');
throwsInput(() => run('brus', { mode: 'energy', E: 1.0 }), 'Brus below bulk gap');

// Particle: Au 5 nm ≈ 3866 atoms, SSA = 6000/(19.32·5) = 62.11 m²/g
o = run('particle', { mode: 'D', D: 5 });
near(res(o, 'Atoms'), 3866, 0.002, 'Au 5 nm atom count');
near(res(o, 'Specific surface'), 62.11, 0.001, 'Au 5 nm SSA');
near(res(run('particle', { mode: 'ssa', ssa: 62.112 }), 'Diameter'), 5, 0.001, 'SSA → D');

// Melting: Au 5 nm, σ = 0.27 → ≈ 1102 K
near(res(run('melting'), 'Melting point'), 1102, 0.003, 'Au 5 nm melting');

// CNT (10,10): d = 1.356 nm, armchair, θ = 30°
o = run('cnt', { mode: 'nm', n: 10, m: 10 });
near(res(o, 'Diameter'), 1.356, 0.002, 'CNT (10,10) diameter');
near(res(o, 'Chiral angle'), 30, 1e-9, 'CNT armchair angle');
ok(res(o, 'Type') === 'Armchair', 'CNT (10,10) is armchair');
ok(/Semiconducting/.test(res(run('cnt', { mode: 'nm', n: 10, m: 0 }), 'Electronic')), 'CNT (10,0) semiconducting');
near(res(run('cnt', { mode: 'rbm', rbm: 248 / 1.356 }), 'Diameter'), 1.356, 1e-6, 'CNT RBM → d');

// Bragg: Au(111) 38.18° → a ≈ 0.408 nm
near(res(run('bragg', { mode: 'd', lambda: 0.15406, tt: 38.18, h: 1, k: 1, l: 1 }), 'Lattice') || res(run('bragg'), 'Lattice'), 0.4079, 0.002, 'Bragg Au(111) lattice parameter');

// Scherrer: λ 0.15406, K 0.9, 2θ 38.2, FWHM 0.5° → 16.81 nm
o = run('scherrer', { lambda: 0.15406, K: 0.9, corr: 'none', data: '38.2, 0.5' });
const scherrerD = o.results.find((r) => /D/.test(r.label) && typeof r.value === 'number');
near(scherrerD && scherrerD.value, 16.814, 0.001, 'Scherrer single peak');

// Williamson–Hall example: D = 20 nm, ε = 0.002
o = run('wh');
near(o.results.find((r) => /size|D\b/i.test(r.label) && typeof r.value === 'number').value, 20, 0.01, 'W–H size');
near(o.results.find((r) => /strain|ε/i.test(r.label)).value, 0.002, 0.01, 'W–H strain');

// Tauc example: Eg ≈ 3.2 eV
near(res(run('tauc'), 'Band gap') || run('tauc').results[0].value, 3.2, 0.02, 'Tauc example band gap');

// Yu 2003: CdSe 550 nm → 3.04 nm (polynomial)
o = run('qdyu', { mat: 'CdSe', lam: 550 });
near(o.results.find((r) => /diameter|D\b/i.test(r.label)).value, 3.04, 0.01, 'Yu CdSe 550 nm');

// Haiss 2007: ratio 1.6 → 13.46 nm
o = run('haiss', { Aspr: 1.6, A450: 1, lspr: '' });
near(o.results.find((r) => /diameter|d\b/i.test(r.label)).value, 13.46, 0.002, 'Haiss ratio 1.6');

// DLS: D = 4.9 µm²/s at 25 °C water → 100 nm
o = run('dls', { mode: 'D', Dt: 4.9, T: 25, visc: 'water' });
near(o.results.find((r) => /hydrodynamic|d_h/i.test(r.label)).value, 100.1, 0.003, 'DLS Stokes–Einstein');

// Zeta: Smoluchowski μ = 2, εr 78.5, η 0.89 → 25.6 mV
o = run('zeta', { model: 'smol', mu: 2, epsMode: 'custom', er: 78.5, visc: 'custom', eta: 0.89 });
const z = o.results.find((r) => /ζ|zeta/i.test(r.label));
near(z && z.value, 25.61, 0.003, 'Zeta Smoluchowski');

// BET example (Vm 50, C 100) → 217.6 m²/g
o = run('bet');
near(o.results.find((r) => /surface|S_BET/i.test(r.label)).value, 217.6, 0.002, 'BET surface area');

// Kelvin: N2 p/p0 0.5 hemispherical → r_K 1.377 nm
o = run('kelvin', { x: 0.5 });
near(o.results.find((r) => /kelvin|r_K/i.test(r.label)).value, 1.377, 0.003, 'Kelvin radius');

// Raman: 514.5 nm, ID/IG 0.5 → La 33.6 nm
o = run('raman', { mode: 'La', lam: 514.5, ratio: 0.5 });
near(o.results[0].value, 33.63, 0.002, 'Raman La');

// TGA: ≈ 5.1 ligands/nm²
o = run('tga');
near(o.results.find((r) => /grafting|density/i.test(r.label)).value, 5.10, 0.01, 'TGA grafting density');

// Solution: 1 mM × 100 mL × 393.83 g/mol → 39.38 mg
o = run('solution', { mode: 'mass', M: 393.83, C: 1, V: 100, purity: 100 });
near(o.results.find((r) => /mass/i.test(r.label)).value, 39.383, 0.001, 'Precursor mass');

/* ---------- report ---------- */
console.log('\nNanoCalc tests: ' + NC.calculators.length + ' calculators, ' + Object.keys(NC.refs).length + ' references');
console.log(pass + ' passed, ' + fail + ' failed');
if (fail) {
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
