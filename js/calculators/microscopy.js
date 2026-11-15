/* Electron microscopy: particle size distribution statistics. */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt, S = NC.stats;

  function exampleData() {
    const rand = NC.rng(20241115);
    const mu = Math.log(12), sg = Math.log(1.15);
    const out = [];
    for (let i = 0; i < 250; i++) out.push(Math.exp(mu + sg * NC.randn(rand)).toFixed(2));
    let lines = [];
    for (let i = 0; i < out.length; i += 10) lines.push(out.slice(i, i + 10).join(', '));
    return '# Diameters in nm (synthetic lognormal: geometric mean 12 nm, σg = 1.15)\n' + lines.join('\n');
  }

  NC.register({
    id: 'psd',
    category: 'micro',
    title: 'Particle size distribution (TEM/SEM)',
    short: 'Mean, spread, moment diameters and lognormal fit from measured diameters',
    description:
      'Paste the particle diameters you measured from TEM or SEM images (e.g. with ImageJ) to get the number-weighted statistics, ISO 9276-2 moment-mean diameters, a lognormal fit and a histogram.',
    refs: ['iso9276', 'limpert2001', 'freedman1981', 'rice2013', 'schneider2012'],
    inputs: [
      NC.data('d', 'Measured diameters (nm)', '', { rows: 10, placeholder: 'One value per line, or separated by commas/spaces/tabs', full: true }),
      NC.num('bins', 'Number of histogram bins', '', 0, { help: '0 = automatic (Freedman–Diaconis rule)' })
    ],
    example: function () { return { d: exampleData(), bins: 0 }; },
    compute: function (v) {
      const s = new NC.Steps();
      const d = NC.parseList(v.d, 'Diameters');
      if (d.length < 2) NC.fail('Enter at least two diameters.');
      if (d.some(function (x) { return !(x > 0); })) NC.fail('All diameters must be positive.');
      const n = d.length;
      const sorted = d.slice().sort(function (a, b) { return a - b; });
      const mean = S.mean(d), sd = S.sd(d), med = S.quantile(sorted, 0.5);
      const se = sd / Math.sqrt(n), t = S.t95(n - 1);
      s.add({ title: 'Number-weighted (arithmetic) mean', formula: 'D̄ = Σdᵢ / n', sub: 'D̄ = ' + f(S.sum(d)) + ' / ' + n, result: 'D̄ = ' + f(mean) + ' nm', ref: 'iso9276' });
      s.add({ title: 'Sample standard deviation and coefficient of variation', formula: 's = √[Σ(dᵢ − D̄)² / (n − 1)],   CV = s / D̄', result: 's = ' + f(sd) + ' nm;   CV = ' + NC.fix((sd / mean) * 100, 1) + ' %' });
      s.add({ title: '95 % confidence interval of the mean', formula: 'D̄ ± t₀.₉₇₅,ₙ₋₁ · s/√n', sub: 'SE = ' + f(sd) + ' / √' + n + ' = ' + f(se) + ' nm;   t = ' + f(t), result: 'D̄ = ' + f(mean) + ' ± ' + f(t * se) + ' nm', note: 'Covers only the random sampling error, not calibration or segmentation errors.' });
      const s2 = S.sum(d.map(function (x) { return x * x; }));
      const s3 = S.sum(d.map(function (x) { return x * x * x; }));
      const s4 = S.sum(d.map(function (x) { return x * x * x * x; }));
      const d32 = s3 / s2, d43 = s4 / s3;
      s.add({ title: 'Moment-ratio mean diameters', formula: 'D[3,2] = Σd³/Σd²  (surface-weighted, Sauter);   D[4,3] = Σd⁴/Σd³  (volume-weighted)', sub: 'D[3,2] = ' + f(s3) + ' / ' + f(s2) + ';   D[4,3] = ' + f(s4) + ' / ' + f(s3), result: 'D[3,2] = ' + f(d32) + ' nm;   D[4,3] = ' + f(d43) + ' nm', ref: 'iso9276' });
      const ln = d.map(Math.log);
      const mu = S.mean(ln), sl = S.sd(ln);
      const gm = Math.exp(mu), gsd = Math.exp(sl);
      s.add({ title: 'Lognormal fit (moments of ln d)', formula: 'μ = mean(ln dᵢ),  σ = sd(ln dᵢ);   D_g = e^μ,  σ_g = e^σ', sub: 'μ = ' + f(mu) + ',  σ = ' + f(sl), result: 'D_g = ' + f(gm) + ' nm;   σ_g = ' + f(gsd), note: 'About 68 % of particles lie between D_g/σ_g and D_g·σ_g.', ref: 'limpert2001' });

      let nb = Math.round(v.bins);
      const iqr = S.quantile(sorted, 0.75) - S.quantile(sorted, 0.25);
      const range = sorted[n - 1] - sorted[0];
      let h;
      if (!(nb > 0)) {
        h = 2 * iqr * Math.pow(n, -1 / 3);
        if (h > 0 && range > 0) {
          nb = Math.max(1, Math.ceil(range / h));
          s.add({ title: 'Histogram bin width (Freedman–Diaconis)', formula: 'h = 2·IQR·n^(−1/3)', sub: 'h = 2 × ' + f(iqr) + ' × ' + n + '^(−1/3)', result: 'h = ' + f(h) + ' nm  ⇒  ' + nb + ' bins', ref: 'freedman1981' });
        } else {
          nb = Math.ceil(Math.log2(n) + 1);
          s.add({ title: 'Histogram bins (Sturges rule, IQR is zero)', formula: 'k = ⌈log₂n + 1⌉', result: 'k = ' + nb });
        }
      }
      nb = Math.min(nb, 200);
      const lo = sorted[0], hi = range > 0 ? sorted[n - 1] : lo + 1;
      h = (hi - lo) / nb;
      const counts = new Array(nb).fill(0);
      d.forEach(function (x) { counts[Math.min(nb - 1, Math.floor((x - lo) / h))]++; });
      const bars = counts.map(function (c, i) { return [lo + i * h, lo + (i + 1) * h, c]; });
      const curve = [];
      const x0 = Math.max(lo - h, 1e-6), x1 = hi + h;
      for (let i = 0; i <= 200; i++) {
        const x = x0 + ((x1 - x0) * i) / 200;
        const pdf = Math.exp(-Math.pow(Math.log(x) - mu, 2) / (2 * sl * sl)) / (x * sl * Math.sqrt(2 * Math.PI));
        curve.push([x, n * h * pdf]);
      }
      const warnings = [];
      if (n < 100) warnings.push('Only ' + n + ' particles. Small samples give imprecise widths and moment diameters, so measure more particles if you can.');
      return {
        results: [
          { label: 'Mean diameter', value: mean, unit: 'nm', main: true },
          { label: 'Standard deviation', value: sd, unit: 'nm', main: true },
          { label: 'CV (polydispersity)', value: (sd / mean) * 100, unit: '%', main: true },
          { label: 'Particles counted n', value: n },
          { label: 'Median', value: med, unit: 'nm' },
          { label: '95 % CI half-width', value: t * se, unit: 'nm' },
          { label: 'Min / max', value: f(sorted[0]) + ' / ' + f(sorted[n - 1]), unit: 'nm' },
          { label: 'D[3,2]', value: d32, unit: 'nm' },
          { label: 'D[4,3]', value: d43, unit: 'nm' },
          { label: 'Geometric mean D_g', value: gm, unit: 'nm' },
          { label: 'Geometric SD σ_g', value: gsd }
        ],
        steps: s.items,
        warnings: warnings,
        plots: [{
          title: 'Size histogram', xlabel: 'Diameter (nm)', ylabel: 'Count',
          series: [{ name: 'Counts', mode: 'bars', points: bars }, { name: 'Lognormal fit', mode: 'line', points: curve, color: 1 }],
          zeroY: true
        }],
        notes: [
          'The uncertainty of the mean falls as 1/√n, so measure enough particles from several images and grid areas. See Rice et al. (2013) for how TEM sizing results vary between laboratories.',
          'Diameters can be measured with ImageJ/Fiji (Schneider et al., 2012). Report how particles were segmented and whether touching particles were excluded.'
        ]
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
