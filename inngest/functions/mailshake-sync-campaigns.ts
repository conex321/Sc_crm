import { inngest } from "../client";
import { syncAllCampaigns } from "@/lib/integrations/mailshake-sync";

/**
 * Phase 5 polling: every 30 minutes, pull all Mailshake campaigns + leads,
 * upsert into mailshake_campaigns / mailshake_leads, match each lead to
 * a CRM account via email-on-contact or `recipient.fields.account` ↔
 * accounts.name.
 *
 * Idempotent: campaigns deduped on mailshake_id, leads on mailshake_lead_id.
 */
export const mailshakeSyncCampaigns = inngest.createFunction(
  {
    id: "mailshake-sync-campaigns",
    concurrency: 1,
    retries: 2,
    triggers: [{ cron: "*/30 * * * *" }],
  },
  async ({ step, logger }) => {
    if (!process.env.MAILSHAKE_API_KEY) {
      logger.info("MAILSHAKE_API_KEY not set; skipping");
      return { skipped: "no-api-key" };
    }

    const result = await step.run("sync-all-campaigns", () => syncAllCampaigns());
    logger.info(
      `campaigns=${result.campaigns.upserted} leads=${result.leads.upserted} matchedAccount=${result.leads.matchedAccount} matchedContact=${result.leads.matchedContact}`,
    );
    return result;
  },
);
