/*
 * Unicode-formula → LaTeX converter, plus KaTeX rendering with plain-text fallback.
 *
 * Calculators write formulas in readable Unicode ("D = Kλ / (β·cosθ)", "√(B² + 4A)",
 * "ε₀", "T_m,bulk", "x^(1/3)"). NC.toTex converts those to LaTeX. A step can
 * override the automatic conversion with explicit fields: tex, subTex, resultTex.
 */
(function (global) {
  'use strict';
  const NC = global.NC;

  const GREEK = {
    α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\varepsilon', ζ: '\\zeta', η: '\\eta', θ: '\\theta',
    κ: '\\kappa', λ: '\\lambda', μ: '\\mu', µ: '\\mu', ν: '\\nu', ξ: '\\xi', π: '\\pi', ρ: '\\rho', σ: '\\sigma', τ: '\\tau',
    φ: '\\varphi', χ: '\\chi', ψ: '\\psi', ω: '\\omega', Γ: '\\Gamma', Δ: '\\Delta', Θ: '\\Theta', Λ: '\\Lambda',
    Σ: '\\Sigma', Φ: '\\Phi', Ψ: '\\Psi', Ω: '\\Omega', ħ: '\\hbar'
  };
  const SYM = {
    '·': '\\cdot ', '×': '\\times ', '⇒': '\\;\\Rightarrow\\; ', '→': '\\to ', '≈': '\\approx ', '≥': '\\ge ', '≤': '\\le ',
    '≠': '\\ne ', '−': '-', '±': '\\pm ', '∝': '\\propto ', '∞': '\\infty ', '…': '\\ldots ', '°': '^{\\circ}', '≳': '\\gtrsim ',
    '≲': '\\lesssim ', '′': "'", '%': '\\%', '#': '\\#', '&': '\\&', '~': '\\sim ', '{': '\\{', '}': '\\}', '\\': '\\backslash ',
    '∑': '\\sum ', '$': '\\$', '"': "''", '–': '\\text{–}'
  };
  const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };
  const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ₑ': 'e', 'ₕ': 'h', 'ᵣ': 'r', 'ₐ': 'a', 'ₒ': 'o', 'ₓ': 'x', 'ₘ': 'm', 'ₙ': 'n', 'ₚ': 'p', 'ₛ': 's', 'ₜ': 't', 'ᵢ': 'i', 'ⱼ': 'j', 'ₖ': 'k', '₋': '-', '₊': '+' };
  const BARRED = { 'ȳ': 'y', 'ā': 'a', 'ē': 'e', 'ī': 'i', 'ō': 'o', 'ū': 'u', 'Ā': 'A', 'Ē': 'E', 'Ō': 'O' };
  const CLOSE = { '(': ')', '[': ']' };
  const FUNCS = { sin: '\\sin', cos: '\\cos', tan: '\\tan', ln: '\\ln', log: '\\log', exp: '\\exp', arctan: '\\arctan', max: '\\max', min: '\\min', mod: '\\bmod' };
  const SUBRUN = /[A-Za-z0-9,.–'′\-]/;

  /** Strings that are mostly sentences render better as plain text. */
  function isProse(s) {
    const words = (s.match(/[A-Za-z]{4,}/g) || []).filter(function (w) { return !FUNCS[w]; });
    return words.length >= 3;
  }

  /** Index of the bracket matching chars[open] ( "(" or "[" ), or -1. */
  function matchParen(chars, open) {
    const o = chars[open], c = CLOSE[o];
    let depth = 0;
    for (let j = open; j < chars.length; j++) {
      if (chars[j] === o) depth++;
      else if (chars[j] === c) { depth--; if (depth === 0) return j; }
    }
    return -1;
  }
  function textWrap(run) { return run.length === 1 || /^[0-9.\-+]+$/.test(run) ? run : '\\text{' + run.replace(/[–]/g, '–') + '}'; }

  function convert(chars) {
    let out = '';
    let i = 0;
    let lastWord = false;
    while (i < chars.length) {
      const ch = chars[i];
      // whitespace
      if (/\s/.test(ch)) {
        let j = i;
        while (j < chars.length && /\s/.test(chars[j])) j++;
        const next = chars[j];
        if (j - i >= 2) out += '\\quad ';
        else if (lastWord && next && /[A-Za-z]/.test(next)) out += '\\ ';
        else if (i > 0 && /[0-9]/.test(chars[i - 1]) && next && (/[A-Za-zÅ%µ]/.test(next) || GREEK[next])) out += '\\, '; // 16760 nm
        else out += ' ';
        i = j;
        continue;
      }
      // letter runs: functions, single-letter variables, or upright text
      if (/[A-Za-z]/.test(ch)) {
        let j = i;
        while (j < chars.length && /[A-Za-z]/.test(chars[j])) j++;
        const w = chars.slice(i, j).join('');
        if (chars[j] === '̄') { // combining macron: x̄ → \bar{x}
          out += (w.length > 1 ? '\\text{' + w.slice(0, -1) + '}' : '') + '\\bar{' + w.slice(-1) + '}';
          lastWord = false;
          i = j + 1;
          continue;
        }
        out += FUNCS[w] ? FUNCS[w] + ' ' : w.length === 1 ? w : '\\text{' + w + '}';
        lastWord = w.length > 1 && !FUNCS[w];
        i = j;
        continue;
      }
      lastWord = false;
      if (/[0-9.]/.test(ch)) { out += ch; i++; continue; }
      if (ch === '_') {
        let j = i + 1;
        if (chars[j] === '(') {
          const k = matchParen(chars, j);
          if (k > 0) { out += '_{' + convert(chars.slice(j + 1, k)) + '}'; i = k + 1; continue; }
        }
        while (j < chars.length && SUBRUN.test(chars[j])) j++;
        // do not swallow a trailing comma/period that ends the clause
        while (j > i + 2 && /[,.]/.test(chars[j - 1])) j--;
        const run = chars.slice(i + 1, j).join('');
        out += run ? '_{' + textWrap(run) + '}' : '\\_';
        i = j;
        continue;
      }
      if ((ch === '^' || ch === '_') && GREEK[chars[i + 1]]) { // e^μ, σ_κ
        out += ch + '{' + GREEK[chars[i + 1]] + '}';
        i += 2;
        continue;
      }
      if (ch === '^') {
        let j = i + 1;
        if (chars[j] === '(') {
          const k = matchParen(chars, j);
          if (k > 0) { out += '^{' + convert(chars.slice(j + 1, k)) + '}'; i = k + 1; continue; }
        }
        while (j < chars.length && /[A-Za-z0-9.\-]/.test(chars[j])) j++;
        out += '^{' + chars.slice(i + 1, j).join('') + '}';
        i = j;
        continue;
      }
      if (SUP[ch]) {
        let run = '';
        while (i < chars.length && SUP[chars[i]]) run += SUP[chars[i++]];
        out += '^{' + run + '}';
        continue;
      }
      if (SUB[ch]) {
        let run = '';
        while (i < chars.length && (SUB[chars[i]] || (/[.,]/.test(chars[i]) && SUB[chars[i + 1]]))) run += SUB[chars[i]] || chars[i], i++;
        out += '_{' + run + '}';
        continue;
      }
      if (BARRED[ch]) { out += '\\bar{' + BARRED[ch] + '}'; i++; continue; }
      if (ch === '√') {
        let j = i + 1;
        if (chars[j] === '(' || chars[j] === '[') {
          const k = matchParen(chars, j);
          if (k > 0) { out += '\\sqrt{' + convert(chars.slice(j + 1, k)) + '}'; i = k + 1; continue; }
        }
        let k = j;
        if (/[0-9.]/.test(chars[k] || '')) while (k < chars.length && /[0-9.]/.test(chars[k])) k++;
        else if (chars[k] && (/[A-Za-z]/.test(chars[k]) || GREEK[chars[k]])) k++;
        out += '\\sqrt{' + convert(chars.slice(j, k)) + '}';
        i = k;
        continue;
      }
      if (GREEK[ch]) { out += GREEK[ch] + ' '; i++; continue; }
      if (SYM[ch] !== undefined) { out += SYM[ch]; i++; continue; }
      if (ch === '*') { out += '^{*}'; i++; continue; }
      if (/[()[\]=+\-/<>|,;:!?']/.test(ch)) { out += ch; i++; continue; }
      out += '\\text{' + ch + '}';
      i++;
    }
    return out;
  }

  /** Convert a Unicode formula to LaTeX; returns null for prose that should stay plain text. */
  NC.toTex = function (s) {
    if (s === undefined || s === null || s === '') return null;
    s = String(s);
    if (isProse(s)) return null;
    return convert(Array.from(s));
  };

  /** Render as KaTeX HTML when available; otherwise escaped plain text. */
  NC.renderMath = function (plain, explicitTex) {
    const tex = explicitTex || NC.toTex(plain);
    if (tex && global.katex) {
      try {
        return { html: global.katex.renderToString(tex, { throwOnError: true, strict: 'ignore', output: 'html' }), tex: tex };
      } catch (e) { /* fall through to plain text */ }
    }
    return { html: NC.esc(plain), tex: null };
  };
})(typeof window !== 'undefined' ? window : globalThis);
