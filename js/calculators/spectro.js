/* Raman (graphene / nanographite) and XPS quantification. */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt;

  /* ================================================================== */
  /* Raman ID/IG                                                          */
  /* ================================================================== */
  NC.register({
    id: 'raman',
    category: 'spectro',
    title: 'Raman I_D/I_G analysis of graphene & nanographite',
    short: 'Crystallite size L_a or defect spacing L_D and density from I_D/I_G',
    description:
      'Turns the Raman D-to-G intensity ratio into either the in-plane crystallite size L_a of nanographite (Cançado et al., 2006) or the mean distance between point defects L_D and the defect density n_D in graphene (Cançado et al., 2011). Both corrections account for the excitation wavelength.',
    refs: ['cancado2006', 'cancado2011', 'codata2018'],
    presets: [
      { label: '488 nm (Ar⁺)', values: { lam: 488 } },
      { label: '514.5 nm (Ar⁺)', values: { lam: 514.5 } },
      { label: '532 nm (Nd:YAG ×2)', values: { lam: 532 } },
      { label: '633 nm (He–Ne)', values: { lam: 632.8 } }
    ],
    inputs: [
      NC.sel('mode', 'Calculate', [['La', 'Crystallite size L_a (nanographite)'], ['LD', 'Defect distance L_D and density n_D (graphene)']], 'La'),
      NC.num('lam', 'Laser excitation wavelength λ_L', 'nm', 514.5),
      NC.num('ratio', 'Intensity ratio I_D / I_G', '', 0.5)
    ],
    presetNote: 'Cançado et al. (2006) used integrated intensities (peak areas) for I_D/I_G. Use the same ratio definition as the paper whose equation you apply.',
    example: { mode: 'La', lam: 514.5, ratio: 0.5 },
    compute: function (v) {
      const s = new NC.Steps();
      const lam = NC.need(v.lam, 'Laser wavelength', { positive: true });
      const r = NC.need(v.ratio, 'I_D/I_G', { positive: true });
      const EL = NC.HC_EV_NM / lam;
      const l4 = Math.pow(lam, 4);
      s.add({ title: 'Excitation energy (for reference)', formula: 'E_L = hc / λ_L', tex: "E_L = \\dfrac{hc}{\\lambda_L}", sub: 'E_L = ' + f(NC.HC_EV_NM, 7) + ' / ' + f(lam), result: 'E_L = ' + f(EL) + ' eV;   λ_L⁴ = ' + f(l4) + ' nm⁴', ref: 'codata2018' });
      if (v.mode === 'LD') {
        const LD = Math.sqrt((1.8e-9 * l4) / r);
        const LDlo = Math.sqrt((1.3e-9 * l4) / r), LDhi = Math.sqrt((2.3e-9 * l4) / r);
        s.add({ title: 'Mean distance between defects (low-defect regime)', formula: 'L_D² [nm²] = (1.8 ± 0.5)×10⁻⁹ · λ_L⁴ · (I_D/I_G)⁻¹', tex: "L_D^2\\,[\\text{nm}^2] = (1.8 \\pm 0.5)\\times 10^{-9}\\,\\dfrac{\\lambda_L^4}{I_D/I_G}", sub: 'L_D² = 1.8×10⁻⁹ × ' + f(l4) + ' / ' + f(r), result: 'L_D = ' + f(LD) + ' nm  (range ' + f(LDlo) + '–' + f(LDhi) + ' nm)', ref: 'cancado2011' });
        const nD = (1.8e22 / l4) * r;
        const nlo = (1.3e22 / l4) * r, nhi = (2.3e22 / l4) * r;
        s.add({ title: 'Defect density', formula: 'n_D [cm⁻²] = (1.8 ± 0.5)×10²² / λ_L⁴ · (I_D/I_G)', tex: "n_D\\,[\\text{cm}^{-2}] = \\dfrac{(1.8 \\pm 0.5)\\times 10^{22}}{\\lambda_L^4}\\,\\dfrac{I_D}{I_G}", sub: 'n_D = 1.8×10²² / ' + f(l4) + ' × ' + f(r), result: 'n_D = ' + f(nD) + ' cm⁻²  (range ' + f(nlo) + '–' + f(nhi) + ')', ref: 'cancado2011' });
        const warnings = [];
        if (LD < 10) warnings.push('L_D < 10 nm. These equations hold only in the low-defect regime (L_D ≳ 10 nm). At higher defect densities I_D/I_G decreases again, so the result is not valid here.');
        return {
          results: [
            { label: 'Defect distance L_D', value: LD, unit: 'nm', main: true },
            { label: 'Defect density n_D', value: nD, unit: 'cm⁻²', main: true },
            { label: 'L_D range (±0.5 in prefactor)', value: f(LDlo) + '–' + f(LDhi), unit: 'nm' },
            { label: 'n_D range', value: f(nlo) + '–' + f(nhi), unit: 'cm⁻²' }
          ],
          steps: s.items,
          warnings: warnings
        };
      }
      const La = (2.4e-10 * l4) / r;
      s.add({ title: 'In-plane crystallite size of nanographite', formula: 'L_a [nm] = 2.4×10⁻¹⁰ · λ_L⁴ · (I_D/I_G)⁻¹', tex: "L_a\\,[\\text{nm}] = 2.4\\times 10^{-10}\\,\\dfrac{\\lambda_L^4}{I_D/I_G}", sub: 'L_a = 2.4×10⁻¹⁰ × ' + f(l4) + ' / ' + f(r), result: 'L_a = ' + f(La) + ' nm', ref: 'cancado2006' });
      const curve = [];
      for (let x = 0.05; x <= 3; x += 0.02) curve.push([x, (2.4e-10 * l4) / x]);
      return {
        results: [{ label: 'Crystallite size L_a', value: La, unit: 'nm', main: true }, { label: 'Excitation energy E_L', value: EL, unit: 'eV' }],
        steps: s.items,
        plots: [{ title: 'L_a versus I_D/I_G', xlabel: 'I_D / I_G', ylabel: 'L_a (nm)', series: [{ name: 'λ_L = ' + f(lam) + ' nm', mode: 'line', points: curve }, { name: 'This sample', mode: 'markers', points: [[r, La]], color: 1, size: 5 }], ymin: 0, ymax: Math.min(Math.max(La * 2, 50), 1000) }],
        notes: ['This equation was established for nanographitic (polycrystalline) samples with L_a roughly 20–500 nm. For point defects in otherwise crystalline graphene, use the L_D mode.']
      };
    }
  });

  /* ================================================================== */
  /* XPS quantification                                                   */
  /* ================================================================== */
  NC.register({
    id: 'xps',
    category: 'spectro',
    title: 'XPS surface composition',
    short: 'Atomic percentages from peak areas and sensitivity factors',
    description:
      'Calculates the surface atomic composition from background-subtracted XPS peak areas and relative sensitivity factors (RSFs), assuming a homogeneous sample within the information depth.',
    refs: ['wagner1981'],
    inputs: [
      NC.data('rows', 'Peaks: label, peak area, RSF', '', { rows: 6, placeholder: 'C 1s, 12500, 0.25', full: true })
    ],
    example: { rows: '# label, area (CPS·eV), RSF  — illustrative RSFs only\nC 1s, 12500, 0.25\nO 1s, 38200, 0.66\nTi 2p, 21800, 1.8' },
    compute: function (v) {
      const s = new NC.Steps();
      const rows = NC.parseRows(v.rows, { label: true, min: 2, max: 2, labels: ['area', 'RSF'], name: 'Peaks' });
      if (rows.length < 1) NC.fail('Enter at least one peak.');
      rows.forEach(function (r) {
        if (!(r[0] >= 0)) NC.fail('Peak areas cannot be negative (' + r.label + ').');
        if (!(r[1] > 0)) NC.fail('RSF must be positive (' + r.label + ').');
      });
      const norm = rows.map(function (r) { return r[0] / r[1]; });
      const total = NC.stats.sum(norm);
      if (!(total > 0)) NC.fail('All normalized intensities are zero.');
      s.add({ title: 'Sensitivity-normalized intensities', formula: 'Iᵢ′ = Iᵢ / Sᵢ', tex: "I_i' = \\dfrac{I_i}{S_i}", sub: rows.map(function (r, i) { return r.label + ': ' + f(r[0]) + ' / ' + f(r[1]) + ' = ' + f(norm[i]); }).join(';   '), ref: 'wagner1981' });
      const at = norm.map(function (x) { return (100 * x) / total; });
      s.add({ title: 'Atomic fractions', formula: 'Cᵢ = (Iᵢ/Sᵢ) / Σⱼ(Iⱼ/Sⱼ) × 100 %', tex: "C_i = \\dfrac{I_i/S_i}{\\sum_j I_j/S_j}\\times 100\\,\\%", sub: 'Σ = ' + f(total), result: rows.map(function (r, i) { return r.label + ' = ' + NC.fix(at[i], 2) + ' at.%'; }).join(';   '), ref: 'wagner1981' });
      return {
        results: rows.map(function (r, i) { return { label: r.label, value: at[i], unit: 'at.%', main: i < 4 }; }),
        steps: s.items,
        tables: [{ title: 'Composition', columns: ['Peak', 'Area', 'RSF', 'Area/RSF', 'at.%'], rows: rows.map(function (r, i) { return [r.label, f(r[0]), f(r[1]), f(norm[i]), NC.fix(at[i], 2)]; }) }],
        plots: [{ title: 'Atomic composition', xlabel: 'Peak (in table order)', ylabel: 'at.%', series: [{ name: 'at.%', mode: 'bars', points: at.map(function (a, i) { return [i + 0.6, i + 1.4, a]; }) }], zeroY: true, xmin: 0.4, xmax: rows.length + 0.6 }],
        notes: [
          'RSFs depend on your instrument, analyser transmission function and software, and must match the peak-area definition used. The example values are illustrative only. Wagner et al. (1981) give empirical factors relative to F 1s.',
          'XPS probes only the top ~5–10 nm. For core–shell or coated nanoparticles the composition is not uniform with depth, so these values are apparent compositions.'
        ]
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
