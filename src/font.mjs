import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { openSync } from 'fontkit';

/** Optional persistent Rust process; layout remains owned by the math engine. */
export class NativeFont {
  constructor(fontPath, { binary = fileURLToPath(new URL('../crates/target/release/qutex-font-outline', import.meta.url)), timeout = 10000 } = {}) {
    this.pending = new Map(); this.sequence = 0; this.timeout = timeout;
    this.child = spawn(binary, [fontPath], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.closed = false;
    const fail = error => {
      this.closed = true;
      for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
      this.pending.clear();
    };
    this.child.on('error', fail);
    this.child.stdin.on('error', fail);
    this.child.on('exit', () => fail(new Error('Native font worker exited')));
    createInterface({ input: this.child.stdout }).on('line', line => {
      let value;
      try { value = JSON.parse(line); } catch { this.child.kill(); return; }
      const request = this.pending.get(value.id);
      if (!request) return;
      this.pending.delete(value.id); clearTimeout(request.timer);
      if (value.ok) request.resolve(value.result); else request.reject(new Error(value.error));
    });
  }
  request(op, data = {}) {
    if (this.closed) return Promise.reject(new Error('Native font worker is closed'));
    if (this.pending.size >= 64) return Promise.reject(new Error('Native font worker is busy'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id); reject(new Error('Native font request timed out')); this.child.kill();
      }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ ...data, id, op }) + '\n');
    });
  }
  metadata() { return this.request('metadata'); }
  glyphs(codepoints, includePaths = true) { return this.request('glyphs', { codepoints, includePaths }); }
  variants(codepoints) { return this.request('variants', { codepoints }); }
  close() { this.child.stdin.end(); }
}

/** JavaScript baseline for outline extraction; no binary required. */
export function openJavaScriptFont(fontPath) {
  const font = openSync(fontPath);
  return {
    unitsPerEm: font.unitsPerEm,
    glyphs(codepoints) {
      if (!Array.isArray(codepoints) || !codepoints.length || codepoints.length > 4096) throw new RangeError('Expected 1–4096 Unicode scalars');
      return { unitsPerEm: font.unitsPerEm, coordinateSystem: 'font-y-up', glyphs: codepoints.map(codepoint => {
        if (!Number.isInteger(codepoint) || codepoint < 0 || codepoint > 0x10ffff || (codepoint >= 0xd800 && codepoint <= 0xdfff)) throw new RangeError('Invalid Unicode scalar');
        if (!font.hasGlyphForCodePoint(codepoint)) return { codepoint, glyphId: null, missing: true };
        const glyph = font.glyphForCodePoint(codepoint);
        const box = glyph.bbox;
        return { codepoint, glyphId: glyph.id, advanceWidth: glyph.advanceWidth, path: glyph.path.toSVG(),
          bbox: Number.isFinite(box.minX) ? [box.minX, box.minY, box.maxX, box.maxY] : null, missing: false };
      }) };
    },
  };
}
