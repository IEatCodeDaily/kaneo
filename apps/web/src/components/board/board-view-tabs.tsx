import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type View = {
  value: string;
  label: string;
  icon: ReactNode;
};

type BoardViewTabsProps = {
  value: string;
  views: View[];
  onValueChange: (value: string) => void;
  "aria-label": string;
  className?: string;
};

export function BoardViewTabs({
  value,
  views,
  onValueChange,
  "aria-label": ariaLabel,
  className,
}: BoardViewTabsProps) {
  return (
    <div
      className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="board-view-tabs-scroller"
    >
      <Tabs value={value} onValueChange={onValueChange} className={className}>
        <TabsList
          aria-label={ariaLabel}
          className="h-8 shrink-0 justify-start rounded-full border border-border/80 bg-muted/55 p-1 [&_[data-slot=tab-indicator]]:rounded-full"
        >
          {views.map((view) => (
            <TabsTrigger
              key={view.value}
              value={view.value}
              className="h-6 gap-1.5 rounded-full px-2 text-xs"
            >
              {view.icon}
              <span className="hidden 2xl:inline">{view.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
