import { PatchDiff } from "@pierre/diffs/react";
import {
  CheckCircle2,
  CircleDot,
  Expand,
  ExternalLink,
  GitCommitHorizontal,
  ListTree,
  PanelsTopLeft,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import PullRequestFileTree from "@/components/repo/pull-request-file-tree";
import PullRequestReviews from "@/components/repo/pull-request-reviews";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import useGetPullRequestChecks from "@/hooks/queries/repo/use-get-pull-request-checks";
import useGetPullRequestCommits from "@/hooks/queries/repo/use-get-pull-request-commits";
import useGetPullRequestFiles from "@/hooks/queries/repo/use-get-pull-request-files";
import { formatDateMedium } from "@/lib/format";
import type { RepoPullRequestCheck, RepoPullRequestFile } from "@/types/repo";

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

function DiffView({
  file,
  split,
}: {
  file: RepoPullRequestFile;
  split: boolean;
}) {
  return (
    <div
      className="min-w-0 overflow-hidden rounded-md border bg-background"
      data-diff-style={split ? "split" : "unified"}
      data-testid="pull-request-diff-renderer"
    >
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 font-mono text-xs">
        <span
          className="min-w-0 flex-1 truncate"
          data-testid="pull-request-selected-file"
        >
          {file.filename}
        </span>
        <span className="text-emerald-600">+{file.additions}</span>
        <span className="text-destructive">−{file.deletions}</span>
      </div>
      {file.patch ? (
        <PatchDiff
          disableWorkerPool
          options={{
            diffStyle: split ? "split" : "unified",
            disableFileHeader: true,
            overflow: "scroll",
            themeType: "system",
          }}
          patch={`diff --git a/${file.filename} b/${file.filename}\n--- a/${file.filename}\n+++ b/${file.filename}\n${file.patch}`}
        />
      ) : (
        <div className="space-y-2 px-4 py-6 text-sm text-muted-foreground">
          <p>Binary or oversized file — no patch is available.</p>
          <p className="text-xs">
            Open the pull request externally to inspect or download this file.
          </p>
        </div>
      )}
    </div>
  );
}

export default function PullRequestLiveDetails({
  repoId,
  number,
  discussion,
}: {
  repoId: string;
  number: number;
  discussion: ReactNode;
}) {
  const files = useGetPullRequestFiles(repoId, number);
  const commits = useGetPullRequestCommits(repoId, number);
  const checks = useGetPullRequestChecks(repoId, number);
  const [selectedFilename, setSelectedFilename] = useState<string>();
  const [split, setSplit] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const fileNames = (files.data?.files ?? []).map((file) => file.filename);
  const selectedFile =
    files.data?.files.find((file) => file.filename === selectedFilename) ??
    files.data?.files[0];

  useEffect(() => {
    if (selectedFile && selectedFilename !== selectedFile.filename) {
      setSelectedFilename(selectedFile.filename);
    }
  }, [selectedFile, selectedFilename]);

  const checkItems = [
    ...(checks.data?.checks ?? []),
    ...(checks.data?.runs ?? []),
  ];
  const unavailableSources = (checks.data?.unavailable ?? []).map((source) =>
    source === "checks" ? "check runs" : "workflow runs",
  );

  return (
    <Tabs
      className="gap-0"
      defaultValue="discussion"
      data-testid="pull-request-live-details"
    >
      <div className="overflow-x-auto border-b px-4 sm:px-6">
        <TabsList
          aria-label="Pull request sections"
          className="min-w-max"
          variant="underline"
        >
          <TabsTab aria-label="Discussions" value="discussion">
            Discussions
          </TabsTab>
          <TabsTab aria-label="Commits" value="commits">
            Commits{commits.data ? ` (${commits.data.commits.length})` : ""}
          </TabsTab>
          <TabsTab aria-label="Checks" value="checks">
            Checks
          </TabsTab>
          <TabsTab aria-label="Reviews" value="reviews">
            Reviews
          </TabsTab>
          <TabsTab aria-label="Diffs" value="diffs">
            Diffs{files.data ? ` (${files.data.totals.changedFiles})` : ""}
          </TabsTab>
        </TabsList>
      </div>

      <TabsPanel value="discussion">{discussion}</TabsPanel>
      <TabsPanel className="px-4 py-5 sm:px-6" value="reviews">
        <PullRequestReviews number={number} repoId={repoId} />
      </TabsPanel>
      <TabsPanel className="px-4 py-5 sm:px-6" value="commits">
        {commits.isLoading ? (
          <Loading />
        ) : commits.isError ? (
          <ErrorState />
        ) : commits.data?.commits.length ? (
          <div className="divide-y">
            {commits.data.commits.map((commit) => (
              <a
                className="flex items-start gap-3 py-3 text-sm"
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
      </TabsPanel>

      <TabsPanel className="px-4 py-5 sm:px-6" value="checks">
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
      </TabsPanel>

      <TabsPanel
        className="min-w-0 px-4 py-5 sm:px-6"
        data-testid="pull-request-diff-workspace"
        value="diffs"
      >
        {files.isLoading ? (
          <Loading />
        ) : files.isError ? (
          <ErrorState />
        ) : selectedFile ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                <span className="text-emerald-600">
                  +{files.data?.totals.additions}
                </span>{" "}
                <span className="text-destructive">
                  −{files.data?.totals.deletions}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  aria-label="Unified"
                  aria-pressed={!split}
                  onClick={() => setSplit(false)}
                  size="sm"
                  variant={split ? "ghost" : "secondary"}
                >
                  <ListTree /> Unified
                </Button>
                <Button
                  aria-label="Side-by-side"
                  aria-pressed={split}
                  onClick={() => setSplit(true)}
                  size="sm"
                  variant={split ? "secondary" : "ghost"}
                >
                  <PanelsTopLeft /> Side-by-side
                </Button>
                <Button
                  aria-label="Open diff fullscreen"
                  onClick={() => setFullscreen(true)}
                  size="icon-sm"
                  variant="outline"
                >
                  <Expand />
                </Button>
              </div>
            </div>
            <div className="min-w-0">
              {/* Floating tree keeps the diff full width instead of losing a
                  grid column to a flat file list. */}
              <div className="mb-3">
                <PullRequestFileTree
                  filenames={fileNames}
                  idPrefix="inline"
                  onSelect={(path) => {
                    setSelectedFilename(path);
                    document
                      .getElementById(`diff-file-${encodeURIComponent(path)}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  selectedPath={selectedFile.filename}
                />
              </div>
              <div className="min-w-0 space-y-4">
                {files.data?.files.map((file) => (
                  <section
                    className="scroll-mt-4"
                    id={`diff-file-${encodeURIComponent(file.filename)}`}
                    key={file.filename}
                  >
                    <DiffView file={file} split={split} />
                  </section>
                ))}
              </div>
            </div>
            <Dialog open={fullscreen} onOpenChange={setFullscreen}>
              <DialogPopup
                bottomStickOnMobile={false}
                className="h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)]"
              >
                <div className="border-b px-5 py-4 pr-12">
                  <DialogTitle className="text-base">
                    Pull request diff
                  </DialogTitle>
                  <DialogDescription>
                    Full-screen code comparison
                  </DialogDescription>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
                  <PullRequestFileTree
                    filenames={fileNames}
                    idPrefix="fullscreen"
                    onSelect={(path) => {
                      setSelectedFilename(path);
                      document
                        .getElementById(
                          `fullscreen-diff-file-${encodeURIComponent(path)}`,
                        )
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                    }}
                    selectedPath={selectedFilename}
                  />
                  <div className="min-w-0 space-y-4 overflow-auto">
                    {files.data?.files.map((file) => (
                      <section
                        className="scroll-mt-2"
                        id={`fullscreen-diff-file-${encodeURIComponent(file.filename)}`}
                        key={file.filename}
                      >
                        <DiffView file={file} split={split} />
                      </section>
                    ))}
                  </div>
                </div>
              </DialogPopup>
            </Dialog>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No changed files.</p>
        )}
      </TabsPanel>
    </Tabs>
  );
}
