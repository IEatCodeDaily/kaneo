import { Bot, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentManager } from "@/components/settings/agent-manager";
import { Input } from "@/components/ui/input";
import useGetOrganizationPrincipals from "@/hooks/queries/organization-members/use-get-organization-principals";
import type {
  OrganizationMember,
  OrganizationMemberInvitation,
} from "@/types/organization-member";
import MembersTable from "./members-table";

type Props = {
  organizationId: string;
  invitations: OrganizationMemberInvitation[];
  users: OrganizationMember[];
  canManageAgents: boolean;
};

export function OrganizationMembersGroups({
  organizationId,
  invitations,
  users,
  canManageAgents,
}: Props) {
  const { t } = useTranslation();
  /*
   * Agents are first-class members: a human user and an agent user are
   * identical as far as membership goes, so they belong in the SAME table with
   * the same role column. They used to be filtered out here and surfaced only
   * as API keys further down, which made them look like credentials rather
   * than members.
   *
   * The agent section below stays, but it is now purely credential management
   * (issue/revoke keys) — not the only place an agent is visible.
   */
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const { data: principals } = useGetOrganizationPrincipals(organizationId);
  const kinds = new Map(principals?.map((item) => [item.id, item.kind]));
  const people = users.filter(
    (member) =>
      (type === "all" || kinds.get(member.userId) === type) &&
      (role === "all" || member.role === role) &&
      `${member.user.name} ${member.user.email}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );

  return (
    <div className="space-y-8">
      <section aria-labelledby="people-heading" className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Users className="size-4 text-muted-foreground" />
          <h2 id="people-heading" className="text-sm font-semibold">
            {t("team:members.pageTitle")}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Member type"
            value={type}
            disabled={!principals}
            onChange={(event) => setType(event.target.value)}
            className="min-h-11 rounded-md border bg-background px-3 text-sm sm:min-h-8"
          >
            <option value="all">
              {t("settings:navigation.allTypes", { defaultValue: "All types" })}
            </option>
            <option value="user">{t("team:members.people")}</option>
            <option value="agent">{t("team:members.agents")}</option>
          </select>
          <select
            aria-label="Member role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="min-h-11 rounded-md border bg-background px-3 text-sm sm:min-h-8"
          >
            <option value="all">
              {t("settings:navigation.allRoles", { defaultValue: "All roles" })}
            </option>
            {[...new Set(users.map((member) => member.role))].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <Input
            aria-label="Search members"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("settings:navigation.searchMembers", {
              defaultValue: "Search name or email",
            })}
            className="min-h-11 sm:min-h-8 sm:ml-auto sm:w-64"
          />
        </div>
        <MembersTable
          organizationId={organizationId}
          users={people}
          principalKinds={kinds}
          invitations={invitations}
        />
      </section>

      <section
        aria-labelledby="agents-heading"
        className="space-y-3 border-t pt-6"
      >
        <div className="flex items-center gap-2 px-1">
          <Bot className="size-4 text-muted-foreground" />
          <h2 id="agents-heading" className="text-sm font-semibold">
            {t("team:members.agents")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {t("team:members.agentsCredentialsHint")}
          </span>
        </div>
        {canManageAgents ? (
          <AgentManager />
        ) : (
          <p className="px-1 text-sm text-muted-foreground">
            {t("team:members.agentsManagedByAdmins")}
          </p>
        )}
      </section>
    </div>
  );
}
