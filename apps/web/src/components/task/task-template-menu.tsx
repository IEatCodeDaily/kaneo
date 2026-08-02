import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getApiUrl } from "@/fetchers/get-api-url";

export type TaskTemplateData = {
  title: string;
  description: string | null;
  priority: string | null;
  startDate: string | null;
  dueDate: string | null;
};

type TaskTemplate = {
  id: string;
  name: string;
  data: TaskTemplateData;
};

export default function TaskTemplateMenu({
  organizationId,
  current,
  onApply,
  disabled = false,
}: {
  organizationId: string;
  current: TaskTemplateData;
  onApply: (template: TaskTemplate) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const queryKey = ["task-templates", organizationId];
  const { data: templates = [] } = useQuery<TaskTemplate[]>({
    queryKey,
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const response = await fetch(
        getApiUrl(`task-template/organization/${organizationId}`),
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Failed to load task templates");
      return response.json();
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        getApiUrl(`task-template/organization/${organizationId}`),
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), data: current }),
        },
      );
      if (!response.ok) throw new Error("Failed to create task template");
      return response.json();
    },
    onSuccess: () => {
      setName("");
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(
        getApiUrl(`task-template/organization/${organizationId}/${id}`),
        { method: "DELETE", credentials: "include" },
      );
      if (!response.ok) throw new Error("Failed to delete task template");
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button disabled={disabled} size="sm" type="button" variant="ghost">
            <FileText className="size-3.5" />
            {t("tasks:templates.label")}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72 p-2">
        <div className="max-h-56 overflow-y-auto">
          {templates.map((template) => (
            <div className="flex items-center gap-1" key={template.id}>
              <button
                className="min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onApply(template);
                  setOpen(false);
                }}
                type="button"
              >
                {template.name}
              </button>
              <Button
                aria-label={t("tasks:templates.delete")}
                onClick={() => remove.mutate(template.id)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          {templates.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              {t("tasks:templates.empty")}
            </p>
          ) : null}
        </div>
        <div className="mt-2 flex gap-1 border-t pt-2">
          <Input
            aria-label={t("tasks:templates.name")}
            className="h-8"
            onChange={(event) => setName(event.target.value)}
            placeholder={t("tasks:templates.name")}
            value={name}
          />
          <Button
            aria-label={t("tasks:templates.save")}
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
            size="icon-sm"
            type="button"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
