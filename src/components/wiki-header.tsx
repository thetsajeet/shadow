import { ExternalLink, GitBranch, GitCommit } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function WikiHeader({ repo, branch, sha }: { repo: string; branch: string; sha: string }) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
      <Link href="/" className="font-bold tracking-tight">
        Shadow
      </Link>
      <span className="text-muted-foreground">/</span>
      <span className="truncate font-medium">{repo}</span>
      <span className="hidden items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground sm:inline-flex">
        <GitBranch className="size-3" /> {branch}
      </span>
      <a
        href={`https://github.com/${repo}/commit/${sha}`}
        target="_blank"
        rel="noreferrer noopener"
        className="hidden items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-xs text-muted-foreground sm:inline-flex"
      >
        <GitCommit className="size-3" /> {sha.slice(0, 7)}
      </a>
      <div className="ml-auto flex items-center gap-1">
        <a href={`https://github.com/${repo}`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          GitHub <ExternalLink className="size-3.5" />
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}
