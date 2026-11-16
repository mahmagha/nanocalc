# Plan: broader nanoparticle coverage

**Goal.** Extend the nanoparticle builder (`js/calculators/nanoparticle.js`) to more materials, more shapes, and particles that are not one solid piece (core–shell and hollow). Every new result must still show its steps and cite its sources.

**Status:** all phases done (2026-11-15). ☐ not started · ☑ done

---

## Phase 1: Material presets

Add bulk densities (CRC Handbook) and molar masses (IUPAC 2021 standard atomic weights) for materials people often have to type in by hand today.

- ☑ Quantum dot / semiconductor materials: CdS, CdTe, PbS, PbSe, ZnS (sphalerite), InP, Si
- ☑ Oxides: α-Fe₂O₃ (hematite), α-Al₂O₃, ZrO₂ (monoclinic), Co₃O₄, NiO, CuO
- ☑ Metals: Co, Al, Rh, Ir
- ☑ Group the material list by class (metals / oxides / semiconductors) so it stays easy to scan

## Phase 2: New solid shapes

Each shape needs its volume and area, the inward offset used for surface atoms, LaTeX formulas and a schematic.

- ☑ **Decahedron** (regular pentagonal bipyramid, the idealised Ino/Marks decahedron of Ag, Au, Pd)
  - V = (5 + √5)/12 · a³ (corrected from /24 during Plan 2: two pentagonal pyramids), A = (5√3/2) · a²
  - All faces are equivalent, so the shape has an insphere (r_in = 3V/A) and the inner core is the same shape scaled by (1 − t/r_in)
- ☑ **Cuboctahedron** and **truncated octahedron** (common for Pt, Pd and Au)
  - Both are the intersection of a cube (half-width h) and an octahedron (|x| + |y| + |z| ≤ s)
  - One closed-form V(h, s) covers both; A = ∂V/∂h + √3·∂V/∂s
  - Moving every face inward by t gives (h − t, s − √3t). This is exact even though the shapes are not tangential
- ☑ **Spheroid** (prolate and oblate ellipsoid of revolution, e.g. hematite spindles)
  - Closed-form surface area for both cases
  - The inner core uses semi-axes reduced by t, which is an approximation; label it as one

## Phase 3: Structures beyond a single solid

- ☑ **Structure selector:** Solid / Core–shell / Hollow (nanoshell, nanocage, nanoframe)
- ☑ **Core–shell** (e.g. Au@SiO₂, Fe₃O₄@Au, CdSe/ZnS)
  - Inputs: core material and shape, shell material, shell thickness
  - Outputs: core, shell and total volume and mass, mass and volume fractions, atoms in core and shell, effective density, outer surface area, SSA, outer-surface atoms of the shell material
- ☑ **Hollow**
  - Inputs: outer dimensions and wall thickness
  - Outputs: wall volume and mass, atoms, mass relative to a solid particle, outer and inner surface area (inner counts only for open cages or frames), surface atoms on both faces
- ☑ **Plots:** shell volume fraction against shell thickness (core–shell); mass relative to solid against wall thickness (hollow)
- ☑ **Citations:** core–shell review (Chaudhuri & Paria 2012), nanocages (Skrabalak et al. 2008), particle shapes (Marks & Peng 2016)

## Phase 4: Verification and docs

- ☑ Tests: exact V and A for every new shape, checked against known values (cuboctahedron (5√2/3)a³ and (6 + 2√3)a²; truncated octahedron 8√2·a³ and (6 + 12√3)a²; spheroid areas)
- ☑ Consistency test for every exactly offset shape: [V(d) − V(d shrunk by ε)]/ε → A(d)
- ☑ Core–shell and hollow test cases computed by hand (Au@SiO₂ sphere; Au nanocage)
- ☑ Every new formula parses in KaTeX; the page fits at phone width
- ☑ Update README; tick this plan; commit

## Verification record

- `node tests/run-tests.js`: 1094 passed, 0 failed
- Every shape × structure (12 × 3) was rendered in the browser: 1827 formulas, all parsed by KaTeX
- Hand checks:
  - Au@SiO₂ (20 nm core + 10 nm shell): outer D = 40 nm, SSA = 34.6 m²/g, effective density 4.34 g/cm³
  - Au nanocage (a = 50 nm, w = 5 nm): wall = 61,000 nm³, 48.8 % of a solid cube's mass
  - Ag decahedron (a = 30 nm): 9.544 × 10⁵ atoms (the 4.772 × 10⁵ first recorded here used a volume formula off by a factor of 2; corrected in Plan 2)
- No horizontal overflow at 375 px

---

# Plan 2: everything still missing

Each workstream belongs to one agent and touches only its own files (listed in brackets), so agents can work in parallel. Shared files (`index.html`, `README.md`, this plan) are integrated afterwards.

Rules for every item:
- Every equation, constant and coefficient is cited (`NC.addRefs`). No reference, DOI or data value is included unless it is certain.
- Tabulated literature data that cannot be reproduced exactly is not invented. The user enters it instead, or the model is clearly labelled.
- Every calculator has an example and known-value tests in `tests/<area>.test.js`.

## Workstream A: Particle types in the builder [`js/calculators/nanoparticle.js`]
- ☑ **Porous particles** (mesoporous silica, MOFs): porosity or pore volume input; skeletal vs. apparent density; internal surface from pore diameter (cylindrical pores, S = 4V_p/d_p)
- ☑ **Janus particles:** two materials split by volume fraction; mass, atoms and density for each half
- ☑ **Nanostars / branched particles:** spherical core with N conical spikes (spike length and base diameter)
- ☑ **Rounded corners and edges** for polyhedra: corner radius r, using the Steiner formula for the inner polyhedron plus a ball of radius r (exact)
- ☑ **Polydisperse samples:** lognormal or normal size distribution (mean, CV); number-, area- and volume-weighted means, ensemble SSA, mean atoms per particle

## Workstream B: Carbon and soft nanomaterials [`js/calculators/carbon-soft.js`]
- ☑ **Carbon structures:** fullerenes (C₆₀, C₇₀ …); graphene sheets (atoms per area, layer count, theoretical SSA); SWCNT/MWCNT atoms per length and mass per length (interlayer spacing); carbon dots (lattice-based atom count)
- ☑ **Liposomes / vesicles:** lipids per vesicle from area per lipid and bilayer thickness; encapsulated volume; lamellarity
- ☑ **Lipid nanoparticles:** N/P ratio and lipid amounts for an mRNA dose
- ☑ **Polymer nanoparticles and micelles:** chains per particle from molar mass and density; aggregation number

## Workstream C: Optics [`js/calculators/optics.js`]
- ☑ **Mie theory** for spheres (Bohren–Huffman series): extinction, scattering and absorption cross-sections against wavelength; plasmon peak
- ☑ **Gans theory** (quasi-static spheroids) for nanorods: longitudinal and transverse plasmon peaks against aspect ratio
- ☑ **Dielectric data:** a Drude/Drude–Lorentz model with cited parameters, or a user-pasted n, k table. No invented tabulated data
- ☑ **Ag sizing from UV-vis** via Mie (plasmon position and width), labelled as model-based
- ☑ **Photoluminescence quantum yield,** relative method (IUPAC, Brouwer 2011), with absorbance and refractive-index corrections
- ☑ **Urbach energy** from the absorption tail

## Workstream D: Scattering [`js/calculators/scattering.js`]
- ☑ **SAXS Guinier:** Rg from ln I vs q², validity check (q·Rg < 1.3), sphere radius
- ☑ **SAXS Porod:** invariant and specific surface from the I·q⁴ plateau
- ☑ **NTA:** diffusion coefficient and size from 2D mean-squared displacement; concentration from counts and imaged volume
- ☑ **DLS cumulants:** Γ and polydispersity index from a raw g₂(τ) correlation curve

## Workstream E: Crystal structure [`js/calculators/structure.js`]
- ☑ **Lattice parameters** for cubic, tetragonal, hexagonal and orthorhombic crystals, by least squares over several reflections
- ☑ **Size–strain plot** (an alternative to Williamson–Hall)
- ☑ **Phase quantification** by the RIR method (Chung 1974)
- ☑ **SAED:** relativistic electron wavelength; d = λL/R from ring radii; ring indexing against a structure
- ☑ **HRTEM:** lattice-fringe spacing from a fringe count or an FFT spot

## Workstream F: Elemental, magnetic and electrochemical analysis [`js/calculators/analysis.js`]
- ☑ **ICP-MS/OES element concentration → particle number concentration** (with mass fraction for compounds)
- ☑ **Single-particle ICP-MS:** particle mass and size from pulse intensity and transport efficiency
- ☑ **EDX quantification:** Cliff–Lorimer k-factors
- ☑ **Magnetism:** mass and per-particle saturation magnetization, magnetic dead layer, blocking temperature (Néel–Arrhenius, KV = ln(τ_m/τ₀)·k_BT_B)
- ☑ **Electrochemistry:** Pt ECSA from H-UPD (210 µC/cm²) and CO stripping (420 µC/cm²); mass-normalized ECSA; dispersion; turnover frequency

## Workstream G: Colloids and synthesis [`js/calculators/colloid-synthesis.js`]
- ☑ **DLVO:** van der Waals (Hamaker) plus electrostatic (Debye) interaction energy curves; energy barrier
- ☑ **Sedimentation:** Stokes settling velocity, settling time, Péclet number
- ☑ **Seed-mediated growth:** final size from seed count and precursor added, and precursor needed for a target size
- ☑ **Yield and conversion** mass balance
- ☑ **Classical nucleation:** critical radius and barrier against supersaturation (LaMer context)
- ☑ **Ostwald ripening (LSW):** r³ − r₀³ = k·t

## Workstream H: Spectrum and peak analysis [`js/calculators/peaks.js`]
- ☑ **Raw data import** (CSV/TXT/XY) for XRD, Raman, UV-vis and XPS
- ☑ **Processing:** Savitzky–Golay smoothing; linear, polynomial or Shirley baseline; peak finding
- ☑ **Peak fitting** (Levenberg–Marquardt; Gaussian, Lorentzian or pseudo-Voigt): position, FWHM, area, with parameter uncertainties
- ☑ **Export:** fitted peaks as a table ready to paste into Scherrer, Williamson–Hall or XPS

## Workstream I: App platform [`js/app.js`, `js/units.js`, `js/uncertainty.js`, `css/styles.css`, `sw.js`, `manifest.webmanifest`, `tools/review-sheet.js`, `docs/REVIEW.md`]
- ☑ **Error propagation:** a ± uncertainty for every numeric input; Monte Carlo propagation (JCGM 101:2008) through any calculator; every numeric result shown with its uncertainty
- ☑ **Unit choice:** typed units such as "5 Å" or "0.2 µm" convert to the field's unit, with a unit hint per field
- ☑ **Saved work:** shareable links that encode the inputs; named saved runs; calculation history
- ☑ **Installable offline app (PWA):** manifest plus a service worker that caches every file
- ☑ **File upload** into any data box
- ☑ **Expert review:** `tools/review-sheet.js` generates `docs/REVIEW.md`, a sign-off checklist of every formula, constant, coefficient and citation, for a domain expert

## Workstream J: Small known issues [`js/tex.js`, `js/core.js` material data] (main session)
- ☑ Single-letter units (J, s, m, K, C, F, V, …) upright in equations
- ☑ Mixed sentences in steps render with typeset maths instead of falling back to plain text
- ☑ Each material preset names its specific source table

## Integration (main session)
- ☑ Register every new script in `index.html`; update README
- ☑ Review each agent's formulas and references; run all tests; KaTeX check in the browser; mobile layout
- ☑ Tick this plan; commit

## Still out of scope
- Full atomistic models (magic-number clusters, DFT) and Rietveld refinement
- Built-in instrument-specific data (sensitivity factors, n/k tables) without a verifiable source

## Plan 2 verification record (2026-11-16)

- `node tests/run-tests.js`: 2686 passed, 0 failed; 56 calculators, 110 references; nine per-area test modules
- Every formula of every calculator's example and mode typeset with the bundled KaTeX in Node (global test)
- In the browser, all 56 calculators loaded their examples without errors (999 typeset equations, no console errors), with no horizontal overflow at 375 px or 1280 px
- Service worker active; `docs/REVIEW.md` regenerated (1118 sign-off items)
- DOIs added by agents (14) checked; DOIs were left out wherever not certain
- Corrections made during integration:
  - decahedron volume corrected from (5 + √5)/24·a³ to (5 + √5)/12·a³ (it was one pentagonal pyramid, not two); the test asserting the wrong value was fixed
  - examples and presets with blank (NaN) optional fields no longer show "NaN is not a number"
  - degree sign after a superscript typesets correctly
- Agent decisions to note:
  - Drude ε∞ for Ag/Au is tuned, not measured (labelled)
  - Shirley test now checks the method's real guarantees
  - service worker is network-first with cache fallback, so updates are never served stale


---

# Plan 3: everything I can still do without outside help (2026-11-16)

What is left after v0.8.0 splits in two. This plan covers everything that can be done and checked here. The rest needs people or outside data and is listed at the end.

**Status:** all items done (2026-11-16).

Rules as in Plan 2: every equation and constant is cited, nothing is included unless it is certain, and every new result is tested.

## A. Porosity calculators [`js/calculators/porosity.js`]
- ☑ **t-plot** (Lippens & de Boer 1965): Harkins–Jura or Halsey t-curve, chosen t range; external surface area from the slope and micropore volume from the intercept, with every step shown
- ☑ **BJH pore-size distribution** (Barrett, Joyner & Halenda 1951): full desorption or adsorption branch; Kelvin radius plus film thickness; the film-thinning correction for pores emptied earlier; table of size classes, dV/dD, cumulative volume, total volume and area, mode and mean diameter
- ☑ Warnings for the known failure cases: cavitation below p/p₀ ≈ 0.42 on desorption, negative pore volumes, micropores below 2 nm, a negative t-plot intercept, a curved t-plot
- ☑ Synthetic examples built from the models themselves, so the expected answers are known

## B. Comparison with established sorption software [`tests/validation/`]
- ☑ Add pyGAPS (Iacomi & Llewellyn 2019, open source) to the pinned validation environment
- ☑ Cross-validate BET (area, C), t-plot (area, micropore volume) and BJH (volume and area of every size class) against pyGAPS on the same data
- ☑ Self-consistency: BJH recovers a known pore distribution; the t-plot recovers a known external area and micropore volume

## C. Accessibility [`index.html`, `css/styles.css`, `js/app.js`, `js/plot.js`]
- ☑ Keyboard: skip link, visible focus on every control, logical tab order, no keyboard traps
- ☑ Screen readers: landmarks, labels tied to every input, results announced when they appear, plots given a text description, equations readable (KaTeX MathML)
- ☑ Colour contrast of text and controls checked against WCAG 2.2 AA (4.5 : 1) in light and dark themes
- ☑ Respect reduced-motion settings

## D. Cross-browser safety [`tools/lint.js`]
- ☑ Lint check that the code avoids JavaScript and CSS features missing from current Firefox and Safari (iOS)
- ☑ State the supported browsers in the README. Firefox and Safari are not tested here (only Chromium is available); say so

## E. References [`js/references.js`, `js/uncertainty.js`]
- ☑ Find and verify the DOI of JCGM 100:2008 (the GUM), or record that it has none
- ☑ Verify every new reference with `make verify-refs`; rebuild the treatise

## F. Integration
- ☑ Tests, `make check`, review sheet, README, VALIDATION.md, CHANGELOG, version bump; browser check of both calculators; commit and deploy

## Plan 3 verification record (2026-11-16)

- `node tests/run-tests.js`: 4503 passed, 0 failed; 58 calculators, 113 references
- pyGAPS 4.6.1 cross-validation: BET area and C, t-plot area and micropore volume, and the volume, area, diameter and dV/dD of all 66 BJH size classes agree with NanoCalc to ≤ 2.3 × 10⁻¹⁰
- Self-consistency: the t-plot recovers 80 m²/g and 0.100 cm³/g from its synthetic isotherm; BJH finds a 7.08 nm mode for pores generated at 7 nm, and puts > 85 % of monodisperse 8 nm pores into the class containing 8 nm
- Accessibility, checked in the browser: text contrast ≥ 4.9 : 1 (light) and ≥ 5.2 : 1 (dark); plot text and marks ≥ 4.3 : 1; every input labelled; skip link, focus ring, Escape and the mobile menu tested with the keyboard; 9 MathML equations on the Kelvin page
- Cross-browser: only Chromium is available here, so the check is static (`make lint`). It found and fixed one `:has()` rule (Firefox < 121) and six `color-mix()` declarations without a fallback
- References: all 113 app citations verified or classified (101 verified, 8 classic works not indexed, 4 standards); the GUM DOI 10.59161/JCGM100-2008E confirmed in Crossref
- Corrections during the work: an expected Harkins–Jura value in a new test was wrong (5.71 Å; correct 6.46 Å at p/p₀ = 0.5), and the first t-plot example used a Langmuir constant too small for the micropores to be full, which biased the area by 3.6 %; both fixed

## Still needs people or outside data (not in this plan)
- Expert sign-off of `docs/REVIEW.md`
- Comparison with commercial instrument software (vendor BET/BJH, XPS and EDX quantification, DLS and NTA) on real raw data
- Checking the empirical relations (Yu 2003, Haiss 2007, Cançado, Ohshima) against the papers' own data tables
- Measured n, k data for quantitative plasmonics
- Testing on real Firefox and Safari, and with real screen-reader users

---

# Plan 4: a workspace you can design and build with (2026-11-16)

**Why.** The calculators work, but using them feels like filling in a form: no sliders, static plots, a long stacked page, no lab procedures, and no way to design a layered particle. This plan turns NanoCalc into a workspace.

Decisions (from the user): live-workspace layout; full cited lab protocols scaled to the batch; a designer for core + shells + ligands with geometry, optical spectrum, ligands and a synthesis route.

**Status:** all items done (2026-11-16).

Rules as before: every equation, constant and procedure is cited; nothing is included unless it is certain (a quantity not certain from the paper says "see the original"); every new result is tested. Each workstream owns its files so agents can work in parallel.

## A. Interactive plots [`js/plot.js`, `css/plot.css`, `tests/plot.test.js`] (agent)
- ☑ `NC.plot(spec)` stays a static SVG (print, reports, tests)
- ☑ `NC.plotMount(el, spec)` makes it interactive and returns `{ update(spec), destroy() }`, so sliders redraw it without losing zoom or settings
- ☑ Hover read-out of the nearest point(s) with crosshair; drag-box zoom, wheel zoom, double-click to reset; click a legend entry to hide or show a series
- ☑ Toolbar: reset, log x / log y (when the data allow), "keep curve" to freeze the current curves for comparison while inputs change, clear kept curves
- ☑ Edit panel: axis limits, axis labels and title, markers/lines
- ☑ Export PNG, SVG and CSV of the plotted data
- ☑ Keyboard and screen-reader accessible; works by touch

## B. Synthesis protocols [`js/protocols.js`, `js/protocols-view.js`, `css/protocols.css`, `tests/protocols.test.js`] (agent)
- ☑ Library of published procedures, each from its original paper (cited, with DOI): citrate Au (Turkevich/Frens), citrate Ag (Lee–Meisel), seed-mediated Au nanorods (Nikoobakht & El-Sayed), two-phase thiol-capped Au (Brust–Schiffrin), Stöber silica, silica shells on Au (Liz-Marzán), Fe₃O₄ by thermal decomposition (Sun) and co-precipitation (Massart), CdSe from CdO (Peng & Peng), ZnS shells (SILAR, Li et al.), thiol-PEG and other ligand exchange, purification
- ☑ Each protocol: what it makes and the size range; reagents table (formula, molar mass, stock concentration, amount); equipment; numbered steps with temperature and time; critical points; safety (hazards of every reagent, waste); expected result (colour, λ_max, size); characterisation checks linked to NanoCalc calculators; how to tune the size; troubleshooting
- ☑ Batch scaling: choose the final volume and every amount (and the mass to weigh for each stock) is recalculated
- ☑ Lookup `NC.protocolsFor(role, material)` so the designer can build a route
- ☑ Synthesis pages: index by material and role, one page per protocol, printable

## C. Layered particle designer [`js/designer.js`, `js/designer-view.js`, `css/designer.css`, `tests/designer.test.js`] (agent)
- ☑ Spherical core plus any number of concentric shells; each layer: material (NanoCalc presets or custom density/molar mass), size or thickness with sliders, optical model; then a ligand shell and a medium
- ☑ Geometry and composition: radius of every interface, layer volumes, masses, atoms or formula units, mass and volume fractions, effective density, surface area and SSA, particle concentration from mass concentration; a to-scale cross-section drawing
- ☑ Optical spectrum: multilayer Mie theory (Yang 2003) for extinction, scattering and absorption cross-sections and efficiencies, molar extinction coefficient, peak and width; cross-checked against single-sphere Mie (bhmie) and an independent coated-sphere code (Bohren–Huffman bhcoat)
- ☑ Ligands and surface: ligands per particle from footprint or grafting density, ligand mass, shell thickness (PEG mushroom/brush), hydrodynamic diameter estimate, ligand amount needed for a batch
- ☑ Synthesis route: ordered build plan (core → each shell → ligands → purification), the matching protocol for each step, and the precursor amount for each shell from a mass balance for the batch
- ☑ Every output has its steps and citations; designs saved and shared by link

## D. Live workspace [`js/app.js`, `css/styles.css`, `js/core.js`] (main session)
- ☑ Two-column calculator page on wide screens: inputs (sticky) left, results and interactive plots right; steps, notes and references collapsible below; one column on phones
- ☑ Sliders beside every number field (log scale when the range spans decades; per-input ranges where they matter) with live recalculation while dragging; uncertainty propagation runs when dragging stops
- ☑ Results output reusable by the designer (`NC.renderOutput`)

## E. Structure and integration (main session)
- ☑ Home and navigation reorganised around three jobs: Design (designer, builder), Make (synthesis protocols, lab calculators), Characterise (analysis calculators)
- ☑ Register files, routes (`#/design`, `#/synthesis`, `#/synthesis/<id>`), verify new references, tests, browser check at desktop and phone width, docs, release

## Plan 4 verification record (2026-11-16)

- `node tests/run-tests.js`: 5795 passed, 0 failed; 58 calculators, 133 references (20 new, all verified in Crossref)
- Designer: multilayer Mie agrees with bhmie (≤ 5 × 10⁻¹⁶), miepython (2.5 × 10⁻¹¹), bhcoat (1.1 × 10⁻¹⁰) and an independent transfer-matrix solver (2.8 × 10⁻¹¹); geometry matches the nanoparticle builder to 10⁻⁹
- Protocols: 889 checks (molar masses from formulas incl. hydrates, scaling, mass to weigh, links to calculators)
- Browser: all 58 calculators load their examples in the new workspace with no errors (313 sliders, 39 interactive plots); a slider frame recalculates in 12–31 ms (Mie) and the full update after release in about 56 ms; designer and protocol pages have no horizontal overflow at 375 px; a shared designer link restores a three-layer design
- Corrections during integration: Li et al. 2003 is a CdS (not ZnS) shell, so Dabbousi et al. 1997 was added for ZnS; seven library entries duplicated new protocol citations and now link to them; designer links stored nested designs as "[object Object]" (now JSON); a long equation result widened the page (now capped)
- Not covered: optical constants for Fe₃O₄, CdSe and ZnS are not built in (no certain source), so those layers need user n, k for a spectrum; the Drude models for Au and Ag are qualitative; visual look and dark mode of the designer were checked only through the DOM
