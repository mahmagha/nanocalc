/*
 * Bibliography. Every equation, constant and empirical coefficient used by a
 * calculator points to one of these entries by id.
 *
 * DOIs are included only where they are well established; always check
 * results against the original publication before relying on them.
 */
(function (global) {
  'use strict';
  const NC = global.NC;

  const R = {
    /* ---- Constants, units, data ---- */
    codata2018: { type: 'article', authors: 'Tiesinga, E.; Mohr, P. J.; Newell, D. B.; Taylor, B. N.', title: 'CODATA recommended values of the fundamental physical constants: 2018', journal: 'Rev. Mod. Phys.', year: 2021, volume: '93', pages: '025010', doi: '10.1103/RevModPhys.93.025010' },
    iupacGreen: { type: 'book', authors: 'Cohen, E. R.; Cvitaš, T.; Frey, J. G.; et al.', title: 'Quantities, Units and Symbols in Physical Chemistry (IUPAC Green Book)', edition: '3rd ed.', publisher: 'RSC Publishing', place: 'Cambridge', year: 2007 },
    ciaaw2021: { type: 'article', authors: 'Prohaska, T.; Irrgeher, J.; Benefield, J.; et al.', title: 'Standard atomic weights of the elements 2021 (IUPAC Technical Report)', journal: 'Pure Appl. Chem.', year: 2022, volume: '94', pages: '573–600', doi: '10.1515/pac-2019-0603' },
    crc: { type: 'book', authors: 'Rumble, J. R., Ed.', title: 'CRC Handbook of Chemistry and Physics', edition: '103rd ed.', publisher: 'CRC Press', place: 'Boca Raton, FL', year: 2022 },
    kittel2005: { type: 'book', authors: 'Kittel, C.', title: 'Introduction to Solid State Physics', edition: '8th ed.', publisher: 'Wiley', place: 'Hoboken, NJ', year: 2005 },
    madelung2004: { doi: '10.1007/978-3-642-18865-7', type: 'book', authors: 'Madelung, O.', title: 'Semiconductors: Data Handbook', edition: '3rd ed.', publisher: 'Springer', place: 'Berlin', year: 2004 },

    /* ---- Size effects ---- */
    brus1984: { type: 'article', authors: 'Brus, L. E.', title: 'Electron–electron and electron–hole interactions in small semiconductor crystallites: The size dependence of the lowest excited electronic state', journal: 'J. Chem. Phys.', year: 1984, volume: '80', pages: '4403–4409', doi: '10.1063/1.447218' },
    roduner2006: { type: 'article', authors: 'Roduner, E.', title: 'Size matters: why nanomaterials are different', journal: 'Chem. Soc. Rev.', year: 2006, volume: '35', pages: '583–592', doi: '10.1039/b502142c' },
    pawlow1909: { doi: '10.1515/zpch-1909-6502', type: 'article', authors: 'Pawlow, P.', title: 'Über die Abhängigkeit des Schmelzpunktes von der Oberflächenenergie eines festen Körpers', journal: 'Z. Phys. Chem.', year: 1909, volume: '65', pages: '1–35' },
    buffat1976: { type: 'article', authors: 'Buffat, Ph.; Borel, J.-P.', title: 'Size effect on the melting temperature of gold particles', journal: 'Phys. Rev. A', year: 1976, volume: '13', pages: '2287–2298', doi: '10.1103/PhysRevA.13.2287' },
    xia2009: { type: 'article', authors: 'Xia, Y.; Xiong, Y.; Lim, B.; Skrabalak, S. E.', title: 'Shape-controlled synthesis of metal nanocrystals: simple chemistry meets complex physics?', journal: 'Angew. Chem. Int. Ed.', year: 2009, volume: '48', pages: '60–103', doi: '10.1002/anie.200802248' },
    marks2016: { type: 'article', authors: 'Marks, L. D.; Peng, L.', title: 'Nanoparticle shape, thermodynamics and kinetics', journal: 'J. Phys.: Condens. Matter', year: 2016, volume: '28', pages: '053001', doi: '10.1088/0953-8984/28/5/053001' },
    chaudhuri2012: { type: 'article', authors: 'Ghosh Chaudhuri, R.; Paria, S.', title: 'Core/shell nanoparticles: classes, properties, synthesis mechanisms, characterization, and applications', journal: 'Chem. Rev.', year: 2012, volume: '112', pages: '2373–2433', doi: '10.1021/cr100449n' },
    skrabalak2008: { type: 'article', authors: 'Skrabalak, S. E.; Chen, J.; Sun, Y.; Lu, X.; Au, L.; Cobley, C. M.; Xia, Y.', title: 'Gold nanocages: synthesis, properties, and applications', journal: 'Acc. Chem. Res.', year: 2008, volume: '41', pages: '1587–1595', doi: '10.1021/ar800018v' },
    coxeter1973: { type: 'book', authors: 'Coxeter, H. S. M.', title: 'Regular Polytopes', edition: '3rd ed.', publisher: 'Dover', place: 'New York', year: 1973 },
    wadell1935: { type: 'article', authors: 'Wadell, H.', title: 'Volume, shape, and roundness of quartz particles', journal: 'J. Geol.', year: 1935, volume: '43', pages: '250–280', doi: '10.1086/624298' },
    saito1998: { doi: '10.1142/p080', type: 'book', authors: 'Saito, R.; Dresselhaus, G.; Dresselhaus, M. S.', title: 'Physical Properties of Carbon Nanotubes', publisher: 'Imperial College Press', place: 'London', year: 1998 },
    jorio2001: { type: 'article', authors: 'Jorio, A.; Saito, R.; Hafner, J. H.; Lieber, C. M.; Hunter, M.; McClure, T.; Dresselhaus, G.; Dresselhaus, M. S.', title: 'Structural (n, m) determination of isolated single-wall carbon nanotubes by resonant Raman scattering', journal: 'Phys. Rev. Lett.', year: 2001, volume: '86', pages: '1118–1121', doi: '10.1103/PhysRevLett.86.1118' },

    /* ---- Lab ---- */
    swinehart1962: { type: 'article', authors: 'Swinehart, D. F.', title: 'The Beer–Lambert law', journal: 'J. Chem. Educ.', year: 1962, volume: '39', pages: '333', doi: '10.1021/ed039p333' },

    /* ---- XRD ---- */
    bragg1913: { type: 'article', authors: 'Bragg, W. H.; Bragg, W. L.', title: 'The reflection of X-rays by crystals', journal: 'Proc. R. Soc. Lond. A', year: 1913, volume: '88', pages: '428–438', doi: '10.1098/rspa.1913.0040' },
    holzer1997: { type: 'article', authors: 'Hölzer, G.; Fritsch, M.; Deutsch, M.; Härtwig, J.; Förster, E.', title: 'Kα1,2 and Kβ1,3 x-ray emission lines of the 3d transition metals', journal: 'Phys. Rev. A', year: 1997, volume: '56', pages: '4554–4568', doi: '10.1103/PhysRevA.56.4554' },
    itcC2004: { type: 'book', authors: 'Prince, E., Ed.', title: 'International Tables for Crystallography, Vol. C: Mathematical, Physical and Chemical Tables', edition: '3rd ed.', publisher: 'Kluwer / IUCr', place: 'Dordrecht', year: 2004 },
    cullity2001: { type: 'book', authors: 'Cullity, B. D.; Stock, S. R.', title: 'Elements of X-Ray Diffraction', edition: '3rd ed.', publisher: 'Prentice Hall', place: 'Upper Saddle River, NJ', year: 2001 },
    scherrer1918: { type: 'article', authors: 'Scherrer, P.', title: 'Bestimmung der Größe und der inneren Struktur von Kolloidteilchen mittels Röntgenstrahlen', journal: 'Nachr. Ges. Wiss. Göttingen, Math.-Phys. Kl.', year: 1918, pages: '98–100' },
    patterson1939: { type: 'article', authors: 'Patterson, A. L.', title: 'The Scherrer formula for X-ray particle size determination', journal: 'Phys. Rev.', year: 1939, volume: '56', pages: '978–982', doi: '10.1103/PhysRev.56.978' },
    langford1978: { type: 'article', authors: 'Langford, J. I.; Wilson, A. J. C.', title: 'Scherrer after sixty years: A survey and some new results in the determination of crystallite size', journal: 'J. Appl. Crystallogr.', year: 1978, volume: '11', pages: '102–113', doi: '10.1107/S0021889878012844' },
    holder2019: { type: 'article', authors: 'Holder, C. F.; Schaak, R. E.', title: 'Tutorial on powder X-ray diffraction for characterizing nanoscale materials', journal: 'ACS Nano', year: 2019, volume: '13', pages: '7359–7365', doi: '10.1021/acsnano.9b05157' },
    williamson1953: { type: 'article', authors: 'Williamson, G. K.; Hall, W. H.', title: 'X-ray line broadening from filed aluminium and wolfram', journal: 'Acta Metall.', year: 1953, volume: '1', pages: '22–31', doi: '10.1016/0001-6160(53)90006-6' },

    /* ---- UV-vis ---- */
    tauc1966: { type: 'article', authors: 'Tauc, J.; Grigorovici, R.; Vancu, A.', title: 'Optical properties and electronic structure of amorphous germanium', journal: 'Phys. Status Solidi B', year: 1966, volume: '15', pages: '627–637', doi: '10.1002/pssb.19660150224' },
    kubelka1931: { type: 'article', authors: 'Kubelka, P.; Munk, F.', title: 'Ein Beitrag zur Optik der Farbanstriche', journal: 'Z. Tech. Phys.', year: 1931, volume: '12', pages: '593–601' },
    makula2018: { type: 'article', authors: 'Makuła, P.; Pacia, M.; Macyk, W.', title: 'How to correctly determine the band gap energy of modified semiconductor photocatalysts based on UV–Vis spectra', journal: 'J. Phys. Chem. Lett.', year: 2018, volume: '9', pages: '6814–6817', doi: '10.1021/acs.jpclett.8b02892' },
    yu2003: { type: 'article', authors: 'Yu, W. W.; Qu, L.; Guo, W.; Peng, X.', title: 'Experimental determination of the extinction coefficient of CdTe, CdSe, and CdS nanocrystals', journal: 'Chem. Mater.', year: 2003, volume: '15', pages: '2854–2860', doi: '10.1021/cm034081k' },
    jasieniak2009: { doi: '10.1021/jp906827m', type: 'article', authors: 'Jasieniak, J.; Smith, L.; van Embden, J.; Mulvaney, P.; Califano, M.', title: 'Re-examination of the size-dependent absorption properties of CdSe quantum dots', journal: 'J. Phys. Chem. C', year: 2009, volume: '113', pages: '19468–19474' },
    haiss2007: { type: 'article', authors: 'Haiss, W.; Thanh, N. T. K.; Aveyard, J.; Fernig, D. G.', title: 'Determination of size and concentration of gold nanoparticles from UV−Vis spectra', journal: 'Anal. Chem.', year: 2007, volume: '79', pages: '4215–4221', doi: '10.1021/ac0702084' },

    /* ---- Colloids ---- */
    einstein1905: { type: 'article', authors: 'Einstein, A.', title: 'Über die von der molekularkinetischen Theorie der Wärme geforderte Bewegung von in ruhenden Flüssigkeiten suspendierten Teilchen', journal: 'Ann. Phys.', year: 1905, volume: '322', pages: '549–560', doi: '10.1002/andp.19053220806' },
    berne1976: { type: 'book', authors: 'Berne, B. J.; Pecora, R.', title: 'Dynamic Light Scattering: With Applications to Chemistry, Biology, and Physics', publisher: 'Wiley', place: 'New York', year: 1976, note: 'Dover reprint 2000' },
    iso22412: { type: 'standard', authors: 'ISO', title: 'ISO 22412:2025 Particle size analysis — Dynamic light scattering (DLS)', publisher: 'International Organization for Standardization', place: 'Geneva', year: 2025, url: 'https://www.iso.org/standard/85505.html', note: 'Replaces ISO 22412:2017 (withdrawn)' },
    huber2009: { type: 'article', authors: 'Huber, M. L.; Perkins, R. A.; Laesecke, A.; Friend, D. G.; Sengers, J. V.; Assael, M. J.; Metaxa, I. N.; Vogel, E.; Mareš, R.; Miyagawa, K.', title: 'New international formulation for the viscosity of H2O', journal: 'J. Phys. Chem. Ref. Data', year: 2009, volume: '38', pages: '101–125', doi: '10.1063/1.3088050' },
    malmberg1956: { type: 'article', authors: 'Malmberg, C. G.; Maryott, A. A.', title: 'Dielectric constant of water from 0° to 100 °C', journal: 'J. Res. Natl. Bur. Stand.', year: 1956, volume: '56', pages: '1–8', doi: '10.6028/jres.056.001' },
    delgado2005: { type: 'article', authors: 'Delgado, A. V.; González-Caballero, F.; Hunter, R. J.; Koopal, L. K.; Lyklema, J.', title: 'Measurement and interpretation of electrokinetic phenomena (IUPAC Technical Report)', journal: 'Pure Appl. Chem.', year: 2005, volume: '77', pages: '1753–1805', doi: '10.1351/pac200577101753' },
    ohshima1994: { doi: '10.1006/jcis.1994.1419', type: 'article', authors: 'Ohshima, H.', title: "A simple expression for Henry's function for the retardation effect in electrophoresis of spherical colloidal particles", journal: 'J. Colloid Interface Sci.', year: 1994, volume: '168', pages: '269–271' },
    hunter1981: { type: 'book', authors: 'Hunter, R. J.', title: 'Zeta Potential in Colloid Science: Principles and Applications', publisher: 'Academic Press', place: 'London', year: 1981 },
    israelachvili2011: { type: 'book', authors: 'Israelachvili, J. N.', title: 'Intermolecular and Surface Forces', edition: '3rd ed.', publisher: 'Academic Press', place: 'Burlington, MA', year: 2011 },

    /* ---- Surface area & porosity ---- */
    bet1938: { type: 'article', authors: 'Brunauer, S.; Emmett, P. H.; Teller, E.', title: 'Adsorption of gases in multimolecular layers', journal: 'J. Am. Chem. Soc.', year: 1938, volume: '60', pages: '309–319', doi: '10.1021/ja01269a023' },
    thommes2015: { type: 'article', authors: 'Thommes, M.; Kaneko, K.; Neimark, A. V.; Olivier, J. P.; Rodriguez-Reinoso, F.; Rouquerol, J.; Sing, K. S. W.', title: 'Physisorption of gases, with special reference to the evaluation of surface area and pore size distribution (IUPAC Technical Report)', journal: 'Pure Appl. Chem.', year: 2015, volume: '87', pages: '1051–1069', doi: '10.1515/pac-2014-1117' },
    rouquerol2007: { type: 'article', authors: 'Rouquerol, J.; Llewellyn, P.; Rouquerol, F.', title: 'Is the BET equation applicable to microporous adsorbents?', journal: 'Stud. Surf. Sci. Catal.', year: 2007, volume: '160', pages: '49–56' },
    lowell2004: { doi: '10.1007/978-1-4020-2303-3', type: 'book', authors: 'Lowell, S.; Shields, J. E.; Thomas, M. A.; Thommes, M.', title: 'Characterization of Porous Solids and Powders: Surface Area, Pore Size and Density', publisher: 'Springer', place: 'Dordrecht', year: 2004 },
    thomson1871: { doi: '10.1080/14786447108640606', type: 'article', authors: 'Thomson, W.', title: 'On the equilibrium of vapour at a curved surface of liquid', journal: 'Philos. Mag.', year: 1871, volume: '42', pages: '448–452' },
    bjh1951: { type: 'article', authors: 'Barrett, E. P.; Joyner, L. G.; Halenda, P. P.', title: 'The determination of pore volume and area distributions in porous substances. I. Computations from nitrogen isotherms', journal: 'J. Am. Chem. Soc.', year: 1951, volume: '73', pages: '373–380', doi: '10.1021/ja01145a126' },
    harkins1944: { doi: '10.1021/ja01236a048', type: 'article', authors: 'Harkins, W. D.; Jura, G.', title: 'Surfaces of solids. XIII. A vapor adsorption method for the determination of the area of a solid without the assumption of a molecular area, and the areas occupied by nitrogen and other molecules on the surface of a solid', journal: 'J. Am. Chem. Soc.', year: 1944, volume: '66', pages: '1366–1373' },

    /* ---- Microscopy / statistics ---- */
    iso9276: { type: 'standard', authors: 'ISO', title: 'ISO 9276-2:2014 Representation of results of particle size analysis — Part 2: Calculation of average particle sizes/diameters and moments from particle size distributions', publisher: 'International Organization for Standardization', place: 'Geneva', year: 2014, url: 'https://www.iso.org/standard/57641.html' },
    rice2013: { type: 'article', authors: 'Rice, S. B.; Chan, C.; Brown, S. C.; et al.', title: 'Particle size distributions by transmission electron microscopy: an interlaboratory comparison case study', journal: 'Metrologia', year: 2013, volume: '50', pages: '663–678', doi: '10.1088/0026-1394/50/6/663' },
    schneider2012: { type: 'article', authors: 'Schneider, C. A.; Rasband, W. S.; Eliceiri, K. W.', title: 'NIH Image to ImageJ: 25 years of image analysis', journal: 'Nat. Methods', year: 2012, volume: '9', pages: '671–675', doi: '10.1038/nmeth.2089' },
    freedman1981: { type: 'article', authors: 'Freedman, D.; Diaconis, P.', title: 'On the histogram as a density estimator: L2 theory', journal: 'Z. Wahrscheinlichkeitstheorie verw. Gebiete', year: 1981, volume: '57', pages: '453–476', doi: '10.1007/BF01025868' },
    limpert2001: { doi: '10.1641/0006-3568(2001)051[0341:lndats]2.0.co;2', type: 'article', authors: 'Limpert, E.; Stahel, W. A.; Abbt, M.', title: 'Log-normal distributions across the sciences: keys and clues', journal: 'BioScience', year: 2001, volume: '51', pages: '341–352' },

    /* ---- Raman / XPS ---- */
    cancado2006: { type: 'article', authors: 'Cançado, L. G.; Takai, K.; Enoki, T.; Endo, M.; Kim, Y. A.; Mizusaki, H.; Jorio, A.; Coelho, L. N.; Magalhães-Paniago, R.; Pimenta, M. A.', title: 'General equation for the determination of the crystallite size La of nanographite by Raman spectroscopy', journal: 'Appl. Phys. Lett.', year: 2006, volume: '88', pages: '163106', doi: '10.1063/1.2196057' },
    cancado2011: { type: 'article', authors: 'Cançado, L. G.; Jorio, A.; Martins Ferreira, E. H.; Stavale, F.; Achete, C. A.; Capaz, R. B.; Moutinho, M. V. O.; Lombardo, A.; Kulmala, T. S.; Ferrari, A. C.', title: 'Quantifying defects in graphene via Raman spectroscopy at different excitation energies', journal: 'Nano Lett.', year: 2011, volume: '11', pages: '3190–3196', doi: '10.1021/nl201432g' },
    wagner1981: { type: 'article', authors: 'Wagner, C. D.; Davis, L. E.; Zeller, M. V.; Taylor, J. A.; Raymond, R. H.; Gale, L. H.', title: 'Empirical atomic sensitivity factors for quantitative analysis by electron spectroscopy for chemical analysis', journal: 'Surf. Interface Anal.', year: 1981, volume: '3', pages: '211–225', doi: '10.1002/sia.740030506' },

    /* ---- Thermal ---- */
    mansfield2014: { doi: '10.1021/ac402888v', type: 'article', authors: 'Mansfield, E.; Tyner, K. M.; Poling, C. M.; Blacklock, J. L.', title: 'Determination of nanoparticle surface coatings and nanoparticle purity using microscale thermogravimetric analysis', journal: 'Anal. Chem.', year: 2014, volume: '86', pages: '1478–1484' }
  };

  Object.keys(R).forEach(function (k) { R[k].id = k; });
  NC.refs = R;

  /**
   * Add references from a calculator file: NC.addRefs({ id: {type, authors, title, ...} }).
   * Throws on a duplicate id with different content, so two files cannot silently disagree.
   */
  NC.addRefs = function (obj) {
    Object.keys(obj).forEach(function (k) {
      const r = obj[k];
      if (R[k] && JSON.stringify(Object.assign({}, R[k], { id: undefined })) !== JSON.stringify(Object.assign({}, r, { id: undefined }))) {
        throw new Error('Reference id "' + k + '" already exists with different content.');
      }
      r.id = k;
      R[k] = r;
    });
  };

  const esc = function (s) { return NC.esc(s); };

  /** HTML citation (ACS-like). */
  NC.formatRef = function (r) {
    if (!r) return '<em>Unknown reference</em>';
    let s = esc(r.authors) + ' ';
    if (r.type === 'article') {
      s += esc(r.title) + '. <i>' + esc(r.journal) + '</i> <b>' + r.year + '</b>';
      if (r.volume) s += ', <i>' + esc(r.volume) + '</i>';
      if (r.pages) s += ', ' + esc(r.pages);
      s += '.';
    } else {
      s += '<i>' + esc(r.title) + '</i>';
      if (r.edition) s += ', ' + esc(r.edition);
      s += '; ' + esc(r.publisher) + (r.place ? ': ' + esc(r.place) : '') + ', ' + r.year + '.';
      if (r.note) s += ' ' + esc(r.note) + '.';
    }
    if (r.doi) s += ' <a href="https://doi.org/' + esc(r.doi) + '" target="_blank" rel="noopener">doi:' + esc(r.doi) + '</a>';
    else if (r.url) s += ' <a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.url.replace(/^https?:\/\//, '').replace(/\/$/, '')) + '</a>';
    return s;
  };

  /** Plain-text citation (for Markdown reports). */
  NC.formatRefText = function (r) {
    let s = r.authors + ' ';
    if (r.type === 'article') {
      s += r.title + '. *' + r.journal + '* **' + r.year + '**' + (r.volume ? ', *' + r.volume + '*' : '') + (r.pages ? ', ' + r.pages : '') + '.';
    } else {
      s += '*' + r.title + '*' + (r.edition ? ', ' + r.edition : '') + '; ' + r.publisher + (r.place ? ': ' + r.place : '') + ', ' + r.year + '.' + (r.note ? ' ' + r.note + '.' : '');
    }
    if (r.doi) s += ' https://doi.org/' + r.doi;
    else if (r.url) s += ' ' + r.url;
    return s;
  };

  NC.toBibTeX = function (r) {
    const kind = r.type === 'article' ? 'article' : r.type === 'standard' ? 'misc' : 'book';
    const f = [];
    const add = function (k, v) { if (v !== undefined && v !== '') f.push('  ' + k + ' = {' + v + '}'); };
    add('author', r.authors.replace(/; /g, ' and ').replace(/;$/, ''));
    add('title', r.title);
    if (kind === 'article') {
      add('journal', r.journal);
      add('volume', r.volume);
      add('pages', r.pages && r.pages.replace('–', '--'));
    } else {
      add('publisher', r.publisher);
      add('address', r.place);
      add('edition', r.edition);
    }
    add('year', r.year);
    add('doi', r.doi);
    add('note', r.note);
    return '@' + kind + '{' + r.id + ',\n' + f.join(',\n') + '\n}';
  };
})(typeof window !== 'undefined' ? window : globalThis);
