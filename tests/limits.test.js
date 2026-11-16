/* Allowed values of number inputs (NC.inputLimits): the form flags and snaps bad values as they are typed. */
'use strict';
module.exports = function (t) {
  const { NC, ok } = t;

  /* helpers */
  ok(NC.snapToLimits(2.5, { int: true, min: 1 }) === 3, 'whole numbers are rounded');
  ok(NC.snapToLimits(0, { int: true, gt: 0 }) === 1, 'a positive whole number snaps up to 1');
  ok(NC.snapToLimits(60, { int: true, min: 1, max: 50 }) === 50, 'clamped to the maximum');
  ok(NC.snapToLimits(-2, { min: 0 }) === 0, 'clamped to the minimum');
  ok(NC.snapToLimits(-2, { gt: 0 }) === -2, 'an open bound is not clamped to (the message explains it)');
  ok(NC.limitError(2.5, '', { int: true }) === 'Must be a whole number.', 'message for a decimal in a whole-number field');
  ok(NC.limitError(0, '', { gt: 0 }) === 'Must be greater than 0.', 'message for zero in a positive field');
  ok(NC.limitError(3, '', { int: true, min: 1 }) === '', 'an allowed value gives no message');
  ok(NC.limitText({ int: true, gt: 0 }) === 'whole number ≥ 1' && NC.limitText({ int: true, min: 0, max: 8 }) === 'whole number ≥ 0, ≤ 8', 'limit text');

  /* named cases */
  const L = (c, id) => NC.inputLimits(NC.byId[c])[id] || {};
  ok(L('graphene', 'N').int && L('graphene', 'N').gt === 0, 'graphene: number of layers is a positive whole number');
  ok(L('liposome', 'nLam').int && L('liposome', 'nLam').min === 1, 'liposome: number of bilayers is a whole number ≥ 1');
  ok(L('seedgrowth', 'steps').int && L('seedgrowth', 'steps').max === 50, 'seeded growth: steps 1–50');
  ok(L('nanoparticle', 'N').int, 'nanoparticle: number of spikes is a whole number');
  ok(L('psd', 'bins').int && L('psd', 'bins').min === 0, 'histogram bins: whole number, 0 = automatic');
  ok(L('bragg', 'h').int && L('bragg', 'h').min === undefined, 'Miller indices are whole numbers of either sign');

  /* every calculator: defaults and examples are allowed; count-like fields are whole numbers */
  let derived = 0;
  const notRejected = [];
  NC.calculators.forEach((def) => {
    const lim = NC.inputLimits(def), src = def._limitSource;
    const ex = typeof def.example === 'function' ? def.example() : def.example || {};
    def.inputs.filter((i) => i.type === 'number').forEach((inp) => {
      const l = lim[inp.id];
      [['default', inp.value], ['example', ex[inp.id]]].forEach(([what, x]) => {
        if (l && typeof x === 'number' && isFinite(x)) ok(!NC.limitError(x, '', l), def.id + '.' + inp.id + ': the ' + what + ' value ' + x + ' is allowed');
      });
      if (/^number of\b/i.test(inp.label)) ok(l && l.int, def.id + '.' + inp.id + ': "' + inp.label + '" only takes whole numbers');
    });
    // Limits read from the calculation must never be stricter than it: a value they reject, the calculation rejects too.
    if (!def.example) return;
    const v = {};
    def.inputs.forEach((i) => { v[i.id] = ex[i.id] !== undefined ? ex[i.id] : i.value; });
    try { if (!def.compute(Object.assign({}, v))) return; } catch (e) { return; }
    def.inputs.filter((i) => src[i.id] === 'compute' && (!i.showIf || i.showIf(v))).forEach((inp) => {
      const l = lim[inp.id], x0 = Number(v[inp.id]);
      const bad = l.int && isFinite(x0) ? x0 + 0.5 : l.gt !== undefined ? l.gt : l.min !== undefined ? l.min - 1 : l.lt !== undefined ? l.lt : l.max + 1;
      if (!NC.limitError(bad, '', l)) return;
      derived++;
      try { def.compute(Object.assign({}, v, { [inp.id]: bad })); notRejected.push(def.id + '.' + inp.id + '=' + bad); }
      catch (e) { if (!(e instanceof NC.InputError)) notRejected.push(def.id + '.' + inp.id + ' (crash: ' + e.message + ')'); }
    });
  });
  ok(derived > 100, 'limits read from the calculations were tested on ' + derived + ' fields');
  ok(notRejected.length === 0, 'every value the form rejects is also rejected by the calculation' + (notRejected.length ? ': ' + notRejected.join(', ') : ''));

  /* designer: the form's limits match the engine's checks */
  const DV = NC.designerView, D = NC.designer;
  ok(DV && DV.limitsFor && D, 'designer view exposes its limits');
  if (!(DV && DV.limitsFor && D)) return;
  ok(DV.limitsFor('ligand.nC').int && DV.limitsFor('ligand.nC').max === 30, 'designer: chain length is a whole number 1–30');
  ok(DV.limitsFor('shells.3.t').gt === 0 && DV.limitsFor('core.D').max === 20000, 'designer: sizes are positive, at most 20 µm');
  const base = D.defaults();
  [['core.D', 0], ['core.D', 20001], ['ligand.nC', 2.5], ['ligand.excess', 0.5], ['lambda.step', 0], ['batch.volumeMl', -1], ['medium.n', 0]].forEach(([p, x]) => {
    const d = JSON.parse(JSON.stringify(base));
    if (p.startsWith('ligand')) d.ligand = { key: 'alkanethiol', mode: 'footprint', value: 0.214, nC: 12, excess: 1 };
    const ks = p.split('.'); let o = d; ks.slice(0, -1).forEach((k) => { o = o[k]; }); o[ks[ks.length - 1]] = x;
    ok(!!NC.limitError(x, '', DV.limitsFor(p)), 'designer form rejects ' + p + ' = ' + x);
    let threw = false; try { D.compute(d); } catch (e) { threw = e instanceof NC.InputError; }
    ok(threw, 'designer engine also rejects ' + p + ' = ' + x);
  });
  const many = JSON.parse(JSON.stringify(base));
  many.shells = Array.from({ length: DV.maxShells + 1 }, () => ({ material: 'SiO2', t: 1, optical: { model: 'none' } }));
  let threw = false; try { D.compute(many); } catch (e) { threw = e instanceof NC.InputError; }
  ok(threw, 'designer engine rejects more than ' + DV.maxShells + ' shells (the add button stops there)');
};
