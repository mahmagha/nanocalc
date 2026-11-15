/* Material database: every built-in material value with its source, so presets are traceable. */
(function (global) {
  'use strict';
  const NC = global.NC;
  const f = NC.fmt;

  NC.register({
    id: 'materials',
    category: 'lab',
    title: 'Material database (sources)',
    short: 'Densities and molar masses used by the presets, with their sources',
    description:
      'Lists every built-in material with the density, molar mass and (for metals) melting data used by the calculators, and where each value comes from. Use it to check a preset, or to copy a value into a custom material.',
    refs: ['crc', 'ciaaw2021'],
    inputs: [
      NC.sel('group', 'Show', [['all', 'All materials'], ['metal', 'Metals'], ['oxide', 'Oxides'], ['semi', 'Semiconductors / quantum dots']], 'all'),
      NC.sel('sort', 'Sort by', [['name', 'Name'], ['rho', 'Density'], ['M', 'Molar mass']], 'name')
    ],
    example: { group: 'all', sort: 'name' },
    compute: function (v) {
      const S = NC.materialSources;
      let keys = Object.keys(NC.materials).filter(function (k) { return v.group === 'all' || NC.materials[k].group === v.group; });
      keys.sort(function (a, b) {
        const A = NC.materials[a], B = NC.materials[b];
        if (v.sort === 'rho') return B.rho - A.rho;
        if (v.sort === 'M') return B.M - A.M;
        return A.label.localeCompare(B.label);
      });
      const s = new NC.Steps();
      s.add({ title: 'Density ρ', formula: S.rho.text, note: 'Nanoparticles can differ from bulk (lattice contraction, porosity, defects, hydration). Use a measured value when you have one.', ref: S.rho.ref });
      s.add({ title: 'Molar mass M', formula: S.M.text, note: 'For compounds the value is per formula unit, so “atoms” in the builder means formula units.', ref: S.M.ref });
      s.add({ title: 'Melting point and enthalpy of fusion (metals)', formula: S.Tm.text, ref: S.Tm.ref });
      const noted = keys.filter(function (k) { return NC.materials[k].note; });
      return {
        results: [
          { label: 'Materials listed', value: String(keys.length), main: true },
          { label: 'Data sources', value: 'CRC Handbook; IUPAC 2021' }
        ],
        steps: s.items,
        tables: [{
          title: 'Built-in material data',
          columns: ['Material', 'Class', 'ρ (g/cm³)', 'M (g/mol)', 'T_m (K)', 'ΔH_f (kJ/mol)'],
          rows: keys.map(function (k) {
            const m = NC.materials[k];
            return [m.label, NC.materialGroups[m.group] || '', f(m.rho, 4), f(m.M, 6), m.Tm ? f(m.Tm, 6) : '—', m.dHf ? f(m.dHf, 4) : '—'];
          })
        }].concat(noted.length ? [{
          title: 'Phase notes',
          columns: ['Material', 'Note'],
          rows: noted.map(function (k) { return [NC.materials[k].label, NC.materials[k].note]; })
        }] : []),
        notes: ['Values are rounded room-temperature bulk values for the phase named in each label. Check them against the current edition of the CRC Handbook before publishing.']
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
