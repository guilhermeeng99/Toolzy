use crate::qpdf::run_qpdf;
use crate::validate::require_password;

/// qpdf args to AES-256-encrypt `input` into `out`, using `password` as both the
/// user (open) and owner password. The traditional positional `--encrypt u o len`
/// form is used for compatibility across qpdf versions. Pure → unit-tested.
///
/// The password rides on the process args (qpdf has no stdin password for
/// encryption); it is never logged. On the user's own machine this is the standard
/// qpdf usage.
fn encrypt_args(password: &str, input: &str, out: &str) -> Vec<String> {
    vec![
        "--encrypt".into(),
        password.into(),
        password.into(),
        "256".into(),
        "--".into(),
        input.into(),
        out.into(),
    ]
}

/// qpdf args to decrypt `input` (opened with `password`) into an unprotected `out`.
/// `--decrypt` strips the encryption entirely. Pure → unit-tested.
fn decrypt_args(password: &str, input: &str, out: &str) -> Vec<String> {
    vec![
        format!("--password={password}"),
        "--decrypt".into(),
        "--".into(),
        input.into(),
        out.into(),
    ]
}

/// Add an open password (AES-256) to a PDF via the qpdf sidecar. Returns the saved
/// path. Needs the qpdf sidecar.
#[tauri::command]
pub async fn add_pdf_password(
    app: tauri::AppHandle,
    path: String,
    password: String,
    out_path: String,
) -> Result<String, String> {
    require_password(&password)?;
    run_qpdf(&app, encrypt_args(&password, &path, &out_path)).await?;
    Ok(out_path)
}

/// Remove a known password from a PDF via the qpdf sidecar. A wrong password makes
/// qpdf exit non-zero; we surface a friendly "incorrect password" message. Returns
/// the saved path. Needs the qpdf sidecar.
#[tauri::command]
pub async fn remove_pdf_password(
    app: tauri::AppHandle,
    path: String,
    password: String,
    out_path: String,
) -> Result<String, String> {
    require_password(&password)?;
    run_qpdf(&app, decrypt_args(&password, &path, &out_path))
        .await
        .map_err(|e| {
            if e.to_lowercase().contains("password") {
                "incorrect password".into()
            } else {
                e
            }
        })?;
    Ok(out_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_args_use_aes_256_and_repeat_password() {
        let a = encrypt_args("secret", "in.pdf", "out.pdf");
        assert_eq!(
            a,
            vec!["--encrypt", "secret", "secret", "256", "--", "in.pdf", "out.pdf"]
        );
    }

    #[test]
    fn decrypt_args_pass_password_and_decrypt_flag() {
        let a = decrypt_args("secret", "in.pdf", "out.pdf");
        assert_eq!(
            a,
            vec!["--password=secret", "--decrypt", "--", "in.pdf", "out.pdf"]
        );
    }
}
