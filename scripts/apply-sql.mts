import { config } from "dotenv";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Populate .env.local first.");
  process.exit(1);
}

const directory = process.argv[2];
if (!directory) {
  console.error("Usage: tsx scripts/apply-sql.mts <directory>");
  console.error("  e.g. tsx scripts/apply-sql.mts supabase/migrations");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

try {
  const entries = (await readdir(directory))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (entries.length === 0) {
    console.log(`No .sql files in ${directory}.`);
    process.exit(0);
  }

  for (const file of entries) {
    const path = join(directory, file);
    const content = await readFile(path, "utf8");
    process.stdout.write(`→ Applying ${path} ... `);
    await sql.unsafe(content);
    process.stdout.write("ok\n");
  }
  console.log(`Applied ${entries.length} file(s) successfully.`);
} catch (err) {
  console.error("\nFailed:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
