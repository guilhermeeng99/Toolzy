import { removePdfPassword } from "../../lib/pdf";
import { PasswordPdfTool } from "./PasswordPdfTool";

/** Remove a known password from a PDF you can already open. */
export function UnlockPdf() {
  return (
    <PasswordPdfTool
      action="Unlock"
      verb="Unlocking..."
      suffix="-unlocked"
      passwordLabel="Current password"
      hint="Removes the password from a PDF you can already open with it."
      run={removePdfPassword}
    />
  );
}
