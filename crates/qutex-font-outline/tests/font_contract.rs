use qutex_font_outline::FontSession;
use serde_json::{Value, json};

const FONT: &[u8] = include_bytes!("../../../vendor/temml/site/assets/NotoSansMath-Regular.ttf");
const MATH_FONT: &[u8] = include_bytes!("../../../fonts/QutexMath-Regular.otf");

fn request(session: &mut FontSession, value: Value) -> Value {
    session.handle_json(&serde_json::to_vec(&value).unwrap())
}

#[test]
fn unicode_and_glyph_id_queries_return_the_same_original_outline() {
    let mut session = FontSession::new(FONT, 0).unwrap();
    let mapped = request(
        &mut session,
        json!({"op":"glyphs","codepoints":[65,32,0x2211,0x10ffff]}),
    );
    assert_eq!(mapped["ok"], true);
    let rows = mapped["result"]["glyphs"].as_array().unwrap();
    assert!(rows[0]["path"].as_str().unwrap().starts_with('M'));
    assert!(rows[0]["advanceWidth"].as_u64().unwrap() > 0);
    assert_eq!(rows[1]["path"], "");
    assert!(rows[1]["advanceWidth"].as_u64().unwrap() > 0);
    assert_eq!(rows[3]["missing"], true);
    assert!(rows[3]["glyphId"].is_null());
    let by_id = request(
        &mut session,
        json!({"op":"glyphs","glyphIds":[rows[0]["glyphId"]]}),
    );
    assert_eq!(by_id["result"]["glyphs"][0]["path"], rows[0]["path"]);
    let metrics = request(
        &mut session,
        json!({"op":"glyphs","glyphIds":[rows[0]["glyphId"]],"includePaths":false}),
    );
    assert!(metrics["result"]["glyphs"][0].get("path").is_none());
    assert_eq!(
        metrics["result"]["glyphs"][0]["advanceWidth"],
        rows[0]["advanceWidth"]
    );
}

#[test]
fn invalid_requests_do_not_substitute_notdef_or_poison_later_requests() {
    let mut session = FontSession::new(FONT, 0).unwrap();
    for bad in [
        json!({"op":"glyphs","codepoints":[0xD800]}),
        json!({"op":"glyphs","glyphIds":[65535]}),
        json!({"op":"glyphs","codepoints":[65],"glyphIds":[1]}),
        json!({"op":"glyphs","codepoints":[]}),
    ] {
        assert_eq!(request(&mut session, bad)["ok"], false);
    }
    assert_eq!(session.handle_json(b"not-json")["ok"], false);
    let result = request(&mut session, json!({"id":"still-alive","op":"metadata"}));
    assert_eq!(result["id"], "still-alive");
    assert_eq!(result["ok"], true);
    assert_eq!(result["result"]["coordinateSystem"], "font-y-up");
}

#[test]
fn math_metadata_does_not_invent_a_table_for_a_font_without_one() {
    let mut session = FontSession::new(FONT, 0).unwrap();
    let result = request(&mut session, json!({"op":"metadata"}));
    let variants = request(&mut session, json!({"op":"variants","codepoints":[0x2211]}));
    assert_eq!(variants["ok"], true);
    if result["result"]["hasMath"] == false {
        assert!(result["result"]["mathConstants"].is_null());
        assert!(variants["result"]["glyphs"][0]["vertical"].is_null());
    } else {
        assert!(result["result"]["mathConstants"]["axis_height"].is_number());
    }
}

#[test]
fn cff_math_font_preserves_native_metrics_and_delimiter_assemblies() {
    let mut session = FontSession::new(MATH_FONT, 0).unwrap();
    let metadata = request(&mut session, json!({"op":"metadata"}));
    assert_eq!(metadata["result"]["family"], "Qutex Math");
    assert_eq!(metadata["result"]["unitsPerEm"], 1000);
    assert_eq!(metadata["result"]["mathConstants"]["axis_height"], 250);
    assert_eq!(
        metadata["result"]["mathConstants"]["fraction_rule_thickness"],
        40
    );
    assert_eq!(
        metadata["result"]["mathConstants"]
            .as_object()
            .unwrap()
            .len(),
        56
    );
    let result = request(
        &mut session,
        json!({"op":"variants","codepoints":[40,0x221a]}),
    );
    let rows = result["result"]["glyphs"].as_array().unwrap();
    assert_eq!(rows[0]["minConnectorOverlap"], 20);
    assert_eq!(rows[0]["vertical"]["variants"].as_array().unwrap().len(), 8);
    let parts = rows[1]["vertical"]["assembly"]["parts"].as_array().unwrap();
    assert!(parts.iter().any(|part| part["extender"] == true));
    let variant_id = rows[0]["vertical"]["variants"][1]["glyphId"].clone();
    let outlines = request(&mut session, json!({"op":"glyphs","glyphIds":[variant_id]}));
    assert!(
        outlines["result"]["glyphs"][0]["path"]
            .as_str()
            .unwrap()
            .contains('C')
    );
}

#[test]
fn variable_fonts_are_explicitly_rejected_instead_of_using_incomplete_metrics() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fonts/upstream/noto-serif-kr/NotoSerifKR[wght].ttf");
    let bytes = std::fs::read(root).unwrap();
    let result = FontSession::new(&bytes, 0);
    assert!(matches!(result, Err(message) if message.contains("Variable fonts")));
}
