import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiUrl } from "@/fetchers/get-api-url";

type Provider = "github" | "gitea";

export function AddRepoDialog({
  open,
  onOpenChange,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<Provider>("github");
  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [githubInstallationId, setGithubInstallationId] = useState("");
  const [giteaBaseUrl, setGiteaBaseUrl] = useState("");
  const [giteaToken, setGiteaToken] = useState("");
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const config =
        provider === "github"
          ? { installationId: Number(githubInstallationId) }
          : { baseUrl: giteaBaseUrl, accessToken: giteaToken };
      const url =
        provider === "github"
          ? `https://github.com/${owner}/${name}`
          : `${giteaBaseUrl.replace(/\/$/, "")}/${owner}/${name}`;
      const response = await fetch(getApiUrl("/repo"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          provider,
          owner,
          name,
          url,
          config,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      return (await response.json()) as { id: string };
    },
    onSuccess: async (repo) => {
      // First sync is explicit but automatic after a successful connection.
      const sync = await fetch(getApiUrl(`/repo/${repo.id}/sync`), {
        method: "POST",
        credentials: "include",
      });
      if (!sync.ok) throw new Error(await sync.text());
      await queryClient.invalidateQueries({ queryKey: ["repos", organizationId] });
      onOpenChange(false);
      setOwner(""); setName(""); setGithubInstallationId("");
      setGiteaBaseUrl(""); setGiteaToken(""); setError("");
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not connect repository"),
  });

  const submit = () => {
    if (!owner || !name || (provider === "github" && !githubInstallationId) ||
      (provider === "gitea" && (!giteaBaseUrl || !giteaToken))) {
      setError("Complete all provider fields before connecting.");
      return;
    }
    setError("");
    create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("organization:repos.add.title")}</DialogTitle>
          <DialogDescription>{t("organization:repos.add.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="repo-provider">{t("organization:repos.table.provider")}</Label>
            <select id="repo-provider" value={provider} onChange={(e) => setProvider(e.target.value as Provider)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="github">GitHub</option>
              <option value="gitea">Gitea</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="repo-owner">Owner</Label><Input id="repo-owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="IEatCodeDaily" /></div>
            <div className="space-y-2"><Label htmlFor="repo-name">Repository</Label><Input id="repo-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="kaneo" /></div>
          </div>
          {provider === "github" ? (
            <div className="space-y-2"><Label htmlFor="github-installation">GitHub App installation ID</Label><Input id="github-installation" inputMode="numeric" value={githubInstallationId} onChange={(e) => setGithubInstallationId(e.target.value)} placeholder="149127298" /><p className="text-xs text-muted-foreground">The GitHub App installation that has access to this repository.</p></div>
          ) : (
            <>
              <div className="space-y-2"><Label htmlFor="gitea-url">Gitea URL</Label><Input id="gitea-url" value={giteaBaseUrl} onChange={(e) => setGiteaBaseUrl(e.target.value)} placeholder="https://git.example.com" /></div>
              <div className="space-y-2"><Label htmlFor="gitea-token">Access token</Label><Input id="gitea-token" type="password" value={giteaToken} onChange={(e) => setGiteaToken(e.target.value)} /></div>
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={create.isPending} onClick={submit}>{create.isPending ? "Connecting…" : t("organization:repos.add.submit")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
