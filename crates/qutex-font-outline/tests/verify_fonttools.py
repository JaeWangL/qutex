"""Optional independent-parser check; run with fonts/build-requirements.txt installed."""

import hashlib
import json
from pathlib import Path
import subprocess
import sys

from fontTools.ttLib import TTFont


def main():
    root = Path(__file__).resolve().parents[3]
    font_path = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "fonts/QutexMath-Regular.otf"
    binary = root / "crates/target/release/qutex-font-outline"
    font = TTFont(font_path)
    cmap = font.getBestCmap()
    codepoints = sorted(cmap)
    batches = [codepoints[start:start + 4096] for start in range(0, len(codepoints), 4096)]
    requests = [{"op": "metadata"}, *[
        {"op": "glyphs", "codepoints": batch, "includePaths": False} for batch in batches
    ], {"op": "variants", "codepoints": [40, 0x221A]}]
    process = subprocess.run([str(binary), str(font_path)],
                             input="\n".join(json.dumps(row) for row in requests) + "\n",
                             text=True, capture_output=True, check=True)
    replies = [json.loads(line) for line in process.stdout.splitlines()]
    assert len(replies) == len(requests) and all(row["ok"] for row in replies)
    metadata = replies[0]["result"]
    for reply in replies[1:-1]:
        for row in reply["result"]["glyphs"]:
            name = cmap[row["codepoint"]]
            assert row["glyphId"] == font.getGlyphID(name)
            assert row["advanceWidth"] == font["hmtx"].metrics[name][0]
            assert row["leftSideBearing"] == font["hmtx"].metrics[name][1]
    constants = font["MATH"].table.MathConstants
    for key, attribute in (("axis_height", "AxisHeight"),
                           ("fraction_rule_thickness", "FractionRuleThickness"),
                           ("radical_kern_after_degree", "RadicalKernAfterDegree")):
        assert metadata["mathConstants"][key] == getattr(constants, attribute).Value
    variants = font["MATH"].table.MathVariants
    for row in replies[-1]["result"]["glyphs"]:
        position = variants.VertGlyphCoverage.glyphs.index(cmap[row["codepoint"]])
        native = variants.VertGlyphConstruction[position]
        assert [(v["glyphId"], v["advanceMeasurement"]) for v in row["vertical"]["variants"]] == [
            (font.getGlyphID(v.VariantGlyph), v.AdvanceMeasurement) for v in native.MathGlyphVariantRecord
        ]
        assert row["minConnectorOverlap"] == variants.MinConnectorOverlap
    print(json.dumps({"status": "PASS", "independentParser": "fontTools",
                      "fontSha256": hashlib.sha256(font_path.read_bytes()).hexdigest(),
                      "unicodeMappings": len(codepoints), "advancesAndBearingsMatched": len(codepoints),
                      "mathConstantsChecked": 3, "variantFamiliesChecked": 2}, indent=2))


if __name__ == "__main__":
    main()
