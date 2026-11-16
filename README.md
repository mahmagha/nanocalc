# NanoCalc

[![CI](https://github.com/mahmagha/nanocalc/actions/workflows/ci.yml/badge.svg)](https://github.com/mahmagha/nanocalc/actions/workflows/ci.yml) [![Pages](https://github.com/mahmagha/nanocalc/actions/workflows/pages.yml/badge.svg)](https://mahmagha.github.io/nanocalc/)

**Live app: https://mahmagha.github.io/nanocalc/** (works offline once loaded, and can be installed as an app)

Step-by-step calculations and characterization analysis for nanomaterials. Each result shows the formula, the substituted values and the intermediate results, and every equation, constant and empirical coefficient is cited to its source (110 references).

## Quick start (make)

| Command | Does |
|---|---|
| `make` | list the targets |
| `make serve` | run the app at http://localhost:8080 (`make serve PORT=9000` to change the port) |
| `make test` | run the full test suite |
| `make review` | regenerate `docs/REVIEW.md` |
| `make lint` | syntax, file references, debug leftovers, version consistency |
| `make check` | lint, run the tests, then fail if `docs/REVIEW.md` is out of date (CI runs this) |
| `make verify-refs` | verify every reference against Crossref / Open Library (needs network) |
| `make treatise` | rebuild `docs/REFERENCE-TREATISE.md` |
| `make validate-refs` | regenerate the SciPy/miepython/pyGAPS reference values (needs the Python packages in `tests/validation/requirements.txt`) |

Each target is a thin wrapper around the `node` commands below, so you can run those directly if `make` isn't installed.

## Run it

Static app with no build step and nothing to install. It works fully offline: KaTeX (equation typesetting) is bundled in `vendor/katex/` and checked against hashes recorded from the official release.

```bash
node tools/serve.js
```

Then open http://localhost:8080. When served over http(s), the app can be installed as a desktop or phone app (PWA) and keeps working offline. Opening `index.html` directly also works in most browsers.

**Browsers.** NanoCalc targets browsers from the last three years: Safari/iOS 15.4+, Firefox 115+, Chrome/Edge 100+. `make lint` refuses JavaScript and CSS features newer than that. It is tested in Chromium (desktop and phone widths); Firefox and Safari have not been tested by hand yet.

**Accessibility.** Keyboard-only use is supported (skip link, visible focus, Escape closes the menu); equations carry MathML for screen readers, plots have text descriptions, and results are announced when they change. Text and plot contrast meet WCAG 2.2 AA in light and dark themes, and reduced-motion settings are respected. It has not yet been tested with real screen-reader users.

## Test it

```bash
node tests/run-tests.js
```

The suite (about 2,700 checks):
- runs every calculator on its example;
- typesets every formula with the bundled KaTeX;
- checks that every cited reference exists and every script is registered;
- compares results with values worked out by hand, from textbooks, or from synthetic data with known answers (`tests/*.test.js`, one file per area).

## Calculators (58)

| Area | Calculators |
|---|---|
| Size-dependent properties | **Nanoparticle builder:** 32 materials, 13 shapes (incl. decahedron, cuboctahedron, truncated octahedron, spheroid, nanostar), rounded edges, size distributions, and solid, core–shell, hollow, porous or Janus structures · Brus quantum confinement · particle geometry · Gibbs–Thomson melting · CNT (n, m) structure |
| Synthesis & dosing | Precursor mass & dilution · particle number concentration · seed-mediated growth · yield & conversion · classical nucleation · Ostwald ripening (LSW) · material database with sources |
| Carbon nanomaterials | Graphene · SWCNT/MWCNT mass and atoms per length · fullerenes · carbon dots |
| Soft nanomaterials | Liposomes (lipids per vesicle, lamellarity, trapped volume) · lipid nanoparticle N/P ratio · polymer nanoparticles and micelles |
| Diffraction & crystal structure | Bragg & lattice parameter · least-squares lattice parameters (cubic, tetragonal, hexagonal, orthorhombic) · Scherrer · Williamson–Hall · size–strain plot · RIR phase quantification · SAED ring indexing · HRTEM fringe analysis |
| Optical spectroscopy | Tauc band gap · Urbach energy · QD sizing (Yu 2003) · Au sizing (Haiss 2007) · Mie theory · Gans (nanorods) · Ag/Au size from the plasmon peak · relative PL quantum yield · Beer–Lambert |
| Colloids | DLS (Stokes–Einstein) · zeta potential with Debye length · DLVO interaction energy · sedimentation & centrifugation |
| Scattering | SAXS Guinier · SAXS Porod · nanoparticle tracking (NTA) · DLS cumulant analysis |
| Surface area & porosity | Multipoint BET with Rouquerol checks · t-plot (micropore volume, external area) · BJH pore-size distribution · Kelvin / Harkins–Jura pore size |
| Electron microscopy | Size-distribution statistics, moment diameters, lognormal fit |
| Raman & XPS | Graphene L_a and L_D / n_D · XPS atomic % |
| Elemental analysis | ICP-MS/OES → particle number · single-particle ICP-MS · EDX (Cliff–Lorimer) |
| Magnetism | Saturation magnetization, dead layer, blocking temperature, superparamagnetic size |
| Electrochemistry & catalysis | Pt ECSA (H-UPD / CO stripping), dispersion, turnover frequency |
| Thermal analysis | TGA ligand grafting density |
| Spectrum & peak analysis | Import raw data · Savitzky–Golay smoothing · linear, polynomial or Shirley baseline · Levenberg–Marquardt peak fitting · output ready to paste into Scherrer, W–H or XPS |

## Working with results

- **Uncertainty:** give any input a ± standard uncertainty. Monte Carlo propagation (JCGM 101) shows each result as value ± u with a 95 % interval.
- **Units:** type a value with its unit, e.g. `5 Å`, `0.2 µm` or `25 °C`, and it is converted to the field's unit.
- **Saved work:** shareable links that carry the inputs; named saved runs; recent history on the home page.
- **Data import:** every data box takes an uploaded file or drag-and-drop (.csv, .txt, .xy, .dat).
- **Export:** a Markdown report with LaTeX maths, print to PDF, or the bibliography as BibTeX.
- **Equations:** typeset with KaTeX. Formulas are written in readable Unicode and converted by `js/tex.js`; a step can give hand-written LaTeX through `tex`, `subTex` and `resultTex`.

## Validation

The numerical cores (Mie theory, depolarization factors, spheroid areas, Savitzky–Golay, least squares, peak fitting, size statistics, Student t, constants) are cross-checked against **miepython, SciPy and NumPy**, and the BET, t-plot and BJH analyses against **pyGAPS**, on every test run. Agreement is to 10⁻⁶ or better. See [docs/VALIDATION.md](docs/VALIDATION.md) for the method, the results and what is not yet validated.

## References

[docs/REFERENCE-TREATISE.md](docs/REFERENCE-TREATISE.md) is a curated, annotated bibliography for nanomaterials: 220 works in 15 topics, including every work the calculators cite. Every article and book is verified against Crossref or Open Library (`make verify-refs`), and every standard against its issuing body. The same library appears in the app as **Further reading**.

## Expert review

`node tools/review-sheet.js` regenerates [docs/REVIEW.md](docs/REVIEW.md): a sign-off checklist (about 1,100 items) of every formula, default value, preset, constant and reference, for a domain expert to verify. The formulas are tested and cross-validated, but they have not yet been reviewed by an expert. [docs/EXPERT-REVIEW-GUIDE.md](docs/EXPERT-REVIEW-GUIDE.md) says where to start; report findings with the *Scientific review finding* issue template.

## Project layout

```
index.html                 entry point (registers every script; tests enforce this)
css/styles.css             styles (light/dark tokens)
js/core.js                 constants (CODATA 2018), validation, parsing, statistics, material data
js/references.js           bibliography, citation formatting, NC.addRefs for module citations
js/plot.js                 dependency-free SVG plots
js/tex.js                  Unicode formula → LaTeX converter, KaTeX rendering
js/units.js                typed-unit parsing and conversion
js/uncertainty.js          Monte Carlo uncertainty propagation
js/calculators/*.js        one file per area; each calls NC.register(...)
js/catalog.js              site structure: sections → technique groups → calculator order
js/library.js              curated reference library (source of docs/REFERENCE-TREATISE.md)
js/app.js                  UI: navigation, forms, steps, citations, export, saved work
sw.js, manifest.webmanifest   offline / installable app
tests/run-tests.js         test runner (+ tests/*.test.js modules)
tools/serve.js             local static server
tools/review-sheet.js      generates docs/REVIEW.md
tools/verify-refs.js       verifies references against Crossref / Open Library
tools/build-treatise.js    generates docs/REFERENCE-TREATISE.md
vendor/katex/              bundled KaTeX 0.16.11 (verified, MIT)
```

## Adding a calculator

1. Call `NC.register({ id, category, title, description, refs, inputs, example, compute })` in a file under `js/calculators/`. Add any new citations with `NC.addRefs({...})`.
2. `compute(values)` returns `results` and `steps`, and optionally `tables`, `plots`, `figures`, `notes` and `warnings`.
3. Each step is `{ title, formula, sub, result, ref, note }`, optionally with `tex`, `subTex` and `resultTex`.
4. Register the file in `index.html` (before `js/catalog.js`), place the calculator in a group in `js/catalog.js`, and add known-value checks in `tests/<area>.test.js`.

## Accuracy

Citations are there so every number can be traced to its source. Check results against the original publications before relying on them. Preset material parameters are representative literature values (see the Material database page), and many models have stated validity ranges, shown as warnings in the app. No tabulated literature data (such as optical constants or sensitivity factors) is built in without a verifiable source; users supply those values.

## Licence

MIT, see [LICENSE](LICENSE). The bundled KaTeX is also MIT-licensed. The changelog is in [CHANGELOG.md](CHANGELOG.md).
