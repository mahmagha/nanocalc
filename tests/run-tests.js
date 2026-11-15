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
const listed = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).filter((s) => s.startsWith('js/') && !s.endsWith('app.js'));
// Also load scripts that exist on disk but are not yet registered in index.html (work in progress),
// so new modules are tested before integration. They are reported below.
const onDisk = []
  .concat(fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js') && f !== 'app.js').map((f) => 'js/' + f))
  .concat(fs.readdirSync(path.join(root, 'js', 'calculators')).filter((f) => f.endsWith('.js')).map((f) => 'js/calculators/' + f));
const unregistered = onDisk.filter((s) => !listed.includes(s));
const scripts = listed.concat(unregistered.filter((s) => !s.includes('/calculators/')), unregistered.filter((s) => s.includes('/calculators/')));

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

/* ---------- nanoparticle builder: material + shape + size ---------- */
// Ag sphere, D = 20 nm: N = ρ(πD³/6)N_A/M ≈ 2.455×10⁵ atoms, SSA = 6000/(ρD) = 28.57 m²/g
o = run('nanoparticle', { mat: 'Ag', shape: 'sphere', D: 20, conc: '' });
near(res(o, 'Atoms'), 245548, 0.001, 'AgNP 20 nm atoms');
near(res(o, 'Specific surface'), 28.571, 0.001, 'AgNP 20 nm SSA');
near(res(o, 'Surface atoms'), res(run('particle', { mode: 'D', D: 20, rho: 10.5, M: 107.868 }), 'Surface-atom'), 1e-9, 'Builder sphere matches particle calculator');
// Textbook sphericities (Wadell): cube 0.806, octahedron 0.846, tetrahedron 0.671, icosahedron 0.939, cylinder L=D 0.874
[['cube', { a: 10 }, 0.806], ['octahedron', { a: 10 }, 0.846], ['tetrahedron', { a: 10 }, 0.671], ['icosahedron', { a: 10 }, 0.939], ['cylinder', { D: 10, L: 10 }, 0.874], ['sphere', { D: 10 }, 1]]
  .forEach(([shape, dims, psi]) => near(res(run('nanoparticle', Object.assign({ shape: shape, conc: '' }, dims)), 'Sphericity'), psi, 0.002, 'Sphericity of ' + shape));
// Cube a = 10: V = 1000 nm³, A = 600 nm², D_v = (6000/π)^(1/3)
o = run('nanoparticle', { shape: 'cube', a: 10, conc: '' });
near(res(o, 'Volume V'), 1000, 1e-12, 'Cube volume');
near(res(o, 'Surface area A'), 600, 1e-12, 'Cube area');
near(res(o, 'Volume-equivalent'), Math.cbrt(6000 / Math.PI), 1e-12, 'Cube D_v');
// Rod with L = D degenerates to a sphere
near(res(run('nanoparticle', { shape: 'rod', D: 10, L: 10, conc: '' }), 'Volume V'), Math.PI * 1000 / 6, 1e-12, 'Rod L=D equals sphere');
throwsInput(() => run('nanoparticle', { shape: 'rod', D: 10, L: 5 }), 'Rod shorter than diameter');
// Concentration: 20 µg/mL of 20 nm Ag
o = run('nanoparticle', { mat: 'Ag', shape: 'sphere', D: 20, conc: 20 });
near(res(o, 'Particles per mL'), 20e-6 / (10.5 * (Math.PI * 8000 / 6) * 1e-21), 1e-9, 'AgNP particles per mL');
// Every shape runs and every shape's surface fraction is between 0 and 100 %
Object.keys(NC.shapes).forEach((sh) => {
  const out = run('nanoparticle', { shape: sh, D: 20, a: 20, L: 60, h: 8, conc: '' });
  const F = res(out, 'Surface atoms');
  ok(F > 0 && F < 100, sh + ': surface fraction in range');
});

/* ---------- new shapes: exact volumes/areas (PLAN.md phase 2) ---------- */
{
  const SH = NC.shapes, a = 3;
  near(SH.cuboctahedron.V({ a }), (5 * Math.SQRT2 / 3) * a ** 3, 1e-12, 'Cuboctahedron volume (5√2/3)a³');
  near(SH.cuboctahedron.A({ a }), (6 + 2 * Math.sqrt(3)) * a * a, 1e-12, 'Cuboctahedron area (6+2√3)a²');
  near(SH.truncoct.V({ a }), 8 * Math.SQRT2 * a ** 3, 1e-12, 'Truncated octahedron volume 8√2a³');
  near(SH.truncoct.A({ a }), (6 + 12 * Math.sqrt(3)) * a * a, 1e-12, 'Truncated octahedron area (6+12√3)a²');
  near(SH.decahedron.V({ a }), ((5 + Math.sqrt(5)) / 24) * a ** 3, 1e-12, 'Decahedron volume');
  near(SH.decahedron.A({ a }), 2.5 * Math.sqrt(3) * a * a, 1e-12, 'Decahedron area (10 equilateral faces)');
  // cube∩octahedron family limits: s ≥ 3h is a cube, s ≤ h an octahedron
  near(SH.cuboctahedron.V({ h: 2, s: 7 }), 64, 1e-12, 'Cube limit of cube∩octahedron');
  near(SH.cuboctahedron.V({ h: 5, s: 2 }), (4 / 3) * 8, 1e-12, 'Octahedron limit of cube∩octahedron');
  near(SH.cuboctahedron.A({ h: 5, s: 2 }), SH.octahedron.A({ a: 2 * Math.SQRT2 }), 1e-12, 'Octahedron limit area');
  // spheroid areas: prolate (a=1,c=2) 21.478; oblate (a=2,c=1) 34.692
  near(SH.spheroid.A({ D: 2, L: 4 }), 21.4784, 1e-4, 'Prolate spheroid area');
  { // oblate check against the independent form A = 2πa² + (πc²/e)·ln[(1+e)/(1−e)]
    const aa = 2, cc = 1, e = Math.sqrt(1 - (cc * cc) / (aa * aa));
    near(SH.spheroid.A({ D: 4, L: 2 }), 2 * Math.PI * aa * aa + (Math.PI * cc * cc / e) * Math.log((1 + e) / (1 - e)), 1e-12, 'Oblate spheroid area');
  }
  near(SH.spheroid.A({ D: 3, L: 3 }), Math.PI * 9, 1e-12, 'Spheroid → sphere area');
  // Textbook sphericities: cuboctahedron 0.905, truncated octahedron 0.910
  [['cuboctahedron', 0.905], ['truncoct', 0.910]].forEach(([sh, psi]) =>
    near(res(run('nanoparticle', { struct: 'solid', shape: sh, a: 10, conc: '' }), 'Sphericity'), psi, 0.002, 'Sphericity of ' + sh));
  // Offset consistency: moving every face in by ε removes A·ε of volume (exact offsets only)
  const base = { D: 20, a: 20, L: 60, h: 8 };
  Object.keys(SH).filter((k) => !SH[k].approxOffset).forEach((k) => {
    const sh = SH[k], d = {};
    sh.dims.forEach((q) => { d[q] = base[q]; });
    const eps = 1e-5;
    near((sh.V(d) - sh.V(sh.shrink(d, eps))) / eps, sh.A(d), 1e-3, k + ': dV/dt = A (offset is exact)');
    // growing then shrinking by the same t gives the original volume
    near(sh.V(sh.shrink(sh.shrink(d, -3), 3)), sh.V(d), 1e-9, k + ': grow then shrink round-trips');
  });
}

/* ---------- core–shell and hollow (PLAN.md phase 3) ---------- */
{
  // Au@SiO2: 20 nm Au core + 10 nm SiO2 shell → outer 40 nm sphere
  const Vc = Math.PI * 20 ** 3 / 6, Vo = Math.PI * 40 ** 3 / 6, Vs = Vo - Vc;
  const mc = 19.32 * Vc * 1e-21, ms = 2.2 * Vs * 1e-21;
  o = run('nanoparticle', { struct: 'coreshell', mat: 'Au', shape: 'sphere', D: 20, smat: 'SiO2', ts: 10, conc: '' });
  near(res(o, 'Outer volume-equivalent'), 40, 1e-9, 'Au@SiO2 outer diameter');
  near(res(o, 'Shell mass fraction'), (100 * ms) / (mc + ms), 1e-9, 'Au@SiO2 shell mass fraction');
  near(res(o, 'Shell volume fraction'), (100 * Vs) / Vo, 1e-9, 'Au@SiO2 shell volume fraction');
  near(res(o, 'Effective density'), (mc + ms) / (Vo * 1e-21), 1e-9, 'Au@SiO2 effective density');
  near(res(o, 'Atoms in core'), (mc * NC.C.NA) / 196.967, 1e-9, 'Au@SiO2 core atoms');
  near(res(o, 'Specific surface area'), (Math.PI * 1600 * 1e-18) / (mc + ms), 1e-9, 'Au@SiO2 SSA');
  // Core–shell cube: 10 nm core + 2 nm shell → 14 nm cube
  near(res(run('nanoparticle', { struct: 'coreshell', mat: 'Ag', shape: 'cube', a: 10, smat: 'Au', ts: 2, conc: '' }), 'Outer volume-equivalent'), Math.cbrt(6 * 14 ** 3 / Math.PI), 1e-9, 'Core–shell cube grows to a + 2t');
  // Au nanocage: 50 nm cube, 5 nm wall → wall = 50³ − 40³
  o = run('nanoparticle', { struct: 'hollow', mat: 'Au', shape: 'cube', a: 50, w: 5, conc: '' });
  near(res(o, 'Wall volume'), 50 ** 3 - 40 ** 3, 1e-12, 'Nanocage wall volume');
  near(res(o, 'Cavity volume'), 40 ** 3, 1e-12, 'Nanocage cavity volume');
  near(res(o, 'Mass vs. solid'), 100 * (1 - 0.512), 1e-9, 'Nanocage mass vs. solid (48.8 %)');
  near(res(o, 'SSA, open cage'), ((6 * 2500 + 6 * 1600) * 1e-18) / (19.32 * 61000 * 1e-21), 1e-9, 'Nanocage open SSA');
  throwsInput(() => run('nanoparticle', { struct: 'hollow', shape: 'sphere', D: 10, w: 6 }), 'Wall thicker than radius');
  // Every shape × every structure runs and gives finite headline numbers
  Object.keys(NC.shapes).forEach((sh) => ['solid', 'coreshell', 'hollow'].forEach((st) => {
    let out;
    try { out = run('nanoparticle', { struct: st, shape: sh, D: 40, a: 40, L: 120, h: 16, ts: 3, w: 3, mat: 'Au', smat: 'SiO2', conc: 10 }); }
    catch (e) { ok(false, sh + '/' + st + ' threw ' + e.message); return; }
    ok(out.results.filter((r) => r.main).every((r) => isFinite(r.value)), sh + '/' + st + ': finite main results');
    ok(out.figures[0].svg.indexOf('<svg') === 0, sh + '/' + st + ': schematic renders');
  }));
  // New material presets are present with positive density and molar mass
  ['CdS', 'CdTe', 'PbS', 'PbSe', 'ZnS', 'InP', 'Si', 'Fe2O3', 'Al2O3', 'ZrO2', 'Co3O4', 'NiO', 'CuO', 'Co', 'Al', 'Rh', 'Ir']
    .forEach((k) => ok(NC.materials[k] && NC.materials[k].rho > 0 && NC.materials[k].M > 0 && NC.materialGroups[NC.materials[k].group], 'material preset ' + k));
}

/* ---------- LaTeX: every formula converts to brace-balanced LaTeX ---------- */
function balanced(t) {
  let d = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\') { i++; continue; }
    if (t[i] === '{') d++;
    if (t[i] === '}') d--;
    if (d < 0) return false;
  }
  return d === 0;
}
let texCount = 0;
NC.calculators.forEach((def) => {
  run(def.id).steps.forEach((s) => {
    [[s.formula, s.tex], [s.sub, s.subTex], [s.result, s.resultTex]].forEach(([plain, explicit]) => {
      const t = explicit || NC.toTex(plain);
      if (!t) return;
      texCount++;
      ok(balanced(t), def.id + ': unbalanced LaTeX for "' + (plain || explicit) + '" → ' + t);
    });
  });
});
ok(texCount > 250, 'expected >250 LaTeX formulas, got ' + texCount);
ok(NC.toTex('x̄ = Σxᵢ/n') === '\\bar{x} = \\Sigma x_{i}/n', 'converter handles x̄ and ᵢ: ' + NC.toTex('x̄ = Σxᵢ/n'));
ok(NC.toTex('√(a² + b²)') === '\\sqrt{a^{2} + b^{2}}', 'converter handles √(): ' + NC.toTex('√(a² + b²)'));
ok(NC.toTex('This is a sentence with several words') === null, 'prose stays plain text');

/* ---------- vendored KaTeX: present, referenced locally, unmodified ---------- */
{
  const crypto = require('crypto');
  const kdir = path.join(root, 'vendor', 'katex', '0.16.11');
  ok(/href="vendor\/katex\/0\.16\.11\/katex\.min\.css"/.test(html) && /src="vendor\/katex\/0\.16\.11\/katex\.min\.js"/.test(html), 'index.html loads the local KaTeX copy');
  ok(!/(src|href)="https?:/.test(html), 'index.html loads no remote scripts or stylesheets');
  const sri = JSON.parse(fs.readFileSync(path.join(kdir, 'SRI.json'), 'utf8'));
  Object.keys(sri).forEach((f) => {
    const p = path.join(kdir, f);
    const got = fs.existsSync(p) ? 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(p)).digest('base64') : 'missing';
    ok(got === sri[f], 'KaTeX file integrity: ' + f);
  });
  const css = fs.readFileSync(path.join(kdir, 'katex.min.css'), 'utf8');
  [...new Set(css.match(/fonts\/[\w-]+\.woff2/g))].forEach((f) => ok(fs.existsSync(path.join(kdir, f)), 'KaTeX font present: ' + f));
  // KaTeX itself renders a formula in Node
  const kctx = { console };
  kctx.window = kctx; kctx.self = kctx; kctx.globalThis = kctx;
  vm.createContext(kctx);
  vm.runInContext(fs.readFileSync(path.join(kdir, 'katex.min.js'), 'utf8'), kctx);
  let rendered = '';
  try { rendered = kctx.katex.renderToString('D = \\dfrac{K\\lambda}{\\beta\\cos\\theta}', { throwOnError: true }); } catch (e) { rendered = 'ERR ' + e.message; }
  ok(rendered.indexOf('katex') >= 0, 'local KaTeX renders: ' + rendered.slice(0, 60));

  // Every formula of every calculator's example (and every option of a 'mode' select) typesets in KaTeX
  let typeset = 0;
  NC.calculators.forEach((def) => {
    const modeInp = def.inputs.find((i) => i.id === 'mode');
    const modes = modeInp ? modeInp.options.map((o) => o[0]) : [undefined];
    modes.forEach((mode) => {
      let out;
      try { out = run(def.id, mode === undefined ? {} : { mode }); } catch (e) { return; } // some modes need extra inputs
      out.steps.forEach((s) => {
        [[s.formula, s.tex], [s.sub, s.subTex], [s.result, s.resultTex]].forEach(([plain, explicit]) => {
          const t = explicit || NC.toTex(plain);
          if (!t) return;
          typeset++;
          try { kctx.katex.renderToString(t, { throwOnError: true, strict: 'ignore' }); }
          catch (e) { ok(false, def.id + (mode ? '/' + mode : '') + ': KaTeX cannot typeset "' + String(plain || explicit).slice(0, 80) + '" → ' + e.message.slice(0, 100)); }
        });
      });
    });
  });
  ok(typeset > 300, 'KaTeX typeset ' + typeset + ' formulas');
}

/* ---------- per-area test modules: tests/*.test.js ---------- */
// Each module: module.exports = function (t) { const { NC, run, res, near, ok, throwsInput, inputs } = t; ... }
const testModules = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort();
testModules.forEach((f) => {
  const before = pass + fail;
  try { require(path.join(__dirname, f))({ NC, run, res, near, ok, throwsInput, inputs, root, vm, fs, path }); }
  catch (e) { ok(false, f + ' crashed: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
  console.log('  ' + f + ': ' + (pass + fail - before) + ' checks');
});

/* ---------- report ---------- */
if (unregistered.length) console.log('\nNote: not yet registered in index.html: ' + unregistered.join(', '));
console.log('\nNanoCalc tests: ' + NC.calculators.length + ' calculators, ' + Object.keys(NC.refs).length + ' references');
console.log(pass + ' passed, ' + fail + ' failed');
if (fail) {
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
