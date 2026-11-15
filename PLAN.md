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

## Out of scope (possible next steps)

These need models other than "dense solid geometry":
- porous particles (mesoporous silica, MOFs): need pore volume or porosity input
- soft particles (liposomes, lipid nanoparticles, polymer nanoparticles): bilayer and lamellarity models
- carbon allotropes (fullerenes, nanotubes, graphene): lattice-based atom counts
- Janus particles, nanostars, branched shapes
- shape-dependent optics, e.g. plasmon peak positions for Ag and Au rods, cubes and plates
