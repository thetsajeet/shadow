import { FileQuestion } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Markdown } from "@/components/markdown";
import { PageTransition } from "@/components/page-transition";
import { Sidebar } from "@/components/sidebar";
import { Toc } from "@/components/toc";
import { WikiHeader } from "@/components/wiki-header";
import { SAFE_SEGMENT } from "@/lib/repo-url";
import { extractToc } from "@/lib/toc";
import { readMeta, readPage } from "@/lib/wiki-store";


type Params = { user: string; repo: string; page?: string[] };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { user, repo } = await params;
  return { title: `${user}/${repo} — Shadow` };
}

function NotFoundState({ user, repo }: { user: string; repo: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <FileQuestion className="size-12 text-muted-foreground" />
      <h1 className="text-2xl font-bold">No wiki for {user}/{repo} yet</h1>
      <p className="text-muted-foreground">Generate documentation for this repository to see it here.</p>
      <Link href="/" className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">
        Generate docs
      </Link>
    </main>
  );
}

async function WikiContent({ params }: { params: Promise<Params> }) {
  await connection();
  const { user, repo, page } = await params;
  const valid = SAFE_SEGMENT.test(user) && SAFE_SEGMENT.test(repo) && (!page || (page.length === 1 && SAFE_SEGMENT.test(page[0])));
  const meta = valid ? await readMeta(user, repo) : null;
  if (!meta) return <NotFoundState user={user} repo={repo} />;

  const slug = page?.[0] ?? meta.pages[0]?.slug;
  const current = meta.pages.find((p) => p.slug === slug);
  const md = current ? await readPage(user, repo, current.slug) : null;
  const base = `/wiki/${user}/${repo}`;

  return (
    <div className="min-h-screen">
      <WikiHeader repo={meta.repo} branch={meta.branch} sha={meta.sha} />
      <div className="mx-auto flex max-w-[90rem]">
        <Sidebar base={base} items={meta.pages} active={current?.slug ?? ""} />
        <main className="min-w-0 flex-1 px-4 py-8 lg:px-10">
          {current && md !== null ? (
            <PageTransition key={current.slug}>
              <article className="prose prose-neutral mx-auto max-w-3xl dark:prose-invert">
                <h1>{current.title}</h1>
                <Markdown source={md} />
              </article>
            </PageTransition>
          ) : (
            <div className="mx-auto max-w-3xl">
              <h1 className="text-2xl font-bold">Page not found</h1>
              <p className="mt-2 text-muted-foreground">
                This page does not exist in the wiki. <Link className="underline" href={base}>Go to overview</Link>.
              </p>
            </div>
          )}
        </main>
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto p-6 xl:block">
          {md && <Toc key={current?.slug} items={extractToc(md)} />}
        </aside>
      </div>
    </div>
  );
}

export default function WikiPage({ params }: { params: Promise<Params> }) {
  return (
    <Suspense fallback={<div className="min-h-screen animate-pulse bg-muted/30" />}>
      <WikiContent params={params} />
    </Suspense>
  );
}
