import { updateJob } from "../jobs";
import { fetchSnapshot } from "../snapshot";
import type { GraphStateType } from "./state";

const MANIFESTS = new Set([
  "package.json", "pyproject.toml", "go.mod", "Cargo.toml", "requirements.txt", "pom.xml",
  "build.gradle", "Gemfile", "composer.json", "setup.py", "Dockerfile", "docker-compose.yml",
]);

export async function ingest(state: GraphStateType): Promise<Partial<GraphStateType>> {
  updateJob(state.jobId, { step: "Fetching source from GitHub" });
  const snap = await fetchSnapshot(state.repo);

  const files: Record<string, string> = {};
  for (const f of snap.files) files[f.path] = f.content;
  const tree = snap.files.map((f) => f.path);

  const readmePath = tree.find((f) => /^readme(\.[a-z]+)?$/i.test(f));
  const readme = readmePath ? files[readmePath].slice(0, 12_000) : "";
  const manifests: Record<string, string> = {};
  for (const f of tree) {
    const base = f.split("/").pop() ?? f;
    if (MANIFESTS.has(base) && f.split("/").length <= 2) manifests[f] = files[f].slice(0, 6_000);
  }
  return { branch: snap.branch, sha: snap.sha, files, tree, readme, manifests };
}
