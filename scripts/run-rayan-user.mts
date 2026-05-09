import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const file = await readFile("scripts/create-rayan-user.sql", "utf8");
  await sql.unsafe(file);
  const rows = await sql`
    select u.role, u.full_name, u.google_email, u.is_active, u.id,
           au.email_confirmed_at is not null as email_confirmed
    from public.users u
    join auth.users au on au.id = u.id
    where u.google_email = 'rayan@schoolconex.com'
  `;
  console.log("public.users row:", rows[0]);
} finally {
  await sql.end({ timeout: 5 });
}
