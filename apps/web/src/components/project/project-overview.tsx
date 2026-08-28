import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { formatDateMedium } from "@/lib/format";
import ProjectContextualResources from "./project-contextual-resources";
import type { ProjectRowData } from "./project-row";

type ProjectOverviewProps = {
  project: ProjectRowData & {
    description: string | null;
    successCriteria: string | null;
    startDate: string | null;
  };
  organizationId: string;
  organizationSlug: string;
};

export function ProjectOverview({
  project,
  organizationId,
  organizationSlug,
}: ProjectOverviewProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 p-4" data-testid="project-overview">
      <section>
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("projects:labels.summary")}
        </h2>
        <p className="mt-1">{project.summary}</p>
      </section>

      {project.description && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("projects:labels.description")}
          </h2>
          <p className="mt-1 whitespace-pre-wrap">{project.description}</p>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("projects:labels.successCriteria")}
        </h2>
        <p className="mt-1">
          {project.successCriteria ?? t("projects:labels.noScopedWork")}
        </p>
      </section>

      <section className="flex flex-wrap gap-6">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("projects:labels.lifecycle")}
          </h2>
          <Badge className="mt-1">
            {t(`projects:lifecycle.${project.status}`)}
          </Badge>
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("projects:labels.lead")}
          </h2>
          <p className="mt-1">
            {project.leadUserName ?? project.leadTeamName ?? "—"}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("projects:labels.targetDate")}
          </h2>
          <p className="mt-1">
            {project.targetDate
              ? formatDateMedium(project.targetDate)
              : t("projects:overview.noDueDate")}
          </p>
        </div>
      </section>
      <section>
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("projects:labels.noScopedWork")}
        </h2>
        <p className="mt-1 text-muted-foreground">
          {t("projects:labels.noScopedWork")}
        </p>
      </section>

      <ProjectContextualResources
        organizationId={organizationId}
        organizationSlug={organizationSlug}
        projectId={project.id}
      />

      <section>
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("projects:labels.noUpdate")}
        </h2>
        <p className="mt-1 text-muted-foreground">
          {t("projects:labels.noUpdate")}
        </p>
      </section>
    </div>
  );
}

export default ProjectOverview;
