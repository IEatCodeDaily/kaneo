import { useNavigate } from "@tanstack/react-router";
import {
  CircleDot,
  FileText,
  FolderGit2,
  FolderKanban,
  GitPullRequest,
  Hash,
  type LucideIcon,
  MessageSquare,
  Users,
  Zap,
} from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGlobalSearch from "@/hooks/queries/search/use-global-search";
import { getSearchResultRoute } from "./search-result-route";

/**
 * Global search results for the unified command palette (`/` and Ctrl/⌘+K).
 * This used to be its own dialog; it is now a data hook the palette renders
 * alongside its commands.
 */

export const SEARCH_MIN_CHARS = 3;

export type SearchResultItem = {
  id: string;
  title: string;
  description?: string;
  content?: string;
  type:
    | "task"
    | "board"
    | "organization"
    | "comment"
    | "activity"
    | "repository"
    | "issue"
    | "pull_request";
  boardId?: string;
  organizationId?: string;
  taskNumber?: number;
  boardSlug?: string;
  priority?: string;
  status?: string;
  repoId?: string;
  repoOwner?: string;
  repoName?: string;
  itemNumber?: number;
  url?: string;
};

export type SearchResultGroup = {
  value: string;
  label: string;
  items: SearchResultItem[];
};

export function getSearchResultIcon(type: string): LucideIcon {
  switch (type) {
    case "task":
      return Hash;
    case "board":
      return FolderKanban;
    case "organization":
      return Users;
    case "comment":
      return MessageSquare;
    case "activity":
      return Zap;
    case "repository":
      return FolderGit2;
    case "issue":
      return CircleDot;
    case "pull_request":
      return GitPullRequest;
    default:
      return FileText;
  }
}

export function useSearchResults(query: string) {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const navigate = useNavigate();

  const searchEnabled = query.trim().length >= SEARCH_MIN_CHARS;

  const { data: searchResults } = useGlobalSearch({
    q: searchEnabled ? query : "",
    type: "all",
    organizationId: organization?.id,
    limit: 20,
  });

  const openResult = useCallback(
    (item: SearchResultItem) => {
      switch (item.type) {
        case "task":
        case "comment":
        case "activity":
          if (item.boardSlug && item.taskNumber && organization?.slug) {
            navigate({
              to: "/dashboard/$organizationSlug/tickets/$ticketKey",
              params: {
                organizationSlug: organization.slug,
                ticketKey: `${item.boardSlug.toUpperCase()}-${item.taskNumber}`,
              },
            });
          }
          break;
        case "board":
        case "repository":
          if (organization?.slug) {
            const route = getSearchResultRoute(
              { ...item, type: item.type },
              organization.slug,
            );
            if (route) navigate(route);
          }
          break;
        case "organization":
          if (item.id) {
            navigate({
              to: "/dashboard/organization/$organizationSlug",
              params: {
                organizationSlug: item.id,
              },
            });
          }
          break;
        case "issue":
          if (item.repoId && item.itemNumber && organization?.slug) {
            navigate({
              to: "/dashboard/organization/$organizationSlug/repo/$repoId/issues/$number",
              params: {
                organizationSlug: organization.slug,
                repoId: item.repoId,
                number: String(item.itemNumber),
              },
            });
          }
          break;
        case "pull_request":
          if (item.repoId && item.itemNumber && organization?.slug) {
            navigate({
              to: "/dashboard/organization/$organizationSlug/repo/$repoId/pulls/$number",
              params: {
                organizationSlug: organization.slug,
                repoId: item.repoId,
                number: String(item.itemNumber),
              },
            });
          }
          break;
      }
    },
    [navigate, organization?.slug],
  );

  const groups = useMemo<SearchResultGroup[]>(() => {
    if (!searchEnabled) return [];
    const results = (searchResults?.results ?? []) as SearchResultItem[];
    const grouped = results.reduce(
      (acc: Record<string, SearchResultItem[]>, item: SearchResultItem) => {
        if (!acc[item.type]) acc[item.type] = [];
        acc[item.type].push(item);
        return acc;
      },
      {} as Record<string, SearchResultItem[]>,
    );

    const groupLabel = (type: string) => {
      switch (type as SearchResultItem["type"]) {
        case "task":
          return t("navigation:search.groups.task");
        case "board":
          return t("navigation:search.groups.board");
        case "organization":
          return t("navigation:search.groups.organization");
        case "comment":
          return t("navigation:search.groups.comment");
        case "activity":
          return t("navigation:search.groups.activity");
        case "repository":
          return "Repositories";
        case "issue":
          return "Issues";
        case "pull_request":
          return "Pull requests";
        default:
          return t("navigation:search.groups.fallback");
      }
    };

    return Object.entries(grouped).map(([type, items]) => ({
      value: `search-${type}`,
      label: groupLabel(type),
      items,
    }));
  }, [searchEnabled, searchResults?.results, t]);

  return { groups, openResult, searchEnabled };
}
