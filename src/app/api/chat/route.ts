import { convertToModelMessages, createUIMessageStreamResponse, toUIMessageStream, type UIMessage } from "ai";
import { and, count, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";
import { logger } from "@/lib/logger";
import { runAgent } from "@/lib/qa/agent";
import { SAFE_SEGMENT } from "@/lib/repo-url";
import { readMeta } from "@/lib/wiki-store";

export const maxDuration = 60;

const MESSAGES_PER_HOUR = 60;
const Body = z.object({
  owner: z.string().regex(SAFE_SEGMENT),
  repo: z.string().regex(SAFE_SEGMENT),
  conversationId: z.uuid().optional(),
  messages: z.array(z.any()).min(1).max(40),
});

function lastUserText(msgs: UIMessage[]): string {
  const m = [...msgs].reverse().find((x) => x.role === "user");
  return (m?.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join("").slice(0, 4000);
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { owner, repo, messages: uiMessages } = parsed.data as z.infer<typeof Body> & { messages: UIMessage[] };

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to ask questions", code: "UNAUTHENTICATED" }, { status: 401 });

  const meta = await readMeta(owner, repo, user);
  if (!meta) return NextResponse.json({ error: "No wiki found for this repository" }, { status: 404 });

  const [{ n }] = await db()
    .select({ n: count() })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(and(eq(conversations.userId, user.id), eq(messages.role, "user"), gt(messages.createdAt, new Date(Date.now() - 3_600_000))));
  if (n >= MESSAGES_PER_HOUR) return NextResponse.json({ error: "Too many questions, try again later" }, { status: 429 });

  const question = lastUserText(uiMessages);
  if (!question.trim()) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  let conversationId = parsed.data.conversationId;
  if (conversationId) {
    const [conv] = await db()
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id), eq(conversations.generationId, meta.generationId)));
    if (!conv) conversationId = undefined;
  }
  if (!conversationId) {
    const [conv] = await db().insert(conversations).values({ generationId: meta.generationId, userId: user.id }).returning({ id: conversations.id });
    conversationId = conv.id;
  }
  const convId = conversationId;
  await db().insert(messages).values({ conversationId: convId, role: "user", content: question });

  try {
    const result = runAgent(
      { generationId: meta.generationId, owner, name: repo, sha: meta.sha },
      await convertToModelMessages(uiMessages),
      async (text, tokens) => {
        await db().insert(messages).values({ conversationId: convId, role: "assistant", content: text, tokens });
      },
    );
    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
      headers: { "x-conversation-id": convId },
    });
  } catch (e) {
    logger.error({ err: e, owner, repo }, "chat failed");
    return NextResponse.json({ error: "Chat failed" }, { status: 500 });
  }
}
