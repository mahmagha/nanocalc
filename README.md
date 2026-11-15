# NanoCalc

Step-by-step calculations and characterization analysis for nanomaterials. Each result shows the formula, the substituted values and the intermediate results, and every equation, constant and empirical coefficient is cited to its source (110 references).

## Run it

Static app with no build step and nothing to install. It works fully offline: KaTeX (equation typesetting) is bundled in `vendor/katex/` and checked against hashes recorded from the official release.

```bash
node tools/serve.js
```

Then open http://localhost:8080. When served over http(s), the app can be installed as a desktop or phone app (PWA) and keeps working offline. Opening `index.html` directly also works in most browsers.

## Test it

```bash
node tests/run-tests.js
```

The suite (about 2,700 checks):
- runs every calculator on its example;
- typesets every formula with the bundled KaTeX;
- checks that every cited reference exists and every script is registered;
- compares results with values worked out by hand, from textbooks, or from synthetic data with known answers (`tests/*.test.js`, one file per area).

## Calculators (56)

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
| Surface area & porosity | Multipoint BET with Rouquerol checks · Kelvin / Harkins–Jura pore size |
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

## Expert review

`node tools/review-sheet.js` regenerates [docs/REVIEW.md](docs/REVIEW.md): a sign-off checklist (about 1,100 items) of every formula, default value, preset, constant and reference, for a domain expert to verify. The formulas are tested, but they have not yet been reviewed by an expert.

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
js/app.js                  UI: navigation, forms, steps, citations, export, saved work
sw.js, manifest.webmanifest   offline / installable app
tests/run-tests.js         test runner (+ tests/*.test.js modules)
tools/serve.js             local static server
tools/review-sheet.js      generates docs/REVIEW.md
vendor/katex/              bundled KaTeX 0.16.11 (verified, MIT)
```

## Adding a calculator

1. Call `NC.register({ id, category, title, description, refs, inputs, example, compute })` in a file under `js/calculators/`. Add any new citations with `NC.addRefs({...})`.
2. `compute(values)` returns `results` and `steps`, and optionally `tables`, `plots`, `figures`, `notes` and `warnings`.
3. Each step is `{ title, formula, sub, result, ref, note }`, optionally with `tex`, `subTex` and `resultTex`.
4. Register the file in `index.html` and add known-value checks in `tests/<area>.test.js`.

## Accuracy

Citations are there so every number can be traced to its source. Check results against the original publications before relying on them. Preset material parameters are representative literature values (see the Material database page), and many models have stated validity ranges, shown as warnings in the app. No tabulated literature data (such as optical constants or sensitivity factors) is built in without a verifiable source; users supply those values.
