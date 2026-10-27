import type { RepoContext } from "./types";

const LANGS: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", rb: "Ruby", php: "PHP", cs: "C#",
  c: "C", h: "C", cpp: "C++", cc: "C++", swift: "Swift", scala: "Scala", ex: "Elixir", sh: "Shell",
};

const ENTRY_RE =
  /(^|\/)(main|index|app|server|cli|__main__|manage|lib|mod)\.(ts|tsx|js|jsx|mjs|py|go|rs|java|kt|rb|php)$|(^|\/)(cmd\/[^/]+\/main\.go|src\/(main|lib)\.rs|app\/(page|layout)\.tsx)$/;
const TEST_RE = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py)$/;
const DOC_RE = /^docs?\/|\.mdx?$/i;

export interface RepoAnalysis {
  languages: { name: string; files: number }[];
  primaryLanguage: string | null;
  entryPoints: string[];
  topDirs: { dir: string; files: number; sample: string[] }[];
  testFiles: number;
  hasCi: boolean;
  hasDocker: boolean;
  isMonorepo: boolean;
  scripts: Record<string, string>;
  dependencies: string[];
}

function parseJson(text: string | undefined): Record<string, unknown> {
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function analyzeRepo(ctx: Pick<RepoContext, "tree" | "manifests">): RepoAnalysis {
  const langCount = new Map<string, number>();
  const dirs = new Map<string, string[]>();
  let testFiles = 0;
  for (const f of ctx.tree) {
    const ext = f.split(".").pop()?.toLowerCase() ?? "";
    const lang = LANGS[ext];
    if (lang && !TEST_RE.test(f)) langCount.set(lang, (langCount.get(lang) ?? 0) + 1);
    if (TEST_RE.test(f)) testFiles++;
    const parts = f.split("/");
    const dir = parts.length > 1 ? parts[0] : ".";
    dirs.set(dir, [...(dirs.get(dir) ?? []), f]);
  }
  const languages = [...langCount].map(([name, files]) => ({ name, files })).sort((a, b) => b.files - a.files);

  const entryPoints = ctx.tree
    .filter((f) => ENTRY_RE.test(f) && !TEST_RE.test(f) && f.split("/").length <= 4)
    .sort((a, b) => a.split("/").length - b.split("/").length)
    .slice(0, 12);

  const topDirs = [...dirs]
    .filter(([d]) => d !== ".")
    .map(([dir, files]) => ({ dir, files: files.length, sample: files.filter((f) => !DOC_RE.test(f)).slice(0, 4) }))
    .sort((a, b) => b.files - a.files)
    .slice(0, 12);

  const pkg = parseJson(ctx.manifests["package.json"]);
  const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {};
  const deps = Object.keys({ ...((pkg.dependencies as object) ?? {}), ...((pkg.devDependencies as object) ?? {}) });

  const manifestCount = ctx.tree.filter((f) => /(^|\/)(package\.json|go\.mod|Cargo\.toml|pyproject\.toml)$/.test(f)).length;
  return {
    languages,
    primaryLanguage: languages[0]?.name ?? null,
    entryPoints,
    topDirs,
    testFiles,
    hasCi: ctx.tree.some((f) => f.startsWith(".github/workflows/") || f === ".gitlab-ci.yml"),
    hasDocker: ctx.tree.some((f) => /(^|\/)(Dockerfile|docker-compose\.ya?ml)$/.test(f)),
    isMonorepo: manifestCount > 2 || ctx.tree.some((f) => /^(packages|apps|crates|services)\//.test(f)),
    scripts,
    dependencies: deps.slice(0, 40),
  };
}

export function formatAnalysis(a: RepoAnalysis): string {
  const lines = [
    `Languages: ${a.languages.slice(0, 5).map((l) => `${l.name} (${l.files})`).join(", ") || "unknown"}`,
    `Entry point candidates: ${a.entryPoints.join(", ") || "none detected"}`,
    `Top-level directories:\n${a.topDirs.map((d) => `- ${d.dir}/ (${d.files} files) e.g. ${d.sample.join(", ")}`).join("\n")}`,
    `Tests: ${a.testFiles} test files; CI: ${a.hasCi ? "yes" : "no"}; Docker: ${a.hasDocker ? "yes" : "no"}; Monorepo: ${a.isMonorepo ? "yes" : "no"}`,
  ];
  if (Object.keys(a.scripts).length) {
    lines.push(`package.json scripts: ${Object.entries(a.scripts).map(([k, v]) => `${k}=\`${v}\``).join("; ")}`);
  }
  if (a.dependencies.length) lines.push(`Key dependencies: ${a.dependencies.join(", ")}`);
  return lines.join("\n");
}
