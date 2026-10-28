import { z } from "zod";
import { env } from "@/env";

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

export interface RepoContext {
  owner: string;
  name: string;
  sha: string;
  description: string | null;
  tree: string[];
  readme: string;
  manifests: Record<string, string>;
}

export const writeModel = () => env().GEMINI_MODEL;
export const planModel = () => env().GEMINI_PLAN_MODEL ?? env().GEMINI_MODEL;

export const PROMPT_VERSION = "v3";
