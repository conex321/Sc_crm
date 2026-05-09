// Remove the rayan@schoolconex.com sign-in account that was created earlier.
// Demo is the only sign-in user. Rayan's Dialpad call data is unaffected
// (calls are linked via dialpad_call_id, not via auth.users).
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const before = await sql`select id from auth.users where email = 'rayan@schoolconex.com'`;
  if (before.length === 0) {
    console.log("rayan@schoolconex.com auth user not present — nothing to remove");
    process.exit(0);
  }
  // public.users has FK to auth.users with cascade — just delete from auth.users.
  await sql`delete from auth.identities where user_id = ${before[0].id}`;
  await sql`delete from public.users where id = ${before[0].id}`;
  await sql`delete from auth.users where id = ${before[0].id}`;
  console.log(`removed rayan@schoolconex.com (id ${before[0].id})`);
} finally {
  await sql.end({ timeout: 5 });
}
