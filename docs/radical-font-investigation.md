# Radical clearance investigation — Qutex Math 0.2.0

Qutex Math now changes two OpenType MATH constants to give radical contents more
vertical clearance. The change is font data consumed by native MathML layout, not
a CSS translation, a per-expression exception, or a change to glyph outlines.
This corrects the near-touching appearance observed in the original Latin Modern
profile. It does **not** establish that the whole font matches Hancom.

## Independent reference and cause

The supplied HWP contained 5,413 equation records with `HYhwpEQ` at 11pt. Its small
embedded preview could not establish exact ink gaps. A separate, original
75-page PDF from the same local reference collection was subsequently found:
Creator `Hwp 2018 11.0.0.2129`, Producer `Hancom PDF 1.3.0.538`, and an embedded
`HyhwpEQ` subset. This PDF is an independent native Hancom output, **not** the
corresponding output of the supplied HWP.

Eight visually verified simple numeric radicals in that PDF have radicand size
11.031904pt and an actual overbar-to-radicand ink gap of 2.550940–2.670852pt
(0.2312–0.2421em). Measurements use the original PDF text transforms and glyph
ink bounds; an independent 1440dpi raster check agrees to the raster precision.
The private documents, cropped pages, font data and outlines are not distributed
with this repository. Only aggregate geometry is recorded here.

The [OpenType MATH specification](https://learn.microsoft.com/en-us/typography/opentype/spec/math)
defines `RadicalVerticalGap` and `RadicalDisplayStyleVerticalGap` separately from
radical rule thickness and glyph variants. [MathML Core](https://www.w3.org/TR/mathml-core/)
uses those metrics in radical layout, with compact/normal math style selecting
the relevant gap. Latin Modern's inline gap is only 0.05em. In our native Chrome
11pt diagnostic, square roots of letters and powers had zero or roughly a
quarter CSS pixel of fully white raster separation at the chosen threshold.
That is evidence of inadequate visible clearance, not proof that exact vector
outlines intersect.

## Base-font comparison

Values below are normalized font units, with 1,000 units per em.

| Base font | Inline gap | Display gap | Rule thickness |
| --- | ---: | ---: | ---: |
| Latin Modern Math 1.959 | 50 | 148 | 40 |
| STIX Two Math 2.12 | 85 | 170 | 68 |
| XITS Math 1.302 | 82 | 186 | 66 |

The alternatives were downloaded from pinned, public licensed sources;
[STIX Two](https://github.com/stipub/stixfonts) and
[XITS](https://github.com/aliftype/xits) are useful Times-oriented candidates,
but that description alone does not establish similarity to `HyhwpEQ`.

A same-size comparison of the digit `3` in the native PDF against each public
font used connected ink components, translation only, no scaling, and four
raster thresholds. Latin Modern scored 0.916–0.930 intersection-over-union;
STIX Two 0.454–0.471; XITS 0.503–0.545. Latin Modern was therefore retained for
this limited comparison. The result applies to one numeral, not every glyph or
the complete Hancom style. Radical hook shape, horizontal metrics, and other
symbols still require broader independent references.

## Training and frozen font change

Only `sqrt(3)` and `sqrt(7)` selected the profile. Selection used the actual
native SVG route (Chromium MathML → PDF → outlined SVG) before precision scaling,
with the original font point size, DPR1, and path ink bounds. This historical
calibration table is not the final high-precision SVG result below. An earlier
high-DPR raster exploration preferred
a different candidate; it was superseded because raster phase is not the
production vector geometry.

| Candidate gap (both styles) | `sqrt(3)` gap, pt | `sqrt(7)` gap, pt | Mean absolute reference error, pt |
| --- | ---: | ---: | ---: |
| 250 | 2.407350 | 2.297100 | 0.204805 |
| 260 | 2.407350 | 2.297100 | 0.204805 |
| 275 | 2.407350 | 2.297100 | 0.204805 |
| 300 | 3.157350 | 3.047100 | 0.545195 |
| Native Hancom reference | 2.550940 | 2.563119 | — |

The smallest tied candidate, **250**, was frozen before validation. The changes
are `RadicalVerticalGap: 50 → 250` and
`RadicalDisplayStyleVerticalGap: 148 → 250`. Matching display to inline is a
consistency policy; the native reference measured here is inline only.

No glyph contours, advances, kerning, Unicode mapping, radical variants or
assemblies were altered. The reproducible builder compares the entire generated
MATH table against the original with exactly these two allowed changes, and
separately checks all contours and protected metric/shaping tables. Coverage
remains 4,802 glyphs and 2,045 Unicode code points. Versions, source hashes,
output hashes and preserved table hashes are in [fonts/build.json](../fonts/build.json).

## Initial vector validation without retuning

Six numeric radicals were excluded from calibration. Their initial DPR1 vector
results with the frozen 250 profile were:

| Held-out radicand | Native reference gap, pt | Qutex gap, pt | Qutex minus reference, pt |
| --- | ---: | ---: | ---: |
| 2 | 2.670852 | 2.407350 | −0.263503 |
| 5 | 2.660079 | 2.407350 | −0.252729 |
| 10 | 2.550940 | 2.407350 | −0.143591 |
| 11 | 2.550940 | 2.407350 | −0.143591 |
| 30 | 2.670852 | 2.407350 | −0.263503 |
| 34 | 2.552346 | 2.286075 | −0.266271 |

The initial maximum held-out absolute gap error was 0.266271pt. The font profile
was not changed after these results. The original vector route's 1 CSS pixel
snapping produced 0.75pt steps at this scale. Its overbar was also thicker than
the reference at small sizes. Both observations motivated a renderer-level
precision investigation; changing font contours to counter this rounding would
have addressed the wrong layer.

## Final high-precision SVG verification

The renderer now lays out MathML at a preferred 32× CSS zoom and divides all
vector coordinates, strokes, dimensions and baseline by the same scale. This
reduces Chromium's integer-pixel rule snapping without altering the font or
scaling an equation to fit a target box. CSS zoom also preserves absolute TeX
units such as `pt` and `cm`; multiplying only the font size would not do so.

The scale is halved as needed to keep the intermediate print side at most
16,384 CSS pixels and area at most 64,000,000 CSS pixels, including a reserve
from the actual fonts' global ink bounds. The returned result reports its
`layoutScale`. Large formulas may therefore use less than 32× and have greater
rounding error. Final output dimension limits still apply.

The same frozen font profile 250 was rerun through the final export route.
All eight numeric cases below used 32× and the same 11.031904pt size. The two
calibration cases were checked first; the remaining six were validation only.
Neither font gap was retuned after this renderer change.

| Radicand | Role | Native reference gap, pt | Final Qutex gap, pt | Qutex minus reference, pt |
| --- | --- | ---: | ---: | ---: |
| 3 | Calibration | 2.550940 | 2.520008 | -0.030932 |
| 7 | Calibration | 2.563119 | 2.526878 | -0.036241 |
| 2 | Held-out | 2.670852 | 2.520008 | -0.150844 |
| 5 | Held-out | 2.660079 | 2.520008 | -0.140071 |
| 10 | Held-out | 2.550940 | 2.520008 | -0.030932 |
| 11 | Held-out | 2.550940 | 2.520008 | -0.030932 |
| 30 | Held-out | 2.670852 | 2.520008 | -0.150844 |
| 34 | Held-out | 2.552346 | 2.515846 | -0.036500 |

The final maximum held-out absolute gap error is **0.150844pt**, compared with
0.266271pt before precision scaling. Final overbar thickness is **0.445312pt**
for these cases; the independent native reference measures **0.441707pt**.
The remaining difference is about 0.003605pt. The font's `RadicalRuleThickness`
is still the original 40 font units at 1,000 units/em: this improvement came from output precision,
not a new rule-thickness constant or a thinner glyph contour.

These are limited geometric improvements. Hook shape, horizontal metrics and
other formula structures still differ or lack an independent native reference.
The browser's ordinary screen rendering also retains its own pixel rounding;
the high-precision export is not evidence of pixel-identical browser/SVG output.

## Browser raster coverage

The public diagnostic additionally renders `x`, `y`, `pi`, powers, fractions,
integrals, cube roots, nested roots and accented contents at 11/24/48pt in both
inline and display modes, alongside the unchanged Latin Modern baseline. All
120 captures completed in Chrome 154.0.8037.59. The 60 new-profile cases
(including six numeric holdouts) had at least 2 CSS pixels of full-white raster
separation in the diagnostic, at DPR9 and threshold180; this is a raster
clearance check, not the vector calibration above. Representative 11/24pt
contact sheets were directly inspected: letters, superscripts, fractions,
accents and nested bars are visibly separated. These cases exercise the generic font mechanism; there is no native Hancom reference
for them here and they must not be reported as a Hancom match.

## Reproduction and limits

- Font build: [tools/build-font.py](../tools/build-font.py) with the pinned
  [font toolchain](../fonts/build-requirements.txt).
- Public font sources and raster diagnostics:
  [experiments/radical-fonts](../experiments/radical-fonts/README.md).
- Production vector path measurements:
  [experiments/common-font/ink-gap.mjs](../experiments/common-font/ink-gap.mjs).

The original [GUST Latin Modern source](https://www.gust.org.pl/projects/e-foundry/lm-math/download)
and its license remain preserved under `fonts/upstream`. No proprietary Hancom
font is bundled. This release fixes the measured radical-clearance problem and
unifies the font source used by browser/SVG routes; it does not claim identical
Hancom line layout, hook geometry, rule weight, or all-symbol coverage behavior.
