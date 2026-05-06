import { listUnmatchedActivities } from "@/lib/crm/activities";
import { ActivityTimeline } from "@/components/crm/activity-timeline";

export default async function UnmatchedInboxPage() {
  const activities = await listUnmatchedActivities();
  return (
    <div className="px-6 py-5">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">Unmatched inbox</h1>
        <p className="text-xs text-muted-foreground">
          Inbound calls and messages whose phone number or email didn&apos;t match a known
          contact. Will populate once Dialpad / WhatsApp / Mailshake integrations land
          (Phase 3+).
        </p>
      </div>
      <ActivityTimeline activities={activities} />
    </div>
  );
}
