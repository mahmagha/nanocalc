/* Workstream A: porous, Janus, nanostar, rounded polyhedra, size distributions (nanoparticle builder). */
'use strict';
module.exports = function (t) {
  const { NC, run, res, near, ok, throwsInput, vm, fs, path, root } = t;
  const PI = Math.PI, SH = NC.shapes;
  const base = { conc: '', rc: 0, dist: 'mono' };
  const np = (over) => run('nanoparticle', Object.assign({}, base, over));

  /* ---- polyhedron machinery: half-space V/A equal the analytic formulas ---- */
  [['cube', { a: 7 }], ['octahedron', { a: 7 }], ['tetrahedron', { a: 7 }], ['icosahedron', { a: 7 }], ['decahedron', { a: 7 }],
    ['cuboctahedron', { a: 7 }], ['truncoct', { a: 7 }], ['prism', { a: 30, h: 6 }]].forEach(([k, d]) => {
    const st = SH[k].sharpStats(d);
    near(st.V, SH[k].V(d), 1e-9, k + ': half-space volume = analytic');
    near(st.A, SH[k].A(d), 1e-9, k + ': half-space area = analytic');
  });
  // Edge-curvature sums M = Σ l·φ/2 (φ = angle between face normals) from known edge sets
  const a = 7;
  near(SH.cube.sharpStats({ a }).M, 12 * a * (PI / 2) / 2, 1e-9, 'cube M = 3πa');
  near(SH.octahedron.sharpStats({ a }).M, 12 * a * Math.acos(1 / 3) / 2, 1e-9, 'octahedron M');
  near(SH.tetrahedron.sharpStats({ a }).M, 6 * a * Math.acos(-1 / 3) / 2, 1e-9, 'tetrahedron M');
  near(SH.icosahedron.sharpStats({ a }).M, 30 * a * Math.acos(Math.sqrt(5) / 3) / 2, 1e-9, 'icosahedron M');
  near(SH.cuboctahedron.sharpStats({ a }).M, 24 * a * Math.acos(1 / Math.sqrt(3)) / 2, 1e-9, 'cuboctahedron M (24 square–triangle edges)');
  near(SH.truncoct.sharpStats({ a }).M, a * (24 * Math.acos(1 / Math.sqrt(3)) + 12 * Math.acos(1 / 3)) / 2, 1e-9, 'truncated octahedron M (24 sq–hex + 12 hex–hex)');
  ok(SH.decahedron.sharpStats({ a }).edges === 15, 'decahedron has 15 edges');
  ok(SH.icosahedron.sharpStats({ a }).edges === 30 && SH.truncoct.sharpStats({ a }).edges === 36, 'edge counts icosahedron 30, truncated octahedron 36');
  near(SH.decahedron.inradius({ a: 1 }), (5 + Math.sqrt(5)) / (10 * Math.sqrt(3)), 1e-12, 'decahedron inradius (5+√5)/(10√3)·a');
  // Decahedron volume from first principles: two pentagonal pyramids with equilateral faces
  {
    const R = 1 / (2 * Math.sin(PI / 5)), H = Math.sqrt(1 - R * R), base = (5 / 2) * R * R * Math.sin((2 * PI) / 5);
    near(SH.decahedron.V({ a: 1 }), 2 * (base * H) / 3, 1e-12, 'decahedron V = 2 pyramids = (5+√5)/12·a³');
  }

  /* ---- rounded polyhedra (Steiner) ---- */
  {
    const A0 = 20, r = 3, ap = A0 - 2 * r;
    const Vexp = ap ** 3 + 6 * ap * ap * r + 3 * PI * ap * r * r + (4 / 3) * PI * r ** 3;
    const Aexp = 6 * ap * ap + 6 * PI * ap * r + 4 * PI * r * r;
    const o = np({ shape: 'cube', a: A0, rc: r });
    near(res(o, 'Volume V'), Vexp, 1e-12, 'rounded cube volume a′³ + 6a′²r + 3πa′r² + 4/3πr³');
    near(res(o, 'Surface area A'), Aexp, 1e-12, 'rounded cube area 6a′² + 6πa′r + 4πr²');
    near(res(np({ shape: 'cube', a: A0, rc: 0 }), 'Volume V'), 8000, 1e-15, 'r = 0 reproduces the sharp cube');
    near(res(np({ shape: 'cube', a: A0, rc: 10 }), 'Volume V'), (PI * 8000) / 6, 1e-12, 'r = a/2 turns a cube into a sphere of diameter a');
    near(res(np({ shape: 'cube', a: A0, rc: 10 }), 'Sphericity'), 1, 1e-9, 'fully rounded cube has sphericity 1');
    [['octahedron', a / Math.sqrt(6)], ['icosahedron', (Math.sqrt(3) * (3 + Math.sqrt(5)) / 12) * a], ['decahedron', SH.decahedron.inradius({ a })], ['tetrahedron', a / (2 * Math.sqrt(6))]].forEach(([k, rin]) => {
      near(res(np({ shape: k, a, rc: rin }), 'Volume V'), (4 / 3) * PI * rin ** 3, 1e-6, k + ': r = inradius gives a sphere');
    });
    throwsInput(() => np({ shape: 'cube', a: 20, rc: 11 }), 'radius above the inradius');
    throwsInput(() => np({ shape: 'cuboctahedron', a: 10, rc: 10 / Math.SQRT2 }), 'non-tangential shape needs r < smallest face distance');
    // Offset exactness of rounded bodies: dV/dt = A for t < r and t > r
    [['cube', { a: 20, r: 3 }], ['truncoct', { a: 6, r: 1.5 }], ['decahedron', { a: 20, r: 2 }], ['prism', { a: 40, h: 10, r: 2 }]].forEach(([k, d]) => {
      const sh = SH[k], eps = 1e-5;
      near((sh.V(d) - sh.V(sh.shrink(d, eps))) / eps, sh.A(d), 1e-4, k + ' rounded: dV/dt = A');
      const big = sh.shrink(d, d.r + 0.5);
      ok(!(big.r > 0), k + ': shrinking past r gives a sharp eroded polyhedron');
      near(sh.V(big), sh.V(sh.shrink(Object.assign({}, d, { r: 0 }), d.r + 0.5)), 1e-12, k + ': erosion beyond r equals the sharp offset');
    });
    // Core–shell with a rounded core: outer = inner P′ ⊕ B(r + ts)
    const o2 = np({ struct: 'coreshell', shape: 'cube', a: 10, rc: 2, mat: 'Ag', smat: 'Au', ts: 3 });
    const Vout = 6 ** 3 + 6 * 36 * 5 + 3 * PI * 6 * 25 + (4 / 3) * PI * 125;
    near(res(o2, 'Outer volume-equivalent'), Math.cbrt((6 * Vout) / PI), 1e-12, 'rounded core–shell: outer radius r + t_s');
  }

  /* ---- nanostar ---- */
  {
    const D = 40, N = 12, l = 20, b = 10, rb = b / 2;
    const V = (PI * D ** 3) / 6 + (N * PI * b * b * l) / 12;
    const A = PI * D * D + N * (PI * rb * Math.sqrt(rb * rb + l * l) - PI * rb * rb);
    const o = np({ shape: 'nanostar', D, N, sl: l, sb: b, mat: 'Au' });
    near(res(o, 'Volume V'), V, 1e-12, 'nanostar volume');
    near(res(o, 'Surface area A'), A, 1e-12, 'nanostar area');
    near(res(o, 'Atoms per particle'), (19.32 * V * 1e-21 * NC.C.NA) / 196.967, 1e-12, 'nanostar atoms');
    throwsInput(() => np({ shape: 'nanostar', D: 10, N: 100, sl: 5, sb: 20 }), 'spike bases larger than the core');
    throwsInput(() => np({ shape: 'nanostar', D: 10, N: 2.5, sl: 5, sb: 2 }), 'non-integer spike count');
    ok(o.notes.some((n) => /Nanostar/.test(n)), 'nanostar approximation is stated');
  }

  /* ---- porous ---- */
  {
    const rho = 2.2, Vp = 1, dp = 4, D = 100;
    const phi = (Vp * rho) / (1 + Vp * rho), rapp = rho * (1 - phi);
    const o = np({ struct: 'porous', mat: 'SiO2', shape: 'sphere', D, pmode: 'vp', vp: Vp, dp });
    near(res(o, 'Porosity'), 100 * phi, 1e-12, 'porosity from pore volume (68.75 %)');
    near(res(o, 'Internal SSA'), (4000 * Vp) / dp, 1e-12, 'internal SSA 4V_p/d_p = 1000 m²/g');
    near(res(o, 'External SSA'), 6000 / (rapp * D), 1e-9, 'external SSA 6/(ρ_app·D)');
    near(res(o, 'Total SSA'), 1000 + 6000 / (rapp * D), 1e-9, 'total SSA');
    near(res(o, 'Apparent density'), rapp, 1e-12, 'apparent density ρ(1 − φ)');
    const o2 = np({ struct: 'porous', mat: 'SiO2', shape: 'sphere', D, pmode: 'phi', phi: 50, dp });
    near(res(o2, 'Specific pore volume'), 0.5 / (rho * 0.5), 1e-12, 'pore volume from porosity');
    near(res(o2, 'Porosity'), 50, 1e-12, 'φ → V_p → φ round trip');
    throwsInput(() => np({ struct: 'porous', pmode: 'phi', phi: 100, dp: 4 }), 'porosity of 100 %');
  }

  /* ---- Janus ---- */
  {
    const D = 20, fB = 0.3, V = (PI * D ** 3) / 6;
    const mA = 5.17 * (1 - fB) * V * 1e-21, mB = 19.32 * fB * V * 1e-21;
    const o = np({ struct: 'janus', mat: 'Fe3O4', jmat: 'Au', fB: 30, shape: 'sphere', D });
    near(res(o, 'Mass fraction of B'), (100 * mB) / (mA + mB), 1e-12, 'Janus mass fraction');
    near(res(o, 'Average density'), 0.7 * 5.17 + 0.3 * 19.32, 1e-12, 'Janus average density');
    near(res(o, 'Atoms in A'), (mA * NC.C.NA) / 231.533, 1e-12, 'Janus atoms in A');
    near(res(o, 'Atoms in B'), (mB * NC.C.NA) / 196.967, 1e-12, 'Janus atoms in B');
    near(res(o, 'Specific surface area'), (PI * D * D * 1e-18) / (mA + mB), 1e-12, 'Janus SSA');
  }

  /* ---- size distributions ---- */
  {
    const cv = 0.2, s2 = Math.log(1 + cv * cv), mu = -s2 / 2, s = Math.sqrt(s2);
    // independent numerical moments of the lognormal number distribution (trapezoid on a fine grid)
    const mom = (n) => { let acc = 0, h = 1e-4; for (let x = h; x < 6; x += h) acc += Math.pow(x, n) * Math.exp(-Math.pow(Math.log(x) - mu, 2) / (2 * s2)) / (x * s * Math.sqrt(2 * PI)) * h; return acc; };
    near(mom(1), 1, 1e-6, 'lognormal number-mean is 1');
    const k2 = mom(2), k3 = mom(3), k4 = mom(4);
    near(k3, Math.exp(3 * s2), 1e-6, 'lognormal ⟨k³⟩ = exp(3σ²)');
    const mono = np({ mat: 'Ag', shape: 'sphere', D: 20 });
    const o = np({ mat: 'Ag', shape: 'sphere', D: 20, dist: 'lognormal', cv: 20 });
    near(res(o, 'Area-weighted mean'), (20 * k3) / k2, 1e-6, 'D[3,2] lognormal');
    near(res(o, 'Volume-weighted mean'), (20 * k4) / k3, 1e-6, 'D[4,3] lognormal');
    near(res(o, 'Ensemble SSA'), (res(mono, 'Specific surface') * k2) / k3, 1e-6, 'ensemble SSA = S₁⟨k²⟩/⟨k³⟩');
    near(res(o, 'Mean atoms per particle'), res(mono, 'Atoms per particle') * k3, 1e-6, '⟨N⟩ = N₁⟨k³⟩');
    ok(res(o, 'Ensemble surface atoms') < res(mono, 'Surface atoms'), 'atom-weighted surface fraction is lower for a broad distribution');
    const on = np({ mat: 'Ag', shape: 'cube', a: 20, dist: 'normal', cv: 10 });
    near(res(on, 'Mean atoms per particle'), res(np({ mat: 'Ag', shape: 'cube', a: 20 }), 'Atoms per particle') * (1 + 3 * 0.01), 1e-12, 'normal ⟨k³⟩ = 1 + 3CV²');
    // porous ensemble: internal SSA does not depend on size
    const po = np({ struct: 'porous', mat: 'SiO2', shape: 'sphere', D: 100, vp: 1, dp: 4, pmode: 'vp', dist: 'lognormal', cv: 20 });
    near(res(po, 'Ensemble SSA'), 1000 + (res(po, 'External SSA') * k2) / k3, 1e-6, 'porous ensemble SSA keeps S_int');
    // concentration uses the ensemble-mean particle mass
    const oc = np({ mat: 'Ag', shape: 'sphere', D: 20, dist: 'lognormal', cv: 20, conc: 20 });
    near(res(oc, 'Particles per mL'), (20e-6 / (10.5 * ((PI * 8000) / 6) * 1e-21)) / k3, 1e-6, 'polydisperse particles per mL uses ⟨m⟩');
  }

  /* ---- every new configuration typesets in KaTeX and draws a schematic ---- */
  {
    const kctx = { console };
    kctx.window = kctx; kctx.self = kctx; kctx.globalThis = kctx;
    vm.createContext(kctx);
    vm.runInContext(fs.readFileSync(path.join(root, 'vendor', 'katex', '0.16.11', 'katex.min.js'), 'utf8'), kctx);
    const configs = [
      { shape: 'cube', a: 20, rc: 3 }, { shape: 'truncoct', a: 6, rc: 1 }, { shape: 'prism', a: 40, h: 8, rc: 2 },
      { shape: 'nanostar', D: 40, N: 12, sl: 20, sb: 10 },
      { struct: 'porous', mat: 'SiO2', shape: 'sphere', D: 100, pmode: 'vp', vp: 1, dp: 4 },
      { struct: 'porous', mat: 'SiO2', shape: 'cube', a: 100, pmode: 'phi', phi: 40, dp: 6, dist: 'lognormal', cv: 15 },
      { struct: 'janus', mat: 'Fe3O4', jmat: 'Au', fB: 30, shape: 'sphere', D: 20, dist: 'normal', cv: 10, conc: 5 },
      { struct: 'coreshell', shape: 'decahedron', a: 20, rc: 2, mat: 'Ag', smat: 'SiO2', ts: 5 },
      { struct: 'hollow', shape: 'cube', a: 50, rc: 6, w: 5, mat: 'Au' },
      { shape: 'icosahedron', a: 10, rc: 1, dist: 'lognormal', cv: 25 }
    ];
    let n = 0;
    configs.forEach((c) => {
      let out;
      try { out = np(c); } catch (e) { ok(false, 'config ' + JSON.stringify(c) + ' threw ' + e.message); return; }
      ok(out.figures[0].svg.indexOf('<svg') === 0, 'schematic for ' + (c.struct || 'solid') + '/' + c.shape);
      ok(out.results.every((r) => typeof r.value === 'string' || isFinite(r.value)), 'finite results for ' + JSON.stringify(c));
      out.steps.forEach((s) => [[s.formula, s.tex], [s.sub, s.subTex], [s.result, s.resultTex]].forEach(([plain, ex]) => {
        const tt = ex || NC.toTex(plain);
        if (!tt) return;
        n++;
        try { kctx.katex.renderToString(tt, { throwOnError: true, strict: 'ignore' }); }
        catch (e) { ok(false, 'KaTeX: ' + String(plain || ex).slice(0, 70) + ' → ' + e.message.slice(0, 80)); }
      }));
    });
    ok(n > 300, 'builder configurations typeset ' + n + ' formulas');
  }
};
