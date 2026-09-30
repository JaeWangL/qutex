//! Font extraction only: TeX parsing and mathematical layout stay in Temml/browser.

use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashMap, fmt::Write};
use ttf_parser::{Face, GlyphId, OutlineBuilder, math};

pub const MAX_BATCH: usize = 4096;
pub const MAX_LINE_BYTES: usize = 512 * 1024;
const MAX_CACHED_GLYPHS: usize = 4096;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    #[serde(default)]
    id: Value,
    op: String,
    codepoints: Option<Vec<u32>>,
    glyph_ids: Option<Vec<u16>>,
    #[serde(default = "yes")]
    include_paths: bool,
}

fn yes() -> bool {
    true
}

#[derive(Default)]
struct SvgPath(String);

impl OutlineBuilder for SvgPath {
    fn move_to(&mut self, x: f32, y: f32) {
        let _ = write!(self.0, "M{x} {y}");
    }
    fn line_to(&mut self, x: f32, y: f32) {
        let _ = write!(self.0, "L{x} {y}");
    }
    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        let _ = write!(self.0, "Q{x1} {y1} {x} {y}");
    }
    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        let _ = write!(self.0, "C{x1} {y1} {x2} {y2} {x} {y}");
    }
    fn close(&mut self) {
        self.0.push('Z');
    }
}

pub struct FontSession<'a> {
    face: Face<'a>,
    cache: HashMap<u16, Value>,
}

impl<'a> FontSession<'a> {
    pub fn new(bytes: &'a [u8], index: u32) -> Result<Self, String> {
        let face = Face::parse(bytes, index).map_err(|error| format!("Invalid font: {error:?}"))?;
        if face
            .raw_face()
            .table(ttf_parser::Tag::from_bytes(b"fvar"))
            .is_some()
        {
            return Err(
                "Variable fonts require explicit variation support; use a static TTF/OTF".into(),
            );
        }
        Ok(Self {
            face,
            cache: HashMap::new(),
        })
    }

    pub fn handle_json(&mut self, input: &[u8]) -> Value {
        let request: Request = match serde_json::from_slice(input) {
            Ok(request) => request,
            Err(error) => {
                return json!({"id": null, "ok": false, "error": format!("Invalid request: {error}")});
            }
        };
        let id = request.id.clone();
        match self.execute(request) {
            Ok(result) => json!({"id": id, "ok": true, "result": result}),
            Err(error) => json!({"id": id, "ok": false, "error": error}),
        }
    }

    fn execute(&mut self, request: Request) -> Result<Value, String> {
        if request.op == "metadata" {
            if request.codepoints.is_some() || request.glyph_ids.is_some() {
                return Err("metadata does not accept codepoints or glyphIds".into());
            }
            return Ok(self.metadata());
        }
        if request.op != "glyphs" && request.op != "variants" {
            return Err("op must be metadata, glyphs, or variants".into());
        }
        let selected: Vec<(Option<u32>, Option<GlyphId>)> =
            match (request.codepoints, request.glyph_ids) {
                (Some(codepoints), None) => {
                    check_batch(codepoints.len())?;
                    codepoints
                        .into_iter()
                        .map(|codepoint| {
                            let character = char::from_u32(codepoint)
                                .ok_or_else(|| format!("Invalid Unicode scalar: {codepoint}"))?;
                            Ok((Some(codepoint), self.face.glyph_index(character)))
                        })
                        .collect::<Result<_, String>>()?
                }
                (None, Some(glyph_ids)) => {
                    check_batch(glyph_ids.len())?;
                    glyph_ids
                        .into_iter()
                        .map(|id| {
                            if id >= self.face.number_of_glyphs() {
                                Err(format!("glyphId {id} exceeds this font's glyph count"))
                            } else {
                                Ok((None, Some(GlyphId(id))))
                            }
                        })
                        .collect::<Result<_, String>>()?
                }
                _ => return Err("Supply exactly one of codepoints or glyphIds".into()),
            };
        let mut rows = Vec::with_capacity(selected.len());
        for (codepoint, glyph) in selected {
            let mut result = match glyph {
                None => json!({"glyphId": null, "missing": true}),
                Some(glyph) if request.op == "variants" => self.variants(glyph),
                Some(glyph) => self.glyph(glyph, request.include_paths),
            };
            if let Some(codepoint) = codepoint {
                result["codepoint"] = json!(codepoint);
            }
            rows.push(result);
        }
        Ok(
            json!({"unitsPerEm": self.face.units_per_em(), "coordinateSystem": "font-y-up", "glyphs": rows}),
        )
    }

    fn glyph(&mut self, glyph: GlyphId, include_path: bool) -> Value {
        let mut result = if let Some(cached) = self.cache.get(&glyph.0) {
            cached.clone()
        } else {
            let mut path = SvgPath::default();
            let outlined_bounds = self.face.outline_glyph(glyph, &mut path);
            if outlined_bounds.is_none() {
                path.0.clear();
            }
            let bounds = self
                .face
                .glyph_bounding_box(glyph)
                .map(|bbox| [bbox.x_min, bbox.y_min, bbox.x_max, bbox.y_max]);
            let info = self.face.tables().math.and_then(|table| table.glyph_info);
            let result = json!({
                "glyphId": glyph.0, "missing": false, "name": self.face.glyph_name(glyph),
                "advanceWidth": self.face.glyph_hor_advance(glyph),
                "leftSideBearing": self.face.glyph_hor_side_bearing(glyph),
                "bbox": bounds, "path": path.0, "hasOutline": outlined_bounds.is_some(),
                "italicCorrection": info.and_then(|info| info.italic_corrections).and_then(|values| values.get(glyph)).map(|v| v.value),
                "topAccentAttachment": info.and_then(|info| info.top_accent_attachments).and_then(|values| values.get(glyph)).map(|v| v.value),
                "isExtendedShape": info.and_then(|info| info.extended_shapes).is_some_and(|coverage| coverage.get(glyph).is_some()),
            });
            if self.cache.len() < MAX_CACHED_GLYPHS {
                self.cache.insert(glyph.0, result.clone());
            }
            result
        };
        if !include_path {
            result.as_object_mut().unwrap().remove("path");
        }
        result
    }

    fn variants(&self, glyph: GlyphId) -> Value {
        let variants = self.face.tables().math.and_then(|table| table.variants);
        json!({"glyphId": glyph.0, "missing": false,
            "minConnectorOverlap": variants.map(|v| v.min_connector_overlap),
            "vertical": variants.and_then(|v| v.vertical_constructions.get(glyph)).map(construction),
            "horizontal": variants.and_then(|v| v.horizontal_constructions.get(glyph)).map(construction),
        })
    }

    fn metadata(&self) -> Value {
        let name = |id| {
            self.face
                .names()
                .into_iter()
                .find_map(|entry| (entry.name_id == id).then(|| entry.to_string()).flatten())
        };
        let table = self.face.tables().math;
        json!({
            "protocolVersion": 1, "unitsPerEm": self.face.units_per_em(), "coordinateSystem": "font-y-up",
            "family": name(ttf_parser::name_id::TYPOGRAPHIC_FAMILY).or_else(|| name(ttf_parser::name_id::FAMILY)),
            "subfamily": name(ttf_parser::name_id::TYPOGRAPHIC_SUBFAMILY).or_else(|| name(ttf_parser::name_id::SUBFAMILY)),
            "postscriptName": name(ttf_parser::name_id::POST_SCRIPT_NAME),
            "glyphCount": self.face.number_of_glyphs(), "ascender": self.face.ascender(), "descender": self.face.descender(),
            "lineGap": self.face.line_gap(), "hasMath": table.is_some(),
            "mathConstants": table.and_then(|table| table.constants).map(constants),
            "mathDeviceAdjustmentsApplied": false,
            "maxBatch": MAX_BATCH, "outlineCacheCapacity": MAX_CACHED_GLYPHS,
        })
    }
}

fn check_batch(length: usize) -> Result<(), String> {
    if !(1..=MAX_BATCH).contains(&length) {
        Err(format!("Batch must contain 1..{MAX_BATCH} glyphs"))
    } else {
        Ok(())
    }
}

fn construction(value: math::GlyphConstruction<'_>) -> Value {
    json!({
        "variants": value.variants.into_iter().map(|variant| json!({
            "glyphId": variant.variant_glyph.0, "advanceMeasurement": variant.advance_measurement,
        })).collect::<Vec<_>>(),
        "assembly": value.assembly.map(|assembly| json!({
            "italicCorrection": assembly.italics_correction.value,
            "parts": assembly.parts.into_iter().map(|part| json!({
                "glyphId": part.glyph_id.0, "startConnectorLength": part.start_connector_length,
                "endConnectorLength": part.end_connector_length, "fullAdvance": part.full_advance,
                "extender": part.part_flags.extender(),
            })).collect::<Vec<_>>(),
        })),
    })
}

fn constants(value: math::Constants<'_>) -> Value {
    let mut result = serde_json::Map::new();
    macro_rules! values { ($($method:ident),* $(,)?) => { $(result.insert(stringify!($method).into(), json!(value.$method().value));)* }; }
    macro_rules! scalars { ($($method:ident),* $(,)?) => { $(result.insert(stringify!($method).into(), json!(value.$method()));)* }; }
    scalars!(
        script_percent_scale_down,
        script_script_percent_scale_down,
        delimited_sub_formula_min_height,
        display_operator_min_height,
        radical_degree_bottom_raise_percent
    );
    values!(
        math_leading,
        axis_height,
        accent_base_height,
        flattened_accent_base_height,
        subscript_shift_down,
        subscript_top_max,
        subscript_baseline_drop_min,
        superscript_shift_up,
        superscript_shift_up_cramped,
        superscript_bottom_min,
        superscript_baseline_drop_max,
        sub_superscript_gap_min,
        superscript_bottom_max_with_subscript,
        space_after_script,
        upper_limit_gap_min,
        upper_limit_baseline_rise_min,
        lower_limit_gap_min,
        lower_limit_baseline_drop_min,
        stack_top_shift_up,
        stack_top_display_style_shift_up,
        stack_bottom_shift_down,
        stack_bottom_display_style_shift_down,
        stack_gap_min,
        stack_display_style_gap_min,
        stretch_stack_top_shift_up,
        stretch_stack_bottom_shift_down,
        stretch_stack_gap_above_min,
        stretch_stack_gap_below_min,
        fraction_numerator_shift_up,
        fraction_numerator_display_style_shift_up,
        fraction_denominator_shift_down,
        fraction_denominator_display_style_shift_down,
        fraction_numerator_gap_min,
        fraction_num_display_style_gap_min,
        fraction_rule_thickness,
        fraction_denominator_gap_min,
        fraction_denom_display_style_gap_min,
        skewed_fraction_horizontal_gap,
        skewed_fraction_vertical_gap,
        overbar_vertical_gap,
        overbar_rule_thickness,
        overbar_extra_ascender,
        underbar_vertical_gap,
        underbar_rule_thickness,
        underbar_extra_descender,
        radical_vertical_gap,
        radical_display_style_vertical_gap,
        radical_rule_thickness,
        radical_extra_ascender,
        radical_kern_before_degree,
        radical_kern_after_degree
    );
    Value::Object(result)
}
