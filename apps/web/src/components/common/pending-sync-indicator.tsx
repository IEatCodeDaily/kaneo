import { Loader2 } from "lucide-react";

export function PendingSyncIndicator({ pending }: { pending: boolean }) {
  if (!pending) return null;
  return (
    <div
      aria-live="polite"
      className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 text-xs font-medium shadow-lg backdrop-blur-sm"
      role="status"
    >
      <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
      Saving changes…
    </div>
  );
}
