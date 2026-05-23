import "server-only";
import { db } from "@/lib/db";
import {
  accounts as accountsTable,
  contacts as contactsTable,
  mailshakeCampaigns,
  mailshakeLeads,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  listCampaigns,
  listLeads,
  listRecipients,
  type MailshakeCampaignSummary,
  type MailshakeLeadRow,
  type MailshakeRecipientRow,
} from "./mailshake";
import { normalizeMailshakeRecipient } from "./mailshake-transform";

export type SyncResult = {
  campaigns: { upserted: number };
  leads: { upserted: number; matchedAccount: number; matchedContact: number };
  perCampaign: Array<{ id: number; title: string; leadCount: number }>;
};

type MailshakeLeadValues = {
  mailshakeLeadId: string;
  campaignId: string;
  mailshakeCampaignId: string;
  recipientId: string | null;
  email: string;
  fullName: string | null;
  schoolName: string | null;
  accountId: string | null;
  contactId: string | null;
  status: string;
  isPaused: boolean;
  openedAt: Date | null;
  lastStatusChangeAt: Date | null;
  annotation: string | null;
  assignedToEmail: string | null;
  fields: Record<string, unknown>;
  lastSyncedAt: Date;
};

/**
 * Upsert one campaign row from a Mailshake list payload.
 * Returns the local DB id.
 */
async function upsertCampaign(c: MailshakeCampaignSummary): Promise<string> {
  const values = {
    mailshakeId: String(c.id),
    title: c.title,
    isArchived: c.isArchived ?? false,
    isPaused: c.isPaused ?? false,
    wizardStatus: c.wizardStatus ?? null,
    senderEmail: c.sender?.emailAddress ?? null,
    senderName: c.sender?.fromName ?? null,
    url: c.url ?? null,
    mailshakeCreatedAt: c.created ? new Date(c.created) : null,
    lastSyncedAt: new Date(),
  };
  const [row] = await db
    .insert(mailshakeCampaigns)
    .values(values)
    .onConflictDoUpdate({
      target: mailshakeCampaigns.mailshakeId,
      set: {
        title: values.title,
        isArchived: values.isArchived,
        isPaused: values.isPaused,
        wizardStatus: values.wizardStatus,
        senderEmail: values.senderEmail,
        senderName: values.senderName,
        url: values.url,
        mailshakeCreatedAt: values.mailshakeCreatedAt,
        lastSyncedAt: values.lastSyncedAt,
        updatedAt: new Date(),
      },
    })
    .returning({ id: mailshakeCampaigns.id });
  return row.id;
}

type AccountMatch = { accountId: string | null; contactId: string | null };

/**
 * Resolve a Mailshake lead → CRM account/contact.
 * 1) Match the recipient email to contacts.email (case-insensitive)
 * 2) Fall back to matching `fields.account` (school name) to accounts.name
 *    (case-insensitive, deleted_at is null)
 */
async function matchLead(
  email: string,
  schoolName: string | null,
): Promise<AccountMatch> {
  const normalized = email.trim().toLowerCase();

  if (normalized) {
    const rows = await db
      .select({ id: contactsTable.id, accountId: contactsTable.accountId })
      .from(contactsTable)
      .where(
        sql`lower(${contactsTable.email}) = ${normalized} and ${contactsTable.deletedAt} is null`,
      )
      .limit(1);
    if (rows.length > 0) {
      return { accountId: rows[0].accountId, contactId: rows[0].id };
    }
  }

  if (schoolName && schoolName.trim()) {
    const normSchool = schoolName.trim().toLowerCase();
    const rows = await db
      .select({ id: accountsTable.id })
      .from(accountsTable)
      .where(
        sql`lower(${accountsTable.name}) = ${normSchool} and ${accountsTable.deletedAt} is null`,
      )
      .limit(1);
    if (rows.length > 0) {
      return { accountId: rows[0].id, contactId: null };
    }
  }

  return { accountId: null, contactId: null };
}

async function upsertLead(
  values: MailshakeLeadValues,
): Promise<{ email: string; matchedAccount: boolean; matchedContact: boolean }> {
  if (!values.email) {
    return { email: "", matchedAccount: false, matchedContact: false };
  }
  await db
    .insert(mailshakeLeads)
    .values(values)
    .onConflictDoUpdate({
      target: [mailshakeLeads.mailshakeCampaignId, mailshakeLeads.email],
      set: {
        mailshakeLeadId: values.mailshakeLeadId,
        campaignId: values.campaignId,
        mailshakeCampaignId: values.mailshakeCampaignId,
        recipientId: values.recipientId,
        email: values.email,
        fullName: values.fullName,
        schoolName: values.schoolName,
        accountId: values.accountId,
        contactId: values.contactId,
        status: values.status,
        isPaused: values.isPaused,
        openedAt: values.openedAt,
        lastStatusChangeAt: values.lastStatusChangeAt,
        annotation: values.annotation,
        assignedToEmail: values.assignedToEmail,
        fields: values.fields,
        lastSyncedAt: values.lastSyncedAt,
        updatedAt: new Date(),
      },
    });

  return {
    email: values.email,
    matchedAccount: values.accountId !== null,
    matchedContact: values.contactId !== null,
  };
}

async function upsertRecipient(
  campaignDbId: string,
  campaignMailshakeId: string,
  recipient: MailshakeRecipientRow,
) {
  const normalized = normalizeMailshakeRecipient(campaignMailshakeId, recipient);
  const match = await matchLead(normalized.email, normalized.schoolName);
  return upsertLead({
    mailshakeLeadId: normalized.mailshakeLeadId,
    campaignId: campaignDbId,
    mailshakeCampaignId: normalized.mailshakeCampaignId,
    recipientId: normalized.recipientId,
    email: normalized.email,
    fullName: normalized.fullName,
    schoolName: normalized.schoolName,
    accountId: match.accountId,
    contactId: match.contactId,
    status: normalized.status,
    isPaused: normalized.isPaused,
    openedAt: null,
    lastStatusChangeAt: null,
    annotation: null,
    assignedToEmail: null,
    fields: normalized.fields,
    lastSyncedAt: new Date(),
  });
}

async function upsertEngagedLead(
  campaignDbId: string,
  campaignMailshakeId: string,
  lead: MailshakeLeadRow,
) {
  const email = lead.recipient.emailAddress.trim().toLowerCase();
  const schoolName = lead.recipient.fields?.account ?? null;
  const match = await matchLead(email, schoolName);
  return upsertLead({
    mailshakeLeadId: String(lead.id),
    campaignId: campaignDbId,
    mailshakeCampaignId: campaignMailshakeId,
    recipientId: lead.recipient.id ? String(lead.recipient.id) : null,
    email,
    fullName: lead.recipient.fullName ?? null,
    schoolName,
    accountId: match.accountId,
    contactId: match.contactId,
    status: lead.status,
    isPaused: lead.recipient.isPaused ?? false,
    openedAt: lead.openedDate ? new Date(lead.openedDate) : null,
    lastStatusChangeAt: lead.lastStatusChangeDate
      ? new Date(lead.lastStatusChangeDate)
      : null,
    annotation: lead.annotation ?? null,
    assignedToEmail: lead.assignedTo?.emailAddress ?? null,
    fields: lead.recipient.fields ?? {},
    lastSyncedAt: new Date(),
  });
}

/**
 * Sync a single campaign's leads. Used by Inngest cron + manual script.
 * Returns the count of leads upserted.
 */
export async function syncCampaign(
  campaign: MailshakeCampaignSummary,
): Promise<{ leadCount: number; matchedAccount: number; matchedContact: number }> {
  const campaignDbId = await upsertCampaign(campaign);
  const matchedByEmail = new Map<
    string,
    { matchedAccount: boolean; matchedContact: boolean }
  >();
  const recipients = await listRecipients(campaign.id);
  for (const recipient of recipients) {
    const result = await upsertRecipient(campaignDbId, String(campaign.id), recipient);
    if (result.email) {
      matchedByEmail.set(result.email, {
        matchedAccount: result.matchedAccount,
        matchedContact: result.matchedContact,
      });
    }
  }

  const leads = await listLeads(campaign.id);
  for (const lead of leads) {
    const result = await upsertEngagedLead(
      campaignDbId,
      String(campaign.id),
      lead,
    );
    if (result.email) {
      matchedByEmail.set(result.email, {
        matchedAccount: result.matchedAccount,
        matchedContact: result.matchedContact,
      });
    }
  }
  let matchedAccount = 0;
  let matchedContact = 0;
  for (const match of matchedByEmail.values()) {
    if (match.matchedAccount) matchedAccount++;
    if (match.matchedContact) matchedContact++;
  }
  return { leadCount: matchedByEmail.size, matchedAccount, matchedContact };
}

/**
 * Full sync: upsert all campaigns, then for each non-archived campaign sync leads.
 */
export async function syncAllCampaigns(opts?: {
  includeArchived?: boolean;
}): Promise<SyncResult> {
  const includeArchived = opts?.includeArchived ?? false;
  const campaigns = await listCampaigns();

  const result: SyncResult = {
    campaigns: { upserted: 0 },
    leads: { upserted: 0, matchedAccount: 0, matchedContact: 0 },
    perCampaign: [],
  };

  for (const c of campaigns) {
    await upsertCampaign(c);
    result.campaigns.upserted++;
  }

  const target = includeArchived
    ? campaigns
    : campaigns.filter((c) => !c.isArchived);

  for (const c of target) {
    try {
      // eslint-disable-next-line no-console
      console.error(`[mailshake-sync] ${c.id} ${c.title.slice(0, 60)}…`);
      const { leadCount, matchedAccount, matchedContact } = await syncCampaign(c);
      result.leads.upserted += leadCount;
      result.leads.matchedAccount += matchedAccount;
      result.leads.matchedContact += matchedContact;
      result.perCampaign.push({ id: c.id, title: c.title, leadCount });
      // eslint-disable-next-line no-console
      console.error(
        `[mailshake-sync]   ${c.id} done: ${leadCount} leads (${matchedAccount} matched account, ${matchedContact} matched contact)`,
      );
    } catch (err) {
      result.perCampaign.push({
        id: c.id,
        title: `${c.title} (error: ${(err as Error).message.slice(0, 80)})`,
        leadCount: 0,
      });
    }
  }

  // Touch lastSyncedAt on all just-synced campaigns to reflect this run.
  if (target.length > 0) {
    await db
      .update(mailshakeCampaigns)
      .set({ lastSyncedAt: new Date() })
      .where(
        sql`${mailshakeCampaigns.mailshakeId} in (${sql.join(
          target.map((c) => sql`${String(c.id)}`),
          sql`, `,
        )})`,
      );
  }

  return result;
}

/**
 * Re-match all leads to accounts/contacts. Used after CRM contacts/accounts
 * are added so previously-unmatched leads can be linked.
 */
export async function rematchAllLeads(): Promise<{
  scanned: number;
  rematchedAccount: number;
  rematchedContact: number;
}> {
  const rows = await db
    .select({
      id: mailshakeLeads.id,
      email: mailshakeLeads.email,
      schoolName: mailshakeLeads.schoolName,
      currentAccountId: mailshakeLeads.accountId,
      currentContactId: mailshakeLeads.contactId,
    })
    .from(mailshakeLeads);

  let rematchedAccount = 0;
  let rematchedContact = 0;

  for (const row of rows) {
    const match = await matchLead(row.email, row.schoolName);
    if (
      match.accountId !== row.currentAccountId ||
      match.contactId !== row.currentContactId
    ) {
      await db
        .update(mailshakeLeads)
        .set({
          accountId: match.accountId,
          contactId: match.contactId,
          updatedAt: new Date(),
        })
        .where(eq(mailshakeLeads.id, row.id));
      if (match.accountId && !row.currentAccountId) rematchedAccount++;
      if (match.contactId && !row.currentContactId) rematchedContact++;
    }
  }

  return { scanned: rows.length, rematchedAccount, rematchedContact };
}
