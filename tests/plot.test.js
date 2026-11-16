/* Tests for js/plot.js: static SVG output and the pure helpers behind the interactive plot (NC.plotUtil). */
'use strict';
module.exports = function (t) {
  const { NC, ok, near } = t;
  const P = NC.plotUtil;
  ok(P && typeof NC.plot === 'function' && typeof NC.plotMount === 'function', 'NC.plot, NC.plotMount and NC.plotUtil are exposed');
  if (!P) return;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const vals = (ts) => ts.map((x) => x.v);

  /* linear ticks */
  {
    const a = P.linearTicks(0, 10, 6, true);
    ok(same(a.ticks, [0, 2, 4, 6, 8, 10]) && a.step === 2, 'linear ticks 0..10: 0, 2, ..., 10 (got ' + a.ticks + ')');
    const b = P.linearTicks(0.13, 0.87, 6, true);
    ok(same(b.ticks, [0, 0.2, 0.4, 0.6, 0.8, 1]) && b.lo === 0 && b.hi === 1, 'auto range 0.13..0.87 widens to 0..1 by 0.2 (got ' + b.ticks + ')');
    const c = P.linearTicks(2.3, 4.7, 6, false);
    ok(same(c.ticks, [2.5, 3, 3.5, 4, 4.5]) && c.lo === 2.3 && c.hi === 4.7, 'zoomed range 2.3..4.7 keeps its limits, ticks by 0.5 inside (got ' + c.ticks + ')');
    const d = P.linearTicks(-37, 52, 6, true);
    ok(same(d.ticks, [-40, -20, 0, 20, 40, 60]), 'ticks across zero: −40..60 by 20 (got ' + d.ticks + ')');
    const e = P.linearTicks(5, 5, 6, true);
    ok(e.lo < 5 && e.hi > 5, 'a single value gets a non-empty range');
    ok(P.tickLabel(0.30000000000000004, 0.1) === '0.3' && P.tickLabel(-2, 1) === '−2', 'tick labels: rounding and a true minus sign');
  }

  /* log ticks */
  {
    const a = P.logTicks(1, 100).filter((x) => !x.minor);
    ok(same(vals(a), [1, 10, 100]) && same(a.map((x) => x.label), ['10⁰', '10¹', '10²']), 'log ticks 1..100: decades labelled 10⁰, 10¹, 10² (got ' + a.map((x) => x.label) + ')');
    const am = P.logTicks(1, 100).filter((x) => x.minor);
    ok(am.length === 16 && am[0].v === 2 && am[15].v === 90, 'log 1..100 has minor lines at 2..9 and 20..90');
    const b = P.logTicks(1e-3, 1e12).filter((x) => x.label);
    ok(b.length <= 8 && b.every((x) => /^10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+$/.test(x.label)), 'many decades: at most 8 labelled decades (got ' + b.length + ')');
    ok(P.decadeLabel(-3) === '10⁻³' && P.decadeLabel(12) === '10¹²', 'decade labels with superscript exponents');
    const c = P.logTicks(1, 30).filter((x) => !x.minor);
    ok(same(vals(c), [1, 2, 5, 10, 20]), 'few decades: 1, 2, 5 steps (got ' + vals(c) + ')');
    ok(c[3].label === '10' && c[4].label === '20', '1-2-5 ticks have plain labels');
    const d = P.logTicks(2, 4);
    ok(d.length >= 3 && d.every((x) => x.v >= 2 && x.v <= 4), 'narrow log range falls back to linear ticks inside the range');
    ok(P.logFloor125(37) === 20 && P.logCeil125(37) === 50 && P.logCeil125(0.011) === 0.02 && P.logFloor125(0.5) === 0.5, '1-2-5 floor and ceiling');
  }

  /* axes: auto, fixed limits, zero, log, zoom view */
  {
    const a = P.axis(0.13, 0.87, { n: 6 });
    ok(a.lo === 0 && a.hi === 1 && a.ticks.length === 6, 'auto axis widens to nice limits');
    const b = P.axis(3, 8, { n: 6, zero: true });
    ok(b.lo === 0, 'zeroY starts the axis at zero');
    const c = P.axis(3, 8, { n: 6, min: 2.5, max: 9.5 });
    ok(c.lo === 2.5 && c.hi === 9.5, 'given limits are used exactly');
    const d = P.axis(3, 870, { log: true });
    ok(d.lo === 1 && d.hi === 1000 && d.log, 'log axis over > 2 decades widens to decades (1..1000)');
    const e = P.axis(3, 37, { log: true });
    ok(e.lo === 2 && e.hi === 50, 'log axis over < 2 decades widens to 1-2-5 values (2..50)');
    const f = P.axis(3, 870, { log: true, min: 0 });
    ok(f.lo === 1, 'a limit of 0 is ignored on a log axis');
    const g = P.axis(0, 100, { n: 6, view: [12.5, 40] });
    ok(g.lo === 12.5 && g.hi === 40 && g.ticks.every((x) => x.v >= 12.5 && x.v <= 40), 'zoom view is used exactly, ticks inside it');
  }

  /* data range and log availability */
  {
    const s = [{ mode: 'line', points: [[1, 5], [2, -3], [3, NaN], [4, 8]] }, { mode: 'bars', points: [[10, 12, 4]] }];
    const r = P.dataRange(s, false, false);
    ok(r.xlo === 1 && r.xhi === 12 && r.ylo === -3 && r.yhi === 8 && !r.empty, 'data range over lines and bars, NaN skipped');
    const rl = P.dataRange([{ mode: 'line', points: [[0, 1], [1, 10], [2, 100]] }], true, true);
    ok(rl.xlo === 1 && rl.xhi === 2 && rl.ylo === 10, 'log range ignores values ≤ 0 (the point at x = 0 is dropped)');
    ok(P.dataRange([{ mode: 'bars', points: [[1, 2, 5]] }], false, false).ylo === 0, 'bars include the zero baseline');
    ok(P.dataRange([{ mode: 'line', points: [] }], false, false).empty, 'no points: empty range');
    ok(!P.canLog(s, 'y') && P.canLog(s, 'x'), 'log y refused for negative data, log x allowed');
    ok(P.canLog([{ mode: 'bars', points: [[1, 2, 0], [2, 3, 5]] }], 'y'), 'empty bars (height 0) do not block log y');
    ok(!P.canLog([{ mode: 'line', points: [[0, 1], [1, 2]] }], 'x'), 'x = 0 blocks log x');
  }

  /* scales, inversion, zoom and pan math */
  {
    const X = P.scale(0, 10, 100, 200, false);
    ok(X(0) === 100 && X(5) === 150 && X(10) === 200, 'linear scale');
    const Y = P.scale(1, 1000, 300, 0, true);
    near(Y(10), 200, 1e-12, 'log scale puts 10 a third of the way from 1 to 1000');
    near(P.invert(200, 1, 1000, 300, 0, true), 10, 1e-12, 'log inversion');
    near(P.invert(150, 0, 10, 100, 200, false), 5, 1e-12, 'linear inversion');
    const z = P.zoomRange(0, 10, 2, 0.5, false);
    ok(z[0] === 1 && z[1] === 6, 'zoom ×0.5 around 2 keeps 2 fixed: 0..10 → 1..6');
    const zl = P.zoomRange(1, 10000, 100, 0.5, true);
    near(zl[0], 10, 1e-12, 'log zoom lower'); near(zl[1], 1000, 1e-12, 'log zoom upper');
    ok(same(P.zoomRange(1, 1 + 1e-13, 1, 0.5, false), [1, 1 + 1e-13]), 'zoom stops at the floating-point limit');
    ok(same(P.panRange(0, 10, 0.1, false), [1, 11]), 'pan by 10 % of the span');
    const pl = P.panRange(1, 100, 0.5, true);
    near(pl[0], 10, 1e-12, 'log pan lower'); near(pl[1], 1000, 1e-12, 'log pan upper');
  }

  /* nearest point */
  {
    const px = [10, 20, NaN, 40, 50], py = [5, 5, 5, 100, 5];
    ok(P.nearestIndex(px, py, 33, 0, true) === 3, 'nearest by x skips gaps');
    ok(P.nearestIndex(px, py, 41, 0, false) === 1 || P.nearestIndex(px, py, 41, 0, false) === 4, 'nearest in the plane prefers points close in y');
    ok(P.nearestIndex(px, py, 45, 0, false) === 4, 'nearest in the plane');
    ok(P.nearestIndex([NaN], [NaN], 1, 1, true) === -1, 'no valid point gives −1');
    ok(P.nearestIndex([10, 10], [50, 5], 10, 0, true) === 1, 'ties in x are broken by y');
  }

  /* CSV */
  {
    const csv = P.toCSV([{ name: 'a, "b"', mode: 'line', points: [[1, 2], [3, NaN], [4, 5e-7]] }]);
    ok(csv === 'series,x,y\n"a, ""b""",1,2\n"a, ""b""",4,5e-7\n', 'CSV quotes names and skips non-finite points (got ' + JSON.stringify(csv) + ')');
    const cb = P.toCSV([{ name: 'h', mode: 'bars', points: [[0, 2, 3]] }, { mode: 'markers', points: [[1, 1]] }]);
    ok(cb === 'series,x,y,x_low,x_high\nh,1,3,0,2\nSeries 2,1,1,,\n', 'CSV of bars: centre, height and bin edges (got ' + JSON.stringify(cb) + ')');
  }

  /* effective spec: hidden series, kept curves, edits, log validity */
  {
    const spec = { title: 'T', xlabel: 'x', ylabel: 'y', ymin: 0, series: [{ name: 'A', mode: 'line', points: [[1, 1], [2, 4]] }, { name: 'B', mode: 'markers', color: 1, points: [[1, -2]] }] };
    const st = P.newState();
    let e = P.effective(spec, st);
    ok(e.series.length === 2 && !e.canLogY && e.canLogX, 'all series shown; negative B blocks log y');
    st.hidden.B = true; st.logy = true;
    e = P.effective(spec, st);
    ok(e.series.length === 1 && e.canLogY && e.logy, 'hiding B enables log y');
    st.kept.push({ label: 'kept 1: A', mode: 'line', color: 0, points: [[1, 2], [2, 3]] });
    st.edits = { title: 'New', xmin: 0.5, mode: 'markers' };
    e = P.effective(spec, st);
    ok(e.series.length === 2 && e.series[1].kept && e.series[1].name === 'kept 1: A', 'kept curve appended with its label');
    ok(e.title === 'New' && e.xlabel === 'x' && e.xmin === 0.5 && e.ymin === 0, 'edited title and limit, others from the spec');
    ok(e.series.every((s) => s.mode === 'markers'), 'mode override draws every series as markers');
    ok(P.toCSV(e.series).split('\n').length === 6, 'CSV includes visible and kept series only');
  }

  /* static SVG */
  {
    const spec = { title: 'Test <plot>', xlabel: 'Wavelength (nm)', ylabel: 'A', series: [
      { name: 'line', mode: 'line', markers: true, points: Array.from({ length: 50 }, (_, i) => [400 + i * 5, Math.sin(i / 8)]) },
      { name: 'pts', mode: 'markers', hollow: true, color: 7, points: [[420, 0.5], [500, -0.5]] },
      { name: 'bars', mode: 'bars', color: 3, points: [[400, 450, 0.2], [450, 500, 0.6]] }] };
    const svg = NC.plot(spec);
    ok(svg.startsWith('<svg class="plot"') && svg.endsWith('</svg>'), 'static plot is an SVG string');
    ok(/role="img" aria-label="Test &lt;plot&gt;\. Horizontal axis: Wavelength \(nm\), /.test(svg), 'aria-label describes title and axes, escaped');
    ok(svg.indexOf('class="pt s2 hollow"') > 0, 'colour index wraps around the 5 series colours');
    ok(svg.indexOf('class="bar s3"') > 0 && svg.indexOf('class="line s0"') > 0 && svg.indexOf('class="pt s0"') > 0, 'bars, line and line markers drawn');
    ok(svg.indexOf('clip-path="url(#') > 0, 'data are clipped to the plot area');
    ok(svg.indexOf('class="axis0"') > 0, 'zero line drawn for data crossing zero');
    ok(NC.plot({ series: [{ mode: 'line', points: [] }] }) === '', 'no data: empty string');
    const lg = NC.plot({ logy: true, series: [{ mode: 'line', points: [[1, 1], [2, 1000]] }] });
    ok(lg.indexOf('10³') > 0 && lg.indexOf('(logarithmic)') > 0, 'spec.logy draws a log axis with decade labels');
    const gap = NC.plot({ series: [{ mode: 'line', points: [[0, 0], [1, NaN], [2, 1], [3, 2]] }] });
    const gapLine = (gap.match(/class="line s0" d="([^"]+)"/) || [])[1] || '';
    ok((gapLine.match(/M/g) || []).length === 2, 'non-finite values break the line (' + gapLine + ')');
  }

  /* speed of the geometry used by update(): 2000-point line */
  {
    const pts = Array.from({ length: 2000 }, (_, i) => [i, Math.sin(i / 50)]);
    const spec = { series: [{ name: 'a', mode: 'line', points: pts }, { name: 'b', mode: 'markers', points: pts.slice(0, 500) }] };
    const t0 = Date.now();
    for (let k = 0; k < 20; k++) NC.plot(spec);
    const ms = (Date.now() - t0) / 20;
    // typical: 5–15 ms; the limit only catches pathological slowness (busy CI machines vary by 2–3×)
    ok(ms < 100, 'a 2000-point plot renders in ' + ms.toFixed(1) + ' ms (< 100 ms in Node)');
  }
};
