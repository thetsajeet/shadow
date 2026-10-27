"use client";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { RepoStatus } from "@/lib/repo-status";

/** Fetches (and shares) a repo's staleness status. Returns null while loading or on failure. */
export function useRepoStatus(fullName: string | null, refreshKey = 0) {
  const [state, setState] = useState<{ key: string; status: RepoStatus | null } | null>(null);
  const key = fullName ? `${fullName}#${refreshKey}` : null;
  useEffect(() => {
    if (!fullName || !key) return;
    let cancelled = false;
    fetch(`/api/repos/${fullName}/status`)
      .then((r) => (r.ok ? (r.json() as Promise<RepoStatus>) : null))
      .catch(() => null)
      .then((status) => !cancelled && setState({ key, status }));
    return () => {
      cancelled = true;
    };
  }, [fullName, key]);
  return state?.key === key ? state.status : null;
}

export function StatusBadge({ status }: { status: RepoStatus | null }) {
  if (!status) return <Badge variant="outline"><Loader2 className="animate-spin" />Checking</Badge>;
  if (status.syncing) return <Badge variant="secondary"><Loader2 className="animate-spin" />Syncing</Badge>;
  if (status.stale) return <Badge variant="secondary">{status.behindBy} commit{status.behindBy === 1 ? "" : "s"} behind</Badge>;
  return <Badge variant="outline">Up to date</Badge>;
}
