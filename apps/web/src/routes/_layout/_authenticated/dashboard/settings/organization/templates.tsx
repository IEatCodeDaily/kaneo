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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiUrl } from "@/fetchers/get-api-url";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit task template" : "New task template"}
            </DialogTitle>
            <DialogDescription>
              Set reusable defaults. Every value can still be changed after
              applying the template.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
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
            <div className="grid gap-3 sm:grid-cols-3">
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
                <Label htmlFor="template-start">Start date</Label>
                <Input
                  id="template-start"
                  type="date"
                  value={data.startDate?.slice(0, 10) ?? ""}
                  onChange={(event) =>
                    setData({ ...data, startDate: event.target.value || null })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-due">Due date</Label>
                <Input
                  id="template-due"
                  type="date"
                  value={data.dueDate?.slice(0, 10) ?? ""}
                  onChange={(event) =>
                    setData({ ...data, dueDate: event.target.value || null })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              {editingId ? "Save changes" : "Create template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
