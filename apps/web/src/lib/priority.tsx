import {
  ChevronDown,
  ChevronsUp,
  ChevronUp,
  CircleAlert,
  Minus,
} from "lucide-react";

export function getPriorityIcon(priority: string) {
  switch (priority) {
    case "urgent":
      return <CircleAlert className="size-3 text-destructive-foreground" />;
    case "high":
      return <ChevronsUp className="size-3 text-warning-foreground" />;
    case "medium":
      return <ChevronUp className="size-3 text-warning-foreground/80" />;
    case "low":
      return <ChevronDown className="size-3 text-info-foreground/85" />;
    case "no-priority":
      return <Minus className="size-3 text-muted-foreground" />;
    default:
      return <Minus className="size-3 text-muted-foreground" />;
  }
}
