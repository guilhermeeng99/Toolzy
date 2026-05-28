import { save } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";
import { baseName, stripExt } from "../../lib/path";
import { PDF_EXTENSIONS } from "../../lib/pdf";
import { useSingleFile } from "../../lib/useSingleFile";
import { Card, Field, FileDropzone, PasswordInput, PrimaryButton } from "../ui";

/** Shared shell for the password modes (Protect / Unlock): pick one PDF, enter a
 *  password, save the result. `run` is the lib wrapper for the matching command. */
export function PasswordPdfTool({
  action,
  verb,
  suffix,
  hint,
  passwordLabel,
  run,
}: {
  action: string;
  verb: string;
  suffix: string;
  hint: string;
  passwordLabel: string;
  run: (path: string, password: string, outPath: string) => Promise<string>;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // Clear the last result when a new file is picked.
  const { path, over, choose } = useSingleFile(
    PDF_EXTENSIONS,
    useCallback(() => setStatus(null), []),
  );

  async function go() {
    if (!path || !password) return;
    const out = await save({
      defaultPath: `${stripExt(path)}${suffix}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!out) return;
    setBusy(true);
    setStatus(null);
    try {
      setStatus(`Saved: ${await run(path, password, out)}`);
    } catch (e) {
      setStatus(`Failed: ${String(e)}`);
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Field label={passwordLabel}>
          <PasswordInput value={password} onChange={setPassword} />
        </Field>
        <p className="text-body text-slate-blue">{hint}</p>
      </Card>

      <FileDropzone
        over={over}
        onChoose={choose}
        label={path ? baseName(path) : "Drop a PDF here, or click to choose"}
        hint="Processed natively on your machine"
        ariaLabel="Choose or drop a PDF"
      />

      {path ? (
        <PrimaryButton onClick={go} disabled={busy || !password}>
          {busy ? verb : `${action} PDF`}
        </PrimaryButton>
      ) : null}

      {status ? <p className="text-body-lg text-midnight-indigo">{status}</p> : null}
    </div>
  );
}
