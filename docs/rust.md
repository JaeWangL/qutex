# Optional Rust font-outline worker

`crates/qutex-font-outline` extracts original glyph outlines and OpenType MATH
data from static TTF/OTF fonts. It is an optional helper for SVG export: Temml and
the browser continue to parse and lay out mathematics. This worker does not
implement a second, incomplete TeX parser or claim to reproduce a different
application's math layout.

The process parses one font once, accepts multiple JSON-lines requests, and caches
up to 4,096 extracted glyphs. A caller can batch glyphs and keep the process alive
to amortize startup, font parsing, and outline extraction. Performance depends on
the workload and must be measured against the existing Node path; Rust alone does
not establish a speedup.

## Build and run

From the repository root:

```sh
cargo build --release --locked --manifest-path crates/Cargo.toml
crates/target/release/qutex-font-outline fonts/QutexMath-Regular.otf
```

An optional second positional argument selects a face in a TrueType collection.
Each input line produces exactly one JSON response line. `stdout` contains only
protocol output; startup errors go to `stderr` and exit with code 2. EOF shuts down
the worker. Malformed requests return an error and leave the process available.

## Protocol version 1

The optional `id` is echoed unchanged. Responses are either
`{"id":...,"ok":true,"result":...}` or
`{"id":...,"ok":false,"error":"..."}`. JSON that cannot be decoded returns
`id:null`. Unknown request properties are rejected.

```json
{"id":"font","op":"metadata"}
{"id":"unicode","op":"glyphs","codepoints":[65,120,8721,8730]}
{"id":"outline","op":"glyphs","glyphIds":[9,2367]}
{"id":"metrics","op":"glyphs","codepoints":[65,120],"includePaths":false}
{"id":"stretch","op":"variants","codepoints":[40,8730]}
```

`glyphs` and `variants` require exactly one of `codepoints` or `glyphIds`, containing
1–4,096 entries. A codepoint is an integer Unicode scalar, not a UTF-16 code unit;
in JavaScript use `[...text].map(c => c.codePointAt(0))`. Surrogates and values above
U+10FFFF are rejected. Unknown Unicode mappings return `missing:true` and
`glyphId:null`; they are never silently replaced with `.notdef`. An invalid glyph
ID rejects the request. Order and repeated glyphs are preserved.

`metadata` returns the font names, glyph count, units per em, vertical metrics,
MATH presence, and the 56 base MATH constants. MATH constants use the snake_case
names of the corresponding `ttf-parser` methods; other fields use camelCase.

Each successful `glyphs` row includes `glyphId`, `name`, `advanceWidth`,
`leftSideBearing`, `bbox`, `hasOutline`, `path`, `italicCorrection`,
`topAccentAttachment`, and `isExtendedShape`. `bbox` is
`[xMin,yMin,xMax,yMax]`. A space can have a positive advance and no outline. Missing
metrics are `null`, not invented zeroes. `includePaths:false` omits only `path`.

All coordinates, advances, and ordinary MATH values are **font design units with
positive y pointing up**. Percentage MATH constants retain their percentage units.
To use an outline in SVG at a baseline `(x,y)`, apply
`translate(x,y) scale(fontSize / unitsPerEm, -fontSize / unitsPerEm)`.
The worker preserves quadratic (`Q`) and cubic (`C`) curves; it does not flatten
them, round coordinates, stretch shapes, or position glyphs.

`variants` returns both directions' size variants and assembly recipes, including
extender flags, connector lengths, full advances, italic correction, and minimum
connector overlap. The caller chooses variants and assembles them according to
its actual layout. The worker does not select a heuristic size.

## Boundaries and verification

- Supports static TrueType and CFF outlines through
  [ttf-parser 0.25.1](https://docs.rs/ttf-parser/0.25.1/ttf_parser/).
- Variable fonts are explicitly rejected using the presence of `fvar`; instantiate
  a static font first. WOFF/WOFF2, shaping, GPOS kerning, pixel hinting, MATH device
  adjustments and automatic font fallback are outside this worker's contract.
- A request line is limited to 512 KiB. Oversized lines are consumed without
  retaining the entire line in memory; the following request can still succeed.
- The outline cache is bounded to 4,096 entries; requests above the cache capacity
  still extract supported glyphs without growing the cache.

```sh
cargo test --locked --manifest-path crates/Cargo.toml
cargo clippy --locked --manifest-path crates/Cargo.toml --all-targets -- -D warnings
# With fonts/build-requirements.txt installed in your Python environment:
python crates/qutex-font-outline/tests/verify_fonttools.py
```

Contract checks cover Unicode/glyph-ID agreement, missing characters, whitespace
advances, cache output stability, malformed requests, oversized-line recovery,
CFF MATH constants and delimiter assemblies, and variable-font rejection. These
checks establish extraction behavior, not visual equivalence to Hancom or a new
mathematical layout engine.

The optional fontTools check compares the shipped Qutex Math font using an
independent parser: every mapped Unicode scalar's glyph ID, advance, and side
bearing; three representative MATH constants; and all parenthesis/root size
variants. Its JSON receipt identifies the exact font SHA-256.
