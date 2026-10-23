// School notation differs by country. A locale is only a table of Temml macro
// definitions applied before the caller's own macros, so a new locale is one
// entry in LOCALE_DEFINITIONS (plus tests). Macro bodies that replace a symbol
// are the Unicode character itself, which works in both math and \text{} mode.

// ₙCₖ: n as a left subscript of an upright C, k as its right subscript, written
// `{}_{n}\mathrm{C}_{k}`. (MathML <mmultiscripts> via \prescript was tried, but
// Chromium adds a wide gap after it when a script contains an operator, e.g. n-k.)
// The outer group keeps `\binom{n}{k}_x` from becoming a double-subscript error.
// A power is written (ₙCₖ)², as in textbooks, so `\binom{n}{k}^2` gets parentheses.
const C = '{{}_{#1}\\mathrm{C}_{#2}}';
const COMBINATION = `\\@ifnextchar^{\\left(${C}\\right)}{${C}}`;
const BINOMIALS = ['\\binom', '\\dbinom', '\\tbinom'];

const GEQ = '\u2265'; // ≥ greater-than or equal, one bar
const LEQ = '\u2264'; // ≤ one bar
const GEQQ = '\u2267'; // ≧ greater-than over equal, two bars
const LEQQ = '\u2266'; // ≦ two bars
const GEQSLANT = '\u2a7e'; // ⩾ slanted bar
const LEQSLANT = '\u2a7d'; // ⩽ slanted bar

const all = (names, body) => Object.fromEntries(names.map(name => [name, body]));

const LOCALE_DEFINITIONS = {
  // Korean school mathematics: combinations are ₙCₖ (never parenthesised) and
  // inequalities use a single horizontal bar.
  ko: {
    description: 'Korean school notation: ₙCₖ combinations, single-bar ≥ ≤',
    macros: {
      ...all(BINOMIALS, COMBINATION),
      ...all(['\\geqq', '\\geqslant', GEQQ, GEQSLANT], GEQ),
      ...all(['\\leqq', '\\leqslant', LEQQ, LEQSLANT], LEQ),
    },
  },
  // Japanese school mathematics: combinations are ₙCᵣ and inequalities always
  // use the two-bar ≧ ≦ forms.
  ja: {
    description: 'Japanese school notation: ₙCᵣ combinations, two-bar ≧ ≦',
    macros: {
      ...all(BINOMIALS, COMBINATION),
      ...all(['\\geq', '\\ge', '\\geqslant', GEQ, GEQSLANT], GEQQ),
      ...all(['\\leq', '\\le', '\\leqslant', LEQ, LEQSLANT], LEQQ),
    },
  },
  // Upstream Temml/LaTeX notation, unchanged.
  tex: {
    description: 'Upstream Temml/LaTeX notation without locale rules',
    macros: {},
  },
};

export const DEFAULT_LOCALE = 'ko';
export const locales = Object.freeze(Object.keys(LOCALE_DEFINITIONS));

/**
 * Canonical locale name for a supported name or BCP 47 tag (`ko-KR`, `ja_JP`).
 * Unknown locales throw instead of silently using another country's notation.
 */
export function resolveLocale(locale = DEFAULT_LOCALE) {
  if (typeof locale !== 'string') throw new TypeError('locale must be a string');
  const tag = locale.trim().toLowerCase().replaceAll('_', '-');
  if (Object.hasOwn(LOCALE_DEFINITIONS, tag)) return tag;
  const language = tag.split('-')[0];
  if (language !== 'tex' && Object.hasOwn(LOCALE_DEFINITIONS, language)) return language;
  throw new RangeError(`Unsupported locale "${locale}". Use one of: ${locales.join(', ')}`);
}

/** The locale's macro table as a fresh object; callers may extend or override it. */
export function localeMacros(locale = DEFAULT_LOCALE) {
  return { ...LOCALE_DEFINITIONS[resolveLocale(locale)].macros };
}

/** A description of each supported locale, for documentation and settings UIs. */
export function describeLocale(locale = DEFAULT_LOCALE) {
  const name = resolveLocale(locale);
  return { locale: name, description: LOCALE_DEFINITIONS[name].description, macros: localeMacros(name) };
}
