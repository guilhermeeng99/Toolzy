use tauri_plugin_shell::ShellExt;

/// Run the bundled `qpdf` sidecar with `args` and wait for it to finish.
///
/// `--warning-exit-0` is prepended so qpdf's "completed with warnings" status
/// (which still writes a valid output file) counts as success. On real failure
/// (exit non-zero) the last stderr line is returned as the error.
///
/// Used by the merge / protect / unlock commands. Needs the qpdf sidecar
/// (`externalBin` + a `shell:allow-execute` capability). Callers must never log
/// the args (they can contain a password).
pub async fn run_qpdf(app: &tauri::AppHandle, args: Vec<String>) -> Result<(), String> {
    let mut full = vec!["--warning-exit-0".to_string()];
    full.extend(args);

    let output = app
        .shell()
        .sidecar("qpdf")
        .map_err(|e| format!("qpdf not found: {e}"))?
        .args(full)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(stderr.lines().last().unwrap_or("qpdf failed").to_string())
}
