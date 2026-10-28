import { eventType, invoke } from "inngest";
import { z } from "zod";

export const generateRequested = eventType("wiki/generate.requested", {
  schema: z.object({
    jobId: z.string().uuid(),
    owner: z.string(),
    name: z.string(),
    userId: z.string(),
    // Set for a sync: the generation to diff against and carry unchanged pages forward from.
    baseGenerationId: z.string().uuid().optional(),
  }),
});

export const retryRequested = eventType("wiki/retry.requested", {
  schema: z.object({
    jobId: z.string().uuid(),
    generationId: z.string().uuid(),
    owner: z.string(),
    name: z.string(),
    userId: z.string(),
  }),
});

export const pageInput = invoke(
  z.object({
    jobId: z.string().uuid(),
    generationId: z.string().uuid(),
    slug: z.string(),
  }),
);
