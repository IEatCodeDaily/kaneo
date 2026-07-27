import type { RepoLabel } from "@/types/repo";

function normalizeColor(color: string | null) {
  if (!color) return null;
  return color.startsWith("#") ? color : `#${color}`;
}

export default function RepoLabelList({
  labels,
  max = 3,
}: {
  labels: RepoLabel[];
  max?: number;
}) {
  if (!labels || labels.length === 0) return null;

  const visible = labels.slice(0, max);
  const remaining = labels.length - visible.length;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {visible.map((label) => {
        const color = normalizeColor(label.color);

        return (
          <span
            className="inline-flex h-4 items-center rounded-sm border px-1 text-[10px] font-medium text-muted-foreground"
            key={label.name}
            style={
              color
                ? {
                    borderColor: `${color}66`,
                    backgroundColor: `${color}1a`,
                  }
                : undefined
            }
          >
            {label.name}
          </span>
        );
      })}
      {remaining > 0 && (
        <span className="text-[10px] text-muted-foreground">+{remaining}</span>
      )}
    </span>
  );
}
