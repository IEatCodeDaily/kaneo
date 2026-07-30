import { Badge } from "@/components/ui/badge";

const labelColors = [
  { value: "gray", label: "Stone", color: "var(--color-stone-500)" },
  { value: "dark-gray", label: "Slate", color: "var(--color-slate-500)" },
  { value: "purple", label: "Lavender", color: "var(--color-violet-500)" },
  { value: "teal", label: "Sage", color: "var(--color-emerald-600)" },
  { value: "green", label: "Forest", color: "var(--color-green-600)" },
  { value: "yellow", label: "Amber", color: "var(--color-amber-600)" },
  { value: "orange", label: "Terracotta", color: "var(--color-orange-600)" },
  { value: "pink", label: "Rose", color: "var(--color-rose-600)" },
  { value: "red", label: "Crimson", color: "var(--color-red-600)" },
];

function isValidHtmlColor(color: string): boolean {
  const s = new Option().style;
  s.color = color;
  return s.color !== "";
}

function validColor(value: string): string {
  const mapped = labelColors.find((c) => c.value === value)?.color;
  if (mapped) {
    return mapped;
  }

  if (isValidHtmlColor(value)) {
    return value;
  }

  return "var(--color-neutral-400)";
}

type TaskLabel = { id: string; name: string; color: string };

/**
 * Labels come from the task the caller already rendered.
 *
 * This used to fetch per task (`useGetLabelsByTask`) with `refetchOnMount`,
 * which meant one GET plus a CORS preflight per card — 186 requests on a
 * 180-task board, the last of them queued over a second deep. The board
 * payload already includes `labels` on every task, so the fetch was pure
 * duplication.
 */
function TaskCardLabels({ labels }: { labels: TaskLabel[] | undefined }) {
  if (!labels?.length) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((label) => (
        <Badge
          key={label.id}
          variant="outline"
          className="px-2 py-0.5 text-[10px] flex items-center"
        >
          <span
            className="inline-block w-1.5 h-1.5 mr-1 rounded-full"
            style={{
              backgroundColor: validColor(label.color),
            }}
          />
          <span className="max-w-20 truncate">{label.name}</span>
        </Badge>
      ))}
    </div>
  );
}

export default TaskCardLabels;
