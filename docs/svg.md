# SVG rendering contract

`renderToSVG(latex, options)` returns standalone vector outlines, the source
MathML, `width`, `height`, top-to-`baseline`, logical `contentBounds`, actual
`fontSha256`, font/backend metadata and warnings. Dimensions use CSS pixels:
`fontSize: 16` is 12pt. The renderer does not fit or stretch a formula to a box.
The outer box includes transparent safety space and any measured glyph
overhang; use `contentBounds` when positioning the mathematical layout box.

## Default: the real Qutex font

Temml is the LaTeX parser. Chromium lays out the resulting MathML using the same
Qutex Math, Qutex Script and Noto Serif KR assets as the browser build. Its PDF
vector output is translated through PDF.js into standalone SVG paths, clips,
fills and strokes. Neither screenshots nor embedded PDF font files become the
SVG. There are no external font/image references, `<text>` fallback, raster
images, or `foreignObject` elements.

Editing Qutex's OpenType MATH constants and rebuilding the font now changes
both browser and default SVG output. `fontSha256` identifies the actual bytes
used by the server. Internal vector layout uses higher precision and normalizes
back to the requested physical size, reducing small-size rule rounding. This
does not fit the equation to a requested rectangle. Browser versions, device
scale and paint antialiasing still produce differences; shared font is not a
claim of pixel identity or Hancom equivalence.

Node >=22.13 and Chromium are required for native SVG. Set `QUTEX_CHROME_PATH`
if an installed Chrome/Chromium is not found, or run
`npx playwright-core install chromium`. Linux may need the installation's
`--with-deps` option. MathML SSR and the browser bundle do not import these
server dependencies or require a server browser.

Each renderer lazily starts a browser with two reusable pages, loads fonts
explicitly, and blocks page network requests. Pending work is bounded. A page
operation has a 10-second deadline; the HTTP worker has a 30-second deadline.
Idle browsers close after two seconds. `closeRenderer()` closes resources at
the end of a one-shot program. The launcher owns the OS process from spawn and
registers its PID before waiting for the DevTools handshake. Shutdown includes
browser startup and cleanup before force termination of an unresponsive worker;
closing workers keep their pool slot until teardown completes.

The server caches identical successful requests. Native output is slower than
the separate MathJax adapter but actually consumes the edited font. Font assets
are loaded once per process: restart workers after changing fonts. The trusted
environment variable `QUTEX_MATH_FONT_PATH` supports isolated font comparisons;
clients cannot select arbitrary server paths through render options.

## Explicit failures

Unsupported PDF drawing operations, image/raster content, soft masks, unknown
visible glyphs, excessive dimensions and oversized PDF output fail explicitly.
There is no silent screenshot fallback. `\cancelto` currently creates a soft
mask and is rejected. Document-width `\tag` needs a containing document and is
not supported by the standalone renderer.

Temml loses CJK style intent for requests such as `\textbf{한글}`; SVG rejects
these, including macro-expanded forms. Normal Korean is covered and uses
Noto Serif KR at weight 400. `\cline` is unsupported by this Temml snapshot.
Passing a representative formula does not establish exhaustive command support.

## Explicit alternative: MathJax Modern

`backend: 'mathjax'` uses Temml MathML with MathJax 4 Modern's independent
precomputed font data. It requires no browser and is faster, but **does not use
the edited Qutex Math font**. Its warning and backend metadata expose this.
Inline/display options are respected in both renderers.

The MathJax adapter translates supported CSS boxes, colors, full table rules,
aligned columns and Qutex Script into its output model. It rejects partial,
double or inconsistent table rules, ruled merged cells, unsupported row/column
spacing, CSS overlays and document-width labels. These adapter limitations do
not automatically apply to the native backend, which consumes browser layout.
`test/svg-compat.test.mjs` explicitly tests this alternative rather than silently
attributing those results to the default renderer.

## Reproduction

```sh
npm run build
npm test
npm run specimen
npm run benchmark
```

Focused native contracts check actual font identity, physical scaling, SVG XML,
colors, unsupported-output recovery and measured glyph overhang. Visual output
is inspected separately. Experimental comparisons stay under `experiments/`;
their private references and generated output are excluded from Git.
