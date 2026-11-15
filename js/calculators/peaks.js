/*
 * Spectrum & peak analysis: import raw x–y data (XRD, Raman, UV-vis, XPS),
 * smooth (Savitzky–Golay), subtract a baseline (linear, polynomial, iterative
 * asymmetric polynomial, Shirley), find peaks, and fit them simultaneously
 * (Gaussian / Lorentzian / pseudo-Voigt) by Levenberg–Marquardt with parameter
 * standard errors from the covariance matrix.
 *
 * Numerical helpers are exposed as NC.peaks for testing and reuse.
 */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt;

  NC.addRefs({
    savitzky1964: { type: 'article', authors: 'Savitzky, A.; Golay, M. J. E.', title: 'Smoothing and differentiation of data by simplified least squares procedures', journal: 'Anal. Chem.', year: 1964, volume: '36', pages: '1627–1639', doi: '10.1021/ac60214a047' },
    levenberg1944: { type: 'article', authors: 'Levenberg, K.', title: 'A method for the solution of certain non-linear problems in least squares', journal: 'Q. Appl. Math.', year: 1944, volume: '2', pages: '164–168' },
    marquardt1963: { type: 'article', authors: 'Marquardt, D. W.', title: 'An algorithm for least-squares estimation of nonlinear parameters', journal: 'J. Soc. Ind. Appl. Math.', year: 1963, volume: '11', pages: '431–441', doi: '10.1137/0111030' },
    shirley1972: { type: 'article', authors: 'Shirley, D. A.', title: 'High-resolution X-ray photoemission spectrum of the valence bands of gold', journal: 'Phys. Rev. B', year: 1972, volume: '5', pages: '4709–4714', doi: '10.1103/PhysRevB.5.4709' },
    lieber2003: { type: 'article', authors: 'Lieber, C. A.; Mahadevan-Jansen, A.', title: 'Automated method for subtraction of fluorescence from biological Raman spectra', journal: 'Appl. Spectrosc.', year: 2003, volume: '57', pages: '1363–1367' },
    press2007: { type: 'book', authors: 'Press, W. H.; Teukolsky, S. A.; Vetterling, W. T.; Flannery, B. P.', title: 'Numerical Recipes: The Art of Scientific Computing', edition: '3rd ed.', publisher: 'Cambridge University Press', place: 'Cambridge', year: 2007 }
  });

  const LN2 = Math.LN2;
  const KG = Math.sqrt(Math.PI / (4 * LN2)); // Gaussian area / (h·w) ≈ 1.0645
  const KL = Math.PI / 2; // Lorentzian area / (h·w)

  /* ------------------------------------------------------------------ */
  /* Parsing                                                             */
  /* ------------------------------------------------------------------ */
  function parseSpectrum(text) {
    const pts = [];
    let skipped = 0;
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      const line = raw.replace(/[#%!].*$/, '').trim();
      if (!line) return;
      let parts;
      if (/[;\t]/.test(line)) {
        // with ; or tab as delimiter, a comma inside a number is a decimal comma
        parts = line.split(/[;\t]+/).map(function (s) {
          s = s.trim();
          return /^[-+]?\d+,\d+([eE][-+]?\d+)?$/.test(s) ? s.replace(',', '.') : s;
        });
      } else {
        parts = line.split(/[,\s]+/);
      }
      parts = parts.filter(function (s) { return s !== ''; });
      if (parts.length < 2) { skipped++; return; }
      const x = Number(parts[0]), y = Number(parts[1]);
      if (!isFinite(x) || !isFinite(y)) { skipped++; return; }
      pts.push([x, y]);
    });
    pts.sort(function (a, b) { return a[0] - b[0]; });
    const x = [], y = [];
    let dup = 0;
    pts.forEach(function (p) {
      if (x.length && p[0] === x[x.length - 1]) { dup++; return; }
      x.push(p[0]);
      y.push(p[1]);
    });
    return { x: x, y: y, skipped: skipped, dup: dup };
  }

  /* ------------------------------------------------------------------ */
  /* Linear algebra                                                      */
  /* ------------------------------------------------------------------ */
  /** Solve M·d = b by Gaussian elimination with partial pivoting; null if singular. */
  function solve(M, b) {
    const n = b.length;
    const A = M.map(function (r, i) { return r.slice().concat([b[i]]); });
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (!(Math.abs(A[p][c]) > 1e-300)) return null;
      const tmp = A[c]; A[c] = A[p]; A[p] = tmp;
      for (let r = c + 1; r < n; r++) {
        const fct = A[r][c] / A[c][c];
        if (fct === 0) continue;
        for (let k = c; k <= n; k++) A[r][k] -= fct * A[c][k];
      }
    }
    const d = new Array(n);
    for (let r = n - 1; r >= 0; r--) {
      let s = A[r][n];
      for (let k = r + 1; k < n; k++) s -= A[r][k] * d[k];
      d[r] = s / A[r][r];
      if (!isFinite(d[r])) return null;
    }
    return d;
  }
  /** Matrix inverse (Gauss–Jordan); null if singular. */
  function invert(M) {
    const n = M.length;
    const A = M.map(function (r, i) { const e = new Array(n).fill(0); e[i] = 1; return r.slice().concat(e); });
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (!(Math.abs(A[p][c]) > 1e-300)) return null;
      const tmp = A[c]; A[c] = A[p]; A[p] = tmp;
      const piv = A[c][c];
      for (let k = 0; k < 2 * n; k++) A[c][k] /= piv;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const fct = A[r][c];
        if (fct === 0) continue;
        for (let k = 0; k < 2 * n; k++) A[r][k] -= fct * A[c][k];
      }
    }
    return A.map(function (r) { return r.slice(n); });
  }

  /* ------------------------------------------------------------------ */
  /* Savitzky–Golay                                                      */
  /* ------------------------------------------------------------------ */
  /**
   * Least-squares SG projection for a window of `win` points and polynomial `order`:
   * P = (AᵀA)⁻¹Aᵀ with A_jk = (j − m)^k. Row 0 of P gives the smoothing coefficients
   * for the centre point; at(t) gives coefficients that evaluate the local polynomial
   * at offset t (used near the ends of the data).
   */
  function sgCoeffs(win, order) {
    const m = (win - 1) / 2;
    const A = [];
    for (let j = 0; j < win; j++) {
      const row = [];
      for (let k = 0; k <= order; k++) row.push(Math.pow(j - m, k));
      A.push(row);
    }
    const AtA = [];
    for (let a = 0; a <= order; a++) {
      AtA.push([]);
      for (let b = 0; b <= order; b++) {
        let s = 0;
        for (let j = 0; j < win; j++) s += A[j][a] * A[j][b];
        AtA[a].push(s);
      }
    }
    const inv = invert(AtA);
    if (!inv) NC.fail('Savitzky–Golay coefficients could not be computed for this window and order.');
    const P = [];
    for (let a = 0; a <= order; a++) {
      P.push([]);
      for (let j = 0; j < win; j++) {
        let s = 0;
        for (let b = 0; b <= order; b++) s += inv[a][b] * A[j][b];
        P[a].push(s);
      }
    }
    return {
      center: P[0],
      at: function (t) {
        const c = new Array(win).fill(0);
        for (let a = 0; a <= order; a++) {
          const ta = Math.pow(t, a);
          for (let j = 0; j < win; j++) c[j] += ta * P[a][j];
        }
        return c;
      }
    };
  }
  function sgSmooth(y, win, order) {
    const n = y.length;
    if (n < win) return y.slice();
    const m = (win - 1) / 2;
    const co = sgCoeffs(win, order);
    const out = new Array(n);
    for (let i = m; i < n - m; i++) {
      let s = 0;
      for (let j = 0; j < win; j++) s += co.center[j] * y[i - m + j];
      out[i] = s;
    }
    for (let i = 0; i < m; i++) {
      const cl = co.at(i - m);
      let s = 0;
      for (let j = 0; j < win; j++) s += cl[j] * y[j];
      out[i] = s;
      const cr = co.at(m - i);
      let s2 = 0;
      for (let j = 0; j < win; j++) s2 += cr[j] * y[n - win + j];
      out[n - 1 - i] = s2;
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Baselines                                                           */
  /* ------------------------------------------------------------------ */
  function endAverages(y, navg) {
    const n = y.length;
    let a = 0, b = 0;
    for (let i = 0; i < navg; i++) { a += y[i]; b += y[n - 1 - i]; }
    return { L: a / navg, R: b / navg };
  }
  function linearBaseline(x, y, navg) {
    const n = x.length;
    let xl = 0, xr = 0;
    for (let i = 0; i < navg; i++) { xl += x[i]; xr += x[n - 1 - i]; }
    xl /= navg; xr /= navg;
    const e = endAverages(y, navg);
    const m = (e.R - e.L) / (xr - xl || 1);
    return { B: x.map(function (xi) { return e.L + m * (xi - xl); }), L: e.L, R: e.R, xl: xl, xr: xr, slope: m };
  }
  /** Least-squares polynomial on normalised x; returns evaluator. */
  function polyFit(xs, ys, order, x0, xs0) {
    const k = order + 1;
    const A = [], b = new Array(k).fill(0);
    for (let a = 0; a < k; a++) A.push(new Array(k).fill(0));
    for (let i = 0; i < xs.length; i++) {
      const t = (xs[i] - x0) / xs0;
      const pw = [1];
      for (let a = 1; a < 2 * k; a++) pw.push(pw[a - 1] * t);
      for (let a = 0; a < k; a++) {
        b[a] += pw[a] * ys[i];
        for (let c = 0; c < k; c++) A[a][c] += pw[a + c];
      }
    }
    const co = solve(A, b);
    if (!co) NC.fail('The baseline polynomial could not be fitted. Use a lower order or wider baseline regions.');
    return function (x) {
      const t = (x - x0) / xs0;
      let s = 0;
      for (let a = k - 1; a >= 0; a--) s = s * t + co[a];
      return s;
    };
  }
  function polyBaseline(x, y, order, regions) {
    const x0 = (x[0] + x[x.length - 1]) / 2, xs0 = (x[x.length - 1] - x[0]) / 2 || 1;
    if (regions && regions.length) {
      const xs = [], ys = [];
      x.forEach(function (xi, i) {
        if (regions.some(function (r) { return xi >= Math.min(r[0], r[1]) && xi <= Math.max(r[0], r[1]); })) { xs.push(xi); ys.push(y[i]); }
      });
      if (xs.length < order + 2) NC.fail('The baseline regions contain only ' + xs.length + ' points; at least ' + (order + 2) + ' are needed for order ' + order + '.');
      const p = polyFit(xs, ys, order, x0, xs0);
      return { B: x.map(p), iter: 0, npts: xs.length };
    }
    // iterative asymmetric (modified polyfit): fit, clip the signal to the fit, repeat
    let w = y.slice(), B = null, iter = 0;
    for (iter = 1; iter <= 100; iter++) {
      const p = polyFit(x, w, order, x0, xs0);
      const Bn = x.map(p);
      let change = 0, scale = 0;
      for (let i = 0; i < x.length; i++) {
        const nw = Math.min(w[i], Bn[i]);
        change = Math.max(change, Math.abs(nw - w[i]));
        scale = Math.max(scale, Math.abs(y[i]));
        w[i] = nw;
      }
      B = Bn;
      if (change <= 1e-6 * (scale || 1)) break;
    }
    return { B: B, iter: Math.min(iter, 100), npts: x.length };
  }
  /**
   * Shirley background (x ascending): B(x) = I_L + (I_R − I_L)·Q(x)/Q(x_R),
   * Q(x) = ∫ from x_L to x of max(y − B, 0). Iterated to self-consistency.
   */
  function shirley(x, y, opt) {
    opt = opt || {};
    const n = x.length;
    const navg = opt.navg || Math.max(1, Math.min(5, Math.round(n * 0.01)));
    const e = endAverages(y, navg);
    let B = new Array(n).fill(e.L), iter = 0;
    const range = Math.max.apply(null, y) - Math.min.apply(null, y) || 1;
    for (iter = 1; iter <= 100; iter++) {
      const Q = new Array(n).fill(0);
      for (let i = 1; i < n; i++) {
        const a = Math.max(0, y[i - 1] - B[i - 1]), b = Math.max(0, y[i] - B[i]);
        Q[i] = Q[i - 1] + 0.5 * (a + b) * (x[i] - x[i - 1]);
      }
      const Qt = Q[n - 1];
      const Bn = Qt > 0 ? Q.map(function (q) { return e.L + (e.R - e.L) * (q / Qt); }) : x.map(function (xi) { return e.L + ((e.R - e.L) * (xi - x[0])) / (x[n - 1] - x[0] || 1); });
      let change = 0;
      for (let i = 0; i < n; i++) change = Math.max(change, Math.abs(Bn[i] - B[i]));
      B = Bn;
      if (change < 1e-7 * range) break;
    }
    return { B: B, L: e.L, R: e.R, iter: Math.min(iter, 100) };
  }

  /* ------------------------------------------------------------------ */
  /* Peak profiles                                                       */
  /* ------------------------------------------------------------------ */
  function gauss(x, c, h, w) { const u = (x - c) / w; return h * Math.exp(-4 * LN2 * u * u); }
  function lorentz(x, c, h, w) { const u = (x - c) / w; return h / (1 + 4 * u * u); }
  function npp(type) { return type === 'pv' ? 4 : 3; }
  /**
   * One peak component evaluated on x (inlined for speed: this is the inner loop of the fit).
   * The Gaussian term is skipped where |x − c| > 6·w, where it is below e⁻¹⁰⁰ of the height.
   */
  function compArr(type, x, q) {
    const n = x.length, out = new Float64Array(n);
    const c = q[0], h = q[1], w = q[2];
    const a = (4 * LN2) / (w * w), b = 4 / (w * w), cut = 36 * w * w;
    if (type === 'gauss') {
      for (let i = 0; i < n; i++) { const d = x[i] - c, d2 = d * d; out[i] = d2 > cut ? 0 : h * Math.exp(-a * d2); }
    } else if (type === 'lorentz') {
      for (let i = 0; i < n; i++) { const d = x[i] - c; out[i] = h / (1 + b * d * d); }
    } else {
      const eta = q[3], hl = eta * h, hg = (1 - eta) * h;
      for (let i = 0; i < n; i++) {
        const d = x[i] - c, d2 = d * d;
        out[i] = hl / (1 + b * d2) + (d2 > cut ? 0 : hg * Math.exp(-a * d2));
      }
    }
    return out;
  }
  function areaOf(type, h, w, eta) {
    if (type === 'gauss') return KG * h * w;
    if (type === 'lorentz') return KL * h * w;
    return h * w * (eta * KL + (1 - eta) * KG);
  }
  /** Gradient of the area with respect to (c, h, w[, η]) for error propagation. */
  function areaGrad(type, h, w, eta) {
    const K = type === 'gauss' ? KG : type === 'lorentz' ? KL : eta * KL + (1 - eta) * KG;
    const g = [0, w * K, h * K];
    if (type === 'pv') g.push(h * w * (KL - KG));
    return g;
  }

  /* ------------------------------------------------------------------ */
  /* Levenberg–Marquardt                                                 */
  /* ------------------------------------------------------------------ */
  /**
   * Minimise Σ(y − model(p))². model(p) → array; opt.jac(p, m) → array of k columns
   * (numeric forward differences by default); opt.constrain(p) → p (clamping).
   * Marquardt damping: (JᵀJ + λ·diag(JᵀJ))·δ = Jᵀr.
   */
  function lm(model, p0, y, opt) {
    opt = opt || {};
    const n = y.length, k = p0.length;
    const constrain = opt.constrain || function (p) { return p; };
    const ssr = function (m) { let s = 0; for (let i = 0; i < n; i++) { const r = y[i] - m[i]; s += r * r; } return s; };
    const jac = opt.jac || function (p, m) {
      const cols = [];
      for (let j = 0; j < k; j++) {
        const hstep = 1e-7 * (Math.abs(p[j]) + (opt.scale ? opt.scale[j] : 1));
        const pp = p.slice(); pp[j] += hstep;
        const mp = model(pp);
        const col = new Float64Array(n);
        for (let i = 0; i < n; i++) col[i] = (mp[i] - m[i]) / hstep;
        cols.push(col);
      }
      return cols;
    };
    const normal = function (J, r) {
      const A = [], g = new Array(k).fill(0);
      for (let a = 0; a < k; a++) {
        A.push(new Array(k).fill(0));
        const Ja = J[a];
        let s = 0;
        for (let i = 0; i < n; i++) s += Ja[i] * r[i];
        g[a] = s;
        for (let b = 0; b <= a; b++) {
          const Jb = J[b];
          let t = 0;
          for (let i = 0; i < n; i++) t += Ja[i] * Jb[i];
          A[a][b] = t;
        }
      }
      for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) A[a][b] = A[b][a];
      return { A: A, g: g };
    };
    let p = constrain(p0.slice());
    let m = model(p), S = ssr(m);
    let lam = opt.lambda0 || 1e-3, it = 0, converged = false, stall = 0;
    const maxIt = opt.maxIter || 200, tol = opt.tol || 1e-10;
    for (it = 1; it <= maxIt && !converged; it++) {
      const J = jac(p, m);
      const r = new Float64Array(n);
      for (let i = 0; i < n; i++) r[i] = y[i] - m[i];
      const ne = normal(J, r);
      for (;;) {
        const M = ne.A.map(function (row, a) { return row.map(function (v, b) { return a === b ? v * (1 + lam) + 1e-300 : v; }); });
        const d = solve(M, ne.g);
        if (!d) { lam *= 10; if (lam > 1e16) { converged = true; break; } continue; }
        const pn = constrain(p.map(function (v, a) { return v + d[a]; }));
        const mn = model(pn);
        const Sn = ssr(mn);
        if (Sn <= S) {
          const rel = (S - Sn) / (S || 1);
          let step = 0;
          for (let a = 0; a < k; a++) step = Math.max(step, Math.abs(pn[a] - p[a]) / (Math.abs(p[a]) + 1e-12));
          p = pn; m = mn; S = Sn;
          lam = Math.max(lam / 10, 1e-15);
          // stop when converged, or when 5 accepted steps in a row improve χ² by < 1e-9 (stalled on a model mismatch)
          stall = rel < 1e-9 ? stall + 1 : 0;
          if (S === 0 || rel < 1e-14 || (rel < tol && step < 1e-6) || stall >= 5) converged = true;
          break;
        }
        lam *= 10;
        if (lam > 1e16) { converged = true; break; }
      }
    }
    const J = jac(p, m);
    const ne = normal(J, new Float64Array(n));
    const dof = Math.max(1, n - k);
    const s2 = S / dof;
    const inv = invert(ne.A);
    const cov = inv ? inv.map(function (row) { return row.map(function (v) { return v * s2; }); }) : null;
    const se = cov ? cov.map(function (row, a) { return Math.sqrt(Math.max(0, row[a])); }) : new Array(k).fill(NaN);
    return { p: p, S: S, s2: s2, iter: it - 1, lambda: lam, converged: converged, se: se, cov: cov, model: m };
  }

  /* ------------------------------------------------------------------ */
  /* Peak detection                                                      */
  /* ------------------------------------------------------------------ */
  function detectPeaks(x, s, promFrac, maxPeaks) {
    const n = s.length;
    let smax = -Infinity, smin = Infinity;
    for (let i = 0; i < n; i++) { if (s[i] > smax) smax = s[i]; if (s[i] < smin) smin = s[i]; }
    const span = smax - smin || 1;
    const half = Math.max(2, Math.round(n / 500));
    const found = [];
    for (let i = 1; i < n - 1; i++) {
      let isMax = true;
      for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
        if (s[j] > s[i] || (s[j] === s[i] && j < i)) { isMax = false; break; }
      }
      if (!isMax) continue;
      // topographic prominence
      let lmin = s[i], j = i - 1;
      while (j >= 0 && s[j] <= s[i]) { if (s[j] < lmin) lmin = s[j]; j--; }
      let rmin = s[i];
      j = i + 1;
      while (j < n && s[j] <= s[i]) { if (s[j] < rmin) rmin = s[j]; j++; }
      const prom = s[i] - Math.max(lmin, rmin);
      if (prom >= promFrac * span) found.push({ i: i, prom: prom });
    }
    found.sort(function (a, b) { return b.prom - a.prom; });
    return found.slice(0, maxPeaks).sort(function (a, b) { return a.i - b.i; });
  }
  function fwhmEstimate(x, s, i) {
    const h = s[i], half = h / 2;
    let l = i, r = i;
    while (l > 0 && s[l] > half) l--;
    while (r < s.length - 1 && s[r] > half) r++;
    const interp = function (a, b) { return s[a] === s[b] ? x[a] : x[a] + ((half - s[a]) * (x[b] - x[a])) / (s[b] - s[a]); };
    const xl = s[l] <= half ? interp(l, l + 1) : x[l];
    const xr = s[r] <= half ? interp(r - 1, r) : x[r];
    return xr - xl;
  }

  /* ------------------------------------------------------------------ */
  /* Multi-peak fit                                                      */
  /* ------------------------------------------------------------------ */
  function fitPeaks(x, y, init, type, opts) {
    opts = opts || {};
    const P = npp(type), K = init.length;
    const n = x.length;
    const dx = (x[n - 1] - x[0]) / (n - 1);
    const range = x[n - 1] - x[0];
    let ymax = 0;
    for (let i = 0; i < n; i++) ymax = Math.max(ymax, Math.abs(y[i]));
    const p0 = [];
    init.forEach(function (q) { p0.push(q.c, q.h, q.w); if (P === 4) p0.push(q.eta === undefined ? 0.5 : q.eta); });
    const constrain = function (p) {
      const out = p.slice();
      for (let k = 0; k < K; k++) {
        const o = k * P;
        out[o] = Math.min(x[n - 1], Math.max(x[0], out[o]));
        out[o + 1] = Math.max(1e-12 * (ymax || 1), out[o + 1]);
        out[o + 2] = Math.min(range, Math.max(0.5 * dx, out[o + 2]));
        if (P === 4) out[o + 3] = Math.min(1, Math.max(0, out[o + 3]));
      }
      return out;
    };
    let comps = null, compsP = null;
    const model = function (p) {
      const m = new Float64Array(n);
      const cs = [];
      for (let k = 0; k < K; k++) {
        const c = compArr(type, x, p.slice(k * P, k * P + P));
        cs.push(c);
        for (let i = 0; i < n; i++) m[i] += c[i];
      }
      comps = cs; compsP = p;
      return m;
    };
    // numeric Jacobian, one peak component at a time (other peaks do not depend on its parameters)
    const jac = function (p) {
      if (compsP !== p) model(p);
      const base = comps;
      const scale = [range * 1e-3, ymax || 1, dx, 1];
      const cols = [];
      for (let k = 0; k < K; k++) {
        const q = p.slice(k * P, k * P + P);
        for (let j = 0; j < P; j++) {
          const hstep = 1e-6 * (Math.abs(q[j]) + scale[j]);
          const qq = q.slice();
          if (j === 3 && qq[3] + hstep > 1) qq[3] -= hstep; else qq[j] += hstep;
          const sgn = qq[j] > q[j] ? 1 : -1;
          const cp = compArr(type, x, qq);
          const col = new Float64Array(n);
          for (let i = 0; i < n; i++) col[i] = (sgn * (cp[i] - base[k][i])) / hstep;
          cols.push(col);
        }
      }
      return cols;
    };
    const r = lm(model, p0, y, { jac: jac, constrain: constrain, maxIter: opts.maxIter || 300, tol: 1e-10 });
    model(r.p);
    const peaks = [];
    for (let k = 0; k < K; k++) {
      const o = k * P;
      const c = r.p[o], h = r.p[o + 1], w = r.p[o + 2], eta = P === 4 ? r.p[o + 3] : type === 'lorentz' ? 1 : 0;
      const g = areaGrad(type, h, w, eta);
      let varA = NaN;
      if (r.cov) {
        varA = 0;
        for (let a = 0; a < P; a++) for (let b = 0; b < P; b++) varA += g[a] * g[b] * r.cov[o + a][o + b];
      }
      peaks.push({
        c: c, h: h, w: w, eta: eta, area: areaOf(type, h, w, eta),
        seC: r.se[o], seH: r.se[o + 1], seW: r.se[o + 2], seEta: P === 4 ? r.se[o + 3] : 0, seArea: Math.sqrt(Math.max(0, varA)),
        comp: comps[k]
      });
    }
    let mean = 0;
    for (let i = 0; i < n; i++) mean += y[i];
    mean /= n;
    let sst = 0;
    for (let i = 0; i < n; i++) sst += (y[i] - mean) * (y[i] - mean);
    return { peaks: peaks, r2: sst > 0 ? 1 - r.S / sst : 1, lm: r, fitted: r.model };
  }

  NC.peaks = { parseSpectrum: parseSpectrum, sgCoeffs: sgCoeffs, sgSmooth: sgSmooth, shirley: shirley, linearBaseline: linearBaseline, polyBaseline: polyBaseline, lm: lm, detectPeaks: detectPeaks, fitPeaks: fitPeaks, areaOf: areaOf, solve: solve, invert: invert };

  /* ------------------------------------------------------------------ */
  /* Calculator                                                          */
  /* ------------------------------------------------------------------ */
  const TECH = {
    xrd: { x: '2θ (°)', name: 'XRD pattern', pos: '2θ' },
    raman: { x: 'Raman shift (cm⁻¹)', name: 'Raman spectrum', pos: 'Raman shift' },
    uvvis: { x: 'Wavelength (nm)', name: 'UV-vis spectrum', pos: 'Wavelength' },
    xps: { x: 'Binding energy (eV)', name: 'XPS spectrum', pos: 'Binding energy' },
    generic: { x: 'x', name: 'Spectrum', pos: 'Position' }
  };
  const MODEL_LABEL = { gauss: 'Gaussian', lorentz: 'Lorentzian', pv: 'pseudo-Voigt' };

  function exampleSpectrum() {
    const rand = NC.rng(20261115);
    const peaks = [[38.18, 1000, 0.56, 0.4], [44.39, 460, 0.6, 0.4], [64.58, 270, 0.68, 0.45], [77.55, 290, 0.74, 0.45], [81.72, 85, 0.78, 0.5]];
    const lines = ['# 2theta (deg), intensity (counts) - synthetic Au pattern'];
    for (let i = 0; i <= 3000; i++) {
      const x = 30 + i * 0.02;
      let y = 60 + 0.4 * (x - 30);
      peaks.forEach(function (p) { y += p[3] * lorentz(x, p[0], p[1], p[2]) + (1 - p[3]) * gauss(x, p[0], p[1], p[2]); });
      y += 4 * NC.randn(rand);
      lines.push(x.toFixed(2) + ', ' + y.toFixed(2));
    }
    return lines.join('\n');
  }

  NC.register({
    id: 'peakfit',
    category: 'data',
    title: 'Spectrum import & peak fitting',
    short: 'Import XRD, Raman, UV-vis or XPS data, subtract a baseline, fit peaks (with uncertainties)',
    description:
      'Paste or upload a two-column spectrum (x, y). NanoCalc can smooth it (Savitzky–Golay) and subtract a linear, polynomial or Shirley baseline. It then finds the peaks and fits them all together with Gaussian, Lorentzian or pseudo-Voigt profiles by Levenberg–Marquardt. You get positions, widths (FWHM) and areas with standard errors, plus tables ready to paste into the Scherrer, Williamson–Hall and XPS calculators.',
    refs: ['savitzky1964', 'shirley1972', 'lieber2003', 'levenberg1944', 'marquardt1963', 'press2007'],
    inputs: [
      NC.sel('tech', 'Technique', [['xrd', 'XRD (2θ, °)'], ['raman', 'Raman (shift, cm⁻¹)'], ['uvvis', 'UV-vis (wavelength, nm)'], ['xps', 'XPS (binding energy, eV)'], ['generic', 'Generic (x, y)']], 'xrd'),
      NC.data('data', 'Spectrum: x, y (two columns)', '', { rows: 8, placeholder: '38.10, 512\n38.12, 530\n…\nComma, tab, semicolon or space separated; header and # comment lines are skipped.' }),
      NC.num('xmin', 'Analyse from x (optional)', '', NaN),
      NC.num('xmax', 'Analyse to x (optional)', '', NaN),
      NC.sel('smooth', 'Smoothing', [['none', 'None'], ['sg', 'Savitzky–Golay']], 'none'),
      NC.num('sgw', 'SG window (odd number of points)', '', 7, { showIf: function (v) { return v.smooth === 'sg'; } }),
      NC.num('sgp', 'SG polynomial order', '', 2, { showIf: function (v) { return v.smooth === 'sg'; } }),
      NC.sel('base', 'Baseline', [['none', 'None'], ['linear', 'Linear between the end points'], ['poly', 'Polynomial'], ['shirley', 'Shirley (XPS)']], 'linear'),
      NC.num('bpo', 'Baseline polynomial order', '', 2, { showIf: function (v) { return v.base === 'poly'; } }),
      NC.data('breg', 'Baseline regions (optional): from, to per line', '', { rows: 2, showIf: function (v) { return v.base === 'poly'; }, help: 'Leave empty for automatic iterative (asymmetric) fitting that ignores the peaks.' }),
      NC.sel('detect', 'Peak positions', [['auto', 'Find automatically'], ['manual', 'I will list approximate positions']], 'auto'),
      NC.num('prom', 'Minimum peak prominence', '% of max', 5, { showIf: function (v) { return v.detect === 'auto'; } }),
      NC.num('maxp', 'Maximum number of peaks (≤ 10)', '', 6, { showIf: function (v) { return v.detect === 'auto'; } }),
      NC.data('pos', 'Approximate peak positions', '', { rows: 2, showIf: function (v) { return v.detect === 'manual'; }, placeholder: '38.2, 44.4, 64.6' }),
      NC.sel('model', 'Peak shape', [['pv', 'Pseudo-Voigt (η fitted per peak)'], ['gauss', 'Gaussian'], ['lorentz', 'Lorentzian']], 'pv')
    ],
    presets: [
      { label: 'XRD pattern', values: { tech: 'xrd', smooth: 'none', base: 'linear', detect: 'auto', model: 'pv' } },
      { label: 'Raman with fluorescence background', values: { tech: 'raman', smooth: 'sg', sgw: 9, sgp: 2, base: 'poly', bpo: 3, model: 'lorentz' } },
      { label: 'XPS core level', values: { tech: 'xps', smooth: 'none', base: 'shirley', model: 'pv' } },
      { label: 'UV-vis absorption band', values: { tech: 'uvvis', smooth: 'none', base: 'linear', model: 'gauss' } }
    ],
    presetNote: 'Presets only set the processing options. Paste or upload your own data, or use "Load example" for a synthetic gold XRD pattern.',
    example: function () {
      return { tech: 'xrd', data: exampleSpectrum(), smooth: 'none', base: 'linear', detect: 'auto', prom: 3, maxp: 6, model: 'pv' };
    },
    compute: function (v) {
      const s = new NC.Steps();
      const T = TECH[v.tech] || TECH.generic;
      const type = v.model === 'gauss' || v.model === 'lorentz' ? v.model : 'pv';
      const parsed = parseSpectrum(v.data);
      if (parsed.x.length < 10) NC.fail('Paste or upload a spectrum with at least 10 numeric x, y rows (found ' + parsed.x.length + ').');
      let x = parsed.x, y = parsed.y;
      const warnings = [], notes = [];
      s.heading('1 · Data');
      s.add({ title: 'Import', formula: 'Two numeric columns (x, y), sorted by x', result: x.length + ' points, x from ' + f(x[0], 6) + ' to ' + f(x[x.length - 1], 6) + (parsed.skipped ? '; ' + parsed.skipped + ' non-numeric line(s) skipped' : '') + (parsed.dup ? '; ' + parsed.dup + ' duplicate x value(s) removed' : '') });
      const xmin = NC.opt(v.xmin, 'Analyse from x'), xmax = NC.opt(v.xmax, 'Analyse to x');
      if (xmin !== null || xmax !== null) {
        const lo = xmin === null ? -Infinity : xmin, hi = xmax === null ? Infinity : xmax;
        if (!(hi > lo)) NC.fail('"Analyse to x" must be larger than "Analyse from x".');
        const xs = [], ys = [];
        x.forEach(function (xi, i) { if (xi >= lo && xi <= hi) { xs.push(xi); ys.push(y[i]); } });
        if (xs.length < 10) NC.fail('Only ' + xs.length + ' points lie in the chosen x range; at least 10 are needed.');
        x = xs; y = ys;
        s.add({ title: 'Range selection', formula: 'x_min ≤ x ≤ x_max', sub: 'x_min = ' + (xmin === null ? '—' : f(xmin, 6)) + ',  x_max = ' + (xmax === null ? '—' : f(xmax, 6)), result: x.length + ' points kept' });
      }
      const n = x.length;
      const dx = (x[n - 1] - x[0]) / (n - 1);
      let maxDev = 0;
      for (let i = 1; i < n; i++) maxDev = Math.max(maxDev, Math.abs(x[i] - x[i - 1] - dx));
      const uniform = maxDev <= 0.05 * Math.abs(dx);

      /* ---- smoothing ---- */
      let ys = y.slice();
      if (v.smooth === 'sg') {
        const win = NC.need(v.sgw, 'SG window', { int: true, min: 3 });
        const ord = NC.need(v.sgp, 'SG polynomial order', { int: true, min: 0 });
        if (win % 2 === 0) NC.fail('The Savitzky–Golay window must be an odd number of points.');
        if (ord >= win) NC.fail('The polynomial order must be smaller than the window.');
        if (win > n) NC.fail('The window is longer than the data.');
        const co = sgCoeffs(win, ord);
        ys = sgSmooth(y, win, ord);
        if (!uniform) warnings.push('The x spacing is not uniform (deviation up to ' + f(maxDev, 3) + '). Savitzky–Golay assumes equal spacing.');
        s.heading('2 · Smoothing');
        s.add({
          title: 'Savitzky–Golay smoothing (' + win + '-point window, order ' + ord + ')',
          formula: 'ỹ_i = Σ c_j·y_(i+j),  c = first row of (AᵀA)⁻¹Aᵀ,  A_jk = j^k  (j = −m … m)',
          tex: String.raw`\tilde{y}_i = \sum_{j=-m}^{m} c_j\, y_{i+j},\qquad \mathbf{c} = \text{row}_0\!\left[(A^{\mathsf T}A)^{-1}A^{\mathsf T}\right],\quad A_{jk} = j^{k}`,
          sub: 'c = [' + co.center.map(function (c) { return f(c, 4); }).join(', ') + ']',
          result: 'Smoothed signal used for baseline estimation, peak detection and the plot',
          note: 'The first and last m points use the same local polynomial evaluated off-centre. The fit itself uses the unsmoothed data, so smoothing cannot broaden the fitted peaks.',
          ref: 'savitzky1964'
        });
      }

      /* ---- baseline ---- */
      s.heading('3 · Baseline');
      const navg = Math.max(1, Math.min(10, Math.round(n * 0.01)));
      let B;
      if (v.base === 'linear') {
        const lb = linearBaseline(x, ys, navg);
        B = lb.B;
        s.add({ title: 'Linear baseline through the two ends', formula: 'B(x) = I_L + (I_R − I_L)·(x − x_L)/(x_R − x_L)', tex: String.raw`B(x) = I_L + (I_R - I_L)\,\dfrac{x - x_L}{x_R - x_L}`, sub: 'I_L = ' + f(lb.L) + ' (mean of first ' + navg + ' points),  I_R = ' + f(lb.R) + ' (last ' + navg + ')', result: 'slope = ' + f(lb.slope) + ' per x unit' });
      } else if (v.base === 'poly') {
        const ord = NC.need(v.bpo, 'Baseline polynomial order', { int: true, min: 0, max: 8 });
        const regs = String(v.breg || '').trim() ? NC.parseRows(v.breg, { min: 2, max: 2, labels: ['from', 'to'], name: 'Baseline regions' }) : [];
        const pb = polyBaseline(x, ys, ord, regs);
        B = pb.B;
        if (regs.length) {
          s.add({ title: 'Polynomial baseline fitted to the baseline regions', formula: 'B(x) = Σ a_k·x^k,  least squares over the listed regions', tex: String.raw`B(x) = \sum_{k=0}^{n} a_k\, x^{k}`, sub: 'order ' + ord + ', ' + regs.length + ' region(s), ' + pb.npts + ' points', result: 'Baseline evaluated over the whole range' });
        } else {
          s.add({ title: 'Iterative asymmetric polynomial baseline', formula: 'Fit B to y; replace y by min(y, B); repeat until stable', tex: String.raw`y^{(k+1)} = \min\!\left(y^{(k)},\, B^{(k)}\right),\quad B^{(k)} = \text{poly}_n\!\left(y^{(k)}\right)`, sub: 'order ' + ord, result: 'converged after ' + pb.iter + ' iteration(s)', note: 'Peaks are progressively clipped, so the polynomial settles under them (modified polyfit, widely used for fluorescence backgrounds in Raman).', ref: 'lieber2003' });
        }
      } else if (v.base === 'shirley') {
        const sh = shirley(x, ys, { navg: navg });
        B = sh.B;
        s.add({ title: 'Shirley background (iterative)', formula: 'B(x) = I_L + (I_R − I_L)·Q(x)/Q(x_R),   Q(x) = ∫ from x_L to x of [y − B] dx′', tex: String.raw`B(x) = I_L + (I_R - I_L)\,\dfrac{\int_{x_L}^{x}\left[y - B\right]dx'}{\int_{x_L}^{x_R}\left[y - B\right]dx'}`, sub: 'I_L = ' + f(sh.L) + ',  I_R = ' + f(sh.R) + ' (means of ' + navg + ' end points)', result: 'self-consistent after ' + sh.iter + ' iteration(s)', note: 'The background rises in proportion to the peak area already passed (inelastic losses). x is in ascending binding energy.', ref: 'shirley1972' });
        if (v.tech !== 'xps') notes.push('The Shirley background is designed for XPS core-level spectra.');
      } else {
        B = new Array(n).fill(0);
        s.add({ title: 'No baseline subtracted', formula: 'B(x) = 0', result: 'Peaks are fitted to the raw intensities' });
      }
      const yc = y.map(function (yi, i) { return yi - B[i]; });
      const sc = ys.map(function (yi, i) { return yi - B[i]; });

      /* ---- peak detection ---- */
      s.heading('4 · Peak detection');
      let init = [];
      if (v.detect === 'manual') {
        const list = NC.parseList(v.pos, 'Peak positions');
        if (!list.length) NC.fail('List at least one approximate peak position.');
        if (list.length > 10) NC.fail('At most 10 peaks can be fitted at once.');
        list.forEach(function (c) {
          if (c < x[0] || c > x[n - 1]) NC.fail('Peak position ' + c + ' lies outside the analysed range.');
          let i = 0;
          for (let j = 1; j < n; j++) if (Math.abs(x[j] - c) < Math.abs(x[i] - c)) i = j;
          init.push({ c: x[i], h: Math.max(sc[i], 1e-9), w: fwhmEstimate(x, sc, i) });
        });
        s.add({ title: 'Starting positions (listed)', formula: 'Height from the baseline-corrected signal; FWHM from the half-maximum crossings', result: init.map(function (q) { return f(q.c, 6); }).join(', ') });
      } else {
        const prom = NC.need(v.prom, 'Minimum prominence', { min: 0, max: 100 });
        const maxp = NC.need(v.maxp, 'Maximum number of peaks', { int: true, min: 1, max: 10 });
        const det = v.smooth === 'sg' ? sc : (n >= 7 ? sgSmooth(sc, 7, 2) : sc);
        const found = detectPeaks(x, det, prom / 100, maxp);
        if (!found.length) NC.fail('No peaks were found above ' + prom + ' % prominence. Lower the threshold or list positions manually.');
        init = found.map(function (p) { return { c: x[p.i], h: Math.max(sc[p.i], 1e-9), w: fwhmEstimate(x, det, p.i) }; });
        s.add({ title: 'Local maxima above the prominence threshold', formula: 'prominence = height − higher of the two flanking minima ≥ ' + f(prom) + ' % of the signal range', result: init.length + ' peak(s) at ' + init.map(function (q) { return f(q.c, 6); }).join(', '), note: 'Detection runs on a lightly smoothed copy (7-point Savitzky–Golay) when no smoothing is selected. The fit uses the original data.' });
      }
      init.forEach(function (q) {
        if (!(q.w > 0) || !isFinite(q.w)) q.w = 5 * dx;
        q.w = Math.min(Math.max(q.w, 2 * Math.abs(dx)), (x[n - 1] - x[0]) / 2);
      });

      /* ---- model and fit ---- */
      s.heading('5 · Peak model and fit');
      s.add({
        title: 'Peak profile: ' + MODEL_LABEL[type] + ' (centre c, height h, FWHM w)',
        formula: type === 'gauss' ? 'G(x) = h·exp[−4 ln2·(x − c)²/w²]' : type === 'lorentz' ? 'L(x) = h / [1 + 4(x − c)²/w²]' : 'pV(x) = η·L(x) + (1 − η)·G(x),  same c, h, w',
        tex: type === 'gauss' ? String.raw`G(x) = h\,\exp\!\left[-4\ln 2\,\dfrac{(x-c)^2}{w^2}\right]`
          : type === 'lorentz' ? String.raw`L(x) = \dfrac{h}{1 + 4\,(x-c)^2/w^2}`
            : String.raw`pV(x) = \eta\,\dfrac{h}{1 + 4\,(x-c)^2/w^2} + (1-\eta)\,h\,\exp\!\left[-4\ln 2\,\dfrac{(x-c)^2}{w^2}\right]`,
        note: 'All peaks are fitted at the same time to the baseline-corrected data: y − B = Σ peaks.',
        ref: 'press2007'
      });
      const t0 = Date.now();
      const fit = fitPeaks(x, yc, init, type);
      const ms = Date.now() - t0;
      const P = npp(type);
      s.add({
        title: 'Levenberg–Marquardt least squares',
        formula: '(JᵀJ + λ·diag(JᵀJ))·δ = Jᵀr,   r = y − B − Σ peaks;  λ decreases after a successful step and increases after a failed one',
        tex: String.raw`\left(J^{\mathsf T}J + \lambda\,\operatorname{diag}(J^{\mathsf T}J)\right)\boldsymbol{\delta} = J^{\mathsf T}\mathbf{r},\qquad \mathbf{r} = \mathbf{y} - \mathbf{B} - \sum \text{peaks}`,
        sub: init.length * P + ' parameters, ' + n + ' points;  Jacobian by forward differences',
        result: fit.lm.iter + ' iterations, χ² = Σr² = ' + f(fit.lm.S) + (fit.lm.converged ? '' : ' (iteration limit reached)'),
        ref: ['levenberg1944', 'marquardt1963']
      });
      s.add({ title: 'Parameter standard errors', formula: 'cov = s²·(JᵀJ)⁻¹,   s² = χ²/(n − k)', tex: String.raw`\operatorname{cov}(\mathbf{p}) = s^2\,(J^{\mathsf T}J)^{-1},\qquad s^2 = \dfrac{\chi^2}{n - k}`, sub: 's² = ' + f(fit.lm.S) + ' / (' + n + ' − ' + init.length * P + ')', result: 's² = ' + f(fit.lm.s2) + ';  SE = √(diagonal)', note: 'Standard errors assume independent, equal-variance noise and a correct peak model. Correlated parameters (overlapping peaks) are reported with their full uncertainty.', ref: 'press2007' });
      const p0 = fit.peaks[0];
      s.add({
        title: 'Integrated peak areas',
        formula: 'A_G = h·w·√(π/(4 ln2)),  A_L = π·h·w/2,  A_pV = η·A_L + (1 − η)·A_G',
        tex: String.raw`A_G = h\,w\sqrt{\dfrac{\pi}{4\ln 2}},\qquad A_L = \dfrac{\pi h w}{2},\qquad A_{pV} = \eta A_L + (1-\eta)A_G`,
        sub: 'Peak 1: h = ' + f(p0.h) + ', w = ' + f(p0.w) + (type === 'pv' ? ', η = ' + f(p0.eta, 3) : ''),
        result: 'A₁ = ' + f(p0.area) + ' ± ' + f(p0.seArea, 2),
        note: 'Area uncertainties propagate the full covariance of h, w and η.'
      });
      s.add({ title: 'Goodness of fit', formula: 'R² = 1 − χ²/Σ(y − ȳ)²  (baseline-corrected data)', tex: String.raw`R^2 = 1 - \dfrac{\chi^2}{\sum (y_i - \bar{y})^2}`, result: 'R² = ' + f(fit.r2, 6) });

      if (fit.r2 < 0.98) warnings.push('R² = ' + f(fit.r2, 4) + '. The model does not describe the data well. Check the baseline, the number of peaks and the peak shape (residual plot).');
      if (!fit.lm.converged) warnings.push('The fit stopped at the iteration limit. Results may not be fully converged.');
      fit.peaks.forEach(function (p, k) {
        if (p.c - p.w < x[0] || p.c + p.w > x[n - 1]) warnings.push('Peak ' + (k + 1) + ' at ' + f(p.c, 6) + ' is within one FWHM of the range edge, so its width and area are less reliable.');
        if (p.seW > 0.5 * p.w) warnings.push('Peak ' + (k + 1) + ': the FWHM uncertainty is more than half its value (weak or strongly overlapping peak).');
      });

      /* ---- outputs ---- */
      const dec = Math.max(2, Math.min(6, Math.ceil(-Math.log10(Math.abs(dx) || 1)) + 2));
      const peakRows = fit.peaks.map(function (p, k) {
        return [String(k + 1), p.c.toFixed(dec), f(p.seC, 2), f(p.w, 4), f(p.seW, 2), f(p.h, 4), f(p.area, 4), f(p.seArea, 2), type === 'pv' ? p.eta.toFixed(3) : type === 'lorentz' ? '1' : '0'];
      });
      const tables = [{ title: 'Fitted peaks (' + MODEL_LABEL[type] + ')', columns: ['#', T.pos, '± SE', 'FWHM', '± SE', 'Height', 'Area', '± SE', 'η'], rows: peakRows }];
      if (v.tech === 'xps') {
        tables.push({ title: 'Ready to paste: XPS quantification (label, area, RSF)', columns: ['Copy these lines (replace RSF 1 with your sensitivity factor)'], rows: fit.peaks.map(function (p, k) { return ['Peak ' + (k + 1) + ' (' + p.c.toFixed(2) + ' eV), ' + String(Number(p.area.toPrecision(6))) + ', 1']; }) });
      } else {
        tables.push({
          title: v.tech === 'xrd' ? 'Ready to paste: Scherrer / Williamson–Hall (2θ, FWHM)' : 'Ready to paste: position, FWHM',
          columns: ['Copy these lines'],
          rows: fit.peaks.map(function (p) { return [p.c.toFixed(dec) + ', ' + Number(p.w.toPrecision(4))]; })
        });
      }
      if (v.tech === 'xrd') notes.push('The FWHM pasted into Scherrer still contains instrumental broadening. Enter the instrumental FWHM there to correct for it.');

      // plots (decimated for long spectra)
      const stepN = Math.max(1, Math.ceil(n / 1500));
      const pick = function (arr) { const out = []; for (let i = 0; i < n; i += stepN) out.push([x[i], arr(i)]); return out; };
      const series = [
        { name: 'Data', mode: 'line', color: 2, points: pick(function (i) { return y[i]; }) },
        { name: 'Baseline', mode: 'line', dashed: true, color: 3, points: pick(function (i) { return B[i]; }) },
        { name: 'Fit', mode: 'line', color: 1, points: pick(function (i) { return B[i] + fit.fitted[i]; }) }
      ];
      fit.peaks.forEach(function (p, k) { series.push({ name: k === 0 ? 'Components' : undefined, mode: 'line', dashed: true, color: 0, points: pick(function (i) { return B[i] + p.comp[i]; }) }); });
      const plots = [
        { title: T.name + ': data, baseline and fit', xlabel: T.x, ylabel: 'Intensity', series: series },
        { title: 'Residuals (data − baseline − fit)', xlabel: T.x, ylabel: 'Residual', series: [{ name: 'Residual', mode: 'line', color: 2, points: pick(function (i) { return yc[i] - fit.fitted[i]; }) }] }
      ];
      notes.push('Fitted in ' + ms + ' ms. Smoothing (if any) is used for display, baseline estimation and peak detection only.');
      const strongest = fit.peaks.reduce(function (a, b) { return b.area > a.area ? b : a; });
      return {
        results: [
          { label: 'Peaks fitted', value: fit.peaks.length, main: true },
          { label: 'R² of the fit', value: fit.r2, sig: 6, main: true },
          { label: 'Strongest peak (' + T.pos + ')', value: strongest.c, sig: 6, main: true },
          { label: 'Its FWHM', value: strongest.w },
          { label: 'Its area', value: strongest.area },
          { label: 'Iterations', value: fit.lm.iter }
        ],
        steps: s.items,
        tables: tables,
        plots: plots,
        warnings: warnings,
        notes: notes,
        fit: { peaks: fit.peaks.map(function (p) { return { c: p.c, h: p.h, w: p.w, eta: p.eta, area: p.area, seC: p.seC, seW: p.seW, seArea: p.seArea }; }), r2: fit.r2, iter: fit.lm.iter }
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
