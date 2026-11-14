import { resolveTargetStatus as resolveForgeTargetStatus } from "../../github/utils/resolve-column";

/** Gitea flavour of the shared forge status resolver (rules keyed "gitea"). */
export function resolveTargetStatus(
  boardId: string,
  eventType: string,
  fallbackStatus: string,
): Promise<string> {
  return resolveForgeTargetStatus(boardId, eventType, fallbackStatus, "gitea");
}
