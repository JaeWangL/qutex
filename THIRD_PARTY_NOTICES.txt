# Third-party source and assets

This public distribution retains the following licenses and attributions.
Source, derivative naming and redistribution obligations still apply.

| Component | Source/version | License / location |
| --- | --- | --- |
| Temml | https://github.com/ronkok/Temml, exact commit in UPSTREAM.json | MIT; vendor/temml/LICENSE |
| Qutex Script supplemental font | Independently derived from official KaTeX Script source | SIL OFL; fonts/upstream/katex-script/ |
| Latin Modern Math → Qutex Math | GUST 1.959, pinned archive/hash | GUST / LPPL; fonts/upstream/latin-modern-math/ |
| Noto Serif KR | google/fonts pinned revision in SOURCE.json | SIL OFL 1.1; fonts/upstream/noto-serif-kr/OFL.txt |
| MathJax and Modern font data | @mathjax/src and @mathjax/mathjax-modern-font 4.1.3 | Apache-2.0 for code; font notices retained in installed packages |
| fontkit | 2.0.4 | MIT; node_modules/fontkit |
| playwright-core | 1.56.1 | Apache-2.0; node_modules/playwright-core |
| PDF.js | pdfjs-dist 6.3.289 | Apache-2.0; node_modules/pdfjs-dist |
| svgcanvas | 2.6.0 | MIT; node_modules/svgcanvas |
| jsdom | 26.1.0 | MIT; node_modules/jsdom |
| @napi-rs/canvas | 1.0.0 | MIT; node_modules/@napi-rs/canvas |
| ttf-parser | 0.25.1 | MIT OR Apache-2.0; pinned Cargo.lock |

Retained upstream Temml source, notices and tests are unchanged. UPSTREAM.json
records the omitted demo site and helper font. JavaScript dependencies are pinned in package-lock.json;
Rust dependency licenses are recorded in their Cargo metadata. Browser builds
include license comments and a licenses directory. No HancomEQN or HYhwpEQ font
file is redistributed.

The upstream snapshot includes Temml.woff2, whose embedded metadata contains a
FontCreator home-edition commercial-use restriction. We omit that helper font and the upstream demo site from this public
distribution and do **not** use it in Qutex browser assets. Qutex Script is rebuilt from independently licensed KaTeX source.
