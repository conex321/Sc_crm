import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  const file = await readFile("scripts/create-matthew-user.sql", "utf8");
  await sql.unsafe(file);

  const rows =
    await sql`select id, role, full_name, google_email, dialpad_user_id, dialpad_phone, is_active from public.users where google_email = 'matthew@schoolconex.com'`;
  console.log("public.users row:", rows[0]);
} finally {
  await sql.end({ timeout: 5 });
}
