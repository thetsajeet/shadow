import type { MetadataRoute } from "next";
import { and, eq, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { generations, pages, repos } from "@/db/schema";
import { listPublicWikis } from "@/lib/wiki-store";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;
  const wikis = await listPublicWikis(9_998);
  const pageRows = await db()
    .select({ owner: repos.owner, name: repos.name, slug: pages.slug, updatedAt: generations.finishedAt })
    .from(pages)
    .innerJoin(generations, eq(pages.generationId, generations.id))
    .innerJoin(repos, eq(repos.currentGenerationId, generations.id))
    .where(and(eq(repos.visibility, "public"), eq(pages.status, "done"), sql`${generations.status} IN ('done', 'partial')`))
    .limit(39_999);
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/wikis`, changeFrequency: "daily", priority: 0.8 },
    ...wikis.map((wiki) => ({
      url: `${base}/wiki/${wiki.owner}/${wiki.name}`,
      lastModified: new Date(wiki.generatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...pageRows.map((page) => ({
      url: `${base}/wiki/${page.owner}/${page.name}/${page.slug}`,
      lastModified: page.updatedAt ?? undefined,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
