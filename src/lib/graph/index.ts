import { promises as fs } from "node:fs";
import { END, Send, START, StateGraph } from "@langchain/langgraph";
import { assemble } from "./assemble";
import { generatePage } from "./generate";
import { ingest, workDirFor } from "./ingest";
import { planOutline } from "./plan";
import { GraphState, type GraphStateType } from "./state";

const CONCURRENCY = 3;

const graph = new StateGraph(GraphState)
  .addNode("ingest", ingest)
  .addNode("plan_outline", planOutline)
  .addNode("generate_page", generatePage)
  .addNode("assemble", assemble)
  .addEdge(START, "ingest")
  .addEdge("ingest", "plan_outline")
  .addConditionalEdges("plan_outline", (s: GraphStateType) =>
    s.outline.map((page) => new Send("generate_page", { page, state: s })),
  )
  .addEdge("generate_page", "assemble")
  .addEdge("assemble", END)
  .compile();

export async function runWikiGraph(
  jobId: string,
  user: string,
  repo: string,
  signal?: AbortSignal,
): Promise<string> {
  try {
    const out = await graph.invoke(
      { jobId, repo: { user, repo } },
      { maxConcurrency: CONCURRENCY, recursionLimit: 100, signal },
    );
    return out.wikiPath;
  } finally {
    await fs.rm(workDirFor(jobId), { recursive: true, force: true });
  }
}
