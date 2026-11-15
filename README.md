# NanoCalc

Step-by-step calculations and characterization analysis for nanomaterials. Each result shows the formula, the substituted values and the intermediate results, and every equation, constant and empirical coefficient is cited to its source.

## Run it

Static app with no build step and nothing to install. It works fully offline: KaTeX (equation typesetting) is bundled in `vendor/katex/` and checked against hashes recorded from the official release.

```bash
node tools/serve.js
```

Then open http://localhost:8080. Opening `index.html` directly also works in most browsers.

## Test it

```bash
node tests/run-tests.js
```

The suite runs every calculator on its example and checks that each cited reference exists. It also compares results against hand-calculated and literature values.

## Calculators (22)

| Area | Calculators |
|---|---|
| Size-dependent properties | **Nanoparticle builder**: pick one of 32 materials (metals, oxides, quantum-dot semiconductors, or custom), one of 12 shapes (sphere, cube, octahedron, tetrahedron, decahedron, icosahedron, cuboctahedron, truncated octahedron, rod, cylinder/wire/disc, spheroid, triangular plate), its size and its structure (solid, core–shell such as Au@SiO₂, or hollow nanoshell/nanocage). It gives geometry, atom counts, surface atoms, specific surface area and concentration · Brus quantum confinement · particle geometry, atom count & surface area · Gibbs–Thomson melting point · carbon nanotube (n, m) structure and RBM |
| Synthesis & dosing | Precursor mass & dilution · nanoparticle number and molar concentration |
| X-ray diffraction | Bragg's law & cubic lattice parameter · Scherrer crystallite size · Williamson–Hall size & strain |
| UV-vis | Tauc band gap (absorbance or Kubelka–Munk) · CdSe/CdTe/CdS QD size & concentration (Yu 2003) · Au NP size & concentration (Haiss 2007) · Beer–Lambert |
| Colloids | DLS hydrodynamic size (Stokes–Einstein) · zeta potential (Smoluchowski / Hückel / Henry–Ohshima) with Debye length |
| Surface area & porosity | Multipoint BET with Rouquerol checks · Kelvin / Harkins–Jura pore size |
| Microscopy | TEM/SEM size distribution statistics, moment diameters, lognormal fit |
| Raman & XPS | Graphene La and L_D / n_D (Cançado) · XPS atomic % from sensitivity factors |
| Thermal | TGA ligand grafting density |

Equations are typeset with KaTeX (LaTeX). Formulas are written in readable Unicode and converted automatically by `js/tex.js`; a step can give hand-written LaTeX through `tex`, `subTex` and `resultTex`. If KaTeX is ever unavailable, formulas fall back to plain text.

Results export as Markdown (with LaTeX math), print to PDF, or download the full bibliography as BibTeX.

## Project layout

```
index.html              entry point
css/styles.css          styles (light/dark tokens)
js/core.js              constants (CODATA 2018), validation, parsing, statistics
js/references.js        bibliography and citation formatting
js/plot.js              dependency-free SVG plots
js/tex.js               Unicode formula → LaTeX converter, KaTeX rendering
js/calculators/*.js     one file per area; each calls NC.register(...)
js/app.js               UI: navigation, forms, steps, citations, export
tests/run-tests.js      Node test suite
tools/serve.js          local static server
```

## Adding a calculator

Call `NC.register({ id, category, title, description, refs, inputs, example, compute })`.

`compute(values)` returns:
- `results`, `steps`, and optionally `tables`, `plots`, `notes` and `warnings`.
- Each step is `{ title, formula, sub, result, ref, note }`, where `ref` is an id from `js/references.js`.

Add the new file to `index.html` and a known-value check to `tests/run-tests.js`.

## Accuracy

Citations are there so every number can be traced to its source. Check results against the original publications before relying on them. Preset material parameters are representative literature values, and many models have stated validity ranges (shown as warnings in the app).
