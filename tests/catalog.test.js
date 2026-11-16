/* Site structure (js/catalog.js): sections → technique groups → calculators. */
'use strict';
module.exports = function (t) {
  const { NC, ok } = t;
  const secIds = NC.sections.map((s) => s.id);
  ok(NC.sections.length >= 3 && NC.sections.length <= 6, 'a handful of top-level sections (' + NC.sections.length + ')');
  NC.categories.forEach((g) => {
    ok(secIds.includes(g.section), 'group ' + g.id + ' belongs to a known section');
    ok(NC.calculators.some((c) => c.category === g.id), 'group ' + g.id + ' is not empty');
    ok(g.label && g.blurb, 'group ' + g.id + ' has a label and blurb');
  });
  NC.sections.forEach((s) => ok(NC.categories.some((g) => g.section === s.id), 'section ' + s.id + ' has groups'));
  const placed = new Set(NC.calculators.map((c) => c.category));
  ok(NC.calculators.every((c) => NC.categories.some((g) => g.id === c.category)), 'every calculator is in a catalog group');
  ok(placed.size === NC.categories.length, 'every group is used');
  const pageKeys = [].concat(...NC.sections.map((s) => (s.pages || []).map((p) => p.href)));
  NC.tasks.forEach((task) => ok(task.href ? pageKeys.includes(task.href) : NC.byId[task.calc], 'home task "' + task.text + '" links to an existing calculator or workspace page'));
  NC.sections.forEach((s) => (s.pages || []).forEach((p) => ok(['#/design', '#/synthesis'].includes(p.href) && p.label && p.blurb && p.key, 'section ' + s.id + ' page ' + p.label + ' is complete and routed')));
  ok(new Set(NC.calculators.map((c) => c.id)).size === NC.calculators.length, 'calculator ids are unique');
};
