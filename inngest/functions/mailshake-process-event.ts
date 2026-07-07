import { inngest } from "../client";
import { processMailshakeRawEvent } from "@/lib/integrations/mailshake-events";

// Thin wrapper for local dev (INNGEST_DEV). Production processes inline in the
// webhook route + daily cron sweeper — see lib/integrations/mailshake-events.ts.
export const mailshakeProcessEvent = inngest.createFunction(
  {
    id: "mailshake-process-event",
    concurrency: 10,
    retries: 3,
    triggers: [{ event: "mailshake/event.received" }],
  },
  async ({ event, step }) => {
    const rawEventId = event.data.rawEventId as string;
    return step.run("process", () => processMailshakeRawEvent(rawEventId));
  },
);
