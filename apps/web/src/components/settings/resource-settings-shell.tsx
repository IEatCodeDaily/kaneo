import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/cn";

type Item = { id: string; label: string };
type Tab = { segment: string; label: string };

/**
 * Settings for one resource kind (boards, repos): a nested list picks the
 * resource, horizontal tabs pick the settings page. The URL stays
 * `<base>/<id>/<segment>`, so deep links keep working.
 */
export default function ResourceSettingsShell({
  base,
  icon: Icon,
  title,
  items,
  tabs,
  activeId,
  activeSegment,
  emptyLabel,
  selectLabel,
}: {
  base: string;
  icon: LucideIcon;
  title: string;
  items: Item[];
  tabs: Tab[];
  activeId?: string;
  activeSegment: string;
  emptyLabel: string;
  selectLabel: string;
}) {
  const navigate = useNavigate();
  const segment = tabs.some((tab) => tab.segment === activeSegment)
    ? activeSegment
    : tabs[0].segment;
  const firstId = items[0]?.id;

  // The bare section URL lands on the first resource instead of an empty pane.
  useEffect(() => {
    if (!activeId && firstId)
      void navigate({
        to: `${base}/${firstId}/${tabs[0].segment}`,
        replace: true,
      });
  }, [activeId, firstId, base, navigate, tabs]);

  const active = items.find((item) => item.id === activeId);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-col gap-4 md:flex-row md:gap-0">
      <nav
        aria-label={title}
        className="hidden shrink-0 flex-col gap-0.5 overflow-y-auto md:flex md:w-56 md:border-r md:border-border md:pr-3"
      >
        <p className="flex items-center gap-2 px-2 pb-2 font-semibold text-sm">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {title}
          <span className="ml-auto font-normal text-muted-foreground text-xs">
            {items.length}
          </span>
        </p>
        {items.length === 0 ? (
          <p className="px-2 text-muted-foreground text-sm">{emptyLabel}</p>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              to={`${base}/${item.id}/${segment}`}
              aria-current={item.id === activeId ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center truncate rounded-md px-2 text-sm sm:min-h-8",
                item.id === activeId
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <span className="truncate">{item.label}</span>
            </Link>
          ))
        )}
      </nav>

      {/* Phones get a select; a second stacked list would push content off-screen. */}
      <select
        aria-label={selectLabel}
        value={activeId ?? ""}
        onChange={(event) =>
          void navigate({ to: `${base}/${event.target.value}/${segment}` })
        }
        className="min-h-11 rounded-md border bg-background px-3 md:hidden"
      >
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>

      <div className="flex w-full min-w-0 flex-1 flex-col gap-4 md:pl-6">
        {active ? (
          <>
            <h2 className="font-semibold text-lg">{active.label}</h2>
            <nav
              aria-label={`${active.label} settings`}
              className="-mt-1 flex w-full min-w-0 max-w-full gap-1 overflow-x-auto border-b border-border"
            >
              {tabs.map((tab) => (
                <Link
                  key={tab.segment}
                  to={`${base}/${active.id}/${tab.segment}`}
                  aria-current={tab.segment === segment ? "page" : undefined}
                  className={cn(
                    "-mb-px flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm sm:min-h-9",
                    tab.segment === segment
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
            {/* A block wrapper: pages centre themselves with mx-auto, which in a
                flex column would size them to content instead of the pane. */}
            <div className="w-full min-w-0">
              <Outlet />
            </div>
          </>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{emptyLabel}</p>
        ) : null}
      </div>
    </div>
  );
}
