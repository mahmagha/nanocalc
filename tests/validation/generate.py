"""
Generate independent reference values for NanoCalc's cross-validation.

Every value here is computed with established scientific software
(miepython, SciPy, NumPy, pyGAPS), NOT with NanoCalc's own code. The output,
tests/validation/reference.json, is committed; tests/validation.test.js
compares NanoCalc against it, so the regular test suite and CI need no Python.

Regenerate (requires the packages in tests/validation/requirements.txt):
    make validate-refs
"""
import json
import math
import platform
import sys
from datetime import date
from pathlib import Path

import miepython
import pygaps
import numpy as np
import scipy
from scipy import constants as sc
from scipy import integrate, optimize, signal, stats

OUT = Path(__file__).with_name("reference.json")
ref = {
    "generated": date.today().isoformat(),
    "software": {
        "python": platform.python_version(),
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "miepython": miepython.__version__,
    },
}

# ---------------------------------------------------------------- 1. Mie theory
# miepython uses m = n - ik for absorbing media; NanoCalc (Bohren-Huffman) uses n + ik.
mie_cases = [
    (1.5, 0.0, 0.1), (1.5, 0.0, 1.0), (1.5, 0.0, 10.0), (1.33, 0.0, 50.0),
    (1.5, 0.1, 2.0), (2.0, 1.0, 5.0), (0.2, 3.0, 0.8), (0.05, 2.2, 1.5),
]
ref["mie"] = []
for n, k, x in mie_cases:
    qext, qsca, qback, g = miepython.efficiencies_mx(complex(n, -k), x)
    ref["mie"].append({"n": n, "k": k, "x": x, "qext": float(qext), "qsca": float(qsca)})

# ------------------------------------------------- 2. Spheroid depolarization factor
# Long-axis factor of a prolate spheroid (semi-axes 1, 1, AR) from the defining integral
#   L_c = (a b c / 2) ∫0^∞ ds / [(s + c²) √((s + a²)(s + b²)(s + c²))]
ref["depolarization"] = []
for ar in [1.0001, 1.5, 2.0, 3.0, 5.0, 8.0]:
    a = b = 1.0
    c = ar
    integrand = lambda s: 1.0 / ((s + c * c) * math.sqrt((s + a * a) * (s + b * b) * (s + c * c)))
    val, _ = integrate.quad(integrand, 0, np.inf, limit=200)
    ref["depolarization"].append({"AR": ar, "L": a * b * c / 2 * val})

# -------------------------------------------------------- 3. Spheroid surface area
# Surface of revolution of x²/a² + z²/c² = 1 about z, integrated numerically.
ref["spheroid_area"] = []
for D, L in [(2, 4), (4, 2), (10, 60), (60, 10), (3, 3.0001)]:
    a, c = D / 2, L / 2
    f = lambda z: 2 * math.pi * a * math.sqrt(1 - z * z / c**2) * math.sqrt(1 + (a * z / (c * c * math.sqrt(1 - z * z / c**2))) ** 2)
    area, _ = integrate.quad(f, -c, c, limit=400)
    ref["spheroid_area"].append({"D": D, "L": L, "A": area})

# ------------------------------------------------------ 4. Savitzky-Golay coefficients
ref["savgol"] = []
for win, order in [(5, 2), (7, 2), (9, 4), (11, 3), (21, 2)]:
    ref["savgol"].append({"win": win, "order": order, "coeffs": signal.savgol_coeffs(win, order).tolist()})

# -------------------------------------------------- 5. Ordinary least squares with SEs
rng = np.random.default_rng(20261116)
xs = np.linspace(0.5, 4.0, 12)
ys = 0.0123 * xs + 0.00691 + rng.normal(0, 2e-4, xs.size)
res = stats.linregress(xs, ys)
ref["linreg"] = {
    "x": xs.tolist(), "y": ys.tolist(),
    "slope": res.slope, "intercept": res.intercept, "r2": res.rvalue**2,
    "se_slope": res.stderr, "se_intercept": res.intercept_stderr,
}

# --------------------------------------------- 6. Gaussian peak fit with uncertainties
x = np.linspace(30, 50, 801)
true = [(38.2, 1000.0, 0.45), (44.4, 450.0, 0.55)]
gauss = lambda x, c, h, w: h * np.exp(-4 * np.log(2) * ((x - c) / w) ** 2)
y = sum(gauss(x, *p) for p in true) + rng.normal(0, 8.0, x.size)
model = lambda x, c1, h1, w1, c2, h2, w2: gauss(x, c1, h1, w1) + gauss(x, c2, h2, w2)
p0 = [38.0, 900, 0.6, 44.6, 400, 0.7]
popt, pcov = optimize.curve_fit(model, x, y, p0=p0)
ref["peakfit"] = {
    "x": x.tolist(), "y": y.tolist(), "init": p0,
    "params": popt.tolist(), "se": np.sqrt(np.diag(pcov)).tolist(),
}

# ------------------------------------------------ 7. Particle-size statistics (TEM)
d = rng.lognormal(mean=math.log(12.0), sigma=math.log(1.15), size=300)
d = np.round(d, 2)
ln = np.log(d)
ref["psd"] = {
    "d": d.tolist(),
    "mean": float(d.mean()), "sd": float(d.std(ddof=1)), "median": float(np.median(d)),
    "d32": float((d**3).sum() / (d**2).sum()), "d43": float((d**4).sum() / (d**3).sum()),
    "gmean": float(stats.gmean(d)), "gsd": float(math.exp(ln.std(ddof=1))),
    "ci95": float(stats.t.ppf(0.975, d.size - 1) * d.std(ddof=1) / math.sqrt(d.size)),
}

# ------------------------------------- 7b. Student t 97.5 % quantile (confidence intervals)
ref["t975"] = [{"df": df, "t": float(stats.t.ppf(0.975, df))} for df in [1, 2, 5, 10, 29, 30, 31, 40, 60, 120, 121, 299, 1000, 100000]]

# ------------------------------------------------ 8. Physical constants (SciPy CODATA)
ref["constants"] = {
    "codata_edition_in_scipy": "see scipy.constants (CODATA 2022 in recent SciPy)",
    "h": sc.h, "hbar": sc.hbar, "e": sc.e, "me": sc.m_e, "eps0": sc.epsilon_0,
    "kB": sc.k, "NA": sc.N_A, "c": sc.c, "R": sc.R, "a0": sc.physical_constants["Bohr radius"][0],
}

# ------------------------------------------- 9. Gas sorption: BET, t-plot, BJH (pyGAPS)
# Synthetic isotherms are built here (not by NanoCalc), then analysed by pyGAPS's
# low-level functions with every adsorbate property passed explicitly.
from pygaps.characterisation.area_bet import area_BET_raw
from pygaps.characterisation.t_plots import t_plot_raw
from pygaps.characterisation.psd_meso import psd_bjh
from pygaps.characterisation.models_thickness import thickness_harkins_jura
from pygaps.characterisation.models_kelvin import kelvin_radius

VM_STP = 22413.97  # cm3/mol, ideal gas at 273.15 K and 101.325 kPa
N2 = {"M": 28.0134, "rho": 0.808, "gamma": 8.85, "T": 77.35, "sigma": 0.162}
k_liq = N2["M"] / (N2["rho"] * VM_STP)  # cm3 liquid per cm3 STP


def halsey_exact(p):
    # pyGAPS's built-in Halsey curve rounds the exponent 1/3 to 0.333; Halsey (1948) uses 1/3
    return 0.354 * (-5 / np.log(p)) ** (1 / 3)


sorp = {"adsorbate": N2}

# BET: type II isotherm (Vm = 80 cm3 STP/g, C = 120) with a 0.5 % ripple, so the fit is not exact
x = np.round(np.linspace(0.02, 0.40, 20), 4)
V = 80 * 120 * x / ((1 - x) * (1 - x + 120 * x)) * (1 + 0.005 * np.sin(37 * x))
area, c_const, n_m, p_m, slope, intercept, lo, hi, corr = area_BET_raw(
    x, V / VM_STP, N2["sigma"], p_limits=(0.045, 0.305))  # loading in mol/g
sorp["bet"] = {"x": x.tolist(), "V": V.tolist(), "xmin": float(x[lo]), "xmax": float(x[hi]),
               "area": float(area), "C": float(c_const)}

# t-plot: micropores (0.12 cm3/g, Langmuir K = 500) + 60 m2/g external area, read with two t-curves
x = np.round(np.concatenate([np.linspace(0.005, 0.1, 8), np.linspace(0.12, 0.6, 17)]), 4)
sorp["tplot"] = []
for name, tf in (("hj", thickness_harkins_jura), ("halsey", halsey_exact)):
    Vliq = 0.12 * 500 * x / (1 + 500 * x) + 60 * thickness_harkins_jura(x) * 1e-3
    Vg = Vliq / k_liq
    res, _ = t_plot_raw(Vg / VM_STP * 1e3, x, tf, N2["rho"], N2["M"], t_limits=(0.35, 0.5))  # mmol/g
    sorp["tplot"].append({"curve": name, "x": x.tolist(), "V": Vg.tolist(), "tmin": 0.35, "tmax": 0.5,
                          "area": float(res[0]["area"]), "Vmic": float(res[0]["adsorbed_volume"])})

# BJH: bimodal cylindrical pores (5 nm and 12 nm) + 40 m2/g external area; both branches
D = np.linspace(2.5, 25, 3000)
dD = D[1] - D[0]
dist = (0.35 * np.exp(-0.5 * ((D - 5) / 0.6) ** 2) / (0.6 * math.sqrt(2 * math.pi))
        + 0.25 * np.exp(-0.5 * ((D - 12) / 1.5) ** 2) / (1.5 * math.sqrt(2 * math.pi))) * dD
sorp["bjh"] = []
for branch, men in (("des", "hemispherical"), ("ads", "cylindrical")):
    x = np.round(np.concatenate([np.linspace(0.42, 0.90, 25), np.linspace(0.91, 0.99, 9)]), 4)
    kel = lambda p, men=men: kelvin_radius(p, men, N2["T"], N2["rho"], N2["M"], N2["gamma"])
    t = thickness_harkins_jura(x)
    rc = kel(x) + t
    Vliq = np.array([40 * ti * 1e-3 + np.sum(np.where(D / 2 <= rci, dist, dist * (1 - ((D / 2 - ti) / (D / 2)) ** 2)))
                     for ti, rci in zip(t, rc)])
    out = psd_bjh(Vliq, x, "cylinder", thickness_harkins_jura, kel)
    sorp["bjh"].append({"branch": branch, "x": x.tolist(), "V": (Vliq / k_liq).tolist(),
                        # pyGAPS returns classes from small to large pores
                        "Vp": out["pore_volumes"].tolist(), "Ap": out["pore_areas"].tolist(),
                        "dVdD": out["pore_distribution"].tolist(), "Dlo": out["pore_widths"].tolist()})
ref["sorption"] = sorp
ref["software"]["pygaps"] = pygaps.__version__

OUT.write_text(json.dumps(ref, indent=1) + "\n", encoding="utf-8")
print(f"Wrote {OUT} with {sum(len(v) if isinstance(v, list) else 1 for k, v in ref.items() if k not in ('generated', 'software'))} reference blocks")
print(" ".join(f"{k} {v}" for k, v in ref["software"].items()))
