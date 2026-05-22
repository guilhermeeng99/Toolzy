import { focusRing } from "../ui";

function ToolbarButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  return (
    <button
      type="button"
      className={`rounded-lg bg-pale-gray px-3 py-1.5 text-body font-semibold text-midnight-indigo transition-colors hover:bg-platinum-tint ${focusRing} ${className ?? ""}`}
      {...rest}
    />
  );
}

/** Header row above a preview grid: file count + add / clear actions. */
export function GridToolbar({
  count,
  onAdd,
  onClear,
}: {
  count: number;
  onAdd: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-body-lg font-semibold text-midnight-indigo">{count} file(s)</span>
      <div className="ml-auto flex gap-2">
        <ToolbarButton onClick={onAdd}>+ Add</ToolbarButton>
        <ToolbarButton onClick={onClear}>Clear</ToolbarButton>
      </div>
    </div>
  );
}
