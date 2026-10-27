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
  const [jobId, setJobId] = useState<string | null>(null);
  const source = useRef<EventSource | null>(null);

  const stop = useCallback(() => {
    source.current?.close();
    source.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const handle = useCallback(
    (j: JobView) => {
      setJob(j);
      if (j.status === "done") {
        stop();
        setRunning(false);
        if (j.errorCode === "PARTIAL") toast.warning(j.error ?? "Some pages failed");
        else toast.success(`Docs ready for ${j.repo}`);
      } else if (j.status === "error") {
        stop();
        setRunning(false);
        toast.error(j.error ?? "Generation failed");
      }
    },
    [stop],
  );

  const watch = useCallback(
    (jobId: string) => {
      stop();
      const es = new EventSource(`/api/jobs/${jobId}/stream`);
      source.current = es;
      es.addEventListener("job", (ev) => handle(JSON.parse((ev as MessageEvent).data) as JobView));
      es.addEventListener("error", (ev) => {
        // Named "error" events carry data; plain connection errors let EventSource reconnect.
        if ((ev as MessageEvent).data) {
          stop();
          setRunning(false);
          toast.error("Lost track of this job (it may have expired).");
        }
      });
    },
    [handle, stop],
  );

  async function retry() {
    if (!jobId) return;
    const res = await fetch(`/api/jobs/${jobId}/retry`, { method: "POST" });
    if (!res.ok) return toast.error("Could not retry");
    setRunning(true);
    watch(jobId);
  }

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
        if (data.jobId) {
          setJobId(data.jobId);
          setRunning(true);
          watch(data.jobId);
        } else setRunning(false);
        return;
      }
      if (!res.ok) {
        toast.error(data.error ?? "Request failed");
        setRunning(false);
        return;
      }
      setJobId(data.jobId);
      toast.success(data.reused ? "Docs are already up to date" : "Submitted, generating docs in the background");
      setJob({ status: "queued", step: "Queued", progress: { done: 0, total: 0 }, repo: normalized.replace("https://github.com/", "") });
      watch(data.jobId);
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
        {job && <JobStatus job={job} onRetry={retry} />}
      </div>
    </main>
  );
}
