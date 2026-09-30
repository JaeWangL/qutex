# Radical font investigation

Reproducible experiments for Qutex Math's radical clearance. The production
change and limitations are summarized in `../../docs/radical-font-investigation.md`.
No private PDF/HWP or embedded proprietary font is distributed here.

Public comparison inputs are pinned by `fonts/SOURCES.json`; their OFL licenses
are preserved. Candidate OTFs are local generated derivatives of the GUST-licensed
Latin Modern original under `../../fonts/upstream/latin-modern-math/`.

- `download_fonts.py`: verifies and downloads official STIX Two / XITS.
- `prepare.py`, `render.mjs`, `capture.mjs`, `measure_ink.py`: initial 80-case
  native Chromium comparison at 11pt.
- `reference-render.mjs`, `reference-capture.mjs`, `reference-measure-ink.py`:
  same-size generic numeric and complex radicals at 11.032088pt.
- `train.py`, `train-render.mjs`, `train-capture.mjs`, `train-measure.py`:
  initial raster-only exploration on sqrt3 / sqrt7. This exploration is not the
  final vector-based font-profile selection; raster phase changes measured gaps.
- `validate-render.mjs`, `validate-capture.mjs`, `validate-measure.py`: numeric
  holdout set and general radicals at 11/24/48pt, with no per-formula rules.
- `compare_reference_digit.py`: translation-only glyph3 comparison, requiring a
  local reference crop under ignored artifacts. It never exports font data.

Use the pinned fontTools environment from `fonts/build-requirements.txt` for font
scripts, Node22+ for generation/capture, and Pillow for diagnostic ink measurement.
Capture scripts launch their own headless Google Chrome profile under `/tmp`.
The generated PNG/HTML/JSON and candidate font binaries are intentionally ignored.
