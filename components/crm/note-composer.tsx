"use client";

import { useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StickyNote } from "lucide-react";
import { toast } from "sonner";
import { createNote } from "@/app/(dashboard)/activities/actions";

export function NoteComposer({
  accountId,
  opportunityId,
}: {
  accountId?: string;
  opportunityId?: string;
}) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (form: FormData) => {
    startTransition(async () => {
      try {
        await createNote(form);
        formRef.current?.reset();
        toast.success("Note added");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save");
      }
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <StickyNote className="size-3.5" />
          Add a note
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={handleSubmit} className="space-y-2">
          {accountId && <input type="hidden" name="accountId" value={accountId} />}
          {opportunityId && (
            <input type="hidden" name="opportunityId" value={opportunityId} />
          )}
          <Textarea
            name="body"
            required
            rows={3}
            placeholder="Write a note about this account…"
            className="resize-none"
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Add note"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
