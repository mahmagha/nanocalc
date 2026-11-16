/*
 * Synthesis protocols (PLAN.md Plan 4, workstream B): a library of published nanomaterial
 * procedures, each transcribed from its original paper and cited, with batch scaling.
 *
 *   NC.protocols                    array of protocol objects (schema below)
 *   NC.protocolById[id]             lookup
 *   NC.protocolsFor(role, key, on)  protocols that make a layer: role 'core' | 'shell' | 'ligand' |
 *                                   'purification'; key = NC.materials key (or ligand key); optional
 *                                   `on` = material underneath (for shells and ligands)
 *   NC.protocolScale(p, V, opts)    scaled reagent amounts and, for every stock, the mass to weigh
 *   NC.protocolMarkdown(p, V, opts) the protocol (scaled) as Markdown text
 *   NC.molarMass(formula)           molar mass from a formula (hydrates with "·", brackets), IUPAC 2021
 *   NC.protocolUnits                unit helpers (toMl, fmtMass, fmtVol, fmtAmount)
 *
 * ACCURACY RULE. A quantity, temperature or time appears only when it is what the cited paper
 * reports. Anything NanoCalc could not confirm is either left out ("as in the original paper",
 * amount: null) or carries `verify: true`, which the page shows as "check against the original".
 * Every page tells the reader to check the procedure against its source and do a risk assessment.
 *
 * Protocol schema:
 *   id, title, summary, makes: [{ role, material | ligand, shape?, size?: [min, max] nm, on?: [keys] }],
 *   sizeText, tuning: { text, verify? }, baseVolume (number of baseUnit the amounts give; null = no
 *   scalable amounts), baseUnit ('mL' default), baseLabel,
 *   reagents: [{ name, formula, M, role, stage?, stock: { conc, unit: 'M'|'mM'|'wt%'|'neat', density?, label? },
 *               amount, amountUnit: 'mL'|'µL'|'mg'|'g'|'mmol', scale?: false, hazard, note?, verify? }],
 *   equipment: [], steps: [{ text, stage?, temp?, time?, critical?, ref?, verify? }],
 *   safety: { general: [], waste: [] }, expected: { colour, lambdaMax, size, yield, verify? },
 *   characterise: [{ what, calc }], troubleshooting: [{ problem, cause, fix }], refs: [ids],
 *   generalPractice?: true (not a published protocol)
 *
 * Pure data and functions only (no DOM): loads in Node for the tests. Load after references.js.
 */
(function (global) {
  'use strict';
  const NC = global.NC;

  /* ------------------------------------------------------------------ */
  /* References                                                          */
  /* ------------------------------------------------------------------ */
  // The first seven are copied unchanged from the verified further-reading list in js/library.js;
  // the rest are new.
  NC.addRefs({
    turkevich1951: { type: 'article', authors: 'Turkevich, J.; Stevenson, P. C.; Hillier, J.', title: 'A study of the nucleation and growth processes in the synthesis of colloidal gold', journal: 'Discuss. Faraday Soc.', year: 1951, volume: '11', pages: '55–75', doi: '10.1039/df9511100055' },
    frens1973: { type: 'article', authors: 'Frens, G.', title: 'Controlled nucleation for the regulation of the particle size in monodisperse gold suspensions', journal: 'Nature Phys. Sci.', year: 1973, volume: '241', pages: '20–22', doi: '10.1038/physci241020a0' },
    brust1994: { type: 'article', authors: 'Brust, M.; Walker, M.; Bethell, D.; Schiffrin, D. J.; Whyman, R.', title: 'Synthesis of thiol-derivatised gold nanoparticles in a two-phase liquid–liquid system', journal: 'J. Chem. Soc., Chem. Commun.', year: 1994, pages: '801–802', doi: '10.1039/c39940000801' },
    peng2001: { type: 'article', authors: 'Peng, Z. A.; Peng, X.', title: 'Formation of high-quality CdTe, CdSe, and CdS nanocrystals using CdO as precursor', journal: 'J. Am. Chem. Soc.', year: 2001, volume: '123', pages: '183–184', doi: '10.1021/ja003633m' },
    stober1968: { type: 'article', authors: 'Stöber, W.; Fink, A.; Bohn, E.', title: 'Controlled growth of monodisperse silica spheres in the micron size range', journal: 'J. Colloid Interface Sci.', year: 1968, volume: '26', pages: '62–69', doi: '10.1016/0021-9797(68)90272-5' },
    sun2002mag: { type: 'article', authors: 'Sun, S.; Zeng, H.', title: 'Size-controlled synthesis of magnetite nanoparticles', journal: 'J. Am. Chem. Soc.', year: 2002, volume: '124', pages: '8204–8205', doi: '10.1021/ja026501x' },
    nikoobakht2003: { type: 'article', authors: 'Nikoobakht, B.; El-Sayed, M. A.', title: 'Preparation and growth mechanism of gold nanorods (NRs) using seed-mediated growth method', journal: 'Chem. Mater.', year: 2003, volume: '15', pages: '1957–1962', doi: '10.1021/cm020732l' },

    leemeisel1982: { type: 'article', authors: 'Lee, P. C.; Meisel, D.', title: 'Adsorption and surface-enhanced Raman of dyes on silver and gold sols', journal: 'J. Phys. Chem.', year: 1982, volume: '86', pages: '3391–3395', doi: '10.1021/j100214a025' },
    lizmarzan1996: { type: 'article', authors: 'Liz-Marzán, L. M.; Giersig, M.; Mulvaney, P.', title: 'Synthesis of nanosized gold–silica core–shell particles', journal: 'Langmuir', year: 1996, volume: '12', pages: '4329–4335', doi: '10.1021/la9601871' },
    sun2004mfe: { type: 'article', authors: 'Sun, S.; Zeng, H.; Robinson, D. B.; Raoux, S.; Rice, P. M.; Wang, S. X.; Li, G.', title: 'Monodisperse MFe2O4 (M = Fe, Co, Mn) nanoparticles', journal: 'J. Am. Chem. Soc.', year: 2004, volume: '126', pages: '273–279', doi: '10.1021/ja0380852' },
    massart1981: { type: 'article', authors: 'Massart, R.', title: 'Preparation of aqueous magnetic liquids in alkaline and acidic media', journal: 'IEEE Trans. Magn.', year: 1981, volume: '17', pages: '1247–1248', doi: '10.1109/TMAG.1981.1061188' },
    li2003silar: { type: 'article', authors: 'Li, J. J.; Wang, Y. A.; Guo, W.; Keay, J. C.; Mishima, T. D.; Johnson, M. B.; Peng, X.', title: 'Large-scale synthesis of nearly monodisperse CdSe/CdS core/shell nanocrystals using air-stable reagents via successive ion layer adsorption and reaction', journal: 'J. Am. Chem. Soc.', year: 2003, volume: '125', pages: '12567–12575', doi: '10.1021/ja0363563' },
    dabbousi1997: { type: 'article', authors: 'Dabbousi, B. O.; Rodriguez-Viejo, J.; Mikulec, F. V.; Heine, J. R.; Mattoussi, H.; Ober, R.; Jensen, K. F.; Bawendi, M. G.', title: '(CdSe)ZnS core–shell quantum dots: synthesis and characterization of a size series of highly luminescent nanocrystallites', journal: 'J. Phys. Chem. B', year: 1997, volume: '101', pages: '9463–9475', doi: '10.1021/jp971091y' },
    manson2011: { type: 'article', authors: 'Manson, J.; Kumar, D.; Meenan, B. J.; Dixon, D.', title: 'Polyethylene glycol functionalized gold nanoparticles: the influence of capping density on stability in various media', journal: 'Gold Bull.', year: 2011, volume: '44', pages: '99–105', doi: '10.1007/s13404-011-0015-8' },
    sweeney2006: { type: 'article', authors: 'Sweeney, S. F.; Woehrle, G. H.; Hutchison, J. E.', title: 'Rapid purification and size separation of gold nanoparticles via diafiltration', journal: 'J. Am. Chem. Soc.', year: 2006, volume: '128', pages: '3190–3197', doi: '10.1021/ja0558241' }
  });

  /* ------------------------------------------------------------------ */
  /* Molar mass from a formula                                           */
  /* ------------------------------------------------------------------ */
  /* IUPAC/CIAAW 2021 standard atomic weights, abridged (conventional) values [ciaaw2021],
     for the elements the protocols need. */
  const ATW = {
    H: 1.008, B: 10.81, C: 12.011, N: 14.007, O: 15.999, Na: 22.990, Si: 28.085, P: 30.974, S: 32.06,
    Cl: 35.45, K: 39.098, Fe: 55.845, Zn: 65.38, Se: 78.971, Br: 79.904, Ag: 107.87, Cd: 112.41, Au: 196.97
  };
  NC.protocolAtomicWeights = ATW;

  /** Element counts of one formula part, e.g. "Fe(C5H7O2)3" or "[(CH3)3Si]2S". */
  function countAtoms(s) {
    let i = 0;
    function group() {
      const c = {};
      while (i < s.length) {
        const ch = s[i];
        if (ch === '(' || ch === '[') {
          i++;
          const inner = group();
          if (s[i] !== ')' && s[i] !== ']') throw new Error('Unbalanced brackets in formula "' + s + '"');
          i++;
          let n = '';
          while (/\d/.test(s[i] || '')) n += s[i++];
          const k = n ? Number(n) : 1;
          Object.keys(inner).forEach(function (e) { c[e] = (c[e] || 0) + inner[e] * k; });
        } else if (ch === ')' || ch === ']') {
          return c;
        } else {
          const m = /^[A-Z][a-z]?/.exec(s.slice(i));
          if (!m) throw new Error('Cannot read formula "' + s + '" at "' + s.slice(i) + '"');
          i += m[0].length;
          let n = '';
          while (/\d/.test(s[i] || '')) n += s[i++];
          c[m[0]] = (c[m[0]] || 0) + (n ? Number(n) : 1);
        }
      }
      return c;
    }
    const out = group();
    if (i < s.length) throw new Error('Unbalanced brackets in formula "' + s + '"');
    return out;
  }

  /** Element counts of a whole formula, hydrates included ("HAuCl4·3H2O"; "·", "*" or "." separate parts). */
  NC.formulaAtoms = function (formula) {
    const total = {};
    String(formula).replace(/\s+/g, '').split(/[·*.]/).forEach(function (part) {
      if (!part) return;
      const m = /^(\d+)(.*)$/.exec(part);
      const k = m ? Number(m[1]) : 1;
      const c = countAtoms(m ? m[2] : part);
      Object.keys(c).forEach(function (e) { total[e] = (total[e] || 0) + c[e] * k; });
    });
    return total;
  };

  /** Molar mass in g/mol from IUPAC 2021 standard atomic weights [ciaaw2021]. Throws on an unknown element. */
  NC.molarMass = function (formula) {
    const c = NC.formulaAtoms(formula);
    return Object.keys(c).reduce(function (s, e) {
      if (!ATW[e]) throw new Error('No atomic weight for element "' + e + '" (formula "' + formula + '")');
      return s + ATW[e] * c[e];
    }, 0);
  };

  /* ------------------------------------------------------------------ */
  /* Units                                                               */
  /* ------------------------------------------------------------------ */
  const U = {
    /** Volume in mL from (value, 'mL' | 'µL' | 'L'), else null. */
    toMl: function (v, unit) {
      if (v === null || v === undefined) return null;
      if (unit === 'mL') return v;
      if (unit === 'µL' || unit === 'uL') return v / 1000;
      if (unit === 'L') return v * 1000;
      return null;
    },
    /** Mass in g from (value, 'mg' | 'g' | 'µg'), else null. */
    toG: function (v, unit) {
      if (v === null || v === undefined) return null;
      if (unit === 'g') return v;
      if (unit === 'mg') return v / 1000;
      if (unit === 'µg' || unit === 'ug') return v / 1e6;
      return null;
    },
    /** Stock concentration in mol/L for 'M' | 'mM' stocks, else null. */
    molar: function (stock) {
      if (!stock || typeof stock.conc !== 'number') return null;
      if (stock.unit === 'M') return stock.conc;
      if (stock.unit === 'mM') return stock.conc / 1000;
      return null;
    },
    fmtMass: function (g, sig) {
      if (typeof g !== 'number' || !isFinite(g)) return '—';
      const a = Math.abs(g);
      if (a >= 1000) return NC.fmt(g / 1000, sig || 4) + ' kg';
      if (a >= 1) return NC.fmt(g, sig || 4) + ' g';
      if (a >= 1e-3) return NC.fmt(g * 1000, sig || 4) + ' mg';
      return NC.fmt(g * 1e6, sig || 4) + ' µg';
    },
    fmtVol: function (mL, sig) {
      if (typeof mL !== 'number' || !isFinite(mL)) return '—';
      const a = Math.abs(mL);
      if (a >= 1000) return NC.fmt(mL / 1000, sig || 4) + ' L';
      if (a >= 1) return NC.fmt(mL, sig || 4) + ' mL';
      return NC.fmt(mL * 1000, sig || 4) + ' µL';
    },
    fmtMol: function (mmol, sig) {
      if (typeof mmol !== 'number' || !isFinite(mmol)) return '—';
      const a = Math.abs(mmol);
      if (a >= 1000) return NC.fmt(mmol / 1000, sig || 4) + ' mol';
      if (a >= 1) return NC.fmt(mmol, sig || 4) + ' mmol';
      if (a >= 1e-3) return NC.fmt(mmol * 1000, sig || 4) + ' µmol';
      return NC.fmt(mmol * 1e6, sig || 4) + ' nmol';
    },
    /** An amount in its own unit, re-expressed in a readable unit. */
    fmtAmount: function (v, unit, sig) {
      if (typeof v !== 'number' || !isFinite(v)) return '—';
      if (unit === 'mL' || unit === 'µL') return U.fmtVol(U.toMl(v, unit), sig);
      if (unit === 'mg' || unit === 'g') return U.fmtMass(U.toG(v, unit), sig);
      if (unit === 'mmol') return U.fmtMol(v, sig);
      return NC.fmt(v, sig || 4) + ' ' + unit;
    },
    fmtStock: function (stock) {
      if (!stock) return '—';
      if (stock.label) return stock.label;
      if (stock.unit === 'neat') return 'neat / as supplied';
      if (typeof stock.conc !== 'number') return 'as in the original paper';
      return NC.fmt(stock.conc, 4) + ' ' + stock.unit + (stock.solvent ? ' in ' + stock.solvent : '');
    }
  };
  NC.protocolUnits = U;

  /** Default stock volume: the smallest common flask size ≥ 1.2 × the volume needed (at least 10 mL). */
  const FLASKS = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000];
  function defaultStockVolume(needMl) {
    const want = Math.max(10, 1.2 * (needMl || 0));
    for (let i = 0; i < FLASKS.length; i++) if (FLASKS[i] >= want) return FLASKS[i];
    return Math.ceil(want / 1000) * 1000;
  }
  NC.protocolDefaultStockVolume = defaultStockVolume;

  /* ------------------------------------------------------------------ */
  /* Batch scaling                                                       */
  /* ------------------------------------------------------------------ */
  /**
   * Scale a protocol to a final batch size (in the protocol's baseUnit, normally mL).
   * opts.stockVolumes: { [reagentIndex]: mL } overrides the volume of each stock to prepare.
   *
   * For each reagent returns { index, name, formula, M, stage, stock, amount (scaled, amountUnit),
   *   amountUnit, scaled, volumeMl (stock volume used), mmol (amount of substance delivered),
   *   massG (mass of the substance delivered), stockVolumeMl, massToWeighG (solute to weigh for that
   *   stock), solutionMassG (wt% stocks: total mass of the stock solution), weighDirect, short, verify }.
   * Stock arithmetic:  M or mM stock: n = c·V,  m_weigh = c·V_stock·M;
   *                    wt% stock:     m = (w/100)·V·ρ (ρ = stock.density, default 1.00 g/mL for dilute
   *                                   aqueous solutions),  m_weigh = (w/100)·V_stock·ρ;
   *                    neat:          m from mg/g, from n·M (mmol), or V·ρ when a density is given.
   */
  NC.protocolScale = function (p, finalVolume, opts) {
    opts = opts || {};
    const stockVols = opts.stockVolumes || {};
    const base = p.baseVolume;
    const target = typeof finalVolume === 'number' && isFinite(finalVolume) && finalVolume > 0 ? finalVolume : base;
    const factor = base ? target / base : 1;
    const warnings = [];
    const rows = (p.reagents || []).map(function (r, i) {
      const out = {
        index: i, name: r.name, formula: r.formula || null, M: r.M || null, role: r.role, stage: r.stage || null,
        stock: r.stock, amountUnit: r.amountUnit, note: r.note || null, verify: !!r.verify,
        amount: null, scaled: false, volumeMl: null, mmol: null, massG: null,
        stockVolumeMl: null, massToWeighG: null, solutionMassG: null, weighDirect: false, short: false
      };
      if (typeof r.amount !== 'number') return out;
      const k = r.scale === false ? 1 : factor;
      out.scaled = r.scale !== false;
      out.amount = r.amount * k;
      const st = r.stock || { unit: 'neat' };
      const M = r.M;
      const vol = U.toMl(out.amount, r.amountUnit);
      out.volumeMl = vol;
      const cM = U.molar(st);
      if (cM !== null && vol !== null) {
        out.mmol = cM * vol; // mol/L × mL = mmol
        if (M) out.massG = out.mmol * M / 1000;
        out.stockVolumeMl = typeof stockVols[i] === 'number' && stockVols[i] > 0 ? stockVols[i] : defaultStockVolume(vol);
        if (M) out.massToWeighG = cM * (out.stockVolumeMl / 1000) * M;
      } else if (st.unit === 'wt%' && typeof st.conc === 'number' && vol !== null) {
        const rho = st.density || 1;
        out.massG = (st.conc / 100) * vol * rho;
        if (M) out.mmol = out.massG / M * 1000;
        out.stockVolumeMl = typeof stockVols[i] === 'number' && stockVols[i] > 0 ? stockVols[i] : defaultStockVolume(vol);
        out.massToWeighG = (st.conc / 100) * out.stockVolumeMl * rho;
        out.solutionMassG = out.stockVolumeMl * rho;
      } else {
        // neat (or a stock whose concentration is not given)
        const g = U.toG(out.amount, r.amountUnit);
        if (g !== null) out.massG = g;
        else if (r.amountUnit === 'mmol') {
          out.mmol = out.amount;
          if (M) out.massG = out.amount * M / 1000;
        } else if (vol !== null && st.density) out.massG = vol * st.density;
        if (out.mmol === null && out.massG !== null && M) out.mmol = out.massG / M * 1000;
        out.weighDirect = st.unit === 'neat' && out.massG !== null && r.amountUnit !== 'mL' && r.amountUnit !== 'µL';
      }
      if (out.stockVolumeMl !== null && vol !== null && out.stockVolumeMl < vol) {
        out.short = true;
        warnings.push(r.name + ': the stock volume (' + U.fmtVol(out.stockVolumeMl) + ') is less than the ' + U.fmtVol(vol) + ' the batch needs.');
      }
      return out;
    });
    return { factor: factor, finalVolume: target, baseVolume: base, baseUnit: p.baseUnit || 'mL', reagents: rows, warnings: warnings };
  };

  /* ------------------------------------------------------------------ */
  /* Lookup                                                              */
  /* ------------------------------------------------------------------ */
  NC.protocolRoles = [
    { id: 'core', label: 'Cores' },
    { id: 'shell', label: 'Shells' },
    { id: 'ligand', label: 'Ligands & surface' },
    { id: 'purification', label: 'Purification' }
  ];
  NC.protocolLigands = {
    citrate: 'Citrate', CTAB: 'CTAB (cetyltrimethylammonium bromide)', alkanethiol: 'Alkanethiol',
    'PEG-thiol': 'Thiol-PEG (mPEG-SH)', MUA: '11-Mercaptoundecanoic acid (MUA)', 'oleic-acid': 'Oleic acid', oleylamine: 'Oleylamine',
    TDPA: 'Tetradecylphosphonic acid / TOPO', TOPO: 'Trioctylphosphine oxide'
  };

  /**
   * Protocols that make a layer. role: 'core' | 'shell' | 'ligand' | 'purification'.
   * key: material key (NC.materials) or, for ligands, a ligand key; omit to list every protocol with that role.
   * on: (optional) the material underneath, for shells and ligands. A makes-entry with material '*'
   * (general purification) matches every key.
   */
  NC.protocolsFor = function (role, key, on) {
    return NC.protocols.filter(function (p) {
      return (p.makes || []).some(function (m) {
        if (m.role !== role) return false;
        const k = role === 'ligand' ? m.ligand : m.material;
        if (key !== undefined && key !== null && k !== key && k !== '*') return false;
        if (on && m.on && m.on.indexOf(on) < 0 && m.on.indexOf('*') < 0) return false;
        return true;
      });
    });
  };

  /* ------------------------------------------------------------------ */
  /* Shared text                                                         */
  /* ------------------------------------------------------------------ */
  const SDS = 'Read the supplier’s safety data sheet (SDS) for every reagent before use; the hazard notes here are short summaries, not a substitute.';
  const H = {
    water: 'Not hazardous.',
    gold: 'Corrosive: causes severe skin burns and eye damage; may cause an allergic skin reaction; harmful if swallowed.',
    citrate: 'Not classified as hazardous; avoid dust and eye contact.',
    silver: 'Oxidiser; corrosive to skin and eyes; stains skin; very toxic to aquatic life.',
    ctab: 'Harmful if swallowed; skin irritant; causes serious eye damage; very toxic to aquatic life.',
    nabh4: 'Releases flammable hydrogen on contact with water or acid; toxic if swallowed; causes severe skin burns and eye damage.',
    ascorbic: 'Not classified as hazardous.',
    toluene: 'Highly flammable liquid and vapour; may be fatal if swallowed and enters airways; suspected of damaging the unborn child; drowsiness.',
    toab: 'Skin, eye and respiratory irritant.',
    thiol: 'Skin and eye irritant; may cause an allergic skin reaction; very toxic to aquatic life; strong odour.',
    ethanol: 'Highly flammable liquid and vapour; causes serious eye irritation.',
    hexane: 'Highly flammable; aspiration hazard; skin irritant; nerve damage (neurotoxic) on repeated exposure; toxic to aquatic life.',
    teos: 'Flammable liquid; harmful if inhaled; eye and respiratory irritant; hydrolyses in moist air.',
    ammonia: 'Concentrated solution: corrosive (severe skin burns and eye damage); irritating vapour; very toxic to aquatic life. Use in a fume hood.',
    aps: 'Causes serious eye damage and skin irritation; moisture-sensitive; work in a fume hood.',
    silicate: 'Alkaline: causes skin irritation and serious eye damage.',
    feacac: 'Harmful if swallowed; skin and eye irritant.',
    diol: 'Skin and eye irritant (low hazard).',
    oleic: 'Skin and eye irritant (low hazard); combustible.',
    oleylamine: 'Corrosive (skin burns, eye damage); may be fatal if swallowed and enters airways; organ damage on repeated exposure; very toxic to aquatic life.',
    phenylEther: 'Eye irritant; toxic to aquatic life; boils at about 259 °C — risk of severe burns from hot liquid.',
    fecl3: 'Corrosive to metals; harmful if swallowed; skin irritant; causes serious eye damage.',
    fecl2: 'Harmful if swallowed; causes skin irritation and serious eye damage.',
    cdo: 'Fatal if inhaled; may cause cancer; suspected of causing genetic defects and of damaging fertility or the unborn child; organ damage on repeated exposure; very toxic to aquatic life. Handle in a fume hood or glove box.',
    tdpa: 'Causes skin irritation and serious eye damage.',
    topo: 'Causes skin irritation and serious eye damage; hot TOPO causes severe burns.',
    se: 'Toxic if swallowed or inhaled; organ damage on repeated exposure; toxic to aquatic life.',
    top: 'Causes severe skin burns and eye damage; air-sensitive (handle under inert gas).',
    ode: 'May be fatal if swallowed and enters airways; combustible.',
    sulfur: 'Flammable solid; skin irritant.',
    et2zn: 'Pyrophoric: catches fire spontaneously in air; reacts violently with water; causes severe burns. Air-free (Schlenk or glove-box) technique only.',
    tms2s: 'Flammable; toxic; releases toxic, foul-smelling hydrogen sulfide with moisture. Air-free technique in a fume hood.',
    peg: 'Generally low hazard; check the supplier’s SDS for the specific product.',
    cdcores: 'Contain cadmium: toxic; treat as a carcinogen and avoid skin contact and aerosols.',
    solvents: 'Depends on the solvent; see the SDS.'
  };
  const GOLD_WASTE = 'Collect gold- and silver-containing liquids for metal recovery or as heavy-metal waste; never pour them down the drain.';
  const HOT_ORGANIC = 'High-temperature reactions in organic solvents: work in a fume hood under inert gas, use a heating mantle with a temperature controller and a thermocouple in the liquid, keep a clear route to cool the flask, and never heat a sealed system.';

  /* ------------------------------------------------------------------ */
  /* The protocols                                                       */
  /* ------------------------------------------------------------------ */
  const P = [];

  /* ---------- Citrate gold (Turkevich 1951; size control Frens 1973) ---------- */
  P.push({
    id: 'citrate-gold',
    title: 'Citrate-reduced gold nanoparticles (Turkevich, with Frens size control)',
    summary: 'Gold(III) is reduced by trisodium citrate in boiling water. Citrate is both the reducing agent and the stabiliser. Turkevich’s “standard” procedure is given here; Frens showed that the citrate-to-gold ratio sets the particle size.',
    makes: [
      { role: 'core', material: 'Au', shape: 'sphere', size: [16, 150] },
      { role: 'ligand', ligand: 'citrate', on: ['Au'] }
    ],
    sizeText: 'Spheres, about 20 nm with the standard amounts; roughly 16–150 nm by changing the citrate amount (Frens).',
    sizeVerify: true,
    tuning: {
      text: 'Less citrate per gold gives fewer nuclei and therefore larger particles; more citrate gives smaller ones. Frens added different volumes of 1 % sodium citrate to 50 mL of boiling 0.01 % HAuCl₄ and obtained diameters from about 16 nm (most citrate) to about 150 nm (least citrate). Read the exact citrate volumes and the resulting diameters from the table in Frens (1973). Large particles from low citrate are less uniform and less spherical.',
      ref: 'frens1973', verify: true
    },
    baseVolume: 100, baseLabel: 'final sol',
    reagents: [
      { name: 'Tetrachloroauric(III) acid trihydrate', formula: 'HAuCl4·3H2O', M: 393.82, role: 'gold precursor', stock: { unit: 'neat' }, amount: 0.02538, amountUnit: 'mmol', hazard: H.gold, note: 'Equivalent to 5 mg of gold, dissolved in the 95 mL of water (Turkevich’s standard sol). In practice it is easier to dilute a stock solution of known concentration.' },
      { name: 'Water (high purity)', formula: 'H2O', M: 18.015, role: 'solvent', stock: { unit: 'neat' }, amount: 95, amountUnit: 'mL', hazard: H.water },
      { name: 'Trisodium citrate dihydrate', formula: 'Na3C6H5O7·2H2O', M: 294.10, role: 'reducing agent and stabiliser', stock: { conc: 1, unit: 'wt%', label: '1 % sodium citrate (aqueous)' }, amount: 5, amountUnit: 'mL', hazard: H.citrate, verify: true, note: 'The papers give “1 % sodium citrate”; which hydrate the percentage refers to (and whether it is w/v or w/w) is not stated here — check the original.' }
    ],
    equipment: ['Round-bottom or Erlenmeyer flask with reflux condenser (or loosely covered)', 'Hot plate with magnetic stirrer and stir bar', 'Graduated pipettes', 'Scrupulously clean glassware (gold nucleation is sensitive to contamination)'],
    steps: [
      { text: 'Clean all glassware and stir bars thoroughly and rinse with high-purity water. Many labs use aqua regia for this; it is extremely corrosive and must only be used under your local procedure.', critical: true, general: true },
      { text: 'Dissolve the gold precursor (5 mg of Au) in 95 mL of water and bring the solution to the boil with stirring.', temp: '100 °C (boiling)', ref: 'turkevich1951' },
      { text: 'Add 5 mL of 1 % sodium citrate solution quickly, in one portion, to the boiling, stirred gold solution.', temp: '100 °C', critical: true, ref: 'turkevich1951' },
      { text: 'Keep boiling and stirring. The pale-yellow solution loses its colour, darkens through grey-blue and purple, and turns wine red as the particles form. Continue until the colour no longer changes.', temp: '100 °C', ref: 'turkevich1951' },
      { text: 'Remove from the heat and let cool to room temperature while stirring. Make up to the final volume with water if some was lost by evaporation. Store in the dark (refrigerated storage is common practice).', general: true },
      { text: 'To change the size, keep the gold amount fixed and change the volume of citrate solution (see “Tuning the size”).', ref: 'frens1973' }
    ],
    safety: {
      general: [SDS, 'Hot liquids: use a condenser or watch glass and heat-resistant gloves; boiling can bump when the citrate is added.', 'Aqua regia (if used for cleaning) is a strong oxidiser that releases toxic gases; never store it in a closed container.'],
      waste: [GOLD_WASTE]
    },
    expected: { colour: 'Clear wine red (ruby)', lambdaMax: 'about 520 nm for ≈20 nm spheres in water', size: 'about 20 nm (standard sol)', verify: true },
    characterise: [
      { what: 'Size and concentration from the UV-vis spectrum (A_spr/A450)', calc: 'haiss' },
      { what: 'Model the extinction spectrum for the measured size', calc: 'mie' },
      { what: 'Size distribution from TEM images', calc: 'psd' },
      { what: 'Hydrodynamic size by DLS', calc: 'dls' },
      { what: 'Zeta potential (citrate-capped particles are negatively charged)', calc: 'zeta' },
      { what: 'Particle number concentration from the gold mass', calc: 'nanoparticle' }
    ],
    troubleshooting: [
      { problem: 'Purple or blue final colour, or a broad red-shifted plasmon band', cause: 'Aggregation or non-spherical particles: dirty glassware, too little citrate, or the solution was not boiling when citrate was added.', fix: 'Clean the glassware again, check the citrate concentration, and add the citrate rapidly to a vigorously boiling solution.' },
      { problem: 'Black precipitate or grey film on the glass', cause: 'Gold deposited on contaminated surfaces or uncontrolled growth.', fix: 'Use fresh, clean glassware and high-purity water.' },
      { problem: 'Size differs from the expected value', cause: 'The citrate-to-gold ratio, the pH and the heating rate all affect nucleation.', fix: 'Measure the size (UV-vis, TEM) rather than assuming it; adjust the citrate amount following Frens.' }
    ],
    refs: ['turkevich1951', 'frens1973']
  });

  /* ---------- Citrate silver (Lee & Meisel 1982) ---------- */
  P.push({
    id: 'citrate-silver',
    title: 'Citrate-reduced silver colloid (Lee–Meisel)',
    summary: 'Silver nitrate is reduced by sodium citrate in boiling water. The sol is widely used for surface-enhanced Raman scattering (SERS); it is fairly polydisperse and can contain some rods and plates.',
    makes: [
      { role: 'core', material: 'Ag', shape: 'sphere' },
      { role: 'ligand', ligand: 'citrate', on: ['Ag'] }
    ],
    sizeText: 'Mainly quasi-spherical particles with a broad size distribution; some rods may be present. See the original for the reported size.',
    tuning: { text: 'This method is not designed for size tuning. For better size control, use a seeded-growth method instead.' },
    baseVolume: 510, baseLabel: 'final sol',
    reagents: [
      { name: 'Silver nitrate', formula: 'AgNO3', M: 169.87, role: 'silver precursor', stock: { unit: 'neat' }, amount: 90, amountUnit: 'mg', hazard: H.silver, note: 'Dissolved in the 500 mL of water.' },
      { name: 'Water (high purity)', formula: 'H2O', M: 18.015, role: 'solvent', stock: { unit: 'neat' }, amount: 500, amountUnit: 'mL', hazard: H.water },
      { name: 'Trisodium citrate dihydrate', formula: 'Na3C6H5O7·2H2O', M: 294.10, role: 'reducing agent and stabiliser', stock: { conc: 1, unit: 'wt%', label: '1 % sodium citrate (aqueous)' }, amount: 10, amountUnit: 'mL', hazard: H.citrate, verify: true, note: 'The paper gives “1 % sodium citrate”; check which salt form it refers to.' }
    ],
    equipment: ['1 L flask with reflux condenser', 'Hot plate with magnetic stirrer', 'Clean glassware; protect silver solutions from strong light'],
    steps: [
      { text: 'Dissolve 90 mg of AgNO₃ in 500 mL of water and bring to the boil.', temp: '100 °C (boiling)', ref: 'leemeisel1982' },
      { text: 'Add 10 mL of 1 % sodium citrate solution to the boiling solution.', temp: '100 °C', critical: true, ref: 'leemeisel1982' },
      { text: 'Keep the solution boiling for about 1 hour.', temp: '100 °C', time: '≈ 1 h', ref: 'leemeisel1982' },
      { text: 'Cool to room temperature and store in the dark.', general: true }
    ],
    safety: { general: [SDS, 'Silver nitrate stains skin and benches black; wear gloves.', 'Hot liquids: use a condenser and heat-resistant gloves.'], waste: [GOLD_WASTE] },
    expected: { colour: 'Grey-yellow to greenish-grey, turbid in reflected light', lambdaMax: 'a broad plasmon band in the 400–450 nm region', verify: true },
    characterise: [
      { what: 'Silver particle size from the plasmon peak', calc: 'agsize' },
      { what: 'Model the extinction spectrum', calc: 'mie' },
      { what: 'Size and shape distribution from TEM', calc: 'psd' },
      { what: 'Hydrodynamic size by DLS', calc: 'dls' }
    ],
    troubleshooting: [
      { problem: 'Very broad or double plasmon band', cause: 'Polydispersity and non-spherical particles are typical of this method.', fix: 'Accept it for SERS, or use a seeded-growth route when uniform particles are needed.' },
      { problem: 'Dark grey sediment', cause: 'Aggregation or over-growth.', fix: 'Check the reagent amounts and the cleanliness of the glassware; keep the solution boiling steadily.' }
    ],
    refs: ['leemeisel1982']
  });

  /* ---------- Gold nanorods (Nikoobakht & El-Sayed 2003) ---------- */
  P.push({
    id: 'gold-nanorods-seed',
    title: 'Gold nanorods by seed-mediated growth (Nikoobakht & El-Sayed)',
    summary: 'Small CTAB-capped gold seeds made with NaBH₄ are added to a growth solution of HAuCl₄, CTAB, a little AgNO₃ and ascorbic acid. Silver ions direct anisotropic growth; their amount sets the aspect ratio.',
    makes: [
      { role: 'core', material: 'Au', shape: 'rod' },
      { role: 'ligand', ligand: 'CTAB', on: ['Au'] }
    ],
    sizeText: 'Rods whose aspect ratio is set by the amount of AgNO₃ (single-surfactant CTAB route). The paper reports the aspect ratios obtained; check them against the original.',
    tuning: { text: 'The aspect ratio increases with the volume of 0.0040 M AgNO₃ in the growth solution, which the paper varies over a series of volumes; the amount shown in the table is one point in that series. A binary surfactant mixture (CTAB with benzyldimethylhexadecylammonium chloride) is used in the paper for longer rods. Read the AgNO₃ volumes and resulting aspect ratios from the original.', ref: 'nikoobakht2003', verify: true },
    baseVolume: 10.2, baseLabel: 'growth solution',
    reagents: [
      { name: 'CTAB (cetyltrimethylammonium bromide)', formula: 'C19H42BrN', M: 364.45, role: 'surfactant', stage: 'Seed solution', stock: { conc: 0.20, unit: 'M' }, amount: 5, amountUnit: 'mL', scale: false, hazard: H.ctab },
      { name: 'Tetrachloroauric(III) acid trihydrate', formula: 'HAuCl4·3H2O', M: 393.82, role: 'gold precursor', stage: 'Seed solution', stock: { conc: 0.00050, unit: 'M' }, amount: 5, amountUnit: 'mL', scale: false, hazard: H.gold },
      { name: 'Sodium borohydride (ice-cold, freshly made)', formula: 'NaBH4', M: 37.83, role: 'strong reducing agent', stage: 'Seed solution', stock: { conc: 0.010, unit: 'M' }, amount: 0.60, amountUnit: 'mL', scale: false, hazard: H.nabh4 },
      { name: 'CTAB (cetyltrimethylammonium bromide)', formula: 'C19H42BrN', M: 364.45, role: 'surfactant, shape-directing', stage: 'Growth solution', stock: { conc: 0.20, unit: 'M' }, amount: 5, amountUnit: 'mL', hazard: H.ctab },
      { name: 'Silver nitrate', formula: 'AgNO3', M: 169.87, role: 'shape-directing additive', stage: 'Growth solution', stock: { conc: 0.0040, unit: 'M' }, amount: 0.15, amountUnit: 'mL', hazard: H.silver, verify: true, note: 'Varied in the paper to set the aspect ratio; this value is one point of the series.' },
      { name: 'Tetrachloroauric(III) acid trihydrate', formula: 'HAuCl4·3H2O', M: 393.82, role: 'gold precursor', stage: 'Growth solution', stock: { conc: 0.0010, unit: 'M' }, amount: 5, amountUnit: 'mL', hazard: H.gold },
      { name: 'L-Ascorbic acid', formula: 'C6H8O6', M: 176.12, role: 'mild reducing agent (Au³⁺ → Au⁺)', stage: 'Growth solution', stock: { conc: 0.0788, unit: 'M' }, amount: 70, amountUnit: 'µL', hazard: H.ascorbic },
      { name: 'Seed solution (from the seed stage)', formula: null, M: null, role: 'nuclei', stage: 'Growth solution', stock: { unit: 'neat', label: 'seed solution made above' }, amount: 12, amountUnit: 'µL', hazard: 'As for its components (CTAB, gold).' }
    ],
    equipment: ['Glass vials or tubes', 'Magnetic stirrer', 'Ice bath (for NaBH₄)', 'Water bath or incubator at 27–30 °C', 'Micropipettes (10–1000 µL)', 'Centrifuge (purification)'],
    steps: [
      { stage: 'Seed solution', text: 'Mix 5 mL of 0.20 M CTAB with 5.0 mL of 0.00050 M HAuCl₄.', ref: 'nikoobakht2003' },
      { stage: 'Seed solution', text: 'With stirring, add 0.60 mL of ice-cold 0.010 M NaBH₄. The solution turns brownish yellow. Stir vigorously for about 2 minutes, then keep the seed solution at about 25 °C.', temp: 'ice-cold NaBH₄; seeds kept at ≈25 °C', time: '≈ 2 min stirring', critical: true, ref: 'nikoobakht2003', verify: true },
      { stage: 'Growth solution', text: 'To 5 mL of 0.20 M CTAB add the 0.0040 M AgNO₃ (volume sets the aspect ratio), then 5.0 mL of 0.0010 M HAuCl₄, and mix gently.', temp: '27–30 °C', ref: 'nikoobakht2003' },
      { stage: 'Growth solution', text: 'Add 70 µL of 0.0788 M ascorbic acid. The yellow-orange solution becomes colourless as Au(III) is reduced to Au(I).', critical: true, ref: 'nikoobakht2003' },
      { stage: 'Growth solution', text: 'Add 12 µL of the seed solution, mix gently, and leave undisturbed while the colour develops.', temp: '27–30 °C', critical: true, ref: 'nikoobakht2003' },
      { text: 'Remove excess CTAB by centrifugation and redispersion in water (see the purification protocol).', general: true }
    ],
    safety: {
      general: [SDS, 'NaBH₄ releases hydrogen with water; prepare it fresh, in small amounts, in an open vial.', 'CTAB is toxic to cells and aquatic life; treat rods as CTAB-contaminated until it has been removed or exchanged.'],
      waste: [GOLD_WASTE, 'Collect CTAB-containing liquids as hazardous (aquatic-toxic) waste.']
    },
    expected: { colour: 'Depends on the aspect ratio: from red-purple to blue-brown', lambdaMax: 'Two bands: a transverse band near 520 nm and a longitudinal band that moves to longer wavelengths as the aspect ratio increases', verify: true },
    characterise: [
      { what: 'Aspect ratio from the longitudinal plasmon band (Gans theory)', calc: 'gans' },
      { what: 'Length and width distribution from TEM', calc: 'psd' },
      { what: 'Particle volume, atoms and surface area of a rod', calc: 'nanoparticle' },
      { what: 'Surface charge (CTAB gives positive zeta potentials)', calc: 'zeta' }
    ],
    troubleshooting: [
      { problem: 'Mostly spheres, weak longitudinal band', cause: 'Old or warm NaBH₄ (seeds too large), seeds used too late, or no/too little silver.', fix: 'Make NaBH₄ fresh and ice-cold; use seeds at the age stated in the paper; check the AgNO₃ addition.' },
      { problem: 'Solution does not turn colourless after ascorbic acid', cause: 'Wrong ascorbic acid concentration or order of addition.', fix: 'Prepare ascorbic acid fresh and add it before the seeds.' },
      { problem: 'White crystals in the solution', cause: 'CTAB crystallises below about 25 °C.', fix: 'Keep CTAB solutions and the growth at 27–30 °C.' }
    ],
    refs: ['nikoobakht2003']
  });

  /* ---------- Brust–Schiffrin (1994) ---------- */
  P.push({
    id: 'brust-thiol-gold',
    title: 'Thiol-capped gold nanoparticles by the two-phase method (Brust–Schiffrin)',
    summary: 'AuCl₄⁻ is transferred from water into toluene with tetraoctylammonium bromide, then reduced by NaBH₄ in the presence of dodecanethiol. The result is a solid of very small, alkanethiol-capped gold particles that can be dried and redissolved in non-polar solvents.',
    makes: [
      { role: 'core', material: 'Au', shape: 'sphere', size: [1, 3] },
      { role: 'ligand', ligand: 'alkanethiol', on: ['Au'] }
    ],
    sizeText: 'About 1–3 nm, with most particles around 2 nm.',
    sizeVerify: true,
    tuning: { text: 'In this paper the thiol amount is fixed. Later work showed that the thiol-to-gold ratio and the reduction rate change the size; consult the original and follow-up literature before changing the recipe.' },
    baseVolume: 80, baseLabel: 'toluene (organic) phase',
    reagents: [
      { name: 'Tetrachloroauric(III) acid trihydrate', formula: 'HAuCl4·3H2O', M: 393.82, role: 'gold precursor (aqueous)', stock: { conc: 30, unit: 'mM' }, amount: 30, amountUnit: 'mL', hazard: H.gold },
      { name: 'Tetraoctylammonium bromide (TOAB)', formula: 'C32H68BrN', M: 546.81, role: 'phase-transfer agent', stock: { conc: 50, unit: 'mM', solvent: 'toluene' }, amount: 80, amountUnit: 'mL', hazard: H.toab },
      { name: 'Toluene', formula: 'C7H8', M: 92.14, role: 'organic solvent', stock: { unit: 'neat' }, amount: null, amountUnit: 'mL', hazard: H.toluene, note: 'Solvent of the TOAB solution.' },
      { name: '1-Dodecanethiol', formula: 'C12H26S', M: 202.40, role: 'capping ligand', stock: { unit: 'neat' }, amount: 170, amountUnit: 'mg', hazard: H.thiol, verify: true },
      { name: 'Sodium borohydride (freshly made)', formula: 'NaBH4', M: 37.83, role: 'reducing agent (aqueous)', stock: { conc: 0.4, unit: 'M' }, amount: 25, amountUnit: 'mL', hazard: H.nabh4 },
      { name: 'Ethanol', formula: 'C2H6O', M: 46.07, role: 'antisolvent (work-up)', stock: { unit: 'neat' }, amount: 400, amountUnit: 'mL', hazard: H.ethanol, verify: true }
    ],
    equipment: ['Round-bottom flask or beaker with vigorous magnetic stirring', 'Separating funnel', 'Rotary evaporator', 'Freezer (−18 °C)', 'Filtration set-up', 'Fume hood'],
    steps: [
      { text: 'Mix the aqueous HAuCl₄ solution (30 mL, 30 mM) with the TOAB solution in toluene (80 mL, 50 mM) and stir vigorously until the tetrachloroaurate has transferred into the organic phase (the toluene turns orange, the water becomes colourless).', critical: true, ref: 'brust1994' },
      { text: 'Add the dodecanethiol to the organic phase.', ref: 'brust1994', verify: true },
      { text: 'Add the freshly prepared NaBH₄ solution (25 mL, 0.4 M) slowly, with vigorous stirring. The organic phase turns dark brown.', critical: true, ref: 'brust1994' },
      { text: 'Keep stirring for about 3 hours.', time: '≈ 3 h', ref: 'brust1994' },
      { text: 'Separate the organic phase, concentrate it on a rotary evaporator to about 10 mL, and mix it with about 400 mL of ethanol to remove excess thiol.', ref: 'brust1994', verify: true },
      { text: 'Keep the mixture in a freezer, then collect the dark-brown precipitate by filtration and wash it with ethanol.', temp: '−18 °C', time: '≈ 4 h', ref: 'brust1994', verify: true }
    ],
    safety: {
      general: [SDS, 'Work in a fume hood: toluene vapour and thiol odour.', 'NaBH₄ releases hydrogen: add it slowly to an open, vented vessel away from ignition sources.'],
      waste: [GOLD_WASTE, 'Collect toluene and ethanol as non-halogenated organic solvent waste (keep the two phases’ waste streams as your site requires).']
    },
    expected: { colour: 'Dark-brown organic phase; dark-brown solid that redissolves in toluene, hexane or chloroform', lambdaMax: 'Only a weak or absent plasmon band for particles this small', size: 'about 1–3 nm', verify: true },
    characterise: [
      { what: 'Size distribution from TEM', calc: 'psd' },
      { what: 'Crystallite size from XRD line broadening', calc: 'scherrer' },
      { what: 'Thiol coverage from TGA', calc: 'tga' },
      { what: 'Atoms and surface atoms per particle', calc: 'nanoparticle' }
    ],
    troubleshooting: [
      { problem: 'Aqueous phase still yellow before reduction', cause: 'Incomplete phase transfer.', fix: 'Stir longer and more vigorously; check the TOAB amount.' },
      { problem: 'Product contains free thiol or TOAB', cause: 'Insufficient washing.', fix: 'Repeat the ethanol precipitation and washing; check by NMR or TGA.' }
    ],
    refs: ['brust1994']
  });

  /* ---------- Stöber silica (1968) ---------- */
  P.push({
    id: 'stober-silica',
    title: 'Monodisperse silica spheres (Stöber)',
    summary: 'Tetraethyl orthosilicate (TEOS) is hydrolysed and condensed in an alcohol containing water and ammonia. Ammonia acts as a catalyst and controls the particle shape; uniform spheres from tens of nanometres to about 2 µm are formed.',
    makes: [{ role: 'core', material: 'SiO2', shape: 'sphere', size: [50, 2000] }],
    sizeText: 'Spheres from below 0.05 µm to about 2 µm, depending on the ammonia, water and alcohol used.',
    sizeVerify: true,
    tuning: { text: 'The paper studies the effect of the ammonia and water concentrations and of the alcohol. Size grows with the ammonia concentration, and longer-chain alcohols give larger particles than methanol. Read the reagent concentrations for a target size from the original paper.', ref: 'stober1968' },
    baseVolume: null,
    reagents: [
      { name: 'Tetraethyl orthosilicate (TEOS)', formula: 'C8H20O4Si', M: 208.33, role: 'silica precursor', stock: { unit: 'neat' }, amount: null, amountUnit: 'mL', hazard: H.teos },
      { name: 'Ethanol (or another alcohol)', formula: 'C2H6O', M: 46.07, role: 'solvent', stock: { unit: 'neat' }, amount: null, amountUnit: 'mL', hazard: H.ethanol },
      { name: 'Ammonia solution (concentrated, aqueous)', formula: 'NH3', M: 17.031, role: 'catalyst and morphology control', stock: { unit: 'neat', label: 'concentrated aqueous ammonia' }, amount: null, amountUnit: 'mL', hazard: H.ammonia },
      { name: 'Water', formula: 'H2O', M: 18.015, role: 'hydrolysis reactant', stock: { unit: 'neat' }, amount: null, amountUnit: 'mL', hazard: H.water }
    ],
    equipment: ['Glass flask with stopper or cover', 'Magnetic stirrer', 'Centrifuge (purification)', 'Fume hood'],
    steps: [
      { text: 'Mix the alcohol, water and ammonia in the proportions given in the original paper for your target size.', ref: 'stober1968' },
      { text: 'Add the TEOS with stirring at room temperature.', temp: 'room temperature', critical: true, ref: 'stober1968' },
      { text: 'Keep stirring. The solution becomes turbid (opalescent) as particles nucleate and grow; leave it until growth is complete (see the original for reaction times).', ref: 'stober1968' },
      { text: 'Collect the particles by centrifugation and wash with ethanol and water (see the purification protocol).', general: true }
    ],
    safety: { general: [SDS, 'Handle concentrated ammonia and TEOS in a fume hood.', 'Do not let dry silica powder become airborne; avoid inhaling it.'], waste: ['Collect alcoholic, ammoniacal liquids as organic solvent waste.'] },
    expected: { colour: 'White, opalescent dispersion', size: 'Set by the composition; check against the paper’s data' },
    characterise: [
      { what: 'Size distribution from SEM/TEM', calc: 'psd' },
      { what: 'Hydrodynamic size by DLS', calc: 'dls' },
      { what: 'Surface area from N₂ sorption', calc: 'bet' },
      { what: 'Surface charge', calc: 'zeta' }
    ],
    troubleshooting: [
      { problem: 'Broad size distribution or secondary small particles', cause: 'Poor mixing at TEOS addition or variable water/ammonia content (ammonia evaporates).', fix: 'Use fresh, titrated ammonia; add TEOS quickly with good stirring; keep the flask closed.' },
      { problem: 'Aggregated particles', cause: 'Low surface charge during washing or drying.', fix: 'Wash by centrifugation and redispersion without drying.' }
    ],
    refs: ['stober1968']
  });

  /* ---------- Silica shell on citrate gold (Liz-Marzán, Giersig & Mulvaney 1996) ---------- */
  P.push({
    id: 'silica-shell-gold',
    title: 'Silica shell on citrate gold (Liz-Marzán, Giersig & Mulvaney)',
    summary: 'Citrate-stabilised gold is made “vitreophilic” with an aminosilane coupling agent, a thin silica layer is grown from sodium silicate in water, and the particles are then transferred to ethanol for further growth by the Stöber method.',
    makes: [{ role: 'shell', material: 'SiO2', on: ['Au'] }],
    sizeText: 'A thin shell (a few nanometres) from silicate in water; thicker shells by subsequent Stöber growth in ethanol.',
    tuning: { text: 'The shell thickness from the silicate step depends on the deposition time; thicker shells are grown in ethanol by adding TEOS and ammonia (Stöber), with the thickness set by the amount of TEOS. See the original for the relation between conditions and thickness.', ref: 'lizmarzan1996' },
    baseVolume: 500, baseLabel: 'gold sol',
    reagents: [
      { name: 'Citrate gold sol (from the citrate-gold protocol)', formula: null, M: null, role: 'cores', stock: { unit: 'neat', label: 'as prepared' }, amount: 500, amountUnit: 'mL', hazard: 'Low hazard; contains gold.', verify: true },
      { name: '(3-Aminopropyl)trimethoxysilane (APS)', formula: 'C6H17NO3Si', M: 179.29, role: 'coupling agent (primer)', stock: { conc: 1, unit: 'mM', label: '1 mM, freshly prepared (aqueous)' }, amount: 2.5, amountUnit: 'mL', hazard: H.aps, verify: true },
      { name: 'Sodium silicate (“active silica”)', formula: 'Na2SiO3', M: 122.06, role: 'silica source (aqueous step)', stock: { conc: 0.54, unit: 'wt%', label: '0.54 wt %, pH lowered to 10–11' }, amount: 20, amountUnit: 'mL', hazard: H.silicate, verify: true, note: 'Commercial sodium silicate is a solution of variable composition; the formula and molar mass are nominal.' },
      { name: 'Ethanol', formula: 'C2H6O', M: 46.07, role: 'solvent for Stöber growth', stock: { unit: 'neat' }, amount: null, amountUnit: 'mL', hazard: H.ethanol },
      { name: 'Tetraethyl orthosilicate (TEOS)', formula: 'C8H20O4Si', M: 208.33, role: 'silica precursor (thick shells)', stock: { unit: 'neat' }, amount: null, amountUnit: 'mL', hazard: H.teos },
      { name: 'Ammonia solution (concentrated)', formula: 'NH3', M: 17.031, role: 'catalyst (Stöber step)', stock: { unit: 'neat', label: 'concentrated aqueous ammonia' }, amount: null, amountUnit: 'mL', hazard: H.ammonia }
    ],
    equipment: ['Glass flasks', 'Magnetic stirrer', 'Cation-exchange resin (to lower the silicate pH)', 'Centrifuge', 'pH meter'],
    steps: [
      { text: 'To the citrate gold sol, add the freshly prepared APS solution with vigorous stirring and leave it to complex with the gold surface.', time: '≈ 15 min', critical: true, ref: 'lizmarzan1996', verify: true },
      { text: 'Prepare the active silica: dilute sodium silicate and lower its pH to 10–11 (the paper uses a cation-exchange resin).', ref: 'lizmarzan1996', verify: true },
      { text: 'Add the active silica to the primed gold sol with vigorous stirring and let the thin silica shell deposit (about a day in the original).', time: '≈ 24 h', ref: 'lizmarzan1996', verify: true },
      { text: 'Transfer the coated particles into ethanol (the paper does this by centrifugation or by gradual addition of ethanol) — the thin shell prevents aggregation.', critical: true, ref: 'lizmarzan1996' },
      { text: 'For thicker shells, grow silica in ethanol by adding TEOS and ammonia (Stöber conditions) in the amounts given in the original.', ref: ['lizmarzan1996', 'stober1968'] }
    ],
    safety: { general: [SDS, 'Aminosilanes and concentrated ammonia: fume hood, gloves and eye protection.'], waste: [GOLD_WASTE, 'Alcoholic, ammoniacal liquids as organic solvent waste.'] },
    expected: { colour: 'Red, slightly turbid as the shell thickens; the plasmon band red-shifts by a few nanometres because silica has a higher refractive index than water', verify: true },
    characterise: [
      { what: 'Shell thickness from TEM', calc: 'psd' },
      { what: 'Hydrodynamic size by DLS (should grow by about twice the shell thickness)', calc: 'dls' },
      { what: 'Zeta potential (silica surface is strongly negative at neutral pH)', calc: 'zeta' },
      { what: 'Plasmon peak and shell effect on the spectrum', calc: 'mie' }
    ],
    troubleshooting: [
      { problem: 'Particles aggregate on transfer to ethanol', cause: 'The silicate shell is incomplete or too thin.', fix: 'Allow longer silicate deposition; check the APS step.' },
      { problem: 'Free silica particles without cores', cause: 'Secondary nucleation in the Stöber step.', fix: 'Add TEOS in smaller portions and keep the core concentration high enough.' }
    ],
    refs: ['lizmarzan1996', 'stober1968']
  });

  /* ---------- Fe3O4 by thermal decomposition (Sun & Zeng 2002; Sun et al. 2004) ---------- */
  P.push({
    id: 'magnetite-thermal',
    title: 'Magnetite nanoparticles by thermal decomposition of Fe(acac)₃ (Sun & Zeng)',
    summary: 'Iron(III) acetylacetonate is decomposed at high temperature in phenyl ether with 1,2-hexadecanediol, oleic acid and oleylamine. The particles are oleate/oleylamine-capped and disperse in hexane; seed-mediated growth gives larger sizes.',
    makes: [
      { role: 'core', material: 'Fe3O4', shape: 'sphere', size: [3, 20] },
      { role: 'ligand', ligand: 'oleic-acid', on: ['Fe3O4'] },
      { role: 'ligand', ligand: 'oleylamine', on: ['Fe3O4'] }
    ],
    sizeText: 'About 4 nm in phenyl ether (6 nm in benzyl ether); larger particles, up to about 20 nm, by seed-mediated growth.',
    sizeVerify: true,
    tuning: { text: 'The solvent sets the size of the first particles (phenyl ether gives smaller particles than the higher-boiling benzyl ether). Larger particles are made by adding the first particles as seeds to a fresh reaction mixture and repeating the heating; each cycle increases the size. See both papers for the seed amounts and sizes.', ref: ['sun2002mag', 'sun2004mfe'], verify: true },
    baseVolume: 20, baseLabel: 'phenyl ether',
    reagents: [
      { name: 'Iron(III) acetylacetonate', formula: 'Fe(C5H7O2)3', M: 353.17, role: 'iron precursor', stock: { unit: 'neat' }, amount: 2, amountUnit: 'mmol', hazard: H.feacac },
      { name: '1,2-Hexadecanediol', formula: 'C16H34O2', M: 258.45, role: 'reducing agent', stock: { unit: 'neat' }, amount: 10, amountUnit: 'mmol', hazard: H.diol },
      { name: 'Oleic acid', formula: 'C18H34O2', M: 282.47, role: 'surfactant', stock: { unit: 'neat' }, amount: 6, amountUnit: 'mmol', hazard: H.oleic },
      { name: 'Oleylamine', formula: 'C18H37N', M: 267.50, role: 'surfactant', stock: { unit: 'neat' }, amount: 6, amountUnit: 'mmol', hazard: H.oleylamine },
      { name: 'Phenyl ether (diphenyl ether)', formula: 'C12H10O', M: 170.21, role: 'solvent', stock: { unit: 'neat' }, amount: 20, amountUnit: 'mL', hazard: H.phenylEther },
      { name: 'Ethanol', formula: 'C2H6O', M: 46.07, role: 'antisolvent (work-up)', stock: { unit: 'neat' }, amount: null, amountUnit: 'mL', hazard: H.ethanol },
      { name: 'Hexane', formula: 'C6H14', M: 86.18, role: 'dispersion solvent (work-up)', stock: { unit: 'neat' }, amount: null, amountUnit: 'mL', hazard: H.hexane }
    ],
    equipment: ['Three-neck round-bottom flask with condenser', 'Schlenk line or nitrogen/argon supply', 'Heating mantle with temperature controller and thermocouple', 'Magnetic stirrer', 'Centrifuge', 'Fume hood'],
    steps: [
      { text: 'Combine Fe(acac)₃, 1,2-hexadecanediol, oleic acid, oleylamine and phenyl ether in the flask and stir under a flow of nitrogen.', critical: true, ref: 'sun2002mag' },
      { text: 'Heat to 200 °C and hold.', temp: '200 °C', time: '30 min', ref: 'sun2002mag', verify: true },
      { text: 'Under nitrogen, heat to reflux and hold.', temp: 'reflux', time: '30 min', critical: true, ref: 'sun2002mag', verify: true },
      { text: 'Remove the heat and let the black mixture cool to room temperature under nitrogen.', ref: 'sun2002mag' },
      { text: 'Add ethanol to precipitate the particles, separate by centrifugation, and redisperse in hexane in the presence of a little oleic acid and oleylamine; remove any undispersed residue by centrifugation, then precipitate again with ethanol and redisperse in hexane.', ref: ['sun2002mag', 'sun2004mfe'], verify: true },
      { text: 'For larger particles, use the product as seeds in a new reaction mixture and repeat the heating (seed-mediated growth).', ref: ['sun2002mag', 'sun2004mfe'] }
    ],
    safety: { general: [SDS, HOT_ORGANIC, 'Fine magnetic powders: avoid inhaling; keep particles in dispersion where possible.'], waste: ['Collect organic solvents (phenyl ether, hexane, ethanol) as non-halogenated organic waste; iron-containing residues as solid chemical waste.'] },
    expected: { colour: 'Black-brown dispersion in hexane; attracted by a magnet', size: 'about 4 nm (phenyl ether)', verify: true },
    characterise: [
      { what: 'Crystallite size from XRD', calc: 'scherrer' },
      { what: 'Size distribution from TEM', calc: 'psd' },
      { what: 'Lattice spacings from electron diffraction', calc: 'saed' },
      { what: 'Saturation magnetisation and blocking temperature', calc: 'magnet' },
      { what: 'Ligand coverage from TGA', calc: 'tga' }
    ],
    troubleshooting: [
      { problem: 'Broad size distribution', cause: 'Heating rate or temperature differs from the paper; oxygen or water present.', fix: 'Degas the mixture, control the heating rate, and measure the temperature in the liquid.' },
      { problem: 'Particles do not redisperse in hexane', cause: 'Too little free surfactant after washing, or over-washing.', fix: 'Add a little oleic acid and oleylamine when redispersing.' }
    ],
    refs: ['sun2002mag', 'sun2004mfe']
  });

  /* ---------- Fe3O4 by co-precipitation (Massart 1981) ---------- */
  P.push({
    id: 'magnetite-coprecipitation',
    title: 'Magnetite by alkaline co-precipitation (Massart)',
    summary: 'Iron(III) and iron(II) chlorides in a 2:1 molar ratio are precipitated together with an aqueous base at room temperature. The particles can then be peptised to give an aqueous ferrofluid that is stable in alkaline or in acidic medium.',
    makes: [{ role: 'core', material: 'Fe3O4', shape: 'sphere' }],
    sizeText: 'Polydisperse nanoparticles; see the original paper for the reported size.',
    tuning: { text: 'This simple route gives limited size control. The base, the ionic strength, the pH and the Fe³⁺/Fe²⁺ ratio affect the size; the 2:1 ratio is the stoichiometry of Fe₃O₄. Consult the original and follow-up literature for size control.' },
    baseVolume: null,
    reagents: [
      { name: 'Iron(III) chloride (hexahydrate shown)', formula: 'FeCl3·6H2O', M: 270.29, role: 'Fe³⁺ source', stock: { unit: 'M' }, amount: null, amountUnit: 'mL', hazard: H.fecl3, verify: true, note: 'The hydrate (and therefore the molar mass) depends on the salt you use; check the label.' },
      { name: 'Iron(II) chloride (tetrahydrate shown)', formula: 'FeCl2·4H2O', M: 198.81, role: 'Fe²⁺ source', stock: { unit: 'M' }, amount: null, amountUnit: 'mL', hazard: H.fecl2, verify: true, note: 'Molar ratio Fe³⁺ : Fe²⁺ = 2 : 1 (stoichiometry of Fe₃O₄).' },
      { name: 'Aqueous ammonia (base)', formula: 'NH3', M: 17.031, role: 'precipitating base', stock: { unit: 'neat', label: 'aqueous ammonia' }, amount: null, amountUnit: 'mL', hazard: H.ammonia },
      { name: 'Water', formula: 'H2O', M: 18.015, role: 'solvent', stock: { unit: 'neat' }, amount: null, amountUnit: 'mL', hazard: H.water }
    ],
    equipment: ['Beaker with vigorous mechanical or magnetic stirring', 'Strong permanent magnet (magnetic decantation)', 'pH meter', 'Fume hood (ammonia)'],
    steps: [
      { text: 'Prepare aqueous solutions of FeCl₃ and FeCl₂ so that the Fe³⁺ : Fe²⁺ molar ratio is 2 : 1 (concentrations as in the original paper).', critical: true, ref: 'massart1981' },
      { text: 'Mix the iron solution with the aqueous base under vigorous stirring at room temperature. A black precipitate of magnetite forms immediately.', temp: 'room temperature', ref: 'massart1981' },
      { text: 'Separate the precipitate by holding a magnet under the beaker and decanting the supernatant; wash with water.', ref: 'massart1981' },
      { text: 'Peptise the particles to make the ferrofluid in alkaline or in acidic medium, following the original paper.', ref: 'massart1981', verify: true }
    ],
    safety: { general: [SDS, 'Iron(II) solutions oxidise in air; prepare them fresh.', 'Concentrated ammonia: fume hood, gloves and eye protection.'], waste: ['Neutralise basic or acidic supernatants as your site requires; collect iron residues as chemical waste.'] },
    expected: { colour: 'Black precipitate that is strongly attracted by a magnet' },
    characterise: [
      { what: 'Crystallite size from XRD', calc: 'scherrer' },
      { what: 'Size distribution from TEM', calc: 'psd' },
      { what: 'Saturation magnetisation', calc: 'magnet' },
      { what: 'Hydrodynamic size of the ferrofluid', calc: 'dls' },
      { what: 'Surface charge versus pH', calc: 'zeta' }
    ],
    troubleshooting: [
      { problem: 'Brown rather than black product', cause: 'Oxidation of Fe²⁺ (to maghemite or iron hydroxides) or a wrong Fe³⁺/Fe²⁺ ratio.', fix: 'Use fresh Fe²⁺ solution, deoxygenated water and check the ratio.' }
    ],
    refs: ['massart1981']
  });

  /* ---------- CdSe from CdO (Peng & Peng 2001) ---------- */
  P.push({
    id: 'cdse-cdo',
    title: 'CdSe quantum dots from CdO (Peng & Peng)',
    summary: 'CdO is dissolved in hot trioctylphosphine oxide (TOPO) with tetradecylphosphonic acid (TDPA), and a solution of selenium in trioctylphosphine (TOP) is injected. The CdO route avoids the pyrophoric dimethylcadmium of earlier methods.',
    makes: [
      { role: 'core', material: 'CdSe', shape: 'sphere' },
      { role: 'ligand', ligand: 'TDPA', on: ['CdSe'] }
    ],
    sizeText: 'Size grows with reaction time; follow it by the first absorption peak.',
    tuning: { text: 'Take aliquots during growth and stop the reaction when the first excitonic absorption peak reaches the wavelength for the size you want (use the Yu et al. sizing calculator). The paper also describes CdTe and CdS by the same route.', ref: 'peng2001' },
    baseVolume: 4, baseUnit: 'g', baseLabel: 'TOPO + TDPA mixture',
    reagents: [
      { name: 'Cadmium oxide', formula: 'CdO', M: 128.41, role: 'cadmium precursor', stock: { unit: 'neat' }, amount: 51.4, amountUnit: 'mg', hazard: H.cdo, verify: true },
      { name: 'Tetradecylphosphonic acid (TDPA)', formula: 'C14H31O3P', M: 278.37, role: 'ligand that dissolves CdO', stock: { unit: 'neat' }, amount: 223.2, amountUnit: 'mg', hazard: H.tdpa, verify: true },
      { name: 'Trioctylphosphine oxide (TOPO)', formula: 'C24H51OP', M: 386.65, role: 'solvent and ligand', stock: { unit: 'neat' }, amount: 3.7768, amountUnit: 'g', hazard: H.topo, verify: true },
      { name: 'Selenium', formula: 'Se', M: 78.971, role: 'selenium precursor', stock: { unit: 'neat' }, amount: null, amountUnit: 'mg', hazard: H.se },
      { name: 'Trioctylphosphine (TOP)', formula: 'C24H51P', M: 370.65, role: 'solvent for Se', stock: { unit: 'neat' }, amount: null, amountUnit: 'g', hazard: H.top }
    ],
    equipment: ['25 mL three-neck flask', 'Schlenk line (argon)', 'Heating mantle with controller and thermocouple', 'Syringe for injection', 'Glove box or inert-gas technique for TOP/Se', 'UV-vis spectrometer'],
    steps: [
      { text: 'Load CdO, TDPA and TOPO into the flask and place under argon.', ref: 'peng2001', verify: true },
      { text: 'Heat until the CdO dissolves and the solution becomes clear and colourless.', temp: '300–320 °C', critical: true, ref: 'peng2001', verify: true },
      { text: 'Cool to the injection temperature and inject the Se/TOP solution quickly.', temp: '≈ 270 °C', critical: true, ref: 'peng2001', verify: true },
      { text: 'Grow the nanocrystals at the growth temperature, taking aliquots to follow the first absorption peak.', temp: '≈ 250 °C', ref: 'peng2001', verify: true },
      { text: 'Cool, then precipitate the nanocrystals with a polar antisolvent (e.g. methanol or acetone), centrifuge and redisperse in a non-polar solvent (see purification).', general: true }
    ],
    safety: { general: [SDS, 'Cadmium compounds are carcinogenic and highly toxic: weigh CdO in a fume hood or glove box, avoid all dust, and follow your site’s procedure for carcinogens.', HOT_ORGANIC, 'Injection into a liquid at about 270 °C can splash: use a face shield and add the injection solution through a septum.'], waste: ['Collect all cadmium- and selenium-containing material (liquids, solids, gloves, wipes) as toxic heavy-metal waste.'] },
    expected: { colour: 'Yellow → orange → red as the dots grow; fluorescent under UV light', lambdaMax: 'First excitonic absorption peak moves to longer wavelengths during growth' },
    characterise: [
      { what: 'Size and concentration from the first absorption peak (Yu et al. 2003)', calc: 'qdyu' },
      { what: 'Photoluminescence quantum yield', calc: 'plqy' },
      { what: 'Size distribution from TEM', calc: 'psd' },
      { what: 'Crystal structure and crystallite size by XRD', calc: 'scherrer' }
    ],
    troubleshooting: [
      { problem: 'CdO does not dissolve', cause: 'Temperature too low or not enough phosphonic acid.', fix: 'Check the temperature in the liquid and the TDPA amount against the paper.' },
      { problem: 'Broad absorption peak', cause: 'Slow injection or temperature drift during growth.', fix: 'Inject quickly; keep the growth temperature stable; stop earlier (size focusing).' }
    ],
    refs: ['peng2001']
  });

  /* ---------- CdS shell on CdSe by SILAR (Li et al. 2003) ---------- */
  P.push({
    id: 'cds-shell-silar',
    title: 'CdS shell on CdSe by SILAR (Li et al.)',
    summary: 'Successive ion layer adsorption and reaction: cadmium and sulfur precursor solutions are added alternately, each in the amount needed for one monolayer on the current particle, so the shell grows one layer at a time without forming separate CdS particles.',
    makes: [{ role: 'shell', material: 'CdS', on: ['CdSe'] }],
    sizeText: 'Shell thickness set by the number of SILAR cycles (one monolayer per cycle).',
    tuning: { text: 'The amount of each precursor per cycle is calculated from the surface of the current particle and the thickness of one CdS monolayer, so the number of cycles sets the shell thickness. Use the paper’s monolayer thickness and volume calculation; NanoCalc’s particle builder gives the shell volumes for a chosen thickness.', ref: 'li2003silar', verify: true },
    baseVolume: null,
    reagents: [
      { name: 'Cadmium oxide (for the Cd injection solution)', formula: 'CdO', M: 128.41, role: 'cadmium precursor', stock: { unit: 'M' }, amount: null, amountUnit: 'mL', hazard: H.cdo },
      { name: 'Oleic acid', formula: 'C18H34O2', M: 282.47, role: 'ligand for the Cd precursor', stock: { unit: 'neat' }, amount: null, amountUnit: 'mL', hazard: H.oleic },
      { name: 'Sulfur (for the S injection solution)', formula: 'S', M: 32.06, role: 'sulfur precursor', stock: { unit: 'M' }, amount: null, amountUnit: 'mL', hazard: H.sulfur },
      { name: '1-Octadecene (ODE)', formula: 'C18H36', M: 252.48, role: 'non-coordinating solvent', stock: { unit: 'neat' }, amount: null, amountUnit: 'mL', hazard: H.ode },
      { name: 'Octadecylamine (ODA)', formula: 'C18H39N', M: 269.52, role: 'ligand / co-solvent', stock: { unit: 'neat' }, amount: null, amountUnit: 'g', hazard: 'Causes skin irritation and serious eye damage; very toxic to aquatic life.' },
      { name: 'CdSe cores (purified)', formula: null, M: null, role: 'cores', stock: { unit: 'neat' }, amount: null, amountUnit: 'mg', hazard: H.cdcores }
    ],
    equipment: ['Three-neck flask', 'Schlenk line (argon)', 'Heating mantle with controller', 'Syringes or syringe pump', 'UV-vis and fluorescence spectrometers'],
    steps: [
      { text: 'Prepare the Cd injection solution (CdO dissolved in oleic acid and ODE) and the S injection solution (sulfur in ODE) at the concentrations given in the paper.', ref: 'li2003silar', verify: true },
      { text: 'Disperse the purified CdSe cores in ODE and ODA under argon and heat to the shell-growth temperature.', ref: 'li2003silar', verify: true },
      { text: 'Calculate the amount of Cd and of S for one monolayer on the current particle size (the volume of the new layer times the CdS density, divided by its molar mass).', critical: true, ref: 'li2003silar' },
      { text: 'Inject the Cd solution for the first monolayer, wait for it to react, then inject the S solution for the same monolayer. Repeat with recalculated amounts for each further monolayer.', critical: true, ref: 'li2003silar' },
      { text: 'Follow the absorption and emission peaks after each cycle; they shift to longer wavelengths as the shell grows.', ref: 'li2003silar' }
    ],
    safety: { general: [SDS, HOT_ORGANIC, 'Cadmium compounds are carcinogenic and highly toxic; see the CdSe protocol.'], waste: ['Collect all cadmium-containing material as toxic heavy-metal waste.'] },
    expected: { colour: 'Absorption and emission red-shift with each monolayer; brighter photoluminescence than the bare cores', verify: true },
    characterise: [
      { what: 'Shell volume and composition for a chosen thickness', calc: 'nanoparticle' },
      { what: 'Photoluminescence quantum yield', calc: 'plqy' },
      { what: 'Size distribution before and after shelling (TEM)', calc: 'psd' }
    ],
    troubleshooting: [
      { problem: 'New small particles appear (separate absorption feature)', cause: 'Too much precursor per cycle causes homogeneous nucleation of CdS.', fix: 'Recalculate the monolayer amounts from the measured core size; add more slowly.' }
    ],
    refs: ['li2003silar']
  });

  /* ---------- ZnS shell on CdSe (Dabbousi et al. 1997) ---------- */
  P.push({
    id: 'zns-shell-cdse',
    title: 'ZnS shell on CdSe quantum dots (Dabbousi et al.)',
    summary: 'Zinc and sulfur precursors (diethylzinc and hexamethyldisilathiane in TOP) are added slowly to CdSe cores in hot TOPO. The wide-band-gap ZnS shell passivates the core surface and greatly increases the photoluminescence quantum yield.',
    makes: [{ role: 'shell', material: 'ZnS', on: ['CdSe'] }],
    sizeText: 'Thin shells, typically one to a few monolayers; the precursor amount sets the thickness.',
    tuning: { text: 'The amounts of Zn and S precursors are calculated for the desired shell thickness from the core size and concentration. The shelling temperature in the paper depends on the core size (lower for small cores, higher for large cores). Take both from the original.', ref: 'dabbousi1997', verify: true },
    baseVolume: null,
    reagents: [
      { name: 'Diethylzinc', formula: 'C4H10Zn', M: 123.50, role: 'zinc precursor', stock: { unit: 'neat' }, amount: null, amountUnit: 'µL', hazard: H.et2zn },
      { name: 'Hexamethyldisilathiane ((TMS)₂S)', formula: '[(CH3)3Si]2S', M: 178.44, role: 'sulfur precursor', stock: { unit: 'neat' }, amount: null, amountUnit: 'µL', hazard: H.tms2s },
      { name: 'Trioctylphosphine (TOP)', formula: 'C24H51P', M: 370.65, role: 'precursor solvent', stock: { unit: 'neat' }, amount: null, amountUnit: 'mL', hazard: H.top },
      { name: 'Trioctylphosphine oxide (TOPO)', formula: 'C24H51OP', M: 386.65, role: 'solvent and ligand', stock: { unit: 'neat' }, amount: null, amountUnit: 'g', hazard: H.topo },
      { name: 'CdSe cores', formula: null, M: null, role: 'cores', stock: { unit: 'neat' }, amount: null, amountUnit: 'mg', hazard: H.cdcores }
    ],
    equipment: ['Glove box (for diethylzinc and (TMS)₂S)', 'Three-neck flask on a Schlenk line', 'Heating mantle with controller', 'Addition funnel or syringe pump for slow dropwise addition'],
    steps: [
      { text: 'Disperse the CdSe cores in TOPO under inert gas and heat to the shelling temperature for that core size.', temp: 'size-dependent (see paper)', ref: 'dabbousi1997', verify: true },
      { text: 'In a glove box, mix the calculated amounts of diethylzinc and (TMS)₂S in TOP.', critical: true, ref: 'dabbousi1997' },
      { text: 'Add the precursor solution dropwise to the vigorously stirred cores over several minutes; slow addition avoids separate ZnS nucleation.', time: 'several minutes (see paper)', critical: true, ref: 'dabbousi1997', verify: true },
      { text: 'Lower the temperature and stir to anneal the shell, as in the original, then cool and purify by precipitation.', ref: 'dabbousi1997', verify: true }
    ],
    safety: { general: [SDS, 'Diethylzinc is pyrophoric: it must only be handled by trained people with air-free technique; have a class D extinguisher or dry sand available.', '(TMS)₂S releases hydrogen sulfide with moisture: glove box and fume hood.', HOT_ORGANIC], waste: ['Quench pyrophoric residues according to your site procedure before disposal; collect cadmium and zinc waste as heavy-metal waste.'] },
    expected: { colour: 'Slight red shift of the absorption and emission; much higher photoluminescence quantum yield than bare cores', verify: true },
    characterise: [
      { what: 'Photoluminescence quantum yield', calc: 'plqy' },
      { what: 'Core size from absorption (before shelling)', calc: 'qdyu' },
      { what: 'Size distribution and shell growth by TEM', calc: 'psd' },
      { what: 'Shell composition by XPS', calc: 'xps' }
    ],
    troubleshooting: [
      { problem: 'Quantum yield falls after shelling', cause: 'Shell too thick (strain) or separate ZnS particles.', fix: 'Use less precursor and add it more slowly.' }
    ],
    refs: ['dabbousi1997']
  });

  /* ---------- Thiol-PEG ligand exchange on citrate gold ---------- */
  P.push({
    id: 'peg-thiol-exchange',
    title: 'Thiol-PEG ligand exchange on citrate gold',
    summary: 'Citrate on gold nanoparticles is replaced by a methoxy-PEG thiol (mPEG-SH), which binds through the Au–S bond. PEGylated particles resist aggregation in salt and biological media. The cited study relates the PEG amount (capping density) to stability.',
    makes: [{ role: 'ligand', ligand: 'PEG-thiol', on: ['Au'] }],
    sizeText: 'The gold core is unchanged; the hydrodynamic size grows by the PEG layer.',
    tuning: { text: 'The PEG-to-particle ratio sets the grafting density and therefore the stability; the PEG molar mass sets the layer thickness. See the original for the amounts tested.', ref: 'manson2011' },
    baseVolume: null,
    reagents: [
      { name: 'Citrate gold nanoparticles', formula: null, M: null, role: 'starting particles', stock: { unit: 'neat' }, amount: null, amountUnit: 'mL', hazard: 'Low hazard; contains gold.' },
      { name: 'Methoxy-PEG-thiol (mPEG-SH)', formula: null, M: null, role: 'ligand', stock: { unit: 'mM' }, amount: null, amountUnit: 'µL', hazard: H.peg, note: 'The molar mass depends on the product (PEG chain length); use the value on the label.' },
      { name: 'Water (high purity)', formula: 'H2O', M: 18.015, role: 'solvent', stock: { unit: 'neat' }, amount: null, amountUnit: 'mL', hazard: H.water }
    ],
    equipment: ['Vials or tubes', 'Shaker or magnetic stirrer', 'Centrifuge', 'UV-vis spectrometer and DLS'],
    steps: [
      { text: 'Estimate the gold particle concentration (UV-vis) and the surface area per mL, then calculate the amount of mPEG-SH for the grafting density you want.', general: true },
      { text: 'Add the mPEG-SH solution to the citrate gold with mixing and leave it to react as in the original paper.', critical: true, ref: 'manson2011' },
      { text: 'Remove unbound PEG by centrifugation and redispersion (see purification).', general: true },
      { text: 'Test the stability: add salt (e.g. NaCl) to a small aliquot and check that the plasmon band does not broaden or shift (the cited paper tests stability in several media).', ref: 'manson2011' }
    ],
    safety: { general: [SDS], waste: [GOLD_WASTE] },
    expected: { colour: 'Unchanged red colour; a small red shift of the plasmon band; larger hydrodynamic size; zeta potential closer to zero' },
    characterise: [
      { what: 'Particle concentration from UV-vis (to size the PEG dose)', calc: 'haiss' },
      { what: 'Hydrodynamic size by DLS', calc: 'dls' },
      { what: 'Zeta potential', calc: 'zeta' },
      { what: 'PEG grafting density from TGA', calc: 'tga' }
    ],
    troubleshooting: [
      { problem: 'Particles aggregate when the PEG is added', cause: 'Local high concentration of thiol or salt in the PEG solution.', fix: 'Add the PEG solution slowly with stirring; dissolve it in water rather than buffer.' },
      { problem: 'Particles aggregate in salt after exchange', cause: 'Grafting density too low.', fix: 'Use more mPEG-SH per particle or a longer reaction time.' }
    ],
    refs: ['manson2011']
  });

  /* ---------- Purification (general practice) ---------- */
  P.push({
    id: 'purification-centrifugation',
    title: 'Purification by centrifugation and washing',
    summary: 'Unreacted precursors, excess ligand and by-products are removed by sedimenting the particles, replacing the supernatant with clean solvent and redispersing. This is general laboratory practice rather than a single published protocol; it applies to most of the syntheses here.',
    generalPractice: true,
    makes: [{ role: 'purification', material: '*' }],
    sizeText: 'Does not change the particles; removes small impurities and, with care, the smallest particles.',
    tuning: { text: 'The time and speed needed scale with the particle size and density difference (Stokes’ law): small or low-density particles need much stronger centrifugation. Estimate them with the sedimentation calculator. Very small particles (a few nm) can be purified more gently by diafiltration (Sweeney et al.).', ref: ['stokes1851', 'sweeney2006'] },
    baseVolume: null,
    reagents: [
      { name: 'Washing medium (water, buffer or solvent)', formula: null, M: null, role: 'washing liquid', stock: { unit: 'neat' }, amount: null, amountUnit: 'mL', hazard: H.solvents },
      { name: 'Antisolvent (for non-polar particles, e.g. ethanol or methanol)', formula: null, M: null, role: 'precipitant', stock: { unit: 'neat' }, amount: null, amountUnit: 'mL', hazard: H.solvents }
    ],
    equipment: ['Centrifuge with suitable rotor and tubes (rated for the speed and solvent)', 'Ultrasonic bath', 'Pipettes'],
    steps: [
      { text: 'Estimate the centrifugation speed and time from the particle size and density with the sedimentation calculator; start with a short run and check the supernatant.', ref: 'stokes1851' },
      { text: 'Centrifuge. For non-polar particles in organic solvent, first add an antisolvent until the dispersion becomes turbid.', critical: true },
      { text: 'Remove the supernatant without disturbing the pellet. Check that it is colourless (no particles lost).' },
      { text: 'Redisperse the pellet in clean medium (brief sonication if needed). Do not dry the pellet completely unless the particles are known to redisperse.', critical: true },
      { text: 'Repeat two or three times, then check the size (DLS, UV-vis) to make sure the particles have not aggregated.' }
    ],
    safety: { general: [SDS, 'Balance the rotor, use tubes rated for the speed and solvent, and never open the lid before the rotor stops.', 'Use sealed rotors or buckets for toxic (e.g. cadmium) or volatile samples.'], waste: ['Supernatants contain the unreacted reagents: dispose of them as for the synthesis they came from.'] },
    expected: { colour: 'Same colour as before; a clear (colourless) supernatant after each spin' },
    characterise: [
      { what: 'Centrifugation time and speed (Stokes settling)', calc: 'sediment' },
      { what: 'Check for aggregation by DLS', calc: 'dls' },
      { what: 'Surface charge after washing', calc: 'zeta' }
    ],
    troubleshooting: [
      { problem: 'Pellet does not redisperse', cause: 'Irreversible aggregation (too strong or too long centrifugation, or too much ligand removed).', fix: 'Use milder conditions, leave some ligand in the medium, and avoid drying the pellet.' },
      { problem: 'Coloured supernatant', cause: 'Particles not fully sedimented.', fix: 'Increase the time or speed (recalculate), or collect the supernatant and spin again.' }
    ],
    refs: ['stokes1851', 'sweeney2006']
  });

  NC.protocols = P;
  NC.protocolById = {};
  P.forEach(function (p) {
    if (NC.protocolById[p.id]) throw new Error('Duplicate protocol id: ' + p.id);
    NC.protocolById[p.id] = p;
  });

  /** Every reference a protocol cites, in order of first use (protocol refs, step refs, tuning, atomic weights). */
  NC.protocolRefIds = function (p) {
    const ids = [];
    const add = function (r) { [].concat(r || []).forEach(function (id) { if (NC.refs[id] && ids.indexOf(id) < 0) ids.push(id); }); };
    add(p.refs);
    (p.steps || []).forEach(function (s) { add(s.ref); });
    if (p.tuning) add(p.tuning.ref);
    if ((p.reagents || []).some(function (r) { return r.M; })) add('ciaaw2021');
    return ids;
  };

  /* ------------------------------------------------------------------ */
  /* Markdown export                                                     */
  /* ------------------------------------------------------------------ */
  /** The protocol, scaled to finalVolume, as Markdown. opts: { stockVolumes } as for protocolScale. */
  NC.protocolMarkdown = function (p, finalVolume, opts) {
    const L = [];
    const refIds = NC.protocolRefIds(p);
    const cite = function (r) {
      const list = [].concat(r || []).filter(function (id) { return refIds.indexOf(id) >= 0; });
      return list.length ? ' [' + list.map(function (id) { return refIds.indexOf(id) + 1; }).join(', ') + ']' : '';
    };
    const chk = function (v) { return v ? ' *(check against the original)*' : ''; };
    L.push('# ' + p.title, '', p.summary, '');
    L.push('> **Before lab work:** ' + (p.generalPractice ? 'this is general laboratory practice, not a published protocol. ' : 'this procedure is transcribed from the cited source' + cite(p.refs) + '. Check every quantity against the original paper, ') +
      'and complete a local risk assessment before any lab work. Items marked “check against the original” could not be confirmed by NanoCalc.', '');
    if (p.sizeText) L.push('**What it makes:** ' + p.sizeText + chk(p.sizeVerify), '');
    const sc = p.baseVolume ? NC.protocolScale(p, finalVolume, opts) : null;
    L.push('## Reagents', '');
    if (sc) L.push('Scaled to **' + NC.fmt(sc.finalVolume, 4) + ' ' + sc.baseUnit + '** (' + (p.baseLabel || 'batch') + '; the paper: ' + NC.fmt(p.baseVolume, 4) + ' ' + sc.baseUnit + ', factor ×' + NC.fmt(sc.factor, 4) + ').', '');
    else L.push('Amounts: as in the original paper (this protocol is not given with fixed amounts here).', '');
    L.push('| Reagent | Formula | M (g/mol) | Stock | Amount | Delivers | Stock to prepare |', '|---|---|---|---|---|---|---|');
    (sc ? sc.reagents : NC.protocolScale(p, null).reagents).forEach(function (r) {
      const amt = r.amount === null ? 'as in the original paper' : U.fmtAmount(r.amount, r.amountUnit) + (r.scaled ? '' : ' (not scaled)');
      const del = [r.mmol !== null ? U.fmtMol(r.mmol) : '', r.massG !== null && !(r.amountUnit === 'mg' || r.amountUnit === 'g') ? U.fmtMass(r.massG) : ''].filter(Boolean).join(', ') || '—';
      const stock = r.massToWeighG !== null ? U.fmtMass(r.massToWeighG) + ' in ' + U.fmtVol(r.stockVolumeMl) + (r.solutionMassG !== null ? ' (total ' + U.fmtMass(r.solutionMassG) + ' of solution)' : '') : r.weighDirect ? 'weigh ' + U.fmtMass(r.massG) + ' directly' : '—';
      L.push('| ' + [(r.stage ? r.stage + ': ' : '') + r.name, r.formula || '—', r.M ? NC.fmt(r.M, 5) : '—', U.fmtStock(r.stock), amt + chk(r.verify), del, stock].join(' | ') + ' |');
    });
    if (sc && sc.warnings.length) L.push('', sc.warnings.map(function (w) { return '- ' + w; }).join('\n'));
    L.push('', 'Molar masses from IUPAC 2021 standard atomic weights' + cite('ciaaw2021') + '. Scaling changes heating, mixing and addition rates; results at very different batch sizes can differ from the paper.', '');
    if ((p.equipment || []).length) L.push('## Equipment', '', p.equipment.map(function (e) { return '- ' + e; }).join('\n'), '');
    L.push('## Procedure', '');
    let stage = null;
    (p.steps || []).forEach(function (s, i) {
      if (s.stage && s.stage !== stage) { stage = s.stage; L.push('**' + stage + '**', ''); }
      const tags = [s.temp ? 'T: ' + s.temp : '', s.time ? 't: ' + s.time : ''].filter(Boolean).join('; ');
      L.push((i + 1) + '. ' + (s.critical ? '**Critical:** ' : '') + s.text + (tags ? ' (' + tags + ')' : '') + cite(s.ref) + (s.general ? ' *(general practice)*' : '') + chk(s.verify));
    });
    L.push('', '## Safety', '');
    (p.reagents || []).forEach(function (r) { L.push('- **' + r.name + ':** ' + r.hazard); });
    ((p.safety && p.safety.general) || []).forEach(function (t) { L.push('- ' + t); });
    ((p.safety && p.safety.waste) || []).forEach(function (t) { L.push('- Waste: ' + t); });
    const ex = p.expected || {};
    L.push('', '## Expected result' + chk(ex.verify), '');
    [['Colour', ex.colour], ['Absorption', ex.lambdaMax], ['Size', ex.size], ['Yield', ex.yield]].forEach(function (x) { if (x[1]) L.push('- ' + x[0] + ': ' + x[1]); });
    if (p.tuning) L.push('', '## Tuning the size', '', p.tuning.text + cite(p.tuning.ref) + chk(p.tuning.verify));
    if ((p.characterise || []).length) {
      L.push('', '## Characterisation (NanoCalc calculators)', '');
      p.characterise.forEach(function (c) { L.push('- ' + c.what + ' — ' + (NC.byId && NC.byId[c.calc] ? NC.byId[c.calc].title : c.calc) + ' (#/calc/' + c.calc + ')'); });
    }
    if ((p.troubleshooting || []).length) {
      L.push('', '## Troubleshooting', '', '| Problem | Likely cause | Fix |', '|---|---|---|');
      p.troubleshooting.forEach(function (t) { L.push('| ' + [t.problem, t.cause, t.fix].join(' | ') + ' |'); });
    }
    L.push('', '## References', '');
    refIds.forEach(function (id, i) { L.push((i + 1) + '. ' + NC.formatRefText(NC.refs[id])); });
    L.push('', '*Generated by NanoCalc ' + (NC.version || '') + '. Check against the original sources and your local risk assessment before use.*', '');
    return L.join('\n');
  };
})(typeof window !== 'undefined' ? window : globalThis);
