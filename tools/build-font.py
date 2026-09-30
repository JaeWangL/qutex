#!/usr/bin/env python3
"""Build Qutex Math's measured radical-clearance profile from pinned LM Math.

Only two documented MATH constants and font identity are changed. All outlines,
advance metrics, Unicode coverage and other MATH data are preserved and checked.
Install fonts/build-requirements.txt before running.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import brotli
import fontTools
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "fonts/upstream/latin-modern-math/latinmodern-math.otf"
SOURCE_SHA256 = "6075562b771f8b82f0c179e363389684f2dd09de30038269e2628e504bd7be0f"
FAMILY = "Qutex Math"
POSTSCRIPT = "QutexMath-Regular"
VERSION = "0.2.0"
RADICAL_GAP = 250
MATH_PROFILE = {
    "RadicalVerticalGap": RADICAL_GAP,
    "RadicalDisplayStyleVerticalGap": RADICAL_GAP,
}
PRESERVED_TABLES = ("cmap", "hmtx", "hhea", "OS/2", "GDEF", "GPOS", "GSUB")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def outlines_digest(font: TTFont) -> str:
    """Compare actual drawn contours, independently of CFF identity strings."""
    glyphs = font.getGlyphSet()
    digest = hashlib.sha256()
    for name in font.getGlyphOrder():
        pen = RecordingPen()
        glyphs[name].draw(pen)
        digest.update(json.dumps([name, pen.value], separators=(",", ":")).encode())
    return digest.hexdigest()


def rename(font: TTFont) -> None:
    names = {
        1: FAMILY,
        2: "Regular",
        3: f"BNZinc:{POSTSCRIPT}:{VERSION}",
        4: f"{FAMILY} Regular",
        5: f"Version {VERSION}; radical clearance profile; based on Latin Modern Math 1.959",
        6: POSTSCRIPT,
        16: FAMILY,
        17: "Regular",
    }
    for record in list(font["name"].names):
        if record.nameID in names:
            font["name"].setName(
                names[record.nameID], record.nameID, record.platformID,
                record.platEncID, record.langID,
            )
    # Attribution stays intact in name ID 0 and CFF Notice. The derivative's
    # status is separate from the original copyright.
    font["name"].setName(
        "Derivative maintained by BNZinc. Radical vertical gaps adjusted; all "
        "outlines, advances and other MATH data preserved from Latin Modern Math "
        "1.959. Limited native Hancom reference comparison, not a Hancom font.",
        10, 3, 1, 0x409,
    )
    font["name"].setName("GUST Font License / LPPL 1.3c or later", 13, 3, 1, 0x409)
    font["name"].setName("https://www.latex-project.org/lppl/lppl-1-3c/", 14, 3, 1, 0x409)
    cff = font["CFF "].cff
    cff.fontNames = [POSTSCRIPT]
    top = cff.topDictIndex[0]
    top.FullName = f"{FAMILY} Regular"
    top.FamilyName = FAMILY
    top.version = VERSION
    # Keep head timestamps and revision: no wall-clock dependent binary changes.


def build_korean_fallback(output: Path) -> dict:
    """Package the complete, unmodified Noto Serif KR variable face as WOFF2."""
    source = ROOT / "fonts/upstream/noto-serif-kr/NotoSerifKR[wght].ttf"
    digest = "11f8d5de6f1b79195efba3828aaa2ec95c1178f5ae976fb23c8d53250a9938f3"
    if sha256(source.read_bytes()) != digest:
        raise SystemExit("Pinned Noto Serif KR source hash mismatch")
    original = TTFont(source, recalcTimestamp=False)
    font = TTFont(source, recalcTimestamp=False)
    font.flavor = "woff2"
    path = output / "NotoSerifKR.woff2"
    font.save(path)
    result = TTFont(path, recalcTimestamp=False)
    assert result.getBestCmap() == original.getBestCmap(), "Korean Unicode coverage changed"
    assert result.getGlyphOrder() == original.getGlyphOrder(), "Korean glyph order changed"
    cmap = result.getBestCmap()
    assert all(cp in cmap for cp in range(0xAC00, 0xD7A4)), "Incomplete modern Hangul syllables"
    # WOFF2 applies reversible glyf/loca/hmtx transforms. Compare decompiled
    # outline commands and variation data rather than compressed table bytes.
    assert outlines_digest(original) == outlines_digest(result), "Korean outlines changed"
    assert result.getTableData("gvar") == original.getTableData("gvar"), "Korean variations changed"
    return {
        "family": result["name"].getDebugName(16) or result["name"].getDebugName(1),
        "defaultWeight": 200,
        "regularWeight": 400,
        "weightRange": [200, 900],
        "license": "SIL Open Font License 1.1",
        "sourceSha256": digest,
        "changes": ["Lossless WOFF2 packaging only"],
        "subset": False,
        "unicodeCodepoints": len(cmap),
        "modernHangulSyllables": 11172,
        "asset": {"filename": path.name, "sha256": sha256(path.read_bytes()), "bytes": path.stat().st_size},
    }


def build(output: Path) -> dict:
    if sha256(SOURCE.read_bytes()) != SOURCE_SHA256:
        raise SystemExit("Pinned Latin Modern Math source hash mismatch")
    output.mkdir(parents=True, exist_ok=True)
    original = TTFont(SOURCE, recalcTimestamp=False)
    expected_tables = {tag: sha256(original.getTableData(tag)) for tag in PRESERVED_TABLES}
    expected_outlines = outlines_digest(original)
    source_glyph_order = original.getGlyphOrder()
    source_cmap = original.getBestCmap()

    font = TTFont(SOURCE, recalcTimestamp=False)
    rename(font)
    changes = {}
    for name, value in MATH_PROFILE.items():
        previous = getattr(original["MATH"].table.MathConstants, name).Value
        getattr(font["MATH"].table.MathConstants, name).Value = value
        changes[name] = {"before": previous, "after": value, "unitsPerEm": font["head"].unitsPerEm}
    # This expected table differs from the original only at the explicitly
    # enumerated fields above. A whole-table comparison catches unintended
    # changes to math kerning, variants, assemblies, or any other constant.
    expected_math = font.getTableData("MATH")
    otf = output / f"{POSTSCRIPT}.otf"
    woff2 = output / f"{POSTSCRIPT}.woff2"
    font.save(otf)
    font.flavor = "woff2"
    font.save(woff2)

    assets = {}
    for path in (otf, woff2):
        result = TTFont(path, recalcTimestamp=False)
        actual_tables = {tag: sha256(result.getTableData(tag)) for tag in PRESERVED_TABLES}
        assert actual_tables == expected_tables, f"Math/metric tables changed in {path.name}"
        assert result.getTableData("MATH") == expected_math, f"Unexpected MATH changes in {path.name}"
        assert result.getGlyphOrder() == source_glyph_order, "Glyph order changed"
        assert result.getBestCmap() == source_cmap, "Unicode coverage changed"
        assert outlines_digest(result) == expected_outlines, "Glyph contours changed"
        assert result["name"].getDebugName(1) == FAMILY
        assert result["name"].getDebugName(6) == POSTSCRIPT
        assets[path.name] = {"sha256": sha256(path.read_bytes()), "bytes": path.stat().st_size}

    manifest = {
        "family": FAMILY,
        "version": VERSION,
        "status": "radical-clearance-profile",
        "hancomSimilarityValidated": False,
        "changes": ["Font family and PostScript names", "Derivative provenance metadata", "Radical vertical gaps", "WOFF2 packaging"],
        "unchanged": ["Outlines", "Advances", "Kerning", "Other MATH constants", "Stretchy variants", "Unicode mapping"],
        "mathProfile": {"name": "radical-clearance-v1", "changes": changes,
                        "sourceTableSha256": sha256(original.getTableData("MATH")),
                        "outputTableSha256": sha256(expected_math),
                        "referenceScope": "Inline numeric radicals in independent native Hancom PDF; display gap is consistency policy",
                        "investigation": "docs/radical-font-investigation.md"},
        "source": {"name": "Latin Modern Math", "version": "1.959", "sha256": SOURCE_SHA256},
        "toolchain": {"fonttools": fontTools.__version__, "brotli": brotli.__version__},
        "glyphCount": len(source_glyph_order),
        "unicodeCodepoints": len(source_cmap),
        "outlineSha256": expected_outlines,
        "preservedTableSha256": expected_tables,
        "assets": assets,
        "koreanFallback": build_korean_fallback(output),
    }
    (output / "build.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "fonts")
    args = parser.parse_args()
    print(json.dumps(build(args.output), indent=2))
