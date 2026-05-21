use std::path::{Path, PathBuf};

use crate::ResizeOpt;

/// Compute output dimensions from the source size and resize options. Mirrors the
/// former TS logic: never below 1px; percent capped at 100 (no silent upscale).
pub fn target_dimensions(w: u32, h: u32, r: &ResizeOpt) -> (u32, u32) {
    match r.mode.as_str() {
        "percent" => {
            let p = r.percent.unwrap_or(100.0).clamp(1.0, 100.0) / 100.0;
            (scale(w, p), scale(h, p))
        }
        "px" if !r.keep_aspect_ratio => (r.width.unwrap_or(w).max(1), r.height.unwrap_or(h).max(1)),
        "px" => fit_keep_aspect(w, h, r.width, r.height),
        _ => (w.max(1), h.max(1)),
    }
}

/// Fit within the given box, preserving aspect ratio (smaller scale wins); if only
/// one dimension is given, derive the other.
fn fit_keep_aspect(w: u32, h: u32, tw: Option<u32>, th: Option<u32>) -> (u32, u32) {
    let (wf, hf) = (w as f32, h as f32);
    match (tw, th) {
        (Some(tw), Some(th)) => {
            let s = (tw as f32 / wf).min(th as f32 / hf);
            (round_min1(wf * s), round_min1(hf * s))
        }
        (Some(tw), None) => (tw.max(1), round_min1(hf * (tw as f32 / wf))),
        (None, Some(th)) => (round_min1(wf * (th as f32 / hf)), th.max(1)),
        (None, None) => (w.max(1), h.max(1)),
    }
}

fn scale(v: u32, f: f32) -> u32 {
    round_min1(v as f32 * f)
}

fn round_min1(v: f32) -> u32 {
    v.round().max(1.0) as u32
}

/// Output path = source directory + base name + new extension.
pub fn output_path(src: &Path, target: &str) -> PathBuf {
    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
    let ext = if target == "jpg" { "jpg" } else { target };
    src.with_file_name(format!("{stem}.{ext}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(mode: &str, w: Option<u32>, h: Option<u32>, p: Option<f32>, keep: bool) -> ResizeOpt {
        ResizeOpt {
            mode: mode.into(),
            width: w,
            height: h,
            percent: p,
            keep_aspect_ratio: keep,
        }
    }

    #[test]
    fn percent_scales_and_caps_at_100() {
        assert_eq!(
            target_dimensions(1000, 500, &r("percent", None, None, Some(50.0), true)),
            (500, 250)
        );
        assert_eq!(
            target_dimensions(1000, 500, &r("percent", None, None, Some(200.0), true)),
            (1000, 500)
        );
    }

    #[test]
    fn px_keep_aspect_one_dimension_derives_the_other() {
        assert_eq!(
            target_dimensions(1000, 500, &r("px", Some(500), None, None, true)),
            (500, 250)
        );
    }

    #[test]
    fn px_keep_aspect_both_dimensions_fit_inside_box() {
        assert_eq!(
            target_dimensions(1000, 500, &r("px", Some(400), Some(400), None, true)),
            (400, 200)
        );
    }

    #[test]
    fn px_stretch_exact_without_keep_aspect() {
        assert_eq!(
            target_dimensions(1000, 500, &r("px", Some(300), Some(300), None, false)),
            (300, 300)
        );
    }

    #[test]
    fn never_returns_below_one() {
        assert_eq!(
            target_dimensions(1, 1, &r("percent", None, None, Some(1.0), true)),
            (1, 1)
        );
    }

    #[test]
    fn none_keeps_source_size() {
        assert_eq!(
            target_dimensions(800, 600, &r("none", None, None, None, true)),
            (800, 600)
        );
    }

    #[test]
    fn output_path_swaps_extension() {
        assert_eq!(
            output_path(Path::new("/a/b/photo.png"), "jpg"),
            PathBuf::from("/a/b/photo.jpg")
        );
    }
}
