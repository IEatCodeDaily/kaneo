export type OrganizationMembershipSummary = {
  organizationId: string;
  organizationName: string;
  isOwner: boolean;
  memberCount: number;
  ownerCount: number;
};

export type AccountDeletionPlan = {
  blockedOrganizationNames: string[];
  organizationIdsToDelete: string[];
  organizationIdsToLeave: string[];
};

export function hasOwnerRole(role: string) {
  return role
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .includes("owner");
}

export function planAccountDeletion(
  memberships: OrganizationMembershipSummary[],
): AccountDeletionPlan {
  const plan: AccountDeletionPlan = {
    blockedOrganizationNames: [],
    organizationIdsToDelete: [],
    organizationIdsToLeave: [],
  };

  for (const membership of memberships) {
    if (membership.memberCount <= 1) {
      plan.organizationIdsToDelete.push(membership.organizationId);
      continue;
    }

    if (membership.isOwner && membership.ownerCount <= 1) {
      plan.blockedOrganizationNames.push(membership.organizationName);
      continue;
    }

    plan.organizationIdsToLeave.push(membership.organizationId);
  }

  return plan;
}

export function formatBlockedOrganizationsMessage(names: string[]) {
  const quoted = names.map((name) => `"${name}"`);
  const list =
    quoted.length === 1
      ? quoted[0]
      : `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;

  return `You are the only owner of ${list}. Transfer ownership or delete ${names.length === 1 ? "it" : "them"} before deleting your account.`;
}
