"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { sendStripeInvoice } from "@/app/(dashboard)/opportunities/[id]/invoice/actions";

export function SendInvoiceButton({ opportunityId }: { opportunityId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await sendStripeInvoice(opportunityId);
            toast.success("Invoice sent via Stripe");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed");
          }
        })
      }
    >
      <Send className="size-3.5" />
      {pending ? "Sending…" : "Send Stripe invoice"}
    </Button>
  );
}
