import { inngest } from "../client";
import { reconcileFileStatus } from "@/lib/integrations/google/drive";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { and, ne, sql } from "drizzle-orm";

/**
 * Phase 2 Drive status reconciliation.
 * Runs every 30 minutes; checks every non-archived `documents` row and emits
 * `contract_event` activities when state changes (sent / signed heuristics).
 *
 *  Heuristic v1:
 *  - If file is shared with at least one external email → status = sent
 *  - If file's name contains "SIGNED" (case-insensitive) → status = signed
 *
 *  Replace heuristics with DocuSign / PandaDoc later for real signed-status.
 */
export const driveStatusReconcile = inngest.createFunction(
  {
    id: "drive-status-reconcile",
    concurrency: 5,
    triggers: [{ cron: "*/30 * * * *" }],
  },
  async ({ step, logger }) => {
    const rows = await step.run("load-active-documents", async () =>
      db
        .select({
          id: documents.id,
          driveFileId: documents.driveFileId,
          name: documents.name,
          status: documents.status,
        })
        .from(documents)
        .where(and(ne(documents.status, "archived"), sql`${documents.status} <> 'signed'`))
        .limit(200),
    );

    let updates = 0;
    for (const doc of rows) {
      try {
        const reconciled = await reconcileFileStatus(doc.driveFileId);
        let nextStatus: typeof doc.status = doc.status;
        if (/signed/i.test(reconciled.name)) nextStatus = "signed";
        else if (reconciled.sharedExternally && doc.status === "draft") nextStatus = "sent";

        if (nextStatus !== doc.status) {
          await step.run(`update-${doc.id}`, async () => {
            await db.update(documents).set({ status: nextStatus }).where(sql`${documents.id} = ${doc.id}`);
            updates += 1;
          });
        }
      } catch (err) {
        logger.warn(`Skipping ${doc.id}: ${err instanceof Error ? err.message : err}`);
      }
    }

    return { processed: rows.length, updates };
  },
);
