# SVG backend experiment

The production implementation is `../../src/svg.mjs`.

- `mathjax-probe.mjs`: Temml MathML → MathJax 4 Modern SVG, nine shape/notation cases.
- `compare.mjs`: renders production SVG against native Chromium MathML using Qutex Math.
- `output/compare.png`: visual inspection artifact. Both renderers are readable, but matrix delimiter shapes, mathematical spacing and enclosure strokes differ.
- `chromium-probe.mjs`: incomplete research only, not production. Native browser PDF plus PDF.js/SVG canvas is not a validated export path and must not be advertised as one.

Measured on the current machine, not a universal benchmark: nine initial MathJax-only cases took ~85 ms in one warm Node process; production font initialization plus Korean outlines and four formulas took ~138 ms total, with ~4–7 ms warm render calls. No paid model calls.

The current SVG backend intentionally exposes its font and backend metadata. It uses MathJax Modern's precomputed Latin Modern vector data, not `QutexMath-Regular.otf`. Registering Noto Serif KR glyph outlines **before** layout ensures that fallback glyph advance widths and visible paths use the same font. A source font file cannot simply be swapped into the MathJax backend: font variant mappings, stretchy character variants and construction data also need regeneration.

Unsupported CSS-only constructs fail explicitly instead of disappearing, including `\\cancelto`, table per-cell CSS borders and padded colorboxes. Standard MathML semantic constructs (fractions, radicals, limits, arrays without borders, matrices, cases, accents, enclosure strikes) are handled by the MathJax engine. This is representative smoke coverage, not a claim that every Temml command is SVG-compatible.

Sources:

- https://docs.mathjax.org/en/v4.0/server/direct.html
- https://docs.mathjax.org/en/v4.1/output/fonts.html
- https://docs.mathjax.org/en/latest/web/convert.html

All experimental npm dependencies remain under this directory, not the product package. The production path uses only MathJax and fontkit.
