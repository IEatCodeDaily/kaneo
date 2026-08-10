/**
 * Resolve boardSlug → boardId using the boards query cache.
 * Falls back to the raw param if it already looks like a UUID (backward compat).
 */
import { useParams } from "@tanstack/react-router";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";

export function useBoardSlug() {
  const { boardSlug, organizationSlug } = useParams({ strict: false });
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const { data: boards } = useGetBoards({
    organizationId,
    teamId: null,
  });

  const board =
    boards?.find(
      (b) => b.slug?.toLowerCase() === boardSlug?.toLowerCase(),
    ) ?? null;

  // If no board found by slug, check if the param IS a UUID (legacy compat).
  // Don't return the raw slug as boardId — wait for resolution.
  const isLegacyUuid = boardSlug && /^[a-z0-9]{20,}$/i.test(boardSlug) && !board;
  const boardId = board?.id ?? (isLegacyUuid ? boardSlug : "") ?? "";

  return {
    boardId,
    board,
    organizationId,
    organizationSlug: organizationSlug ?? "",
    organization,
  };
}
