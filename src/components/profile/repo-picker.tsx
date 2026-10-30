"use client";
import { ArrowRight, GitCommit, Lock, RefreshCw, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { JobStatus, type JobView } from "@/components/job-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OwnedRepo } from "@/lib/github-user";
import { useJob } from "@/lib/use-job";
import { StatusBadge, useRepoStatus } from "./status-badge";
import { TurnstileField } from "@/components/turnstile-field";

export function RepoPicker({ repos }: { repos: OwnedRepo[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(repos[0]?.fullName ?? "");
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");
  const resetChallenge = useRef<(() => void) | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const repo = repos.find((r) => r.fullName === selected) ?? null;
  const status = useRepoStatus(repo?.fullName ?? null, refresh);

  const { job, watch, reset } = useJob((j) => {
    setBusy(false);
    if (j.errorCode !== "PARTIAL") setActiveJobId(null);
    setRefresh((n) => n + 1);
    router.refresh();
    if (j.status === "error") toast.error(j.error ?? "Generation failed");
    else if (j.errorCode === "PARTIAL") toast.warning(j.error ?? "Some pages failed");
    else toast.success(`Docs ready for ${j.repo}`);
  });

  const setChallengeReset = useCallback((reset: (() => void) | null) => {
    resetChallenge.current = reset;
  }, []);

  function clearChallenge() {
    setChallengeToken("");
    resetChallenge.current?.();
  }

  async function start(kind: "generate" | "sync") {
    if (!repo) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/repos/${repo.fullName}/${kind}`, {
        method: "POST",
        headers: challengeToken ? { "x-turnstile-token": challengeToken } : undefined,
      }).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : {};
      if (!res) toast.error("Could not reach the server");
      else if (res.status === 409) {
        toast.warning(`Busy, currently processing ${data.currentRepo}`);
        if (data.jobId) {
          setActiveJobId(data.jobId);
          return watch(data.jobId);
        }
      } else if (!res.ok) toast.error(data.error ?? "Request failed");
      else if (data.reused || data.upToDate) {
        toast.success("Codebase already in sync");
        setRefresh((n) => n + 1);
      } else {
        setActiveJobId(data.jobId);
        toast.success(kind === "sync" ? "Sync started in the background" : "Submitted, generating docs in the background");
        const initial: JobView = { status: "queued", step: "Queued", progress: { done: 0, total: 0 }, repo: repo.fullName };
        return watch(data.jobId, initial);
      }
      setBusy(false);
    } finally {
      clearChallenge();
    }
  }

  async function retry() {
    if (!activeJobId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/jobs/${activeJobId}/retry`, {
        method: "POST",
        headers: challengeToken ? { "x-turnstile-token": challengeToken } : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not retry failed pages.");
      const initial: JobView = { status: "queued", step: "Queued for retry", progress: { done: 0, total: 0 }, repo: repo?.fullName ?? "" };
      watch(data.jobId, initial);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not retry failed pages.");
      setBusy(false);
    } finally {
      clearChallenge();
    }
  }

  if (repos.length === 0) return <p className="text-sm text-muted-foreground">No repositories found on your account.</p>;

  const running = busy || status?.syncing;
  const wikiPath = `/wiki/${repo?.fullName}`;
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_1fr]">
      <div className="rounded-xl border bg-card p-4">
        <label htmlFor="repo-select" className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Repository
        </label>
        <select
          id="repo-select"
          value={selected}
          disabled={!!running}
          onChange={(e) => {
            setSelected(e.target.value);
            reset();
          }}
          className="h-9 w-full rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {repos.map((r) => (
            <option key={r.fullName} value={r.fullName}>
              {r.private ? "🔒 " : ""}{r.name}
            </option>
          ))}
        </select>
        <p className="mt-3 text-xs text-muted-foreground">{repos.length} repositories you own. Forks and archived repos are hidden.</p>
        <TurnstileField onToken={setChallengeToken} onResetReady={setChallengeReset} />
      </div>

      {repo && (
        <div className="space-y-4 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{repo.fullName}</h3>
            <Badge variant="outline">{repo.private && <Lock />}{repo.private ? "private" : "public"}</Badge>
            {status?.documented && <StatusBadge status={status} />}
          </div>
          <p className="text-sm text-muted-foreground">{repo.description ?? "No description"}</p>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {repo.language && <div>{repo.language}</div>}
            <div className="inline-flex items-center gap-1"><Star className="size-3.5" />{repo.stars}</div>
            <div className="inline-flex items-center gap-1"><GitCommit className="size-3.5" />{repo.defaultBranch}</div>
            {status?.docSha && <div className="font-mono">docs @ {status.docSha.slice(0, 7)}</div>}
          </dl>

          {status?.stale && status.commits.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-muted/50 p-3 text-xs">
              {status.commits.slice(0, 5).map((c) => (
                <li key={c.sha} className="flex gap-2">
                  <span className="font-mono text-muted-foreground">{c.sha.slice(0, 7)}</span>
                  <span className="truncate">{c.message}</span>
                </li>
              ))}
            </ul>
          )}
          {repo.private && !status?.documented && (
            <p className="text-xs text-muted-foreground">
              This repository is private. Its source is sent to the Gemini API to write the docs, and the wiki stays visible only to you.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {!status?.documented ? (
              <Button onClick={() => start("generate")} disabled={!!running || !status || (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !challengeToken)}>Generate docs</Button>
            ) : (
              <>
                <Link href={wikiPath}>
                  <Button variant={status.stale ? "outline" : "default"}>Open wiki <ArrowRight /></Button>
                </Link>
                <Button variant={status.stale ? "default" : "outline"} onClick={() => start("sync")} disabled={!!running || (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !challengeToken)}>
                  <RefreshCw />
                  {status.stale ? `Resync (${status.behindBy} new commit${status.behindBy === 1 ? "" : "s"})` : "Resync"}
                </Button>
              </>
            )}
          </div>
          {job && <JobStatus job={job} onRetry={job.errorCode === "PARTIAL" ? retry : undefined} />}
        </div>
      )}
    </div>
  );
}
