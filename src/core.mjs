import temml from '../vendor/temml/dist/temml.mjs';
import { localeMacros, resolveLocale } from './locales.mjs';

export const version = '0.3.0';
export const upstreamVersion = '0.13.5';
export const MAX_TEX_LENGTH = 16384;
const MAX_EXPAND = 1000;
const MAX_SIZE = Object.freeze([100, 1000]);

export function optionsFor(latex, options = {}) {
  if (typeof latex !== 'string') throw new TypeError('latex must be a string');
  if (latex.length > MAX_TEX_LENGTH) throw new RangeError('latex exceeds 16384 characters');
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }
  for (const key of ['displayMode', 'annotate', 'leqno', 'colorIsTextColor']) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new TypeError(`${key} must be a boolean`);
  }
  if (options.wrap !== undefined && !['none', 'tex', '='].includes(options.wrap)) throw new TypeError('Invalid wrap mode');
  if (options.macros !== undefined && (!options.macros || typeof options.macros !== 'object' || Array.isArray(options.macros))) {
    throw new TypeError('macros must be an object');
  }
  // Callers may only tighten the expansion and size ceilings.
  const maxExpand = options.maxExpand ?? MAX_EXPAND;
  if (!Number.isInteger(maxExpand) || maxExpand < 1 || maxExpand > MAX_EXPAND) {
    throw new RangeError(`maxExpand must be an integer from 1 to ${MAX_EXPAND}`);
  }
  const maxSize = options.maxSize ?? MAX_SIZE;
  if (!Array.isArray(maxSize) || maxSize.length !== 2
    || maxSize.some((value, index) => typeof value !== 'number' || !(value > 0) || value > MAX_SIZE[index])) {
    throw new RangeError(`maxSize must be two positive limits up to [${MAX_SIZE.join(', ')}]`);
  }
  // Country notation first; the caller's own macros may still override it.
  const macros = localeMacros(resolveLocale(options.locale));
  const userMacros = {};
  for (const [name, value] of Object.entries(options.macros ?? {})) {
    if (typeof value !== 'string' || name.length > 128 || value.length > 4096) {
      throw new TypeError('macros must contain bounded string expansions');
    }
    Object.defineProperty(userMacros, name, { value, enumerable: true, writable: true, configurable: true });
  }
  if (Object.keys(userMacros).length > 128) throw new RangeError('Too many macros');
  for (const [name, value] of Object.entries(userMacros)) {
    Object.defineProperty(macros, name, { value, enumerable: true, writable: true, configurable: true });
  }
  return {
    displayMode: options.displayMode ?? false,
    annotate: options.annotate ?? false,
    leqno: options.leqno ?? false,
    wrap: options.wrap ?? 'none',
    colorIsTextColor: options.colorIsTextColor ?? false,
    macros,
    throwOnError: true,
    trust: false,
    maxExpand,
    maxSize: [...maxSize],
  };
}

/** LaTeX → accessible MathML, no DOM/browser needed, no cross-call macro state. */
export function renderToString(latex, options = {}) {
  const output = temml.renderToString(latex, optionsFor(latex, options));
  // Temml's trust:false renders disallowed HTML/URL commands as errors. Do not
  // silently export these as successful formulas in the service API.
  if (/class="[^"]*\b(?:temml-error|tml-error)\b/.test(output)) {
    throw new Error('Formula contains an unsupported or untrusted command');
  }
  return output;
}

export function render(latex, element, options = {}) {
  return temml.render(latex, element, optionsFor(latex, options));
}

// Full upstream API remains available for advanced trusted, application-local use.
export { temml };
export { DEFAULT_LOCALE, locales, resolveLocale, localeMacros, describeLocale } from './locales.mjs';
