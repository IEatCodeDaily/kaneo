import { Ticket } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectTicket } from "@/fetchers/project/get-project-tickets";
import ProjectTicketRow from "./project-ticket-row";

type ProjectTicketsProps = {
  organizationSlug: string;
  tickets?: ProjectTicket[];
  isLoading?: boolean;
};

/** List/empty/loading presentation for scoped Project tickets. */
export function ProjectTickets({
  organizationSlug,
  tickets,
  isLoading,
}: ProjectTicketsProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="space-y-2 p-3" data-testid="project-tickets-loading">
        {[1, 2, 3].map((i) => (
          <Skeleton className="h-12 w-full" key={i} />
        ))}
      </div>
    );
  }

  if (!tickets || tickets.length === 0) {
    return (
      <Empty className="min-h-[40vh]" data-testid="project-tickets-empty">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Ticket />
          </EmptyMedia>
          <EmptyTitle>{t("projects:tickets.emptyTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("projects:tickets.emptyDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div data-testid="project-tickets-list">
      {tickets.map((ticket) => (
        <ProjectTicketRow
          key={ticket.id}
          organizationSlug={organizationSlug}
          ticket={ticket}
        />
      ))}
    </div>
  );
}

export default ProjectTickets;
