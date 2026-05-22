import { addPdfPassword } from "../../lib/pdf";
import { PasswordPdfTool } from "./PasswordPdfTool";

/** Add an open password (AES-256) to a PDF. */
export function ProtectPdf() {
  return (
    <PasswordPdfTool
      action="Protect"
      verb="Protecting..."
      suffix="-protected"
      passwordLabel="New password"
      hint="Adds an open password (AES-256). Anyone opening the PDF will need it."
      run={addPdfPassword}
    />
  );
}
