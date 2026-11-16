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
    '≠': '\\ne ', '−': '-', '±': '\\pm ', '∝': '\\propto ', '∞': '\\infty ', '…': '\\ldots ', '°': '{}^{\\circ}', '≳': '\\gtrsim ',
    '≲': '\\lesssim ', '′': "'", '%': '\\%', '#': '\\#', '&': '\\&', '~': '\\sim ', '{': '\\{', '}': '\\}', '\\': '\\backslash ',
    '∑': '\\sum ', '$': '\\$', '"': "''", '–': '\\text{–}'
  };
  const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };
  const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ₑ': 'e', 'ₕ': 'h', 'ᵣ': 'r', 'ₐ': 'a', 'ₒ': 'o', 'ₓ': 'x', 'ₘ': 'm', 'ₙ': 'n', 'ₚ': 'p', 'ₛ': 's', 'ₜ': 't', 'ᵢ': 'i', 'ⱼ': 'j', 'ₖ': 'k', '₋': '-', '₊': '+' };
  const BARRED = { 'ȳ': 'y', 'ā': 'a', 'ē': 'e', 'ī': 'i', 'ō': 'o', 'ū': 'u', 'Ā': 'A', 'Ē': 'E', 'Ō': 'O' };
  const CLOSE = { '(': ')', '[': ']' };
  const FUNCS = { sin: '\\sin', cos: '\\cos', tan: '\\tan', ln: '\\ln', log: '\\log', exp: '\\exp', arctan: '\\arctan', max: '\\max', min: '\\min', mod: '\\bmod' };
  const SUBRUN = /[A-Za-z0-9,.–'′\-]/;
  const FRAC = { '½': ['1', '2'], '¼': ['1', '4'], '¾': ['3', '4'], '⅓': ['1', '3'], '⅔': ['2', '3'] };
  /** Characters allowed inside a unit expression such as "J·s", "m²/(V·s)", "g/cm³", "°C". */
  const UNITCH = /[A-Za-zµÅ°%·\/()^0-9.⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]/;

  /** If chars[j…] starts a physical unit after a number, return the end index of the unit run, else -1. */
  function unitRunEnd(chars, j) {
    const first = chars[j];
    if (!first || !/[A-Za-zµÅ°%]/.test(first)) return -1;
    let k = j, depth = 0;
    while (k < chars.length && UNITCH.test(chars[k])) {
      if (chars[k] === '(') depth++;
      if (chars[k] === ')') { if (depth === 0) break; depth--; }
      k++;
    }
    if (depth !== 0) return -1;
    const run = chars.slice(j, k).join('');
    const firstWord = (run.match(/^[A-Za-z]+/) || [''])[0];
    if (FUNCS[firstWord]) return -1; // "2 sin θ" is not a unit
    if (/^[A-Za-z]$/.test(run) && !/^[JKCFVWNsmgLMTAHΩ]$/.test(run)) return -1; // lone letter that is not a common SI unit symbol
    return k;
  }

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

  function convert(chars, unitMode) {
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
        const prevNum = i > 0 && (/[0-9]/.test(chars[i - 1]) || SUP[chars[i - 1]] !== undefined);
        const uEnd = j - i === 1 && prevNum ? unitRunEnd(chars, j) : -1;
        if (uEnd > 0) { // "16760 nm³", "1.055×10⁻³⁴ J·s": units upright, thin space
          out += '\\, ' + convert(chars.slice(j, uEnd), true);
          lastWord = false;
          i = uEnd;
          continue;
        }
        if (j - i >= 2) out += '\\quad ';
        else if (lastWord && next && /[A-Za-z]/.test(next)) out += '\\ ';
        else if (prevNum && next && (/[A-Za-zÅ%µ]/.test(next) || GREEK[next])) out += '\\, ';
        else out += ' ';
        i = j;
        continue;
      }
      if (unitMode && ch === '°') { out += '{}^{\\circ}'; i++; continue; }
      // letter runs: functions, single-letter variables, or upright text
      if (/[A-Za-z]/.test(ch)) {
        let j = i;
        while (j < chars.length && /[A-Za-z]/.test(chars[j])) j++;
        const w = chars.slice(i, j).join('');
        if (unitMode) { out += '\\mathrm{' + w + '}'; lastWord = false; i = j; continue; }
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
      if (FRAC[ch]) { out += '\\tfrac{' + FRAC[ch][0] + '}{' + FRAC[ch][1] + '}'; i++; continue; }
      if (ch === '^' && FRAC[chars[i + 1]]) { // x^½
        out += '^{' + FRAC[chars[i + 1]][0] + '/' + FRAC[chars[i + 1]][1] + '}';
        i += 2;
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

  /**
   * Split a sentence into text and maths tokens: [{text: '...'} | {math: 'LaTeX', src: '...'}].
   * Words (with punctuation) stay as text so the sentence can wrap; anything with digits,
   * Greek letters, sub/superscripts, operators or single-letter symbols becomes inline maths.
   */
  const WORD = /^[([]?[A-Za-z][a-z]*(?:[-'’][A-Za-z]+)*[)\]]?[,.;:!?]?[)\]]?$/;
  NC.proseTokens = function (s) {
    return String(s).split(/(\s+)/).filter(function (t) { return t !== ''; }).map(function (tok) {
      if (/^\s+$/.test(tok)) return { text: ' ' };
      const core = tok.replace(/^[([]/, '').replace(/[)\],.;:!?]+$/, '');
      const isWord = WORD.test(tok) && (core.length > 1 || core === 'a') && !FUNCS[core];
      return isWord ? { text: tok } : { math: convert(Array.from(tok)), src: tok };
    });
  };

  /** Render as KaTeX HTML when available; otherwise escaped plain text. Sentences render as text with inline maths. */
  NC.renderMath = function (plain, explicitTex) {
    const tex = explicitTex || NC.toTex(plain);
    if (tex && global.katex) {
      try {
        return { html: global.katex.renderToString(tex, { throwOnError: true, strict: 'ignore', output: 'htmlAndMathml' }), tex: tex };
      } catch (e) { /* fall through */ }
    }
    if (!explicitTex && plain && global.katex && isProse(String(plain))) {
      const html = NC.proseTokens(plain).map(function (t) {
        if (t.text !== undefined) return NC.esc(t.text);
        try { return global.katex.renderToString(t.math, { throwOnError: true, strict: 'ignore', output: 'htmlAndMathml' }); }
        catch (e) { return NC.esc(t.src); }
      }).join('');
      // inline style keeps this self-contained: sentences use the body font and wrap normally
      return { html: '<span class="prose-math" style="font-family: var(--font); white-space: normal; line-height: 1.7">' + html + '</span>', tex: null, prose: true };
    }
    return { html: NC.esc(plain), tex: null };
  };
})(typeof window !== 'undefined' ? window : globalThis);
