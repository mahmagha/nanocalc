# Changelog

All notable changes to NanoCalc. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/). It stays below 1.0.0 until the expert review in `docs/REVIEW.md` is complete.

## [0.10.1] - 2026-11-16

### Added
- Number fields only take allowed values. Each field knows its limits (whole number, minimum, maximum), read from the calculator's own checks or set on the input; a bad value is flagged under the field as it is typed (e.g. "Must be a whole number."), and leaving the field snaps a plain number to the nearest allowed value (2.5 layers becomes 3). Whole-number fields show their range, step by 1 with the slider and the ↑/↓ keys, and sliders never go outside the limits.
- Particle designer: the same limits on every number field (browser min/max/step, a message under the field, snapping on leaving), and "+ Add shell" stops at the 12-shell maximum.

## [0.10.0] - 2026-11-16

### Added
- **Particle designer** (`#/design`): a spherical core with any number of shells and a ligand layer, edited with sliders and updated live. Outputs:
  - geometry and composition of every layer (sizes, volumes, masses, atoms, fractions, density, surface area), particle concentration, and a to-scale cross-section;
  - extinction, scattering and absorption spectra by multilayer Mie theory (Yang 2003), the molar extinction coefficient, peak and width;
  - ligands per particle from a grafting density or footprint (alkanethiol SAM 4.67 nm⁻², Love et al. 2005), PEG mushroom or brush regime and thickness (de Gennes 1980, Alexander 1977), ligand amounts for the batch and a hydrodynamic size estimate;
  - a build route from core to shells to ligands to purification, linked to the synthesis protocols, with the stoichiometric precursor amount for each shell;
  - designs saved in the browser and shared by link.
- **Synthesis protocols** (`#/synthesis`): 13 published procedures with reagents scaled to the batch (mass to weigh for every stock, hydrates handled), numbered steps with temperatures and times, safety notes, expected results, characterisation links and troubleshooting; printable and downloadable as Markdown. Values not confirmed from the paper are flagged.
- **Live workspace** on every calculator page: inputs with sliders on the left, results and plots on the right updating while you drag; tables, steps, notes and references in collapsible sections below.
- **Interactive plots**: hover read-out, box and wheel zoom, legend toggles, log axes, "keep curves" for comparison while inputs change, an edit panel for limits and labels, and PNG, SVG and CSV export. Zoom and settings survive recalculation.
- Site organised around three jobs on the home page and in the navigation: Design, Make, Characterise.
- 20 new references, all verified in Crossref.

### Changed
- Single-sphere Mie: the downward recurrence starts further above |mx|, improving agreement with miepython from 1.8 × 10⁻⁸ to 2.5 × 10⁻¹¹.
- `make verify-refs` ignores markup in Crossref titles (e.g. MFe<sub>2</sub>O<sub>4</sub>).



### Added
- **t-plot** calculator (Lippens & de Boer 1965): micropore volume and external surface area, with Harkins–Jura or Halsey thickness curves.
- **BJH pore-size distribution** calculator (Barrett, Joyner & Halenda 1951): full desorption or adsorption branch, film-thinning correction, size-class table, dV/dD and cumulative-volume plots, total volume and area, mode and mean diameter. Warns about cavitation below p/p₀ ≈ 0.42, negative class volumes and micropores.
- **Cross-validation against pyGAPS** 4.6.1 (open-source sorption software): BET, t-plot and every BJH size class agree to ≤ 10⁻⁹.
- Accessibility: skip link, visible keyboard focus everywhere, Escape closes the mobile menu, focus moves into the menu when it opens and the closed menu can no longer be tabbed into, MathML in every equation for screen readers, text descriptions of plots, reduced-motion support.
- `make lint` refuses JavaScript and CSS features newer than the supported browsers (Safari 15.4, Firefox 115, Chrome 100).
- References: Lippens & de Boer 1965, Halsey 1948, pyGAPS (Iacomi & Llewellyn 2019); DOIs for JCGM 100 (the GUM), Lowell et al. 2004, Thomson 1871, Kreibig & Vollmer 1995 and Levenberg 1944, all verified in Crossref.

### Fixed
- The uncertainty help text relied on the CSS `:has()` selector, which Firefox before 121 does not support. Shape-sketch and badge colours using `color-mix()` now have plain fallbacks.
- `make verify-refs` retries failed network requests one at a time instead of recording them as errors.

## [0.8.0] - 2026-11-16

### Added
- **Reference treatise** (`docs/REFERENCE-TREATISE.md`): 217 works on nanomaterials in 15 topics. It covers every work the calculators cite plus 107 curated further-reading works (reviews, books, primary sources, ISO/JCGM/EU standards, data and software). Each entry says what it is good for and how it was verified.
- **Reference library** (`js/library.js`), the single source for the treatise, and a **Further reading** page in the app (filter, topic links, BibTeX download).
- **`tools/verify-refs.js`** (`make verify-refs`): checks every reference against Crossref (DOI resolution, or a strict search matching title, first author, year, type, volume and first page) and Open Library for books. Results are in `docs/references/verification.json`, and `tests/library.test.js` checks them offline.
- `make treatise`; `make check` now also fails if the treatise is out of date.

### Changed
- 28 app citations gained verified DOIs (49 → 77 of 110).
- ISO 22412 (DLS) is now cited in its current 2025 edition (2017 withdrawn). Standards show their official catalogue link.

### Fixed
- The verifier initially accepted loose search matches, e.g. a 1947 article for the 1948 Verwey–Overbeek book. Search matches must now be the same kind of work with matching volume and first page.
- The peak-fit speed tests used absolute time limits, which failed at random on a busy or throttled machine and would differ on CI runners. They now time the fit relative to a fixed calibration workload, plus a deterministic iteration-count check.

## [0.7.1] - 2026-11-16

### Fixed
- After a deploy, returning visitors could load a mix of old and new scripts for up to 10 minutes: the service worker's network fetch used the browser's HTTP cache, and GitHub Pages allows 10 minutes of caching. On the live site this showed as v0.6.0 core files running alongside the v0.7.0 catalog, which lost the breadcrumbs. App files are now revalidated with the server on every request, and the offline cache is renamed so all clients refresh.

## [0.7.0] - 2026-11-16

### Changed
- Site reorganised into four sections (Design & properties, Synthesis & lab, Characterization, Data & reference) with calculators grouped by measurement technique. This replaces 16 flat categories, five of which held a single calculator. Related tools now sit together: DLS with its correlation analysis, SAED/HRTEM/EDX with TEM size statistics.
- The sidebar is now collapsible sections with counts. The current section opens automatically, and the open/closed state is remembered.
- Search also matches technique names and aliases (e.g. "XRD", "zeta", "gold").
- The home page is task-first: a search box, "What do you want to do?" shortcuts, and section cards. It is less than half its former length.

### Added
- A section overview page for each section, with jump links to each technique group.
- Breadcrumbs (Home › Section › Technique), a "More in …" box with previous/next links on every calculator, a top navigation bar and a site footer.
- An About & validation page (validation status, review status, data policy, how to report problems) and a proper not-found page.
- A filter box on the references page.
- `js/catalog.js`, the single source of truth for site structure, checked by `tests/catalog.test.js`.

## [0.6.0] - 2026-11-16

### Added
- Cross-validation against established software: miepython for Mie theory; SciPy for quadrature, Savitzky–Golay, `curve_fit`, `linregress`, Student t and CODATA constants; NumPy for statistics. The 79 checks are described in `docs/VALIDATION.md`.
- Expert review package: `docs/EXPERT-REVIEW-GUIDE.md`, with review priorities and time estimates, and GitHub issue templates for review findings and bugs.
- Engineering:
  - CI on GitHub Actions (lint and `make check` on Node 20 and 22)
  - GitHub Pages deployment
  - `make lint` (syntax, file references, debug leftovers, version consistency) and `make validate-refs`
  - MIT licence, `package.json`, this changelog, a version shown in the app

### Fixed
- 95 % confidence intervals for samples larger than ~120 used t = 1.96 instead of the exact Student t quantile, so they were up to ~0.4 % too narrow. Found by the SciPy cross-check.

## [0.5.0] - 2026-11-16

### Added
- 34 new calculators across carbon and soft nanomaterials, optics (Mie, Gans, PLQY, Urbach), scattering (SAXS, NTA, DLS cumulants), crystal structure (lattice refinement, size–strain plot, RIR, SAED, HRTEM), elemental, magnetic and electrochemical analysis, colloids (DLVO, sedimentation), synthesis (seed growth, nucleation, ripening) and peak fitting.
- Nanoparticle builder: porous and Janus particles, nanostars, rounded polyhedra, size distributions.
- Monte Carlo uncertainty propagation, typed units, shareable links and saved runs, offline/installable app, file upload, expert review sheet, material database with sources, `Makefile`.

### Fixed
- Decahedron volume was half the true value: (5 + √5)/24·a³ instead of (5 + √5)/12·a³.
- Examples with blank optional fields showed "NaN is not a number".
- A degree sign after a superscript failed to typeset.

## [0.4.0] - 2026-11-15

### Added
- Nanoparticle builder: 17 more materials, decahedron, cuboctahedron, truncated octahedron and spheroid shapes, core–shell and hollow structures.

## [0.3.0] - 2026-11-15

### Added
- KaTeX 0.16.11 bundled locally (verified against npm and cdnjs) for offline equation rendering.

## [0.2.0] - 2026-11-15

### Added
- Nanoparticle builder (material, shape and size), and LaTeX typesetting of all equations.

## [0.1.0] - 2026-11-15

### Added
- First release: 21 calculators with step-by-step solutions and inline citations; Markdown, PDF and BibTeX export; test suite.
