"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TurnstileField } from "@/components/turnstile-field";
import type { JobView } from "@/components/job-status";
import { useJob } from "@/lib/use-job";
import { StatusBadge, useRepoStatus } from "@/components/profile/status-badge";

export function WikiFreshness({ owner, repo, isOwner }: { owner: string; repo: string; isOwner: boolean }) {
  const [refresh, setRefresh] = useState(0);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const router = useRouter();
  const status = useRepoStatus(`${owner}/${repo}`, refresh);
  const { watch } = useJob((job) => {
    setBusy(false);
    setRefresh((value) => value + 1);
    router.refresh();
    if (job.status === "error") toast.error(job.error ?? "Sync failed");
    else toast.success(`Wiki synced for ${job.repo}`);
  });

  if (!isOwner || !status?.documented) return null;

  async function sync() {
    setBusy(true);
    try {
      const response = await fetch(`/api/repos/${owner}/${repo}/sync`, {
        method: "POST",
        headers: token ? { "x-turnstile-token": token } : undefined,
      });
      const data = await response.json() as { jobId?: string; upToDate?: boolean; error?: string; currentRepo?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not sync this wiki.");
      if (data.upToDate) {
        toast.success("Wiki is already up to date");
        setBusy(false);
        setRefresh((value) => value + 1);
        return;
      }
      if (data.jobId) {
        setChallengeOpen(false);
        setToken("");
        const initial: JobView = { status: "queued", step: "Queued", progress: { done: 0, total: 0 }, repo: `${owner}/${repo}` };
        watch(data.jobId, initial);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sync this wiki.");
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <StatusBadge status={status} />
      {status.stale && (
        <>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !token ? setChallengeOpen(true) : sync()}>
            <RefreshCw className="size-3.5" /> {busy ? "Syncing…" : "Sync wiki"}
          </Button>
        </>
      )}
      {challengeOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-label="Verify before syncing" className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-xl">
            <h2 className="font-medium">Verify before syncing</h2>
            <p className="mt-1 text-sm text-muted-foreground">Complete the challenge to protect the service from automated requests.</p>
            <TurnstileField onToken={setToken} />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setChallengeOpen(false)}>Cancel</Button>
              <Button disabled={!token} onClick={sync}>Continue</Button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
