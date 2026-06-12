import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, format } from "date-fns";
import {
  StickyNote,
  ListTodo,
  Phone,
  MessageCircle,
  Mail,
  FileText,
  CreditCard,
  Activity as ActivityIcon,
} from "lucide-react";
import type { TimelineActivity } from "@/lib/crm/activities";
import { AttachToAccountDialog } from "@/components/crm/attach-to-account-dialog";

const channelMeta: Record<
  TimelineActivity["channel"],
  { label: string; icon: typeof StickyNote }
> = {
  note: { label: "Note", icon: StickyNote },
  task: { label: "Task", icon: ListTodo },
  call: { label: "Call", icon: Phone },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  email_outbound: { label: "Email sent", icon: Mail },
  email_inbound: { label: "Email received", icon: Mail },
  mailshake_event: { label: "Mailshake", icon: Mail },
  contract_event: { label: "Contract", icon: FileText },
  payment: { label: "Payment", icon: CreditCard },
};

export function ActivityTimeline({
  activities,
  allowAttach = false,
}: {
  activities: TimelineActivity[];
  allowAttach?: boolean;
}) {
  if (activities.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
        No activity yet. Add a note or task above.
      </div>
    );
  }

  return (
    <ol className="space-y-2">
      {activities.map((a) => {
        const meta = channelMeta[a.channel] ?? { label: a.channel, icon: ActivityIcon };
        const Icon = meta.icon;
        const note = Array.isArray(a.note) ? a.note[0] : a.note;
        const task = Array.isArray(a.task) ? a.task[0] : a.task;
        const call = Array.isArray(a.call) ? a.call[0] : a.call;
        return (
          <li
            key={a.id}
            className="flex gap-3 rounded-md border bg-card p-3 text-sm shadow-sm"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded bg-muted">
              <Icon className="size-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {meta.label}
                  </Badge>
                  {a.user?.full_name && (
                    <span className="text-muted-foreground">
                      by {a.user.full_name}
                    </span>
                  )}
                </div>
                <time
                  className="text-muted-foreground"
                  title={format(new Date(a.occurred_at), "PPpp")}
                >
                  {formatDistanceToNow(new Date(a.occurred_at), { addSuffix: true })}
                </time>
              </div>
              <div className="mt-1 text-sm">{a.summary}</div>
              {call && a.channel === "call" && (
                <div className="mt-2 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                    {call.from_number && (
                      <span>
                        <span className="font-medium text-foreground">From:</span>{" "}
                        <span className="tabular-nums">{call.from_number}</span>
                      </span>
                    )}
                    {call.to_number && (
                      <span>
                        <span className="font-medium text-foreground">To:</span>{" "}
                        <span className="tabular-nums">{call.to_number}</span>
                      </span>
                    )}
                    {call.recording_url && (
                      <a
                        href={call.recording_url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-foreground"
                      >
                        Recording
                      </a>
                    )}
                  </div>
                  {call.transcript_text && (
                    <details className="rounded border bg-muted/40 px-2 py-1.5">
                      <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
                        Transcript ({call.transcript_text.length.toLocaleString()} chars)
                      </summary>
                      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-[11px] leading-snug text-foreground/90">
                        {call.transcript_text}
                      </pre>
                    </details>
                  )}
                </div>
              )}
              {note?.body && (
                <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                  {note.body}
                </p>
              )}
              {task && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {task.completed_at ? (
                    <Badge variant="default" className="text-[10px]">
                      Completed {format(new Date(task.completed_at), "MMM d")}
                    </Badge>
                  ) : task.due_at ? (
                    <span>
                      Due{" "}
                      <span className="font-medium">
                        {format(new Date(task.due_at), "MMM d, yyyy")}
                      </span>
                    </span>
                  ) : (
                    <span>No due date</span>
                  )}
                </div>
              )}
              {allowAttach && !a.account_id && (
                <div className="mt-2">
                  <AttachToAccountDialog activityId={a.id} />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
