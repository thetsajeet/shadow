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
}

export function JobStatus({ job }: { job: JobView }) {
  const pct = job.progress.total ? Math.round((job.progress.done / job.progress.total) * 100) : 5;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/60 p-5 text-left shadow-xl backdrop-blur dark:bg-white/5"
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        {job.status === "done" ? (
          <CheckCircle2 className="size-4 text-emerald-500" />
        ) : job.status === "error" ? (
          <AlertCircle className="size-4 text-red-500" />
        ) : (
          <Loader2 className="size-4 animate-spin text-violet-500" />
        )}
        <span>{job.repo}</span>
      </div>
      {job.status === "error" ? (
        <p className="text-sm text-red-500">{job.error}</p>
      ) : job.status === "done" && job.wikiPath ? (
        <Link href={job.wikiPath} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">
          Open wiki <ArrowRight className="size-4" />
        </Link>
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
