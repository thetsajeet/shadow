import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { WikiHeader } from "@/components/wiki-header";
import { getCurrentUser } from "@/lib/current-user";
import { SAFE_SEGMENT } from "@/lib/repo-url";
import { readMeta } from "@/lib/wiki-store";

type Params = { user: string; repo: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { user, repo } = await params;
  return { title: `Ask ${user}/${repo} — Shadow` };
}

async function ChatContent({ params }: { params: Promise<Params> }) {
  await connection();
  const { user, repo } = await params;
  const meta = SAFE_SEGMENT.test(user) && SAFE_SEGMENT.test(repo) ? await readMeta(user, repo, await getCurrentUser()) : null;
  if (!meta) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-bold">No wiki for {user}/{repo} yet</h1>
        <Link href="/profile" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Go to your profile
        </Link>
      </main>
    );
  }
  return (
    <div className="min-h-screen">
      <WikiHeader repo={meta.repo} branch={meta.branch} sha={meta.sha} visibility={meta.visibility} isOwner={meta.isOwner} active="chat" />
      <ChatPanel owner={user} repo={repo} />
    </div>
  );
}

export default function ChatPage({ params }: { params: Promise<Params> }) {
  return (
    <Suspense fallback={<div className="min-h-screen animate-pulse bg-muted/30" />}>
      <ChatContent params={params} />
    </Suspense>
  );
}
