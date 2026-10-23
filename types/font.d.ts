export interface FontGlyph {
  codepoint: number;
  glyphId: number | null;
  missing: boolean;
  advanceWidth?: number;
  path?: string;
  bbox?: [number, number, number, number] | null;
}

export interface FontGlyphs {
  unitsPerEm: number;
  coordinateSystem: 'font-y-up';
  glyphs: FontGlyph[];
}

/** Optional Rust outline worker; build it with `npm run build:native`. */
export declare class NativeFont {
  constructor(fontPath: string, options?: { binary?: string; timeout?: number });
  request(op: string, data?: Record<string, unknown>): Promise<unknown>;
  metadata(): Promise<unknown>;
  glyphs(codepoints: number[], includePaths?: boolean): Promise<unknown>;
  variants(codepoints: number[]): Promise<unknown>;
  close(): void;
}

/** JavaScript outline extraction (requires the optional `fontkit` peer). */
export declare function openJavaScriptFont(fontPath: string): {
  unitsPerEm: number;
  glyphs(codepoints: number[]): FontGlyphs;
};
