import { sql } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const EMBED_DIMS = 768;

export const repos = pgTable(
  "repos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    defaultBranch: text("default_branch").notNull(),
    description: text("description"),
    currentGenerationId: uuid("current_generation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("repos_owner_name_uq").on(t.owner, t.name)],
);

export const generations = pgTable(
  "generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repoId: uuid("repo_id").notNull().references(() => repos.id, { onDelete: "cascade" }),
    commitSha: text("commit_sha").notNull(),
    branch: text("branch").notNull(),
    status: text("status", { enum: ["running", "done", "partial", "error"] }).notNull().default("running"),
    analysis: jsonb("analysis"),
    outline: jsonb("outline"),
    planModel: text("plan_model"),
    writeModel: text("write_model"),
    promptVersion: text("prompt_version"),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("generations_repo_idx").on(t.repoId), index("generations_repo_sha_idx").on(t.repoId, t.commitSha)],
);

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generationId: uuid("generation_id").notNull().references(() => generations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    position: integer("position").notNull(),
    parentSlug: text("parent_slug"),
    kind: text("kind").notNull().default("page"),
    markdown: text("markdown"),
    sourceFiles: jsonb("source_files").$type<string[]>().notNull().default([]),
    status: text("status", { enum: ["pending", "done", "error"] }).notNull().default("pending"),
    error: text("error"),
    tokens: integer("tokens").notNull().default(0),
  },
  (t) => [uniqueIndex("pages_generation_slug_uq").on(t.generationId, t.slug), index("pages_generation_idx").on(t.generationId)],
);

export const repoFiles = pgTable(
  "repo_files",
  {
    generationId: uuid("generation_id").notNull().references(() => generations.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    language: text("language"),
    size: integer("size").notNull(),
    blobSha: text("blob_sha").notNull(),
    content: text("content").notNull(),
  },
  (t) => [uniqueIndex("repo_files_gen_path_uq").on(t.generationId, t.path), index("repo_files_blob_idx").on(t.blobSha)],
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generationId: uuid("generation_id").notNull().references(() => generations.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    blobSha: text("blob_sha"),
    kind: text("kind", { enum: ["code", "wiki"] }).notNull().default("code"),
    startLine: integer("start_line").notNull(),
    endLine: integer("end_line").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: EMBED_DIMS }),
    tsv: tsvector("tsv").generatedAlwaysAs(sql`to_tsvector('english', content)`),
  },
  (t) => [
    index("chunks_generation_idx").on(t.generationId),
    index("chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("chunks_tsv_idx").using("gin", t.tsv),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repoId: uuid("repo_id").references(() => repos.id, { onDelete: "set null" }),
    generationId: uuid("generation_id").references(() => generations.id, { onDelete: "set null" }),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    sessionId: text("session_id").notNull(),
    inngestRunId: text("inngest_run_id"),
    status: text("status", { enum: ["queued", "running", "done", "error"] }).notNull().default("queued"),
    step: text("step").notNull().default("Queued"),
    done: integer("done").notNull().default(0),
    total: integer("total").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jobs_session_status_idx").on(t.sessionId, t.status), index("jobs_repo_idx").on(t.repoId)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generationId: uuid("generation_id").notNull().references(() => generations.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conversations_session_idx").on(t.sessionId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations").$type<{ path: string; startLine?: number; endLine?: number; url: string }[]>().notNull().default([]),
    tokens: integer("tokens").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId)],
);

export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  targetType: text("target_type", { enum: ["page", "message"] }).notNull(),
  targetId: uuid("target_id").notNull(),
  sessionId: text("session_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
