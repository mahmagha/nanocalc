/* Projects (js/projects.js), the designer's target-peak solver, protocol bench helpers and calculator check labels. */
'use strict';
module.exports = function (t) {
  const { NC, ok, near, throwsInput } = t;
  const P = NC.projects, D = NC.designer;
  const example = (id) => {
    const def = NC.byId[id];
    const e = typeof def.example === 'function' ? def.example() : def.example || {};
    const v = {};
    def.inputs.forEach((i) => { v[i.id] = e[i.id] !== undefined ? e[i.id] : i.value; });
    return [def, v];
  };

  /* ---- projects ---- */
  const p = P.create('Test project');
  ok(P.active().id === p.id, 'a new project becomes the active one');
  ok(P.get(p.id).name === 'Test project' && P.list().some((x) => x.id === p.id), 'stored and listed');
  const d = D.defaults();
  d.ligand = { key: 'PEG-thiol', mode: 'density', value: 1, Mw: 5000, a: 0.35, excess: 1 };
  P.setDesign(p.id, d);
  P.addProtocol(p.id, 'citrate-gold', 10);
  P.addProtocol(p.id, 'citrate-gold', 25);
  ok(P.get(p.id).protocols.length === 1 && P.get(p.id).protocols[0].volumeMl === 25, 'adding a protocol again updates its batch');
  ['dls', 'psd', 'haiss', 'tga', 'zeta'].forEach((id) => { const [def, v] = example(id); P.addMeasurement(p.id, def, { a: '1' }, def.compute(v)); });
  P.addManual(p.id, 'lam', 541, 'spectrometer');
  throwsInput(() => P.addManual(p.id, 'lam', -1), 'a negative measured value is refused');
  const pr = P.predict(d), cmp = P.compare(P.get(p.id));
  near(pr.core, 20, 1e-12, 'predicted core diameter = design core');
  near(pr.outer, 50, 1e-12, 'predicted inorganic diameter = core + 2 × shell');
  const lig = D.compute(d).ligand;
  near(pr.dh, 50 + 2 * lig.thickness, 1e-12, 'predicted hydrodynamic diameter = inorganic + 2 × ligand shell');
  const row = (q) => cmp.rows.find((r) => r.q === q);
  ok(row('dh').measured.length === 1 && /DLS/.test(row('dh').measured[0].how), 'DLS result is matched to the hydrodynamic diameter');
  ok(row('outer').measured.length === 1 && /TEM/.test(row('outer').measured[0].how), 'TEM size distribution is matched to the inorganic diameter');
  ok(row('core').measured.length === 1 && /Haiss/.test(row('core').measured[0].how), 'Haiss diameter is matched to the core');
  ok(row('ligands').measured.length === 1, 'TGA ligands per particle are matched');
  near(row('lam').measured[0].deviation, (541 - pr.lam) / pr.lam, 1e-12, 'deviation = (measured − predicted)/predicted');
  ok(!cmp.rows.some((r) => r.measured.some((m) => /zeta/i.test(m.how))), 'zeta potential is kept but has no prediction to compare with');
  const md = P.toMarkdown(P.get(p.id));
  ok(/^# Test project/.test(md) && /\| Hydrodynamic diameter \|/.test(md) && /## Measurements/.test(md), 'Markdown report has the comparison table and measurements');
  ok(/Au 20 nm @ SiO₂ 15 nm \+ PEG-thiol/.test(P.designSummary(d)), 'design summary: ' + P.designSummary(d));
  const json = P.exportJSON(P.get(p.id));
  P.remove(p.id);
  ok(P.get(p.id) === null && !P.active(), 'removed, and no longer active');
  const q = P.importJSON(json);
  ok(q.name === 'Test project' && q.measurements.length === 6 && q.design.core.D === 20, 'export → import round trip');
  throwsInput(() => P.importJSON('{"format":"other"}'), 'a file that is not a project is refused');
  throwsInput(() => P.importJSON('not json'), 'a file that is not JSON is refused');
  P.remove(q.id);

  /* prefilled calculator inputs */
  const pre = P.prefill('nanoparticle', d);
  ok(pre.struct === 'coreshell' && pre.mat === 'Au' && pre.D === '20' && pre.smat === 'SiO2' && pre.ts === '15', 'builder: core–shell from the design');
  const sed = P.prefill('sediment', d);
  ok(sed.D === '50' && Math.abs(Number(sed.rho) - 3.29568) < 1e-4, 'sedimentation: outer diameter and the particle’s mean density');
  ok(P.prefill('mie', d).nmed === '1.333', 'Mie: medium index from the design');
  ok(P.prefill('icp2n', null, 'Au').mat === 'Au', 'ICP: material from a protocol when there is no design');
  Object.keys(pre).forEach((k) => ok(NC.byId.nanoparticle.inputs.some((i) => i.id === k), 'prefill only sets fields the calculator has: ' + k));

  /* ---- designer: target peak ---- */
  const r = D.solvePeak(D.defaults(), 535, 'shell:0');
  const d2 = JSON.parse(JSON.stringify(D.defaults())); d2.shells[0].t = r.value;
  near(D.peakLambda(d2), 535, 1e-3, 'shell thickness found puts λ_max at the target (' + r.value + ' nm)');
  const bare = Object.assign({}, D.defaults(), { shells: [] });
  const c = D.solvePeak(bare, 530, 'core');
  const d3 = JSON.parse(JSON.stringify(bare)); d3.core.D = c.value;
  near(D.peakLambda(d3), 530, 1e-3, 'core diameter found puts λ_max at the target (' + c.value + ' nm)');
  throwsInput(() => D.solvePeak(D.defaults(), 700, 'shell:0'), 'an unreachable target says so');
  throwsInput(() => D.solvePeak(D.defaults(), 1000, 'core'), 'a target outside the wavelength range says so');
  ok(r.steps.length === 2 && r.evaluations < 80, 'solver shows its steps and needs few spectra (' + r.evaluations + ')');

  /* ---- protocols at the bench ---- */
  const V = NC.protocolsView;
  ok(V.parseDuration('≈ 1 h') === 3600 && V.parseDuration('≈ 2 min stirring') === 120 && V.parseDuration('45 s') === 45, 'step times are read from the text');
  ok(V.parseDuration('several minutes (see paper)') === null, 'no timer when the time has no number');
  const shop = V.shoppingList([{ id: 'citrate-gold', volumeMl: 10 }, { id: 'citrate-gold', volumeMl: 10 }]);
  const one = NC.protocolScale(NC.protocolById['citrate-gold'], 10, {}).reagents.find((x) => /citrate dihydrate/.test(x.name));
  ok(new RegExp(NC.fmt(2 * one.massG * 1000, 4).replace('.', '\\.') + ' mg').test(shop), 'combined reagent list adds amounts across batches');

  /* ---- calculator check labels ---- */
  Object.keys(NC.validation).forEach((id) => ok(NC.byId[id] && NC.validation[id].by, 'validation label for an existing calculator: ' + id));
};
