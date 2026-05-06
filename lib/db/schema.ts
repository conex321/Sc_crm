import {
  boolean,
  date,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["rep", "manager", "admin"]);
export const accountTypeEnum = pgEnum("account_type", [
  "school",
  "aspiring_founder",
  "district",
  "other",
]);
export const serviceLineEnum = pgEnum("service_line", [
  "principal_service",
  "lms",
  "courses",
]);
export const opportunityStatusEnum = pgEnum("opportunity_status", [
  "open",
  "won",
  "lost",
]);
export const activityChannelEnum = pgEnum("activity_channel", [
  "call",
  "whatsapp",
  "email_outbound",
  "email_inbound",
  "mailshake_event",
  "note",
  "task",
  "contract_event",
  "payment",
]);
export const activityDirectionEnum = pgEnum("activity_direction", [
  "inbound",
  "outbound",
  "system",
]);

// ─── Audit columns helper (D-015) ────────────────────────────────────
const auditCols = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
};

const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

// ─── users ───────────────────────────────────────────────────────────
// Wraps auth.users. id matches auth.users.id 1:1, populated by post-signup trigger.
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  fullName: text("full_name").notNull(),
  googleEmail: text("google_email").notNull().unique(),
  role: userRoleEnum("role").notNull().default("rep"),
  isActive: boolean("is_active").notNull().default(true),
  ...auditCols,
});

// ─── accounts ────────────────────────────────────────────────────────
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: accountTypeEnum("type").notNull().default("school"),
  website: text("website"),
  address: text("address"),
  phone: text("phone"),
  country: text("country"),
  ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  source: text("source"),
  ...auditCols,
  ...softDelete,
});

// ─── contacts ────────────────────────────────────────────────────────
export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: text("role"),
  email: text("email"),
  phone: text("phone"),
  whatsappPhone: text("whatsapp_phone"),
  isPrimary: boolean("is_primary").notNull().default(false),
  externalIds: jsonb("external_ids").notNull().default({}),
  ...auditCols,
  ...softDelete,
});

// ─── pipelines ───────────────────────────────────────────────────────
export const pipelines = pgTable("pipelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  serviceLine: serviceLineEnum("service_line").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...auditCols,
});

// ─── pipeline_stages ─────────────────────────────────────────────────
export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pipelineId: uuid("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: smallint("position").notNull(),
    probability: smallint("probability").notNull().default(0),
    isWon: boolean("is_won").notNull().default(false),
    isLost: boolean("is_lost").notNull().default(false),
    ...auditCols,
  },
  (t) => [
    uniqueIndex("pipeline_stages_pipeline_position_idx").on(t.pipelineId, t.position),
  ],
);

// ─── opportunities ───────────────────────────────────────────────────
export const opportunities = pgTable("opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  pipelineId: uuid("pipeline_id")
    .notNull()
    .references(() => pipelines.id, { onDelete: "restrict" }),
  stageId: uuid("stage_id")
    .notNull()
    .references(() => pipelineStages.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }),
  currency: text("currency").notNull().default("USD"),
  expectedCloseDate: date("expected_close_date"),
  ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  primaryContactId: uuid("primary_contact_id").references(() => contacts.id, {
    onDelete: "set null",
  }),
  status: opportunityStatusEnum("status").notNull().default("open"),
  wonReason: text("won_reason"),
  lostReason: text("lost_reason"),
  ...auditCols,
  ...softDelete,
});

// ─── activities (parent table per D-011) ─────────────────────────────
// account_id is NULLABLE (D-014) — unmatched inbound events route to "Unmatched inbox".
export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, {
    onDelete: "set null",
  }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  channel: activityChannelEnum("channel").notNull(),
  direction: activityDirectionEnum("direction").notNull().default("system"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  summary: text("summary").notNull(),
  ...auditCols,
});

// ─── notes (1:1 child of activities; channel='note') ─────────────────
export const notes = pgTable("notes", {
  activityId: uuid("activity_id")
    .primaryKey()
    .references(() => activities.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
});

// ─── tasks (1:1 child of activities; channel='task') ─────────────────
export const tasks = pgTable("tasks", {
  activityId: uuid("activity_id")
    .primaryKey()
    .references(() => activities.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  assignedUserId: uuid("assigned_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
});

// ─── documents (Drive file references — Phase 2) ─────────────────────
export const docKindEnum = pgEnum("doc_kind", [
  "contract",
  "proposal",
  "sow",
  "misc",
]);
export const docStatusEnum = pgEnum("doc_status", [
  "draft",
  "sent",
  "signed",
  "archived",
]);

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, {
    onDelete: "set null",
  }),
  driveFileId: text("drive_file_id").notNull().unique(),
  driveLink: text("drive_link").notNull(),
  mimeType: text("mime_type"),
  name: text("name").notNull(),
  docKind: docKindEnum("doc_kind").notNull().default("misc"),
  status: docStatusEnum("status").notNull().default("draft"),
  generatedFromTemplateId: uuid("generated_from_template_id"),
  contractValue: numeric("contract_value", { precision: 14, scale: 2 }),
  ...auditCols,
});

// ─── contract_templates (admin-curated Drive templates) ───────────────
export const contractTemplates = pgTable("contract_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  driveFileId: text("drive_file_id").notNull().unique(),
  driveLink: text("drive_link").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...auditCols,
});

// ─── integration_credentials (per-user OAuth tokens — Phase 2+) ───────
export const integrationCredentials = pgTable(
  "integration_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    scopes: text("scopes").array(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default({}),
    ...auditCols,
  },
  (t) => [uniqueIndex("integration_credentials_user_provider_idx").on(t.userId, t.provider)],
);

// ─── integration_events_raw (webhook audit log — Phase 3+) ────────────
export const integrationEventsRaw = pgTable(
  "integration_events_raw",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type"),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [uniqueIndex("integration_events_raw_provider_event_idx").on(t.provider, t.eventId)],
);

// ─── calls (Phase 3 child of activities) ──────────────────────────────
export const calls = pgTable("calls", {
  activityId: uuid("activity_id")
    .primaryKey()
    .references(() => activities.id, { onDelete: "cascade" }),
  dialpadCallId: text("dialpad_call_id").unique(),
  fromNumber: text("from_number"),
  toNumber: text("to_number"),
  durationSeconds: smallint("duration_seconds"),
  recordingUrl: text("recording_url"),
  transcriptText: text("transcript_text"),
  disposition: text("disposition"),
});

// ─── messages (Phase 3+ child — WhatsApp / SMS) ───────────────────────
export const messages = pgTable("messages", {
  activityId: uuid("activity_id")
    .primaryKey()
    .references(() => activities.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerMessageId: text("provider_message_id").unique(),
  threadId: text("thread_id"),
  fromNumber: text("from_number"),
  toNumber: text("to_number"),
  body: text("body"),
  mediaUrls: jsonb("media_urls").notNull().default([]),
});

// ─── email_events (Phase 5 child — Mailshake) ─────────────────────────
export const emailEvents = pgTable("email_events", {
  activityId: uuid("activity_id")
    .primaryKey()
    .references(() => activities.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerEventId: text("provider_event_id").unique(),
  campaignId: text("campaign_id"),
  subject: text("subject"),
  snippet: text("snippet"),
  eventType: text("event_type"),
});

// ─── contract_events (Phase 2+ child) ─────────────────────────────────
export const contractEvents = pgTable("contract_events", {
  activityId: uuid("activity_id")
    .primaryKey()
    .references(() => activities.id, { onDelete: "cascade" }),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
});

// ─── payments (Phase 5 child — Stripe) ────────────────────────────────
export const payments = pgTable("payments", {
  activityId: uuid("activity_id")
    .primaryKey()
    .references(() => activities.id, { onDelete: "cascade" }),
  stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
  stripeInvoiceId: text("stripe_invoice_id"),
  amount: numeric("amount", { precision: 14, scale: 2 }),
  currency: text("currency"),
  status: text("status"),
});

// ─── products / packages / line_items (Phase 4 catalog) ───────────────
export const billingPeriodEnum = pgEnum("billing_period", [
  "one_time",
  "monthly",
  "annual",
]);
export const productCategoryEnum = pgEnum("product_category", [
  "course",
  "lms",
  "principal_service",
  "other",
]);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  category: productCategoryEnum("category").notNull().default("course"),
  listPrice: numeric("list_price", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  billingPeriod: billingPeriodEnum("billing_period").notNull().default("one_time"),
  metadata: jsonb("metadata").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  ...auditCols,
});

export const packages = pgTable("packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  listPrice: numeric("list_price", { precision: 14, scale: 2 }),
  currency: text("currency").notNull().default("USD"),
  isActive: boolean("is_active").notNull().default(true),
  ...auditCols,
});

export const packageItems = pgTable(
  "package_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: smallint("quantity").notNull().default(1),
    position: smallint("position").notNull().default(0),
  },
  (t) => [uniqueIndex("package_items_package_product_idx").on(t.packageId, t.productId)],
);

export const opportunityLineItems = pgTable("opportunity_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  opportunityId: uuid("opportunity_id")
    .notNull()
    .references(() => opportunities.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "restrict" }),
  packageId: uuid("package_id").references(() => packages.id, { onDelete: "restrict" }),
  quantity: smallint("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
  discountPct: smallint("discount_pct").notNull().default(0),
  position: smallint("position").notNull().default(0),
  ...auditCols,
});

// ─── audit_log ───────────────────────────────────────────────────────
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  tableName: text("table_name").notNull(),
  rowId: uuid("row_id").notNull(),
  action: text("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── inferred TS types ───────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Pipeline = typeof pipelines.$inferSelect;
export type NewPipeline = typeof pipelines.$inferInsert;
export type PipelineStage = typeof pipelineStages.$inferSelect;
export type NewPipelineStage = typeof pipelineStages.$inferInsert;
export type Opportunity = typeof opportunities.$inferSelect;
export type NewOpportunity = typeof opportunities.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type ContractTemplate = typeof contractTemplates.$inferSelect;
export type NewContractTemplate = typeof contractTemplates.$inferInsert;
export type IntegrationCredential = typeof integrationCredentials.$inferSelect;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Package = typeof packages.$inferSelect;
export type PackageItem = typeof packageItems.$inferSelect;
export type OpportunityLineItem = typeof opportunityLineItems.$inferSelect;
export type NewOpportunityLineItem = typeof opportunityLineItems.$inferInsert;
export type Call = typeof calls.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type EmailEvent = typeof emailEvents.$inferSelect;
export type ContractEvent = typeof contractEvents.$inferSelect;
export type Payment = typeof payments.$inferSelect;
