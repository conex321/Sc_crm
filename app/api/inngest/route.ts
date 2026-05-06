import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import * as functions from "@/inngest/functions";

const fns = Object.values(functions);

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: fns,
});
