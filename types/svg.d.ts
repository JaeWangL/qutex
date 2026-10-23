import type { RenderOptions } from './browser.js';

export interface SVGOptions extends RenderOptions {
  /** `native` (default) uses Chromium and the Qutex font; `mathjax` uses MathJax Modern data. */
  backend?: 'native' | 'mathjax';
  /** CSS pixels. */
  fontSize?: number;
  color?: string;
}

export interface SVGResult {
  svg: string;
  mathml: string;
  width: number;
  height: number;
  /** Distance from the top to the baseline, CSS pixels. */
  baseline: number;
  fontFamily: string;
  fontSha256?: string;
  backend: string;
  layoutScale?: number;
  contentBounds?: { x: number; y: number; width: number; height: number };
  warnings: string[];
}

/** Node only. Requires the optional peer dependencies listed in the README. */
export declare function renderToSVG(latex: string, options?: SVGOptions): Promise<SVGResult>;
export declare function closeRenderer(): Promise<void>;
