"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, FileText, GitBranch, MessageCircle, Pause, Play, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

const scenes = [
  {
    label: "Choose a repository",
    detail: "Sign in with GitHub and pick a repository you own.",
  },
  {
    label: "Generate the wiki",
    detail: "Shadow maps the codebase, plans an outline, and writes each page in the background.",
  },
  {
    label: "Explore and ask",
    detail: "Read source-linked docs, ask questions, and sync when the code changes.",
  },
];

const repositories = [
  { name: "billing-api", description: "Payments and subscription service", language: "TypeScript" },
  { name: "design-system", description: "Shared React components and tokens", language: "TypeScript" },
  { name: "data-pipeline", description: "ETL jobs and warehouse models", language: "Python" },
];

function ProductScene({ scene }: { scene: number }) {
  if (scene === 0) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Your repositories</p>
            <p className="mt-1 text-xs text-muted-foreground">Choose a repository to document</p>
          </div>
          <span className="rounded-full border px-2.5 py-1 text-[10px] text-muted-foreground">GitHub connected</span>
        </div>
        <div className="space-y-2">
          {repositories.map((repo, i) => (
            <div key={repo.name} className={`flex items-center gap-3 rounded-lg border p-3 ${i === 0 ? "border-primary/50 bg-primary/5" : "bg-background/70"}`}>
              <GitBranch className={`size-4 ${i === 0 ? "text-primary" : "text-muted-foreground"}`} />
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium">{repo.name}</p>
                <p className="truncate text-xs text-muted-foreground">{repo.description}</p>
              </div>
              <span className="hidden text-xs text-muted-foreground sm:block">{repo.language}</span>
              {i === 0 && <span className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground">Generate</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (scene === 1) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center py-4 text-center">
        <div className="mb-5 grid size-14 place-items-center rounded-2xl border bg-primary/5 text-primary">
          <Sparkles className="size-6" />
        </div>
        <p className="text-base font-semibold">Building billing-api wiki</p>
        <p className="mt-1 text-sm text-muted-foreground">Planning pages from the repository structure</p>
        <div className="mt-7 w-full space-y-3 text-left">
          {[
            ["Read repository", true],
            ["Plan documentation", true],
            ["Write wiki pages", false],
          ].map(([label, complete]) => (
            <div key={String(label)} className="flex items-center gap-3 rounded-lg border bg-background/70 px-4 py-3">
              <span className={`grid size-5 place-items-center rounded-full ${complete ? "bg-primary text-primary-foreground" : "border text-muted-foreground"}`}>
                {complete ? <Check className="size-3" /> : <span className="size-1.5 animate-pulse rounded-full bg-primary" />}
              </span>
              <span className={`text-sm ${complete ? "text-muted-foreground" : "font-medium"}`}>{label}</span>
              {complete && <span className="ml-auto text-xs text-muted-foreground">Done</span>}
            </div>
          ))}
        </div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={{ width: "12%" }}
            animate={{ width: "72%" }}
            transition={{ duration: 2.4, ease: "easeInOut" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[12rem_1fr]">
      <aside className="rounded-lg border bg-background/70 p-3 text-left">
        <p className="mb-3 truncate font-mono text-[11px] text-muted-foreground">billing-api wiki</p>
        {["Overview", "Architecture", "Request lifecycle", "Data model", "Background jobs", "Local setup"].map((item, i) => (
          <div key={item} className={`mb-1 rounded-md px-2.5 py-1.5 text-xs ${i === 1 ? "bg-muted font-medium" : "text-muted-foreground"}`}>
            {item}
          </div>
        ))}
      </aside>
      <article className="min-w-0 rounded-lg border bg-background/70 p-5 text-left">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">main @ 4f9c2ab</span>
          <span className="text-[11px] text-muted-foreground">Pinned to this commit</span>
        </div>
        <h3 className="text-lg font-semibold">Architecture</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Requests pass through the API layer before the billing service validates and persists each subscription change.
        </p>
        <div className="mt-4 rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-6 text-muted-foreground">
          <p><span className="text-primary">API route</span> → Billing service → Postgres</p>
          <p className="pl-5">↓</p>
          <p>Background jobs → Email provider</p>
        </div>
        <span className="mt-4 inline-flex items-center gap-1.5 text-xs text-primary underline underline-offset-4">
          <FileText className="size-3.5" /> src/billing/service.ts#L42-L68
        </span>
        <div className="mt-4 flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
          <MessageCircle className="size-3.5" />
          Ask a question about this repository…
        </div>
      </article>
    </div>
  );
}

export function Walkthrough() {
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(true);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!playing || reducedMotion) return;
    const timer = window.setInterval(() => setScene((current) => (current + 1) % scenes.length), 5000);
    return () => window.clearInterval(timer);
  }, [playing, reducedMotion]);

  const selectScene = (next: number) => setScene((next + scenes.length) % scenes.length);

  return (
    <div
      className="mx-auto max-w-4xl overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl shadow-foreground/5"
      aria-label="Product walkthrough"
      role="region"
    >
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="ml-2 truncate font-mono text-[11px] text-muted-foreground">shadow / github / billing-api</span>
        <span className="ml-auto hidden items-center gap-1 rounded-full border px-2 py-1 text-[10px] text-muted-foreground sm:flex">
          <span className="size-1.5 rounded-full bg-emerald-500" /> Interactive walkthrough
        </span>
      </div>
      <div className="min-h-[350px] p-4 sm:min-h-[380px] sm:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={scene}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: reducedMotion ? 0 : 0.25 }}
            className="flex min-h-[310px] items-center"
            aria-live="polite"
          >
            <div className="w-full">
              <ProductScene scene={scene} />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t px-4 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{scenes[scene].label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{scenes[scene].detail}</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => selectScene(scene - 1)} aria-label="Previous walkthrough step" className="grid size-9 place-items-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="size-4" />
          </button>
          {!reducedMotion && (
            <button
              type="button"
              onClick={() => setPlaying((value) => !value)}
              aria-label={playing ? "Pause walkthrough" : "Play walkthrough"}
              className="grid size-9 place-items-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
          )}
          <button type="button" onClick={() => selectScene(scene + 1)} aria-label="Next walkthrough step" className="grid size-9 place-items-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
