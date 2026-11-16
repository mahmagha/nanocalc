# Changelog

All notable changes to NanoCalc. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/). It stays below 1.0.0 until the expert review in `docs/REVIEW.md` is complete.

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
