# Qutex 0.2.0 browser assets

Immutable CDN release generated from [Qutex source `afc1f2a8ade4633bb026356f5390bd27db4b9fa4`](https://github.com/JaeWangL/qutex/tree/afc1f2a8ade4633bb026356f5390bd27db4b9fa4).
This branch contains browser ESM/IIFE, CSS, fonts and distribution licenses.
Server-side SVG generation is provided by the npm package and source repository.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/JaeWangL/qutex@cdn-v0.2.0/qutex.css">
<script src="https://cdn.jsdelivr.net/gh/JaeWangL/qutex@cdn-v0.2.0/qutex.min.js"></script>
<div id="formula"></div>
<script>qutex.render('x^2+y^2=r^2', document.getElementById('formula'));</script>
```

CSS resolves the sibling font files. `manifest.json` records asset sizes and SHA-384 integrity values.
Use the immutable `cdn-v0.2.0` tag; do not overwrite release tags.

Qutex code is MIT licensed. See `LICENSE`, `THIRD_PARTY_NOTICES.txt`, and `licenses/` for the separate font licenses.
Qutex Math derives from Latin Modern Math 1.959 under GUST/LPPL. Original source, derivative source, font change logs,
and reproducible build scripts are available in the [source release](https://github.com/JaeWangL/qutex/tree/afc1f2a8ade4633bb026356f5390bd27db4b9fa4/fonts)
and [font build tools](https://github.com/JaeWangL/qutex/tree/afc1f2a8ade4633bb026356f5390bd27db4b9fa4/tools).
The original complete Latin Modern Math archive is [available here](https://github.com/JaeWangL/qutex/raw/afc1f2a8ade4633bb026356f5390bd27db4b9fa4/fonts/upstream/latin-modern-math/latinmodern-math-1959.zip).
No proprietary Hancom font is redistributed, and whole-font equivalence is not claimed.
