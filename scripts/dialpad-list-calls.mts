// One-off: list recent calls for the configured DIALPAD_FILTER_USER_ID.
// Run: tsx scripts/dialpad-list-calls.mts [limit]
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const token = process.env.DIALPAD_API_KEY;
const userId = process.env.DIALPAD_FILTER_USER_ID;
const limit = Number(process.argv[2] ?? 5);

if (!token || !userId) {
  console.error("Need DIALPAD_API_KEY and DIALPAD_FILTER_USER_ID in .env.local");
  process.exit(1);
}

async function main() {
  // Calls list endpoint per Dialpad v2 API.
  // The /call list endpoint requires started_after (epoch ms) and a target.
  const now = Date.now();
  const since = now - 30 * 24 * 60 * 60 * 1000; // last 30 days
  const candidates = [
    `https://dialpad.com/api/v2/call?started_after=${since}&user_id=${userId}&limit=${limit}`,
    `https://dialpad.com/api/v2/call?started_after=${since}&limit=${limit}`,
    `https://dialpad.com/api/v2/call?user_id=${userId}&limit=${limit}`,
    // tiny test: hit a non-list endpoint to confirm the token works at all
    `https://dialpad.com/api/v2/users/${userId}`,
  ];
  let res: Response | null = null;
  let url = "";
  for (const candidate of candidates) {
    url = candidate;
    res = await fetch(candidate, { headers: { Authorization: `Bearer ${token}` } });
    console.error(`tried ${candidate} → ${res.status}`);
    if (res.ok) break;
  }
  if (!res || !res.ok) {
    console.error("all candidate URLs failed");
    process.exit(1);
  }
  console.error(`using ${url}`);
  const text = await res.text();
  const body = JSON.parse(text) as {
    items?: Array<Record<string, unknown>>;
    cursor?: string;
  };
  const items = body.items ?? [];
  console.log(`pulled ${items.length} call(s) (cursor=${body.cursor ?? "none"}):\n`);
  for (const c of items) {
    const summary = {
      call_id: c.call_id,
      direction: c.direction,
      date_started: c.date_started,
      duration: c.duration,
      state: c.state,
      from: (c as { external_number?: string }).external_number ?? c.from,
      to: c.to,
      target_kind: c.target_kind,
      target_email: (c as { target?: { email?: string } }).target?.email,
      target_phone: (c as { target?: { phone?: string } }).target?.phone,
      contact_email: (c as { contact?: { email?: string } }).contact?.email,
      contact_phone: (c as { contact?: { phone?: string } }).contact?.phone,
      transcription: (c as { transcription_text?: string }).transcription_text ? "yes" : "no",
      recording: (c as { recording_url?: string[] }).recording_url ? "yes" : "no",
    };
    console.log(JSON.stringify(summary));
  }
  if (items.length === 0) {
    console.log("(empty — Rayan has no calls in the lookback window, or the calls scope is misaligned)");
  } else {
    console.log("\nfull first record (truncated):");
    console.log(JSON.stringify(items[0], null, 2).slice(0, 2500));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(3);
});
