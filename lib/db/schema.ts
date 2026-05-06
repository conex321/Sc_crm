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
