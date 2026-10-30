import * as Sentry from "@sentry/nextjs";
import { isStepCount, streamText, tool, type ModelMessage } from "ai";
import { and, eq, like } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { env } from "@/env";
import { repoFiles } from "@/db/schema";
import { blobUrl } from "../urls";
import { makeAiSdkChatModel, selectedChatModel } from "../pipeline/models";
import { estimateCostMicros } from "../security-controls";
import { hybridSearch } from "./retrieve";

export interface AgentContext {
  generationId: string;
  owner: string;
  name: string;
  sha: string;
}

const MAX_READ_LINES = 400;

export function systemPrompt(c: AgentContext) {
  const ref = { user: c.owner, repo: c.name };
  return `You answer questions about the GitHub repository ${c.owner}/${c.name} at commit ${c.sha.slice(0, 7)}.
Use the tools to ground every answer: call search_code first, then read_file for details you need to verify. You may call tools several times. Never guess; if the code does not contain the answer, say so.
Cite evidence inline as Markdown links with line anchors, e.g. [\`src/app.ts:10-24\`](${blobUrl(ref, c.sha, "src/app.ts", { start: 10, end: 24 })}). Only cite paths and line ranges you actually saw in tool results (search results show the exact range).
Wiki chunks have paths like "wiki/<slug>"; link them as [title](/wiki/${c.owner}/${c.name}/<slug>) instead.
Be concise and use Markdown (code blocks, lists). Use Mermaid only if the user asks for a diagram.`;
}

export function agentTools(c: AgentContext) {
  return {
    search_code: tool({
      description: "Semantic + keyword search over the repo's source code and generated wiki. Returns snippets with file path and line range.",
      inputSchema: z.object({ query: z.string().describe("natural language or identifier query") }),
      execute: async ({ query }) => {
        const hits = await hybridSearch(c.generationId, query, 8);
        return hits.map((h) => ({ path: h.path, kind: h.kind, lines: `${h.startLine}-${h.endLine}`, content: h.content }));
      },
    }),
    read_file: tool({
      description: `Read a source file by exact repo-relative path (max ${MAX_READ_LINES} lines per call). Lines are returned with numbers.`,
      inputSchema: z.object({
        path: z.string(),
        startLine: z.number().int().min(1).optional(),
        endLine: z.number().int().min(1).optional(),
      }),
      execute: async ({ path, startLine = 1, endLine }) => {
        const [row] = await db()
          .select({ content: repoFiles.content })
          .from(repoFiles)
          .where(and(eq(repoFiles.generationId, c.generationId), eq(repoFiles.path, path)));
        if (!row) return { error: `No such file: ${path}. Use list_files to find paths.` };
        const lines = row.content.split("\n");
        const end = Math.min(endLine ?? startLine + MAX_READ_LINES - 1, startLine + MAX_READ_LINES - 1, lines.length);
        return {
          path,
          totalLines: lines.length,
          range: `${startLine}-${end}`,
          content: lines.slice(startLine - 1, end).map((l, i) => `${startLine + i}| ${l}`).join("\n"),
        };
      },
    }),
    list_files: tool({
      description: "List repo file paths under a directory prefix (e.g. 'src/lib/'). Empty prefix lists the top of the tree.",
      inputSchema: z.object({ prefix: z.string().default("") }),
      execute: async ({ prefix }) => {
        const safe = prefix.replace(/[%_\\]/g, "\\$&");
        const rows = await db()
          .select({ path: repoFiles.path })
          .from(repoFiles)
          .where(and(eq(repoFiles.generationId, c.generationId), like(repoFiles.path, `${safe}%`)))
          .limit(200);
        return rows.map((r) => r.path).sort();
      },
    }),
  };
}

export function runAgent(
  c: AgentContext,
  messages: ModelMessage[],
  onFinish: (text: string, tokens: number, costMicros: number) => void | Promise<void>,
  onFailure: () => void | Promise<void> = () => {},
) {
  const model = selectedChatModel("chat");
  return Sentry.startSpanManual({
    name: "llm.chat",
    op: "gen_ai.request",
    attributes: {
      "gen_ai.system": env().MODEL_PROVIDER,
      "gen_ai.request.model": model,
      "shadow.generation_id": c.generationId,
    },
  }, (span, finish) => {
    let ended = false;
    let terminalHandled = false;
    const endSpan = () => {
      if (ended) return;
      ended = true;
      finish();
    };
    const claimTerminal = () => {
      if (terminalHandled) return false;
      terminalHandled = true;
      return true;
    };
    try {
      return streamText({
        model: makeAiSdkChatModel(model),
        instructions: systemPrompt(c),
        messages,
        tools: agentTools(c),
        stopWhen: isStepCount(6),
        temperature: 0.2,
        onFinish: async (e) => {
          if (!claimTerminal()) return;
          const input = e.totalUsage?.inputTokens ?? 0;
          const output = e.totalUsage?.outputTokens ?? 0;
          const costMicros = estimateCostMicros(model, input, output);
          span.setAttribute("gen_ai.usage.input_tokens", input);
          span.setAttribute("gen_ai.usage.output_tokens", output);
          span.setAttribute("gen_ai.usage.cost_usd", costMicros / 1_000_000);
          try {
            await onFinish(e.text, input + output, costMicros);
          } catch (error) {
            try {
              await onFailure();
            } catch (releaseError) {
              Sentry.captureException(releaseError);
            }
            throw error;
          } finally {
            endSpan();
          }
        },
        onError: async ({ error }) => {
          Sentry.captureException(error);
          if (!claimTerminal()) return;
          try {
            await onFailure();
          } finally {
            endSpan();
          }
        },
        onAbort: async () => {
          if (!claimTerminal()) return;
          try {
            await onFailure();
          } finally {
            endSpan();
          }
        },
      });
    } catch (error) {
      endSpan();
      throw error;
    }
  });
}
