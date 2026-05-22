import { open, save } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";
import { baseName, extOf, stripExt } from "../../lib/path";
import { useFileDrop } from "../../lib/useFileDrop";
import { Card, Field, PasswordInput, PrimaryButton, dropzoneClass } from "../ui";

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
  const [path, setPath] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const pick = useCallback((p: string) => {
    setPath(p);
    setStatus(null);
  }, []);

  const over = useFileDrop(
    useCallback(
      (incoming: string[]) => {
        const pdf = incoming.find((p) => extOf(p) === "pdf");
        if (pdf) pick(pdf);
      },
      [pick],
    ),
  );

  async function choose() {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (typeof picked === "string") pick(picked);
  }

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

      <button
        type="button"
        onClick={choose}
        className={dropzoneClass(over)}
        aria-label="Choose or drop a PDF"
      >
        <span className="text-body-lg font-semibold text-midnight-indigo">
          {path ? baseName(path) : "Drop a PDF here, or click to choose"}
        </span>
        <span className="text-body text-slate-blue">Processed natively on your machine</span>
      </button>

      {path ? (
        <PrimaryButton onClick={go} disabled={busy || !password}>
          {busy ? verb : `${action} PDF`}
        </PrimaryButton>
      ) : null}

      {status ? <p className="text-body-lg text-midnight-indigo">{status}</p> : null}
    </div>
  );
}
