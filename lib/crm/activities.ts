import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type ActivityChannel =
  | "call"
  | "whatsapp"
  | "email_outbound"
  | "email_inbound"
  | "mailshake_event"
  | "note"
  | "task"
  | "contract_event"
  | "payment";

export type TimelineActivity = {
  id: string;
  account_id: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  user_id: string | null;
  channel: ActivityChannel;
  direction: "inbound" | "outbound" | "system";
  occurred_at: string;
  summary: string;
  created_at: string;
  user: { id: string; full_name: string } | null;
  note: { body: string } | null;
  task: {
    title: string;
    due_at: string | null;
    completed_at: string | null;
    assigned_user_id: string | null;
  } | null;
  call: {
    dialpad_call_id: string | null;
    from_number: string | null;
    to_number: string | null;
    duration_seconds: number | null;
    recording_url: string | null;
    transcript_text: string | null;
    disposition: string | null;
  } | null;
};

const SELECT =
  "id, account_id, contact_id, opportunity_id, user_id, channel, direction, occurred_at, summary, created_at, user:user_id(id, full_name), note:notes(body), task:tasks(title, due_at, completed_at, assigned_user_id), call:calls(dialpad_call_id, from_number, to_number, duration_seconds, recording_url, transcript_text, disposition)";

export async function listActivitiesForAccount(
  accountId: string,
  limit = 50,
): Promise<TimelineActivity[]> {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("activities")
    .select(SELECT)
    .eq("account_id", accountId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TimelineActivity[];
}

export async function listActivitiesForOpportunity(
  opportunityId: string,
  limit = 50,
): Promise<TimelineActivity[]> {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("activities")
    .select(SELECT)
    .eq("opportunity_id", opportunityId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TimelineActivity[];
}

export async function listUnmatchedActivities(limit = 100): Promise<TimelineActivity[]> {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("activities")
    .select(SELECT)
    .is("account_id", null)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TimelineActivity[];
}
