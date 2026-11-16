/*
 * Dependency-free SVG plotter, static and interactive.
 *
 * spec = { title, xlabel, ylabel, series: [{ name, mode: 'markers'|'line'|'bars', points, color, hollow, size,
 *          markers, dashed }], xmin, xmax, ymin, ymax, zeroY, legend, logx, logy }
 * points: [[x, y], ...]; for bars: [[x0, x1, height], ...]
 *
 * NC.plot(spec)                 -> static SVG string (print, reports, tests)
 * NC.plotMount(el, spec, opts)  -> interactive plot in el; returns { update(spec), destroy(), getState(), ... }
 * NC.plotUtil                   -> pure helpers (ticks, ranges, scales, zoom, nearest point, CSV), tested in Node
 */
(function (global) {
  'use strict';
  const NC = global.NC;
  const U = {};
  const NCOL = 5; // colour classes .s0 ... .s4 (css/styles.css)
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
  const esc = function (s) {
    if (NC.esc) return NC.esc(s);
    return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  /* ------------------------------------------------------------------ */
  /* Pure helpers                                                         */
  /* ------------------------------------------------------------------ */

  /** Read-out formatting: NC.fmt to 4 significant figures, else toPrecision(4). */
  U.fmt = function (v) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    return NC.fmt ? NC.fmt(v, 4) : String(Number(v.toPrecision(4)));
  };
  const clean = function (v) { return Number(v.toPrecision(12)); };
  const pow10 = function (k) { return Number('1e' + k); };

  function niceNum(range, round) {
    const exp = Math.floor(Math.log10(range));
    const f = range / Math.pow(10, exp);
    let nf;
    if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
    else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf * Math.pow(10, exp);
  }

  /**
   * Nice linear ticks for about n ticks over [lo, hi].
   * extend: widen the range to the enclosing tick multiples (auto range); otherwise only ticks inside [lo, hi].
   * Returns { ticks, step, lo, hi }.
   */
  U.linearTicks = function (lo, hi, n, extend) {
    n = n || 6;
    if (!(hi > lo)) { const d = Math.abs(lo) * 0.1 || 1; lo -= d; hi += d; }
    // auto ranges keep the classic rule (nice span, then nice step); exact (zoomed) ranges step by span/(n-1)
    const step = extend ? niceNum(niceNum(hi - lo, false) / (n - 1), true) : niceNum((hi - lo) / (n - 1), true);
    const start = extend ? Math.floor(lo / step + 1e-9) * step : Math.ceil(lo / step - 1e-9) * step;
    const end = extend ? Math.ceil(hi / step - 1e-9) * step : Math.floor(hi / step + 1e-9) * step;
    const ticks = [];
    for (let k = 0; k < 200; k++) {
      const v = start + k * step;
      if (v > end + step * 0.5) break;
      ticks.push(Math.abs(v) < step * 1e-9 ? 0 : clean(v));
    }
    return { ticks: ticks, step: step, lo: extend ? clean(start) : lo, hi: extend ? clean(end) : hi };
  };

  /** Label for a linear tick at spacing step. */
  U.tickLabel = function (v, step) {
    const a = Math.abs(v);
    if (v === 0) return '0';
    if (a >= 1e5 || a < 1e-3) return NC.fmt ? NC.fmt(v, 2) : v.toExponential(1);
    const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    return v.toFixed(Math.min(dec, 6)).replace('-', '−');
  };
  /** 10 with a superscript exponent, e.g. decadeLabel(2) = '10²', decadeLabel(-3) = '10⁻³'. */
  U.decadeLabel = function (k) {
    return '10' + String(k).split('').map(function (c) { return SUP[c] || c; }).join('');
  };
  function plainLabel(v) {
    const a = Math.abs(v);
    if (a >= 1e5 || a < 1e-3) return NC.fmt ? NC.fmt(v, 3) : v.toExponential(2);
    return String(Number(v.toPrecision(6))).replace('-', '−');
  }

  /** Largest 1-2-5 value <= v (v > 0). */
  U.logFloor125 = function (v) {
    const k = Math.floor(Math.log10(v) + 1e-12), m = v / pow10(k);
    return Number((m >= 5 - 1e-9 ? 5 : m >= 2 - 1e-9 ? 2 : 1) + 'e' + k);
  };
  /** Smallest 1-2-5 value >= v (v > 0). */
  U.logCeil125 = function (v) {
    const k = Math.floor(Math.log10(v) + 1e-12), m = v / pow10(k);
    if (m <= 1 + 1e-9) return pow10(k);
    return Number((m <= 2 + 1e-9 ? 2 : m <= 5 + 1e-9 ? 5 : 10) + 'e' + k);
  };

  /**
   * Ticks for a logarithmic axis over [lo, hi] (both > 0). Returns [{ v, label, minor }] ascending.
   * Two decades or more: labelled decades 10ⁿ (every k-th decade when there are many) with 2..9 minor lines;
   * between half a decade and two: 1, 2, 5 steps; narrower: linear ticks.
   */
  U.logTicks = function (lo, hi) {
    const a = Math.log10(lo), b = Math.log10(hi), span = b - a;
    const out = [];
    const inR = function (v) { return v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9); };
    if (span >= 2 - 1e-9) {
      const k0 = Math.ceil(a - 1e-9), k1 = Math.floor(b + 1e-9);
      const every = Math.max(1, Math.ceil((k1 - k0 + 1) / 8));
      for (let k = Math.floor(a); k <= k1; k++) {
        const v = pow10(k);
        if (k >= k0) {
          if (((k % every) + every) % every === 0) out.push({ v: v, label: U.decadeLabel(k), minor: false });
          else out.push({ v: v, label: '', minor: true });
        }
        if (every === 1 && span <= 6) {
          for (let m = 2; m <= 9; m++) { const w = Number(m + 'e' + k); if (inR(w)) out.push({ v: w, label: '', minor: true }); }
        }
      }
    } else if (span >= 0.5) {
      for (let k = Math.floor(a); k <= Math.ceil(b); k++) {
        for (let m = 1; m <= 9; m++) {
          const w = Number(m + 'e' + k);
          if (!inR(w)) continue;
          const major = m === 1 || m === 2 || m === 5;
          out.push({ v: w, label: major ? plainLabel(w) : '', minor: !major });
        }
      }
    } else {
      const t = U.linearTicks(lo, hi, 5, false);
      t.ticks.forEach(function (v) { if (v > 0) out.push({ v: v, label: U.tickLabel(v, t.step), minor: false }); });
    }
    out.sort(function (p, q) { return p.v - q.v; });
    return out;
  };

  const validX = function (v, log) { return typeof v === 'number' && isFinite(v) && (!log || v > 0); };

  /** Data extent of the series: { xlo, xhi, ylo, yhi, empty }; on log axes only values > 0 count. Bars include the 0 baseline (linear y). */
  U.dataRange = function (series, logx, logy) {
    let xlo = Infinity, xhi = -Infinity, ylo = Infinity, yhi = -Infinity;
    const ax = function (v) { if (validX(v, logx)) { if (v < xlo) xlo = v; if (v > xhi) xhi = v; } };
    const ay = function (v) { if (validX(v, logy)) { if (v < ylo) ylo = v; if (v > yhi) yhi = v; } };
    series.forEach(function (s) {
      const pts = s.points || [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (s.mode === 'bars') {
          if (!validX(p[0], logx) || !validX(p[1], logx) || !validX(p[2], logy)) continue;
          ax(p[0]); ax(p[1]); ay(p[2]); if (!logy) ay(0);
        } else if (validX(p[0], logx) && validX(p[1], logy)) { ax(p[0]); ay(p[1]); }
      }
    });
    return { xlo: xlo, xhi: xhi, ylo: ylo, yhi: yhi, empty: !(xlo <= xhi && ylo <= yhi) };
  };

  /** Whether an axis ('x' or 'y') can be logarithmic: some data, and no finite value <= 0 (bar heights of 0 are allowed). */
  U.canLog = function (series, axis) {
    let any = false, bad = false;
    const chk = function (v, zeroOk) {
      if (typeof v !== 'number' || !isFinite(v)) return;
      if (v < 0 || (v === 0 && !zeroOk)) bad = true;
      else if (v > 0) any = true;
    };
    for (let j = 0; j < series.length && !bad; j++) {
      const s = series[j], pts = s.points || [], bars = s.mode === 'bars';
      for (let i = 0; i < pts.length && !bad; i++) {
        const p = pts[i];
        if (bars && axis === 'x') { chk(p[0], false); chk(p[1], false); }
        else if (bars) chk(p[2], true);
        else chk(axis === 'x' ? p[0] : p[1], false);
      }
    }
    return any && !bad;
  };

  /**
   * One axis: range and ticks. dlo/dhi: data extent. o: { log, min, max, zero, n, view: [lo, hi] }.
   * view (zoom) is used exactly; otherwise min/max are used exactly and the rest is widened to nice values.
   * Returns { lo, hi, log, ticks: [{ v, label, minor }] }.
   */
  U.axis = function (dlo, dhi, o) {
    o = o || {};
    const n = o.n || 6;
    const log = !!o.log;
    const has = function (v) { return typeof v === 'number' && isFinite(v) && (!log || v > 0); };
    let lo, hi;
    if (o.view && has(o.view[0]) && has(o.view[1]) && o.view[1] > o.view[0]) {
      lo = o.view[0]; hi = o.view[1];
      return { lo: lo, hi: hi, log: log, ticks: log ? U.logTicks(lo, hi) : linTicks(U.linearTicks(lo, hi, n, false), lo, hi) };
    }
    if (log) {
      lo = has(o.min) ? o.min : dlo; hi = has(o.max) ? o.max : dhi;
      if (!(lo > 0)) lo = hi > 0 ? hi / 100 : 1;
      if (!(hi > lo)) { lo = lo / 2; hi = lo * 4; }
      if (Math.log10(hi / lo) >= 2) {
        if (!has(o.min)) lo = pow10(Math.floor(Math.log10(lo) + 1e-9));
        if (!has(o.max)) hi = pow10(Math.ceil(Math.log10(hi) - 1e-9));
      } else {
        if (!has(o.min)) lo = U.logFloor125(lo);
        if (!has(o.max)) hi = U.logCeil125(hi);
      }
      return { lo: lo, hi: hi, log: true, ticks: U.logTicks(lo, hi) };
    }
    lo = has(o.min) ? o.min : dlo; hi = has(o.max) ? o.max : dhi;
    if (o.zero && lo > 0 && !has(o.min)) lo = 0;
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    const t = U.linearTicks(lo, hi, n, true);
    if (!has(o.min)) lo = t.lo;
    if (!has(o.max)) hi = t.hi;
    if (!(hi > lo)) { hi = lo + (t.step || 1); }
    return { lo: lo, hi: hi, log: false, ticks: linTicks(t, lo, hi) };
  };
  function linTicks(t, lo, hi) {
    const e = (hi - lo) * 1e-9;
    return t.ticks.filter(function (v) { return v >= lo - e && v <= hi + e; }).map(function (v) { return { v: v, label: U.tickLabel(v, t.step), minor: false }; });
  }

  /** Map data [lo, hi] to pixels [p0, p1], linear or log10. */
  U.scale = function (lo, hi, p0, p1, log) {
    const a = log ? Math.log10(lo) : lo, b = log ? Math.log10(hi) : hi;
    const k = (p1 - p0) / ((b - a) || 1);
    return log ? function (v) { return p0 + (Math.log10(v) - a) * k; } : function (v) { return p0 + (v - a) * k; };
  };
  /** Pixel p back to data on the axis [lo, hi] -> [p0, p1]. */
  U.invert = function (p, lo, hi, p0, p1, log) {
    const a = log ? Math.log10(lo) : lo, b = log ? Math.log10(hi) : hi;
    const v = a + ((p - p0) / ((p1 - p0) || 1)) * (b - a);
    return log ? Math.pow(10, v) : v;
  };
  /** Zoom [lo, hi] by factor f (< 1 zooms in) keeping the data value c fixed; log axes zoom in log space. */
  U.zoomRange = function (lo, hi, c, f, log) {
    if (log) {
      const r = U.zoomRange(Math.log10(lo), Math.log10(hi), Math.log10(c), f, false);
      return [Math.pow(10, r[0]), Math.pow(10, r[1])];
    }
    const nlo = c - (c - lo) * f, nhi = c + (hi - c) * f;
    const minSpan = Math.max(Math.abs(c), Math.abs(lo), Math.abs(hi), 1e-300) * 1e-12;
    if (!(nhi - nlo > minSpan)) return [lo, hi];
    return [nlo, nhi];
  };
  /** Shift [lo, hi] by frac of its span (log axes in log space). */
  U.panRange = function (lo, hi, frac, log) {
    if (log) {
      const r = U.panRange(Math.log10(lo), Math.log10(hi), frac, false);
      return [Math.pow(10, r[0]), Math.pow(10, r[1])];
    }
    const d = (hi - lo) * frac;
    return [lo + d, hi + d];
  };

  /**
   * Index of the point nearest the cursor (cx, cy) in pixel arrays px/py (NaN entries are gaps).
   * byX: nearest in x (ties broken by y), for lines and bars; otherwise nearest in the plane. -1 if none.
   */
  U.nearestIndex = function (px, py, cx, cy, byX) {
    let best = -1, bd = Infinity, bd2 = Infinity;
    for (let i = 0; i < px.length; i++) {
      const x = px[i], y = py[i];
      if (x !== x || y !== y) continue;
      const dx = x - cx, dy = y - cy;
      if (byX) {
        const d = Math.abs(dx), d2 = Math.abs(dy);
        if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && d2 < bd2)) { best = i; bd = d; bd2 = d2; }
      } else {
        const d = dx * dx + dy * dy;
        if (d < bd) { best = i; bd = d; }
      }
    }
    return best;
  };

  function csvCell(s) {
    s = String(s);
    return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  /**
   * CSV of the series: columns series, x, y (bars: x is the bin centre, y the height, plus x_low, x_high).
   * Non-finite points are left out.
   */
  U.toCSV = function (series) {
    const hasBars = series.some(function (s) { return s.mode === 'bars'; });
    const rows = ['series,x,y' + (hasBars ? ',x_low,x_high' : '')];
    series.forEach(function (s, i) {
      const name = csvCell(s.name || 'Series ' + (i + 1));
      (s.points || []).forEach(function (p) {
        if (s.mode === 'bars') {
          if (!isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2])) return;
          rows.push(name + ',' + clean((p[0] + p[1]) / 2) + ',' + p[2] + ',' + p[0] + ',' + p[1]);
        } else {
          if (!isFinite(p[0]) || !isFinite(p[1])) return;
          rows.push(name + ',' + p[0] + ',' + p[1] + (hasBars ? ',,' : ''));
        }
      });
    });
    return rows.join('\n') + '\n';
  };

  /** Fresh interactive state. */
  U.newState = function () {
    return { view: { x: null, y: null }, logx: null, logy: null, hidden: {}, kept: [], keptCount: 0, edits: {} };
  };
  const seriesKey = function (s, i) { return s.name || 'Series ' + (i + 1); };
  const num = function (v) { return typeof v === 'number' && isFinite(v) ? v : undefined; };

  /**
   * The spec as displayed under state: edited title/labels/limits, mode override, kept curves appended,
   * hidden series removed. Returns { title, xlabel, ylabel, all, series, xmin, xmax, ymin, ymax, zeroY, legend,
   * canLogX, canLogY, logx, logy }.
   */
  U.effective = function (spec, st) {
    st = st || U.newState();
    const e = st.edits || {};
    const all = [];
    const mode = e.mode;
    const over = function (s) {
      if (s.mode === 'bars' || !mode) return s;
      if (mode === 'line') return Object.assign({}, s, { mode: 'line', markers: false });
      if (mode === 'markers') return Object.assign({}, s, { mode: 'markers' });
      if (mode === 'both') return Object.assign({}, s, { mode: 'line', markers: true });
      return s;
    };
    (spec.series || []).forEach(function (s, i) {
      all.push(over(Object.assign({}, s, { key: seriesKey(s, i), color: (s.color !== undefined ? s.color : i), kept: false })));
    });
    (st.kept || []).forEach(function (k) {
      all.push(over(Object.assign({}, k, { key: k.label, name: k.label, kept: true, dashed: k.mode === 'line' })));
    });
    const hidden = st.hidden || {};
    const series = all.filter(function (s) { return !hidden[s.key]; });
    const base = series.length ? series : all;
    const canLogX = U.canLog(base, 'x'), canLogY = U.canLog(base, 'y');
    const wantX = st.logx === null || st.logx === undefined ? !!spec.logx : st.logx;
    const wantY = st.logy === null || st.logy === undefined ? !!spec.logy : st.logy;
    return {
      title: e.title !== undefined && e.title !== '' ? e.title : spec.title,
      xlabel: e.xlabel !== undefined && e.xlabel !== '' ? e.xlabel : spec.xlabel,
      ylabel: e.ylabel !== undefined && e.ylabel !== '' ? e.ylabel : spec.ylabel,
      all: all, series: series,
      xmin: num(e.xmin) !== undefined ? e.xmin : spec.xmin, xmax: num(e.xmax) !== undefined ? e.xmax : spec.xmax,
      ymin: num(e.ymin) !== undefined ? e.ymin : spec.ymin, ymax: num(e.ymax) !== undefined ? e.ymax : spec.ymax,
      zeroY: spec.zeroY, legend: spec.legend,
      canLogX: canLogX, canLogY: canLogY, logx: wantX && canLogX, logy: wantY && canLogY
    };
  };

  /** Ranges, ticks and scales for an effective spec in a W x H box with margins m. view: { x, y } zoom ranges. */
  U.layout = function (eff, W, H, m, view) {
    const pw = Math.max(10, W - m.l - m.r), ph = Math.max(10, H - m.t - m.b);
    let dr = U.dataRange(eff.series, eff.logx, eff.logy);
    if (dr.empty) dr = U.dataRange(eff.all || [], eff.logx, eff.logy);
    const empty = dr.empty;
    if (empty) dr = eff.logx || eff.logy ? { xlo: 1, xhi: 10, ylo: 1, yhi: 10 } : { xlo: 0, xhi: 1, ylo: 0, yhi: 1 };
    view = view || {};
    const ax = U.axis(dr.xlo, dr.xhi, { log: eff.logx, min: eff.xmin, max: eff.xmax, n: pw < 320 ? 4 : 7, view: view.x });
    const ay = U.axis(dr.ylo, dr.yhi, { log: eff.logy, min: eff.ymin, max: eff.ymax, zero: eff.zeroY, n: ph < 200 ? 5 : 6, view: view.y });
    return {
      W: W, H: H, m: m, pw: pw, ph: ph, ax: ax, ay: ay, empty: empty,
      X: U.scale(ax.lo, ax.hi, m.l, m.l + pw, ax.log), Y: U.scale(ay.lo, ay.hi, m.t + ph, m.t, ay.log)
    };
  };

  /* ------------------------------------------------------------------ */
  /* Geometry and markup shared by the static and interactive plots       */
  /* ------------------------------------------------------------------ */

  const LIM = 1e5;
  const r1 = function (v) { return v > LIM ? LIM : v < -LIM ? -LIM : Math.round(v * 10) / 10; };
  const colorClass = function (s) { return 's' + ((((s.color | 0) % NCOL) + NCOL) % NCOL); };

  /**
   * Path data for one series in layout L: { line, marks, bars, px, py } (px/py: pixel position of each point for
   * hover, NaN for gaps). Markers and bars are single paths, so a series is one or two DOM elements.
   */
  function geom(s, L) {
    const X = L.X, Y = L.Y, lx = L.ax.log, ly = L.ay.log;
    const pts = s.points || [], n = pts.length;
    const px = new Float64Array(n), py = new Float64Array(n);
    const left = L.m.l - 20, right = L.m.l + L.pw + 20, top = L.m.t - 20, bottom = L.m.t + L.ph + 20;
    let line = '', marks = '', bars = '';
    if (s.mode === 'bars') {
      const base = ly ? L.m.t + L.ph + 1 : Math.min(L.m.t + L.ph + 1, Math.max(L.m.t - 1, Y(0)));
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        if (!validX(p[0], lx) || !validX(p[1], lx) || !validX(p[2], ly)) { px[i] = NaN; py[i] = NaN; continue; }
        const x0 = X(Math.min(p[0], p[1])), x1 = X(Math.max(p[0], p[1])), yt = Y(p[2]);
        px[i] = (x0 + x1) / 2; py[i] = yt;
        if (x1 < left || x0 > right) continue;
        const w = x1 - x0 - 1;
        if (w <= 0) continue;
        bars += 'M' + r1(x0 + 0.5) + ',' + r1(base) + 'V' + r1(yt) + 'h' + r1(w) + 'V' + r1(base) + 'Z';
      }
      return { line: '', marks: '', bars: bars, px: px, py: py };
    }
    const wantLine = s.mode === 'line', wantMarks = s.mode !== 'line' || s.markers;
    const r = s.size || (s.mode === 'line' ? 2.5 : 3.5), d = r * 2;
    let pen = false;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      if (!validX(p[0], lx) || !validX(p[1], ly)) { px[i] = NaN; py[i] = NaN; pen = false; continue; }
      const x = X(p[0]), y = Y(p[1]);
      px[i] = x; py[i] = y;
      if (wantLine) { line += (pen ? 'L' : 'M') + r1(x) + ',' + r1(y); pen = true; }
      if (wantMarks && x >= left && x <= right && y >= top && y <= bottom) {
        marks += 'M' + r1(x - r) + ',' + r1(y) + 'a' + r + ',' + r + ' 0 1,0 ' + d + ',0a' + r + ',' + r + ' 0 1,0 -' + d + ',0';
      }
    }
    return { line: line, marks: marks, bars: '', px: px, py: py };
  }
  /** [{ cls, d }] for the series (each series gives a bar path, or a line and/or markers path). */
  function seriesPaths(s, L, g) {
    const c = colorClass(s), k = s.kept ? ' kept' : '';
    const out = [];
    if (s.mode === 'bars') { out.push({ cls: 'bar ' + c + k, d: g.bars }); return out; }
    if (s.mode === 'line') out.push({ cls: 'line ' + c + (s.dashed || s.kept ? ' dashed' : '') + k, d: g.line });
    if (s.mode !== 'line' || s.markers) out.push({ cls: 'pt ' + c + (s.hollow || s.kept ? ' hollow' : '') + k, d: g.marks });
    return out;
  }

  function gridMarkup(L) {
    const m = L.m, X = L.X, Y = L.Y;
    let g = '';
    L.ax.ticks.forEach(function (t) {
      const x = r1(X(t.v));
      g += '<line class="grid' + (t.minor ? ' minor' : '') + '" x1="' + x + '" x2="' + x + '" y1="' + m.t + '" y2="' + (m.t + L.ph) + '"/>';
      if (t.label) g += '<text class="tick" x="' + x + '" y="' + (m.t + L.ph + 18) + '" text-anchor="middle">' + esc(t.label) + '</text>';
    });
    L.ay.ticks.forEach(function (t) {
      const y = r1(Y(t.v));
      g += '<line class="grid' + (t.minor ? ' minor' : '') + '" x1="' + m.l + '" x2="' + (m.l + L.pw) + '" y1="' + y + '" y2="' + y + '"/>';
      if (t.label) g += '<text class="tick" x="' + (m.l - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(t.label) + '</text>';
    });
    g += '<rect class="frame" x="' + m.l + '" y="' + m.t + '" width="' + L.pw + '" height="' + L.ph + '"/>';
    if (!L.ay.log && L.ay.lo < 0 && L.ay.hi > 0) g += '<line class="axis0" x1="' + m.l + '" x2="' + (m.l + L.pw) + '" y1="' + r1(Y(0)) + '" y2="' + r1(Y(0)) + '"/>';
    if (L.empty) g += '<text class="tick" x="' + (m.l + L.pw / 2) + '" y="' + (m.t + L.ph / 2) + '" text-anchor="middle">No data to show</text>';
    return g;
  }

  /** Text alternative for screen readers: title, axes with ranges, and each series. */
  function describe(eff, L) {
    const n = function (v) { return Number(v.toPrecision(3)).toString(); };
    const series = eff.series.map(function (s) {
      return (s.name || 'data') + ' (' + (s.mode === 'line' ? 'line through ' + s.points.length + ' points' : s.points.length + (s.mode === 'bars' ? ' bar' : ' point') + (s.points.length === 1 ? '' : 's')) + ')';
    }).join(', ');
    return (eff.title || 'Plot') + '. Horizontal axis: ' + (eff.xlabel || 'x') + (L.ax.log ? ' (logarithmic)' : '') + ', ' + n(L.ax.lo) + ' to ' + n(L.ax.hi) +
      '. Vertical axis: ' + (eff.ylabel || 'y') + (L.ay.log ? ' (logarithmic)' : '') + ', ' + n(L.ay.lo) + ' to ' + n(L.ay.hi) + '. Series: ' + (series || 'none') + '.';
  }

  function legendMarkup(eff, L) {
    const named = eff.series.filter(function (s) { return s.name; });
    if (!(named.length > 1 || (named.length === 1 && eff.legend))) return '';
    const lw = Math.min(L.pw - 10, 30 + 6.6 * Math.max.apply(null, named.map(function (s) { return s.name.length; })));
    const lx = L.m.l + L.pw - lw - 6;
    let ly = L.m.t + 12, out = '<rect class="legend-bg" x="' + (lx - 6) + '" y="' + (L.m.t + 2) + '" width="' + (lw + 8) + '" height="' + (named.length * 18 + 4) + '" rx="4"/>';
    named.forEach(function (s) {
      const c = colorClass(s), k = s.kept ? ' kept' : '';
      out += s.mode === 'line'
        ? '<line class="line ' + c + (s.dashed || s.kept ? ' dashed' : '') + k + '" x1="' + lx + '" x2="' + (lx + 18) + '" y1="' + ly + '" y2="' + ly + '"/>'
        : s.mode === 'bars'
          ? '<rect class="bar ' + c + k + '" x="' + lx + '" y="' + (ly - 5) + '" width="18" height="10"/>'
          : '<circle class="pt ' + c + (s.hollow || s.kept ? ' hollow' : '') + k + '" cx="' + (lx + 9) + '" cy="' + ly + '" r="3.5"/>';
      out += '<text class="legend" x="' + (lx + 24) + '" y="' + (ly + 4) + '">' + esc(s.name) + '</text>';
      ly += 18;
    });
    return '<g class="legend-box">' + out + '</g>';
  }

  let clipSeq = 0;
  /** Full SVG markup of an effective spec in layout L. o: { title: draw the title, style: css text, standalone }. */
  function svgString(eff, L, o) {
    o = o || {};
    const W = L.W, H = L.H, m = L.m;
    const clipId = 'ncclip' + (++clipSeq) + Math.random().toString(36).slice(2, 6);
    let body = '';
    eff.series.forEach(function (s) {
      const g = geom(s, L);
      seriesPaths(s, L, g).forEach(function (p) { if (p.d) body += '<path class="' + p.cls + '" d="' + p.d + '"/>'; });
    });
    const labels =
      (o.title && eff.title ? '<text class="ptitle" x="' + (m.l + L.pw / 2) + '" y="18" text-anchor="middle">' + esc(eff.title) + '</text>' : '') +
      '<text class="axlabel" x="' + (m.l + L.pw / 2) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(eff.xlabel || '') + '</text>' +
      '<text class="axlabel" transform="translate(16,' + (m.t + L.ph / 2) + ') rotate(-90)" text-anchor="middle">' + esc(eff.ylabel || '') + '</text>';
    return '<svg class="plot"' + (o.standalone ? ' xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"' : '') +
      ' viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(describe(eff, L)) + '">' +
      '<title>' + esc(eff.title || 'Plot') + '</title>' +
      (o.style ? '<style>' + o.style + '</style><rect class="bg" x="0" y="0" width="' + W + '" height="' + H + '"/>' : '') +
      '<defs><clipPath id="' + clipId + '"><rect x="' + m.l + '" y="' + m.t + '" width="' + L.pw + '" height="' + L.ph + '"/></clipPath></defs>' +
      gridMarkup(L) + '<g clip-path="url(#' + clipId + ')">' + body + '</g>' + legendMarkup(eff, L) + labels + '</svg>';
  }

  NC.plot = function (spec) {
    const eff = U.effective(spec, null);
    if (U.dataRange(eff.series, eff.logx, eff.logy).empty) return '';
    const L = U.layout(eff, 640, 360, { l: 70, r: 18, t: 18, b: 52 }, null);
    return svgString(eff, L, {});
  };
  U.describe = describe;
  NC.plotUtil = U;

  /* ------------------------------------------------------------------ */
  /* Interactive plot                                                     */
  /* ------------------------------------------------------------------ */

  const saved = {}; // state kept by opts.key across remounts (this page session only)
  U._saved = saved;
  const SVGNS = 'http://www.w3.org/2000/svg';
  let uid = 0;

  function slug(s) { return String(s || 'plot').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'plot'; }
  function cloneState(st) {
    return {
      view: { x: st.view.x ? st.view.x.slice() : null, y: st.view.y ? st.view.y.slice() : null },
      logx: st.logx, logy: st.logy, hidden: Object.assign({}, st.hidden),
      kept: st.kept.map(function (k) { return Object.assign({}, k, { points: k.points.map(function (p) { return p.slice(); }) }); }),
      keptCount: st.keptCount, edits: Object.assign({}, st.edits)
    };
  }

  /**
   * Interactive plot in container. opts: { key, height, aspect, filename, titleEl, showTitle, toolbar, state, onChange }.
   * Returns { update(spec), destroy(), getState(), setState(state), resetView(), toSVG(), toCSV(), toPNG(scale) }.
   */
  NC.plotMount = function (container, spec, opts) {
    opts = opts || {};
    const doc = container.ownerDocument || document;
    const win = doc.defaultView || global;
    const id = 'ncp' + (++uid);
    let st = opts.state ? cloneState(Object.assign(U.newState(), opts.state)) : opts.key && saved[opts.key] ? cloneState(saved[opts.key]) : U.newState();
    let cur = spec, eff = null, L = null, geoms = [], width = 0, destroyed = false;
    let hoverP = null, drag = null, editOpen = false;

    const tb = opts.toolbar === false ? '' :
      '<div class="ncp-toolbar" role="toolbar" aria-label="Plot tools">' +
      '<button type="button" data-a="reset" aria-label="Reset view (zoom to all data)" title="Reset view (double-click the plot)">Reset</button>' +
      '<button type="button" data-a="logx" aria-pressed="false" aria-label="Logarithmic x axis">Log x</button>' +
      '<button type="button" data-a="logy" aria-pressed="false" aria-label="Logarithmic y axis">Log y</button>' +
      '<button type="button" data-a="keep" aria-label="Keep the current curves for comparison" title="Freeze the current curves as dashed comparison curves">Keep curves</button>' +
      '<button type="button" data-a="clear" aria-label="Clear kept curves">Clear kept</button>' +
      '<button type="button" data-a="edit" aria-expanded="false" aria-controls="' + id + '-edit" aria-label="Edit axes, labels and style">Edit</button>' +
      '<span class="ncp-sep" aria-hidden="true"></span>' +
      '<button type="button" data-a="png" aria-label="Download as PNG image">PNG</button>' +
      '<button type="button" data-a="svg" aria-label="Download as SVG image">SVG</button>' +
      '<button type="button" data-a="csv" aria-label="Download the plotted data as CSV">CSV</button>' +
      '</div>';
    const fld = function (k, label, type) {
      return '<label><span>' + label + '</span><input data-e="' + k + '" type="text"' + (type === 'num' ? ' inputmode="decimal" autocomplete="off" spellcheck="false"' : '') + '></label>';
    };
    const panel =
      '<div class="ncp-edit" id="' + id + '-edit" role="group" aria-label="Edit plot" hidden>' +
      '<div class="ncp-edit-grid">' +
      fld('xmin', 'x min', 'num') + fld('xmax', 'x max', 'num') + fld('ymin', 'y min', 'num') + fld('ymax', 'y max', 'num') +
      fld('title', 'Title') + fld('xlabel', 'x label') + fld('ylabel', 'y label') +
      '<label><span>Draw as</span><select data-e="mode"><option value="">As calculated</option><option value="line">Lines</option>' +
      '<option value="markers">Markers</option><option value="both">Lines and markers</option></select></label>' +
      '</div><div class="ncp-edit-foot"><span class="ncp-hint">Empty fields use the automatic value. Escape closes.</span>' +
      '<button type="button" data-a="editreset">Clear edits</button><button type="button" data-a="editclose">Done</button></div></div>';

    const root = doc.createElement('div');
    root.className = 'ncp';
    root.innerHTML = tb + panel +
      '<div class="ncp-area" tabindex="0" role="group" aria-roledescription="interactive plot" aria-describedby="' + id + '-help">' +
      '<div class="ncp-tip" aria-hidden="true" hidden></div></div>' +
      '<div class="ncp-legend" role="group" aria-label="Series (click to hide or show)" hidden></div>' +
      '<p class="ncp-sr" id="' + id + '-help">Drag a box to zoom, scroll to zoom at the pointer, double-click to reset. Keyboard: plus and minus zoom, arrow keys pan, 0 resets.</p>' +
      '<p class="ncp-sr" aria-live="polite"></p>';
    const area = root.querySelector('.ncp-area');
    const tip = root.querySelector('.ncp-tip');
    const legendEl = root.querySelector('.ncp-legend');
    const live = root.querySelector('[aria-live]');
    const editEl = root.querySelector('.ncp-edit');
    const btn = function (a) { return root.querySelector('[data-a="' + a + '"]'); };

    const el = function (name, attrs, parent) {
      const e = doc.createElementNS(SVGNS, name);
      if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      if (parent) parent.appendChild(e);
      return e;
    };
    const svg = el('svg', { class: 'plot ncp-svg', role: 'img' });
    const titleNode = el('title', null, svg);
    const defs = el('defs', null, svg);
    const clip = el('clipPath', { id: id + '-clip' }, defs);
    const clipRect = el('rect', null, clip);
    const gGrid = el('g', { class: 'ncp-grid' }, svg);
    const gData = el('g', { 'clip-path': 'url(#' + id + '-clip)' }, svg);
    const gLabels = el('g', null, svg);
    const tTitle = el('text', { class: 'ptitle', 'text-anchor': 'middle' }, gLabels);
    const tX = el('text', { class: 'axlabel', 'text-anchor': 'middle' }, gLabels);
    const tY = el('text', { class: 'axlabel', 'text-anchor': 'middle' }, gLabels);
    const gOver = el('g', { class: 'ncp-over', 'pointer-events': 'none' }, svg);
    const vline = el('line', { class: 'ncp-cross', visibility: 'hidden' }, gOver);
    const hline = el('line', { class: 'ncp-cross', visibility: 'hidden' }, gOver);
    const gDots = el('g', null, gOver);
    const zrect = el('rect', { class: 'ncp-zoom', visibility: 'hidden' }, gOver);
    area.insertBefore(svg, tip);
    container.appendChild(root);

    const paths = [];
    let gridCache = '', aria = '', legendSig = '';
    const setA = function (e, k, v) { v = String(v); if (e.getAttribute(k) !== v) e.setAttribute(k, v); };
    const setT = function (e, v) { v = v || ''; if (e.textContent !== v) e.textContent = v; };
    const titleEl = opts.titleEl || (container.closest && container.closest('figure') ? container.closest('figure').querySelector('figcaption') : null);
    const origTitle = titleEl ? titleEl.textContent : null;

    function size() {
      const w = Math.round(area.clientWidth || 0);
      width = w > 0 ? Math.max(260, w) : 640;
    }
    function dims() {
      const W = width || 640;
      const H = opts.height || Math.round(Math.max(220, Math.min(400, W * (opts.aspect || 0.56))));
      const showT = !!(opts.showTitle || (!titleEl && st.edits.title));
      return { W: W, H: H, m: { l: W < 420 ? 58 : 68, r: 14, t: showT ? 30 : 14, b: 46 }, showT: showT };
    }

    function render() {
      if (destroyed) return;
      eff = U.effective(cur, st);
      const D = dims();
      L = U.layout(eff, D.W, D.H, D.m, st.view);
      setA(svg, 'viewBox', '0 0 ' + D.W + ' ' + D.H);
      setA(clipRect, 'x', D.m.l); setA(clipRect, 'y', D.m.t); setA(clipRect, 'width', L.pw); setA(clipRect, 'height', L.ph);
      const g = gridMarkup(L);
      if (g !== gridCache) { gGrid.innerHTML = g; gridCache = g; }
      // series: reuse path elements
      geoms = [];
      let k = 0;
      eff.series.forEach(function (s) {
        const gm = geom(s, L);
        geoms.push(gm);
        seriesPaths(s, L, gm).forEach(function (p) {
          let e = paths[k];
          if (!e) { e = el('path', null, gData); paths.push(e); }
          setA(e, 'class', p.cls);
          e.setAttribute('d', p.d || 'M0,0');
          if (e.style.display) e.style.display = '';
          if (!p.d) e.style.display = 'none';
          k++;
        });
      });
      for (let i = k; i < paths.length; i++) if (paths[i].style.display !== 'none') paths[i].style.display = 'none';
      // labels
      setT(tX, eff.xlabel); setA(tX, 'x', D.m.l + L.pw / 2); setA(tX, 'y', D.H - 10);
      setT(tY, eff.ylabel); setA(tY, 'transform', 'translate(16,' + (D.m.t + L.ph / 2) + ') rotate(-90)');
      setT(tTitle, D.showT ? eff.title : ''); setA(tTitle, 'x', D.m.l + L.pw / 2); setA(tTitle, 'y', 19);
      setT(titleNode, eff.title || 'Plot');
      if (titleEl) setT(titleEl, st.edits.title ? st.edits.title : origTitle);
      const a = describe(eff, L);
      if (a !== aria) { svg.setAttribute('aria-label', a); area.setAttribute('aria-label', (eff.title || 'Plot') + ', interactive'); aria = a; }
      syncLegend();
      syncToolbar();
      if (editOpen) syncPanelPlaceholders();
      if (hoverP) hoverAt(hoverP);
    }

    /* ---- legend ---- */
    function syncLegend() {
      const ents = eff.all;
      const show = ents.length > 1 || (ents.length === 1 && cur.legend);
      const sig = show ? ents.map(function (s) { return s.key + '|' + s.mode + '|' + colorClass(s) + '|' + (s.kept ? 1 : 0); }).join('\n') : '';
      if (sig !== legendSig) {
        legendSig = sig;
        legendEl.innerHTML = show ? ents.map(function (s) {
          return '<button type="button" class="ncp-lg" data-key="' + esc(s.key) + '" aria-pressed="true" title="Click to hide or show">' +
            '<span class="ncp-sw ' + (s.mode === 'bars' ? 'bar' : s.mode === 'line' ? 'line' : 'pt') + ' c' + colorClass(s).slice(1) + (s.kept ? ' kept' : '') + '" aria-hidden="true"></span>' +
            esc(s.key) + '</button>';
        }).join('') : '';
        legendEl.hidden = !show;
      }
      const bs = legendEl.children;
      for (let i = 0; i < bs.length; i++) setA(bs[i], 'aria-pressed', st.hidden[bs[i].getAttribute('data-key')] ? 'false' : 'true');
    }
    function syncToolbar() {
      if (opts.toolbar === false) return;
      const lx = btn('logx'), ly = btn('logy');
      lx.disabled = !eff.canLogX; ly.disabled = !eff.canLogY;
      setA(lx, 'title', eff.canLogX ? 'Logarithmic x axis' : 'Log x needs all x values > 0');
      setA(ly, 'title', eff.canLogY ? 'Logarithmic y axis' : 'Log y needs all y values > 0');
      setA(lx, 'aria-pressed', eff.logx ? 'true' : 'false');
      setA(ly, 'aria-pressed', eff.logy ? 'true' : 'false');
      btn('clear').disabled = !st.kept.length;
      setA(btn('edit'), 'aria-expanded', editOpen ? 'true' : 'false');
    }

    /* ---- hover read-out ---- */
    function toSvg(e) {
      const r = svg.getBoundingClientRect();
      const k = r.width ? L.W / r.width : 1;
      return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, k: k, r: r };
    }
    const inPlot = function (p) { return L && p.x >= L.m.l && p.x <= L.m.l + L.pw && p.y >= L.m.t && p.y <= L.m.t + L.ph; };
    function hideHover() {
      hoverP = null;
      vline.setAttribute('visibility', 'hidden'); hline.setAttribute('visibility', 'hidden');
      while (gDots.firstChild) gDots.removeChild(gDots.firstChild);
      tip.hidden = true;
    }
    function hoverAt(p) {
      hoverP = p;
      const m = L.m;
      vline.setAttribute('x1', p.x); vline.setAttribute('x2', p.x); vline.setAttribute('y1', m.t); vline.setAttribute('y2', m.t + L.ph);
      hline.setAttribute('y1', p.y); hline.setAttribute('y2', p.y); hline.setAttribute('x1', m.l); hline.setAttribute('x2', m.l + L.pw);
      vline.setAttribute('visibility', 'visible'); hline.setAttribute('visibility', 'visible');
      const xl = esc(eff.xlabel || 'x'), yl = esc(eff.ylabel || 'y');
      let rows = '<div class="ncp-tip-h">' + xl + ' ' + esc(U.fmt(U.invert(p.x, L.ax.lo, L.ax.hi, m.l, m.l + L.pw, L.ax.log))) + '</div>';
      let nd = 0;
      eff.series.forEach(function (s, i) {
        const gm = geoms[i];
        const j = U.nearestIndex(gm.px, gm.py, p.x, p.y, s.mode !== 'markers');
        if (j < 0) return;
        const pt = s.points[j];
        let dot = gDots.children[nd];
        if (!dot) dot = el('circle', { r: 4.5 }, gDots);
        dot.setAttribute('class', 'ncp-dot ' + colorClass(s));
        dot.setAttribute('cx', r1(gm.px[j])); dot.setAttribute('cy', r1(gm.py[j]));
        nd++;
        const xs = s.mode === 'bars' ? U.fmt(Math.min(pt[0], pt[1])) + ' – ' + U.fmt(Math.max(pt[0], pt[1])) : U.fmt(pt[0]);
        const ys = U.fmt(s.mode === 'bars' ? pt[2] : pt[1]);
        rows += '<div class="ncp-tip-r"><span class="ncp-sw ' + (s.mode === 'bars' ? 'bar' : s.mode === 'line' ? 'line' : 'pt') + ' c' + colorClass(s).slice(1) + (s.kept ? ' kept' : '') + '"></span>' +
          '<b>' + esc(s.name || s.key) + '</b><br>' + xl + ' = ' + esc(xs) + '<br>' + yl + ' = ' + esc(ys) + '</div>';
      });
      while (gDots.children.length > nd) gDots.removeChild(gDots.lastChild);
      tip.innerHTML = rows;
      tip.hidden = false;
      // position in CSS pixels, flipped to stay inside the plot
      const k = p.k || 1;
      const cx = p.x / k, cy = p.y / k, wpx = L.W / k;
      if (cx > wpx * 0.55) { tip.style.left = ''; tip.style.right = Math.max(0, wpx - cx + 14) + 'px'; }
      else { tip.style.right = ''; tip.style.left = (cx + 14) + 'px'; }
      tip.style.top = Math.max(0, cy - 10) + 'px';
    }

    /* ---- view changes ---- */
    function notify() {
      if (opts.key) saved[opts.key] = cloneState(st);
      if (typeof opts.onChange === 'function') opts.onChange(cloneState(st));
    }
    function announce() {
      if (!L) return;
      live.textContent = 'Showing ' + (eff.xlabel || 'x') + ' from ' + U.fmt(L.ax.lo) + ' to ' + U.fmt(L.ax.hi) + ', ' + (eff.ylabel || 'y') + ' from ' + U.fmt(L.ay.lo) + ' to ' + U.fmt(L.ay.hi) + '.';
    }
    function setView(x, y) {
      if (x) st.view.x = x;
      if (y) st.view.y = y;
      render(); notify();
    }
    function resetView() { st.view = { x: null, y: null }; render(); notify(); announce(); }
    function zoomAt(px, py, f, axes) {
      const m = L.m;
      const cx = U.invert(px, L.ax.lo, L.ax.hi, m.l, m.l + L.pw, L.ax.log);
      const cy = U.invert(py, L.ay.lo, L.ay.hi, m.t + L.ph, m.t, L.ay.log);
      setView(axes !== 'y' ? U.zoomRange(L.ax.lo, L.ax.hi, cx, f, L.ax.log) : null, axes !== 'x' ? U.zoomRange(L.ay.lo, L.ay.hi, cy, f, L.ay.log) : null);
    }

    /* ---- pointer, wheel, keyboard ---- */
    function onDown(e) {
      if (!L || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const p = toSvg(e);
      if (!inPlot(p)) { hideHover(); return; }
      if (e.pointerType === 'touch') { hoverAt(p); return; }
      drag = { x0: p.x, y0: p.y, id: e.pointerId };
      try { area.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      e.preventDefault();
      area.focus({ preventScroll: true });
    }
    function onMove(e) {
      if (!L) return;
      const p = toSvg(e);
      if (drag) {
        const x = Math.max(L.m.l, Math.min(L.m.l + L.pw, p.x)), y = Math.max(L.m.t, Math.min(L.m.t + L.ph, p.y));
        const dx = Math.abs(x - drag.x0), dy = Math.abs(y - drag.y0);
        const xonly = dy < 8 && dx >= 8, yonly = dx < 8 && dy >= 8;
        zrect.setAttribute('x', xonly || !yonly ? Math.min(x, drag.x0) : L.m.l);
        zrect.setAttribute('width', yonly ? L.pw : dx);
        zrect.setAttribute('y', yonly || !xonly ? Math.min(y, drag.y0) : L.m.t);
        zrect.setAttribute('height', xonly ? L.ph : dy);
        zrect.setAttribute('visibility', dx >= 4 || dy >= 4 ? 'visible' : 'hidden');
        drag.x1 = x; drag.y1 = y;
        hoverAt(p);
        return;
      }
      if (inPlot(p)) hoverAt(p); else if (e.pointerType !== 'touch') hideHover();
    }
    function onUp(e) {
      if (!drag) return;
      const d = drag; drag = null;
      zrect.setAttribute('visibility', 'hidden');
      try { area.releasePointerCapture(e.pointerId); } catch (err) { /* released */ }
      if (d.x1 === undefined) return;
      const dx = Math.abs(d.x1 - d.x0), dy = Math.abs(d.y1 - d.y0);
      if (dx < 8 && dy < 8) return;
      const m = L.m;
      const ix = function (px) { return U.invert(px, L.ax.lo, L.ax.hi, m.l, m.l + L.pw, L.ax.log); };
      const iy = function (py) { return U.invert(py, L.ay.lo, L.ay.hi, m.t + L.ph, m.t, L.ay.log); };
      const nx = dx >= 8 ? [ix(Math.min(d.x0, d.x1)), ix(Math.max(d.x0, d.x1))] : null;
      const ny = dy >= 8 ? [iy(Math.max(d.y0, d.y1)), iy(Math.min(d.y0, d.y1))] : null;
      setView(nx, ny);
      announce();
    }
    function onCancel() { drag = null; zrect.setAttribute('visibility', 'hidden'); }
    function onLeave(e) { if (!drag && e.pointerType !== 'touch') hideHover(); }
    function onWheel(e) {
      if (!L) return;
      const p = toSvg(e);
      if (!inPlot(p)) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      const f = Math.exp(Math.max(-0.5, Math.min(0.5, dy * 0.0015)));
      zoomAt(p.x, p.y, f, e.shiftKey ? 'x' : e.altKey ? 'y' : 'both');
    }
    function onKey(e) {
      if (!L || e.target !== area || e.ctrlKey || e.metaKey) return;
      const k = e.key, m = L.m;
      let done = true;
      if (k === '+' || k === '=') zoomAt(m.l + L.pw / 2, m.t + L.ph / 2, 0.8);
      else if (k === '-' || k === '_') zoomAt(m.l + L.pw / 2, m.t + L.ph / 2, 1.25);
      else if (k === 'ArrowLeft' || k === 'ArrowRight') setView(U.panRange(L.ax.lo, L.ax.hi, k === 'ArrowLeft' ? -0.1 : 0.1, L.ax.log), null);
      else if (k === 'ArrowUp' || k === 'ArrowDown') setView(null, U.panRange(L.ay.lo, L.ay.hi, k === 'ArrowDown' ? -0.1 : 0.1, L.ay.log));
      else if (k === '0' || k === 'Home') resetView();
      else if (k === 'Escape' && editOpen) toggleEdit(false);
      else done = false;
      if (done) { e.preventDefault(); announce(); }
    }

    /* ---- toolbar actions ---- */
    function keepCurves() {
      const n = ++st.keptCount;
      U.effective(cur, Object.assign({}, st, { kept: [], edits: {} })).series.forEach(function (s) {
        st.kept.push({ label: 'kept ' + n + ': ' + (s.name || s.key), mode: s.mode, color: s.color, markers: s.markers, size: s.size,
          points: s.points.map(function (p) { return p.slice(); }) });
      });
      if (st.kept.length > 40) st.kept = st.kept.slice(st.kept.length - 40);
      render(); notify();
      live.textContent = 'Kept the current curves as set ' + n + '.';
    }
    function fileName(ext) { return (opts.filename || slug(eff && eff.title)) + '.' + ext; }
    function download(name, blob) {
      const url = URL.createObjectURL(blob);
      const a = doc.createElement('a');
      a.href = url; a.download = name; a.style.display = 'none';
      doc.body.appendChild(a); a.click(); doc.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }
    function onToolbar(e) {
      const b = e.target.closest ? e.target.closest('button[data-a]') : null;
      if (!b || b.disabled) return;
      const a = b.getAttribute('data-a');
      if (a === 'reset') resetView();
      else if (a === 'logx' || a === 'logy') {
        st[a] = !eff[a]; st.view[a === 'logx' ? 'x' : 'y'] = null; render(); notify(); announce();
      } else if (a === 'keep') keepCurves();
      else if (a === 'clear') { st.kept = []; Object.keys(st.hidden).forEach(function (k) { if (/^kept \d+: /.test(k)) delete st.hidden[k]; }); render(); notify(); live.textContent = 'Kept curves cleared.'; }
      else if (a === 'edit') toggleEdit(!editOpen);
      else if (a === 'editclose') toggleEdit(false);
      else if (a === 'editreset') { st.edits = {}; fillPanel(); render(); notify(); }
      else if (a === 'svg') download(fileName('svg'), new Blob([ctrl.toSVG()], { type: 'image/svg+xml' }));
      else if (a === 'csv') download(fileName('csv'), new Blob([ctrl.toCSV()], { type: 'text/csv' }));
      else if (a === 'png') {
        ctrl.toPNG(2).then(function (url) {
          const bin = win.atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          download(fileName('png'), new Blob([bytes], { type: 'image/png' }));
        }, function () { live.textContent = 'PNG export failed in this browser; try SVG.'; });
      }
    }
    function onLegend(e) {
      const b = e.target.closest ? e.target.closest('button[data-key]') : null;
      if (!b) return;
      const k = b.getAttribute('data-key');
      if (st.hidden[k]) delete st.hidden[k]; else st.hidden[k] = true;
      render(); notify();
    }

    /* ---- edit panel ---- */
    const inputs = editEl.querySelectorAll('[data-e]');
    function fillPanel() {
      for (let i = 0; i < inputs.length; i++) {
        const k = inputs[i].getAttribute('data-e'), v = st.edits[k];
        inputs[i].value = v === undefined || v === null ? '' : String(v);
      }
      syncPanelPlaceholders();
    }
    function syncPanelPlaceholders() {
      if (!L) return;
      const ph = { xmin: L.ax.lo, xmax: L.ax.hi, ymin: L.ay.lo, ymax: L.ay.hi };
      for (let i = 0; i < inputs.length; i++) {
        const k = inputs[i].getAttribute('data-e');
        if (ph[k] !== undefined) setA(inputs[i], 'placeholder', 'auto (' + Number(ph[k].toPrecision(4)) + ')');
        else if (k === 'title' || k === 'xlabel' || k === 'ylabel') setA(inputs[i], 'placeholder', cur[k] || '');
      }
    }
    function onEditInput(e) {
      const t = e.target, k = t.getAttribute('data-e');
      if (!k) return;
      const v = t.value.trim();
      if (k === 'xmin' || k === 'xmax' || k === 'ymin' || k === 'ymax') {
        const x = Number(v.replace('−', '-').replace(',', '.'));
        if (v === '') delete st.edits[k];
        else if (isFinite(x)) st.edits[k] = x;
        else { t.setAttribute('aria-invalid', 'true'); return; }
        t.removeAttribute('aria-invalid');
        st.view[k.charAt(0)] = null;
      } else if (v === '') delete st.edits[k];
      else st.edits[k] = t.value;
      render(); notify();
    }
    function toggleEdit(open) {
      editOpen = open;
      editEl.hidden = !open;
      root.classList.toggle('ncp-editing', open);
      if (open) { fillPanel(); inputs[0].focus(); }
      else if (opts.toolbar !== false) btn('edit').focus();
      syncToolbar();
    }
    function onEditKey(e) { if (e.key === 'Escape') { e.preventDefault(); toggleEdit(false); } }

    /* ---- exports ---- */
    function exportStyle() {
      const cs = win.getComputedStyle ? win.getComputedStyle(root) : null;
      const v = function (n, d) { const x = cs ? cs.getPropertyValue(n).trim() : ''; return x || d; };
      const S = v('--surface', '#ffffff'), T = v('--text', '#1b2330'), M = v('--muted', '#5d6878'), B = v('--border', '#dde1e7');
      const F = v('--font', 'system-ui, sans-serif').replace(/[<>]/g, '');
      const C = ['#0f6f7a', '#d1495b', '#6b7280', '#e0a030', '#4f5bd5'].map(function (d, i) { return v('--s' + i, d); });
      let css = 'svg{font-family:' + F + '}.bg{fill:' + S + '}.grid{stroke:' + B + ';stroke-width:1}.grid.minor{opacity:.45}' +
        '.frame{fill:none;stroke:' + M + ';stroke-width:1}.axis0{stroke:' + M + ';stroke-dasharray:3 3}' +
        '.tick,.legend{fill:' + M + ';font-size:12px}.axlabel{fill:' + T + ';font-size:13px}.ptitle{fill:' + T + ';font-size:14px;font-weight:600}' +
        '.line{fill:none;stroke-width:2}.line.dashed{stroke-dasharray:6 4;stroke-width:1.5}.bar{opacity:.75}.kept{opacity:.55}.legend-bg{fill:' + S + ';opacity:.85}';
      C.forEach(function (c, i) { css += '.s' + i + '.line,.s' + i + '.pt.hollow{stroke:' + c + '}.s' + i + '.pt,.s' + i + '.bar{fill:' + c + ';stroke:' + c + '}'; });
      css += '.pt.hollow{fill:' + S + ' !important;stroke-width:1.6}';
      return { css: css.replace(/<\//g, '<\\/'), bg: S };
    }
    function exportLayout() {
      const D = dims();
      return U.layout(eff, Math.max(D.W, 560), Math.max(D.H, 320), { l: 70, r: 18, t: eff.title ? 30 : 16, b: 52 }, { x: [L.ax.lo, L.ax.hi], y: [L.ay.lo, L.ay.hi] });
    }

    const ctrl = {
      update: function (s) { if (destroyed || !s) return; cur = s; render(); },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (opts.key) saved[opts.key] = cloneState(st);
        if (ro) ro.disconnect(); else win.removeEventListener('resize', onResize);
        if (titleEl && origTitle !== null) titleEl.textContent = origTitle;
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      getState: function () { return cloneState(st); },
      setState: function (s) { st = cloneState(Object.assign(U.newState(), s || {})); if (editOpen) fillPanel(); render(); },
      resetView: resetView,
      toSVG: function () {
        const x = exportStyle();
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + svgString(eff, exportLayout(), { title: true, style: x.css, standalone: true });
      },
      toCSV: function () { return U.toCSV(eff.series); },
      /** Promise of a PNG data URL rendered at `scale` (default 2) times the export size. */
      toPNG: function (scale) {
        scale = scale || 2;
        const x = exportStyle(), EL = exportLayout();
        const s = svgString(eff, EL, { title: true, style: x.css, standalone: true });
        return new Promise(function (resolve, reject) {
          const img = new win.Image();
          img.onload = function () {
            try {
              const c = doc.createElement('canvas');
              c.width = EL.W * scale; c.height = EL.H * scale;
              const g = c.getContext('2d');
              g.fillStyle = x.bg; g.fillRect(0, 0, c.width, c.height);
              g.drawImage(img, 0, 0, c.width, c.height);
              resolve(c.toDataURL('image/png'));
            } catch (err) { reject(err); }
          };
          img.onerror = function () { reject(new Error('SVG could not be rendered')); };
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
        });
      },
      _debug: function () { return { L: L, eff: eff }; }
    };

    // wire events
    area.addEventListener('pointerdown', onDown);
    area.addEventListener('pointermove', onMove);
    area.addEventListener('pointerup', onUp);
    area.addEventListener('pointercancel', onCancel);
    area.addEventListener('pointerleave', onLeave);
    area.addEventListener('dblclick', function (e) { if (L && inPlot(toSvg(e))) resetView(); });
    area.addEventListener('wheel', onWheel, { passive: false });
    area.addEventListener('keydown', onKey);
    area.addEventListener('blur', function () { if (!drag) hideHover(); });
    if (opts.toolbar !== false) root.querySelector('.ncp-toolbar').addEventListener('click', onToolbar);
    editEl.addEventListener('click', onToolbar);
    editEl.addEventListener('input', onEditInput);
    editEl.addEventListener('change', onEditInput);
    editEl.addEventListener('keydown', onEditKey);
    legendEl.addEventListener('click', onLegend);
    function onResize() {
      const w = width; size();
      if (width !== w) { hideHover(); render(); }
    }
    let ro = null;
    if (typeof win.ResizeObserver === 'function') { ro = new win.ResizeObserver(onResize); ro.observe(area); }
    else win.addEventListener('resize', onResize);

    size();
    render();
    return ctrl;
  };
})(typeof window !== 'undefined' ? window : globalThis);
