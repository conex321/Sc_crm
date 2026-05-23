export type MailshakeRecipientListRow = {
  id?: number | string | null;
  emailAddress?: string | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  first?: string | null;
  last?: string | null;
  isPaused?: boolean | null;
  fields?: Record<string, unknown> | null;
};

export type NormalizedMailshakeRecipient = {
  mailshakeLeadId: string;
  mailshakeCampaignId: string;
  recipientId: string | null;
  email: string;
  fullName: string | null;
  schoolName: string | null;
  status: "recipient";
  isPaused: boolean;
  fields: Record<string, string>;
};

function cleanFields(fields: Record<string, unknown> | null | undefined) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (value == null) continue;
    out[key] = String(value);
  }
  return out;
}

function fullNameFromParts(recipient: MailshakeRecipientListRow) {
  const explicit = recipient.fullName?.trim();
  if (explicit) return explicit;
  const first = (recipient.firstName ?? recipient.first ?? "").trim();
  const last = (recipient.lastName ?? recipient.last ?? "").trim();
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined || null;
}

export function mailshakeRecipientLeadId(recipientId: string | number) {
  return `recipient:${recipientId}`;
}

export function normalizeMailshakeRecipient(
  campaignId: string | number,
  recipient: MailshakeRecipientListRow,
): NormalizedMailshakeRecipient {
  const recipientId = recipient.id == null ? null : String(recipient.id);
  const fields = cleanFields(recipient.fields);
  const email = (recipient.emailAddress ?? "").trim().toLowerCase();

  return {
    mailshakeLeadId: recipientId
      ? mailshakeRecipientLeadId(recipientId)
      : `recipient:${campaignId}:${email}`,
    mailshakeCampaignId: String(campaignId),
    recipientId,
    email,
    fullName: fullNameFromParts(recipient),
    schoolName: fields.account?.trim() || null,
    status: "recipient",
    isPaused: recipient.isPaused ?? false,
    fields,
  };
}
