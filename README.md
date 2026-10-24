# Qutex

LaTeX → MathML and standalone SVG for educational publishing.

Qutex uses the Temml parser and a Latin Modern Math derivative with measured
radical clearance. The browser and default SVG renderer consume the same actual
OpenType math font. SVG output uses vector paths and preserves physical units,
so desktop publishing applications can place it without installing that font.

## Install

```sh
npm install @jaewangl/qutex
```

Node.js 22.13+ is required. MathML rendering (Node or browser) has no runtime
dependencies. Server-side SVG uses optional peer dependencies, installed only
when you need them:

```sh
# Default native SVG (an installed Chrome/Chromium is detected; or set QUTEX_CHROME_PATH)
npm install fontkit playwright-core @napi-rs/canvas jsdom pdfjs-dist svgcanvas
# backend: 'mathjax'
npm install fontkit @mathjax/src @mathjax/mathjax-modern-font
```

Tested peer versions are pinned in `devDependencies`. No browser is downloaded
by the package's install scripts (`npx playwright-core install chromium` if you
have none). Each GitHub release also attaches the npm-format tarball.

## Country notation (`locale`)

School mathematics is written differently by country. Every render function
takes `locale` (default `"ko"`), applied as Temml macros before your own
`macros`, which can still override any rule:

| Input | `ko` (default) | `ja` | `tex` (upstream Temml) |
| --- | --- | --- | --- |
| `\binom{n}{k}`, `\dbinom`, `\tbinom` | ₙCₖ (left subscript, upright C) | ₙCₖ | (n k) stacked in parentheses |
| `\geq` `\ge` `≥` | ≥ | ≧ | ≥ |
| `\geqq` `≧` | ≥ | ≧ | ≧ |
| `\geqslant` `⩾` | ≥ | ≧ | ⩾ |
| `\leq` `\le` `≤` / `\leqq` `≦` / `\leqslant` `⩽` | ≤ | ≦ | ≤ / ≦ / ⩽ (unchanged) |

```js
import { renderToString } from '@jaewangl/qutex';

renderToString(String.raw`\binom{5}{2}`);                    // ₅C₂ (ko)
renderToString(String.raw`a\geq b`, { locale: 'ja' });       // a ≧ b
renderToString(String.raw`\binom{5}{2}`, { locale: 'tex' }); // (5 2)
renderToString(String.raw`\binom{n}{k}`, { locale: 'ko-KR' }); // BCP 47 tags resolve by language
```

- ₙCₖ is rendered as `{}_{n}\mathrm{C}_{k}`. A power is written as in
  textbooks: `\binom{n}{k}^2` → (ₙCₖ)².
- Symbol rules also apply to Unicode input and inside `\text{}`.
- A parenthesised binomial is still available as `\genfrac(){0pt}{}{n}{k}` or
  with `locale: 'tex'`. Infix `{n \choose k}` is handled inside Temml's parser
  and is not remapped.
- Unsupported locales throw a `RangeError`; `locales` lists the supported names,
  `resolveLocale()` normalizes a tag and `localeMacros()` returns a locale's rules.
- A new locale is one entry in `src/locales.mjs` plus tests.

`annotate: true` keeps the original TeX source in the MathML annotation. The
`maxExpand` (≤ 1000) and `maxSize` (≤ [100, 1000] em) options can only tighten
Qutex's limits.

## Node.js

```js
import { renderToString, renderToSVG, closeRenderer } from '@jaewangl/qutex';

const latex = String.raw`x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}`;
const mathml = renderToString(latex, { displayMode: true });
const result = await renderToSVG(latex, {
  displayMode: true,
  fontSize: 11 * 96 / 72, // 11pt → CSS pixels
  color: '#000000',
});
console.log(result.svg);
await closeRenderer(); // close when a one-shot job is finished
```

`result.width`, `height` and top-to-`baseline` use CSS pixels. `contentBounds`
locates the logical formula inside its transparent margin and glyph overhang.
`fontSha256` identifies the actual font bytes; `layoutScale` reports internal
vector-layout precision. The renderer never fits a formula to a target box.
Keep the renderer alive between requests for reuse and close it on shutdown.

MathML is fast and synchronous. SVG uses bounded Chromium MathML layout → PDF
vectors → standalone SVG paths, with no screenshot or external-font fallback.
The explicit `backend: 'mathjax'` alternative retains the old faster adapter,
but it does **not** use the edited Qutex font. [SVG contract](docs/svg.md)

## Browser and CDN

The immutable GitHub-tagged jsDelivr distribution is live:

```html
<!doctype html>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/JaeWangL/qutex@cdn-v0.2.0/qutex.css">
<script src="https://cdn.jsdelivr.net/gh/JaeWangL/qutex@cdn-v0.2.0/qutex.min.js"></script>
<div id="formula"></div>
<script>
  qutex.render('x^2+y^2=r^2', document.getElementById('formula'));
</script>
```

The ESM build is `qutex.mjs` on that CDN tag (`dist/qutex.mjs` in the package).
Keep CSS and its relative font URLs together when self-hosting. `manifest.json`
records asset sizes and SHA-384 integrity. The npm
bases are `https://cdn.jsdelivr.net/npm/@jaewangl/qutex@<version>/dist/` and
`https://unpkg.com/@jaewangl/qutex@<version>/dist/`.

With a bundler (`@jaewangl/qutex` resolves to the browser entry under the `browser`
condition; `@jaewangl/qutex/browser` is explicit):

```js
import { render, renderToString } from '@jaewangl/qutex/browser';
import '@jaewangl/qutex/qutex.css';
render(String.raw`\sqrt{x}`, document.getElementById('formula'), { locale: 'ko' });
```

`qutex.css` includes Noto Serif KR (5.9 MB) for Korean text inside formulas.
`@jaewangl/qutex/qutex-lite.css` is identical except that this face is omitted, so text
inside math uses installed fonts and the only web fonts are Qutex Math (388 KB)
and Qutex Script (10 KB). Browsers fetch a face only when a formula needs it.
TypeScript declarations are included.

For Markdown, [markdown-it-qutex](https://github.com/JaeWangL/markdown-it-qutex)
renders `$…$` and `$$…$$` with Qutex and passes `locale` through.

## CLI and local HTTP API

```sh
printf '%s' '\sqrt{x}' | npx qutex mathml
printf '%s' '\sqrt{x}' | npx qutex svg equation.svg
```

JSON input carries options, including `locale`:
`printf '%s' '{"latex":"\\binom{5}{2}","options":{"locale":"ja"}}' | npx qutex mathml`.

From a source checkout, `npm start` serves `127.0.0.1:8774`.
`POST /v1/render` accepts
`{"latex":"x^2","format":"svg","options":{"fontSize":16}}`.
It has a bounded worker queue, input limits, timeouts, result caching and process
cleanup. Put authentication and quotas in front before exposing it publicly.
Fonts are cached for a process lifetime; restart after replacing font assets.

## Font and output scope

- Qutex Math 0.2 changes two radical-clearance constants, preserving all 4,802
  Latin Modern glyph outlines, advances and other MATH data.
- Qutex Script comes from independently licensed KaTeX Script; normal Korean
  uses Noto Serif KR at weight 400.
- Same-size numeric radicals were compared against original Hancom PDF output.
  The detailed methods and remaining differences are in the
  [font investigation](docs/radical-font-investigation.md).
- **This is not a Hancom font or a claim of complete Hancom visual equivalence.**
  Hook shape, glyph shapes and browser pixel rounding can still differ.
- Unsupported features fail explicitly rather than silently becoming a raster
  image or missing glyph. Styled CJK, document-width equation tags and certain
  mask-based overlays are currently unsupported in standalone SVG.

Temml syntax coverage and SVG export coverage are different. Review
[validation](docs/validation.md) and [fonts](docs/fonts.md) before integrating.

## Source development

```sh
git clone https://github.com/JaeWangL/qutex.git
cd qutex
npm ci --ignore-scripts
npx playwright-core install chromium
npm run build
npm test
```

The focused Qutex tests do not run the imported upstream test suite. The source
checkout includes the font builders, original licensed font sources and an
optional Rust glyph-outline worker (`npm run build:native`). Rust is not needed
for default MathML or SVG output. [Rust protocol](docs/rust.md)

`UPSTREAM.json` pins the Temml source and records excluded demo/helper-font
assets. Retained upstream source files are unchanged. Private documents,
reference images, local reports and environment files are not distributed.

## License

Qutex code is released under the [MIT License](LICENSE). Temml, mathematical/text fonts and other
components retain their separate licenses and original copyright notices;
see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). No proprietary Hancom font
is included.
