import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;
const g = globalThis as unknown as { __shadowDb?: Db };

/** Pooled (transaction-mode) Supabase connection; prepared statements must be off. */
export function db(): Db {
  if (!g.__shadowDb) {
    const client = postgres(env().DATABASE_URL, { prepare: false, max: 5, idle_timeout: 20 });
    g.__shadowDb = drizzle(client, { schema });
  }
  return g.__shadowDb;
}

export { schema };
