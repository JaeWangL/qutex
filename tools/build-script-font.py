#!/usr/bin/env python3
# SPDX-License-Identifier: OFL-1.1
"""Build an OFL script-capital supplement directly from official KaTeX outlines.

No Temml font is used as an input. Unicode script-letter mapping is obtained from
the Unicode character database. Primes belong to Qutex Math, not this supplement.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import string
import unicodedata
from pathlib import Path

import brotli
import fontTools
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont, newTable
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "fonts/upstream/katex-script/KaTeX_Script-Regular.ttf"
SOURCE_SHA256 = "1c67f068fea8bb09bf099c088b1cf64bd27516a6e07f4684344873564bb66a67"
FAMILY = "Qutex Script"
POSTSCRIPT = "QutexScript-Regular"
PRIMES = (0x2032, 0x2033, 0x2034, 0x2035, 0x2036, 0x2037, 0x2057)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def script_codepoint(letter: str) -> int:
    try:
        return ord(unicodedata.lookup("MATHEMATICAL SCRIPT CAPITAL " + letter))
    except KeyError:
        return ord(unicodedata.lookup("SCRIPT CAPITAL " + letter))


def outline(font: TTFont, name: str) -> list:
    pen = RecordingPen()
    font.getGlyphSet()[name].draw(pen)
    return pen.value


def build(output: Path) -> dict:
    if digest(SOURCE.read_bytes()) != SOURCE_SHA256:
        raise SystemExit("Official KaTeX Script source hash mismatch")
    original = TTFont(SOURCE, recalcTimestamp=False)
    font = TTFont(SOURCE, recalcTimestamp=False)
    source_cmap = original.getBestCmap()
    letters = {script_codepoint(letter): source_cmap[ord(letter)] for letter in string.ascii_uppercase}
    cmap = {0x20: source_cmap[0x20], 0xA0: source_cmap[0xA0], **letters}
    table = newTable("cmap")
    table.tableVersion = 0
    table.tables = []
    for format_, platform, encoding in ((4, 0, 3), (4, 3, 1), (12, 0, 4), (12, 3, 10)):
        sub = CmapSubtable.newSubtable(format_)
        sub.platformID, sub.platEncID, sub.language = platform, encoding, 0
        sub.cmap = {cp: name for cp, name in cmap.items() if format_ == 12 or cp <= 0xFFFF}
        table.tables.append(sub)
    font["cmap"] = table
    font["OS/2"].recalcUnicodeRanges(font)
    font["OS/2"].usFirstCharIndex = min(cmap)
    font["OS/2"].usLastCharIndex = min(max(cmap), 0xFFFF)
    names = {
        1: FAMILY, 2: "Regular", 3: "BNZinc:QutexScript:0.1.0",
        4: FAMILY + " Regular", 5: "Version 0.1.0; Unicode script-capital supplement",
        6: POSTSCRIPT, 16: FAMILY, 17: "Regular",
    }
    for record in list(font["name"].names):
        if record.nameID in names:
            font["name"].setName(names[record.nameID], record.nameID, record.platformID, record.platEncID, record.langID)
    for name_id in (16, 17):
        font["name"].setName(names[name_id], name_id, 3, 1, 0x409)
    font["name"].setName(
        "Derived by BNZinc from official OFL-licensed KaTeX Script. Names and Unicode "
        "mapping changed; outlines and advance metrics unchanged. No Temml font data used.",
        10, 3, 1, 0x409,
    )
    # Copyright and original OFL notice (including the upstream RFN attribution)
    # remain in IDs 0 and 13; the user-facing font name no longer uses the RFN.
    output.mkdir(parents=True, exist_ok=True)
    path = output / f"{POSTSCRIPT}.woff2"
    font.flavor = "woff2"
    font.save(path)

    actual = TTFont(path, recalcTimestamp=False)
    assert actual.getBestCmap() == cmap
    assert len(letters) == 26
    assert not any(ord(letter) in actual.getBestCmap() for letter in string.ascii_uppercase)
    for cp, name in cmap.items():
        assert outline(original, name) == outline(actual, name), f"Changed contour U+{cp:04X}"
        assert original["hmtx"][name] == actual["hmtx"][name], f"Changed advance U+{cp:04X}"
    assert "home edition" not in str(actual["name"].getDebugName(13)).lower()
    assert actual["name"].getDebugName(1) == FAMILY
    math_font = TTFont(ROOT / "fonts/QutexMath-Regular.otf", recalcTimestamp=False)
    assert all(cp in math_font.getBestCmap() for cp in PRIMES), "Qutex Math must supply primes"
    result = {
        "family": FAMILY,
        "version": "0.1.0",
        "license": "SIL Open Font License 1.1",
        "sourceSha256": SOURCE_SHA256,
        "sourceRepository": "https://github.com/KaTeX/KaTeX",
        "sourceCommit": "dde05db6b775d8726a6654db13de26410195be48",
        "fontOutlinesFromTemml": False,
        "changes": ["Renamed family/PostScript identity", "Mapped A-Z script outlines to Unicode script capitals", "WOFF2 packaging"],
        "mapping": {f"U+{cp:04X}": name for cp, name in sorted(letters.items())},
        "primeFallback": {"font": "Qutex Math", "verifiedCodepoints": [f"U+{cp:04X}" for cp in PRIMES]},
        "toolchain": {"fonttools": fontTools.__version__, "brotli": brotli.__version__, "unicode": unicodedata.unidata_version},
        "asset": {"filename": path.name, "bytes": path.stat().st_size, "sha256": digest(path.read_bytes())},
    }
    (output / "script-build.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "fonts")
    print(json.dumps(build(parser.parse_args().output), indent=2))
