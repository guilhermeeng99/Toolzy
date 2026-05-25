import type { ReactNode } from "react";
import type { QueueRow } from "../lib/useBatchQueue";
import { Badge, PrimaryButton, dropzoneClass, focusRing } from "./ui";

/**
 * Shared shell for the batch tools (Image convert, Audio convert): a drop zone, then
 * — once files are queued — a run/clear row and a per-file status list. `renderDetail`
 * draws each row's secondary line (size delta, output path, …); `onRemove` adds a
 * per-row remove button when provided. Wire the state from `useBatchQueue`.
 */
export function BatchPanel<T extends object>({
  items,
  running,
  pending,
  over,
  choose,
  run,
  clear,
  action,
  verb,
  dropLabel,
  dropHint,
  renderDetail,
  onRemove,
}: {
  items: QueueRow<T>[];
  running: boolean;
  pending: number;
  over: boolean;
  choose: () => void;
  run: () => void;
  clear: () => void;
  action: string;
  verb: string;
  dropLabel: string;
  dropHint: string;
  renderDetail: (item: QueueRow<T>) => ReactNode;
  onRemove?: (id: string) => void;
}) {
  return (
    <>
      <button type="button" onClick={choose} className={dropzoneClass(over)} aria-label={dropLabel}>
        <span className="text-body-lg font-semibold text-midnight-indigo">{dropLabel}</span>
        <span className="text-body text-slate-blue">{dropHint}</span>
      </button>

      {items.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={run} disabled={running || pending === 0}>
              {running ? verb : `${action} ${pending > 0 ? pending : ""}`}
            </PrimaryButton>
            <button
              type="button"
              onClick={clear}
              disabled={running}
              className={`text-body-lg font-semibold text-slate-blue transition-colors hover:text-midnight-indigo disabled:opacity-50 ${focusRing}`}
            >
              Clear
            </button>
          </div>
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <BatchRow key={item.id} item={item} renderDetail={renderDetail} onRemove={onRemove} />
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

function BatchRow<T extends object>({
  item,
  renderDetail,
  onRemove,
}: {
  item: QueueRow<T>;
  renderDetail: (item: QueueRow<T>) => ReactNode;
  onRemove?: (id: string) => void;
}) {
  return (
    <li className="flex items-center gap-4 rounded-2xl bg-snow-white p-3 shadow-sm-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-lg font-semibold text-midnight-indigo">{item.name}</p>
        <p className="truncate text-body text-slate-blue">{renderDetail(item)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {item.status === "working" ? <Badge>Working</Badge> : null}
        {item.status === "done" ? <Badge>Done</Badge> : null}
        {onRemove ? (
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className={`text-slate-blue transition-colors hover:text-midnight-indigo ${focusRing}`}
            aria-label={`Remove ${item.name}`}
          >
            x
          </button>
        ) : null}
      </div>
    </li>
  );
}
