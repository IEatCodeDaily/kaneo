import { Badge } from "@/components/ui/badge";

/** Rollout stage marker; one style for every sidebar section and setting. */
export function FeatureStageBadge({ stage }: { stage: "Alpha" | "Beta" }) {
  return (
    <Badge className="h-4 px-1 text-xs" variant="secondary">
      {stage}
    </Badge>
  );
}
