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

const steps = [
  { n: "01", title: "Sign in with GitHub", body: "Shadow lists the repositories you own. It only reads them." },
  { n: "02", title: "Pick a repo and generate", body: "An outline is planned from the file tree, then each page is written from the files it covers." },
  { n: "03", title: "Read, ask, and sync", body: "Browse the wiki, ask follow-up questions, and sync when the branch moves on." },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-24">
        <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-12 grid gap-10 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n}>
              <span className="font-mono text-sm text-muted-foreground">{s.n}</span>
              <h3 className="mt-2 text-lg font-medium">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
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
