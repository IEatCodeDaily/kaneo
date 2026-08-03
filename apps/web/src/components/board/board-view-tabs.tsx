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
    <Tabs value={value} onValueChange={onValueChange} className={className}>
      <TabsList
        aria-label={ariaLabel}
        className="h-8 max-w-full justify-start overflow-x-auto border border-border/80 bg-background"
      >
        {views.map((view) => (
          <TabsTrigger
            key={view.value}
            value={view.value}
            className="h-6 gap-1.5 px-2 text-xs"
          >
            {view.icon}
            {view.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
