import { listUnmatchedActivities } from "@/lib/crm/activities";
import { ActivityTimeline } from "@/components/crm/activity-timeline";

export default async function UnmatchedInboxPage() {
  const activities = await listUnmatchedActivities();
  return (
    <div className="px-6 py-5">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">Unmatched inbox</h1>
        <p className="text-xs text-muted-foreground">
          Calls, messages, and email events whose phone number or email didn&apos;t
          match a known contact. Click an item to associate it with a contact.
        </p>
      </div>
      <ActivityTimeline activities={activities} allowAttach />
    </div>
  );
}
