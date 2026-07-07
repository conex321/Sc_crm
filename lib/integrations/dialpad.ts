import "server-only";
import crypto from "node:crypto";

/**
 * Verify a Dialpad webhook signature.
 * Dialpad signs the raw body using HMAC-SHA256 with a workspace-level secret
 * and includes it in the `X-Dialpad-Signature` header.
 */
export function verifyDialpadSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.DIALPAD_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signatureHeader) return false;
  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  // Constant-time compare to prevent timing side-channels
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(signatureHeader.replace(/^sha256=/, ""), "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Shape we care about from Dialpad webhook events. Real payloads have many
 * more fields; we extract only what we use.
 */
export type DialpadCallEvent = {
  call_id: string;
  event_type: string;
  direction: "inbound" | "outbound";
  contact?: { phone?: string; email?: string; name?: string };
  external_number?: string;
  internal_number?: string;
  duration?: number;
  recording_url?: string;
  voicemail_url?: string;
  call_disposition?: string;
  start_time?: string;
};

export function extractCallEvent(payload: unknown): DialpadCallEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const nested = (p.call as Record<string, unknown> | undefined) ?? undefined;
  const callId = (p.call_id ?? p.id ?? nested?.id) as string | undefined;
  if (!callId) return null;
  const direction = ((p.direction as string) ?? "inbound") as "inbound" | "outbound";
  const from = p.from as string | undefined;
  const to = p.to as string | undefined;
  return {
    call_id: callId,
    event_type: (p.event_type as string) ?? "call_completed",
    direction,
    contact: p.contact as { phone?: string; email?: string; name?: string } | undefined,
    external_number: (p.external_number as string) ?? (direction === "inbound" ? from : to),
    internal_number: (p.internal_number as string) ?? (direction === "inbound" ? to : from),
    duration: typeof p.duration === "number" ? (p.duration as number) : undefined,
    recording_url: (p.recording_url as string) ?? undefined,
    voicemail_url: (p.voicemail_url as string) ?? undefined,
    call_disposition: (p.call_disposition as string) ?? undefined,
    start_time: (p.start_time as string) ?? undefined,
  };
}
