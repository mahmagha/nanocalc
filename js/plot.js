/*
 * Minimal dependency-free SVG plotter.
 * spec = { title, xlabel, ylabel, series: [{ name, mode: 'markers'|'line'|'bars', points, color }],
 *          xmin, xmax, ymin, ymax, zeroY }
 * points: [[x, y], ...]; for bars: [[x0, x1, height], ...]
 */
(function (global) {
  'use strict';
  const NC = global.NC;

  function niceNum(range, round) {
    const exp = Math.floor(Math.log10(range));
    const f = range / Math.pow(10, exp);
    let nf;
    if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
    else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf * Math.pow(10, exp);
  }
  function ticks(lo, hi, n) {
    if (lo === hi) { lo -= 1; hi += 1; }
    const range = niceNum(hi - lo, false);
    const step = niceNum(range / (n - 1), true);
    const start = Math.floor(lo / step) * step;
    const end = Math.ceil(hi / step) * step;
    const out = [];
    for (let v = start; v <= end + step * 0.5; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return { ticks: out, lo: start, hi: end, step: step };
  }
  function tickLabel(v, step) {
    const a = Math.abs(v);
    if (v === 0) return '0';
    if (a >= 1e5 || a < 1e-3) return NC.fmt(v, 2);
    const dec = Math.max(0, -Math.floor(Math.log10(step)));
    return v.toFixed(Math.min(dec, 6)).replace('-', '−');
  }

  NC.plot = function (spec) {
    const W = 640, H = 360;
    const m = { l: 70, r: 18, t: 18, b: 52 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const xs = [], ys = [];
    spec.series.forEach(function (s) {
      s.points.forEach(function (p) {
        if (s.mode === 'bars') { xs.push(p[0], p[1]); ys.push(0, p[2]); }
        else if (isFinite(p[0]) && isFinite(p[1])) { xs.push(p[0]); ys.push(p[1]); }
      });
    });
    if (!xs.length) return '';
    let xlo = spec.xmin !== undefined ? spec.xmin : Math.min.apply(null, xs);
    let xhi = spec.xmax !== undefined ? spec.xmax : Math.max.apply(null, xs);
    let ylo = spec.ymin !== undefined ? spec.ymin : Math.min.apply(null, ys);
    let yhi = spec.ymax !== undefined ? spec.ymax : Math.max.apply(null, ys);
    if (spec.zeroY && ylo > 0) ylo = 0;
    const tx = ticks(xlo, xhi, 7);
    const ty = ticks(ylo, yhi, 6);
    if (spec.xmin === undefined) xlo = tx.lo;
    if (spec.xmax === undefined) xhi = tx.hi;
    if (spec.ymin === undefined) ylo = ty.lo;
    if (spec.ymax === undefined) yhi = ty.hi;
    const X = function (v) { return m.l + ((v - xlo) / (xhi - xlo || 1)) * pw; };
    const Y = function (v) { return m.t + ph - ((v - ylo) / (yhi - ylo || 1)) * ph; };
    const clipId = 'clip' + Math.random().toString(36).slice(2, 8);

    let g = '';
    // grid + ticks
    tx.ticks.forEach(function (v) {
      if (v < xlo - 1e-12 || v > xhi + 1e-12) return;
      g += '<line class="grid" x1="' + X(v) + '" x2="' + X(v) + '" y1="' + m.t + '" y2="' + (m.t + ph) + '"/>';
      g += '<text class="tick" x="' + X(v) + '" y="' + (m.t + ph + 18) + '" text-anchor="middle">' + tickLabel(v, tx.step) + '</text>';
    });
    ty.ticks.forEach(function (v) {
      if (v < ylo - 1e-12 || v > yhi + 1e-12) return;
      g += '<line class="grid" x1="' + m.l + '" x2="' + (m.l + pw) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/>';
      g += '<text class="tick" x="' + (m.l - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + tickLabel(v, ty.step) + '</text>';
    });
    g += '<rect class="frame" x="' + m.l + '" y="' + m.t + '" width="' + pw + '" height="' + ph + '"/>';
    if (ylo < 0 && yhi > 0) g += '<line class="axis0" x1="' + m.l + '" x2="' + (m.l + pw) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>';

    let body = '';
    spec.series.forEach(function (s, i) {
      const cls = 's' + (s.color !== undefined ? s.color : i);
      if (s.mode === 'bars') {
        s.points.forEach(function (p) {
          const x0 = X(p[0]), x1 = X(p[1]);
          body += '<rect class="bar ' + cls + '" x="' + (x0 + 0.5) + '" y="' + Y(p[2]) + '" width="' + Math.max(0, x1 - x0 - 1) + '" height="' + Math.max(0, Y(0) - Y(p[2])) + '"/>';
        });
      } else if (s.mode === 'line') {
        const d = s.points
          .filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); })
          .map(function (p, j) { return (j ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); })
          .join('');
        body += '<path class="line ' + cls + (s.dashed ? ' dashed' : '') + '" d="' + d + '"/>';
      } else {
        s.points.forEach(function (p) {
          if (!isFinite(p[0]) || !isFinite(p[1])) return;
          body += '<circle class="pt ' + cls + (s.hollow ? ' hollow' : '') + '" cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="' + (s.size || 3.5) + '"/>';
        });
      }
    });

    // legend
    let legend = '';
    const named = spec.series.filter(function (s) { return s.name; });
    if (named.length > 1 || (named.length === 1 && spec.legend)) {
      let ly = m.t + 10;
      named.forEach(function (s) {
        const i = spec.series.indexOf(s);
        const cls = 's' + (s.color !== undefined ? s.color : i);
        const lx = m.l + pw - 170;
        legend += s.mode === 'line'
          ? '<line class="line ' + cls + (s.dashed ? ' dashed' : '') + '" x1="' + lx + '" x2="' + (lx + 18) + '" y1="' + ly + '" y2="' + ly + '"/>'
          : s.mode === 'bars'
            ? '<rect class="bar ' + cls + '" x="' + lx + '" y="' + (ly - 5) + '" width="18" height="10"/>'
            : '<circle class="pt ' + cls + '" cx="' + (lx + 9) + '" cy="' + ly + '" r="3.5"/>';
        legend += '<text class="legend" x="' + (lx + 24) + '" y="' + (ly + 4) + '">' + NC.esc(s.name) + '</text>';
        ly += 18;
      });
      legend = '<g class="legend-box">' + legend + '</g>';
    }

    const labels =
      '<text class="axlabel" x="' + (m.l + pw / 2) + '" y="' + (H - 10) + '" text-anchor="middle">' + NC.esc(spec.xlabel || '') + '</text>' +
      '<text class="axlabel" transform="translate(16,' + (m.t + ph / 2) + ') rotate(-90)" text-anchor="middle">' + NC.esc(spec.ylabel || '') + '</text>';

    return '<svg class="plot" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + NC.esc(spec.title || 'Plot') + '">' +
      '<defs><clipPath id="' + clipId + '"><rect x="' + m.l + '" y="' + m.t + '" width="' + pw + '" height="' + ph + '"/></clipPath></defs>' +
      g + '<g clip-path="url(#' + clipId + ')">' + body + '</g>' + legend + labels + '</svg>';
  };
})(typeof window !== 'undefined' ? window : globalThis);
