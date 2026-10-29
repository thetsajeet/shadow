# Shadow

Sign in with GitHub, pick one of your repositories and Shadow generates a DeepWiki-style documentation site: an LLM-planned outline, per-page Markdown with Mermaid diagrams and source links pinned to the commit SHA. Includes Q&A over the code and incremental sync when the branch moves on.

## Stack
Next.js 16, React 19, TypeScript, Bun, Inngest (durable pipeline), Supabase Postgres + Drizzle + pgvector, Octokit, Gemini, Vercel AI SDK, better-auth (GitHub SSO only), Tailwind + tweakcn *graphite* theme, shadcn/ui, Framer Motion, react-markdown + shiki + mermaid.

## GitHub OAuth App
Create one at GitHub → Settings → Developer settings → OAuth Apps:
- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

Put its Client ID and secret in `.env.local`. The app requests `read:user`, `user:email` and `repo` (needed to read your private repositories; Shadow never writes to them). Override with `GITHUB_OAUTH_SCOPES=read:user,user:email` to restrict sign-in to public repos.

## Setup
```bash
bun install
cp .env.example .env.local   # fill in values (see below)
bun run db:migrate           # needs DATABASE_URL_DIRECT
docker compose up -d         # Inngest Dev Server on :8288 (set INNGEST_DEV=1)
bun run dev                  # http://localhost:3000
```

| Env var | Purpose |
|---|---|
| `DATABASE_URL` | Supabase pooled connection string |
| `DATABASE_URL_DIRECT` | direct connection, used for migrations |
| `GITHUB_TOKEN` | Octokit token (raises rate limits) |
| `MODEL_PROVIDER` / `EMBEDDING_PROVIDER` | `google` (default) or `openai`, configured independently |
| `GOOGLE_API_KEY` | Gemini API key, required when either provider is Google |
| `GEMINI_MODEL` / `GEMINI_PLAN_MODEL` / `GEMINI_EMBED_MODEL` | model overrides |
| `OPENAI_API_KEY` | OpenAI API key when using an OpenAI provider |
| `OPENAI_MODEL` / `OPENAI_EMBED_MODEL` | OpenAI model overrides |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Optional server and client error monitoring |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile; required in production for generation and chat |
| `GENERATION_ENABLED` | Global AI kill switch (`true` by default) |
| `MAX_GENERATION_TOKENS` / `DAILY_TOKEN_BUDGET` | Per-generation and per-user daily token caps |
| `RATE_LIMIT_GENERATION_PER_IP` / `RATE_LIMIT_CHAT_PER_IP` / `RATE_LIMIT_WINDOW_SECONDS` | Hashed-IP request limits (default 10 generation and 30 chat requests per hour); the deployment proxy must overwrite `x-real-ip` |
| `DATA_RETENTION_DAYS` | Age after which non-current generations and completed jobs are pruned (default 90) |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Inngest Cloud keys (not needed with the Dev Server) |
| `SESSION_SECRET` | better-auth secret (also encrypts stored OAuth tokens) |
| `BETTER_AUTH_URL` | public base URL of the app (default `http://localhost:3000`) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth App credentials |
| `GITHUB_OAUTH_SCOPES` | OAuth scopes (default `read:user,user:email,repo`) |

## Flow
Landing → sign in with GitHub → `/profile` (your GitHub profile, a grid of documented repos, and a repo picker) → wiki (`/wiki/<owner>/<repo>`) with an **Ask** tab.

- **Access:** public wikis are readable by anyone; private-repo wikis only by their owner (everyone else gets a 404). Only the owner can generate or sync. Ask requires sign-in. Only repos you personally own are listed (no org repos).
- **Tokens:** the user's OAuth token is stored encrypted and read inside Inngest steps; it is never put in event payloads.
- **Generate:** `POST /api/repos/:owner/:name/generate` validates ownership and the repo via Octokit, then sends an Inngest event. The `generate` function runs as durable steps: ingest (tarball download, no clone) → plan outline → fan out one `write-page` invocation per page (global concurrency 4, retries) → finalize.
- **Sync:** the profile compares the branch head with the stored wiki commit (`GET /api/repos/:owner/:name/status`, cached ~2 min) and offers *Sync* when they differ. Sync is manual. It diffs the stored `repo_files.blob_sha` values against the new snapshot once (no per-commit work), rewrites only pages whose source files changed, copies the rest forward with source links re-pinned to the new SHA, and re-plans the outline when more than ~30% of files change or a new top-level directory appears. The old wiki keeps being served until the new one is ready; Ask is disabled while a job runs for that repo.
- Default branch only; the HEAD SHA pins all source links.
- Files are filtered (binary, lockfiles, build output, >200KB); repos over 500 files are rejected.
- Unsafe archive paths and oversized snapshots are rejected, and common API keys, credentials, dotenv values, and private-key files are excluded or redacted before model prompts. Detected repository license information is included in generation context and license/notice files are included in exports.
- Everything is stored in Postgres. Each run is a *generation*; `repos.current_generation_id` is swapped atomically on success and the last 3 are kept.
- One active job per repository, plus a per-user hourly limit. An unchanged HEAD SHA reuses the current wiki.
- Partial failures finish as `done` with `errorCode=PARTIAL`; failed pages can be retried.
- Progress is streamed to the UI over SSE (job owner only).
- Owners can delete a wiki and its stored repository artifacts from the profile. A daily retention task removes stale generations, completed jobs, feedback, expired auth records, and old abuse-control counters while preserving each current wiki.
- Token budgets reserve an estimate for each model operation and reconcile it to reported usage after success; failed operations release their reservation. `MAX_GENERATION_TOKENS` defaults to 500,000 to cover a 14-page generation plus indexing estimates.
- `GENERATION_ENABLED=false` pauses generation and AI chat globally. Token usage and estimated provider costs are recorded for generated pages and Q&A.

### Public discovery and export
Public wikis can be discovered at `/wikis`; individual wiki pages include search, canonical/SEO metadata, and Open Graph images. The sitemap and `robots.txt` expose only public content. Each wiki has a ZIP export and an `llms.txt` endpoint. Private wikis remain owner-only and are excluded from public discovery.

### Quality checks
Run `bun run lint`, `bun run typecheck`, `bun run test`, `bun run test:e2e`, `bun run db:check`, and `bun run build`. The Playwright suite covers public landing and responsive layout; PGlite integration tests cover wiki persistence, search indexing, access control, and deletion.

### Q&A
After the pages are written, code and wiki sections are chunked and embedded (`gemini-embedding-001`, 768 dims, pgvector; vectors are reused for unchanged files by blob SHA). The **Ask** tab (`/wiki/<user>/<repo>/chat`) streams answers from `POST /api/chat`, a Vercel AI SDK tool-calling agent with `search_code` (hybrid vector + full-text, rank-fused), `read_file` and `list_files`. Answers cite exact lines pinned to the commit SHA. Limit: 60 questions per user per hour.

## API
- `/api/auth/*` better-auth (GitHub only)
- `POST /api/repos/:owner/:name/generate` → `{ jobId }` | `401` | `403` | `409 { jobId }` | `503`
- `POST /api/repos/:owner/:name/sync` (the Resync button; checks the live head first and returns `{ upToDate: true }` without spending tokens when unchanged) → `{ jobId }` | `404` (not documented yet)
- `GET /api/repos/:owner/:name/status` → staleness (`docSha`, `headSha`, `behindBy`, `syncing`)
- `GET /api/jobs/:id`, `GET /api/jobs/:id/stream` (SSE), `POST /api/jobs/:id/retry` (job owner only)
- `POST /api/chat` `{ owner, repo, messages, conversationId? }` → UI message stream (`401` signed out, `409` while syncing)
- `/api/inngest` is the Inngest serve endpoint.

## Scripts
`bun run dev`, `lint`, `typecheck`, `test`, `build`, `db:generate`, `db:migrate`.
