import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs, repos } from "@/db/schema";
import { findRepo } from "./wiki-store";

/** Removes every stored artifact for an owned repo and prevents queued jobs from recreating it. */
export async function deleteRepoWiki(userId: string, owner: string, name: string): Promise<boolean> {
  const repo = await findRepo(owner, name);
  if (!repo || repo.ownerUserId !== userId) return false;
  await db().transaction(async (tx) => {
    const byRepo = and(eq(jobs.userId, userId), sql`lower(${jobs.owner}) = ${owner.toLowerCase()}`, sql`lower(${jobs.name}) = ${name.toLowerCase()}`);
    await tx.update(jobs).set({
      repoId: null,
      generationId: null,
      updatedAt: new Date(),
    }).where(and(byRepo, inArray(jobs.status, ["done", "error"])));
    await tx.update(jobs).set({
      status: "error",
      step: "Cancelled by owner",
      errorCode: "CANCELLED",
      errorMessage: "This repository wiki was removed by its owner.",
      updatedAt: new Date(),
    }).where(and(byRepo, inArray(jobs.status, ["queued", "running"])));
    await tx.execute(sql`
      DELETE FROM feedback
      WHERE target_id IN (
        SELECT p.id FROM pages p JOIN generations g ON g.id = p.generation_id WHERE g.repo_id = ${repo.id}
        UNION
        SELECT m.id FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN generations g ON g.id = c.generation_id WHERE g.repo_id = ${repo.id}
      )
    `);
    await tx.delete(repos).where(eq(repos.id, repo.id));
  });
  return true;
}
