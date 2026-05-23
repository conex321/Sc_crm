import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

// Lazy init: Next 16's "collect page data" build phase imports this module
// without env vars set. Defer connection until first query. Caches singleton.
let _client: Sql | null = null;
let _db: PostgresJsDatabase<typeof schema> | null = null;

function getDb(): PostgresJsDatabase<typeof schema> {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  _client = postgres(url, { prepare: false, max: 10 });
  _db = drizzle(_client, { schema });
  return _db;
}

// Proxy preserves `db.select(...)` call sites while deferring env check.
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export async function closeDb() {
  if (_client) await _client.end();
}
export { schema };
