use crate::qpdf::run_qpdf;

/// qpdf args that concatenate `inputs` (in list order) into a single `out` PDF.
/// `--empty` starts a blank document; `--pages … --` appends every page of each
/// input in turn. Pure (no I/O) so the token order is unit-tested.
fn merge_args(inputs: &[String], out: &str) -> Vec<String> {
    let mut args = vec!["--empty".to_string(), "--pages".to_string()];
    args.extend(inputs.iter().cloned());
    args.push("--".to_string());
    args.push(out.to_string());
    args
}

/// Concatenate several PDFs into one, in the order given, using the bundled qpdf
/// sidecar. The UI orders the list (drag-to-reorder); pages flow in file order.
/// Returns the saved path. Needs the qpdf sidecar.
#[tauri::command]
pub async fn merge_pdfs(
    app: tauri::AppHandle,
    paths: Vec<String>,
    out_path: String,
) -> Result<String, String> {
    if paths.is_empty() {
        return Err("no PDFs provided".into());
    }
    run_qpdf(&app, merge_args(&paths, &out_path)).await?;
    Ok(out_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_args_preserve_order() {
        let a = merge_args(&["a.pdf".into(), "b.pdf".into(), "c.pdf".into()], "out.pdf");
        assert_eq!(
            a,
            vec!["--empty", "--pages", "a.pdf", "b.pdf", "c.pdf", "--", "out.pdf"]
        );
    }

    #[test]
    fn merge_args_single_input() {
        let a = merge_args(&["only.pdf".into()], "out.pdf");
        assert_eq!(a, vec!["--empty", "--pages", "only.pdf", "--", "out.pdf"]);
    }
}
