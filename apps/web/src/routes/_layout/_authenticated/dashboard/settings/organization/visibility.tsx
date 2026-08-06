import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import PageTitle from "@/components/page-title";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiUrl } from "@/fetchers/get-api-url";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization/visibility",
)({ component: RouteComponent });

type Privilege = "none" | "view" | "edit" | "manage";
type ResourceType = "board" | "repo" | "table";

type VisibilityDefaults = {
  defaultResourcePrivilege: Privilege;
  resourceDefaultOverrides: Partial<Record<ResourceType, Privilege>>;
  resourceTypes: readonly ResourceType[];
};

const PRIVILEGE_LABELS: Record<Privilege, string> = {
  none: "Hidden",
  view: "View",
  edit: "Edit",
  manage: "Manage",
};

const PRIVILEGE_DESCRIPTIONS: Record<Privilege, string> = {
  none: "Members cannot see the resource at all.",
  view: "Members can open and read, but not change anything.",
  edit: "Members can work inside the resource but not administer it.",
  manage: "Members can administer the resource, including its settings.",
};

const RESOURCE_LABELS: Record<ResourceType, string> = {
  board: "Boards",
  repo: "Repositories",
  table: "Tables",
};

/** Sentinel for "no override — inherit the organization-wide default". */
const INHERIT = "inherit";

async function request(path: string, init?: RequestInit) {
  const response = await fetch(getApiUrl(path), {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok)
    throw new Error((await response.text()) || "Request failed");
  return response.json();
}

function RouteComponent() {
  const { data: organization } = useActiveOrganization();
  const { canManageOrganization } = useOrganizationPermission();
  const queryClient = useQueryClient();
  const organizationId = organization?.id ?? "";
  const queryKey = ["organization-visibility-defaults", organizationId];
  const basePath = `organization/${organizationId}/visibility-defaults`;

  const defaults = useQuery<VisibilityDefaults>({
    queryKey,
    enabled: Boolean(organizationId),
    queryFn: () => request(basePath),
  });

  const save = useMutation({
    mutationFn: (body: {
      defaultResourcePrivilege?: Privilege;
      resourceDefaultOverrides?: Partial<Record<ResourceType, Privilege>>;
    }) => request(basePath, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Default visibility updated");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update default visibility",
      ),
  });

  const editable = canManageOrganization() && !save.isPending;
  const data = defaults.data;

  const setOrgDefault = (value: Privilege) =>
    save.mutate({ defaultResourcePrivilege: value });

  const setOverride = (resourceType: ResourceType, value: string) => {
    if (!data) return;
    const next = { ...data.resourceDefaultOverrides };
    if (value === INHERIT) delete next[resourceType];
    else next[resourceType] = value as Privilege;
    // Send the whole map: an absent key IS the inherit state server-side.
    save.mutate({ resourceDefaultOverrides: next });
  };

  return (
    <>
      <PageTitle title="Organization visibility" />
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Visibility</h1>
          <p className="text-muted-foreground">
            Default access organization members get to resources that have no
            explicit user or team grant. Owners and admins always keep full
            access, and per-resource grants override these defaults.
          </p>
        </div>

        <section className="rounded-xl border border-border bg-background">
          <div className="flex items-start justify-between gap-6 px-4 py-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 text-muted-foreground">
                <Eye aria-hidden="true" className="size-4" />
              </div>
              <div className="space-y-1">
                <h2 className="font-medium">Organization-wide default</h2>
                <p className="max-w-xl text-sm text-muted-foreground">
                  {data
                    ? PRIVILEGE_DESCRIPTIONS[data.defaultResourcePrivilege]
                    : "Applies to every resource type without its own override."}
                </p>
              </div>
            </div>
            <div className="w-36">
              <Label className="sr-only" htmlFor="org-default-privilege">
                Organization-wide default access
              </Label>
              <Select
                value={data?.defaultResourcePrivilege ?? "manage"}
                onValueChange={(value) => setOrgDefault(value as Privilege)}
                disabled={!editable || !data}
              >
                <SelectTrigger
                  id="org-default-privilege"
                  aria-label="Organization-wide default access"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIVILEGE_LABELS) as Privilege[]).map(
                    (privilege) => (
                      <SelectItem key={privilege} value={privilege}>
                        {PRIVILEGE_LABELS[privilege]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-background">
          {(data?.resourceTypes ?? []).map((resourceType, index) => {
            const override = data?.resourceDefaultOverrides[resourceType];
            const effective = override ?? data?.defaultResourcePrivilege;
            return (
              <div key={resourceType}>
                {index > 0 && <div className="border-border border-t" />}
                <div className="flex items-start justify-between gap-6 px-4 py-4">
                  <div className="space-y-1">
                    <h2 className="font-medium">
                      {RESOURCE_LABELS[resourceType]}
                    </h2>
                    <p className="max-w-xl text-sm text-muted-foreground">
                      {override
                        ? PRIVILEGE_DESCRIPTIONS[override]
                        : `Inherits the organization-wide default${
                            effective ? ` (${PRIVILEGE_LABELS[effective]})` : ""
                          }.`}
                    </p>
                  </div>
                  <div className="w-44">
                    <Label
                      className="sr-only"
                      htmlFor={`override-${resourceType}`}
                    >
                      {`Default access for ${RESOURCE_LABELS[resourceType]}`}
                    </Label>
                    <Select
                      value={override ?? INHERIT}
                      onValueChange={(value) =>
                        setOverride(resourceType, value)
                      }
                      disabled={!editable || !data}
                    >
                      <SelectTrigger
                        id={`override-${resourceType}`}
                        aria-label={`Default access for ${RESOURCE_LABELS[resourceType]}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={INHERIT}>
                          Use organization default
                        </SelectItem>
                        {(Object.keys(PRIVILEGE_LABELS) as Privilege[]).map(
                          (privilege) => (
                            <SelectItem key={privilege} value={privilege}>
                              {PRIVILEGE_LABELS[privilege]}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            );
          })}
          {!data && (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              {defaults.isError
                ? "Could not load visibility defaults."
                : "Loading visibility defaults…"}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
