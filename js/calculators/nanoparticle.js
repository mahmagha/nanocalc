/*
 * Nanoparticle builder: choose material + shape + dimensions + structure
 * (solid, core–shell, hollow) and get geometry, mass, atom counts, surface
 * atoms, specific surface area and dispersion concentrations, step by step.
 *
 * Every shape implements:
 *   dims        input dimensions it needs (D, a, L, h)
 *   V(d), A(d)  volume (nm³) and surface area (nm²)
 *   shrink(d,t) the same body with every face moved inward by t (t < 0 grows it).
 *               Exact for spheres, cylinders, tangential polyhedra (similar
 *               shrink by 1 − t/r_in) and the cube∩octahedron family; approximate
 *               for spheroids (flagged with `approxOffset`).
 *   ok(d)       whether the (shrunken) body still exists
 */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt, C = NC.C;
  const S2 = Math.sqrt(2), S3 = Math.sqrt(3), S5 = Math.sqrt(5), S6 = Math.sqrt(6);
  const PI = Math.PI;
  const pos = function (keys) { return function (d) { return keys.every(function (k) { return d[k] > 0; }); }; };

  NC.addRefs({
    schneider2014: { type: 'book', authors: 'Schneider, R.', title: 'Convex Bodies: The Brunn–Minkowski Theory', edition: '2nd ed.', publisher: 'Cambridge University Press', place: 'Cambridge', year: 2014 }
  });

  /* ------------------------------------------------------------------ */
  /* Convex polyhedra from half-spaces {n·x ≤ p}: exact V, A and the      */
  /* edge-curvature sum M = Σ l_i·φ_i/2 (φ_i = angle between the outward */
  /* normals = π − dihedral angle) used by the Steiner formula.          */
  /* ------------------------------------------------------------------ */
  const dot = function (u, w) { return u[0] * w[0] + u[1] * w[1] + u[2] * w[2]; };
  const cross = function (u, w) { return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; };
  const sub3 = function (u, w) { return [u[0] - w[0], u[1] - w[1], u[2] - w[2]]; };
  const norm3 = function (u) { const l = Math.sqrt(dot(u, u)); return [u[0] / l, u[1] / l, u[2] / l]; };
  const mk = function (normals, p) { return normals.map(function (n) { return { n: n, p: p }; }); };

  function polyStats(planes) {
    let scale = 0;
    planes.forEach(function (q) { scale = Math.max(scale, Math.abs(q.p)); });
    if (scale === 0) return { V: 0, A: 0, M: 0, edges: 0 };
    const eps = 1e-9 * scale, onTol = 1e-7 * scale;
    const verts = [];
    const n = planes.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
      const a = planes[i], b = planes[j], c = planes[k];
      const bc = cross(b.n, c.n), det = dot(a.n, bc);
      if (Math.abs(det) < 1e-12) continue;
      const ca = cross(c.n, a.n), ab = cross(a.n, b.n);
      const x = [0, 1, 2].map(function (m) { return (a.p * bc[m] + b.p * ca[m] + c.p * ab[m]) / det; });
      if (!planes.every(function (q) { return dot(q.n, x) <= q.p + eps; })) continue;
      if (verts.some(function (v) { const dd = sub3(v, x); return dot(dd, dd) < onTol * onTol; })) continue;
      verts.push(x);
    }
    const onPlane = function (q) { return verts.filter(function (v) { return Math.abs(dot(q.n, v) - q.p) < onTol; }); };
    let A = 0, V = 0, M = 0, edges = 0;
    const faces = planes.map(onPlane);
    planes.forEach(function (q, j) {
      const P = faces[j];
      if (P.length < 3) return;
      const c = [0, 1, 2].map(function (m) { return P.reduce(function (s, v) { return s + v[m]; }, 0) / P.length; });
      const u = norm3(sub3(P[0], c)), w = cross(q.n, u);
      const sorted = P.slice().sort(function (p1, p2) {
        const d1 = sub3(p1, c), d2 = sub3(p2, c);
        return Math.atan2(dot(d1, w), dot(d1, u)) - Math.atan2(dot(d2, w), dot(d2, u));
      });
      let area = 0;
      for (let m = 0; m < sorted.length; m++) area += dot(cross(sub3(sorted[m], c), sub3(sorted[(m + 1) % sorted.length], c)), q.n) / 2;
      area = Math.abs(area);
      A += area;
      V += (q.p * area) / 3;
    });
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const common = faces[i].filter(function (v) { return faces[j].indexOf(v) >= 0; });
      if (common.length < 2) continue;
      let L = 0;
      for (let a = 0; a < common.length; a++) for (let b = a + 1; b < common.length; b++) { const dd = sub3(common[a], common[b]); L = Math.max(L, Math.sqrt(dot(dd, dd))); }
      if (L < onTol) continue;
      const phi = Math.acos(Math.max(-1, Math.min(1, dot(planes[i].n, planes[j].n))));
      M += (L * phi) / 2;
      edges++;
    }
    return { V: V, A: A, M: M, edges: edges };
  }
  NC.polyStats = polyStats;

  const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const OCTN = [];
  [1, -1].forEach(function (x) { [1, -1].forEach(function (y) { [1, -1].forEach(function (z) { OCTN.push([x / Math.sqrt(3), y / Math.sqrt(3), z / Math.sqrt(3)]); }); }); });
  const TETN = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(norm3);
  const GOLD = (1 + Math.sqrt(5)) / 2;
  const DODN = OCTN.slice();
  [1, -1].forEach(function (s1) {
    [1, -1].forEach(function (s2) {
      DODN.push(norm3([0, s1 / GOLD, s2 * GOLD]), norm3([s1 / GOLD, s2 * GOLD, 0]), norm3([s1 * GOLD, 0, s2 / GOLD]));
    });
  });
  // Pentagonal bipyramid with ten equilateral faces, edge 1: face normals and inradius
  const DECA = (function () {
    const R = 1 / (2 * Math.sin(Math.PI / 5)), H = Math.sqrt(1 - R * R);
    const P = [];
    for (let k = 0; k < 5; k++) P.push([R * Math.cos((2 * Math.PI * k) / 5), R * Math.sin((2 * Math.PI * k) / 5), 0]);
    const normals = [];
    let p1 = 0;
    [H, -H].forEach(function (z) {
      const T = [0, 0, z];
      for (let k = 0; k < 5; k++) {
        let nn = norm3(cross(sub3(P[k], T), sub3(P[(k + 1) % 5], T)));
        if (dot(nn, T) < 0) nn = [-nn[0], -nn[1], -nn[2]];
        normals.push(nn);
        p1 = dot(nn, T);
      }
    });
    return { normals: normals, p1: p1 };
  })();
  const PRISMN = [[0, 0, 1], [0, 0, -1]].concat([90, 210, 330].map(function (deg) { const r = (deg * Math.PI) / 180; return [Math.cos(r), Math.sin(r), 0]; }));

  /* Cube (half-width h) ∩ octahedron (|x|+|y|+|z| ≤ s). c = 3h − s is the depth of the corner cuts.
     V = 8h³ − (4/3)[c³ − 3(c − h)₊³]  (8 corner simplices minus 12 pairwise overlaps);
     A = −dV/dt with h → h − t, s → s − √3·t. */
  function coV(h, s) {
    if (s >= 3 * h) return 8 * h * h * h;
    if (s <= h) return (4 / 3) * s * s * s;
    const c = 3 * h - s, e = Math.max(0, c - h);
    return 8 * h * h * h - (4 / 3) * (c * c * c - 3 * e * e * e);
  }
  function coA(h, s) {
    if (s >= 3 * h) return 24 * h * h;
    if (s <= h) return 4 * S3 * s * s;
    const c = 3 * h - s, e = Math.max(0, c - h);
    return 24 * h * h - 12 * c * c + 24 * e * e + S3 * (4 * c * c - 12 * e * e);
  }
  function coFamily(def, hOfA, sOfA) {
    const hs = function (d) { return d.a !== undefined ? { h: hOfA * d.a, s: sOfA * d.a } : d; };
    def.dims = ['a'];
    def.V = function (d) { const q = hs(d); return coV(q.h, q.s); };
    def.A = function (d) { const q = hs(d); return coA(q.h, q.s); };
    def.shrink = function (d, t) { const q = hs(d); return { h: q.h - t, s: q.s - S3 * t }; };
    def.ok = function (d) { const q = hs(d); return q.h > 0 && q.s > 0; };
    def.planes = function (d) { const q = hs(d); return mk(AXES, q.h).concat(mk(OCTN, q.s / S3)); };
    def.fmtDims = function (d) { const q = hs(d); return d.a !== undefined ? 'a = ' + f(d.a) + ' nm' : 'h = ' + f(q.h) + ' nm,  s = ' + f(q.s) + ' nm'; };
    def.subOf = def.sub;
    def.sub = function (d) {
      if (d.a !== undefined) return def.subOf(d);
      const q = hs(d), c = 3 * q.h - q.s;
      return ['V = 8h³ − (4/3)[c³ − 3(c − h)³],  h = ' + f(q.h) + ', s = ' + f(q.s) + ', c = 3h − s = ' + f(c), 'A = ∂V/∂h + √3·∂V/∂s  (h = ' + f(q.h) + ', s = ' + f(q.s) + ')'];
    };
    return def;
  }

  /* Tangential polyhedron: inner body is similar, scaled by (1 − t/r_in), r_in = 3V/A. */
  function tangential(def) {
    def.dims = ['a'];
    def.shrink = function (d, t) { const rin = (3 * def.V(d)) / def.A(d); return { a: d.a * (1 - t / rin) }; };
    return def;
  }

  function spheroidArea(D, L) {
    const a = D / 2, c = L / 2;
    if (Math.abs(c - a) < 1e-9 * a) return 4 * PI * a * a;
    if (c > a) { const e = Math.sqrt(1 - (a * a) / (c * c)); return 2 * PI * a * a * (1 + (c / (a * e)) * Math.asin(e)); }
    const e = Math.sqrt(1 - (c * c) / (a * a));
    return 2 * PI * a * a * (1 + ((1 - e * e) / e) * 0.5 * Math.log((1 + e) / (1 - e)));
  }

  const SHAPES = {
    sphere: {
      label: 'Sphere', dims: ['D'],
      V: function (d) { return (PI * Math.pow(d.D, 3)) / 6; },
      A: function (d) { return PI * d.D * d.D; },
      Vf: 'V = πD³/6', Af: 'A = πD²', Vt: '\\dfrac{\\pi D^3}{6}', At: '\\pi D^2',
      sub: function (d) { return ['V = π × ' + f(d.D) + '³ / 6', 'A = π × ' + f(d.D) + '²']; },
      shrinkF: "D' = D − 2t",
      shrink: function (d, t) { return { D: d.D - 2 * t }; }
    },
    cube: {
      label: 'Cube', dims: ['a'],
      V: function (d) { return Math.pow(d.a, 3); },
      A: function (d) { return 6 * d.a * d.a; },
      Vf: 'V = a³', Af: 'A = 6a²', Vt: 'a^3', At: '6a^2',
      sub: function (d) { return ['V = ' + f(d.a) + '³', 'A = 6 × ' + f(d.a) + '²']; },
      shrinkF: "a' = a − 2t   (inradius r_in = a/2)",
      shrink: function (d, t) { return { a: d.a - 2 * t }; }
    },
    octahedron: {
      label: 'Octahedron', dims: ['a'],
      V: function (d) { return (S2 / 3) * Math.pow(d.a, 3); },
      A: function (d) { return 2 * S3 * d.a * d.a; },
      Vf: 'V = (√2/3)·a³', Af: 'A = 2√3·a²', Vt: '\\dfrac{\\sqrt{2}}{3}\\,a^3', At: '2\\sqrt{3}\\,a^2',
      sub: function (d) { return ['V = 0.4714 × ' + f(d.a) + '³', 'A = 3.4641 × ' + f(d.a) + '²']; },
      shrinkF: "a' = a − √6·t   (inradius r_in = a/√6)",
      shrink: function (d, t) { return { a: d.a - S6 * t }; }
    },
    tetrahedron: {
      label: 'Tetrahedron', dims: ['a'],
      V: function (d) { return Math.pow(d.a, 3) / (6 * S2); },
      A: function (d) { return S3 * d.a * d.a; },
      Vf: 'V = a³/(6√2)', Af: 'A = √3·a²', Vt: '\\dfrac{a^3}{6\\sqrt{2}}', At: '\\sqrt{3}\\,a^2',
      sub: function (d) { return ['V = ' + f(d.a) + '³ / 8.4853', 'A = 1.7321 × ' + f(d.a) + '²']; },
      shrinkF: "a' = a − 2√6·t   (inradius r_in = a/(2√6))",
      shrink: function (d, t) { return { a: d.a - 2 * S6 * t }; }
    },
    decahedron: tangential({
      label: 'Decahedron (pentagonal bipyramid)',
      // two pentagonal pyramids with equilateral faces: V = 2 × (1/3)·(base 1.7205a²)·(height 0.52573a)
      V: function (d) { return ((5 + S5) / 12) * Math.pow(d.a, 3); },
      A: function (d) { return ((5 * S3) / 2) * d.a * d.a; },
      Vf: 'V = (5 + √5)/12 · a³', Af: 'A = (5√3/2)·a²', Vt: '\\dfrac{5 + \\sqrt{5}}{12}\\,a^3', At: '\\dfrac{5\\sqrt{3}}{2}\\,a^2',
      sub: function (d) { return ['V = 0.60300 × ' + f(d.a) + '³', 'A = 4.3301 × ' + f(d.a) + '²']; },
      shrinkF: "a' = a·(1 − t/r_in),   r_in = 3V/A = (5 + √5)/(10√3) · a",
      note: 'Idealised Ino/Marks decahedron: ten equilateral faces. Real multiply-twinned decahedra have a small closure gap and often truncated edges.',
      ref: 'marks2016'
    }),
    icosahedron: tangential({
      label: 'Icosahedron',
      V: function (d) { return ((5 * (3 + S5)) / 12) * Math.pow(d.a, 3); },
      A: function (d) { return 5 * S3 * d.a * d.a; },
      Vf: 'V = 5(3 + √5)/12 · a³', Af: 'A = 5√3·a²', Vt: '\\dfrac{5(3+\\sqrt{5})}{12}\\,a^3', At: '5\\sqrt{3}\\,a^2',
      sub: function (d) { return ['V = 2.1817 × ' + f(d.a) + '³', 'A = 8.6603 × ' + f(d.a) + '²']; },
      shrinkF: "a' = a·(1 − t/r_in),   r_in = √3(3 + √5)/12 · a",
      ref: 'marks2016'
    }),
    cuboctahedron: coFamily({
      label: 'Cuboctahedron',
      Vf: 'V = (5√2/3)·a³', Af: 'A = (6 + 2√3)·a²', Vt: '\\dfrac{5\\sqrt{2}}{3}\\,a^3', At: '(6 + 2\\sqrt{3})\\,a^2',
      sub: function (d) { return ['V = 2.3570 × ' + f(d.a) + '³', 'A = 9.4641 × ' + f(d.a) + '²']; },
      shrinkF: "Cube ∩ octahedron with h = a/√2, s = √2·a;  h' = h − t,  s' = s − √3·t",
      note: 'Square faces sit closer to the centre than triangular ones, so the core left after removing a layer is no longer an exact cuboctahedron. The cube–octahedron description keeps it exact.',
      ref: 'marks2016'
    }, 1 / S2, S2),
    truncoct: coFamily({
      label: 'Truncated octahedron',
      Vf: 'V = 8√2·a³', Af: 'A = (6 + 12√3)·a²', Vt: '8\\sqrt{2}\\,a^3', At: '(6 + 12\\sqrt{3})\\,a^2',
      sub: function (d) { return ['V = 11.314 × ' + f(d.a) + '³', 'A = 26.785 × ' + f(d.a) + '²']; },
      shrinkF: "Cube ∩ octahedron with h = √2·a, s = 3a/√2;  h' = h − t,  s' = s − √3·t",
      note: 'Close to the Wulff shape of many fcc metals (e.g. Pt, Pd, Au).',
      ref: 'marks2016'
    }, S2, 3 / S2),
    rod: {
      label: 'Rod (cylinder with hemispherical caps)', dims: ['D', 'L'],
      V: function (d) { return (PI * d.D * d.D * (d.L - d.D)) / 4 + (PI * Math.pow(d.D, 3)) / 6; },
      A: function (d) { return PI * d.D * (d.L - d.D) + PI * d.D * d.D; },
      Vf: 'V = πD²(L − D)/4 + πD³/6', Af: 'A = πD(L − D) + πD²', Vt: '\\dfrac{\\pi D^2 (L-D)}{4} + \\dfrac{\\pi D^3}{6}', At: '\\pi D (L-D) + \\pi D^2',
      sub: function (d) { return ['V = π × ' + f(d.D) + '² × (' + f(d.L) + ' − ' + f(d.D) + ')/4 + π × ' + f(d.D) + '³/6', 'A = π × ' + f(d.D) + ' × (' + f(d.L) + ' − ' + f(d.D) + ') + π × ' + f(d.D) + '²']; },
      shrinkF: "D' = D − 2t,  L' = L − 2t",
      shrink: function (d, t) { return { D: d.D - 2 * t, L: d.L - 2 * t }; },
      ok: function (d) { return d.D > 0 && d.L >= d.D; }
    },
    cylinder: {
      label: 'Cylinder / nanowire / disc', dims: ['D', 'L'],
      V: function (d) { return (PI * d.D * d.D * d.L) / 4; },
      A: function (d) { return (PI * d.D * d.D) / 2 + PI * d.D * d.L; },
      Vf: 'V = πD²L/4', Af: 'A = πD²/2 + πDL', Vt: '\\dfrac{\\pi D^2 L}{4}', At: '\\dfrac{\\pi D^2}{2} + \\pi D L',
      sub: function (d) { return ['V = π × ' + f(d.D) + '² × ' + f(d.L) + ' / 4', 'A = π × ' + f(d.D) + '²/2 + π × ' + f(d.D) + ' × ' + f(d.L)]; },
      shrinkF: "D' = D − 2t,  L' = L − 2t",
      shrink: function (d, t) { return { D: d.D - 2 * t, L: d.L - 2 * t }; }
    },
    spheroid: {
      label: 'Spheroid (prolate or oblate ellipsoid)', dims: ['D', 'L'],
      V: function (d) { return (PI * d.D * d.D * d.L) / 6; },
      A: function (d) { return spheroidArea(d.D, d.L); },
      Vf: 'V = πD²L/6', Af: 'A = 2πa²[1 + (c/(a·e))·arcsin e] (prolate, c > a);  2πa²[1 + ((1 − e²)/e)·artanh e] (oblate);  a = D/2, c = L/2',
      Vt: '\\dfrac{\\pi D^2 L}{6}',
      At: '\\begin{cases} 2\\pi a^2\\left(1 + \\dfrac{c}{a e}\\arcsin e\\right), & e = \\sqrt{1 - a^2/c^2}\\ \\ (c > a) \\\\[4pt] 2\\pi a^2\\left(1 + \\dfrac{1 - e^2}{e}\\operatorname{artanh} e\\right), & e = \\sqrt{1 - c^2/a^2}\\ \\ (c < a) \\end{cases}',
      sub: function (d) {
        const a = d.D / 2, c = d.L / 2;
        const e = c > a ? Math.sqrt(1 - (a * a) / (c * c)) : c < a ? Math.sqrt(1 - (c * c) / (a * a)) : 0;
        return ['V = π × ' + f(d.D) + '² × ' + f(d.L) + ' / 6', 'a = ' + f(a) + ', c = ' + f(c) + ' (' + (c > a ? 'prolate' : c < a ? 'oblate' : 'sphere') + '), e = ' + f(e)];
      },
      shrinkF: "D' = D − 2t,  L' = L − 2t   (approximation: the inward offset of an ellipsoid is not exactly an ellipsoid)",
      shrink: function (d, t) { return { D: d.D - 2 * t, L: d.L - 2 * t }; },
      approxOffset: true,
      approxNote: 'For a spheroid, “move every face inward/outward by t” is approximated by changing both axes by 2t. This is exact for a sphere and becomes approximate at high aspect ratios.'
    },
    nanostar: {
      label: 'Nanostar (sphere with conical spikes)', dims: ['D', 'N', 'sl', 'sb'], lengthDims: ['D', 'sl', 'sb'],
      V: function (d) { return (PI * Math.pow(d.D, 3)) / 6 + (d.N * PI * d.sb * d.sb * d.sl) / 12; },
      A: function (d) { const rb = d.sb / 2; return PI * d.D * d.D + d.N * (PI * rb * Math.sqrt(rb * rb + d.sl * d.sl) - PI * rb * rb); },
      Vf: 'V = πD³/6 + N·πb²l/12', Af: 'A = πD² + N·[π(b/2)·√((b/2)² + l²) − π(b/2)²]',
      Vt: '\\dfrac{\\pi D^3}{6} + N\\,\\dfrac{\\pi b^2 l}{12}',
      At: '\\pi D^2 + N\\left[\\pi\\,\\dfrac{b}{2}\\sqrt{\\left(\\dfrac{b}{2}\\right)^2 + l^2} - \\pi\\left(\\dfrac{b}{2}\\right)^2\\right]',
      sub: function (d) {
        return ['V = π × ' + f(d.D) + '³/6 + ' + d.N + ' × π × ' + f(d.sb) + '² × ' + f(d.sl) + '/12',
          'A = π × ' + f(d.D) + '² + ' + d.N + ' × [π × ' + f(d.sb / 2) + ' × √(' + f(d.sb / 2) + '² + ' + f(d.sl) + '²) − π × ' + f(d.sb / 2) + '²]'];
      },
      shrinkF: "D' = D − 2t,  b' = b − 2t,  l' = l   (approximation for the spikes)",
      shrink: function (d, t) { return { D: d.D - 2 * t, N: d.N, sl: d.sl, sb: Math.max(0, d.sb - 2 * t) }; },
      ok: function (d) { return d.D > 0; },
      fmtDims: function (d) { return 'D = ' + f(d.D) + ' nm,  N = ' + d.N + ',  l = ' + f(d.sl) + ' nm,  b = ' + f(d.sb) + ' nm'; },
      approxOffset: true,
      approxNote: 'Nanostar: spikes are right circular cones standing on the core (the core curvature under each spike base is neglected). For surface atoms, the spikes are thinned by 2t at the base while keeping their length, which is an approximation.',
      note: 'Spikes are modelled as right circular cones (length l measured from the core surface, base diameter b).'
    },
    prism: {
      label: 'Triangular nanoplate (prism)', dims: ['a', 'h'],
      V: function (d) { return (S3 / 4) * d.a * d.a * d.h; },
      A: function (d) { return (S3 / 2) * d.a * d.a + 3 * d.a * d.h; },
      Vf: 'V = (√3/4)·a²·h', Af: 'A = (√3/2)·a² + 3a·h', Vt: '\\dfrac{\\sqrt{3}}{4}\\,a^2 h', At: '\\dfrac{\\sqrt{3}}{2}\\,a^2 + 3ah',
      sub: function (d) { return ['V = 0.4330 × ' + f(d.a) + '² × ' + f(d.h), 'A = 0.8660 × ' + f(d.a) + '² + 3 × ' + f(d.a) + ' × ' + f(d.h)]; },
      shrinkF: "a' = a − 2√3·t   (triangle inradius a/(2√3)),  h' = h − 2t",
      shrink: function (d, t) { return { a: d.a - 2 * S3 * t, h: d.h - 2 * t }; }
    }
  };
  Object.keys(SHAPES).forEach(function (k) {
    const s = SHAPES[k];
    s.key = k;
    if (!s.lengthDims) s.lengthDims = s.dims;
    if (!s.ok) s.ok = pos(s.dims);
    if (!s.fmtDims) s.fmtDims = function (d) { return s.dims.map(function (q) { return q + ' = ' + f(d[q]) + ' nm'; }).join(',  '); };
  });

  /* Half-space descriptions of the polyhedra (sharp shapes), used for rounding. */
  const PLANES = {
    cube: function (d) { return mk(AXES, d.a / 2); },
    octahedron: function (d) { return mk(OCTN, d.a / S6); },
    tetrahedron: function (d) { return mk(TETN, d.a / (2 * S6)); },
    icosahedron: function (d) { return mk(DODN, ((S3 * (3 + S5)) / 12) * d.a); },
    decahedron: function (d) { return mk(DECA.normals, DECA.p1 * d.a); },
    cuboctahedron: SHAPES.cuboctahedron.planes,
    truncoct: SHAPES.truncoct.planes,
    prism: function (d) { return mk(PRISMN.slice(0, 2), d.h / 2).concat(mk(PRISMN.slice(2), d.a / (2 * S3))); }
  };
  const strip = function (d) { const o = {}; Object.keys(d).forEach(function (k) { if (k !== 'r') o[k] = d[k]; }); return o; };

  /*
   * Rounded polyhedra (corner/edge radius r): the body is P' ⊕ B(r), where P' is the sharp
   * polyhedron with every face moved in by r. Steiner formula (exact for convex P'):
   *   V = V' + A'·r + M'·r² + (4/3)πr³,   A = A' + 2M'·r + 4πr²,   M' = Σ l_i·(π − θ_i)/2.
   * Moving every face of the rounded body in by t: P' ⊕ B(r − t) for t ≤ r (P' unchanged),
   * and the sharp polyhedron eroded by t for t > r. Growing (t < 0) gives P' ⊕ B(r + |t|).
   */
  Object.keys(PLANES).forEach(function (k) {
    const s = SHAPES[k];
    const Vs = s.V, As = s.A, shrinkS = s.shrink, okS = s.ok, planesF = PLANES[k], fmtS = s.fmtDims;
    s.planes = planesF;
    s.roundable = true;
    s.sharpStats = function (d) { return polyStats(planesF(strip(d))); };
    s.inradius = function (d) { return Math.min.apply(null, planesF(strip(d)).map(function (q) { return q.p; })); };
    s.tangentialShape = function (d) { const ps = planesF(strip(d)).map(function (q) { return q.p; }); return Math.max.apply(null, ps) - Math.min.apply(null, ps) < 1e-9 * Math.max.apply(null, ps); };
    s.steiner = function (d) {
      const r = d.r;
      const inner = shrinkS(strip(d), r);
      const ps = planesF(inner).map(function (q) { return q.p; });
      const maxp = Math.max.apply(null, ps);
      const scale = Math.max(1e-12, r);
      let st;
      if (maxp <= 1e-9 * scale) st = { V: 0, A: 0, M: 0, edges: 0 }; // inner polyhedron is a point: the body is a ball
      else st = polyStats(planesF(inner));
      return {
        inner: inner, point: maxp <= 1e-9 * scale, Vi: st.V, Ai: st.A, Mi: st.M, edges: st.edges,
        V: st.V + st.A * r + st.M * r * r + (4 / 3) * PI * r * r * r,
        A: st.A + 2 * st.M * r + 4 * PI * r * r
      };
    };
    s.V = function (d) { return d.r > 0 ? s.steiner(d).V : Vs(strip(d)); };
    s.A = function (d) { return d.r > 0 ? s.steiner(d).A : As(strip(d)); };
    s.shrink = function (d, t) { const e = shrinkS(strip(d), t); if (d.r > 0) e.r = Math.max(0, d.r - t); return e; };
    s.ok = function (d) { if (!okS(strip(d))) return false; return !(d.r > 0) || d.r <= s.inradius(d) * (1 + 1e-9); };
    s.fmtDims = function (d) { return fmtS(strip(d)) + (d.r > 0 ? ',  r = ' + f(d.r) + ' nm' : ''); };
  });
  NC.shapes = SHAPES;

  /* ------------------------------------------------------------------ */
  /* Schematics                                                          */
  /* ------------------------------------------------------------------ */
  function geom(shape, d) {
    switch (shape) {
      case 'sphere': return '<circle cx="120" cy="92" r="62"/><ellipse class="edge" cx="120" cy="92" rx="62" ry="16"/>';
      case 'cube': return '<path d="M70 72 L150 72 L150 152 L70 152 Z"/><path class="f2" d="M70 72 L100 42 L180 42 L150 72 Z"/><path class="f3" d="M150 72 L180 42 L180 122 L150 152 Z"/>';
      case 'octahedron': return '<path d="M120 22 L60 95 L120 162 Z"/><path class="f3" d="M120 22 L180 95 L120 162 Z"/><path class="edge" d="M60 95 L140 110 L180 95 M140 110 L120 22 M140 110 L120 162"/>';
      case 'tetrahedron': return '<path d="M120 22 L50 150 L140 165 Z"/><path class="f3" d="M120 22 L140 165 L195 135 Z"/>';
      case 'decahedron': {
        const P = [];
        for (let i = 0; i < 5; i++) P.push([120 + 72 * Math.cos(-PI / 2 + (i * 2 * PI) / 5), 95 + 72 * Math.sin(-PI / 2 + (i * 2 * PI) / 5)]);
        return '<path d="M' + P.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' L') + ' Z"/>' +
          '<path class="edge solid" d="' + P.map(function (p) { return 'M120 95 L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ') + '"/>';
      }
      case 'icosahedron': {
        const pts = [], inner = [];
        for (let i = 0; i < 6; i++) pts.push((120 + 70 * Math.cos(PI / 6 + (i * PI) / 3)).toFixed(1) + ' ' + (92 + 70 * Math.sin(PI / 6 + (i * PI) / 3)).toFixed(1));
        for (let i = 0; i < 3; i++) inner.push((120 + 40 * Math.cos(-PI / 2 + (i * 2 * PI) / 3)).toFixed(1) + ' ' + (92 + 40 * Math.sin(-PI / 2 + (i * 2 * PI) / 3)).toFixed(1));
        return '<path d="M' + pts.join(' L') + ' Z"/><path class="edge" d="M' + inner.join(' L') + ' Z"/>' +
          inner.map(function (p, i) { return '<path class="edge" d="M' + p + ' L' + pts[(i * 2 + 4) % 6] + ' M' + p + ' L' + pts[(i * 2 + 5) % 6] + '"/>'; }).join('');
      }
      case 'cuboctahedron': // view along a 4-fold axis: square outline, square-face diamond
        return '<path d="M55 30 L185 30 L185 160 L55 160 Z"/><path class="f2" d="M120 30 L185 95 L120 160 L55 95 Z"/><path class="edge" d="M55 30 L120 95 L185 30 M55 160 L120 95 L185 160"/>';
      case 'truncoct': // view along a 4-fold axis: octagon outline with the top square face
        return '<path d="M88 28 L152 28 L185 62 L185 128 L152 162 L88 162 L55 128 L55 62 Z"/><path class="f2" d="M120 62 L152 95 L120 128 L88 95 Z"/><path class="edge" d="M88 28 L120 62 M152 28 L120 62 M185 62 L152 95 M185 128 L152 95 M152 162 L120 128 M88 162 L120 128 M55 128 L88 95 M55 62 L88 95"/>';
      case 'rod': {
        const r = Math.min(30, (180 * d.D) / d.L / 2 + 8);
        return '<path d="M' + (40 + r) + ' ' + (92 - r) + ' L' + (200 - r) + ' ' + (92 - r) + ' A' + r + ' ' + r + ' 0 0 1 ' + (200 - r) + ' ' + (92 + r) + ' L' + (40 + r) + ' ' + (92 + r) + ' A' + r + ' ' + r + ' 0 0 1 ' + (40 + r) + ' ' + (92 - r) + ' Z"/>';
      }
      case 'cylinder': {
        const flat = d.L < d.D;
        const w = flat ? 150 : Math.min(150, 40 + 110 * Math.min(1, (d.D / d.L) * 3)), h = flat ? Math.max(14, (150 * d.L) / d.D) : 130;
        const x0 = 120 - w / 2, y0 = 95 - h / 2;
        return '<path d="M' + x0 + ' ' + y0 + ' L' + x0 + ' ' + (y0 + h) + ' A' + w / 2 + ' 12 0 0 0 ' + (x0 + w) + ' ' + (y0 + h) + ' L' + (x0 + w) + ' ' + y0 + ' Z"/><ellipse class="f2" cx="120" cy="' + y0 + '" rx="' + w / 2 + '" ry="12"/>';
      }
      case 'spheroid': {
        const prolate = d.L >= d.D;
        const rx = prolate ? 90 : 75, ry = prolate ? Math.max(14, (90 * d.D) / d.L) : Math.max(12, (75 * d.L) / d.D);
        return prolate
          ? '<ellipse cx="120" cy="92" rx="' + rx + '" ry="' + ry + '"/><ellipse class="edge" cx="120" cy="92" rx="' + (ry * 0.3) + '" ry="' + ry + '"/>'
          : '<ellipse cx="120" cy="92" rx="' + rx + '" ry="' + ry + '"/><ellipse class="edge" cx="120" cy="92" rx="' + rx + '" ry="' + (ry * 0.35) + '"/>';
      }
      case 'nanostar': {
        const Rc = 38, n = Math.min(d.N, 24);
        const Ls = Math.max(8, Math.min(52, (d.sl / d.D) * 76)), w = Math.max(2.5, Math.min(18, ((d.sb / d.D) * 76) / 2));
        let spikes = '';
        for (let i = 0; i < n; i++) {
          const th = (2 * PI * i) / n - PI / 2, ux = Math.cos(th), uy = Math.sin(th);
          const bx = 120 + (Rc - 2) * ux, by = 93 + (Rc - 2) * uy;
          spikes += '<path d="M' + (bx - w * uy).toFixed(1) + ' ' + (by + w * ux).toFixed(1) + ' L' + (120 + (Rc + Ls) * ux).toFixed(1) + ' ' + (93 + (Rc + Ls) * uy).toFixed(1) + ' L' + (bx + w * uy).toFixed(1) + ' ' + (by - w * ux).toFixed(1) + ' Z"/>';
        }
        return spikes + '<circle cx="120" cy="93" r="' + Rc + '"/>';
      }
      case 'prism': {
        const th = Math.max(8, Math.min(30, (120 * d.h) / d.a));
        return '<path class="f3" d="M40 140 L200 140 L200 ' + (140 + th) + ' L40 ' + (140 + th) + ' Z"/><path d="M40 140 L120 30 L200 140 Z"/>';
      }
    }
    return '';
  }

  function dimLabels(shape, d) {
    const nm = function (v) { return f(v, 3) + ' nm'; };
    const lbl = function (x, y, t, anchor) { return '<text class="dim" x="' + x + '" y="' + y + '" text-anchor="' + (anchor || 'middle') + '">' + NC.esc(t) + '</text>'; };
    const arrow = function (x1, y1, x2, y2) { return '<line class="dimline" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" marker-start="url(#ar)" marker-end="url(#ar)"/>'; };
    switch (shape) {
      case 'sphere': return arrow(58, 172, 182, 172) + lbl(120, 192, 'D = ' + nm(d.D));
      case 'cube': return arrow(70, 168, 150, 168) + lbl(110, 188, 'a = ' + nm(d.a));
      case 'rod': {
        const r = Math.min(30, (180 * d.D) / d.L / 2 + 8);
        return arrow(40, 92 + r + 16, 200, 92 + r + 16) + lbl(120, 92 + r + 34, 'L = ' + nm(d.L)) + lbl(120, 18, 'D = ' + nm(d.D) + ',  L/D = ' + f(d.L / d.D, 3));
      }
      case 'cylinder': case 'spheroid': return lbl(120, 194, 'D = ' + nm(d.D) + ',  L = ' + nm(d.L) + ',  L/D = ' + f(d.L / d.D, 3));
      case 'prism': return lbl(120, 128, 'a = ' + nm(d.a)) + lbl(120, 196, 'thickness h = ' + nm(d.h));
      case 'nanostar': return lbl(120, 196, 'core D = ' + nm(d.D) + ',  ' + d.N + ' spikes, l = ' + nm(d.sl) + ', b = ' + nm(d.sb));
      default: return lbl(120, 194, 'edge a = ' + nm(d.a));
    }
  }

  /** mode: 'solid' | 'coreshell' | 'hollow'; ratio = inner/outer linear size for the inner drawing. */
  function sketch(shape, d, mode, ratio, caption) {
    const g = geom(shape, d);
    const scaled = function (k, cls) { return '<g class="' + cls + '" transform="translate(120 93) scale(' + k.toFixed(3) + ') translate(-120 -93)">' + g + '</g>'; };
    let body, defs = '';
    if (mode === 'coreshell') body = scaled(1, 'shellpart') + scaled(Math.max(0.25, ratio), 'corepart');
    else if (mode === 'hollow') body = scaled(1, 'corepart') + scaled(Math.max(0.15, ratio), 'voidpart');
    else if (mode === 'janus') {
      // material A on the left, material B on the right; split line placed by volume fraction (schematic)
      const xs = 50 + 140 * (1 - ratio);
      defs = '<clipPath id="jclip"><rect x="' + xs.toFixed(1) + '" y="0" width="' + (240 - xs).toFixed(1) + '" height="205"/></clipPath>';
      body = scaled(1, 'corepart') + '<g clip-path="url(#jclip)">' + scaled(1, 'shellpart') + '</g>';
    } else if (mode === 'porous') {
      let dots = '';
      for (let y = 45; y <= 141; y += 16) for (let x = 72; x <= 168; x += 16) {
        const xx = x + ((y / 16) % 2 ? 8 : 0);
        if ((xx - 120) * (xx - 120) + (y - 93) * (y - 93) < 46 * 46) dots += '<circle cx="' + xx + '" cy="' + y + '" r="3.5"/>';
      }
      body = scaled(1, 'corepart') + '<g class="voidpart">' + dots + '</g>';
    } else body = scaled(1, 'corepart');
    let labels = mode === 'coreshell' || mode === 'hollow' || mode === 'janus' ? '<text class="dim" x="120" y="196" text-anchor="middle">' + NC.esc(caption) + '</text>' : dimLabels(shape, d);
    if (d.r > 0) labels += '<text class="dim" x="120" y="14" text-anchor="middle">' + NC.esc('rounded edges, r = ' + f(d.r, 3) + ' nm') + '</text>';
    return '<svg class="shape-sketch" viewBox="0 0 240 205" role="img" aria-label="' + NC.esc(SHAPES[shape].label) + ' schematic">' +
      '<defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="arrowhead"/></marker>' + defs + '</defs>' + body + labels + '</svg>';
  }

  /* ------------------------------------------------------------------ */
  /* Calculator                                                          */
  /* ------------------------------------------------------------------ */
  const shapeOptions = Object.keys(SHAPES).map(function (k) { return [k, SHAPES[k].label]; });
  const matOptions = Object.keys(NC.materials).map(function (k) { return [k, NC.materials[k].label, NC.materialGroups[NC.materials[k].group]]; })
    .concat([['custom', 'Custom material…', 'Other']]);
  const needs = function (dim) { return function (v) { return SHAPES[v.shape] && SHAPES[v.shape].dims.indexOf(dim) >= 0; }; };
  const isCS = function (v) { return v.struct === 'coreshell'; };
  const distAllowed = function (v) { return !v.struct || v.struct === 'solid' || v.struct === 'porous' || v.struct === 'janus'; };

  function material(key, rho, M, label) {
    if (key === 'custom') {
      return { rho: NC.need(rho, label + ' density', { positive: true }), M: NC.need(M, label + ' molar mass', { positive: true }), label: 'custom ' + label.toLowerCase(), custom: true };
    }
    const m = NC.materials[key];
    if (!m) NC.fail('Choose a ' + label.toLowerCase() + '.');
    return { rho: m.rho, M: m.M, label: m.label };
  }
  function atomLayer(m) { return 2 * Math.cbrt((3 * m.M) / (4 * PI * m.rho * C.NA)) * 1e7; }

  NC.register({
    id: 'nanoparticle',
    category: 'size',
    title: 'Nanoparticle builder (material, shape & size)',
    short: 'Pick a material (e.g. Ag), shape, size and structure (solid, core–shell, hollow, porous, Janus)',
    description:
      'Choose a material (for example silver for AgNPs), one of 13 shapes (polyhedra optionally with rounded edges), its dimensions, and whether it is solid, core–shell (e.g. Au@SiO₂), hollow (nanoshell, nanocage), porous (mesoporous silica, MOFs) or Janus. Monodisperse or with a lognormal/normal size distribution. NanoCalc works out the volume, surface area, equivalent diameter, sphericity, mass, number of atoms, fraction of surface atoms and specific surface area, and the particle concentration if you give a mass concentration.',
    refs: ['xia2009', 'marks2016', 'chaudhuri2012', 'skrabalak2008', 'coxeter1973', 'schneider2014', 'wadell1935', 'roduner2006', 'lowell2004', 'thommes2015', 'limpert2001', 'iso9276', 'kittel2005', 'crc', 'ciaaw2021', 'codata2018'],
    inputs: [
      NC.sel('struct', 'Structure', [['solid', 'Solid particle'], ['coreshell', 'Core–shell (dimensions below are the core)'], ['hollow', 'Hollow: nanoshell / nanocage (dimensions are the outside)'], ['porous', 'Porous: mesoporous silica, MOF (dimensions are the outside)'], ['janus', 'Janus: two materials in one particle']], 'solid'),
      NC.sel('mat', 'Material (core material for core–shell)', matOptions, 'Ag'),
      NC.num('rho', 'Density ρ', 'g/cm³', 10.5, { showIf: function (v) { return v.mat === 'custom'; } }),
      NC.num('M', 'Molar mass M (per atom / formula unit)', 'g/mol', 107.868, { showIf: function (v) { return v.mat === 'custom'; } }),
      NC.sel('shape', 'Shape', shapeOptions, 'sphere'),
      NC.num('D', 'Diameter D', 'nm', 20, { showIf: needs('D') }),
      NC.num('a', 'Edge length a', 'nm', 20, { showIf: needs('a') }),
      NC.num('L', 'Total length L', 'nm', 60, { showIf: needs('L'), help: 'For a spheroid, L is the length along the symmetry axis: L > D gives a prolate (spindle) shape, L < D an oblate (disc-like) one.' }),
      NC.num('h', 'Plate thickness h', 'nm', 8, { showIf: needs('h') }),
      NC.num('N', 'Number of spikes N', '', 12, { limits: { int: true, min: 1 }, showIf: needs('N') }),
      NC.num('sl', 'Spike length l (from the core surface)', 'nm', 20, { showIf: needs('sl') }),
      NC.num('sb', 'Spike base diameter b', 'nm', 10, { showIf: needs('sb') }),
      NC.num('rc', 'Edge and corner radius r', 'nm', 0, { showIf: function (v) { return SHAPES[v.shape] && SHAPES[v.shape].roundable; }, help: '0 = sharp edges. Rounded edges and corners use the exact Steiner formula; r cannot exceed the inradius (r = inradius gives a sphere).' }),
      NC.sel('pmode', 'Porosity given as', [['vp', 'Specific pore volume V_p (cm³/g)'], ['phi', 'Porosity φ (%)']], 'vp', { showIf: function (v) { return v.struct === 'porous'; } }),
      NC.num('vp', 'Specific pore volume V_p', 'cm³/g', 1, { showIf: function (v) { return v.struct === 'porous' && v.pmode !== 'phi'; }, help: 'Pore volume per gram of skeleton, e.g. from the N₂ isotherm near p/p₀ ≈ 0.95–0.99.' }),
      NC.num('phi', 'Porosity φ', '%', 50, { showIf: function (v) { return v.struct === 'porous' && v.pmode === 'phi'; } }),
      NC.num('dp', 'Mean pore diameter d_p', 'nm', 4, { showIf: function (v) { return v.struct === 'porous'; } }),
      NC.sel('jmat', 'Material B (second part)', matOptions, 'Au', { showIf: function (v) { return v.struct === 'janus'; } }),
      NC.num('jrho', 'Material B density', 'g/cm³', 19.32, { showIf: function (v) { return v.struct === 'janus' && v.jmat === 'custom'; } }),
      NC.num('jM', 'Material B molar mass', 'g/mol', 196.967, { showIf: function (v) { return v.struct === 'janus' && v.jmat === 'custom'; } }),
      NC.num('fB', 'Volume fraction of material B', '%', 50, { showIf: function (v) { return v.struct === 'janus'; } }),
      NC.sel('smat', 'Shell material', matOptions, 'SiO2', { showIf: isCS }),
      NC.num('srho', 'Shell density', 'g/cm³', 2.2, { showIf: function (v) { return isCS(v) && v.smat === 'custom'; } }),
      NC.num('sM', 'Shell molar mass', 'g/mol', 60.084, { showIf: function (v) { return isCS(v) && v.smat === 'custom'; } }),
      NC.num('ts', 'Shell thickness t_s', 'nm', 10, { showIf: isCS }),
      NC.num('w', 'Wall thickness w', 'nm', 4, { showIf: function (v) { return v.struct === 'hollow'; } }),
      NC.sel('dist', 'Size distribution', [['mono', 'Monodisperse (one size)'], ['lognormal', 'Lognormal (polydisperse)'], ['normal', 'Normal / Gaussian (polydisperse)']], 'mono', { showIf: distAllowed, help: 'The entered size is the number-mean of the main dimension; every length scales together.' }),
      NC.num('cv', 'Coefficient of variation CV', '%', 15, { showIf: function (v) { return distAllowed(v) && v.dist && v.dist !== 'mono'; } }),
      NC.num('conc', 'Mass concentration (optional)', 'µg/mL', NaN, { help: 'Leave blank to skip. Gives the particle number and molar concentration of a dispersion.' })
    ],
    example: { struct: 'solid', mat: 'Ag', shape: 'sphere', D: 20, conc: 20 },
    presets: [
      { label: 'AgNP sphere, 20 nm', values: { struct: 'solid', mat: 'Ag', shape: 'sphere', D: 20 } },
      { label: 'Ag nanocube, 40 nm', values: { struct: 'solid', mat: 'Ag', shape: 'cube', a: 40 } },
      { label: 'Au nanorod, 15 × 50 nm', values: { struct: 'solid', mat: 'Au', shape: 'rod', D: 15, L: 50 } },
      { label: 'Ag decahedron, 30 nm edge', values: { struct: 'solid', mat: 'Ag', shape: 'decahedron', a: 30 } },
      { label: 'Pt truncated octahedron, a = 2 nm', values: { struct: 'solid', mat: 'Pt', shape: 'truncoct', a: 2 } },
      { label: 'Au@SiO₂, 20 nm core + 10 nm shell', values: { struct: 'coreshell', mat: 'Au', shape: 'sphere', D: 20, smat: 'SiO2', ts: 10 } },
      { label: 'CdSe/ZnS quantum dot, 4 nm + 1 nm', values: { struct: 'coreshell', mat: 'CdSe', shape: 'sphere', D: 4, smat: 'ZnS', ts: 1 } },
      { label: 'Fe₃O₄@Au, 10 nm + 2 nm', values: { struct: 'coreshell', mat: 'Fe3O4', shape: 'sphere', D: 10, smat: 'Au', ts: 2 } },
      { label: 'Au nanocage, 50 nm edge, 5 nm wall', values: { struct: 'hollow', mat: 'Au', shape: 'cube', a: 50, w: 5 } },
      { label: 'Hematite spindle, 50 × 200 nm', values: { struct: 'solid', mat: 'Fe2O3', shape: 'spheroid', D: 50, L: 200 } },
      { label: 'Rounded Ag nanocube, 50 nm, r = 5 nm', values: { struct: 'solid', mat: 'Ag', shape: 'cube', a: 50, rc: 5 } },
      { label: 'Au nanostar, 40 nm core, 12 spikes', values: { struct: 'solid', mat: 'Au', shape: 'nanostar', D: 40, N: 12, sl: 20, sb: 10 } },
      { label: 'Mesoporous silica sphere, 100 nm (MCM-41 type)', values: { struct: 'porous', mat: 'SiO2', shape: 'sphere', D: 100, pmode: 'vp', vp: 1, dp: 4 } },
      { label: 'Fe₃O₄–Au Janus particle, 20 nm', values: { struct: 'janus', mat: 'Fe3O4', jmat: 'Au', fB: 30, shape: 'sphere', D: 20 } },
      { label: 'Polydisperse AgNPs, 20 nm, CV 15 %', values: { struct: 'solid', mat: 'Ag', shape: 'sphere', D: 20, dist: 'lognormal', cv: 15 } }
    ].map(function (p) { return { label: p.label, values: Object.assign({ rc: 0, dist: 'mono' }, p.values) }; }),
    presetNote: 'Bulk densities from the CRC Handbook; molar masses from IUPAC 2021 standard atomic weights. For compounds, “atoms” means formula units.',
    compute: function (v) {
      const s = new NC.Steps();
      const shape = SHAPES[v.shape];
      if (!shape) NC.fail('Choose a shape.');
      const struct = v.struct || 'solid';
      const m1 = material(v.mat, v.rho, v.M, struct === 'coreshell' ? 'Core material' : 'Material');
      const d = {};
      const names = { D: 'Diameter', a: 'Edge length', L: 'Length', h: 'Thickness', N: 'Number of spikes', sl: 'Spike length', sb: 'Spike base diameter' };
      shape.dims.forEach(function (k) { d[k] = NC.need(v[k], names[k], k === 'N' ? { int: true, min: 1 } : { positive: true }); });
      if (v.shape === 'rod' && d.L < d.D) NC.fail('For a rod the total length L must be at least the diameter D (L = D is a sphere).');
      if (v.shape === 'nanostar' && d.N * PI * (d.sb / 2) * (d.sb / 2) >= PI * d.D * d.D) NC.fail('The spike bases (N·π(b/2)²) would cover the whole core surface. Use fewer or thinner spikes, or a larger core.');
      const rc = shape.roundable ? NC.opt(v.rc, 'Edge and corner radius', { nonneg: true }) || 0 : 0;
      if (rc > 0) {
        const rin = shape.inradius(d);
        if (rc > rin * (1 + 1e-9)) NC.fail('The edge radius r = ' + f(rc) + ' nm is larger than the inradius of this shape (' + f(rin) + ' nm).');
        if (!shape.tangentialShape(d) && rc >= rin * (1 - 1e-9)) NC.fail('For this shape the edge radius must be smaller than the smallest face distance (' + f(rin) + ' nm).');
        d.r = Math.min(rc, rin);
      }
      const shapeRef = shape.ref || (['sphere', 'rod', 'cylinder', 'prism', 'spheroid'].indexOf(v.shape) >= 0 ? undefined : 'coxeter1973');
      const warnings = [], notes = [];

      /* ---- 1 · materials and shape ---- */
      s.heading('1 · Material' + (struct === 'coreshell' ? 's' : '') + ' and shape');
      s.add({ title: 'Bulk properties of ' + m1.label + (struct === 'coreshell' ? ' (core)' : ''), formula: 'ρ (density),  M (molar mass per atom or formula unit)', result: 'ρ = ' + f(m1.rho) + ' g/cm³;   M = ' + f(m1.M) + ' g/mol', note: 'Bulk values are assumed; lattice contraction and ligands are neglected.', ref: m1.custom ? undefined : ['crc', 'ciaaw2021'] });
      let m2 = null;
      if (struct === 'coreshell') {
        m2 = material(v.smat, v.srho, v.sM, 'Shell material');
        s.add({ title: 'Bulk properties of ' + m2.label + ' (shell)', formula: 'ρ_s,  M_s', result: 'ρ_s = ' + f(m2.rho) + ' g/cm³;   M_s = ' + f(m2.M) + ' g/mol', ref: m2.custom ? undefined : ['crc', 'ciaaw2021'] });
      } else if (struct === 'janus') {
        m2 = material(v.jmat, v.jrho, v.jM, 'Material B');
        s.add({ title: 'Bulk properties of ' + m2.label + ' (part B)', formula: 'ρ_B,  M_B', result: 'ρ_B = ' + f(m2.rho) + ' g/cm³;   M_B = ' + f(m2.M) + ' g/mol', ref: m2.custom ? undefined : ['crc', 'ciaaw2021'] });
      }
      s.add({
        title: 'Shape: ' + shape.label + (struct === 'coreshell' ? ' (core)' : struct === 'hollow' ? ' (outside)' : ''),
        formula: 'Dimensions: ' + shape.fmtDims(d) + (v.shape === 'rod' || v.shape === 'cylinder' || v.shape === 'spheroid' ? ',  aspect ratio L/D = ' + f(d.L / d.D, 3) : '') + (v.shape === 'prism' ? ',  aspect ratio a/h = ' + f(d.a / d.h, 3) : ''),
        note: shape.note || 'Shape-controlled syntheses of Ag, Au, Pd and Pt give spheres, cubes, octahedra, decahedra, icosahedra, rods, wires and plates.',
        ref: shape.ref ? [shape.ref, 'xia2009'] : 'xia2009'
      });

      function geometrySteps(dd, tag) {
        if (dd.r > 0) {
          const st = shape.steiner(dd), r = dd.r;
          s.add({
            title: 'Rounded edges: inner sharp polyhedron P′' + tag,
            formula: shape.shrinkF.replace(/\bt\b/g, 'r'),
            sub: 'r = ' + f(r) + ' nm',
            result: st.point ? 'P′ is a single point: r equals the inradius, so the particle is a sphere of radius r.' : 'P′: ' + shape.fmtDims(strip(st.inner)),
            note: 'The rounded particle is P′ inflated by a ball of radius r (Minkowski sum): flat faces, cylindrical edges and spherical corners. Its outer envelope keeps the dimensions entered above.',
            ref: 'schneider2014'
          });
          s.add({
            title: 'Inner polyhedron: volume, area and edge-curvature sum' + tag,
            formula: "V′, A′;   M′ = Σ l_i·(π − θ_i)/2 over all edges (l_i edge length, θ_i dihedral angle)",
            tex: "V',\\ A';\\quad M' = \\sum_i \\dfrac{l_i\\,(\\pi - \\theta_i)}{2}",
            sub: st.point ? 'V′ = A′ = M′ = 0' : 'computed from the ' + st.edges + ' edges of P′',
            result: "V′ = " + f(st.Vi) + ' nm³;   A′ = ' + f(st.Ai) + ' nm²;   M′ = ' + f(st.Mi) + ' nm',
            ref: 'schneider2014'
          });
          s.add({
            title: 'Steiner formula: volume' + tag,
            formula: 'V = V′ + A′·r + M′·r² + (4/3)·π·r³',
            tex: "V = V' + A'\\,r + M'\\,r^2 + \\dfrac{4}{3}\\pi r^3",
            sub: 'V = ' + f(st.Vi) + ' + ' + f(st.Ai) + ' × ' + f(r) + ' + ' + f(st.Mi) + ' × ' + f(r) + '² + (4/3)π × ' + f(r) + '³',
            result: 'V = ' + f(st.V) + ' nm³',
            ref: 'schneider2014'
          });
          s.add({
            title: 'Steiner formula: surface area' + tag,
            formula: 'A = A′ + 2M′·r + 4π·r²',
            tex: "A = A' + 2M'\\,r + 4\\pi r^2",
            sub: 'A = ' + f(st.Ai) + ' + 2 × ' + f(st.Mi) + ' × ' + f(r) + ' + 4π × ' + f(r) + '²',
            result: 'A = ' + f(st.A) + ' nm²',
            ref: 'schneider2014'
          });
          return { V: st.V, A: st.A };
        }
        const V = shape.V(dd), A = shape.A(dd), subs = shape.sub(dd);
        s.add({ title: 'Volume' + tag, formula: shape.Vf, tex: 'V = ' + shape.Vt, sub: subs[0], result: 'V = ' + f(V) + ' nm³', ref: shapeRef });
        s.add({ title: 'Surface area' + tag, formula: shape.Af, tex: 'A = ' + shape.At, sub: subs[1], result: 'A = ' + f(A) + ' nm²', ref: shapeRef });
        return { V: V, A: A };
      }
      function shapeDescriptors(V, A) {
        const Dv = Math.cbrt((6 * V) / PI);
        s.add({ title: 'Volume-equivalent spherical diameter', formula: 'D_v = (6V/π)^(1/3)', tex: 'D_v = \\left(\\dfrac{6V}{\\pi}\\right)^{1/3}', sub: 'D_v = (6 × ' + f(V) + ' / π)^(1/3)', result: 'D_v = ' + f(Dv) + ' nm', note: 'Diameter of a sphere with the same volume. Useful for comparing with DLS, or with sphere-based models such as Scherrer.' });
        const psi = (Math.cbrt(PI) * Math.pow(6 * V, 2 / 3)) / A;
        s.add({ title: 'Sphericity', formula: 'ψ = π^(1/3)·(6V)^(2/3) / A', tex: '\\psi = \\dfrac{\\pi^{1/3}\\,(6V)^{2/3}}{A}', sub: 'ψ = ' + f(Math.cbrt(PI)) + ' × (6 × ' + f(V) + ')^(2/3) / ' + f(A), result: 'ψ = ' + f(psi, 3) + '  (1 = sphere)', ref: 'wadell1935' });
        return { Dv: Dv, psi: psi };
      }
      function atomSteps(m, Vnm3, what) {
        const mass = m.rho * Vnm3 * 1e-21;
        const N = (mass * C.NA) / m.M;
        s.add({ title: 'Mass of ' + what, formula: 'm = ρ·V   (1 nm³ = 10⁻²¹ cm³)', sub: 'm = ' + f(m.rho) + ' g/cm³ × ' + f(Vnm3) + ' × 10⁻²¹ cm³', result: 'm = ' + f(mass) + ' g' });
        s.add({ title: 'Atoms (formula units) in ' + what, formula: 'N = m·N_A / M', tex: 'N = \\dfrac{m\\,N_A}{M}', sub: 'N = ' + f(mass) + ' × ' + f(C.NA) + ' / ' + f(m.M), result: 'N = ' + f(N), ref: 'codata2018' });
        return { m: mass, N: N };
      }
      function layerStep(m, label) {
        const t = atomLayer(m);
        s.add({ title: 'Thickness of one atomic layer of ' + label + ' (Wigner–Seitz diameter)', formula: 't = 2·[3M / (4πρN_A)]^(1/3)', tex: 't = 2\\left(\\dfrac{3M}{4\\pi\\rho N_A}\\right)^{1/3}', sub: 't = 2 × [3 × ' + f(m.M) + ' / (4π × ' + f(m.rho) + ' × ' + f(C.NA) + ')]^(1/3) cm', result: 't = ' + f(t) + ' nm', ref: 'kittel2005' });
        return t;
      }
      const Vsafe = function (dd) { return shape.ok(dd) ? shape.V(dd) : 0; };
      if (shape.approxOffset) notes.push(shape.approxNote);

      let results = [], massTotal, Aout, figCaption = '', ratio = 1, plot;
      // For the size-distribution section: SSA of one particle (external, size-dependent) and
      // the size-independent part (internal pore surface), and F(k) = atom-weighted surface
      // fraction of a particle scaled by k.
      let ssaExt1 = 0, ssaInt = 0, atoms1 = 0, surfFk = null;
      const scaled = function (k) { const dd = {}; Object.keys(d).forEach(function (q) { dd[q] = shape.lengthDims.indexOf(q) >= 0 || q === 'r' ? d[q] * k : d[q]; }); return dd; };

      if (struct === 'solid') {
        s.heading('2 · Geometry');
        const g = geometrySteps(d, '');
        const AV = g.A / g.V;
        s.add({ title: 'Surface-to-volume ratio', formula: 'A/V', sub: 'A/V = ' + f(g.A) + ' / ' + f(g.V), result: 'A/V = ' + f(AV) + ' nm⁻¹' });
        const sd = shapeDescriptors(g.V, g.A);
        s.heading('3 · Mass and composition');
        const am = atomSteps(m1, g.V, 'one particle');
        massTotal = am.m; Aout = g.A;
        s.add({ title: 'Molar mass of one particle', formula: 'M_p = m·N_A', sub: 'M_p = ' + f(am.m) + ' g × ' + f(C.NA) + ' mol⁻¹', result: 'M_p = ' + f(am.m * C.NA) + ' g/mol' });
        const ssa = (1000 * AV) / m1.rho;
        s.add({ title: 'Specific surface area (geometric)', formula: 'S = A/(ρV)   ⇒   S[m²/g] = 1000·(A/V)[nm⁻¹] / ρ[g/cm³]', tex: 'S = \\dfrac{A}{\\rho V} \\;\\Rightarrow\\; S\\,[\\text{m}^2/\\text{g}] = \\dfrac{1000\\,(A/V)\\,[\\text{nm}^{-1}]}{\\rho\\,[\\text{g/cm}^3]}', sub: 'S = 1000 × ' + f(AV) + ' / ' + f(m1.rho), result: 'S = ' + f(ssa) + ' m²/g', note: 'Assumes a smooth, dense, fully accessible surface. BET values are usually lower because particles aggregate.', ref: 'lowell2004' });
        s.heading('4 · Surface atoms');
        const t = layerStep(m1, m1.label);
        const inner = shape.shrink(d, t);
        const Vin = Vsafe(inner);
        s.add({ title: 'Core left after removing one atomic layer from every face', formula: shape.shrinkF, sub: shape.ok(inner) ? shape.fmtDims(inner).replace(/ = /g, "' = ") + ';   V_core = ' + f(Vin) + ' nm³' : 'The particle is thinner than two atomic layers, so every atom is at the surface.', result: 'V_core = ' + f(Vin) + ' nm³' });
        const F = 1 - Vin / g.V;
        s.add({ title: 'Fraction of atoms at the surface', formula: 'F = 1 − V_core / V', tex: 'F = 1 - \\dfrac{V_{\\text{core}}}{V}', sub: 'F = 1 − ' + f(Vin) + ' / ' + f(g.V), result: 'F = ' + f(F, 3) + '  (' + NC.fix(F * 100, 1) + ' %)  ⇒  N_surface ≈ ' + f(F * am.N), note: 'Geometric shell model: atoms within one atomic diameter of a face count as surface atoms. Edges and corners are not counted separately.', ref: 'roduner2006' });
        results = [
          { label: 'Atoms per particle N', value: am.N, main: true },
          { label: 'Surface atoms', value: F * 100, unit: '%', main: true },
          { label: 'Specific surface area', value: ssa, unit: 'm²/g', main: true },
          { label: 'Volume V', value: g.V, unit: 'nm³' },
          { label: 'Surface area A', value: g.A, unit: 'nm²' },
          { label: 'Volume-equivalent diameter', value: sd.Dv, unit: 'nm' },
          { label: 'Sphericity ψ', value: sd.psi, sig: 3 },
          { label: 'Particle mass', value: am.m, unit: 'g' },
          { label: 'Molar mass of particle', value: am.m * C.NA, unit: 'g/mol' }
        ];
        if (sd.Dv < 2) warnings.push('Below ~2 nm, particles are clusters with specific "magic number" structures, and continuum geometry is only a rough guide.');
        ssaExt1 = ssa; atoms1 = am.N;
        surfFk = function (k) { const dd = scaled(k), Vk = shape.V(dd); return Math.min(1, Math.max(0, 1 - Vsafe(shape.shrink(dd, t)) / Vk)); };
        const cs = [], csph = [];
        for (let k = 0.08; k <= 3; k *= 1.06) {
          const dd = scaled(k);
          const Vk = shape.V(dd), dvk = Math.cbrt((6 * Vk) / PI);
          if (dvk < 2 * t) continue;
          cs.push([dvk, 100 * (1 - Vsafe(shape.shrink(dd, t)) / Vk)]);
          csph.push([dvk, 100 * (1 - Math.pow((dvk - 2 * t) / dvk, 3))]);
        }
        plot = {
          title: 'Surface-atom fraction versus size', xlabel: 'Volume-equivalent diameter D_v (nm)', ylabel: 'Surface atoms (%)', ymin: 0, ymax: 100,
          series: v.shape === 'sphere'
            ? [{ name: 'Sphere', mode: 'line', points: csph }, { name: 'This particle', mode: 'markers', points: [[sd.Dv, F * 100]], color: 1, size: 5 }]
            : [{ name: shape.label.split(' (')[0], mode: 'line', points: cs }, { name: 'Sphere, same volume', mode: 'line', dashed: true, color: 2, points: csph }, { name: 'This particle', mode: 'markers', points: [[sd.Dv, F * 100]], color: 1, size: 5 }]
        };
      } else if (struct === 'porous') {
        s.heading('2 · Envelope geometry');
        const g = geometrySteps(d, ' (outer envelope)');
        const sd = shapeDescriptors(g.V, g.A);
        s.heading('3 · Porosity');
        const dp = NC.need(v.dp, 'Mean pore diameter', { positive: true });
        let phi, Vp;
        if (v.pmode === 'phi') {
          phi = NC.need(v.phi, 'Porosity', { gt: 0, lt: 100 }) / 100;
          Vp = phi / (m1.rho * (1 - phi));
          s.add({ title: 'Specific pore volume from porosity', formula: 'V_p = φ / [ρ_s·(1 − φ)]', tex: 'V_p = \\dfrac{\\varphi}{\\rho_s\\,(1 - \\varphi)}', sub: 'V_p = ' + f(phi) + ' / [' + f(m1.rho) + ' × (1 − ' + f(phi) + ')]', result: 'V_p = ' + f(Vp) + ' cm³/g', note: 'ρ_s is the skeletal (wall) density, taken as the bulk density of the material; V_p is per gram of skeleton.', ref: 'thommes2015' });
        } else {
          Vp = NC.need(v.vp, 'Specific pore volume', { positive: true });
          phi = (Vp * m1.rho) / (1 + Vp * m1.rho);
          s.add({ title: 'Porosity from the specific pore volume', formula: 'φ = V_p·ρ_s / (1 + V_p·ρ_s)', tex: '\\varphi = \\dfrac{V_p\\,\\rho_s}{1 + V_p\\,\\rho_s}', sub: 'φ = ' + f(Vp) + ' × ' + f(m1.rho) + ' / (1 + ' + f(Vp) + ' × ' + f(m1.rho) + ')', result: 'φ = ' + f(phi, 4) + '  (' + NC.fix(phi * 100, 1) + ' %)', note: 'φ is the pore fraction of the particle envelope; ρ_s is the skeletal density, taken as the bulk density of the material.', ref: 'thommes2015' });
        }
        const rhoApp = m1.rho * (1 - phi);
        s.add({ title: 'Apparent (envelope) density', formula: 'ρ_app = ρ_s·(1 − φ)', tex: '\\rho_{\\text{app}} = \\rho_s\\,(1 - \\varphi)', sub: 'ρ_app = ' + f(m1.rho) + ' × (1 − ' + f(phi) + ')', result: 'ρ_app = ' + f(rhoApp) + ' g/cm³', ref: 'lowell2004' });
        s.heading('4 · Mass and composition');
        const Vsk = (1 - phi) * g.V;
        s.add({ title: 'Skeleton (wall) volume', formula: 'V_sk = (1 − φ)·V_env', tex: 'V_{\\text{sk}} = (1 - \\varphi)\\,V_{\\text{env}}', sub: 'V_sk = (1 − ' + f(phi) + ') × ' + f(g.V), result: 'V_sk = ' + f(Vsk) + ' nm³' });
        const am = atomSteps(m1, Vsk, 'the skeleton of one particle');
        massTotal = am.m; Aout = g.A;
        const Sext = (g.A * 1e-18) / am.m;
        s.add({ title: 'External (envelope) specific surface area', formula: 'S_ext = A_env / m', tex: 'S_{\\text{ext}} = \\dfrac{A_{\\text{env}}}{m}', sub: 'S_ext = ' + f(g.A) + ' × 10⁻¹⁸ m² / ' + f(am.m) + ' g', result: 'S_ext = ' + f(Sext) + ' m²/g', ref: 'lowell2004' });
        const Sint = (4000 * Vp) / dp;
        s.add({ title: 'Internal (pore) surface area, cylindrical pores', formula: 'S_int = 4·V_p / d_p   ⇒   S_int[m²/g] = 4000·V_p[cm³/g] / d_p[nm]', tex: 'S_{\\text{int}} = \\dfrac{4V_p}{d_p} \\;\\Rightarrow\\; S_{\\text{int}}\\,[\\text{m}^2/\\text{g}] = \\dfrac{4000\\,V_p\\,[\\text{cm}^3/\\text{g}]}{d_p\\,[\\text{nm}]}', sub: 'S_int = 4000 × ' + f(Vp) + ' / ' + f(dp), result: 'S_int = ' + f(Sint) + ' m²/g', note: 'Open, non-intersecting cylindrical pores of one diameter: the same relation as the usual average pore diameter d = 4V_p/S. Compare with the BET area; BET is not reliable for micropores.', ref: ['lowell2004', 'thommes2015'] });
        const Stot = Sext + Sint;
        s.add({ title: 'Total specific surface area', formula: 'S = S_ext + S_int', tex: 'S = S_{\\text{ext}} + S_{\\text{int}}', sub: 'S = ' + f(Sext) + ' + ' + f(Sint), result: 'S = ' + f(Stot) + ' m²/g' });
        s.heading('5 · Surface atoms');
        const t = layerStep(m1, m1.label);
        const Aint = Sint * am.m * 1e18; // nm² of pore wall in one particle
        const Fp = Math.min(1, ((g.A + Aint) * t) / Vsk);
        s.add({ title: 'Atoms at the outer and pore surfaces (thin-layer approximation)', formula: 'F ≈ (A_env + A_int)·t / V_sk,   A_int = S_int·m', tex: 'F \\approx \\dfrac{(A_{\\text{env}} + A_{\\text{int}})\\,t}{V_{\\text{sk}}},\\quad A_{\\text{int}} = S_{\\text{int}}\\,m', sub: 'A_int = ' + f(Aint) + ' nm²;   F = (' + f(g.A) + ' + ' + f(Aint) + ') × ' + f(t) + ' / ' + f(Vsk), result: 'F = ' + f(Fp, 3) + '  (' + NC.fix(Fp * 100, 1) + ' %)  ⇒  N_surface ≈ ' + f(Fp * am.N), note: 'Valid when the pore walls are several atomic layers thick; capped at 100 %. Thin mesopore walls (~1 nm in MCM-41) put most atoms at a surface.', ref: 'roduner2006' });
        if (Fp >= 1) warnings.push('The pore walls are about one atomic layer thick or less with these values: essentially every atom is at a surface. Check porosity and pore size.');
        results = [
          { label: 'Total SSA', value: Stot, unit: 'm²/g', main: true },
          { label: 'Porosity φ', value: phi * 100, unit: '%', main: true },
          { label: 'Atoms per particle N', value: am.N, main: true },
          { label: 'Internal SSA', value: Sint, unit: 'm²/g' },
          { label: 'External SSA', value: Sext, unit: 'm²/g' },
          { label: 'Specific pore volume', value: Vp, unit: 'cm³/g' },
          { label: 'Apparent density', value: rhoApp, unit: 'g/cm³' },
          { label: 'Surface atoms (approx.)', value: Fp * 100, unit: '%' },
          { label: 'Particle mass', value: am.m, unit: 'g' },
          { label: 'Volume-equivalent diameter', value: sd.Dv, unit: 'nm' }
        ];
        ssaExt1 = Sext; ssaInt = Sint; atoms1 = am.N;
        surfFk = function (k) { return Math.min(1, ((g.A * k * k + Sint * am.m * k * k * k * 1e18) * t) / (Vsk * k * k * k)); };
        ratio = phi;
        const sp = [];
        for (let x = 2; x <= 30; x += 0.25) sp.push([x, Sext + (4000 * Vp) / x]);
        plot = {
          title: 'Total surface area versus pore diameter (same pore volume)', xlabel: 'Pore diameter d_p (nm)', ylabel: 'Specific surface area (m²/g)', zeroY: true,
          series: [{ name: 'S_ext + 4V_p/d_p', mode: 'line', points: sp }, { name: 'This particle', mode: 'markers', color: 1, size: 5, points: [[dp, Stot]] }]
        };
      } else if (struct === 'janus') {
        const fB = NC.need(v.fB, 'Volume fraction of material B', { gt: 0, lt: 100 }) / 100;
        s.heading('2 · Geometry');
        const g = geometrySteps(d, '');
        const sd = shapeDescriptors(g.V, g.A);
        s.heading('3 · The two parts');
        const VA = (1 - fB) * g.V, VB = fB * g.V;
        s.add({ title: 'Volume of each part', formula: 'V_A = (1 − f_B)·V,   V_B = f_B·V', tex: 'V_A = (1 - f_B)\\,V,\\quad V_B = f_B\\,V', sub: 'V_A = (1 − ' + f(fB) + ') × ' + f(g.V) + ';   V_B = ' + f(fB) + ' × ' + f(g.V), result: 'V_A = ' + f(VA) + ' nm³;   V_B = ' + f(VB) + ' nm³', note: 'Only the volume split matters for masses and atom counts: where the interface lies, and its shape, does not change these totals.' });
        s.heading('4 · Mass and composition');
        const aA = atomSteps(m1, VA, 'part A (' + m1.label + ')');
        const aB = atomSteps(m2, VB, 'part B (' + m2.label + ')');
        massTotal = aA.m + aB.m; Aout = g.A;
        const wB = aB.m / massTotal;
        s.add({ title: 'Total mass and mass fraction of B', formula: 'm = m_A + m_B,   w_B = m_B / m', tex: 'm = m_A + m_B,\\quad w_B = \\dfrac{m_B}{m}', sub: 'm = ' + f(aA.m) + ' + ' + f(aB.m) + ' g', result: 'm = ' + f(massTotal) + ' g;   w_B = ' + NC.fix(wB * 100, 1) + ' %' });
        const rhoAvg = massTotal / (g.V * 1e-21);
        s.add({ title: 'Average particle density', formula: 'ρ̄ = m / V = (1 − f_B)·ρ_A + f_B·ρ_B', tex: '\\bar{\\rho} = \\dfrac{m}{V} = (1 - f_B)\\,\\rho_A + f_B\\,\\rho_B', sub: 'ρ_avg = (1 − ' + f(fB) + ') × ' + f(m1.rho) + ' + ' + f(fB) + ' × ' + f(m2.rho), result: 'ρ_avg = ' + f(rhoAvg) + ' g/cm³' });
        const ssa = (g.A * 1e-18) / massTotal;
        s.add({ title: 'Specific surface area', formula: 'S = A / m', tex: 'S = \\dfrac{A}{m}', sub: 'S = ' + f(g.A) + ' × 10⁻¹⁸ m² / ' + f(massTotal) + ' g', result: 'S = ' + f(ssa) + ' m²/g', ref: 'lowell2004' });
        s.heading('5 · Surface atoms');
        const tA = layerStep(m1, 'material A'), tB = layerStep(m2, 'material B');
        const FA = 1 - Vsafe(shape.shrink(d, tA)) / g.V, FB = 1 - Vsafe(shape.shrink(d, tB)) / g.V;
        const Nsurf = FA * aA.N + FB * aB.N;
        s.add({ title: 'Surface atoms of each material', formula: 'N_surf ≈ F_A·N_A + F_B·N_B,   F_X = 1 − V(shrunk by t_X) / V', tex: 'N_{\\text{surf}} \\approx F_A N_A + F_B N_B,\\quad F_X = 1 - \\dfrac{V(t_X)}{V}', sub: 'F_A = ' + f(FA, 3) + ',  F_B = ' + f(FB, 3), result: 'N_surf ≈ ' + f(Nsurf) + '  (' + NC.fix((100 * Nsurf) / (aA.N + aB.N), 1) + ' % of all atoms)', note: 'Assumes each material’s share of the outer surface equals its share of the volume (exact for two halves of a sphere cut through the centre; approximate otherwise).', ref: 'roduner2006' });
        results = [
          { label: 'Mass fraction of B', value: wB * 100, unit: '%', main: true },
          { label: 'Average density', value: rhoAvg, unit: 'g/cm³', main: true },
          { label: 'Specific surface area', value: ssa, unit: 'm²/g', main: true },
          { label: 'Atoms in A', value: aA.N },
          { label: 'Atoms in B', value: aB.N },
          { label: 'Surface atoms (approx.)', value: (100 * Nsurf) / (aA.N + aB.N), unit: '%' },
          { label: 'Volume V', value: g.V, unit: 'nm³' },
          { label: 'Particle mass', value: massTotal, unit: 'g' },
          { label: 'Volume-equivalent diameter', value: sd.Dv, unit: 'nm' }
        ];
        ssaExt1 = ssa; atoms1 = aA.N + aB.N;
        surfFk = function (k) {
          const dd = scaled(k), Vk = shape.V(dd);
          const fa = 1 - Vsafe(shape.shrink(dd, tA)) / Vk, fb = 1 - Vsafe(shape.shrink(dd, tB)) / Vk;
          return Math.min(1, (fa * aA.N + fb * aB.N) / (aA.N + aB.N));
        };
        ratio = fB;
        figCaption = m1.label + '  |  ' + m2.label + ' (' + NC.fix(fB * 100, 0) + ' vol %)';
        const wf = [];
        for (let x = 0; x <= 100; x += 1) { const fx = x / 100; wf.push([x, (100 * fx * m2.rho) / (fx * m2.rho + (1 - fx) * m1.rho)]); }
        plot = {
          title: 'Mass fraction versus volume fraction of B', xlabel: 'Volume fraction of B (%)', ylabel: 'Mass fraction of B (%)', xmin: 0, xmax: 100, ymin: 0, ymax: 100,
          series: [{ name: 'w_B', mode: 'line', points: wf }, { name: 'This particle', mode: 'markers', color: 1, size: 5, points: [[fB * 100, wB * 100]] }]
        };
      } else if (struct === 'coreshell') {
        const ts = NC.need(v.ts, 'Shell thickness', { positive: true });
        s.heading('2 · Core geometry');
        const gc = geometrySteps(d, ' of the core');
        s.heading('3 · Shell and outer particle');
        const dOut = shape.shrink(d, -ts);
        s.add({ title: 'Outer particle: every face of the core moved outward by t_s', formula: shape.shrinkF.replace(/ − /g, ' + ').replace(/\bt\b/g, 't_s'), sub: 't_s = ' + f(ts) + ' nm', result: 'Outer: ' + shape.fmtDims(dOut), note: 'Uniform, conformal shell of constant thickness. For polyhedra the outer edges stay sharp (planar offset), a good approximation when t_s is small compared with the core.', ref: 'chaudhuri2012' });
        const go = geometrySteps(dOut, ' of the whole particle');
        const Vs = go.V - gc.V;
        s.add({ title: 'Shell volume', formula: 'V_shell = V_outer − V_core', tex: 'V_{\\text{shell}} = V_{\\text{outer}} - V_{\\text{core}}', sub: 'V_shell = ' + f(go.V) + ' − ' + f(gc.V), result: 'V_shell = ' + f(Vs) + ' nm³  (' + NC.fix((100 * Vs) / go.V, 1) + ' % of the particle volume)' });
        const sd = shapeDescriptors(go.V, go.A);
        s.heading('4 · Mass and composition');
        const ac = atomSteps(m1, gc.V, 'the core');
        const as = atomSteps(m2, Vs, 'the shell');
        massTotal = ac.m + as.m; Aout = go.A;
        const wS = as.m / massTotal;
        s.add({ title: 'Total mass and shell mass fraction', formula: 'm = m_core + m_shell,   w_shell = m_shell / m', tex: 'm = m_{\\text{core}} + m_{\\text{shell}},\\quad w_{\\text{shell}} = \\dfrac{m_{\\text{shell}}}{m}', sub: 'm = ' + f(ac.m) + ' + ' + f(as.m) + ' g', result: 'm = ' + f(massTotal) + ' g;   w_shell = ' + NC.fix(wS * 100, 1) + ' %' });
        const rhoEff = massTotal / (go.V * 1e-21);
        s.add({ title: 'Effective particle density', formula: 'ρ_eff = m / V_outer', tex: '\\rho_{\\text{eff}} = \\dfrac{m}{V_{\\text{outer}}}', sub: 'ρ_eff = ' + f(massTotal) + ' g / (' + f(go.V) + ' × 10⁻²¹ cm³)', result: 'ρ_eff = ' + f(rhoEff) + ' g/cm³', note: 'Relevant for sedimentation and centrifugation of core–shell particles.' });
        const ssa = (go.A * 1e-18) / massTotal;
        s.add({ title: 'Specific surface area (outer surface)', formula: 'S = A_outer / m', tex: 'S = \\dfrac{A_{\\text{outer}}}{m}', sub: 'S = ' + f(go.A) + ' × 10⁻¹⁸ m² / ' + f(massTotal) + ' g', result: 'S = ' + f(ssa) + ' m²/g', note: 'A porous shell such as mesoporous silica has a much larger BET area.', ref: 'lowell2004' });
        s.heading('5 · Surface atoms (shell material at the outer surface)');
        const t2 = layerStep(m2, 'the shell');
        const layerV = ts <= t2 ? Vs : go.V - Vsafe(shape.shrink(dOut, t2));
        const Nsurf = (m2.rho * layerV * 1e-21 * C.NA) / m2.M;
        s.add({ title: 'Outermost atomic layer of the shell', formula: 'V_layer = V_outer − V(outer shrunk by t)', tex: 'V_{\\text{layer}} = V_{\\text{outer}} - V\\!\\left(\\text{outer shrunk by } t\\right)', sub: ts <= t2 ? 'The shell is at most one atomic layer thick, so the whole shell is surface.' : 'V_layer = ' + f(go.V) + ' − ' + f(go.V - layerV), result: 'V_layer = ' + f(layerV) + ' nm³  ⇒  N_surface = ' + f(Nsurf) + ' (' + NC.fix((100 * Nsurf) / (ac.N + as.N), 1) + ' % of all atoms)', ref: 'roduner2006' });
        if (ts < t2) warnings.push('The shell is thinner than one atomic layer of the shell material, so it cannot be a continuous shell.');
        results = [
          { label: 'Outer volume-equivalent diameter', value: sd.Dv, unit: 'nm', main: true },
          { label: 'Shell mass fraction', value: wS * 100, unit: '%', main: true },
          { label: 'Specific surface area', value: ssa, unit: 'm²/g', main: true },
          { label: 'Atoms in core', value: ac.N },
          { label: 'Atoms in shell', value: as.N },
          { label: 'Shell volume fraction', value: (100 * Vs) / go.V, unit: '%' },
          { label: 'Effective density', value: rhoEff, unit: 'g/cm³' },
          { label: 'Particle mass', value: massTotal, unit: 'g' },
          { label: 'Outer surface area', value: go.A, unit: 'nm²' },
          { label: 'Sphericity ψ (outer)', value: sd.psi, sig: 3 }
        ];
        ratio = Math.cbrt(gc.V / go.V);
        figCaption = 'core ' + shape.fmtDims(d) + '  +  ' + f(ts, 3) + ' nm shell';
        const vf = [], mf = [];
        const tmax = Math.max(3 * ts, 5);
        for (let k = 0; k <= 60; k++) {
          const tt = (tmax * k) / 60, Vo = shape.V(shape.shrink(d, -tt)), Vsh = Vo - gc.V;
          vf.push([tt, (100 * Vsh) / Vo]);
          mf.push([tt, (100 * m2.rho * Vsh) / (m2.rho * Vsh + m1.rho * gc.V)]);
        }
        plot = {
          title: 'Shell fraction versus shell thickness', xlabel: 'Shell thickness t_s (nm)', ylabel: 'Shell fraction (%)', ymin: 0, ymax: 100,
          series: [{ name: 'Volume fraction', mode: 'line', points: vf }, { name: 'Mass fraction', mode: 'line', color: 3, points: mf }, { name: 'This particle', mode: 'markers', color: 1, size: 5, points: [[ts, (100 * Vs) / go.V], [ts, wS * 100]] }]
        };
      } else {
        const w = NC.need(v.w, 'Wall thickness', { positive: true });
        s.heading('2 · Outer geometry');
        const go = geometrySteps(d, ' (outside)');
        s.heading('3 · Cavity and wall');
        const dIn = shape.shrink(d, w);
        if (!shape.ok(dIn)) NC.fail('The wall (' + f(w) + ' nm) is too thick for this particle: nothing would be left of the cavity. Use a solid particle or a thinner wall.');
        s.add({ title: 'Cavity: every face moved inward by the wall thickness w', formula: shape.shrinkF.replace(/\bt\b/g, 'w'), sub: 'w = ' + f(w) + ' nm', result: 'Cavity: ' + shape.fmtDims(dIn), ref: 'skrabalak2008' });
        const Vi = shape.V(dIn), Ai = shape.A(dIn);
        s.add({ title: 'Cavity volume and inner surface area', formula: 'Same volume and area formulas, applied to the cavity dimensions', sub: shape.sub(dIn).join(';   '), result: 'V_cavity = ' + f(Vi) + ' nm³;   A_inner = ' + f(Ai) + ' nm²' });
        const Vw = go.V - Vi;
        s.add({ title: 'Wall volume', formula: 'V_wall = V_outer − V_cavity', tex: 'V_{\\text{wall}} = V_{\\text{outer}} - V_{\\text{cavity}}', sub: 'V_wall = ' + f(go.V) + ' − ' + f(Vi), result: 'V_wall = ' + f(Vw) + ' nm³  (' + NC.fix((100 * Vw) / go.V, 1) + ' % of a solid particle)' });
        const sd = shapeDescriptors(go.V, go.A);
        s.heading('4 · Mass and composition');
        const am = atomSteps(m1, Vw, 'the wall (one particle)');
        massTotal = am.m; Aout = go.A;
        const ssaOut = (go.A * 1e-18) / am.m, ssaAll = ((go.A + Ai) * 1e-18) / am.m;
        s.add({ title: 'Specific surface area', formula: 'S_outer = A_outer / m;   S_open = (A_outer + A_inner) / m', tex: 'S_{\\text{outer}} = \\dfrac{A_{\\text{outer}}}{m},\\quad S_{\\text{open}} = \\dfrac{A_{\\text{outer}} + A_{\\text{inner}}}{m}', sub: 'S_outer = ' + f(go.A) + ' × 10⁻¹⁸ / ' + f(am.m) + ';   S_open = ' + f(go.A + Ai) + ' × 10⁻¹⁸ / ' + f(am.m), result: 'S_outer = ' + f(ssaOut) + ' m²/g;   S_open = ' + f(ssaAll) + ' m²/g', note: 'Use S_open for porous nanocages and nanoframes, where the inner surface can be reached; use S_outer for closed shells.', ref: 'lowell2004' });
        s.heading('5 · Surface atoms');
        const t = layerStep(m1, m1.label);
        const layer = w <= 2 * t ? Vw : (go.V - Vsafe(shape.shrink(d, t))) + (Vsafe(shape.shrink(d, w - t)) - Vi);
        const F = Math.min(1, layer / Vw);
        s.add({ title: 'Atoms on the outer and inner faces of the wall', formula: 'F = [V_outer − V(shrunk by t) + V(shrunk by w − t) − V_cavity] / V_wall', tex: 'F = \\dfrac{\\left[V_{\\text{outer}} - V(t)\\right] + \\left[V(w - t) - V_{\\text{cavity}}\\right]}{V_{\\text{wall}}}', sub: w <= 2 * t ? 'The wall is at most two atomic layers thick, so every atom is at a surface.' : 'F = ' + f(layer) + ' / ' + f(Vw), result: 'F = ' + f(F, 3) + '  (' + NC.fix(F * 100, 1) + ' %)  ⇒  N_surface ≈ ' + f(F * am.N), note: 'Counts both faces of the wall (open cage or frame). For a closed shell only the outer face is exposed.', ref: 'roduner2006' });
        results = [
          { label: 'Atoms per particle N', value: am.N, main: true },
          { label: 'Mass vs. solid particle', value: (100 * Vw) / go.V, unit: '%', main: true },
          { label: 'Surface atoms (both faces)', value: F * 100, unit: '%', main: true },
          { label: 'SSA, outer only', value: ssaOut, unit: 'm²/g' },
          { label: 'SSA, open cage', value: ssaAll, unit: 'm²/g' },
          { label: 'Wall volume', value: Vw, unit: 'nm³' },
          { label: 'Cavity volume', value: Vi, unit: 'nm³' },
          { label: 'Particle mass', value: am.m, unit: 'g' },
          { label: 'Outer volume-equivalent diameter', value: sd.Dv, unit: 'nm' }
        ];
        ratio = Math.cbrt(Vi / go.V);
        figCaption = 'outside ' + shape.fmtDims(d) + ',  wall ' + f(w, 3) + ' nm';
        const rel = [];
        for (let k = 1; k <= 80; k++) {
          const ww = (w * 4 * k) / 80, di = shape.shrink(d, ww);
          if (!shape.ok(di)) { rel.push([ww, 100]); break; }
          rel.push([ww, (100 * (go.V - shape.V(di))) / go.V]);
        }
        plot = {
          title: 'Mass relative to a solid particle', xlabel: 'Wall thickness w (nm)', ylabel: 'Mass vs. solid (%)', ymin: 0, ymax: 100,
          series: [{ name: 'Hollow particle', mode: 'line', points: rel }, { name: 'This particle', mode: 'markers', color: 1, size: 5, points: [[w, (100 * Vw) / go.V]] }]
        };
      }

      /* ---- size distribution (solid, porous, Janus) ---- */
      const plots = [plot];
      let k2 = 1, k3 = 1;
      if (distAllowed({ struct: struct }) && v.dist && v.dist !== 'mono') {
        const cv = NC.need(v.cv, 'Coefficient of variation', { gt: 0, lt: 100 }) / 100;
        const mainDim = shape.lengthDims[0], d0 = d[mainDim];
        s.heading('Size distribution (' + (v.dist === 'lognormal' ? 'lognormal' : 'normal') + ', CV = ' + NC.fix(cv * 100, 1) + ' %)');
        let mom, sig2 = 0;
        if (v.dist === 'lognormal') {
          sig2 = Math.log(1 + cv * cv);
          mom = function (n) { return Math.exp((n * (n - 1) * sig2) / 2); };
          s.add({ title: 'Moments of the size distribution (k = size / number-mean size)', formula: 'σ² = ln(1 + CV²),   ⟨kⁿ⟩ = exp[n(n − 1)σ²/2]', tex: '\\sigma^2 = \\ln(1 + \\mathrm{CV}^2),\\quad \\langle k^n\\rangle = \\exp\\!\\left[\\dfrac{n(n-1)\\,\\sigma^2}{2}\\right]', sub: 'σ² = ln(1 + ' + f(cv) + '²) = ' + f(sig2, 5), result: '⟨k²⟩ = ' + f(mom(2), 5) + ',  ⟨k³⟩ = ' + f(mom(3), 5) + ',  ⟨k⁴⟩ = ' + f(mom(4), 5), note: 'Lognormal with number-mean equal to the entered size (median = mean·exp(−σ²/2)). Every length of the particle scales with k, so A ∝ k² and V ∝ k³ exactly.', ref: 'limpert2001' });
        } else {
          if (cv > 0.3) warnings.push('A normal distribution with CV above ~30 % puts noticeable weight on negative sizes; a lognormal distribution is more realistic.');
          mom = function (n) { return n === 2 ? 1 + cv * cv : n === 3 ? 1 + 3 * cv * cv : 1 + 6 * cv * cv + 3 * Math.pow(cv, 4); };
          s.add({ title: 'Moments of the size distribution (k = size / mean size)', formula: '⟨k²⟩ = 1 + CV²,   ⟨k³⟩ = 1 + 3CV²,   ⟨k⁴⟩ = 1 + 6CV² + 3CV⁴', tex: '\\langle k^2\\rangle = 1 + \\mathrm{CV}^2,\\quad \\langle k^3\\rangle = 1 + 3\\mathrm{CV}^2,\\quad \\langle k^4\\rangle = 1 + 6\\mathrm{CV}^2 + 3\\mathrm{CV}^4', sub: 'CV = ' + f(cv), result: '⟨k²⟩ = ' + f(mom(2), 5) + ',  ⟨k³⟩ = ' + f(mom(3), 5) + ',  ⟨k⁴⟩ = ' + f(mom(4), 5), note: 'Moments of a normal distribution (truncation at zero size neglected). Every length scales with k, so A ∝ k² and V ∝ k³ exactly.', ref: 'iso9276' });
        }
        k2 = mom(2); k3 = mom(3);
        const k4 = mom(4);
        const D32 = d0 * (k3 / k2), D43 = d0 * (k4 / k3);
        s.add({ title: 'Area- and volume-weighted mean sizes of ' + mainDim, formula: 'D[3,2] = d̄·⟨k³⟩/⟨k²⟩,   D[4,3] = d̄·⟨k⁴⟩/⟨k³⟩', tex: 'D[3,2] = \\bar{d}\\,\\dfrac{\\langle k^3\\rangle}{\\langle k^2\\rangle},\\quad D[4,3] = \\bar{d}\\,\\dfrac{\\langle k^4\\rangle}{\\langle k^3\\rangle}', sub: 'd̄ = ' + f(d0) + ' nm', result: 'D[3,2] = ' + f(D32) + ' nm;   D[4,3] = ' + f(D43) + ' nm', ref: 'iso9276' });
        const ssaEns = ssaExt1 * (k2 / k3) + ssaInt;
        s.add({ title: 'Ensemble specific surface area and mean atoms per particle', formula: 'S_ens = S₁·⟨k²⟩/⟨k³⟩' + (ssaInt ? ' + S_int' : '') + ',   ⟨N⟩ = N₁·⟨k³⟩', tex: 'S_{\\text{ens}} = S_1\\,\\dfrac{\\langle k^2\\rangle}{\\langle k^3\\rangle}' + (ssaInt ? ' + S_{\\text{int}}' : '') + ',\\quad \\langle N\\rangle = N_1\\,\\langle k^3\\rangle', sub: 'S₁ = ' + f(ssaExt1) + ' m²/g,  N₁ = ' + f(atoms1), result: 'S_ens = ' + f(ssaEns) + ' m²/g;   ⟨N⟩ = ' + f(atoms1 * k3), note: 'S₁ and N₁ are for a particle of the mean size. Total area over total mass: larger particles carry most of the mass, so the ensemble SSA is lower than S₁.' });
        // atom-weighted surface fraction: ⟨F(k)·k³⟩ / ⟨k³⟩ by quadrature over the number distribution
        const zs = [], ws = [];
        const nq = 240;
        for (let i = 0; i <= nq; i++) { const z = -6 + (12 * i) / nq; zs.push(z); ws.push(Math.exp(-z * z / 2) * (i === 0 || i === nq ? 1 : i % 2 ? 4 : 2)); }
        let num = 0, den = 0;
        zs.forEach(function (z, i) {
          const k = v.dist === 'lognormal' ? Math.exp(-sig2 / 2 + Math.sqrt(sig2) * z) : 1 + cv * z;
          if (k <= 0) return;
          const kk = k * k * k;
          num += ws[i] * surfFk(k) * kk;
          den += ws[i] * kk;
        });
        const Fens = num / den;
        s.add({ title: 'Ensemble fraction of surface atoms (atom-weighted)', formula: 'F_ens = ⟨F(k)·k³⟩ / ⟨k³⟩   (numerical integration over the distribution)', tex: 'F_{\\text{ens}} = \\dfrac{\\langle F(k)\\,k^3\\rangle}{\\langle k^3\\rangle}', result: 'F_ens = ' + f(Fens, 3) + '  (' + NC.fix(Fens * 100, 1) + ' %)', note: 'Simpson integration over ±6 standard deviations, using the same surface-atom model as above for each size.', ref: 'roduner2006' });
        results.push(
          { label: 'Ensemble SSA', value: ssaEns, unit: 'm²/g', main: true },
          { label: 'Number-mean size', value: d0, unit: 'nm' },
          { label: 'Area-weighted mean D[3,2]', value: D32, unit: 'nm' },
          { label: 'Volume-weighted mean D[4,3]', value: D43, unit: 'nm' },
          { label: 'Mean atoms per particle', value: atoms1 * k3 },
          { label: 'Ensemble surface atoms', value: Fens * 100, unit: '%' }
        );
        const pdf = [];
        const pdfAt = function (x) {
          const k = x / d0;
          if (v.dist === 'lognormal') { const sg = Math.sqrt(sig2), mu = -sig2 / 2; return Math.exp(-Math.pow(Math.log(k) - mu, 2) / (2 * sig2)) / (k * sg * Math.sqrt(2 * PI)) / d0; }
          return Math.exp(-Math.pow(k - 1, 2) / (2 * cv * cv)) / (cv * Math.sqrt(2 * PI)) / d0;
        };
        const xmax = d0 * (1 + 5 * cv);
        for (let i = 1; i <= 200; i++) { const x = (xmax * i) / 200; pdf.push([x, pdfAt(x)]); }
        plots.push({
          title: 'Number distribution of ' + mainDim, xlabel: mainDim + ' (nm)', ylabel: 'Probability density (nm⁻¹)', ymin: 0, xmin: 0,
          series: [{ name: 'Number distribution', mode: 'line', points: pdf }, { name: 'd̄, D[3,2], D[4,3]', mode: 'markers', color: 1, size: 4.5, points: [[d0, pdfAt(d0)], [D32, pdfAt(D32)], [D43, pdfAt(D43)]] }]
        });
      }

      const conc = NC.opt(v.conc, 'Mass concentration', { positive: true });
      if (conc !== null) {
        s.heading('Dispersion concentration');
        if (k3 !== 1) { massTotal *= k3; Aout *= k2; }
        const n = (conc * 1e-6) / massTotal;
        s.add({ title: 'Particle number concentration', formula: 'n = c_mass / m', tex: 'n = \\dfrac{c_{\\text{mass}}}{m}', sub: 'n = ' + f(conc) + ' × 10⁻⁶ g/mL / ' + f(massTotal) + ' g', result: 'n = ' + f(n) + ' particles/mL' });
        const cM = (n * 1000) / C.NA;
        s.add({ title: 'Molar particle concentration', formula: 'c = n × 1000 / N_A', tex: 'c = \\dfrac{n\\times 1000}{N_A}', sub: 'c = ' + f(n) + ' × 1000 / ' + f(C.NA), result: 'c = ' + f(cM * 1e9) + ' nM', ref: 'codata2018' });
        const Atot = n * Aout * 1e-14;
        s.add({ title: 'Total outer surface area per mL', formula: 'A_tot = n·A   (1 nm² = 10⁻¹⁴ cm²)', sub: 'A_tot = ' + f(n) + ' × ' + f(Aout) + ' × 10⁻¹⁴', result: 'A_tot = ' + f(Atot) + ' cm²/mL' });
        results.push({ label: 'Particles per mL', value: n, unit: 'mL⁻¹', main: true }, { label: 'Molar particle conc.', value: cM * 1e9, unit: 'nM' }, { label: 'Surface area per mL', value: Atot, unit: 'cm²/mL' });
      }

      notes.push('All quantities use bulk densities and ideal geometry with sharp edges. Real particles have rounded corners, twin planes and ligand shells.');
      notes.push('For anisotropic shapes, check which dimension a technique reports. TEM gives edge lengths or diameters; DLS gives a hydrodynamic diameter that the volume-equivalent diameter only approximates.');
      return {
        results: results,
        steps: s.items,
        warnings: warnings,
        figures: [{ title: shape.label + ({ coreshell: ', core–shell', hollow: ', hollow', porous: ', porous', janus: ', Janus' }[struct] || '') + ' (schematic, not to scale)', svg: sketch(v.shape, d, struct, ratio, figCaption) }],
        plots: plots,
        notes: notes
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
