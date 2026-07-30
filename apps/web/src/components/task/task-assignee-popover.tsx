import { useQuery } from "@tanstack/react-query";
import { Check, Search, Users } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateTaskAssignee } from "@/hooks/mutations/task/use-update-task-assignee";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { authClient } from "@/lib/auth-client";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

type Props = { task: Task; organizationId: string; children: React.ReactNode };
type Assignment = {
  type: "user" | "team";
  value: string;
  label: string;
  image?: string;
};

export default function TaskAssigneePopover({
  task,
  organizationId,
  children,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { mutateAsync } = useUpdateTaskAssignee();
  const { data: organizationMembers } =
    useGetActiveOrganizationMembers(organizationId);
  const teams = useQuery({
    queryKey: ["organization-teams", organizationId],
    enabled: open && Boolean(organizationId),
    queryFn: async () => {
      const result = await authClient.organization.listTeams({
        query: { organizationId },
      });
      if (result.error)
        throw new Error(result.error.message || "Failed to load teams");
      return result.data ?? [];
    },
  });
  const canAssign = useOrganizationPermission().canAssignTasks();
  const options = useMemo<Assignment[]>(() => {
    const users =
      organizationMembers?.members?.map((member) => ({
        type: "user" as const,
        value: member.userId,
        label: member.user?.name ?? member.userId,
        image: member.user?.image ?? undefined,
      })) ?? [];
    const teamOptions = (teams.data ?? []).map((team) => ({
      type: "team" as const,
      value: team.id,
      label: team.name,
    }));
    const needle = search.trim().toLocaleLowerCase();
    return [...users, ...teamOptions].filter((option) =>
      option.label.toLocaleLowerCase().includes(needle),
    );
  }, [organizationMembers, teams.data, search]);

  const assign = useCallback(
    async (assignment?: Assignment) => {
      try {
        await mutateAsync({
          ...task,
          userId: assignment?.type === "user" ? assignment.value : null,
          teamId: assignment?.type === "team" ? assignment.value : null,
        });
        setOpen(false);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("tasks:popover.assignee.updateError"),
        );
      }
    },
    [mutateAsync, task, t],
  );

  if (!canAssign) return <>{children}</>;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start">
        <div className="relative mb-1">
          <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search people and teams"
            aria-label="Search assignees"
            className="h-8 pl-8"
          />
        </div>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => assign()}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border">
              ?
            </span>
            {t("tasks:popover.assignee.unassigned")}
            {!task.userId && !task.teamId && (
              <Check className="ml-auto h-4 w-4" />
            )}
          </Button>
          {options.map((option) => (
            <Button
              key={`${option.type}:${option.value}`}
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => assign(option)}
            >
              {option.type === "team" ? (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                  <Users className="h-4 w-4" />
                </span>
              ) : (
                <Avatar className="h-6 w-6">
                  <AvatarImage src={option.image} alt={option.label} />
                  <AvatarFallback>{getInitials(option.label)}</AvatarFallback>
                </Avatar>
              )}
              <span className="truncate">{option.label}</span>
              <span className="text-xs text-muted-foreground">
                {option.type === "team" ? "Team" : "Member"}
              </span>
              {(option.type === "user" ? task.userId : task.teamId) ===
                option.value && <Check className="ml-auto h-4 w-4" />}
            </Button>
          ))}
          {options.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">
              No assignees found
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
