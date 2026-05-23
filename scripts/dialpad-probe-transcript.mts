// Probe Dialpad transcript availability for Rayan's recent calls.
// Tries: (a) transcription_text in call payload, (b) /transcripts/<call_id> endpoint.
import { config } from "dotenv";
config({ path: ".env.local" });

const token = process.env.DIALPAD_API_KEY!;
const userId = process.env.DIALPAD_FILTER_USER_ID!;

async function get(path: string) {
  const res = await fetch(`https://dialpad.com/api/v2${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  return { status: res.status, body };
}

async function main() {
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  console.log("[1] Recent calls for Rayan (look at transcription_text fields)");
  const listRes = await get(`/call?user_id=${userId}&started_after=${since}&limit=5`);
  console.log(`HTTP ${listRes.status}`);
  const items = (listRes.body as any).items ?? (listRes.body as any).records ?? [];
  for (const c of items.slice(0, 5)) {
    console.log(
      `  call_id=${c.call_id} dir=${c.direction} dur=${c.duration} ` +
      `external=${c.external_number ?? c.contact?.phone ?? '?'} ` +
      `target_email=${c.target?.email ?? '?'} ` +
      `transcription_text_len=${(c.transcription_text ?? '').length} ` +
      `state=${c.state}`,
    );
  }
  const firstId = items[0]?.call_id;
  if (!firstId) return;

  console.log("\n[2] /call/<id> (fetch full call detail)");
  const detail = await get(`/call/${firstId}`);
  console.log(`HTTP ${detail.status}`);
  const d = detail.body;
  console.log(`  has-transcription_text: ${'transcription_text' in d}`);
  console.log(`  transcription_text len: ${(d.transcription_text ?? '').length}`);
  console.log(`  recording_details: ${(d.recording_details ?? []).length}`);
  // Surface unique keys
  console.log(`  keys: ${Object.keys(d).join(',')}`);

  console.log("\n[3] Try Dialpad transcripts endpoint candidates");
  const candidates = [
    `/transcripts/${firstId}`,
    `/call/${firstId}/transcript`,
    `/call/${firstId}/transcription`,
    `/transcripts?call_id=${firstId}`,
  ];
  for (const p of candidates) {
    const r = await get(p);
    const preview = typeof r.body === 'string' ? r.body.slice(0, 80) : JSON.stringify(r.body).slice(0, 200);
    console.log(`  ${p} → ${r.status}  ${preview}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
