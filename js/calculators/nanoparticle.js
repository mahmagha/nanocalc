/*
 * Nanoparticle builder: choose material + shape + dimensions, get geometry,
 * mass, atom count, surface atoms, specific surface area and concentrations.
 */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt, C = NC.C;
  const S3 = Math.sqrt(3), S2 = Math.sqrt(2), S6 = Math.sqrt(6), S5 = Math.sqrt(5);

  /*
   * Each shape: dims it needs, volume/area functions (nm), formula text, a
   * substitution builder, and `shrink(d, t)` returning the same shape with
   * every face moved inward by t (exact for these convex shapes; polyhedra
   * here are tangential, so the inner solid is the same shape scaled by
   * (1 − t/r_in)).
   */
  const SHAPES = {
    sphere: {
      label: 'Sphere', dims: ['D'],
      V: function (d) { return (Math.PI * Math.pow(d.D, 3)) / 6; },
      A: function (d) { return Math.PI * d.D * d.D; },
      Vf: 'V = πD³/6', Af: 'A = πD²', Vt: '\\dfrac{\\pi D^3}{6}', At: '\\pi D^2',
      sub: function (d) { return ['V = π × ' + f(d.D) + '³ / 6', 'A = π × ' + f(d.D) + '²']; },
      shrinkF: "D' = D − 2t",
      shrink: function (d, t) { return { D: d.D - 2 * t }; },
      size: function (d) { return d.D; }, sizeLabel: 'D'
    },
    cube: {
      label: 'Cube', dims: ['a'],
      V: function (d) { return Math.pow(d.a, 3); },
      A: function (d) { return 6 * d.a * d.a; },
      Vf: 'V = a³', Af: 'A = 6a²', Vt: 'a^3', At: '6a^2',
      sub: function (d) { return ['V = ' + f(d.a) + '³', 'A = 6 × ' + f(d.a) + '²']; },
      shrinkF: "a' = a − 2t   (inradius r_in = a/2)",
      shrink: function (d, t) { return { a: d.a - 2 * t }; },
      size: function (d) { return d.a; }, sizeLabel: 'a'
    },
    octahedron: {
      label: 'Octahedron', dims: ['a'],
      V: function (d) { return (S2 / 3) * Math.pow(d.a, 3); },
      A: function (d) { return 2 * S3 * d.a * d.a; },
      Vf: 'V = (√2/3)·a³', Af: 'A = 2√3·a²', Vt: '\\dfrac{\\sqrt{2}}{3}\\,a^3', At: '2\\sqrt{3}\\,a^2',
      sub: function (d) { return ['V = 0.4714 × ' + f(d.a) + '³', 'A = 3.4641 × ' + f(d.a) + '²']; },
      shrinkF: "a' = a − √6·t   (inradius r_in = a/√6)",
      shrink: function (d, t) { return { a: d.a - S6 * t }; },
      size: function (d) { return d.a; }, sizeLabel: 'a'
    },
    tetrahedron: {
      label: 'Tetrahedron', dims: ['a'],
      V: function (d) { return Math.pow(d.a, 3) / (6 * S2); },
      A: function (d) { return S3 * d.a * d.a; },
      Vf: 'V = a³/(6√2)', Af: 'A = √3·a²', Vt: '\\dfrac{a^3}{6\\sqrt{2}}', At: '\\sqrt{3}\\,a^2',
      sub: function (d) { return ['V = ' + f(d.a) + '³ / 8.4853', 'A = 1.7321 × ' + f(d.a) + '²']; },
      shrinkF: "a' = a − 2√6·t   (inradius r_in = a/(2√6))",
      shrink: function (d, t) { return { a: d.a - 2 * S6 * t }; },
      size: function (d) { return d.a; }, sizeLabel: 'a'
    },
    icosahedron: {
      label: 'Icosahedron', dims: ['a'],
      V: function (d) { return ((5 * (3 + S5)) / 12) * Math.pow(d.a, 3); },
      A: function (d) { return 5 * S3 * d.a * d.a; },
      Vf: 'V = 5(3 + √5)/12 · a³', Af: 'A = 5√3·a²', Vt: '\\dfrac{5(3+\\sqrt{5})}{12}\\,a^3', At: '5\\sqrt{3}\\,a^2',
      sub: function (d) { return ['V = 2.1817 × ' + f(d.a) + '³', 'A = 8.6603 × ' + f(d.a) + '²']; },
      shrinkF: "a' = a·(1 − t/r_in),   r_in = √3(3 + √5)/12 · a",
      shrink: function (d, t) { const rin = (S3 * (3 + S5) / 12) * d.a; return { a: d.a * (1 - t / rin) }; },
      size: function (d) { return d.a; }, sizeLabel: 'a'
    },
    rod: {
      label: 'Rod (cylinder with hemispherical caps)', dims: ['D', 'L'],
      V: function (d) { return (Math.PI * d.D * d.D * (d.L - d.D)) / 4 + (Math.PI * Math.pow(d.D, 3)) / 6; },
      A: function (d) { return Math.PI * d.D * (d.L - d.D) + Math.PI * d.D * d.D; },
      Vf: 'V = πD²(L − D)/4 + πD³/6', Af: 'A = πD(L − D) + πD²', Vt: '\\dfrac{\\pi D^2 (L-D)}{4} + \\dfrac{\\pi D^3}{6}', At: '\\pi D (L-D) + \\pi D^2',
      sub: function (d) { return ['V = π × ' + f(d.D) + '² × (' + f(d.L) + ' − ' + f(d.D) + ')/4 + π × ' + f(d.D) + '³/6', 'A = π × ' + f(d.D) + ' × (' + f(d.L) + ' − ' + f(d.D) + ') + π × ' + f(d.D) + '²']; },
      shrinkF: "D' = D − 2t,  L' = L − 2t",
      shrink: function (d, t) { return { D: d.D - 2 * t, L: d.L - 2 * t }; },
      size: function (d) { return d.D; }, sizeLabel: 'D'
    },
    cylinder: {
      label: 'Cylinder / nanowire / disc', dims: ['D', 'L'],
      V: function (d) { return (Math.PI * d.D * d.D * d.L) / 4; },
      A: function (d) { return (Math.PI * d.D * d.D) / 2 + Math.PI * d.D * d.L; },
      Vf: 'V = πD²L/4', Af: 'A = πD²/2 + πDL', Vt: '\\dfrac{\\pi D^2 L}{4}', At: '\\dfrac{\\pi D^2}{2} + \\pi D L',
      sub: function (d) { return ['V = π × ' + f(d.D) + '² × ' + f(d.L) + ' / 4', 'A = π × ' + f(d.D) + '²/2 + π × ' + f(d.D) + ' × ' + f(d.L)]; },
      shrinkF: "D' = D − 2t,  L' = L − 2t",
      shrink: function (d, t) { return { D: d.D - 2 * t, L: d.L - 2 * t }; },
      size: function (d) { return d.D; }, sizeLabel: 'D'
    },
    prism: {
      label: 'Triangular nanoplate (prism)', dims: ['a', 'h'],
      V: function (d) { return (S3 / 4) * d.a * d.a * d.h; },
      A: function (d) { return (S3 / 2) * d.a * d.a + 3 * d.a * d.h; },
      Vf: 'V = (√3/4)·a²·h', Af: 'A = (√3/2)·a² + 3a·h', Vt: '\\dfrac{\\sqrt{3}}{4}\\,a^2 h', At: '\\dfrac{\\sqrt{3}}{2}\\,a^2 + 3ah',
      sub: function (d) { return ['V = 0.4330 × ' + f(d.a) + '² × ' + f(d.h), 'A = 0.8660 × ' + f(d.a) + '² + 3 × ' + f(d.a) + ' × ' + f(d.h)]; },
      shrinkF: "a' = a − 2√3·t   (triangle inradius a/(2√3)),  h' = h − 2t",
      shrink: function (d, t) { return { a: d.a - 2 * S3 * t, h: d.h - 2 * t }; },
      size: function (d) { return d.a; }, sizeLabel: 'a'
    }
  };
  NC.shapes = SHAPES;

  /* ---------- schematic drawings ---------- */
  function sketch(shape, d) {
    const lbl = function (x, y, t, anchor) { return '<text class="dim" x="' + x + '" y="' + y + '" text-anchor="' + (anchor || 'middle') + '">' + NC.esc(t) + '</text>'; };
    const arrow = function (x1, y1, x2, y2) { return '<line class="dimline" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" marker-start="url(#ar)" marker-end="url(#ar)"/>'; };
    const nm = function (v) { return f(v, 3) + ' nm'; };
    let g = '';
    switch (shape) {
      case 'sphere':
        g = '<circle class="body" cx="120" cy="90" r="62"/><ellipse class="edge" cx="120" cy="90" rx="62" ry="16"/>' + arrow(58, 168, 182, 168) + lbl(120, 186, 'D = ' + nm(d.D));
        break;
      case 'cube':
        g = '<path class="body" d="M70 70 L150 70 L150 150 L70 150 Z"/><path class="body2" d="M70 70 L100 40 L180 40 L150 70 Z"/><path class="body3" d="M150 70 L180 40 L180 120 L150 150 Z"/>' + arrow(70, 166, 150, 166) + lbl(110, 184, 'a = ' + nm(d.a));
        break;
      case 'octahedron':
        g = '<path class="body" d="M120 20 L60 95 L120 160 Z"/><path class="body3" d="M120 20 L180 95 L120 160 Z"/><path class="edge" d="M60 95 L140 110 L180 95 M140 110 L120 20 M140 110 L120 160"/>' + arrow(60, 175, 140, 175) + lbl(100, 192, 'edge a = ' + nm(d.a));
        break;
      case 'tetrahedron':
        g = '<path class="body" d="M120 20 L50 150 L140 165 Z"/><path class="body3" d="M120 20 L140 165 L195 135 Z"/>' + arrow(50, 178, 140, 190) + lbl(150, 196, 'edge a = ' + nm(d.a), 'start');
        break;
      case 'icosahedron': {
        const pts = [];
        for (let i = 0; i < 6; i++) pts.push((120 + 70 * Math.cos(Math.PI / 6 + (i * Math.PI) / 3)).toFixed(1) + ' ' + (92 + 70 * Math.sin(Math.PI / 6 + (i * Math.PI) / 3)).toFixed(1));
        const inner = [];
        for (let i = 0; i < 3; i++) inner.push((120 + 40 * Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / 3)).toFixed(1) + ' ' + (92 + 40 * Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / 3)).toFixed(1));
        g = '<path class="body" d="M' + pts.join(' L') + ' Z"/><path class="edge" d="M' + inner.join(' L') + ' Z"/>' +
          inner.map(function (p, i) { return '<path class="edge" d="M' + p + ' L' + pts[(i * 2 + 4) % 6] + ' M' + p + ' L' + pts[(i * 2 + 5) % 6] + '"/>'; }).join('') + lbl(120, 186, 'edge a = ' + nm(d.a));
        break;
      }
      case 'rod': {
        const r = Math.min(30, (180 * d.D) / d.L / 2 + 8);
        g = '<path class="body" d="M' + (40 + r) + ' ' + (90 - r) + ' L' + (200 - r) + ' ' + (90 - r) + ' A' + r + ' ' + r + ' 0 0 1 ' + (200 - r) + ' ' + (90 + r) + ' L' + (40 + r) + ' ' + (90 + r) + ' A' + r + ' ' + r + ' 0 0 1 ' + (40 + r) + ' ' + (90 - r) + ' Z"/>' +
          arrow(40, 90 + r + 16, 200, 90 + r + 16) + lbl(120, 90 + r + 34, 'L = ' + nm(d.L)) + arrow(214, 90 - r, 214, 90 + r) + lbl(222, 94, 'D', 'start') + lbl(120, 20, 'D = ' + nm(d.D) + ',  AR = ' + f(d.L / d.D, 3));
        break;
      }
      case 'cylinder': {
        const flat = d.L < d.D;
        const w = flat ? 150 : Math.min(150, 40 + 110 * Math.min(1, d.D / d.L * 3)), h = flat ? Math.max(14, 150 * d.L / d.D) : 130;
        const x0 = 120 - w / 2, y0 = 95 - h / 2;
        g = '<path class="body" d="M' + x0 + ' ' + y0 + ' L' + x0 + ' ' + (y0 + h) + ' A' + w / 2 + ' 12 0 0 0 ' + (x0 + w) + ' ' + (y0 + h) + ' L' + (x0 + w) + ' ' + y0 + ' Z"/><ellipse class="body2" cx="120" cy="' + y0 + '" rx="' + w / 2 + '" ry="12"/>' +
          arrow(x0, y0 + h + 24, x0 + w, y0 + h + 24) + lbl(120, y0 + h + 40, 'D = ' + nm(d.D)) + arrow(x0 + w + 12, y0, x0 + w + 12, y0 + h) + lbl(x0 + w + 18, 95, 'L = ' + nm(d.L), 'start');
        break;
      }
      case 'prism': {
        const th = Math.max(8, Math.min(30, (120 * d.h) / d.a));
        g = '<path class="body3" d="M40 140 L200 140 L200 ' + (140 + th) + ' L40 ' + (140 + th) + ' Z"/><path class="body" d="M40 140 L120 30 L200 140 Z"/>' +
          lbl(120, 128, 'a = ' + nm(d.a)) + lbl(120, 140 + th + 18, 'thickness h = ' + nm(d.h));
        break;
      }
    }
    return '<svg class="shape-sketch" viewBox="0 0 260 205" role="img" aria-label="' + SHAPES[shape].label + ' schematic">' +
      '<defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="arrowhead"/></marker></defs>' + g + '</svg>';
  }

  const shapeOptions = Object.keys(SHAPES).map(function (k) { return [k, SHAPES[k].label]; });
  const materialOptions = Object.keys(NC.materials).map(function (k) { return [k, NC.materials[k].label]; }).concat([['custom', 'Custom material…']]);
  const needs = function (dim) { return function (v) { return SHAPES[v.shape] && SHAPES[v.shape].dims.indexOf(dim) >= 0; }; };

  NC.register({
    id: 'nanoparticle',
    category: 'size',
    title: 'Nanoparticle builder (material, shape & size)',
    short: 'Pick e.g. Ag, a shape and its size: geometry, atoms, surface atoms, surface area, concentration',
    description:
      'Choose a material (for example silver for AgNPs), a particle shape and its dimensions. NanoCalc then works out the volume, surface area, equivalent spherical diameter, sphericity, mass, number of atoms, fraction of surface atoms and specific surface area. If you enter a mass concentration it also gives the particle number and molar concentration.',
    refs: ['xia2009', 'coxeter1973', 'wadell1935', 'roduner2006', 'lowell2004', 'kittel2005', 'crc', 'codata2018'],
    inputs: [
      NC.sel('mat', 'Material', materialOptions, 'Ag'),
      NC.num('rho', 'Density ρ', 'g/cm³', 10.5, { showIf: function (v) { return v.mat === 'custom'; } }),
      NC.num('M', 'Molar mass M (per atom / formula unit)', 'g/mol', 107.868, { showIf: function (v) { return v.mat === 'custom'; } }),
      NC.sel('shape', 'Shape', shapeOptions, 'sphere'),
      NC.num('D', 'Diameter D', 'nm', 20, { showIf: needs('D') }),
      NC.num('a', 'Edge length a', 'nm', 20, { showIf: needs('a') }),
      NC.num('L', 'Total length L', 'nm', 60, { showIf: needs('L') }),
      NC.num('h', 'Plate thickness h', 'nm', 8, { showIf: needs('h') }),
      NC.num('conc', 'Mass concentration (optional)', 'µg/mL', NaN, { help: 'Leave blank to skip. Gives the particle number and molar concentration of a dispersion.' })
    ],
    example: { mat: 'Ag', shape: 'sphere', D: 20, conc: 20 },
    compute: function (v) {
      const s = new NC.Steps();
      const shape = SHAPES[v.shape];
      if (!shape) NC.fail('Choose a shape.');
      let rho, M, matLabel;
      if (v.mat === 'custom') {
        rho = NC.need(v.rho, 'Density', { positive: true });
        M = NC.need(v.M, 'Molar mass', { positive: true });
        matLabel = 'custom material';
      } else {
        const m = NC.materials[v.mat];
        if (!m) NC.fail('Choose a material.');
        rho = m.rho; M = m.M; matLabel = m.label;
      }
      const d = {};
      const names = { D: 'Diameter', a: 'Edge length', L: 'Length', h: 'Thickness' };
      shape.dims.forEach(function (k) { d[k] = NC.need(v[k], names[k], { positive: true }); });
      if (v.shape === 'rod' && d.L < d.D) NC.fail('For a rod the total length L must be at least the diameter D (L = D is a sphere).');

      s.heading('1 · Material and shape');
      s.add({
        title: 'Bulk properties of ' + matLabel,
        formula: 'ρ (density),  M (molar mass per atom or formula unit)',
        result: 'ρ = ' + f(rho) + ' g/cm³;   M = ' + f(M) + ' g/mol',
        note: 'Bulk values are assumed. Lattice contraction and surface ligands are neglected.',
        ref: v.mat === 'custom' ? undefined : 'crc'
      });
      s.add({
        title: 'Shape: ' + shape.label,
        formula: 'Dimensions: ' + shape.dims.map(function (k) { return k + ' = ' + f(d[k]) + ' nm'; }).join(',  ') + (v.shape === 'rod' || v.shape === 'cylinder' ? ',  aspect ratio L/D = ' + f(d.L / d.D, 3) : '') + (v.shape === 'prism' ? ',  aspect ratio a/h = ' + f(d.a / d.h, 3) : ''),
        note: 'Shape-controlled syntheses commonly give spheres, cubes, octahedra, icosahedra and decahedra, rods, wires and triangular plates (e.g. for Ag and Au).',
        ref: 'xia2009'
      });

      s.heading('2 · Geometry');
      const V = shape.V(d), A = shape.A(d);
      const subs = shape.sub(d);
      s.add({ title: 'Volume', formula: shape.Vf, tex: 'V = ' + shape.Vt, sub: subs[0], result: 'V = ' + f(V) + ' nm³', ref: v.shape === 'sphere' || v.shape === 'rod' || v.shape === 'cylinder' || v.shape === 'prism' ? undefined : 'coxeter1973' });
      s.add({ title: 'Surface area', formula: shape.Af, tex: 'A = ' + shape.At, sub: subs[1], result: 'A = ' + f(A) + ' nm²', ref: v.shape === 'sphere' || v.shape === 'rod' || v.shape === 'cylinder' || v.shape === 'prism' ? undefined : 'coxeter1973' });
      const AV = A / V;
      s.add({ title: 'Surface-to-volume ratio', formula: 'A/V', sub: 'A/V = ' + f(A) + ' / ' + f(V), result: 'A/V = ' + f(AV) + ' nm⁻¹' });
      const Dv = Math.cbrt((6 * V) / Math.PI);
      s.add({ title: 'Volume-equivalent spherical diameter', formula: 'D_v = (6V/π)^(1/3)', tex: "D_v = \\left(\\dfrac{6V}{\\pi}\\right)^{1/3}", sub: 'D_v = (6 × ' + f(V) + ' / π)^(1/3)', result: 'D_v = ' + f(Dv) + ' nm', note: 'The diameter of a sphere with the same volume. Useful for comparing with DLS, or with sphere-based models such as the Scherrer equation.' });
      const psi = (Math.cbrt(Math.PI) * Math.pow(6 * V, 2 / 3)) / A;
      s.add({ title: 'Sphericity', formula: 'ψ = π^(1/3)·(6V)^(2/3) / A', tex: "\\psi = \\dfrac{\\pi^{1/3}\\,(6V)^{2/3}}{A}", sub: 'ψ = ' + f(Math.cbrt(Math.PI)) + ' × (6 × ' + f(V) + ')^(2/3) / ' + f(A), result: 'ψ = ' + f(psi, 3) + '  (1 = sphere)', ref: 'wadell1935' });

      s.heading('3 · Mass and composition');
      const mp = rho * V * 1e-21;
      s.add({ title: 'Mass of one particle', formula: 'm = ρ·V   (1 nm³ = 10⁻²¹ cm³)', sub: 'm = ' + f(rho) + ' g/cm³ × ' + f(V) + ' × 10⁻²¹ cm³', result: 'm = ' + f(mp) + ' g' });
      const N = (mp * C.NA) / M;
      s.add({ title: 'Atoms (formula units) per particle', formula: 'N = m·N_A / M', tex: "N = \\dfrac{m\\,N_A}{M}", sub: 'N = ' + f(mp) + ' × ' + f(C.NA) + ' / ' + f(M), result: 'N = ' + f(N), ref: 'codata2018' });
      const Mp = mp * C.NA;
      s.add({ title: 'Molar mass of one particle', formula: 'M_p = m·N_A', sub: 'M_p = ' + f(mp) + ' g × ' + f(C.NA) + ' mol⁻¹', result: 'M_p = ' + f(Mp) + ' g/mol' });
      const ssa = (1000 * AV) / rho;
      s.add({ title: 'Specific surface area (geometric)', formula: 'S = A/(ρV)   ⇒   S[m²/g] = 1000·(A/V)[nm⁻¹] / ρ[g/cm³]', tex: "S = \\dfrac{A}{\\rho V} \\;\\Rightarrow\\; S\\,[\\text{m}^2/\\text{g}] = \\dfrac{1000\\,(A/V)\\,[\\text{nm}^{-1}]}{\\rho\\,[\\text{g/cm}^3]}", sub: 'S = 1000 × ' + f(AV) + ' / ' + f(rho), result: 'S = ' + f(ssa) + ' m²/g', note: 'Assumes a smooth, dense and fully accessible surface. BET values are usually lower because particles aggregate.', ref: 'lowell2004' });

      s.heading('4 · Surface atoms');
      const rws = Math.cbrt((3 * M) / (4 * Math.PI * rho * C.NA)) * 1e7;
      const t = 2 * rws;
      s.add({ title: 'Thickness of one atomic layer t (Wigner–Seitz diameter)', formula: 't = 2·[3M / (4πρN_A)]^(1/3)', tex: "t = 2\\left(\\dfrac{3M}{4\\pi\\rho N_A}\\right)^{1/3}", sub: 't = 2 × [3 × ' + f(M) + ' / (4π × ' + f(rho) + ' × ' + f(C.NA) + ')]^(1/3) cm', result: 't = ' + f(t) + ' nm', ref: 'kittel2005' });
      const inner = shape.shrink(d, t);
      const innerOk = shape.dims.every(function (k) { return inner[k] > 0; }) && !(v.shape === 'rod' && inner.L < inner.D);
      const Vin = innerOk ? shape.V(inner) : 0;
      s.add({
        title: 'Core left after removing one atomic layer from every face',
        formula: shape.shrinkF,
        sub: innerOk ? shape.dims.map(function (k) { return k + "' = " + f(inner[k]) + ' nm'; }).join(',  ') + ';   V_core = ' + f(Vin) + ' nm³' : 'The particle is thinner than two atomic layers, so every atom is at the surface.',
        result: 'V_core = ' + f(Vin) + ' nm³'
      });
      const F = 1 - Vin / V;
      s.add({ title: 'Fraction of atoms at the surface', formula: 'F = 1 − V_core / V', tex: "F = 1 - \\dfrac{V_{\\text{core}}}{V}", sub: 'F = 1 − ' + f(Vin) + ' / ' + f(V), result: 'F = ' + f(F, 3) + '  (' + NC.fix(F * 100, 1) + ' %)  ⇒  N_surface ≈ ' + f(F * N), note: 'Geometric shell model: atoms within one atomic diameter of a face count as surface atoms. Edges and corners are not counted separately.', ref: 'roduner2006' });

      const results = [
        { label: 'Atoms per particle N', value: N, main: true },
        { label: 'Surface atoms', value: F * 100, unit: '%', main: true },
        { label: 'Specific surface area', value: ssa, unit: 'm²/g', main: true },
        { label: 'Volume V', value: V, unit: 'nm³' },
        { label: 'Surface area A', value: A, unit: 'nm²' },
        { label: 'Volume-equivalent diameter', value: Dv, unit: 'nm' },
        { label: 'Sphericity ψ', value: psi, sig: 3 },
        { label: 'Particle mass', value: mp, unit: 'g' },
        { label: 'Molar mass of particle', value: Mp, unit: 'g/mol' }
      ];

      const conc = NC.opt(v.conc, 'Mass concentration', { positive: true });
      if (conc !== null) {
        s.heading('5 · Dispersion concentration');
        const n = (conc * 1e-6) / mp;
        s.add({ title: 'Particle number concentration', formula: 'n = c_mass / m', tex: "n = \\dfrac{c_{\\text{mass}}}{m}", sub: 'n = ' + f(conc) + ' × 10⁻⁶ g/mL / ' + f(mp) + ' g', result: 'n = ' + f(n) + ' particles/mL' });
        const cM = (n * 1000) / C.NA;
        s.add({ title: 'Molar particle concentration', formula: 'c = n × 1000 / N_A', sub: 'c = ' + f(n) + ' × 1000 / ' + f(C.NA), result: 'c = ' + f(cM * 1e9) + ' nM', ref: 'codata2018' });
        const Atot = n * A * 1e-14;
        s.add({ title: 'Total particle surface area per mL', formula: 'A_tot = n·A   (1 nm² = 10⁻¹⁴ cm²)', sub: 'A_tot = ' + f(n) + ' × ' + f(A) + ' × 10⁻¹⁴', result: 'A_tot = ' + f(Atot) + ' cm²/mL' });
        results.push({ label: 'Particles per mL', value: n, unit: 'mL⁻¹', main: true }, { label: 'Molar particle conc.', value: cM * 1e9, unit: 'nM' }, { label: 'Surface area per mL', value: Atot, unit: 'cm²/mL' });
      }

      // Surface fraction vs size: this shape scaled uniformly, compared with a sphere of equal volume
      const curveShape = [], curveSphere = [];
      for (let k = 0.08; k <= 3; k *= 1.06) {
        const dd = {};
        shape.dims.forEach(function (key) { dd[key] = d[key] * k; });
        const Vk = shape.V(dd);
        const ik = shape.shrink(dd, t);
        const ok = shape.dims.every(function (key) { return ik[key] > 0; }) && !(v.shape === 'rod' && ik.L < ik.D);
        const dvk = Math.cbrt((6 * Vk) / Math.PI);
        if (dvk < 2 * t) continue;
        curveShape.push([dvk, 100 * (1 - (ok ? shape.V(ik) : 0) / Vk)]);
        curveSphere.push([dvk, 100 * (1 - Math.pow((dvk - 2 * t) / dvk, 3))]);
      }
      const warnings = [];
      if (Dv < 2) warnings.push('Below ~2 nm, particles are clusters with specific "magic number" structures, and continuum geometry is only a rough guide.');
      return {
        results: results,
        steps: s.items,
        warnings: warnings,
        figures: [{ title: shape.label + ' schematic (not to scale)', svg: sketch(v.shape, d) }],
        plots: [{
          title: 'Surface-atom fraction versus size',
          xlabel: 'Volume-equivalent diameter D_v (nm)', ylabel: 'Surface atoms (%)',
          series: v.shape === 'sphere'
            ? [{ name: 'Sphere', mode: 'line', points: curveSphere }, { name: 'This particle', mode: 'markers', points: [[Dv, F * 100]], color: 1, size: 5 }]
            : [{ name: shape.label.split(' (')[0], mode: 'line', points: curveShape }, { name: 'Sphere, same volume', mode: 'line', dashed: true, color: 2, points: curveSphere }, { name: 'This particle', mode: 'markers', points: [[Dv, F * 100]], color: 1, size: 5 }],
          ymin: 0, ymax: 100
        }],
        notes: [
          'All quantities use bulk density and ideal geometry with sharp edges. Real particles have rounded corners, twin planes and ligand shells.',
          'For anisotropic shapes, check which dimension a technique reports. TEM gives edge lengths or diameters; DLS gives a hydrodynamic diameter that the volume-equivalent diameter only approximates.'
        ]
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
