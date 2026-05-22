import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { baseName } from "../../lib/path";
import { focusRing } from "../ui";

/** One card in the grid. `path` doubles as the stable sort id. */
export interface GridItem {
  path: string;
  thumb?: string;
  rotation: number;
}

/** A page sheet to draw the thumbnail inside, so the chosen page size / orientation
 *  / margin preview live. Omit to show the raw thumbnail (PDFs, "fit" mode). */
export interface PageFrame {
  pageW: number;
  pageH: number;
  marginMm: number;
}

/** Drag-to-reorder grid of file previews. Uses dnd-kit's PointerSensor (not native
 *  HTML5 DnD, which Tauri's webview file-drop handler swallows) so reordering works
 *  inside the app. Rotate is optional (images only). */
export function PreviewGrid({
  items,
  onReorder,
  onRemove,
  onRotate,
  frame,
}: {
  items: GridItem[];
  onReorder: (paths: string[]) => void;
  onRemove: (path: string) => void;
  onRotate?: (path: string) => void;
  frame?: PageFrame;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.path === active.id);
    const to = items.findIndex((i) => i.path === over.id);
    onReorder(arrayMove(items, from, to).map((i) => i.path));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.path)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
          {items.map((item, index) => (
            <Card
              key={item.path}
              item={item}
              index={index}
              onRemove={onRemove}
              onRotate={onRotate}
              frame={frame}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function Card({
  item,
  index,
  onRemove,
  onRotate,
  frame,
}: {
  item: GridItem;
  index: number;
  onRemove: (path: string) => void;
  onRotate?: (path: string) => void;
  frame?: PageFrame;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.path,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  const rotated = { transform: `rotate(${item.rotation}deg)` };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative flex cursor-grab touch-none flex-col gap-2 rounded-xl border border-platinum-tint bg-snow-white p-2 shadow-sm-2 active:cursor-grabbing"
    >
      <div className="absolute left-2 top-2 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-midnight-indigo/80 px-1 text-body font-semibold text-snow-white">
        {index + 1}
      </div>

      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {onRotate ? (
          <button
            type="button"
            onPointerDown={stop}
            onClick={() => onRotate(item.path)}
            className={`flex h-6 w-6 items-center justify-center rounded-full bg-snow-white text-midnight-indigo shadow-sm-2 hover:bg-pale-gray ${focusRing}`}
            aria-label={`Rotate ${baseName(item.path)}`}
          >
            ⟳
          </button>
        ) : null}
        <button
          type="button"
          onPointerDown={stop}
          onClick={() => onRemove(item.path)}
          className={`flex h-6 w-6 items-center justify-center rounded-full bg-snow-white text-midnight-indigo shadow-sm-2 hover:bg-pale-gray ${focusRing}`}
          aria-label={`Remove ${baseName(item.path)}`}
        >
          ✕
        </button>
      </div>

      <div className="flex h-40 items-center justify-center overflow-hidden rounded-lg bg-cloud-mist p-2">
        <Preview thumb={item.thumb} name={baseName(item.path)} frame={frame} rotated={rotated} />
      </div>

      <span className="truncate px-1 text-body text-midnight-indigo" title={baseName(item.path)}>
        {baseName(item.path)}
      </span>
    </div>
  );
}

/** Raw thumbnail, or — when a page `frame` is given — the thumbnail laid out on a
 *  page sheet (correct aspect + margin) so layout options preview live. */
function Preview({
  thumb,
  name,
  frame,
  rotated,
}: {
  thumb?: string;
  name: string;
  frame?: PageFrame;
  rotated: { transform: string };
}) {
  if (!thumb) return <span className="text-body text-slate-blue">Loading…</span>;
  if (!frame) {
    return (
      <img
        src={thumb}
        alt={name}
        draggable={false}
        style={rotated}
        className="max-h-full max-w-full object-contain"
      />
    );
  }

  const portrait = frame.pageW < frame.pageH;
  const sheet = {
    aspectRatio: `${frame.pageW} / ${frame.pageH}`,
    ...(portrait ? { height: "100%" } : { width: "100%" }),
  };
  const inset = {
    inset: `${(frame.marginMm / frame.pageH) * 100}% ${(frame.marginMm / frame.pageW) * 100}%`,
  };
  return (
    <div
      className="relative max-h-full max-w-full border border-platinum-tint bg-snow-white shadow-sm-2"
      style={sheet}
    >
      <div className="absolute" style={inset}>
        <img
          src={thumb}
          alt={name}
          draggable={false}
          style={rotated}
          className="h-full w-full object-contain"
        />
      </div>
    </div>
  );
}
