"use client";
import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { Progress } from "@/components/ui/progress";

export interface JobView {
  status: "queued" | "running" | "done" | "error";
  step: string;
  progress: { done: number; total: number };
  repo: string;
  wikiPath?: string;
  error?: string;
  errorCode?: string;
}

export function JobStatus({ job, onRetry }: { job: JobView; onRetry?: () => void }) {
  const pct = job.progress.total ? Math.round((job.progress.done / job.progress.total) * 100) : 5;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full rounded-lg border bg-muted/40 p-4 text-left"
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        {job.status === "done" ? (
          <CheckCircle2 className="size-4 text-primary" />
        ) : job.status === "error" ? (
          <AlertCircle className="size-4 text-destructive" />
        ) : (
          <Loader2 className="size-4 animate-spin text-primary" />
        )}
        <span>{job.repo}</span>
      </div>
      {job.status === "error" ? (
        <p className="text-sm text-destructive">{job.error}</p>
      ) : job.status === "done" && job.wikiPath ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link href={job.wikiPath} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Open wiki <ArrowRight className="size-4" />
          </Link>
          {job.errorCode === "PARTIAL" && (
            <>
              <span className="text-sm text-muted-foreground">{job.error}</span>
              <button type="button" onClick={onRetry} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
                Retry failed pages
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            {job.step}
            {job.progress.total > 0 && ` — ${job.progress.done}/${job.progress.total} pages done`}
          </p>
          <Progress value={pct} />
        </>
      )}
    </motion.div>
  );
}
