import type { ReactNode } from "react";
import { baseName } from "../lib/path";
import { Card, FileDropzone, PrimaryButton } from "./ui";

/**
 * Shared shell for the single-file edit modes (audio + video): a drop zone, then —
 * once a file is picked — the mode's controls, a run button, and a `Saved:`/`Failed:`
 * status line. Wires the state from `useFileEdit`; `children` are the mode controls.
 */
export function EditPanel({
  path,
  over,
  busy,
  status,
  choose,
  onRun,
  action,
  verb,
  hint,
  dropLabel,
  disabled,
  children,
}: {
  path: string | null;
  over: boolean;
  busy: boolean;
  status: string | null;
  choose: () => void;
  onRun: () => void;
  action: string;
  verb: string;
  hint?: string;
  dropLabel: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <FileDropzone
        over={over}
        onChoose={choose}
        label={path ? baseName(path) : dropLabel}
        hint="Processed natively on your machine"
        ariaLabel="Choose or drop a file"
      />

      {path ? (
        <>
          {children ? (
            <Card>
              {children}
              {hint ? <p className="text-body text-slate-blue">{hint}</p> : null}
            </Card>
          ) : null}
          <PrimaryButton onClick={onRun} disabled={busy || disabled}>
            {busy ? verb : action}
          </PrimaryButton>
        </>
      ) : null}

      {status ? <p className="text-body-lg text-midnight-indigo">{status}</p> : null}
    </div>
  );
}
