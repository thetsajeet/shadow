import { Annotation } from "@langchain/langgraph";
import { z } from "zod";

export const OutlineSchema = z.object({
  pages: z
    .array(
      z.object({
        slug: z.string().describe("lowercase kebab-case url slug, e.g. 'architecture'"),
        title: z.string(),
        summary: z.string().describe("one or two sentences on what the page covers"),
        files: z.array(z.string()).describe("repo-relative file paths most relevant to this page"),
      }),
    )
    .min(1),
});

export type OutlinePage = z.infer<typeof OutlineSchema>["pages"][number];

export interface GeneratedPage {
  slug: string;
  title: string;
  summary: string;
  markdown: string;
}

export interface RepoInfoState {
  user: string;
  repo: string;
}

export const GraphState = Annotation.Root({
  jobId: Annotation<string>(),
  repo: Annotation<RepoInfoState>(),
  branch: Annotation<string>(),
  sha: Annotation<string>(),
  workdir: Annotation<string>(),
  tree: Annotation<string[]>(),
  readme: Annotation<string>(),
  manifests: Annotation<Record<string, string>>(),
  outline: Annotation<OutlinePage[]>(),
  pages: Annotation<GeneratedPage[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  wikiPath: Annotation<string>(),
});

export type GraphStateType = typeof GraphState.State;

export function getModel() {
  return process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
}
export function getPlanModel() {
  return process.env.GEMINI_PLAN_MODEL ?? getModel();
}
