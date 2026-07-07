import "server-only";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// Builds the per-rep morning digest. Pure data — the cron route renders + sends.
// Every metric is scoped to the rep (their leads/accounts/calls) so the email
// mirrors what they see on their dashboard.

export type RepDigest = {
  userId: string;
  email: string;
  fullName: string;
  role: string;
  newReplies: number;
  staleFollowups: number;
  followupSample: { school: string; accountId: string; lastTouch: string | null }[];
  dueTasks: number;
  overdueTasks: number;
  taskSample: { title: string; dueAt: string | null }[];
  unmatchedCalls: number;
};

const DAY_MS = 86_400_000;

export async function buildRepDigests(): Promise<RepDigest[]> {
  const reps = await db
    .select({
      id: users.id,
      email: users.googleEmail,
      fullName: users.fullName,
      role: users.role,
    })
    .from(users)
    .where(sql`${users.isActive} = true`);

  const since = new Date(Date.now() - DAY_MS).toISOString();
  const staleCut = new Date(Date.now() - 7 * DAY_MS).toISOString();

  const digests: RepDigest[] = [];
  for (const r of reps) {
    // New replies landed on this rep's accounts since yesterday.
    const replies = await db.execute<{ n: number }>(sql`
      select count(*)::int n
        from public.activities a
        join public.accounts acc on acc.id = a.account_id
       where a.channel = 'mailshake_event'
         and a.direction = 'inbound'
         and a.occurred_at >= ${since}
         and acc.owner_user_id = ${r.id}
    `);

    // Stale follow-ups: open leads on this rep's accounts with no touch in 7d.
    const stale = await db.execute<{
      school_name: string | null;
      account_id: string;
      last_touch: string | null;
    }>(sql`
      select l.school_name, l.account_id::text as account_id,
             to_char(t.last_touch_at, 'YYYY-MM-DD') as last_touch
        from public.mailshake_leads l
        join public.accounts a on a.id = l.account_id and a.deleted_at is null
        left join lateral (
          select max(act.occurred_at) last_touch_at from public.activities act
           where act.account_id = l.account_id
             and act.channel in ('call','email_outbound','email_inbound','whatsapp')
        ) t on true
       where l.status = 'open'
         and (l.assigned_user_id = ${r.id} or a.owner_user_id = ${r.id})
         and (t.last_touch_at is null or t.last_touch_at < ${staleCut})
       order by t.last_touch_at asc nulls first
       limit 5
    `);
    const staleCount = await db.execute<{ n: number }>(sql`
      select count(*)::int n
        from public.mailshake_leads l
        join public.accounts a on a.id = l.account_id and a.deleted_at is null
        left join lateral (
          select max(act.occurred_at) last_touch_at from public.activities act
           where act.account_id = l.account_id
             and act.channel in ('call','email_outbound','email_inbound','whatsapp')
        ) t on true
       where l.status = 'open'
         and (l.assigned_user_id = ${r.id} or a.owner_user_id = ${r.id})
         and (t.last_touch_at is null or t.last_touch_at < ${staleCut})
    `);

    const tasks = await db.execute<{
      title: string;
      due_at: string | null;
      overdue: boolean;
    }>(sql`
      select t.title, to_char(t.due_at, 'YYYY-MM-DD') due_at,
             (t.due_at is not null and t.due_at < now()) overdue
        from public.tasks t
       where t.assigned_user_id = ${r.id} and t.completed_at is null
       order by t.due_at asc nulls last
       limit 5
    `);
    const taskCounts = await db.execute<{ due: number; overdue: number }>(sql`
      select count(*)::int due,
             count(*) filter (where due_at is not null and due_at < now())::int overdue
        from public.tasks
       where assigned_user_id = ${r.id} and completed_at is null
    `);

    // Unmatched calls attributed to this rep in the last day.
    const unmatched = await db.execute<{ n: number }>(sql`
      select count(*)::int n from public.activities
       where channel = 'call' and account_id is null
         and user_id = ${r.id} and occurred_at >= ${since}
    `);

    digests.push({
      userId: r.id,
      email: r.email,
      fullName: r.fullName,
      role: r.role,
      newReplies: replies[0]?.n ?? 0,
      staleFollowups: staleCount[0]?.n ?? 0,
      followupSample: stale.map((s) => ({
        school: s.school_name ?? "(unnamed)",
        accountId: s.account_id,
        lastTouch: s.last_touch,
      })),
      dueTasks: taskCounts[0]?.due ?? 0,
      overdueTasks: taskCounts[0]?.overdue ?? 0,
      taskSample: tasks.map((t) => ({ title: t.title, dueAt: t.due_at })),
      unmatchedCalls: unmatched[0]?.n ?? 0,
    });
  }
  return digests;
}

export function digestHasContent(d: RepDigest): boolean {
  return (
    d.newReplies > 0 ||
    d.staleFollowups > 0 ||
    d.dueTasks > 0 ||
    d.unmatchedCalls > 0
  );
}

export function renderDigestText(d: RepDigest, base: string): string {
  const lines: string[] = [`Good morning ${d.fullName.split(" ")[0]},`, ""];
  if (d.newReplies > 0)
    lines.push(`• ${d.newReplies} new reply(ies) on your accounts since yesterday`);
  if (d.staleFollowups > 0) {
    lines.push(`• ${d.staleFollowups} open lead(s) need follow-up (no touch in 7+ days):`);
    for (const f of d.followupSample)
      lines.push(`    – ${f.school} (last touch: ${f.lastTouch ?? "never"})`);
  }
  if (d.dueTasks > 0)
    lines.push(
      `• ${d.dueTasks} open task(s)${d.overdueTasks > 0 ? `, ${d.overdueTasks} overdue` : ""}:` ,
    );
  for (const t of d.taskSample) lines.push(`    – ${t.title}${t.dueAt ? ` (due ${t.dueAt})` : ""}`);
  if (d.unmatchedCalls > 0)
    lines.push(`• ${d.unmatchedCalls} call(s) yesterday didn't match a contact — review the inbox`);
  lines.push("", `Open your dashboard: ${base}/dashboard`);
  return lines.join("\n");
}

export function renderDigestHtml(d: RepDigest, base: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows: string[] = [];
  if (d.newReplies > 0)
    rows.push(`<li><strong>${d.newReplies}</strong> new reply(ies) on your accounts since yesterday</li>`);
  if (d.staleFollowups > 0) {
    const sample = d.followupSample
      .map(
        (f) =>
          `<li><a href="${base}/accounts/${f.accountId}">${esc(f.school)}</a> — last touch: ${f.lastTouch ?? "never"}</li>`,
      )
      .join("");
    rows.push(
      `<li><strong>${d.staleFollowups}</strong> open lead(s) need follow-up (no touch in 7+ days):<ul>${sample}</ul></li>`,
    );
  }
  if (d.dueTasks > 0) {
    const sample = d.taskSample
      .map((t) => `<li>${esc(t.title)}${t.dueAt ? ` <em>(due ${t.dueAt})</em>` : ""}</li>`)
      .join("");
    rows.push(
      `<li><strong>${d.dueTasks}</strong> open task(s)${d.overdueTasks > 0 ? `, <strong style="color:#dc2626">${d.overdueTasks} overdue</strong>` : ""}:<ul>${sample}</ul></li>`,
    );
  }
  if (d.unmatchedCalls > 0)
    rows.push(
      `<li><strong>${d.unmatchedCalls}</strong> call(s) yesterday didn't match a contact — <a href="${base}/inbox">review the inbox</a></li>`,
    );
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;color:#0f172a;max-width:560px">
    <p>Good morning ${esc(d.fullName.split(" ")[0])},</p>
    <ul style="line-height:1.6">${rows.join("")}</ul>
    <p><a href="${base}/dashboard" style="display:inline-block;background:#0f172a;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Open your dashboard</a></p>
    <p style="color:#64748b;font-size:12px">SchoolConex CRM · daily digest</p>
  </div>`;
}
