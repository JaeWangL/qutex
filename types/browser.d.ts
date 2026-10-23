/** Supported country notation. `tex` keeps upstream Temml/LaTeX notation. */
export type QutexLocale = 'ko' | 'ja' | 'tex';
/** A supported locale or a BCP 47 tag whose language is supported (`ko-KR`, `ja_JP`). */
export type QutexLocaleInput = QutexLocale | (string & {});

/** Safe, per-call MathML options. Macros never carry across calls. */
export interface RenderOptions {
  displayMode?: boolean;
  annotate?: boolean;
  leqno?: boolean;
  colorIsTextColor?: boolean;
  wrap?: 'none' | 'tex' | '=';
  /** Country notation, default `"ko"`. Unsupported locales throw a RangeError. */
  locale?: QutexLocaleInput;
  /** Applied after the locale's macros, so they can override them. At most 128. */
  macros?: Record<string, string>;
  /** Integer from 1 to 1000 (the default and ceiling). */
  maxExpand?: number;
  /** Positive [width, height] limits in em, at most (and by default) [100, 1000]. */
  maxSize?: [number, number];
}
export type Options = RenderOptions;

export interface LocaleDescription {
  locale: QutexLocale;
  description: string;
  macros: Record<string, string>;
}

export declare const version: string;
export declare const upstreamVersion: string;
export declare const DEFAULT_LOCALE: 'ko';
export declare const locales: readonly QutexLocale[];
/** Canonical locale for a supported name or BCP 47 tag; throws for anything else. */
export declare function resolveLocale(locale?: QutexLocaleInput): QutexLocale;
/** A fresh copy of the macros a locale applies. */
export declare function localeMacros(locale?: QutexLocaleInput): Record<string, string>;
export declare function describeLocale(locale?: QutexLocaleInput): LocaleDescription;

/** LaTeX → MathML markup. Throws on parse errors and untrusted commands. */
export declare function renderToString(latex: string, options?: RenderOptions): string;
export declare function render(latex: string, element: Element, options?: RenderOptions): void;

/** Full upstream Temml for trusted, application-local use; bypasses Qutex's safety options. */
export interface UpstreamTemml {
  version: string;
  render(latex: string, element: Element, options?: Record<string, unknown>): void;
  renderToString(latex: string, options?: Record<string, unknown>): string;
  renderMathInElement(element: Element, options?: Record<string, unknown>): void;
  postProcess(element: Element): void;
  definePreamble(latex: string, options?: Record<string, unknown>): unknown;
  ParseError: new (message: string, token?: unknown) => Error;
}
export declare const temml: UpstreamTemml;

declare const qutex: {
  render: typeof render;
  renderToString: typeof renderToString;
  version: typeof version;
  upstreamVersion: typeof upstreamVersion;
  temml: typeof temml;
  DEFAULT_LOCALE: typeof DEFAULT_LOCALE;
  locales: typeof locales;
  resolveLocale: typeof resolveLocale;
  localeMacros: typeof localeMacros;
  describeLocale: typeof describeLocale;
};
export default qutex;
