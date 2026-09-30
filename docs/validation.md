# Qutex 0.2 — radical clearance and common-font output

The initial validation below describes 0.1 and its MathJax adapter. The 0.2
default is a different, native MathML-to-vector renderer and must be assessed
separately.

## Independent reference and scope

A related original PDF has Creator `Hwp 2018 11.0.0.2129`, Producer
`Hancom PDF 1.3.0.538` and embedded `HyhwpEQ`. It is **not the matching output
of the supplied HWP**. Its SHA-256 is
`6b8f1bc0fabdd519c647ff2c669910a411704ac7ec63fba534df7639e6893ee4`.
Only measurements and cropped local evidence were used; proprietary font data
was not distributed. The supplied HWP independently records HYhwpEQ at 11pt.

Eight simple numeral radicals in the PDF have a physical bar-to-radicand ink
gap of 2.551–2.671pt at 11.031904pt. Font MATH constants are not these physical
gaps: the layout engine, glyph variant and pixel rounding also affect them.
Only sqrt(3) and sqrt(7) selected the profile; sqrt(2), sqrt(5), sqrt(10),
sqrt(11), sqrt(30) and sqrt(34) checked the frozen choice. The final inline
native SVG gap initially differed from the reference by at most 0.267pt on
those six held-out cases. The final high-precision vector path reduces that
maximum to 0.151pt without further font changes. No case-specific rendering
branches were added.

Qutex Math 0.2 changes RadicalVerticalGap from 50 to 250 and
RadicalDisplayStyleVerticalGap from 148 to 250 per 1,000 font units. Display
clearance is a consistency policy, not independently calibrated display math.
All 4,802 outlines, advances, Unicode mappings and other MATH data remain
unchanged. The build tool checks the complete MATH table against the original
with exactly those two edits. [Full font investigation](radical-font-investigation.md)

## Output and remaining differences

Both browser MathML and default SVG now use the actual Qutex font. Alternate
font-file probes changed SVG paths and dimensions, establishing that the font
is consumed rather than merely named in metadata. SVG includes its actual
font-byte hash. The previous MathJax adapter remains explicit opt-in.

The local comparison shows original Hancom crops, original-Latin-Modern output
and Qutex 0.2 at the same physical size. Radicands no longer hug the overbar.
The hook shape and some glyph shapes still differ; we did not trace proprietary
font outlines. Direct small-size Chromium painting rounds a nominal ~0.44pt bar
to ~0.75pt. The final SVG path uses bounded high-precision MathML layout and
normalizes the vectors to their requested physical size: the eight references
use scale 32, producing 0.445312pt bars versus the Hancom reference 0.441707pt.
Browser MathML painting at normal screen resolution still differs from this
vector export. This is **not a Hancom-equivalent font release**. Broader font-shape matching
requires additional work rather than an assertion based on the font name.

The renderer also includes actual vector ink overhang when computing output
bounds. Large script letters and accents are inspected separately from the
MathML advance box so that expanding the viewport does not scale the glyphs.

Regenerate local visual evidence with `npm run specimen` and
`node tools/radical-report.mjs` (the latter requires the ignored local reference
measurements). Reference images, private documents and generated reports are
not Git or CDN assets. The generic specimen covers both successful output and
explicit failures for styled CJK and document-width tags.

## Current performance observation

On macOS arm64 / Node v26.4.0, one 18-category corpus run produced 16 SVGs;
the two unsupported inputs failed explicitly. Native cold start was about
2.20s; subsequent SVGs took 51–86ms. These include actual browser layout and
vector conversion, not a static font-data renderer. Existing request caching
and process reuse avoid repeating work. These are local observations, not an
SLA. The legacy adapter's faster 0.1 timings below do not describe 0.2 default.

## Final verification

- Product browser/CDN build passed; only the preserved upstream export-order
  warnings were emitted.
- 28 focused contracts passed, zero skipped. These cover both renderers, native
  physical units and baseline, ink overhang, SVG XML, isolated colors, explicit
  unsupported output, HTTP cache behavior and stalled/normal browser cleanup.
- All 40 images in the local original/before/after report loaded. The final
  numeric and complex-radical screenshots were directly inspected. The separate
  specimen renders 19 cases and explicitly rejects styled CJK and document tags.
- The running local HTTP API reports version 0.2.0, layoutScale 32 for the
  11pt probe, the exact current WOFF2 hash and a repeated-request cache hit.
- Runtime dependency audit reported zero known vulnerabilities. No rhwp or
  imported Temml test suite was run; Windows cleanup remains unverified.

# Initial validation — 0.1, 2026-09-30

This is a functional foundation, not a Hancom visual-equivalence release.

## Verified behavior

- Entire vendor/temml snapshot matched upstream commit
  `9784bd5a7d615fb23fd3ae54dba1a0b0e376296c` in a recursive comparison.
- `npm run build` produced browser ESM/IIFE, CSS, versioned font assets, notices,
  and SHA-384 manifest. Upstream package.json export-order warnings are retained;
  no Qutex build error occurred.
- `npm test`: 15 focused contracts passed, including independent XML parsing,
  physical dimension scaling, macro isolation, concurrent requests, colors,
  standalone table rules, distinct script font, Korean outlines and fail-loud
  unsupported input. Imported Temml's full suite was not run.
- Rust: six tests, formatting, Clippy with denied warnings and release build
  passed. Independent fontTools comparison matched all 2,045 Unicode→glyph IDs,
  advances and sidebearings, plus selected MATH constants and stretch variants.
- Both Qutex Math files and full Korean fallback reproduced byte-for-byte with
  the pinned Python toolchain. Script font also reproduced byte-for-byte.
- Chrome loaded Qutex Math, Qutex Script and Qutex Korean in the specimen. All
  16 generated standalone SVGs loaded as images, including the inequality-label
  case whose XML serialization was fixed. Saved PNGs were visually inspected.

## Representative corpus

`tools/corpus.mjs` contains 18 generic categories. SVG generated 16; styled Korean
and document-width equation tags returned explicit errors. Normal Korean is
covered separately by the contract test. This is representative coverage, not
an exhaustive Temml command-support score.

The 11pt browser/SVG comparison shows visible differences in delimiters, spacing
and rules. The same nominal font size does not imply the same layout engine.
Artifacts remain local under `artifacts/specimen/` and can be regenerated.

## Performance observation

One local run: macOS arm64, Node v26.4.0. Values are illustrative, not service SLAs.

- MathML: about 0.05–2.43ms across the corpus.
- First SVG with font initialization: 67.31ms.
- Following supported SVG cases: about 0.84–4.98ms each.
- 76 glyphs × 100 batches: fontkit outline extraction/serialization 68.83ms;
  Rust cached outlines including JSONL round trips 28.99ms; cached JavaScript
  rows serialized in-process 1.58ms.

Rust was faster than repeatedly extracting/serializing outlines, but slower than
JavaScript with an outline cache on this small repeated workload. Therefore Rust
is optional and is **not** inserted into the default SVG path. These measurements
do not prove that a Rust math renderer is faster; no second math parser was built.
`npm run benchmark` records the environment and raw local result.

## HWP reference limits

The supplied HWP contains 5,413 EQEDIT records, all requesting HYhwpEQ, 11pt,
black. Saved equation baselines differ (raw values 10–93), so no single fixed
baseline correction was applied. Its embedded first-page preview is 723×1024;
no matching original PDF was found in Downloads.

Requested font metadata does not establish the installed font's outlines or
permission to redistribute them. The reference HWP, metadata and preview are
excluded from Git. No source-document content is included in the generic corpus.
Precise Hancom glyph/stroke calibration and a shared edited-OTF SVG backend
remain unimplemented; the repository and API explicitly state these limits.


## 0.2.1 browser shutdown

The native renderer now distinguishes the owned browser's `exit` event from the
later stdio `close` event. An inherited stderr pipe no longer extends the
lifetime of the saved process ID. The pool receives its unregister message at
process exit. Group-signal `EPERM` or `ESRCH` falls back only through the live
owned `ChildProcess` handle; other failures and failure to exit after `SIGKILL`
remain errors. Signal waits and local pipe teardown are bounded.

This follows the [Node child-process event contract](https://nodejs.org/api/child_process.html#event-close),
which permits stdio to remain open after process exit. A local Darwin diagnostic
also showed that a group containing only an exited, unreaped owned child can
return `EPERM`, even though the positive PID is accessible. This explains a
possible mechanism; the exact process state of the earlier production error was
not captured.

Validation for this patch:

- `npm run build` completed. The existing upstream Temml export-condition warning
  remains; the retained vendor source is unchanged.
- `node --test test/owned-process.test.mjs test/pool-lifecycle.test.mjs test/render.test.mjs`
  passed all 15 checks, including actual native Chromium shutdown, interrupted
  startup, queue recovery, and existing SVG/HTTP contracts.
- The new owned-process tests use a real child that exits while a bounded helper
  retains stderr, plus controlled signal-error cases. They check that no signal
  targets an exited child, a live owned handle is stopped after group denial,
  spawn failure is handled, and failure to stop remains visible.
- The ignored `artifacts/owned-process-lifecycle/compare-launcher.mjs` harness ran
  the old and new launcher bodies with the same harmless real-process fixture
  and an injected group `EPERM`: before, cleanup sent `SIGTERM` after `exit` and
  failed; after, cleanup sent no late signal and completed. This does not claim
  to reproduce the original browser process's uncaptured kernel state.

No equation layout, font bytes, or renderer-quality settings changed.
