"use client";
import { motion } from "framer-motion";
import { FileText, GitCommit, Lock } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, useRepoStatus } from "./status-badge";

export interface DocRepo {
  owner: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  sha: string;
  generatedAt: string | null;
  pageCount: number;
}

function DocCard({ repo, index }: { repo: DocRepo; index: number }) {
  const status = useRepoStatus(`${repo.owner}/${repo.name}`);
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
      <Link
        href={`/wiki/${repo.owner}/${repo.name}`}
        className="group flex h-full flex-col gap-3 rounded-xl border bg-card p-5 transition hover:border-foreground/30 hover:shadow-sm"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-medium group-hover:underline">{repo.owner}/{repo.name}</h3>
          <Badge variant="outline">{repo.visibility === "private" && <Lock />}{repo.visibility}</Badge>
        </div>
        <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{repo.description ?? "No description"}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><FileText className="size-3.5" />{repo.pageCount} pages</span>
          <span className="inline-flex items-center gap-1 font-mono"><GitCommit className="size-3.5" />{repo.sha.slice(0, 7)}</span>
          <span className="ml-auto"><StatusBadge status={status} /></span>
        </div>
      </Link>
    </motion.li>
  );
}

export function DocumentedGrid({ repos }: { repos: DocRepo[] }) {
  if (repos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        Nothing documented yet. Pick a repository below and generate its docs.
      </div>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {repos.map((r, i) => (
        <DocCard key={`${r.owner}/${r.name}`} repo={r} index={i} />
      ))}
    </ul>
  );
}
