import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "schoolconex-crm",
  // Inngest auto-detects keys from env: INNGEST_EVENT_KEY (send),
  // INNGEST_SIGNING_KEY (serve). For dev, the Inngest CLI / dev server
  // works with no keys set.
});
