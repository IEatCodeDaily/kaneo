import { MessageSquareShare } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import useUpdateOrganization from "@/hooks/mutations/organization/use-update-organization";
import useGetConfig from "@/hooks/queries/config/use-get-config";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { toast } from "@/lib/toast";

/**
 * Microsoft Teams, at organization level. The Teams app (tab sign-in, bot)
 * is set up once per instance; each organization decides whether Teams may
 * show its tickets as link previews and search results.
 */
export function OrganizationTeamsIntegration() {
  const { t } = useTranslation();
  const { data: config } = useGetConfig();
  const { data: organization, refetch } = useActiveOrganization();
  const { canManageOrganization } = useOrganizationPermission();
  const { mutateAsync: updateOrganization } = useUpdateOrganization();
  const [pending, setPending] = useState(false);
  const teams = config?.teams;
  const available = Boolean(teams?.tab || teams?.linkPreviews);
  const enabled =
    (organization as { teamsEnabled?: boolean } | undefined)?.teamsEnabled !==
    false;

  const toggle = async (checked: boolean) => {
    if (!organization?.id) return;
    setPending(true);
    try {
      await updateOrganization({
        organizationId: organization.id,
        teamsEnabled: checked,
      });
      await refetch();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:integrations.updateError"),
      );
    } finally {
      setPending(false);
    }
  };

  const capabilities = [
    ["tab", teams?.tab],
    ["linkPreviews", teams?.linkPreviews],
    ["openInTeams", teams?.openInTeams],
  ] as const;

  return (
    <section className="rounded-xl border border-border bg-background">
      <div className="flex items-start justify-between gap-6 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <MessageSquareShare className="size-4" aria-hidden />
          </span>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-medium">Microsoft Teams</h2>
              <Badge variant={available ? "success" : "secondary"} size="sm">
                {t(
                  available
                    ? enabled
                      ? "settings:integrations.statusOn"
                      : "settings:integrations.statusOff"
                    : "settings:integrations.statusNotSetUp",
                )}
              </Badge>
            </div>
            <p className="max-w-xl text-muted-foreground text-sm">
              {t("settings:integrations.teamsDescription")}
            </p>
          </div>
        </div>
        <Switch
          aria-label={t("settings:integrations.teamsToggle")}
          checked={available && enabled}
          disabled={!available || !canManageOrganization() || pending}
          onCheckedChange={toggle}
        />
      </div>
      <ul className="grid gap-2 border-border border-t p-4 text-sm sm:grid-cols-3">
        {capabilities.map(([key, on]) => (
          <li key={key} className="flex items-start gap-2">
            <span
              aria-hidden
              className={`mt-1.5 size-2 shrink-0 rounded-full ${on ? "bg-success" : "bg-muted-foreground/40"}`}
            />
            <span>
              <span className="font-medium">
                {t(`settings:integrations.teamsCapability.${key}`)}
              </span>
              <span className="block text-muted-foreground text-xs">
                {t(
                  on
                    ? "settings:integrations.ready"
                    : "settings:integrations.notConfigured",
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {!available ? (
        <p className="border-border border-t px-4 py-3 text-muted-foreground text-xs">
          {t("settings:integrations.teamsSetupHint")}
        </p>
      ) : null}
    </section>
  );
}
