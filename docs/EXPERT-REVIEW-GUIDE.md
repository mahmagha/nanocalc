# Expert review guide

NanoCalc needs a sign-off from someone with nanomaterials characterization expertise. [REVIEW.md](REVIEW.md) lists all ~1,100 items. This guide says where to start, so a reviewer with a few hours spends them where errors are most likely.

## Why review is needed

Tests can only confirm that code does what its author believed. During development, a test asserted a decahedron volume that was off by a factor of 2: one pentagonal pyramid instead of two. Only an independent first-principles check caught it. Cross-validation against SciPy and miepython ([VALIDATION.md](VALIDATION.md)) covers the numerical cores. It cannot tell whether the **science chosen** is right: the right formula, constant, convention and validity range for nanomaterials work.

## Priority 1: empirical coefficients and literature-specific constants (≈ 2–3 h)

These were typed from the literature, so a transcription error would go unnoticed by every test. Please check each one against the original paper.

| Calculator (id) | Check |
|---|---|
| QD size & concentration (`qdyu`) | Yu et al. 2003: the CdSe, CdTe and CdS sizing polynomials and the extinction-coefficient power laws |
| Au NP size & concentration (`haiss`) | Haiss et al. 2007: B₁ = 3.00, B₂ = 2.20; the concentration formula (−0.295, 1.36, 96.8, 78.2); the peak-position constants (512, 6.53, 0.0216) |
| Raman graphene (`raman`) | Cançado 2006 (2.4 × 10⁻¹⁰) and 2011 (1.8 × 10⁻⁹, 1.8 × 10²²): whether those works used peak areas or heights |
| CNT structure (`cnt`) | Jorio 2001: RBM A = 248 cm⁻¹·nm, B = 0 |
| Kelvin / Harkins–Jura (`kelvin`) | N₂ at 77 K: γ = 8.85 mN/m, V_m = 34.68 cm³/mol; the Harkins–Jura constants 13.99 and 0.034 |
| BET (`bet`) | Cross-sectional areas of N₂ (0.162 nm²), Ar (0.142 nm²) and Kr (0.202 nm²); the Rouquerol criteria |
| Zeta potential (`zeta`) | Ohshima's approximation to Henry's function; the water permittivity fit (Malmberg & Maryott) |
| DLS (`dls`) | The water viscosity correlation (2.414 × 10⁻⁵, 247.8, 140) against IAPWS 2008 |
| ECSA (`ecsa`) | 210 µC/cm² (H-UPD) and 420 µC/cm² (CO stripping) conventions |
| Mie / Gans / Ag sizing (`mie`, `gans`, `agsize`) | Drude parameters for Ag and Au (Ashcroft & Mermin values for n_e, τ and v_F). ε∞ is tuned to match the plasmon position, not measured; is that adequate as a default? |
| Brus (`brus`) | Preset effective masses and permittivities for CdSe, CdS, CdTe, PbS, InP and ZnO |
| Nanoparticle builder (`nanoparticle`) | Volume and area of every shape, especially decahedron, cuboctahedron, truncated octahedron and nanostar; the rounded-edge (Steiner) model; the porous internal surface S = 4V_p/d_p |
| Material database (`materials`) | Densities against the CRC Handbook, especially oxide phases (anatase/rutile, hematite/maghemite, monoclinic ZrO₂, amorphous SiO₂) |
| Size–strain plot (`ssp`) | The form used and how its strain relates to the Williamson–Hall ε (the app states η = 4ε) |
| spICP-MS (`spicpms`) | Transport efficiency definitions (Pace et al. 2011) |

## Priority 2: method choices and validity ranges (≈ 2 h)

For each calculator, open it in the app, load the example, and read the **warnings** and **Assumptions & notes**. Are the stated limits right? Is anything important missing? Calculators where conventions vary most between communities:

- `scherrer`, `wh` and `ssp`: the K value; FWHM or integral breadth; how instrumental broadening is corrected
- `tauc` and `urbach`: choosing the fit range; Makuła's baseline method for modified photocatalysts
- `dlvo`: the low-potential, constant-potential approximation, and ζ standing in for ψ₀
- `porod`: whether S/V is per sample or per particle volume
- `cumulants`: second-order cumulant cutoffs
- `liposome` and `lnp`: default lipid areas and molar ratios (labelled "typical, check your source")
- `magnet`: the dead-layer model and the τ₀ range used for the blocking temperature

## Priority 3: textbook formulas and references (skim)

These come from textbooks and are already covered by known-value tests or by cross-validation:

- Bragg, Beer–Lambert, Stokes–Einstein and Stokes settling
- lattice refinement, electron wavelength, SAED and HRTEM geometry
- Mie and Gans numerics, Savitzky–Golay, least squares, peak fitting and size statistics

Skimming the references section of REVIEW.md for wrong bibliographic details is still worthwhile. DOIs were included only where certain.

## How to record findings

- **Sign off** in `REVIEW.md`: tick the box and add your initials and the date. Partial reviews are fine; say which sections you covered.
- **Report problems** as a GitHub issue using the *Scientific review finding* template. Include the calculator id, the item, what is wrong, and the correct value with its source.
- After a fix, regenerate the sheet with `make review`. `make check` fails if the sheet is out of date, so it cannot drift from the code.
