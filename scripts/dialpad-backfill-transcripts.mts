// Pull transcripts for every existing Dialpad call in the DB and store them
// on calls.transcript_text. Idempotent — skips rows that already have text.
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const token = process.env.DIALPAD_API_KEY!;
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

type TranscriptLine = { name?: string; content?: string };

async function getTranscript(callId: string): Promise<string | null> {
  const res = await fetch(`https://dialpad.com/api/v2/transcripts/${callId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error(`  transcripts/${callId}: HTTP ${res.status}`);
    return null;
  }
  const body = (await res.json()) as { lines?: TranscriptLine[] };
  if (!Array.isArray(body.lines) || body.lines.length === 0) return null;
  const text = body.lines
    .filter((l) => l?.content)
    .map((l) => (l.name?.trim() ? `${l.name.trim()}: ${l.content}` : l.content))
    .join("\n");
  return text || null;
}

try {
  const rows = await sql<{ dialpad_call_id: string; activity_id: string }[]>`
    select dialpad_call_id, activity_id
    from public.calls
    where dialpad_call_id is not null
      and (transcript_text is null or length(transcript_text) = 0)
    order by activity_id`;
  console.log(`calls missing transcript: ${rows.length}`);

  let fetched = 0;
  let stored = 0;
  let none = 0;
  for (const r of rows) {
    fetched++;
    const text = await getTranscript(r.dialpad_call_id);
    if (text) {
      await sql`update public.calls set transcript_text = ${text} where dialpad_call_id = ${r.dialpad_call_id}`;
      stored++;
      console.log(`  [${stored}] ${r.dialpad_call_id} — ${text.length} chars`);
    } else {
      none++;
    }
  }
  console.log(`\nfetched: ${fetched}  stored: ${stored}  no-transcript: ${none}`);
} finally {
  await sql.end({ timeout: 5 });
}
