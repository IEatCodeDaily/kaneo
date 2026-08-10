import { useBoardSlug } from "@/hooks/use-board-slug";
import { createFileRoute, redirect } from "@tanstack/react-router";
import TicketPage from "@/components/ticket/ticket-page";
import { resolveTicketIdentity } from "@/fetchers/ticket/resolve-ticket-identity";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/task/$taskId_",
)({
  loader: async ({ params }) => {
    let identity: Awaited<ReturnType<typeof resolveTicketIdentity>>;
    try {
      identity = await resolveTicketIdentity(
        params.organizationId,
        params.taskId,
      );
    } catch {
      return null;
    }
    throw redirect({
      to: "/dashboard/$organizationSlug/tickets/$ticketKey",
      params: {
        organizationSlug: identity.organization.slug,
        ticketKey: identity.ticketKey,
      },
      replace: true,
    });
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { boardId, organizationId, organizationSlug, organizationSlug: slug } = useBoardSlug();
  return (
    <TicketPage
      ticketId={taskId}
      boardId={boardId}
      organizationId={organizationId}
    />
  );
}
