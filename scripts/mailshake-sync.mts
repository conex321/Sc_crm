// Manual Mailshake sync — runs the same syncAllCampaigns() the cron uses.
// Usage:
//   tsx scripts/mailshake-sync.mts            # active campaigns only
//   tsx scripts/mailshake-sync.mts --all      # include archived
//   tsx scripts/mailshake-sync.mts --rematch  # only re-match existing leads
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const args = new Set(process.argv.slice(2));

async function main() {
  const { closeDb } = await import("../lib/db");
  try {
    if (args.has("--rematch")) {
      const { rematchAllLeads } = await import("../lib/integrations/mailshake-sync");
      const r = await rematchAllLeads();
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    const { syncAllCampaigns } = await import("../lib/integrations/mailshake-sync");
    const result = await syncAllCampaigns({ includeArchived: args.has("--all") });
    console.log(`campaigns upserted: ${result.campaigns.upserted}`);
    console.log(`leads upserted:     ${result.leads.upserted}`);
    console.log(`  matched account:  ${result.leads.matchedAccount}`);
    console.log(`  matched contact:  ${result.leads.matchedContact}`);
    console.log(`per campaign:`);
    for (const c of result.perCampaign) {
      console.log(`  [${c.id}] ${c.title}: ${c.leadCount} leads`);
    }
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
