"use client";
import { GitBranch, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BackgroundBeams } from "@/components/aceternity/background-beams";
import { Spotlight } from "@/components/aceternity/spotlight";
import { TextGenerateEffect } from "@/components/aceternity/text-generate-effect";
import { JobStatus, type JobView } from "@/components/job-status";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseRepoUrl } from "@/lib/repo-url";

export function Hero() {
  const [url, setUrl] = useState("");
  const [job, setJob] = useState<JobView | null>(null);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const poll = useCallback(
    (jobId: string) => {
      stop();
      timer.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
          if (!res.ok) throw new Error("Job not found (server may have restarted)");
          const j = (await res.json()) as JobView;
          setJob(j);
          if (j.status === "done") {
            stop();
            setRunning(false);
            toast.success(`Docs ready for ${j.repo}`, {
              action: j.wikiPath ? { label: "Open", onClick: () => (window.location.href = j.wikiPath!) } : undefined,
            });
          } else if (j.status === "error") {
            stop();
            setRunning(false);
            toast.error(j.error ?? "Generation failed");
          }
        } catch (e) {
          stop();
          setRunning(false);
          const error = e instanceof Error ? e.message : "Lost connection to the server";
          setJob((p) => (p ? { ...p, status: "error", error } : p));
          toast.error(error);
        }
      }, 2000);
    },
    [stop],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    let normalized: string;
    try {
      const { user, repo } = parseRepoUrl(url);
      normalized = `https://github.com/${user}/${repo}`;
    } catch {
      toast.error("Enter a valid URL like https://github.com/user/repo");
      return;
    }
    setUrl(normalized);
    setRunning(true);
    setJob(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalized }),
      });
      const data = await res.json();
      if (res.status === 409) {
        toast.warning(`Busy, currently processing ${data.currentRepo}`);
        setRunning(false);
        return;
      }
      if (!res.ok) {
        toast.error(data.error ?? "Request failed");
        setRunning(false);
        return;
      }
      toast.success("Submitted, generating docs in the background");
      setJob({ status: "queued", step: "Queued", progress: { done: 0, total: 0 }, repo: normalized.replace("https://github.com/", "") });
      poll(data.jobId);
    } catch {
      toast.error("Could not reach the server");
      setRunning(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-neutral-50 px-4 dark:bg-neutral-950">
      <Spotlight className="-top-40 left-0 md:-top-20 md:left-60" fill="#8b5cf6" />
      <BackgroundBeams />
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <Link href="https://github.com" target="_blank" aria-label="GitHub">
          <GitBranch className="size-5" />
        </Link>
        <ThemeToggle />
      </div>
      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center gap-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-3 py-1 text-xs backdrop-blur">
          <Sparkles className="size-3.5 text-violet-500" /> Wiki-style docs for any public repo
        </span>
        <TextGenerateEffect words="Shadow turns any GitHub repo into a living wiki" className="bg-gradient-to-b from-neutral-900 to-neutral-500 bg-clip-text text-4xl text-transparent md:text-6xl dark:from-white dark:to-neutral-500" />
        <p className="max-w-xl text-muted-foreground">
          Paste a repository URL. Shadow reads the code, plans an outline and writes architecture pages with Mermaid diagrams and source links.
        </p>
        <form onSubmit={submit} className="flex w-full max-w-xl flex-col gap-2 sm:flex-row">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={running}
            placeholder="https://github.com/user/repo"
            aria-label="GitHub repository URL"
            className="h-11 bg-background/70 backdrop-blur"
          />
          <Button type="submit" disabled={running || !url.trim()} className="h-11 bg-violet-600 px-6 text-white hover:bg-violet-500">
            {running ? "Generating…" : "Generate docs"}
          </Button>
        </form>
        {job && <JobStatus job={job} />}
      </div>
    </main>
  );
}
