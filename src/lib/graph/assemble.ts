import { updateJob } from "../jobs";
import { writeWiki } from "../wiki-store";
import type { GraphStateType } from "./state";

export async function assemble(state: GraphStateType): Promise<Partial<GraphStateType>> {
  updateJob(state.jobId, { step: "Assembling wiki" });
  const { user, repo } = state.repo;
  const order = new Map(state.outline.map((p, i) => [p.slug, i]));
  const pages = [...state.pages].sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));

  await writeWiki(
    user,
    repo,
    {
      repo: `${user}/${repo}`,
      branch: state.branch,
      sha: state.sha,
      generatedAt: new Date().toISOString(),
      pages: pages.map(({ slug, title, summary }) => ({ slug, title, summary })),
    },
    Object.fromEntries(pages.map((p) => [p.slug, p.markdown])),
  );
  return { wikiPath: `/wiki/${user}/${repo}` };
}
