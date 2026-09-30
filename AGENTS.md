# Qutex

Public JaeWangL/qutex repository. Base new branches on origin/main,
using codex/ names. Never store credentials, private source documents, or
proprietary Hancom fonts in Git. Local references and measurements go under
ignored artifacts/. Keep retained vendor/temml source unchanged; UPSTREAM.json records distribution exclusions.

Maintain license and source manifests for every distributed font. Qutex Math
0.1 was a renamed Latin Modern baseline; 0.2 changes only radical clearance
constants using same-formula, same-size original Hancom output. Glyph shapes
are not a Hancom equivalent. Expand calibration claims only with independent
measurements and visual comparison. Do not use stroke overlays to fake weight.

Keep Temml as the syntax source for both MathML and SVG. Unsupported SVG
features must produce a useful error, not quietly disappear. Verify physical
size, baseline, glyph coverage and standalone SVG behavior. Native optimization
must be optional and measured against the JavaScript fallback.

Use npm run build and the focused Qutex contract tests after relevant edits.
Do not run the imported upstream test suite automatically or modify its goldens.
Document limitations and measurements; do not mistake a build for visual proof.
