/*
 * Site catalog: how calculators are organised for navigation.
 *
 * Four sections → technique groups → calculators (in display order). This file is the single
 * source of truth for the site's structure; calculator files keep their own `category` only as a
 * fallback. Loaded after every calculator and before app.js. Every registered calculator must
 * appear exactly once (enforced here and in the tests).
 */
(function (global) {
  'use strict';
  const NC = global.NC;

  // Sections follow the three jobs: design a particle, make it, characterise it (plus reference data).
  // A section's "pages" are full workspaces (not calculators) listed first in the navigation.
  NC.sections = [
    { id: 'design', label: 'Design', verb: 'Design a nanoparticle', blurb: 'Design a particle layer by layer (core, shells, ligands) and predict its size, composition, optical spectrum and size-dependent properties.',
      pages: [{ key: 'design', href: '#/design', label: 'Particle designer', blurb: 'Core + any number of shells + ligands: geometry, composition, optical spectrum (multilayer Mie), ligand counts and a step-by-step build plan.' }] },
    { id: 'synthesis', label: 'Make', verb: 'Make it in the lab', blurb: 'Step-by-step synthesis protocols from the literature, scaled to your batch, and the lab calculations around them.',
      pages: [{ key: 'synthesis', href: '#/synthesis', label: 'Synthesis protocols', blurb: 'Published procedures for cores, shells and ligand exchange: reagents scaled to your batch, steps, safety, expected results and checks.' }] },
    { id: 'characterization', label: 'Characterise', verb: 'Characterise what you made', blurb: 'Turn measurements into results, organised by technique.' },
    { id: 'tools', label: 'Data & reference', verb: 'Look up data', blurb: 'Process raw spectra and look up the material data the calculators use.' }
  ];

  /* Groups: id, section, label, short (sidebar), blurb, aliases (extra search words), calcs (ordered). */
  const GROUPS = [
    { id: 'build', section: 'design', label: 'Nanoparticle builder', blurb: 'Geometry, atom counts, surface atoms and surface area for any material, shape and structure.', aliases: 'shape geometry atoms surface core shell hollow porous janus', calcs: ['nanoparticle', 'particle'] },
    { id: 'size', section: 'design', label: 'Size-dependent properties', blurb: 'Quantum confinement and melting-point depression.', aliases: 'quantum dot band gap melting', calcs: ['brus', 'melting'] },
    { id: 'carbon', section: 'design', label: 'Carbon nanomaterials', blurb: 'Graphene, nanotubes, fullerenes and carbon dots.', aliases: 'graphene cnt nanotube fullerene', calcs: ['graphene', 'cnt', 'cntmass', 'fullerene', 'cdots'] },
    { id: 'soft', section: 'design', label: 'Soft & lipid nanomaterials', blurb: 'Liposomes, lipid nanoparticles, polymer nanoparticles and micelles.', aliases: 'lipid lnp mrna liposome polymer micelle', calcs: ['liposome', 'lnp', 'polymernp'] },

    { id: 'lab', section: 'synthesis', label: 'Solutions & dosing', blurb: 'Precursor masses, dilutions and particle number concentrations.', aliases: 'molarity dilution concentration precursor', calcs: ['solution', 'npconc'] },
    { id: 'growth', section: 'synthesis', label: 'Growth & yield', blurb: 'Seed-mediated growth, nucleation, Ostwald ripening and yield.', aliases: 'seed nucleation ripening lsw yield', calcs: ['seedgrowth', 'nucleation', 'ripening', 'yield'] },

    { id: 'xrd', section: 'characterization', label: 'X-ray diffraction (XRD)', blurb: 'd-spacings, lattice parameters, crystallite size, strain and phase fractions.', aliases: 'xrd diffraction scherrer crystallite lattice', calcs: ['bragg', 'scherrer', 'wh', 'ssp', 'lattice', 'rir'] },
    { id: 'em', section: 'characterization', label: 'Electron microscopy (TEM/SEM)', blurb: 'Size distributions, electron diffraction, lattice fringes and EDX.', aliases: 'tem sem saed hrtem edx eds microscopy', calcs: ['psd', 'saed', 'hrtem', 'edx'] },
    { id: 'uvvis', section: 'characterization', label: 'UV-vis & photoluminescence', blurb: 'Band gaps, absorption sizing of quantum dots and gold, quantum yield.', aliases: 'uv-vis uvvis absorbance band gap tauc fluorescence pl', calcs: ['tauc', 'urbach', 'beer', 'qdyu', 'haiss', 'plqy'] },
    { id: 'plasmon', section: 'characterization', label: 'Plasmonics (optical modelling)', blurb: 'Mie and Gans theory for metal nanoparticles; size from the plasmon peak.', aliases: 'lspr plasmon mie gans gold silver nanorod', calcs: ['mie', 'gans', 'agsize'] },
    { id: 'scatter', section: 'characterization', label: 'Light & X-ray scattering', blurb: 'Hydrodynamic size (DLS, NTA) and SAXS analysis.', aliases: 'dls nta saxs hydrodynamic guinier porod correlation', calcs: ['dls', 'cumulants', 'nta', 'guinier', 'porod'] },
    { id: 'colloid', section: 'characterization', label: 'Surface charge & stability', blurb: 'Zeta potential, DLVO interactions and sedimentation.', aliases: 'zeta electrophoretic dlvo stability sedimentation centrifuge', calcs: ['zeta', 'dlvo', 'sediment'] },
    { id: 'surface', section: 'characterization', label: 'Gas sorption (BET, t-plot, BJH)', blurb: 'Surface area, micropore volume and pore-size distribution from nitrogen isotherms.', aliases: 'bet isotherm surface area pore kelvin t-plot micropore bjh mesopore distribution', calcs: ['bet', 'tplot', 'bjh', 'kelvin'] },
    { id: 'spectro', section: 'characterization', label: 'Raman & XPS', blurb: 'Graphene defects and crystallite size; surface composition by XPS.', aliases: 'raman xps id/ig photoelectron', calcs: ['raman', 'xps'] },
    { id: 'icp', section: 'characterization', label: 'Elemental analysis (ICP-MS)', blurb: 'Particle number concentration and single-particle ICP-MS.', aliases: 'icp icp-ms icp-oes sp-icp-ms elemental', calcs: ['icp2n', 'spicpms'] },
    { id: 'other', section: 'characterization', label: 'Magnetic, electrochemical & thermal', blurb: 'Magnetometry, Pt electrochemical surface area and TGA ligand density.', aliases: 'vsm magnetization blocking ecsa platinum catalysis tga thermogravimetric ligand', calcs: ['magnet', 'ecsa', 'tga'] },

    { id: 'data', section: 'tools', label: 'Spectrum & peak analysis', blurb: 'Import raw data, smooth, remove the background and fit peaks.', aliases: 'peak fit baseline smoothing import spectrum', calcs: ['peakfit'] },
    { id: 'materials', section: 'tools', label: 'Material data', blurb: 'Densities and molar masses used by the presets, with sources.', aliases: 'density molar mass material database', calcs: ['materials'] }
  ];

  /* "What do you want to do?" shortcuts on the home page. */
  NC.tasks = [
    { href: '#/design', text: 'Design a core–shell particle with ligands', where: 'Particle designer' },
    { href: '#/synthesis', text: 'Follow a synthesis protocol', where: 'Synthesis protocols' },
    { calc: 'scherrer', text: 'Crystallite size from an XRD peak' },
    { calc: 'tauc', text: 'Band gap from a UV-vis spectrum' },
    { calc: 'psd', text: 'Size statistics from TEM images' },
    { calc: 'dls', text: 'Hydrodynamic size from DLS' },
    { calc: 'bet', text: 'Surface area from an N₂ isotherm' },
    { calc: 'haiss', text: 'Gold nanoparticle size from UV-vis' },
    { calc: 'qdyu', text: 'Quantum-dot size from the absorption peak' },
    { calc: 'nanoparticle', text: 'Atoms and surface area of any shape' },
    { calc: 'zeta', text: 'Zeta potential from mobility' },
    { calc: 'solution', text: 'Precursor mass for a synthesis' },
    { calc: 'icp2n', text: 'Particle number from ICP-MS' },
    { calc: 'peakfit', text: 'Fit peaks in a raw spectrum' }
  ];

  // Apply: groups become the categories; each calculator gets its group, and the registry is
  // re-ordered to match the catalog.
  const seen = {};
  const ordered = [];
  GROUPS.forEach(function (g) {
    g.calcs.forEach(function (id) {
      const def = NC.byId[id];
      if (!def) throw new Error('catalog.js lists unknown calculator "' + id + '"');
      if (seen[id]) throw new Error('catalog.js lists "' + id + '" twice');
      seen[id] = true;
      def.category = g.id;
      ordered.push(def);
    });
  });
  const missing = NC.calculators.filter(function (d) { return !seen[d.id]; }).map(function (d) { return d.id; });
  if (missing.length) throw new Error('catalog.js does not place: ' + missing.join(', ') + ' (add them to a group)');
  NC.calculators.length = 0;
  Array.prototype.push.apply(NC.calculators, ordered);
  NC.categories = GROUPS.map(function (g) { return { id: g.id, section: g.section, label: g.label, blurb: g.blurb, aliases: g.aliases || '' }; });

  NC.sectionOf = function (catId) {
    const c = NC.categories.find(function (x) { return x.id === catId; });
    return c ? NC.sections.find(function (s) { return s.id === c.section; }) : null;
  };
})(typeof window !== 'undefined' ? window : globalThis);
