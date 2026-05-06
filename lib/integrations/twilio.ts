import "server-only";
import crypto from "node:crypto";

/**
 * Verify a Twilio webhook signature.
 * Twilio signs requests using HMAC-SHA1 over `url + concatenated_sorted_params`.
 * See: https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signatureHeader: string | null,
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;
  if (!signatureHeader) return false;

  const sorted = Object.keys(params).sort();
  const data = sorted.reduce((acc, key) => acc + key + params[key], url);
  const computed = crypto
    .createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");

  const a = Buffer.from(computed);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export type TwilioWhatsAppMessage = {
  messageSid: string;
  from: string; // "whatsapp:+1555…"
  to: string; // "whatsapp:+1555…"
  body: string;
  numMedia: number;
  mediaUrls: string[];
};

export function parseTwilioWhatsAppForm(
  params: Record<string, string>,
): TwilioWhatsAppMessage | null {
  const messageSid = params.MessageSid ?? params.SmsMessageSid;
  const from = params.From;
  const to = params.To;
  const body = params.Body ?? "";
  if (!messageSid || !from || !to) return null;

  const numMedia = Number(params.NumMedia ?? 0);
  const mediaUrls: string[] = [];
  for (let i = 0; i < numMedia; i++) {
    const url = params[`MediaUrl${i}`];
    if (url) mediaUrls.push(url);
  }
  return {
    messageSid,
    from: from.replace(/^whatsapp:/, ""),
    to: to.replace(/^whatsapp:/, ""),
    body,
    numMedia,
    mediaUrls,
  };
}
