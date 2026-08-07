import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { PrincipalOption } from "@/components/principal-selector";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import { authClient } from "@/lib/auth-client";
import TaskFlagPicker from "./task-flag-picker";

type TaskFlagSectionProps = {
  taskId: string;
  boardId: string;
  organizationId: string;
};

/**
 * #107: the task-detail flag surface. This is a single topbar control that
 * opens a milestone-style popover; there is no separate flag modal and no
 * bespoke user/team dropdown — targets come from the same member/team
 * selector used by board visibility settings.
 */
export function TaskFlagSection({
  taskId,
  boardId,
  organizationId,
}: TaskFlagSectionProps) {
  const { data: memberData, isPending: membersPending } =
    useGetActiveOrganizationMembers(organizationId);

  const { data: teams = [], isPending: teamsPending } = useQuery({
    queryKey: ["organization-teams", organizationId, "task-flags"],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const result = await authClient.organization.listTeams({
        query: { organizationId },
      });
      if (result.error) {
        throw new Error(result.error.message || "Failed to load teams");
      }
      return result.data ?? [];
    },
  });

  // authClient.organization.listMembers resolves to { members, total }, NOT an
  // array. Treating it as an array crashed the whole task detail route with
  // "l.map is not a function" — every other call site reads `.members`.
  const principals: PrincipalOption[] = useMemo(
    () => [
      ...(memberData?.members ?? []).map(
        (member: {
          userId?: string;
          user?: { name?: string; email?: string };
        }) => ({
          id: member.userId ?? "",
          kind: "member" as const,
          name: member.user?.name ?? member.user?.email ?? "",
          detail: member.user?.email,
        }),
      ),
      ...teams.map((team: { id: string; name: string }) => ({
        id: team.id,
        kind: "team" as const,
        name: team.name,
        detail: "Team",
      })),
    ],
    [memberData, teams],
  );

  return (
    <div data-testid="task-flag-section" className="flex min-w-0 items-center">
      <TaskFlagPicker
        taskId={taskId}
        boardId={boardId}
        principals={principals}
        principalsLoading={membersPending || teamsPending}
      />
    </div>
  );
}

export default TaskFlagSection;
