import { Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getApiUrl } from "@/fetchers/get-api-url";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import {
  clampAiChatSize,
  DEFAULT_AI_CHAT_SIZE,
  parseAiChatSize,
} from "@/lib/ai-chat-size";

type Settings = {
  enabled: boolean;
  configured: boolean;
  effectiveTokenLimit: number;
  effectiveCharacterLimit: number;
};
type ChatEntry = { role: "user" | "assistant"; text: string };

export function AiChatBubble() {
  const { data: organization } = useActiveOrganization();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const panelRef = useRef<HTMLElement>(null);
  const storageKey = organization?.id
    ? `kaneo:ai-chat-size:${organization.id}`
    : null;
  const [size, setSize] = useState(DEFAULT_AI_CHAT_SIZE);
  const [sizeHydrated, setSizeHydrated] = useState(false);

  useEffect(() => {
    if (!organization?.id) return setSettings(null);
    void fetch(getApiUrl(`/ai/organization/${organization.id}/settings`), {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setSettings);
  }, [organization?.id]);

  useEffect(() => {
    if (!storageKey) {
      setSizeHydrated(false);
      return;
    }
    const saved = parseAiChatSize(window.localStorage.getItem(storageKey));
    setSize(
      clampAiChatSize(saved ?? DEFAULT_AI_CHAT_SIZE, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
    setSizeHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!open || !panelRef.current || !storageKey || !sizeHydrated) return;
    const panel = panelRef.current;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      // Inline width/height control the border box (global border-box sizing),
      // so persisting contentRect would shave borders/padding on every cycle.
      const bounds = panel.getBoundingClientRect();
      const next = clampAiChatSize(
        { width: bounds.width, height: bounds.height },
        { width: window.innerWidth, height: window.innerHeight },
      );
      setSize(next);
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [open, sizeHydrated, storageKey]);

  if (!organization || !settings?.enabled || !settings.configured) return null;
  const over = message.length > settings.effectiveCharacterLimit;

  const send = async () => {
    const text = message.trim();
    if (!text || over || pending) return;
    setMessage("");
    setHistory((old) => [...old, { role: "user", text }]);
    setPending(true);
    try {
      const taskId = window.location.pathname.match(/\/task\/([^/]+)/)?.[1];
      const response = await fetch(
        getApiUrl(`/ai/organization/${organization.id}/chat`),
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, taskId }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "AI request failed");
      const actionText = (
        payload.actions as Array<{ type: string }> | undefined
      )
        ?.map((action) =>
          action.type === "assign_task"
            ? "Task assignment updated."
            : "Task label added.",
        )
        .join(" ");
      setHistory((old) => [
        ...old,
        {
          role: "assistant",
          text: [payload.message, actionText].filter(Boolean).join("\n"),
        },
      ]);
    } catch (error) {
      setHistory((old) => [
        ...old,
        {
          role: "assistant",
          text: error instanceof Error ? error.message : "AI request failed",
        },
      ]);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open ? (
        <section
          className="flex max-h-[calc(100vh-2.5rem)] max-w-[calc(100vw-2rem)] resize flex-col overflow-hidden rounded-xl border bg-background shadow-2xl max-sm:h-[calc(100vh-2.5rem)] max-sm:w-[calc(100vw-2rem)] max-sm:resize-none"
          aria-label="Organization AI assistant"
          data-testid="ai-chat-panel"
          ref={panelRef}
          style={{ width: size.width, height: size.height }}
        >
          <header className="flex items-center justify-between border-b p-3">
            <div className="flex items-center gap-2 font-medium">
              <Sparkles className="size-4" /> {organization.name} AI
            </div>
            <Button
              aria-label="Close organization AI assistant"
              onClick={() => setOpen(false)}
              size="icon"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          </header>
          <div
            className="flex-1 space-y-3 overflow-y-auto p-3"
            data-testid="ai-chat-history"
          >
            {history.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ask about this organization or tell me to assign a task or add a
                label.
              </p>
            )}
            {history.map((entry, index) => (
              <div
                className={`rounded-lg p-2 text-sm ${entry.role === "user" ? "ml-8 bg-primary text-primary-foreground" : "mr-8 bg-muted"}`}
                key={`${entry.role}-${index}`}
              >
                {entry.text}
              </div>
            ))}
            {pending && (
              <div className="mr-8 rounded-lg bg-muted p-2 text-sm">
                Thinking…
              </div>
            )}
          </div>
          <div className="border-t p-3">
            <textarea
              aria-label="Message organization AI assistant"
              className="min-h-20 w-full resize-none rounded-md border bg-background p-2 text-sm"
              maxLength={settings.effectiveCharacterLimit + 1}
              onChange={(e) => setMessage(e.target.value)}
              value={message}
            />
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span className={over ? "text-destructive" : ""}>
                {message.length}/{settings.effectiveCharacterLimit}
              </span>
              <Button
                disabled={!message.trim() || over || pending}
                onClick={() => void send()}
                size="sm"
              >
                Send
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <Button
          aria-label="Open organization AI assistant"
          className="size-12 rounded-full shadow-lg"
          onClick={() => setOpen(true)}
          size="icon"
        >
          <Sparkles className="size-5" />
        </Button>
      )}
    </div>
  );
}

export default AiChatBubble;
