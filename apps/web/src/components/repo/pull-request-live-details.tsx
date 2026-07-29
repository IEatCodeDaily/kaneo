import { PatchDiff } from "@pierre/diffs/react";
import {
  CheckCircle2,
  ChevronDown,
  CircleDot,
  ExternalLink,
  GitCommitHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import useGetPullRequestChecks from "@/hooks/queries/repo/use-get-pull-request-checks";
import useGetPullRequestCommits from "@/hooks/queries/repo/use-get-pull-request-commits";
import useGetPullRequestFiles from "@/hooks/queries/repo/use-get-pull-request-files";
import { formatDateMedium } from "@/lib/format";
import type { RepoPullRequestCheck } from "@/types/repo";

function Section({
  title,
  summary,
  children,
}: {
  title: string;
  summary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Collapsible className="border-b border-border/80" defaultOpen>
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-6 sm:py-5">
        <span className="font-semibold">{title}</span>
        <span className="ml-auto text-xs text-muted-foreground">{summary}</span>
        <ChevronDown className="size-4 transition-transform group-data-panel-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-5 sm:px-6">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

const Loading = () => (
  <div aria-label="Loading" className="space-y-2" role="status">
    <Skeleton className="h-4 w-2/3" />
    <Skeleton className="h-4 w-1/2" />
  </div>
);
const ErrorState = () => (
  <p className="text-sm text-destructive">
    Could not load this section. Reload to try again.
  </p>
);

function CheckRow({ item }: { item: RepoPullRequestCheck }) {
  const successful = item.conclusion === "success";
  return (
    <a
      className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/60"
      href={item.url}
      rel="noreferrer"
      target="_blank"
    >
      {successful ? (
        <CheckCircle2 className="size-4 text-emerald-600" />
      ) : (
        <CircleDot className="size-4 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      <span className="text-xs text-muted-foreground">
        {item.conclusion ?? item.status}
      </span>
      <ExternalLink className="size-3.5 text-muted-foreground" />
    </a>
  );
}

export default function PullRequestLiveDetails({
  repoId,
  number,
}: {
  repoId: string;
  number: number;
}) {
  const files = useGetPullRequestFiles(repoId, number);
  const commits = useGetPullRequestCommits(repoId, number);
  const checks = useGetPullRequestChecks(repoId, number);
  const checkItems = [
    ...(checks.data?.checks ?? []),
    ...(checks.data?.runs ?? []),
  ];
  const unavailableSources = (checks.data?.unavailable ?? []).map((source) =>
    source === "checks" ? "check runs" : "workflow runs",
  );

  return (
    <div data-testid="pull-request-live-details">
      <Section
        title="Files changed"
        summary={
          files.data && (
            <>
              <span className="text-emerald-600">
                +{files.data.totals.additions}
              </span>{" "}
              <span className="text-destructive">
                −{files.data.totals.deletions}
              </span>{" "}
              · {files.data.totals.changedFiles} files
            </>
          )
        }
      >
        {files.isLoading ? (
          <Loading />
        ) : files.isError ? (
          <ErrorState />
        ) : files.data?.files.length ? (
          <div className="space-y-4">
            {files.data.files.map((file) => (
              <div
                className="overflow-hidden rounded-md border"
                data-testid="pull-request-file"
                key={file.filename}
              >
                <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 font-mono text-xs">
                  <span className="min-w-0 flex-1 truncate">
                    {file.filename}
                  </span>
                  <span className="text-emerald-600">+{file.additions}</span>
                  <span className="text-destructive">−{file.deletions}</span>
                </div>
                {file.patch ? (
                  <PatchDiff
                    disableWorkerPool
                    options={{
                      diffStyle: "unified",
                      overflow: "scroll",
                      themeType: "system",
                    }}
                    patch={`diff --git a/${file.filename} b/${file.filename}\n--- a/${file.filename}\n+++ b/${file.filename}\n${file.patch}`}
                  />
                ) : (
                  <p className="px-3 py-4 text-sm text-muted-foreground">
                    Binary or oversized file — no patch available.
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No changed files.</p>
        )}
      </Section>
      <Section
        title="Commits"
        summary={commits.data && `${commits.data.commits.length} commits`}
      >
        {commits.isLoading ? (
          <Loading />
        ) : commits.isError ? (
          <ErrorState />
        ) : commits.data?.commits.length ? (
          <div className="divide-y">
            {commits.data.commits.map((commit) => (
              <a
                className="flex items-start gap-3 py-3 text-sm hover:text-foreground"
                href={commit.url}
                key={commit.sha}
                rel="noreferrer"
                target="_blank"
              >
                <GitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {commit.message.split("\n")[0]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {commit.authorLogin ?? "Unknown author"}
                    {commit.committedAt
                      ? ` · ${formatDateMedium(commit.committedAt)}`
                      : ""}
                  </span>
                </span>
                <code className="text-xs text-muted-foreground">
                  {commit.sha.slice(0, 7)}
                </code>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No commits.</p>
        )}
      </Section>
      <Section
        title="Checks"
        summary={
          checks.data &&
          (checks.data.conclusion ?? `${checkItems.length} checks`)
        }
      >
        {checks.isLoading ? (
          <Loading />
        ) : checks.isError ? (
          <ErrorState />
        ) : checkItems.length ? (
          <div>
            {checkItems.map((item) => (
              <CheckRow item={item} key={`${item.name}-${item.url}`} />
            ))}
            {unavailableSources.length ? (
              <p className="pt-2 text-sm text-muted-foreground">
                {unavailableSources.join(" and ")} unavailable — the GitHub App
                is missing read access.
              </p>
            ) : null}
          </div>
        ) : unavailableSources.length ? (
          <p className="text-sm text-muted-foreground">
            Cannot read {unavailableSources.join(" or ")} — the GitHub App is
            missing read access, so CI status is unknown.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No checks or workflow runs for this pull request.
          </p>
        )}
      </Section>
    </div>
  );
}
