/* Layered particle designer (Plan 4, workstream C): multilayer Mie, coated sphere, geometry, ligands, route. */
'use strict';
module.exports = function (t) {
  const { NC, ok, near, run, res, throwsInput, vm, fs, path, root } = t;
  const D = NC.designer, O = NC.optics;
  const cx = O.cx;
  const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
  const worst = {};
  const track = (k, a, b) => { worst[k] = Math.max(worst[k] || 0, rel(a, b)); };
  const PI = Math.PI;

  /* ================================================================ */
  /* 1. Multilayer Mie (Yang 2003)                                     */
  /* ================================================================ */
  // 1a. One layer is the homogeneous sphere (bhmie) — dielectric, absorbing, metallic, large
  [[1.5, 0, 0.1], [1.5, 0, 1], [1.33, 0, 20], [1.5, 0.1, 2], [2, 1, 5], [0.2, 3.5, 3], [0.05, 2.2, 1.5], [0.3, 3, 20], [1.1, 0.001, 120]].forEach(([n, k, x]) => {
    const a = D.mieMulti([x], [cx(n, k)]), b = O.bhmie(x, cx(n, k));
    near(a.qext, b.qext, 1e-9, `Multilayer (1 layer) Q_ext = bhmie (m=${n}+${k}i, x=${x})`);
    near(a.qsca, b.qsca, 1e-9, `Multilayer (1 layer) Q_sca = bhmie (m=${n}+${k}i, x=${x})`);
    track('1 layer vs bhmie', a.qext, b.qext); track('1 layer vs bhmie', a.qsca, b.qsca);
  });
  // 1a′. One layer vs miepython (independent reference values in tests/validation/reference.json). At x = 50 the
  //      designer is closer to miepython (≈1e-15) than bhmie (≈2e-8), because its downward recurrence starts higher.
  JSON.parse(fs.readFileSync(path.join(root, 'tests', 'validation', 'reference.json'), 'utf8')).mie.forEach((c) => {
    const a = D.mieMulti([c.x], [cx(c.n, c.k)]);
    near(a.qext, c.qext, 1e-10, `Multilayer (1 layer) Q_ext vs miepython (m=${c.n}+${c.k}i, x=${c.x})`);
    near(a.qsca, c.qsca, 1e-10, `Multilayer (1 layer) Q_sca vs miepython (m=${c.n}+${c.k}i, x=${c.x})`);
    track('1 layer vs miepython', a.qext, c.qext); track('1 layer vs miepython', a.qsca, c.qsca);
  });

  // 1b. Core + one shell = Bohren–Huffman BHCOAT (independent upward-recurrence algorithm).
  // BHCOAT's upward recurrence of the shell's logarithmic derivative loses accuracy for thick,
  // strongly absorbing shells (Im(m₂)·y ≳ 5), so the cases stay inside its stable range.
  [
    [1.5, 0, 1.2, 0, 1, 2], [1.33, 0.01, 1.6, 0.05, 3, 5], [2.5, 0.5, 1.4, 0, 2, 4], // dielectric / weakly absorbing
    [0.2, 3.5, 1.45, 0, 1, 1.6], [0.2, 3.5, 1.5, 0, 2, 3], [0.05, 2.2, 1.1, 0, 0.3, 0.45], // metal core, dielectric shell
    [1.45, 0, 0.3, 3, 1, 1.2], [1.1, 0, 0.15, 3, 1.2, 1.4], [1.1, 0, 0.6, 1.8, 1.2, 1.4], // dielectric core, metal shell (nanoshell)
    [0.3, 3, 0.2, 3.5, 0.5, 0.8], [1.5, 0, 1.5, 0.3, 4, 6] // metal/metal, thick absorbing dielectric
  ].forEach(([n1, k1, n2, k2, x, y]) => {
    const a = D.mieMulti([x, y], [cx(n1, k1), cx(n2, k2)]), b = D.bhcoat(x, y, cx(n1, k1), cx(n2, k2));
    near(a.qext, b.qext, 1e-7, `Core–shell Q_ext = bhcoat (${n1}+${k1}i | ${n2}+${k2}i, x=${x}, y=${y})`);
    near(a.qsca, b.qsca, 1e-7, `Core–shell Q_sca = bhcoat (${n1}+${k1}i | ${n2}+${k2}i, x=${x}, y=${y})`);
    track('core–shell vs bhcoat', a.qext, b.qext); track('core–shell vs bhcoat', a.qsca, b.qsca);
  });

  // 1c. A shell with the medium's index (m = 1) is invisible: same cross-section as the bare core
  [[1.5, 0.1, 1, 1.8], [0.2, 3.5, 0.8, 2], [2, 1, 3, 4.5]].forEach(([n, k, x1, x2]) => {
    const a = D.mieMulti([x1, x2], [cx(n, k), cx(1, 0)]), b = O.bhmie(x1, cx(n, k));
    near(a.qext * x2 * x2, b.qext * x1 * x1, 1e-9, `Shell with the medium index = bare core, C_ext (x₁=${x1}, x₂=${x2})`);
    near(a.qsca * x2 * x2, b.qsca * x1 * x1, 1e-9, `Shell with the medium index = bare core, C_sca (x₁=${x1}, x₂=${x2})`);
    track('medium-index shell vs bare core', a.qext * x2 * x2, b.qext * x1 * x1);
  });

  // 1d. Core and shells of one material = homogeneous sphere of the total size (2 and 4 layers)
  [[1.5, 0, [1, 2]], [0.2, 3.5, [0.5, 1.5]], [0.3, 3, [2, 3, 5, 8]], [1.6, 0.02, [4, 7, 9, 15]]].forEach(([n, k, xs]) => {
    const a = D.mieMulti(xs, xs.map(() => cx(n, k))), b = O.bhmie(xs[xs.length - 1], cx(n, k));
    near(a.qext, b.qext, 1e-9, `${xs.length} layers of one material = homogeneous sphere, Q_ext (m=${n}+${k}i)`);
    near(a.qsca, b.qsca, 1e-9, `${xs.length} layers of one material = homogeneous sphere, Q_sca (m=${n}+${k}i)`);
    track('same material vs bhmie', a.qext, b.qext);
  });

  // 1e. Small-particle limit = quasi-static coated sphere (Bohren & Huffman eq. 5.36), ε_m = 1:
  //     α/(4πb³) = [(ε₂−1)(ε₁+2ε₂) + f(ε₁−ε₂)(1+2ε₂)] / [(ε₂+2)(ε₁+2ε₂) + f(2ε₂−2)(ε₁−ε₂)],  Q_abs = 4x·Im(α/4πb³)
  {
    const { cmul, cadd, csub, cdiv } = O;
    const qs = (e1, e2, fv) => {
      const num = cadd(cmul(csub(e2, cx(1)), cadd(e1, cmul(cx(2), e2))), cmul(cx(fv), cmul(csub(e1, e2), cadd(cx(1), cmul(cx(2), e2)))));
      const den = cadd(cmul(cadd(e2, cx(2)), cadd(e1, cmul(cx(2), e2))), cmul(cx(fv), cmul(csub(cmul(cx(2), e2), cx(2)), csub(e1, e2))));
      return cdiv(num, den);
    };
    [[cx(0.2, 3.5), cx(1.45, 0), 0.6], [cx(1.1, 0), cx(0.3, 3), 0.85], [cx(1.5, 0.2), cx(2, 0.5), 0.5]].forEach(([m1, m2, ratio]) => {
      const y = 0.005, x = ratio * y;
      const p = qs(cmul(m1, m1), cmul(m2, m2), ratio ** 3);
      const r = D.mieMulti([x, y], [m1, m2]);
      near(r.qabs, 4 * y * p.im, 1e-3, `Small coated sphere: Q_abs = quasi-static polarizability (core/outer ${ratio})`);
      near(r.qsca, (8 / 3) * y ** 4 * O.cabs2(p), 1e-3, `Small coated sphere: Q_sca = Rayleigh (core/outer ${ratio})`);
      track('quasi-static limit', r.qabs, 4 * y * p.im);
    });
  }

  // 1f. Three and four layers vs an independent transfer-matrix solution written here
  //     (Riccati–Bessel ψ, χ evaluated directly; boundary conditions m·U and U′ continuous for aₙ,
  //     U and m·U′ for bₙ). Shares no code with the Yang recursion.
  {
    const { cmul, cadd, csub, cdiv } = O;
    const csin = (z) => cx(Math.sin(z.re) * Math.cosh(z.im), Math.cos(z.re) * Math.sinh(z.im));
    const ccos = (z) => cx(Math.cos(z.re) * Math.cosh(z.im), -Math.sin(z.re) * Math.sinh(z.im));
    const rb = (z, N) => {
      const nmx = N + 40 + Math.ceil(Math.hypot(z.re, z.im));
      const Dn = []; let d = cx(0);
      for (let n = nmx; n >= 1; n--) { const nz = cdiv(cx(n), z); d = csub(nz, cdiv(cx(1), cadd(d, nz))); if (n - 1 <= N) Dn[n - 1] = d; }
      const psi = [csin(z)], chi = [ccos(z)], chim1 = cmul(csin(z), cx(-1));
      for (let n = 1; n <= N; n++) {
        psi[n] = cdiv(psi[n - 1], cadd(Dn[n], cdiv(cx(n), z)));
        chi[n] = csub(cmul(cdiv(cx(2 * n - 1), z), chi[n - 1]), n === 1 ? chim1 : chi[n - 2]);
      }
      const dpsi = [], dchi = [];
      for (let n = 1; n <= N; n++) { dpsi[n] = cmul(Dn[n], psi[n]); dchi[n] = csub(chi[n - 1], cmul(cdiv(cx(n), z), chi[n])); }
      return { psi, chi, dpsi, dchi };
    };
    const naive = (xs, ms) => {
      const L = xs.length, x = xs[L - 1], N = Math.max(1, Math.round(x + 4 * Math.cbrt(x) + 2));
      const mAll = ms.concat([cx(1)]);
      const fns = xs.map((xl, l) => [rb(cmul(mAll[l], cx(xl)), N), rb(cmul(mAll[l + 1], cx(xl)), N)]);
      let qext = 0, qsca = 0;
      for (let n = 1; n <= N; n++) {
        const co = ['a', 'b'].map((type) => {
          let A = cx(1), B = cx(0);
          for (let l = 0; l < L; l++) {
            const [fi, fo] = fns[l], r = cdiv(mAll[l], mAll[l + 1]);
            const U = cadd(cmul(A, fi.psi[n]), cmul(B, fi.chi[n])), dU = cadd(cmul(A, fi.dpsi[n]), cmul(B, fi.dchi[n]));
            const b1 = type === 'a' ? cmul(r, U) : U, b2 = type === 'a' ? dU : cmul(r, dU);
            const det = csub(cmul(fo.psi[n], fo.dchi[n]), cmul(fo.chi[n], fo.dpsi[n]));
            A = cdiv(csub(cmul(b1, fo.dchi[n]), cmul(fo.chi[n], b2)), det);
            B = cdiv(csub(cmul(fo.psi[n], b2), cmul(b1, fo.dpsi[n])), det);
          }
          return cdiv(B, cadd(cmul(cx(0, 1), A), B)); // outer field ψ − aξ, ξ = ψ − iχ
        });
        qext += (2 * n + 1) * (co[0].re + co[1].re);
        qsca += (2 * n + 1) * (O.cabs2(co[0]) + O.cabs2(co[1]));
      }
      return { qext: (2 * qext) / (x * x), qsca: (2 * qsca) / (x * x) };
    };
    [
      [[1, 1.6, 2.4], [cx(0.2, 3.5), cx(1.45, 0), cx(0.3, 3)]], // Ag@SiO2@Au-like
      [[1, 1.6, 2.4], [cx(2.5, 0.5), cx(1.1, 0), cx(1.7, 0.02)]],
      [[0.4, 1.5, 1.8], [cx(2.4, 0.3), cx(1.45, 0), cx(0.2, 3.2)]], // Fe3O4@SiO2@Au-like
      [[0.5, 1, 2, 3.5], [cx(1.5, 0), cx(0.3, 3), cx(1.33, 0.001), cx(2, 0.2)]],
      [[2, 3], [cx(1.45, 0), cx(0.3, 3)]] // thick metal shell where BHCOAT is not accurate
    ].forEach(([xs, ms]) => {
      const a = D.mieMulti(xs, ms), b = naive(xs, ms);
      near(a.qext, b.qext, 1e-8, `${xs.length} layers: Q_ext = transfer-matrix solution (x = ${xs.join(', ')})`);
      near(a.qsca, b.qsca, 1e-8, `${xs.length} layers: Q_sca = transfer-matrix solution (x = ${xs.join(', ')})`);
      track('multilayer vs transfer matrix', a.qext, b.qext); track('multilayer vs transfer matrix', a.qsca, b.qsca);
    });
  }

  // 1g. Energy conservation and stability
  [[[1, 2, 3], [cx(1.5, 0), cx(2.2, 0), cx(1.3, 0)]], [[5, 10, 30], [cx(1.6, 0), cx(1.2, 0), cx(1.45, 0)]]].forEach(([xs, ms]) => {
    const r = D.mieMulti(xs, ms);
    near(r.qext, r.qsca, 1e-9, `Non-absorbing multilayer: Q_ext = Q_sca (x = ${xs.join(', ')})`);
  });
  {
    // large, strongly absorbing layers: finite, Q_abs ≥ 0, and an opaque outer metal layer hides the inside
    const r = D.mieMulti([50, 60, 80], [cx(0.3, 3), cx(1.45, 0), cx(0.2, 3.5)]), h = O.bhmie(80, cx(0.2, 3.5));
    ok(isFinite(r.qext) && isFinite(r.qsca) && r.qabs >= 0, 'Large absorbing multilayer (x = 80) stays finite with Q_abs ≥ 0');
    near(r.qext, h.qext, 1e-9, 'Thick opaque metal outer layer: inner layers do not change Q_ext');
    const r2 = D.mieMulti([200, 300], [cx(1.5, 0.5), cx(0.2, 8)]);
    ok(isFinite(r2.qext) && r2.qabs >= 0, 'Very large absorbing core–shell (x = 300) stays finite');
  }

  // 1h. Speed: 3-layer particle over 301 wavelengths
  {
    const t0 = Date.now();
    for (let i = 0; i < 301; i++) D.mieMulti([1 + i * 0.002, 2.2, 2.8], [cx(0.3, 3), cx(1.45, 0), cx(0.2, 3.5)]);
    const ms = Date.now() - t0;
    ok(ms < 200, '3-layer spectrum (301 wavelengths) in ' + ms + ' ms');
    console.log('    3-layer multilayer Mie, 301 wavelengths: ' + ms + ' ms (Node)');
  }

  /* ================================================================ */
  /* 2. Geometry and composition                                       */
  /* ================================================================ */
  const base = () => ({ medium: { n: 1.333 }, batch: { volumeMl: 10, massConc: 50 }, lambda: { min: 300, max: 900, step: 5 }, ligand: null });
  const auSio2 = Object.assign(base(), { core: { material: 'Au', D: 20, optical: { model: 'drude', preset: 'Au' } }, shells: [{ material: 'SiO2', t: 10, optical: { model: 'sellmeier', preset: 'SiO2' } }] });
  const out = D.compute(auSio2);
  const g = out.geometry;
  const Vc = (4 / 3) * PI * 1000, Vs = (4 / 3) * PI * (8000 - 1000);
  const mc = 19.32 * Vc * 1e-21, ms = 2.2 * Vs * 1e-21;
  near(g.Dout, 40, 1e-12, 'Au 20 nm + 10 nm SiO₂: outer diameter 40 nm');
  near(g.layers[0].V, Vc, 1e-12, 'Core volume (4/3)π·10³');
  near(g.layers[1].V, Vs, 1e-12, 'Shell volume (4/3)π(20³ − 10³)');
  near(g.layers[0].mass, mc, 1e-12, 'Core mass ρV');
  near(g.layers[1].mass, ms, 1e-12, 'Shell mass ρV');
  near(g.layers[0].N, (mc * NC.C.NA) / 196.967, 1e-12, 'Au atoms in the core');
  near(g.rhoEff, (mc + ms) / ((Vc + Vs) * 1e-21), 1e-12, 'Effective density');
  near(g.ssa, (4 * PI * 400 * 1e-18) / (mc + ms), 1e-12, 'SSA = outer area / mass');
  near(g.layers[1].vf, 7 / 8, 1e-12, 'Shell volume fraction 7/8');
  near(res(out, 'Particles per mL'), (50e-6) / (mc + ms), 1e-12, 'Particles per mL from 50 µg/mL');
  // the same particle in the nanoparticle builder
  {
    const b = run('nanoparticle', { struct: 'coreshell', mat: 'Au', shape: 'sphere', D: 20, smat: 'SiO2', ts: 10, conc: '' });
    near(res(b, 'Particle mass'), g.mass, 1e-9, 'Designer particle mass = nanoparticle builder (Au@SiO₂)');
    near(res(b, 'Specific surface'), g.ssa, 1e-9, 'Designer SSA = nanoparticle builder');
    near(res(b, 'Effective density'), g.rhoEff, 1e-9, 'Designer effective density = nanoparticle builder');
    near(res(b, 'Atoms in shell'), g.layers[1].N, 1e-9, 'Designer shell formula units = nanoparticle builder');
    near(res(b, 'Atoms in core'), g.layers[0].N, 1e-9, 'Designer core atoms = nanoparticle builder');
  }
  // reverse batch: particle concentration → mass concentration
  {
    const o2 = D.compute(Object.assign(base(), auSio2, { batch: { volumeMl: 2, particleConc: 1e11 } }));
    near(res(o2, 'Mass concentration'), 1e11 * g.mass * 1e6, 1e-12, 'Mass concentration from particle concentration');
  }
  // three-layer radii and fractions add up
  {
    const o3 = D.compute(Object.assign(base(), { core: { material: 'Fe3O4', D: 10 }, shells: [{ material: 'SiO2', t: 30 }, { material: 'Au', t: 8 }] }));
    const L = o3.geometry.layers;
    near(L[2].rOut, 5 + 30 + 8, 1e-12, 'Three layers: outer radius');
    near(L.reduce((s, l) => s + l.vf, 0), 1, 1e-12, 'Volume fractions sum to 1');
    near(L.reduce((s, l) => s + l.wf, 0), 1, 1e-12, 'Mass fractions sum to 1');
    ok(o3.warnings.some((w) => /Fe₃O₄/.test(w) && /optical constants/.test(w)), 'Layer without optical constants: warning, no spectrum');
    ok(!o3.plots.length, 'No spectrum plotted without optical constants for every layer');
  }

  /* ================================================================ */
  /* 3. Optics in compute()                                            */
  /* ================================================================ */
  {
    ok(out.plots.length === 2 && out.plots[0].series.length === 3, 'Spectrum plots: efficiencies and molar extinction');
    // ε_M = N_A·C_ext/(1000 ln 10) with C_ext in cm²
    near(res(out, 'Molar extinction'), (NC.C.NA * res(out, 'C_ext at peak') * 1e-14) / (1000 * Math.LN10), 1e-12, 'Molar extinction coefficient from C_ext');
    // a design with a single layer reproduces the Mie calculator spectrum (same Drude model)
    const ag = NC.optics.presets[0].values;
    const single = D.compute(Object.assign(base(), { core: { material: 'Ag', D: 40, optical: { model: 'drude', preset: 'Ag', damp: true, A: 1 } }, shells: [], lambda: { min: 300, max: 800, step: 2 } }));
    const mie = run('mie', Object.assign({ D: 40, nmed: 1.333, damp: 'on', A: 1, lmin: 300, lmax: 800, lstep: 2 }, ag));
    near(res(single, 'Extinction peak'), res(mie, 'Plasmon peak'), 1e-9, 'Single-layer design = Mie calculator: peak');
    near(res(single, 'Molar extinction'), res(mie, 'Molar extinction'), 1e-9, 'Single-layer design = Mie calculator: ε_M');
    near(res(single, 'FWHM'), res(mie, 'FWHM'), 1e-9, 'Single-layer design = Mie calculator: FWHM');
    // a silica shell red-shifts the Au plasmon (higher local index)
    const bare = D.compute(Object.assign(base(), { core: auSio2.core, shells: [] }));
    ok(res(out, 'Extinction peak') > res(bare, 'Extinction peak'), 'Silica shell red-shifts the plasmon peak');
    // Malitson fused-silica index at 589.3 nm (sodium D) ≈ 1.4584
    near(D.nSilica(589.3), 1.4584, 2e-4, 'Malitson Sellmeier: n(589.3 nm) of fused silica');
    // constant-n shell equal to the medium = bare core
    const ghost = D.compute(Object.assign(base(), { core: auSio2.core, shells: [{ material: 'SiO2', t: 10, optical: { model: 'n', n: 1.333, k: 0 } }] }));
    near(res(ghost, 'C_ext at peak'), res(bare, 'C_ext at peak'), 1e-9, 'Shell with the medium index: same C_ext as the bare core');
    // pasted n, k table equal to a constant
    const tab = D.compute(Object.assign(base(), { core: { material: 'SiO2', D: 200, optical: { model: 'nk', table: '300, 1.46, 0\n900, 1.46, 0' } }, shells: [] }));
    const cst = D.compute(Object.assign(base(), { core: { material: 'SiO2', D: 200, optical: { model: 'n', n: 1.46, k: 0 } }, shells: [] }));
    near(res(tab, 'C_ext at peak'), res(cst, 'C_ext at peak'), 1e-12, 'n, k table model = constant n');
  }

  /* ================================================================ */
  /* 4. Ligands                                                        */
  /* ================================================================ */
  {
    // alkanethiol on 20 nm Au: 4π·10² nm² × (1/0.214) ≈ 5872
    const o = D.compute(Object.assign(base(), { core: { material: 'Au', D: 20, optical: { model: 'none' } }, shells: [], ligand: { key: 'alkanethiol', mode: 'footprint', value: 0.214, nC: 12, excess: 1 } }));
    near(res(o, 'Ligands per particle'), (4 * PI * 100) / 0.214, 1e-12, 'Alkanethiol SAM on 20 nm Au: ligands per particle');
    near(res(o, 'Ligands per particle'), 5872, 1e-3, 'Alkanethiol SAM on 20 nm Au ≈ 5870');
    ok(o.refs.indexOf('love2005') >= 0, 'Alkanethiol SAM density cites Love et al. 2005');
    near(D.formulaMass('C12H26S'), 202.40, 2e-5, 'Dodecanethiol molar mass');
    near(o.ligand.Mw, 202.40, 2e-5, 'Chain length 12 gives dodecanethiol');
    near(o.ligand.massPer, (o.ligand.N * o.ligand.Mw) / NC.C.NA, 1e-12, 'Ligand mass per particle');
    const Np = (50e-6 / o.geometry.mass) * 10;
    near(o.ligand.molBound, (Np * o.ligand.N) / NC.C.NA, 1e-12, 'Ligand moles bound in the batch');
    // default alkanethiol density without a value
    const o0 = D.compute(Object.assign(base(), { core: { material: 'Au', D: 20, optical: { model: 'none' } }, shells: [], ligand: { key: 'alkanethiol', mode: 'density', value: null } }));
    near(o0.ligand.sigma, 1 / 0.214, 1e-12, 'Alkanethiol default: 4.67 molecules/nm² (21.4 Å²)');
    // PEG: brush vs mushroom with Flory radius and Alexander–de Gennes height
    const peg = (sigma) => D.compute(Object.assign(base(), { core: { material: 'Au', D: 20, optical: { model: 'none' } }, shells: [], ligand: { key: 'PEG-thiol', mode: 'density', value: sigma, Mw: 5000, a: 0.35, excess: 10 } })).ligand;
    const N = 5000 / D.formulaMass('C2H4O'), RF = 0.35 * Math.pow(N, 0.6);
    const pb = peg(1), pm = peg(0.01);
    ok(pb.regime === 'brush' && pm.regime === 'mushroom', 'PEG 5 kDa: brush at 1 chain/nm², mushroom at 0.01 chain/nm²');
    near(pb.thickness, N * Math.pow(0.35, 5 / 3) * 1, 1e-12, 'Brush height N·a^(5/3)·σ^(1/3)');
    near(pm.thickness, RF, 1e-12, 'Mushroom thickness = Flory radius a·N^(3/5)');
    near(peg(1 / (RF * RF)).thickness, RF, 1e-9, 'Brush height equals R_F at the crossover D = R_F');
    near(pb.molAdd, 10 * pb.molBound, 1e-12, 'Excess factor multiplies the moles to add');
    const oh = D.compute(Object.assign(base(), { core: { material: 'Au', D: 20, optical: { model: 'none' } }, shells: [], ligand: { key: 'PEG-thiol', mode: 'density', value: 1, Mw: 5000, a: 0.35 } }));
    near(res(oh, 'Hydrodynamic'), 20 + 2 * pb.thickness, 1e-12, 'Hydrodynamic diameter estimate = D + 2L');
    // ligands without a cited density ask for a value instead of guessing
    const ol = D.compute(Object.assign(base(), { core: { material: 'CdSe', D: 4 }, shells: [{ material: 'ZnS', t: 1 }], ligand: { key: 'oleylamine', mode: 'density', value: null } }));
    ok(ol.warnings.some((w) => /Oleylamine/.test(w) && /grafting density/.test(w)), 'Oleylamine without a value: asks for a grafting density');
    ok(res(ol, 'Ligands per particle') === undefined, 'No ligand count without a grafting density');
    // formula masses
    [['C19H42BrN', 364.45], ['C18H37N', 267.49], ['C18H34O2', 282.47], ['C11H22O2S', 218.36], ['C6H5O7', 189.10], ['Si(OC2H5)4', 208.33], ['HAuCl4·3H2O', 393.83], ['AgNO3', 169.87], ['C24H51OP', 386.64], ['C14H31O3P', 278.37]].forEach(([fm, M]) => near(D.formulaMass(fm), M, 1e-4, 'Formula mass ' + fm));
  }

  /* ================================================================ */
  /* 5. Route and mass balance                                         */
  /* ================================================================ */
  {
    const o = D.compute(Object.assign(base(), { core: { material: 'Au', D: 20, optical: { model: 'none' } }, shells: [{ material: 'SiO2', t: 10 }, { material: 'Au', t: 5 }], ligand: { key: 'PEG-thiol', mode: 'density', value: 1, Mw: 5000, a: 0.35 } }));
    ok(o.route.map((r) => r.role).join(',') === 'core,shell,shell,ligand,purification', 'Route order: core → shells in order → ligand → purification');
    ok(o.route.map((r) => r.step).join(',') === '1,2,3,4,5', 'Route steps numbered');
    const L = o.geometry.layers, Np = (50e-6 / o.geometry.mass) * 10;
    near(o.route[1].mol, (Np * L[1].V * 1e-21 * 2.2) / 60.084, 1e-12, 'SiO₂ shell: n = N·V_shell·ρ/M');
    near(o.route[1].precursors[0].mol, o.route[1].mol, 1e-12, 'TEOS : SiO₂ = 1 : 1');
    near(o.route[1].precursors[0].mass, o.route[1].mol * D.formulaMass('Si(OC2H5)4'), 1e-12, 'TEOS mass = n·M(TEOS)');
    near(o.route[2].precursors[0].mol, (Np * L[2].V * 1e-21 * 19.32) / 196.967, 1e-12, 'Au shell: HAuCl₄ : Au = 1 : 1');
    if (typeof NC.protocolsFor !== 'function') ok(o.route.every((r) => /no protocol in the library yet/.test(r.note)), 'Without a protocol library every step says so');
    else {
      ok(o.route.every((r) => Array.isArray(r.protocols) && r.protocols.every((p) => p.id && p.title)), 'Route protocols have id and title');
      const want = NC.protocolsFor('shell', 'SiO2', 'Au').map((p) => p.id).join(',');
      ok(o.route[1].protocols.map((p) => p.id).join(',') === want, 'SiO₂ shell on Au: route lists the protocols for SiO₂ on Au (' + want + ')');
      ok(o.route.every((r) => r.protocols.length > 0 || /no protocol in the library yet/.test(r.note)), 'Steps without a protocol say so');
      ok(o.route[0].protocols.every((p) => !(NC.protocolById && NC.protocolById[p.id] && NC.protocolById[p.id].makes.every((m) => m.role === 'core' && m.shape && m.shape !== 'sphere'))), 'Sphere core: no protocols that only make other shapes (rods)');
    }
    const fe = D.compute(Object.assign(base(), { core: { material: 'Fe3O4', D: 10 }, shells: [] }));
    near(fe.route[0].precursors[0].mol, 3 * fe.route[0].mol, 1e-12, 'Fe(acac)₃ : Fe₃O₄ = 3 : 1');
    const nob = D.compute(Object.assign(base(), auSio2, { batch: { volumeMl: 10 } }));
    ok(nob.warnings.some((w) => /batch/.test(w)) && nob.route[0].mol === null, 'Without a batch concentration: no amounts, a warning');
  }

  /* ================================================================ */
  /* 6. Input validation                                               */
  /* ================================================================ */
  const bad = (over, msg) => throwsInput(() => D.compute(Object.assign(base(), auSio2, over)), msg);
  bad({ core: { material: 'Au', D: 0 } }, 'Core diameter 0');
  bad({ core: { material: 'Au', D: -5 } }, 'Negative core diameter');
  bad({ core: { material: 'unobtainium', D: 10 } }, 'Unknown material');
  bad({ core: { material: 'custom', D: 10 } }, 'Custom material without density');
  bad({ shells: [{ material: 'SiO2', t: 0 }] }, 'Zero shell thickness');
  bad({ medium: { n: 0 } }, 'Medium index 0');
  bad({ lambda: { min: 600, max: 400, step: 2 } }, 'Wavelength range reversed');
  bad({ lambda: { min: 300, max: 900, step: 0.1 } }, 'Too many wavelengths');
  bad({ batch: { volumeMl: 0, massConc: 10 } }, 'Batch volume 0');
  bad({ batch: { volumeMl: 10, massConc: -1 } }, 'Negative concentration');
  bad({ core: { material: 'Au', D: 20, optical: { model: 'n', n: 1.5, k: -0.1 } } }, 'Negative k');
  bad({ core: { material: 'Au', D: 20, optical: { model: 'nk', table: '500, 1.5, 0' } } }, 'n, k table with one row');
  bad({ ligand: { key: 'PEG-thiol', mode: 'density', value: 1, Mw: 5000 } }, 'PEG without monomer size');
  bad({ ligand: { key: 'nonsense', mode: 'density', value: 1 } }, 'Unknown ligand');
  ok(D.compute(Object.assign(base(), { core: { material: 'custom', label: 'my oxide', D: 12, rho: 4, M: 100 }, shells: [] })).geometry.mass > 0, 'Custom material with ρ and M works');

  /* ================================================================ */
  /* 7. Output integrity: presets, refs, steps, figure, KaTeX          */
  /* ================================================================ */
  let kctx = null;
  try {
    const kdir = path.join(root, 'vendor', 'katex', '0.16.11');
    kctx = { console }; kctx.window = kctx; kctx.self = kctx; kctx.globalThis = kctx;
    vm.createContext(kctx);
    vm.runInContext(fs.readFileSync(path.join(kdir, 'katex.min.js'), 'utf8'), kctx);
  } catch (e) { kctx = null; }
  let typeset = 0;
  D.presets().forEach((p) => {
    let o;
    try { o = D.compute(p.design); } catch (e) { ok(false, 'Preset ' + p.id + ' threw ' + e.message); return; }
    ok(o.results.length > 3 && o.steps.length > 5, 'Preset ' + p.id + ' gives results and steps');
    o.refs.forEach((r) => ok(NC.refs[r], p.id + ': missing ref ' + r));
    o.steps.forEach((s) => [].concat(s.ref || []).forEach((r) => ok(NC.refs[r] && o.refs.indexOf(r) >= 0, p.id + ': step cites ' + r + ' (must exist and be listed)')));
    o.results.forEach((r) => ok(typeof r.value === 'string' || isFinite(r.value), p.id + ': result ' + r.label + ' is a number'));
    o.plots.forEach((pl) => ok(NC.plot(pl).startsWith('<svg'), p.id + ': plot renders'));
    ok(/^<svg[^>]*role="img"[^>]*aria-label="Cross-section to scale/.test(o.figures[0].svg), p.id + ': cross-section SVG with role and label');
    ok(JSON.stringify(p.design) === JSON.stringify(JSON.parse(JSON.stringify(p.design))), p.id + ': design is plain JSON');
    if (kctx) o.steps.forEach((s) => [[s.formula, s.tex], [s.sub, s.subTex], [s.result, s.resultTex]].forEach(([plain, tex]) => {
      const tx = tex || NC.toTex(plain);
      if (!tx) return;
      typeset++;
      try { kctx.katex.renderToString(tx, { throwOnError: true, strict: 'ignore' }); }
      catch (e) { ok(false, p.id + ': KaTeX cannot typeset "' + String(plain || tex).slice(0, 80) + '" → ' + e.message.slice(0, 100)); }
    }));
  });
  if (kctx) ok(typeset > 40, 'Designer formulas typeset in KaTeX (' + typeset + ')');
  ok(D.defaults().core && Array.isArray(D.defaults().shells), 'defaults() returns a design');

  console.log('    worst relative deviation: ' + Object.entries(worst).map(([k, v]) => k + ' ' + v.toExponential(1)).join(', '));
};
