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
  - V = (5 + √5)/24 · a³, A = (5√3/2) · a²
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
  - Ag decahedron (a = 30 nm): 4.772 × 10⁵ atoms
- No horizontal overflow at 375 px

---

# Plan 2: everything still missing

Each workstream belongs to one agent and touches only its own files (listed in brackets), so agents can work in parallel. Shared files (`index.html`, `README.md`, this plan) are integrated afterwards.

Rules for every item:
- Every equation, constant and coefficient is cited (`NC.addRefs`). No reference, DOI or data value is included unless it is certain.
- Tabulated literature data that cannot be reproduced exactly is not invented. The user enters it instead, or the model is clearly labelled.
- Every calculator has an example and known-value tests in `tests/<area>.test.js`.

## Workstream A: Particle types in the builder [`js/calculators/nanoparticle.js`]
- ☐ **Porous particles** (mesoporous silica, MOFs): porosity or pore volume input; skeletal vs. apparent density; internal surface from pore diameter (cylindrical pores, S = 4V_p/d_p)
- ☐ **Janus particles:** two materials split by volume fraction; mass, atoms and density for each half
- ☐ **Nanostars / branched particles:** spherical core with N conical spikes (spike length and base diameter)
- ☐ **Rounded corners and edges** for polyhedra: corner radius r, using the Steiner formula for the inner polyhedron plus a ball of radius r (exact)
- ☐ **Polydisperse samples:** lognormal or normal size distribution (mean, CV); number-, area- and volume-weighted means, ensemble SSA, mean atoms per particle

## Workstream B: Carbon and soft nanomaterials [`js/calculators/carbon-soft.js`]
- ☐ **Carbon structures:** fullerenes (C₆₀, C₇₀ …); graphene sheets (atoms per area, layer count, theoretical SSA); SWCNT/MWCNT atoms per length and mass per length (interlayer spacing); carbon dots (lattice-based atom count)
- ☐ **Liposomes / vesicles:** lipids per vesicle from area per lipid and bilayer thickness; encapsulated volume; lamellarity
- ☐ **Lipid nanoparticles:** N/P ratio and lipid amounts for an mRNA dose
- ☐ **Polymer nanoparticles and micelles:** chains per particle from molar mass and density; aggregation number

## Workstream C: Optics [`js/calculators/optics.js`]
- ☐ **Mie theory** for spheres (Bohren–Huffman series): extinction, scattering and absorption cross-sections against wavelength; plasmon peak
- ☐ **Gans theory** (quasi-static spheroids) for nanorods: longitudinal and transverse plasmon peaks against aspect ratio
- ☐ **Dielectric data:** a Drude/Drude–Lorentz model with cited parameters, or a user-pasted n, k table. No invented tabulated data
- ☐ **Ag sizing from UV-vis** via Mie (plasmon position and width), labelled as model-based
- ☐ **Photoluminescence quantum yield,** relative method (IUPAC, Brouwer 2011), with absorbance and refractive-index corrections
- ☐ **Urbach energy** from the absorption tail

## Workstream D: Scattering [`js/calculators/scattering.js`]
- ☐ **SAXS Guinier:** Rg from ln I vs q², validity check (q·Rg < 1.3), sphere radius
- ☐ **SAXS Porod:** invariant and specific surface from the I·q⁴ plateau
- ☐ **NTA:** diffusion coefficient and size from 2D mean-squared displacement; concentration from counts and imaged volume
- ☐ **DLS cumulants:** Γ and polydispersity index from a raw g₂(τ) correlation curve

## Workstream E: Crystal structure [`js/calculators/structure.js`]
- ☐ **Lattice parameters** for cubic, tetragonal, hexagonal and orthorhombic crystals, by least squares over several reflections
- ☐ **Size–strain plot** (an alternative to Williamson–Hall)
- ☐ **Phase quantification** by the RIR method (Chung 1974)
- ☐ **SAED:** relativistic electron wavelength; d = λL/R from ring radii; ring indexing against a structure
- ☐ **HRTEM:** lattice-fringe spacing from a fringe count or an FFT spot

## Workstream F: Elemental, magnetic and electrochemical analysis [`js/calculators/analysis.js`]
- ☐ **ICP-MS/OES element concentration → particle number concentration** (with mass fraction for compounds)
- ☐ **Single-particle ICP-MS:** particle mass and size from pulse intensity and transport efficiency
- ☐ **EDX quantification:** Cliff–Lorimer k-factors
- ☐ **Magnetism:** mass and per-particle saturation magnetization, magnetic dead layer, blocking temperature (Néel–Arrhenius, KV = ln(τ_m/τ₀)·k_BT_B)
- ☐ **Electrochemistry:** Pt ECSA from H-UPD (210 µC/cm²) and CO stripping (420 µC/cm²); mass-normalized ECSA; dispersion; turnover frequency

## Workstream G: Colloids and synthesis [`js/calculators/colloid-synthesis.js`]
- ☐ **DLVO:** van der Waals (Hamaker) plus electrostatic (Debye) interaction energy curves; energy barrier
- ☐ **Sedimentation:** Stokes settling velocity, settling time, Péclet number
- ☐ **Seed-mediated growth:** final size from seed count and precursor added, and precursor needed for a target size
- ☐ **Yield and conversion** mass balance
- ☐ **Classical nucleation:** critical radius and barrier against supersaturation (LaMer context)
- ☐ **Ostwald ripening (LSW):** r³ − r₀³ = k·t

## Workstream H: Spectrum and peak analysis [`js/calculators/peaks.js`]
- ☐ **Raw data import** (CSV/TXT/XY) for XRD, Raman, UV-vis and XPS
- ☐ **Processing:** Savitzky–Golay smoothing; linear, polynomial or Shirley baseline; peak finding
- ☐ **Peak fitting** (Levenberg–Marquardt; Gaussian, Lorentzian or pseudo-Voigt): position, FWHM, area, with parameter uncertainties
- ☐ **Export:** fitted peaks as a table ready to paste into Scherrer, Williamson–Hall or XPS

## Workstream I: App platform [`js/app.js`, `js/units.js`, `js/uncertainty.js`, `css/styles.css`, `sw.js`, `manifest.webmanifest`, `tools/review-sheet.js`, `docs/REVIEW.md`]
- ☐ **Error propagation:** a ± uncertainty for every numeric input; Monte Carlo propagation (JCGM 101:2008) through any calculator; every numeric result shown with its uncertainty
- ☐ **Unit choice:** typed units such as "5 Å" or "0.2 µm" convert to the field's unit, with a unit hint per field
- ☐ **Saved work:** shareable links that encode the inputs; named saved runs; calculation history
- ☐ **Installable offline app (PWA):** manifest plus a service worker that caches every file
- ☐ **File upload** into any data box
- ☐ **Expert review:** `tools/review-sheet.js` generates `docs/REVIEW.md`, a sign-off checklist of every formula, constant, coefficient and citation, for a domain expert

## Workstream J: Small known issues [`js/tex.js`, `js/core.js` material data] (main session)
- ☐ Single-letter units (J, s, m, K, C, F, V, …) upright in equations
- ☐ Mixed sentences in steps render with typeset maths instead of falling back to plain text
- ☐ Each material preset names its specific source table

## Integration (main session)
- ☐ Register every new script in `index.html`; update README
- ☐ Review each agent's formulas and references; run all tests; KaTeX check in the browser; mobile layout
- ☐ Tick this plan; commit

## Still out of scope
- Full atomistic models (magic-number clusters, DFT) and Rietveld refinement
- Built-in instrument-specific data (sensitivity factors, n/k tables) without a verifiable source
