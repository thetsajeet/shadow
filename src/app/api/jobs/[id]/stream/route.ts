import { z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { getJob, toView } from "@/lib/jobs";

export const maxDuration = 60;

const POLL_MS = 1000;
const MAX_MS = 55_000;

/** Server-sent events driven by the jobs row; the client reconnects when the window closes. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return new Response("Not found", { status: 404 });

  const user = await getCurrentUser();
  const owned = user && (await getJob(id))?.userId === user.id;
  if (!owned) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const started = Date.now();
      let last = "";
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        while (!req.signal.aborted && Date.now() - started < MAX_MS) {
          const job = await getJob(id);
          if (!job) {
            send("error", { error: "Job not found" });
            break;
          }
          const view = toView(job);
          const payload = JSON.stringify(view);
          if (payload !== last) {
            last = payload;
            send("job", view);
          }
          if (job.status === "done" || job.status === "error") break;
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
