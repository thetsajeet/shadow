# Shadow

Paste a public GitHub repo URL and Shadow generates a DeepWiki-style documentation site: an LLM-planned outline, per-page Markdown with Mermaid diagrams and source links pinned to the commit SHA.

## Stack
Next.js 16, React 19, TypeScript, Bun, Inngest (durable pipeline), Supabase Postgres + Drizzle + pgvector, Octokit, Gemini, Vercel AI SDK, Tailwind, shadcn/ui, Framer Motion, react-markdown + shiki + mermaid.

## Setup
```bash
bun install
cp .env.example .env.local   # fill in values (see below)
bun run db:migrate           # needs DATABASE_URL_DIRECT
bunx inngest-cli@latest dev  # Inngest Dev Server on :8288 (set INNGEST_DEV=1)
bun run dev                  # http://localhost:3000
```

| Env var | Purpose |
|---|---|
| `DATABASE_URL` | Supabase pooled connection string |
| `DATABASE_URL_DIRECT` | direct connection, used for migrations |
| `GITHUB_TOKEN` | Octokit token (raises rate limits) |
| `GOOGLE_API_KEY` | Gemini API key |
| `GEMINI_MODEL` / `GEMINI_PLAN_MODEL` / `GEMINI_EMBED_MODEL` | model overrides |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Inngest Cloud keys (not needed with the Dev Server) |
| `SESSION_SECRET` | signs the per-browser session cookie |

## How it works
`POST /api/jobs` validates the repo via Octokit, then sends an Inngest event. The `generate` function runs as durable steps: ingest (tarball download, no clone) → plan outline → fan out one `write-page` invocation per page (global concurrency 4, retries) → finalize.
- Default branch only; the HEAD SHA pins all source links.
- Files are filtered (binary, lockfiles, build output, >200KB); repos over 500 files are rejected.
- Everything is stored in Postgres. Each run is a *generation*; `repos.current_generation_id` is swapped atomically on success and the last 3 are kept.
- One active job per browser session, plus per-IP and per-session hourly limits. An unchanged HEAD SHA reuses the current wiki.
- Partial failures finish as `done` with `errorCode=PARTIAL`; failed pages can be retried.
- Progress is streamed to the UI over SSE.

## API
- `POST /api/jobs` `{ url, force? }` → `{ jobId }` | `400` | `409 { jobId }` | `429`
- `GET /api/jobs/:id`, `GET /api/jobs/:id/stream` (SSE), `POST /api/jobs/:id/retry`
- `/api/inngest` is the Inngest serve endpoint.

## Scripts
`bun run dev`, `lint`, `typecheck`, `test`, `build`, `db:generate`, `db:migrate`.
