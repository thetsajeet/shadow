import { count, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { db } from "@/db";
import { generations, pages, repos } from "@/db/schema";
import { DocumentedGrid, type DocRepo } from "@/components/profile/documented-grid";
import { ProfileHeader } from "@/components/profile/profile-header";
import { RepoPicker } from "@/components/profile/repo-picker";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/current-user";
import { fetchOwnedRepos, fetchProfile } from "@/lib/github-user";
import { getUserGithubToken } from "@/lib/user-token";

export const metadata = { title: "Your repositories — Shadow" };

async function documented(userId: string): Promise<DocRepo[]> {
  const rows = await db()
    .select({ repo: repos, gen: generations })
    .from(repos)
    .innerJoin(generations, eq(generations.id, repos.currentGenerationId))
    .where(eq(repos.ownerUserId, userId))
    .orderBy(desc(generations.finishedAt));
  return Promise.all(
    rows.map(async ({ repo, gen }) => {
      const [{ n }] = await db().select({ n: count() }).from(pages).where(eq(pages.generationId, gen.id));
      return {
        owner: repo.owner,
        name: repo.name,
        description: repo.description,
        visibility: repo.visibility,
        sha: gen.commitSha,
        generatedAt: gen.finishedAt?.toISOString() ?? null,
        pageCount: n,
      };
    }),
  );
}

async function Dashboard() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/profile");
  const token = await getUserGithubToken(user.id);
  const [profile, owned, docs] = await Promise.all([fetchProfile(token), fetchOwnedRepos(token), documented(user.id)]);
  return (
    <>
      <SiteHeader user={{ login: profile.login, image: profile.avatarUrl }} />
      <main className="mx-auto w-full max-w-5xl space-y-12 px-4 py-10">
        <ProfileHeader profile={profile} />
        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Your documentation</h2>
          <DocumentedGrid repos={docs} />
        </section>
        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Generate or update docs</h2>
          <RepoPicker repos={owned} />
        </section>
      </main>
    </>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted-foreground">Loading your profile…</div>}>
      <Dashboard />
    </Suspense>
  );
}
