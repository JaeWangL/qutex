# Qutex Script 0.1.0

An independent script-capital supplement derived from the official
`KaTeX_Script-Regular.ttf`, distributed under SIL Open Font License 1.1. The
upstream font's reserved family name is replaced by **Qutex Script**.

`tools/build-script-font.py` maps the original A–Z script outlines to the 26
standard Unicode script-capital codepoints. It preserves every used outline and
advance width. ASCII A–Z are intentionally not mapped so this supplementary
font cannot turn normal Latin text into script letters. Space and no-break space
are retained. The seven prime codepoints U+2032–U+2037 and U+2057 are supplied by
Qutex Math; they are not copied into this font.

No font bytes or outlines from `vendor/temml/dist/Temml.woff2` are used. That
preserved upstream binary has an embedded noncommercial FontCreator-home-edition
notice, so it is excluded from Qutex release assets. We examined its character
mapping only to identify the behavior required by the preserved Temml source.

The original KaTeX font, embedded copyright/license notice and full OFL text are
under `upstream/katex-script/`. `SOURCE.json` pins the official Git commit and
hash; `script-build.json` records the derived mapping, checks and output hash.
This derivative, its build script and this documentation remain under OFL 1.1.
Maintainer: BNZinc.

Build after `tools/build-font.py` has generated Qutex Math:

```sh
.venv-fonts/bin/python tools/build-script-font.py
```

The script uses the same pinned `fonts/build-requirements.txt` environment.
It verifies every mapped contour/advance, all 26 script capitals and Qutex
Math's prime coverage, then writes `QutexScript-Regular.woff2`.
