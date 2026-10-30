import { and, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { feedback, jobs } from "@/db/schema";

export async function pruneRetainedRepositoryData(cutoff: Date): Promise<void> {
  await db().execute(sql`
    DELETE FROM generations g
    WHERE g.started_at < ${cutoff.toISOString()}::timestamptz
      AND NOT EXISTS (SELECT 1 FROM repos r WHERE r.current_generation_id = g.id)
  `);
  await db().delete(jobs).where(and(lt(jobs.createdAt, cutoff), inArray(jobs.status, ["done", "error"])));
  await db().delete(feedback).where(lt(feedback.createdAt, cutoff));
}
