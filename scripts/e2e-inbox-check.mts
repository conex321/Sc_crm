// Verify the inbox page actually renders Rayan's Dialpad call data.
import { config } from "dotenv";
import { Buffer } from "node:buffer";
config({ path: ".env.local" });

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const projectRef = new URL(SUPABASE_URL).host.split(".")[0];
const COOKIE_NAME = `sb-${projectRef}-auth-token`;

const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "demo@schoolconex.com", password: "Test1234!" }),
});
const session = await res.json();
const cookie = `${COOKIE_NAME}=base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;

const inbox = await fetch(`${SITE}/inbox`, { headers: { Cookie: cookie } });
const html = await inbox.text();

// Strip HTML for searchability
const visibleText = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const checks = [
  { label: "Inbox heading present", ok: /unmatched/i.test(visibleText) || /inbox/i.test(visibleText) },
  { label: "Inbound calls listed", ok: /Inbound call/i.test(visibleText) },
  { label: "Outbound calls listed", ok: /Outbound call/i.test(visibleText) },
  { label: "Multiple call rows listed", ok: (visibleText.match(/\b(?:Inbound|Outbound) call\b/g) ?? []).length >= 3 },
  { label: "Duration formatted (m:ss)", ok: /\b\d+:\d{2}\b/.test(visibleText) },
  { label: "An 'internal' tag (Rayan to coworker)", ok: /internal/i.test(visibleText) },
];

let snippets: string[] = [];
const sample = visibleText.match(/Inbound call[^|]{0,80}|Outbound call[^|]{0,80}/g);
if (sample) snippets = sample.slice(0, 5);

console.log(`HTTP ${inbox.status} · /inbox · ${html.length.toLocaleString()} bytes`);
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.label}`);
if (snippets.length > 0) {
  console.log("\nFirst few call summaries on the page:");
  for (const s of snippets) console.log("  · " + s.trim());
}

if (!checks.every((c) => c.ok)) {
  console.error("\nSome checks failed. First 1500 chars of stripped text:\n");
  console.error(visibleText.slice(0, 1500));
  process.exit(1);
}
