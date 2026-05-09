// Auto-create CRM accounts from unique recipient.fields.account values that
// appear in mailshake_leads but don't match any existing account.
// Run: tsx --conditions=react-server scripts/mailshake-import-accounts.mts [--dry]
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const dry = process.argv.includes("--dry");

async function main() {
  const { db, closeDb } = await import("../lib/db");
  try {
    const { accounts, mailshakeLeads } = await import("../lib/db/schema");
    const { sql, eq } = await import("drizzle-orm");
    const { rematchAllLeads } = await import("../lib/integrations/mailshake-sync");

    // distinct school_name values that aren't yet matched to an account.
    const rows = await db.execute<{ school_name: string; lead_count: number }>(sql`
      select school_name, count(*)::int as lead_count
      from public.mailshake_leads
      where account_id is null and school_name is not null and length(trim(school_name)) > 0
      group by school_name
      order by lead_count desc
    `);

    // existing account names (case-insensitive) to skip duplicates.
    const existing = await db
      .select({ name: accounts.name })
      .from(accounts)
      .where(sql`${accounts.deletedAt} is null`);
    const existingLower = new Set(existing.map((a) => a.name.trim().toLowerCase()));

    console.log(`distinct unmatched schools: ${rows.length}`);
    let created = 0;
    let skipped = 0;
    for (const r of rows) {
      const name = r.school_name.trim();
      if (existingLower.has(name.toLowerCase())) {
        skipped++;
        continue;
      }
      if (dry) {
        console.log(`  [DRY] would create: ${name} (${r.lead_count} leads)`);
        created++;
        continue;
      }
      await db.insert(accounts).values({
        name,
        type: "school",
        source: "mailshake",
      });
      existingLower.add(name.toLowerCase());
      created++;
    }
    console.log(`${dry ? "would create" : "created"}: ${created}`);
    console.log(`skipped (already exists): ${skipped}`);

    if (!dry && created > 0) {
      console.log("re-matching leads...");
      const r = await rematchAllLeads();
      console.log(JSON.stringify(r, null, 2));
    }
    void eq;
    void mailshakeLeads;
  } finally {
    await closeDb();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
