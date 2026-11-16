# Validation

How NanoCalc's results are checked, and what is not checked yet.

## 1. Cross-validation against established software

The numerical cores are compared with independent implementations in widely used scientific packages. `tests/validation/generate.py` computes reference values with that software. The values are committed as `tests/validation/reference.json`, and `tests/validation.test.js` compares NanoCalc with them on every test run, so CI needs no Python.

Reference software: Python 3.13.3, NumPy 2.5.5, SciPy 1.18.1, miepython 3.3.1. Exact versions are pinned in `tests/validation/requirements.txt`.

| What | NanoCalc | Reference | Cases | Worst relative deviation |
|---|---|---|---|---|
| Mie efficiencies Q_ext, Q_sca (dielectric, absorbing, metallic; x = 0.1–50) | `NC.optics.bhmie` | miepython `efficiencies_mx` | 8 | 1.8 × 10⁻⁸ |
| Spheroid depolarization factor (aspect ratio 1–8) | `NC.optics.gansL` | SciPy `quad` of the defining integral | 6 | 1.1 × 10⁻⁹ |
| Spheroid surface area (prolate and oblate) | `NC.shapes.spheroid.A` | SciPy `quad`, surface of revolution | 5 | 8 × 10⁻¹⁴ |
| Savitzky–Golay coefficients (5 window/order pairs) | `NC.peaks.sgCoeffs` | `scipy.signal.savgol_coeffs` | 5 | < 10⁻¹⁰ (absolute) |
| Linear least squares incl. standard errors | `NC.stats.linreg` | `scipy.stats.linregress` | 1 | 7.7 × 10⁻¹³ |
| Two-Gaussian peak fit: parameters | `NC.peaks.fitPeaks` | `scipy.optimize.curve_fit` | 6 parameters | 1.6 × 10⁻⁸ |
| Two-Gaussian peak fit: parameter standard errors | `NC.peaks.fitPeaks` | `scipy.optimize.curve_fit` | 4 | 1.4 × 10⁻⁶ |
| Size statistics (mean, SD, median, D[3,2], D[4,3], geometric mean/SD, 95 % CI) on 300 particles, through the real calculator | `psd` | NumPy / `scipy.stats` | 8 | 1 × 10⁻¹⁰ |
| Student t(0.975, df), used by every confidence interval | `NC.stats.t95` | `scipy.stats.t.ppf` | 14 | 1.6 × 10⁻⁴ (3-decimal table at df ≤ 30); 2 × 10⁻⁶ above |
| Physical constants | `NC.C` (CODATA 2018) | `scipy.constants` (newer CODATA) | 10 | Exact SI constants identical; others ≤ 1.4 × 10⁻⁹ (edition difference) |

**Found by this cross-check:** confidence intervals for samples larger than ~120 used t = 1.96 instead of the exact quantile (t = 1.968 at n = 300), so they were about 0.4 % too narrow. This is fixed: `NC.stats.t95` now uses the Cornish–Fisher expansion above 30 degrees of freedom.

To regenerate the references:

```bash
python -m venv .venv
.venv/Scripts/pip install -r tests/validation/requirements.txt   # Windows; use .venv/bin/pip on macOS/Linux
make validate-refs
```

## 2. Known-value tests

There are about 2,700 automated checks, run by `make test`:
- **Hand calculations and textbook values.** Examples: Scherrer at 38.2°/0.5° → 16.81 nm; a 20 nm Ag sphere has 2.455 × 10⁵ atoms; a 100 nm Au particle settles at 112 nm/s in water; Pt ECSA from 1.05 mC H-UPD charge → 5 cm².
- **Exact geometry.** Known volumes, areas and sphericities of polyhedra, plus a consistency check that removing a thin layer from every face removes A·dt of volume (dV/dt = A).
- **Synthetic data with a known answer.** Guinier, Porod, cumulants, Tauc, Urbach, BET, lattice refinement and peak fitting each recover the parameters the data was generated with.
- **Limits.** Mie → dipole approximation for small x; Mie Q_ext → 2 for large spheres; Gans with L = 1/3 → sphere; a rounded polyhedron with r → inradius → sphere.
- **Typesetting.** Every formula of every calculator typesets with the bundled KaTeX.

The full list is in `tests/run-tests.js` and `tests/*.test.js`.

## 3. Not yet validated

- **Expert review.** No domain expert has signed off `docs/REVIEW.md` yet. See [EXPERT-REVIEW-GUIDE.md](EXPERT-REVIEW-GUIDE.md).
- **Empirical relations** (Yu 2003, Haiss 2007, Cançado 2006/2011, Harkins–Jura, Ohshima, the water viscosity correlation) are checked against hand calculations of the published formulas, not against the papers' own data tables.
- **Not compared with instrument software:** BET, BJH-type pore sizes, XPS and EDX quantification, DLS and NTA. The best check would be to run the same raw data through, for example, the instrument vendor's software, SasView (SAXS) or Fityk (peak fitting).
- **Plasmon defaults.** These use a free-electron Drude model with tuned ε∞, which is qualitative for Au. Quantitative work needs measured n, k data, which the app accepts.
