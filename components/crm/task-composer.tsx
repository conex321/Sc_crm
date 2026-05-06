"use client";

import { useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListTodo } from "lucide-react";
import { toast } from "sonner";
import { createTask } from "@/app/(dashboard)/activities/actions";

export function TaskComposer({
  accountId,
  opportunityId,
  currentUserId,
}: {
  accountId?: string;
  opportunityId?: string;
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (form: FormData) => {
    startTransition(async () => {
      try {
        await createTask(form);
        formRef.current?.reset();
        toast.success("Task added");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save");
      }
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <ListTodo className="size-3.5" />
          Add a task
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={handleSubmit} className="space-y-2">
          {accountId && <input type="hidden" name="accountId" value={accountId} />}
          {opportunityId && (
            <input type="hidden" name="opportunityId" value={opportunityId} />
          )}
          <input type="hidden" name="assignedUserId" value={currentUserId} />
          <Input name="title" required placeholder="Follow up with principal…" />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input name="dueAt" type="datetime-local" />
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Add task"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
