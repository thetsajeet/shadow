import { GitCommitHorizontal, Lock, MessagesSquare, Network, RefreshCw, Workflow } from "lucide-react";

const features = [
  { icon: Network, title: "Diagrams that match the code", body: "Mermaid architecture and sequence diagrams generated from what the modules actually import and call." },
  { icon: GitCommitHorizontal, title: "Line-level permalinks", body: "Every statement links to a file and line range, pinned to the commit the wiki was written from." },
  { icon: MessagesSquare, title: "Ask the repo", body: "Questions are answered from retrieved code and cite their sources. No guessing at files that don't exist." },
  { icon: RefreshCw, title: "Sync, don't regenerate", body: "When new commits land, only pages whose source files changed are rewritten. The rest carry over." },
  { icon: Lock, title: "Private stays private", body: "Wikis for private repositories are visible to you alone. Public ones can be shared with a link." },
  { icon: Workflow, title: "Runs in the background", body: "Generation is a durable job. Close the tab, come back, and the progress is still there." },
];

export function Features() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24">
      <div className="max-w-2xl">
        <h2 className="text-3xl font-semibold tracking-tight">Documentation that stays attached to the code</h2>
        <p className="mt-3 text-muted-foreground">Most generated docs read well and are wrong by Friday. Shadow keeps every page tied to a commit and tells you when it has drifted.</p>
      </div>
      <div className="mt-12 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <div key={title} className="bg-background p-6 transition-colors hover:bg-muted/40">
            <Icon className="size-5 text-muted-foreground" />
            <h3 className="mt-4 font-medium">{title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id="how" className="border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-24">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">See how Shadow works</h2>
          <p className="mt-3 text-muted-foreground">From a GitHub repository to a source-linked wiki you can explore and ask questions about.</p>
        </div>
        <div className="mx-auto aspect-video w-full max-w-4xl overflow-hidden rounded-xl border bg-card shadow-2xl shadow-foreground/5">
          <iframe
            className="size-full"
            src="https://www.youtube-nocookie.com/embed/hqqT7hgJaLI"
            title="Shadow product walkthrough"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-8 text-sm text-muted-foreground">
        <span>Shadow</span>
        <span>Reads your code through the GitHub API. Never writes to it.</span>
      </div>
    </footer>
  );
}
