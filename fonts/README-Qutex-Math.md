# Qutex Math 0.2.0

Derivative of **Latin Modern Math 1.959** with a measured radical-clearance
profile. `RadicalVerticalGap` changes from 50 to 250 and
`RadicalDisplayStyleVerticalGap` from 148 to 250 (1000 units/em). Inline selection
uses two numeric radicals from an independent native Hancom PDF and the actual
production SVG path bounds; display spacing follows the same minimum-clearance
policy and has not been calibrated against a native display equation.

All glyph outlines, advance metrics, kerning, other MATH constants, stretchy
variants and Unicode coverage remain unchanged. The rule is generic, with no
formula/document-specific branches. This is not a Hancom font or a claim of
whole-font equivalence to HancomEQN / HYhwpEQ. See the measured residuals and
radical-shape limitations in `docs/radical-font-investigation.md`.

Maintainer: BNZinc. Maintenance status of this derivative: maintained.
License: GUST Font License / LaTeX Project Public License 1.3c or later.
The original copyright and license notices are retained.

The upstream archive and extracted unmodified font, README, manifest and license
are under `upstream/latin-modern-math/`. `SOURCE.json` identifies exact upstream
URLs and hashes. `build.json` records generated hashes and preserved tables.

`NotoSerifKR.woff2` is a separate, losslessly repackaged Korean fallback under
SIL OFL 1.1, not part of Qutex Math or the GUST-licensed derivative. Its complete
variable TTF, license and fixed upstream commit are under `upstream/noto-serif-kr/`.
It is not subsetted; all 11,172 modern Hangul syllables are retained.

Build from the repository root:

```sh
python3 -m venv .venv-fonts
.venv-fonts/bin/pip install -r fonts/build-requirements.txt
.venv-fonts/bin/python tools/build-font.py
```

`tools/build-font.py` fails if the source hash, Unicode mapping, glyph contours,
glyph order, advance metrics, protected layout tables or any unlisted MATH value
changes. It records each allowed MATH change and before/after table hashes. It
preserves source timestamps for deterministic output. Rebuild twice with the
pinned toolchain to verify the hashes. See `docs/fonts.md` for the rationale and
the measurement plan required before optical adjustments.
