import type { ReactNode } from "react";

// 24-col grid like the mock; below md every panel collapses to full width.
// A scoped style tag beats 7 dynamic span utility classes.
export function DashboardGrid({ children }: { children: ReactNode }) {
  return (
    <div
      className="dashboards-grid grid gap-3"
      style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
    >
      <style>
        {
          "@media (max-width: 767px){.dashboards-grid>*{grid-column:span 24!important}}"
        }
      </style>
      {children}
    </div>
  );
}

export function GridPanel({
  span,
  children,
}: {
  span: number;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0" style={{ gridColumn: `span ${span}` }}>
      {children}
    </div>
  );
}
