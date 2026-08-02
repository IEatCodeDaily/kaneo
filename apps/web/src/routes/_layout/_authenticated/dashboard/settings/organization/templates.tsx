import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import PageTitle from "@/components/page-title";
import type { TaskTemplateData } from "@/components/task/task-template-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  CardAction,
  CardDescription,
  CardFrame,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "@/components/ui/sheet";
import { getApiUrl } from "@/fetchers/get-api-url";
import useGetLabelsByOrganization from "@/hooks/queries/label/use-get-labels-by-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { isTemplateDateOffset } from "@/lib/task-template-date-offset";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization/templates",
)({ component: RouteComponent });

type Template = { id: string; name: string; data: TaskTemplateData };
const empty: TaskTemplateData = {
  title: "",
  description: null,
  priority: "no-priority",
  startDate: null,
  dueDate: null,
  status: null,
  labels: [],
  startDateOffset: null,
  dueDateOffset: null,
};

function RouteComponent() {
  const { organization, canManageOrganization } = useOrganizationPermission();
  const canEdit = canManageOrganization();
  const organizationId = organization?.id ?? "";
  const queryClient = useQueryClient();
  const queryKey = ["task-templates", organizationId];
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [data, setData] = useState(empty);
  const { data: organizationLabels = [] } =
    useGetLabelsByOrganization(organizationId);
  const startOffsetValid = isTemplateDateOffset(data.startDateOffset ?? "");
  const dueOffsetValid = isTemplateDateOffset(data.dueDateOffset ?? "");
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey,
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const response = await fetch(
        getApiUrl(`task-template/organization/${organizationId}`),
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Failed to load templates");
      return response.json();
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        getApiUrl(
          `task-template/organization/${organizationId}${editingId ? `/${editingId}` : ""}`,
        ),
        {
          method: editingId ? "PUT" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), data }),
        },
      );
      if (!response.ok) throw new Error("Failed to save template");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      setOpen(false);
      setEditingId(null);
      setName("");
      setData(empty);
      toast.success(editingId ? "Template updated" : "Template created");
    },
    onError: () => toast.error("Failed to save template"),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(
        getApiUrl(`task-template/organization/${organizationId}/${id}`),
        { method: "DELETE", credentials: "include" },
      );
      if (!response.ok) throw new Error("Failed to delete template");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      toast.success("Template deleted");
    },
  });

  return (
    <>
      <PageTitle title="Task templates" />
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Task templates</h1>
          <p className="text-muted-foreground">
            Reusable starting values for tickets in this organization.
          </p>
        </div>
        <CardFrame>
          <CardHeader>
            <div>
              <CardTitle>Templates</CardTitle>
              <CardDescription>
                Create and manage reusable ticket templates.
              </CardDescription>
            </div>
            <CardAction>
              <Button
                disabled={!canEdit}
                onClick={() => {
                  setEditingId(null);
                  setName("");
                  setData(empty);
                  setOpen(true);
                }}
              >
                <Plus className="size-4" />
                New template
              </Button>
            </CardAction>
          </CardHeader>
          <CardPanel className="divide-y p-0">
            {templates.map((template) => (
              <div
                className="flex items-center gap-3 px-4 py-3"
                key={template.id}
              >
                <FileText className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {template.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {template.data.title || "Untitled ticket"}
                  </p>
                </div>
                <Button
                  aria-label={`Edit ${template.name}`}
                  disabled={!canEdit}
                  onClick={() => {
                    setEditingId(template.id);
                    setName(template.name);
                    setData(template.data);
                    setOpen(true);
                  }}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  aria-label={`Delete ${template.name}`}
                  disabled={!canEdit}
                  onClick={() => setDeleting(template)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {!templates.length && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No templates yet.
              </div>
            )}
          </CardPanel>
        </CardFrame>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col overflow-hidden p-0 sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {editingId ? "Edit task template" : "New task template"}
            </SheetTitle>
            <SheetDescription>
              Set reusable defaults. Every value can still be changed after
              applying the template.
            </SheetDescription>
          </SheetHeader>
          <SheetPanel className="grid flex-1 gap-4 px-5 py-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template name</Label>
              <Input
                id="template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Bug report"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-title">Default title</Label>
              <Input
                id="template-title"
                value={data.title}
                onChange={(event) =>
                  setData({ ...data, title: event.target.value })
                }
                placeholder="Bug: "
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-description">Default description</Label>
              <textarea
                id="template-description"
                className="min-h-32 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={data.description ?? ""}
                onChange={(event) =>
                  setData({ ...data, description: event.target.value || null })
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="template-status">Status</Label>
                <Input
                  id="template-status"
                  value={data.status ?? ""}
                  onChange={(event) =>
                    setData({ ...data, status: event.target.value || null })
                  }
                  placeholder="To Do"
                />
                <p className="text-xs text-muted-foreground">
                  Resolved by column name or slug when applied.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-priority">Priority</Label>
                <select
                  id="template-priority"
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={data.priority ?? "no-priority"}
                  onChange={(event) =>
                    setData({ ...data, priority: event.target.value })
                  }
                >
                  <option value="no-priority">No priority</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-start">Start date offset</Label>
                <Input
                  aria-describedby="template-start-help"
                  aria-invalid={!startOffsetValid}
                  id="template-start"
                  value={data.startDateOffset ?? ""}
                  onChange={(event) =>
                    setData({
                      ...data,
                      startDate: null,
                      startDateOffset: event.target.value || null,
                    })
                  }
                  placeholder="+7d"
                />
                <p
                  className={
                    startOffsetValid
                      ? "text-xs text-muted-foreground"
                      : "text-xs text-destructive"
                  }
                  id="template-start-help"
                >
                  Use +/−N followed by m, h, d, or w.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-due">Due date offset</Label>
                <Input
                  aria-describedby="template-due-help"
                  aria-invalid={!dueOffsetValid}
                  id="template-due"
                  value={data.dueDateOffset ?? ""}
                  onChange={(event) =>
                    setData({
                      ...data,
                      dueDate: null,
                      dueDateOffset: event.target.value || null,
                    })
                  }
                  placeholder="+14d"
                />
                <p
                  className={
                    dueOffsetValid
                      ? "text-xs text-muted-foreground"
                      : "text-xs text-destructive"
                  }
                  id="template-due-help"
                >
                  Use +/−N followed by m, h, d, or w.
                </p>
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Labels</legend>
              <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border p-3">
                {organizationLabels
                  .filter((label) => !label.taskId)
                  .map((label) => {
                    const selected = data.labels?.includes(label.name) ?? false;
                    return (
                      <label
                        className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-sm"
                        key={label.id}
                      >
                        <input
                          checked={selected}
                          onChange={() =>
                            setData({
                              ...data,
                              labels: selected
                                ? (data.labels ?? []).filter(
                                    (name) => name !== label.name,
                                  )
                                : [...(data.labels ?? []), label.name],
                            })
                          }
                          type="checkbox"
                        />
                        {label.name}
                      </label>
                    );
                  })}
                {!organizationLabels.some((label) => !label.taskId) && (
                  <span className="text-xs text-muted-foreground">
                    No organization labels.
                  </span>
                )}
              </div>
            </fieldset>
          </SheetPanel>
          <SheetFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !name.trim() ||
                save.isPending ||
                !startOffsetValid ||
                !dueOffsetValid
              }
              onClick={() => save.mutate()}
            >
              {editingId ? "Save changes" : "Create template"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `“${deleting.name}” will be permanently deleted.`
                : "This template will be permanently deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                deleting &&
                remove.mutate(deleting.id, {
                  onSuccess: () => setDeleting(null),
                })
              }
            >
              Delete template
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
