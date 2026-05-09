import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// Server-only Drizzle client. Bypasses Supabase RLS — use with care.
// For RLS-aware queries from Server Actions, prefer the Supabase server client.
const queryClient = postgres(process.env.DATABASE_URL, {
  prepare: false, // required for Supabase pooler compatibility
  max: 10,
});

export const db = drizzle(queryClient, { schema });
export async function closeDb() {
  await queryClient.end();
}
export { schema };
