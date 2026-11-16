"""
Generate independent reference values for NanoCalc's cross-validation.

Every value here is computed with established scientific software
(miepython, SciPy, NumPy), NOT with NanoCalc's own code. The output,
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

OUT.write_text(json.dumps(ref, indent=1) + "\n", encoding="utf-8")
print(f"Wrote {OUT} with {sum(len(v) if isinstance(v, list) else 1 for k, v in ref.items() if k not in ('generated', 'software'))} reference blocks")
print(" ".join(f"{k} {v}" for k, v in ref["software"].items()))
