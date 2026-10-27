# Shadow

Paste a public GitHub repo URL and Shadow generates a DeepWiki-style documentation site: an LLM-planned outline, per-page Markdown with Mermaid diagrams and source links pinned to the commit SHA.

## Stack
Next.js 16 (App Router), React 19, TypeScript, Bun, LangGraph JS + Gemini, Tailwind, shadcn/ui, Aceternity-style components, Framer Motion, react-markdown + shiki + mermaid.

## Setup
```bash
bun install
cp .env.example .env.local   # then set GOOGLE_API_KEY
bun run dev                  # http://localhost:3000
```
Requires `git` on the PATH.

| Env var | Purpose | Default |
|---|---|---|
| `GOOGLE_API_KEY` | Gemini API key (required) | – |
| `GEMINI_MODEL` | model for page writing | `gemini-3.1-flash-lite` |
| `GEMINI_PLAN_MODEL` | model for outline planning | same as `GEMINI_MODEL` |
| `JOB_TIMEOUT_MS` | global job timeout | `900000` |

## How it works
`ingest → plan_outline → generate_page × N (Send fan-out, concurrency 3) → assemble` (`src/lib/graph/`).
- Default branch only, shallow single-branch clone; the HEAD SHA is used in all source links.
- Binary/lock/build/large (>200KB) files are filtered; repos with more than 500 files are rejected.
- One job at a time server-wide (`409 { error: "busy", currentRepo }`); job state is in memory.
- Wikis are written to `data/wiki/<user>/<repo>/` (gitignored); resubmitting overwrites.
- Viewer: `/wiki/<user>/<repo>/<page>`.

## API
- `POST /api/jobs` `{ url }` → `{ jobId }` | `400` | `409`
- `GET /api/jobs/:id` → `{ status, step, progress: { done, total }, repo, wikiPath?, error? }`

## Scripts
`bun run dev`, `bun run lint`, `bun run build`, `bun run start`.
