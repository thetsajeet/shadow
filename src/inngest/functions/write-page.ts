import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { addTokens, loadContext, loadFiles } from "@/lib/generation";
import { guard } from "@/lib/errors-codec";
import { incrementJobDone } from "@/lib/jobs";
import { logger } from "@/lib/logger";
import { writePage } from "@/lib/pipeline/write";
import { inngest } from "../client";
import { pageInput } from "../events";

export const writeWikiPage = inngest.createFunction(
  {
    id: "write-wiki-page",
    triggers: [pageInput],
    // Global cap on parallel LLM writers across all users (Gemini quota).
    concurrency: { limit: 4 },
    retries: 3,
  },
  async ({ event, step }) => {
    const { jobId, generationId, slug } = event.data;
    return step.run("write", () =>
      guard(async () => {
        const [row] = await db().select().from(pages).where(and(eq(pages.generationId, generationId), eq(pages.slug, slug)));
        if (!row) throw new Error(`Page ${slug} not found`);
        const ctx = await loadContext(generationId);
        const outline = await db().select({ slug: pages.slug, title: pages.title }).from(pages).where(eq(pages.generationId, generationId));
        const files = await loadFiles(generationId, row.sourceFiles);
        const res = await writePage({
          ctx,
          page: { slug, title: row.title, summary: row.summary, files: row.sourceFiles },
          outline,
          files,
        });
        await db()
          .update(pages)
          .set({ markdown: res.markdown, status: "done", error: null, tokens: res.tokensIn + res.tokensOut })
          .where(eq(pages.id, row.id));
        await addTokens(generationId, res.tokensIn, res.tokensOut);
        await incrementJobDone(jobId);
        logger.info({ jobId, generationId, slug, tokens: res.tokensIn + res.tokensOut }, "page written");
        return { slug };
      }),
    );
  },
);
