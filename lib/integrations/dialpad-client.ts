import "server-only";

const BASE_URL = "https://dialpad.com/api/v2";

function authHeader() {
  const key = process.env.DIALPAD_API_KEY;
  if (!key) throw new Error("DIALPAD_API_KEY not set");
  return { Authorization: `Bearer ${key}` };
}

async function dpFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { ...authHeader(), Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Dialpad ${path} → ${res.status}: ${body.slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

export type DialpadUser = {
  id: number | string;
  first_name?: string;
  last_name?: string;
  emails?: string[];
  phone_numbers?: string[];
  state?: string;
};

export type DialpadCall = {
  call_id: string;
  direction: "inbound" | "outbound";
  date_started?: string | number;
  date_connected?: string | number;
  date_ended?: string | number;
  /** Milliseconds. Convert to seconds before storing in calls.duration_seconds. */
  duration?: number;
  state?: string;
  external_number?: string;
  internal_number?: string;
  target_kind?: string;
  user_id?: number | string;
  target?: { id?: string | number; type?: string; email?: string; name?: string; phone?: string };
  contact?: { id?: string; phone?: string; name?: string; email?: string; type?: string };
  recording_details?: Array<{ url?: string; recording_type?: string; duration?: string | number }>;
  recording_url?: string[];
  voicemail_url?: string;
  transcription_text?: string;
  call_disposition?: string;
};

export function getRecordingUrl(c: DialpadCall): string | null {
  if (Array.isArray(c.recording_details) && c.recording_details.length > 0) {
    const first = c.recording_details.find((r) => r?.url);
    if (first?.url) return first.url;
  }
  if (Array.isArray(c.recording_url) && c.recording_url.length > 0) {
    return c.recording_url[0] ?? null;
  }
  return c.voicemail_url ?? null;
}

/** Dialpad reports duration as milliseconds (with sub-ms float). Round to seconds. */
export function durationSeconds(c: DialpadCall): number | null {
  if (c.duration == null) return null;
  return Math.round(c.duration / 1000);
}

export async function getUser(userId: string | number): Promise<DialpadUser> {
  return dpFetch<DialpadUser>(`/users/${userId}`);
}

/**
 * List calls in the time window for a single user. Requires a company-admin
 * Dialpad API key. The personal/user-tier token used to look up user IDs
 * does NOT have access to this endpoint.
 *
 * `started_after` is an epoch-ms timestamp.
 */
export async function listCalls(opts: {
  userId?: string | number;
  startedAfter: number;
  startedBefore?: number;
  limit?: number;
  cursor?: string;
}): Promise<{ items: DialpadCall[]; cursor?: string }> {
  return dpFetch<{ items: DialpadCall[]; cursor?: string }>(buildCallsListPath(opts));
}

export function buildCallsListPath(opts: {
  userId?: string | number;
  startedAfter: number;
  startedBefore?: number;
  limit?: number;
  cursor?: string;
}) {
  const params = new URLSearchParams({
    started_after: String(opts.startedAfter),
    // Dialpad caps page size at 50 for /api/v2/call
    limit: String(Math.min(opts.limit ?? 50, 50)),
  });
  if (opts.userId) params.set("user_id", String(opts.userId));
  if (opts.startedBefore) params.set("started_before", String(opts.startedBefore));
  if (opts.cursor) params.set("cursor", opts.cursor);
  return `/call?${params.toString()}`;
}

export type DialpadTranscriptLine = {
  name?: string;
  content?: string;
  time?: string;
  type?: "transcript" | "system" | string;
  contact_id?: string;
};

export type DialpadTranscript = {
  call_id: string;
  lines: DialpadTranscriptLine[];
};

/**
 * Fetch the per-call transcript from Dialpad. Available only when the
 * workspace has transcription enabled and the call was actually transcribed
 * (some calls — voicemail-only, very short, certain regions — won't have one).
 *
 * Returns `null` when the call has no transcript (404). Throws on other
 * errors so the caller can decide whether to retry.
 */
export async function getTranscript(
  callId: string,
): Promise<DialpadTranscript | null> {
  const res = await fetch(`${BASE_URL}/transcripts/${callId}`, {
    headers: { ...authHeader(), Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Dialpad transcripts/${callId} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as DialpadTranscript;
}

/** Convert a transcript payload into a single plain-text block for storage. */
export function flattenTranscript(t: DialpadTranscript | null): string | null {
  if (!t || !Array.isArray(t.lines) || t.lines.length === 0) return null;
  const lines: string[] = [];
  for (const l of t.lines) {
    if (!l?.content) continue;
    const speaker = (l.name ?? "").trim();
    lines.push(speaker ? `${speaker}: ${l.content}` : l.content);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

export async function* iterateCalls(opts: {
  userId?: string | number;
  startedAfter: number;
  startedBefore?: number;
  pageSize?: number;
}): AsyncGenerator<DialpadCall> {
  let cursor: string | undefined;
  do {
    const page = await listCalls({
      userId: opts.userId,
      startedAfter: opts.startedAfter,
      startedBefore: opts.startedBefore,
      limit: opts.pageSize ?? 100,
      cursor,
    });
    for (const item of page.items) yield item;
    cursor = page.cursor;
  } while (cursor);
}
