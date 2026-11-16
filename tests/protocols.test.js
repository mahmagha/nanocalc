/* Tests for js/protocols.js (PLAN.md Plan 4, workstream B: synthesis protocols). Pure logic and data only. */
'use strict';
module.exports = function (t) {
  const { NC, ok, near } = t;
  ok(Array.isArray(NC.protocols) && NC.protocols.length >= 10, 'protocol library loaded (' + (NC.protocols || []).length + ' protocols)');
  if (!NC.protocols) return;
  ok(NC.protocolsView && typeof NC.protocolsView.renderIndex === 'function' && typeof NC.protocolsView.renderProtocol === 'function', 'NC.protocolsView exposes renderIndex and renderProtocol');

  /* ---------- molar masses (IUPAC 2021 abridged atomic weights) ---------- */
  near(NC.molarMass('HAuCl4·3H2O'), 393.83, 1e-4, 'M(HAuCl4·3H2O)');
  near(NC.molarMass('Na3C6H5O7·2H2O'), 294.10, 1e-4, 'M(trisodium citrate dihydrate)');
  near(NC.molarMass('AgNO3'), 169.87, 1e-4, 'M(AgNO3)');
  near(NC.molarMass('Fe(C5H7O2)3'), 353.17, 1e-4, 'M(Fe(acac)3) with brackets');
  near(NC.molarMass('[(CH3)3Si]2S'), 178.44, 1e-4, 'M((TMS)2S) with nested brackets');
  near(NC.molarMass('FeCl3·6H2O') - NC.molarMass('FeCl3'), 6 * NC.molarMass('H2O'), 1e-12, 'hydrate water adds 6 × M(H2O)');
  near(NC.molarMass('CdO'), NC.materials.CdSe.M - 78.971 + 15.999, 1e-3, 'M(CdO) consistent with the CdSe material entry');
  ok(NC.formulaAtoms('HAuCl4·3H2O').H === 7 && NC.formulaAtoms('HAuCl4·3H2O').O === 3, 'hydrate atoms counted (H7 O3)');
  let threw = false;
  try { NC.molarMass('Xx2O'); } catch (e) { threw = true; }
  ok(threw, 'unknown element throws');

  /* ---------- data integrity ---------- */
  const ids = NC.protocols.map((p) => p.id);
  ok(new Set(ids).size === ids.length, 'protocol ids are unique');
  const roles = NC.protocolRoles.map((r) => r.id);
  const UNITS = ['M', 'mM', 'wt%', 'neat'];
  const AUNITS = ['mL', 'µL', 'mg', 'g', 'mmol'];
  NC.protocols.forEach((p) => {
    const w = p.id + ': ';
    ok(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id), w + 'id is kebab-case');
    ok(NC.protocolById[p.id] === p, w + 'indexed by id');
    ok(p.title && p.summary && p.sizeText, w + 'title, summary and size text');
    ok(Array.isArray(p.refs) && p.refs.length > 0, w + 'cites at least one reference');
    (p.refs || []).forEach((r) => ok(!!NC.refs[r], w + 'reference ' + r + ' exists'));
    NC.protocolRefIds(p).forEach((r) => ok(!!NC.refs[r], w + 'cited ' + r + ' exists'));
    ok(Array.isArray(p.makes) && p.makes.length > 0, w + 'says what it makes');
    p.makes.forEach((m) => {
      ok(roles.includes(m.role), w + 'makes-role ' + m.role + ' is known');
      if (m.role === 'ligand') ok(!!NC.protocolLigands[m.ligand], w + 'ligand key ' + m.ligand + ' is known');
      else ok(m.material === '*' || !!NC.materials[m.material], w + 'material ' + m.material + ' is an NC.materials key');
      (m.on || []).forEach((o) => ok(!!NC.materials[o], w + 'on-material ' + o + ' is an NC.materials key'));
      if (m.size) ok(m.size.length === 2 && m.size[0] > 0 && m.size[1] >= m.size[0], w + 'size range is [min, max] nm');
    });
    ok(Array.isArray(p.steps) && p.steps.length >= 3, w + 'has steps');
    p.steps.forEach((s, i) => {
      ok(typeof s.text === 'string' && s.text.length > 10, w + 'step ' + (i + 1) + ' has text');
      [].concat(s.ref || []).forEach((r) => ok(!!NC.refs[r], w + 'step ' + (i + 1) + ' cites existing ' + r));
    });
    if (p.tuning) [].concat(p.tuning.ref || []).forEach((r) => ok(!!NC.refs[r], w + 'tuning cites existing ' + r));
    ok(Array.isArray(p.reagents) && p.reagents.length > 0, w + 'has reagents');
    p.reagents.forEach((r) => {
      const rw = w + r.name + ': ';
      ok(typeof r.hazard === 'string' && r.hazard.length > 5, rw + 'has hazard text');
      ok(r.stock && UNITS.includes(r.stock.unit), rw + 'stock unit is one of ' + UNITS.join(', '));
      ok(AUNITS.includes(r.amountUnit), rw + 'amount unit is one of ' + AUNITS.join(', '));
      ok(r.amount === null || (typeof r.amount === 'number' && r.amount > 0), rw + 'amount is null ("as in the original") or positive');
      if (r.formula) {
        let M = NaN;
        try { M = NC.molarMass(r.formula); } catch (e) { ok(false, rw + e.message); }
        near(r.M, M, 2e-4, rw + 'stated M matches the formula ' + r.formula);
      } else ok(r.M === null || r.M === undefined, rw + 'no formula, so no molar mass');
      if (typeof r.amount === 'number' && r.stock.unit !== 'neat') ok(typeof r.stock.conc === 'number' && r.stock.conc > 0, rw + 'stock with an amount has a concentration');
    });
    ok(p.safety && p.safety.general.length > 0 && p.safety.waste.length > 0, w + 'general safety and waste notes');
    ok(p.expected && !!p.expected.colour, w + 'expected result');
    ok(Array.isArray(p.characterise) && p.characterise.length > 0, w + 'characterisation links');
    (p.characterise || []).forEach((c) => ok(!!NC.byId[c.calc], w + 'characterise links to existing calculator ' + c.calc));
    ok(Array.isArray(p.troubleshooting) && p.troubleshooting.every((x) => x.problem && x.cause && x.fix), w + 'troubleshooting entries complete');
    ok(Array.isArray(p.equipment) && p.equipment.length > 0, w + 'equipment');
    if (p.baseVolume !== null) ok(p.baseVolume > 0 && p.reagents.some((r) => typeof r.amount === 'number'), w + 'base volume with scalable amounts');
    else ok(p.reagents.every((r) => r.amount === null), w + 'no base volume means no fixed amounts');
    // Markdown export runs and carries the safety notice and every reference
    const md = NC.protocolMarkdown(p, p.baseVolume ? p.baseVolume * 2 : null);
    ok(md.indexOf('# ' + p.title) === 0 && /risk assessment/.test(md), w + 'Markdown has title and the risk-assessment notice');
    NC.protocolRefIds(p).forEach((r) => ok(md.indexOf(NC.refs[r].title) >= 0, w + 'Markdown lists reference ' + r));
  });
  // ciaaw2021 cited wherever molar masses appear
  ok(NC.protocolRefIds(NC.protocolById['citrate-gold']).indexOf('ciaaw2021') >= 0, 'molar masses cite IUPAC 2021 atomic weights');

  /* ---------- scaling ---------- */
  {
    const p = NC.protocolById['citrate-gold'];
    const s1 = NC.protocolScale(p, 100), s2 = NC.protocolScale(p, 250);
    near(s2.factor, 2.5, 1e-12, 'Turkevich 100 → 250 mL factor');
    s1.reagents.forEach((r, i) => { if (r.amount !== null) near(s2.reagents[i].amount, 2.5 * r.amount, 1e-12, 'linear scaling: ' + r.name); });
    // hand check: 1 wt % citrate, 12.5 mL → 0.125 g = 0.4250 mmol; default stock 25 mL → weigh 0.25 g, 25 g of solution
    const c = s2.reagents[2];
    near(c.amount, 12.5, 1e-12, 'citrate volume at 250 mL');
    near(c.massG, 0.125, 1e-12, 'citrate mass delivered');
    near(c.mmol, 0.125 / 294.10 * 1000, 1e-9, 'citrate amount of substance');
    ok(c.stockVolumeMl === 25, 'default stock volume rounds up to a 25 mL flask, got ' + c.stockVolumeMl);
    near(c.massToWeighG, 0.25, 1e-12, 'wt % stock: weigh 0.25 g for 25 mL');
    near(c.solutionMassG, 25, 1e-12, 'wt % stock: 25 g of solution');
    // HAuCl4 given in mmol (5 mg Au): mass = n·M, weighed directly
    const au = s1.reagents[0];
    near(au.massG, 0.02538 * 393.82 / 1000, 1e-9, 'gold precursor mass from mmol');
    near(au.massG * 196.97 / 393.82, 0.005, 1e-3, 'gold precursor contains 5 mg of Au');
    ok(au.weighDirect, 'neat solid is weighed directly');
  }
  {
    // Nanorods: seed stage is not scaled; ascorbic acid stock hand check
    const p = NC.protocolById['gold-nanorods-seed'];
    const s = NC.protocolScale(p, 2 * p.baseVolume);
    s.reagents.forEach((r, i) => {
      const base = p.reagents[i];
      if (base.amount === null) return;
      near(r.amount, base.scale === false ? base.amount : 2 * base.amount, 1e-12, 'nanorods: ' + (base.stage || '') + ' ' + r.name + (base.scale === false ? ' fixed' : ' doubled'));
    });
    const asc = NC.protocolScale(p, p.baseVolume).reagents.find((r) => /Ascorbic/.test(r.name));
    near(asc.volumeMl, 0.07, 1e-12, 'ascorbic acid 70 µL → 0.07 mL');
    near(asc.mmol, 0.0788 * 0.07, 1e-12, 'ascorbic acid delivered (mmol = M × mL)');
    ok(asc.stockVolumeMl === 10, 'small volumes get a 10 mL stock');
    near(asc.massToWeighG, 0.0788 * 0.010 * 176.12, 1e-12, 'ascorbic acid: weigh 0.1388 g for 10 mL of 0.0788 M');
  }
  {
    // Brust: 30 mL of 30 mM HAuCl4 = 0.9 mmol; stock override
    const p = NC.protocolById['brust-thiol-gold'];
    const s = NC.protocolScale(p, 80, { stockVolumes: { 0: 50 } });
    near(s.reagents[0].mmol, 0.9, 1e-12, 'Brust gold: 0.9 mmol');
    near(s.reagents[0].massG, 0.9 * 393.82 / 1000, 1e-12, 'Brust gold mass delivered');
    near(s.reagents[0].massToWeighG, 0.030 * 0.050 * 393.82, 1e-12, 'Brust gold: weigh for a 50 mL stock');
    ok(s.warnings.length === 0, 'no warning when the stock is large enough');
    const s2 = NC.protocolScale(p, 80, { stockVolumes: { 0: 10 } });
    ok(s2.reagents[0].short && s2.warnings.length === 1, 'warns when the stock is smaller than the batch needs');
    ok(s.reagents[2].amount === null && s.reagents[2].massG === null, 'amount "as in the original" stays null');
  }
  {
    // neat mmol amount: Fe(acac)3 2 mmol → 0.7063 g; doubles at 40 mL
    const p = NC.protocolById['magnetite-thermal'];
    const s = NC.protocolScale(p, 40);
    near(s.reagents[0].mmol, 4, 1e-12, 'Fe(acac)3 doubles');
    near(s.reagents[0].massG, 4 * 353.17 / 1000, 1e-12, 'Fe(acac)3 mass');
    near(NC.protocolScale(p, -5).factor, 1, 1e-12, 'invalid batch size falls back to the paper’s');
  }
  near(NC.protocolUnits.toMl(250, 'µL'), 0.25, 1e-12, 'µL → mL');
  near(NC.protocolUnits.toG(250, 'mg'), 0.25, 1e-12, 'mg → g');
  ok(NC.protocolUnits.fmtMass(0.00025) === '250 µg' && NC.protocolUnits.fmtMass(0.25) === '250 mg' && NC.protocolUnits.fmtMass(2.5) === '2.5 g', 'mass formatting picks µg/mg/g');
  ok(NC.protocolUnits.fmtVol(0.07) === '70 µL' && NC.protocolUnits.fmtVol(12.5) === '12.5 mL', 'volume formatting picks µL/mL');
  ok(NC.protocolDefaultStockVolume(60) === 100 && NC.protocolDefaultStockVolume(0.6) === 10, 'default stock flask sizes');

  /* ---------- lookup for the designer ---------- */
  const has = (list, id) => list.some((p) => p.id === id);
  const auCores = NC.protocolsFor('core', 'Au');
  ok(has(auCores, 'citrate-gold') && has(auCores, 'gold-nanorods-seed') && has(auCores, 'brust-thiol-gold') && !has(auCores, 'citrate-silver'), 'protocolsFor core Au');
  ok(has(NC.protocolsFor('core', 'Ag'), 'citrate-silver'), 'protocolsFor core Ag');
  ok(has(NC.protocolsFor('core', 'SiO2'), 'stober-silica'), 'protocolsFor core SiO2');
  const fe = NC.protocolsFor('core', 'Fe3O4');
  ok(has(fe, 'magnetite-thermal') && has(fe, 'magnetite-coprecipitation') && fe.length === 2, 'protocolsFor core Fe3O4 (two routes)');
  ok(has(NC.protocolsFor('core', 'CdSe'), 'cdse-cdo'), 'protocolsFor core CdSe');
  ok(has(NC.protocolsFor('shell', 'SiO2', 'Au'), 'silica-shell-gold'), 'protocolsFor SiO2 shell on Au');
  ok(NC.protocolsFor('shell', 'SiO2', 'Fe3O4').length === 0, 'no SiO2-on-Fe3O4 shell protocol (filter by core works)');
  ok(has(NC.protocolsFor('shell', 'ZnS', 'CdSe'), 'zns-shell-cdse') && has(NC.protocolsFor('shell', 'CdS', 'CdSe'), 'cds-shell-silar'), 'protocolsFor ZnS and CdS shells on CdSe');
  ok(has(NC.protocolsFor('ligand', 'PEG-thiol', 'Au'), 'peg-thiol-exchange'), 'protocolsFor PEG-thiol on Au');
  ok(has(NC.protocolsFor('ligand', 'citrate', 'Au'), 'citrate-gold') && has(NC.protocolsFor('ligand', 'citrate'), 'citrate-silver'), 'protocolsFor citrate ligand');
  ok(has(NC.protocolsFor('ligand', 'alkanethiol', 'Au'), 'brust-thiol-gold'), 'protocolsFor alkanethiol on Au');
  ok(has(NC.protocolsFor('ligand', 'oleic-acid', 'Fe3O4'), 'magnetite-thermal') && has(NC.protocolsFor('ligand', 'oleylamine'), 'magnetite-thermal'), 'protocolsFor oleic acid / oleylamine');
  ok(has(NC.protocolsFor('purification', 'Au'), 'purification-centrifugation') && has(NC.protocolsFor('purification', 'CdSe'), 'purification-centrifugation'), 'purification applies to any material');
  ok(NC.protocolsFor('core', 'Pt').length === 0, 'no protocol for Pt cores');
  ok(NC.protocolsFor('core').length >= 7, 'protocolsFor(role) without a key lists every core protocol');

  /* ---------- view helpers ---------- */
  ok(NC.protocolsView.fmtFormula('HAuCl4·3H2O') === 'HAuCl<sub>4</sub>·3H<sub>2</sub>O', 'formula display: subscripts, hydrate coefficient kept');
};
