import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PrincipalPickerList, {
  type PrincipalPickerOption,
} from "@/components/principal-picker-list";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateTaskAssignee } from "@/hooks/mutations/task/use-update-task-assignee";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

type Props = { task: Task; organizationId: string; children: React.ReactNode };
type Assignment = PrincipalPickerOption;

export default function TaskAssigneePopover({
  task,
  organizationId,
  children,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
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
    return [...users, ...teamOptions];
  }, [organizationMembers, teams.data]);

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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start">
        <PrincipalPickerList
          clearLabel={t("tasks:popover.assignee.unassigned")}
          onSelect={(option) => assign(option)}
          options={options}
          selected={
            task.userId
              ? { type: "user", value: task.userId }
              : task.teamId
                ? { type: "team", value: task.teamId }
                : null
          }
          searchAriaLabel="Search assignees"
        />
      </PopoverContent>
    </Popover>
  );
}
