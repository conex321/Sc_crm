import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://example:example@example.invalid/example";

const mailshake = await import("../lib/integrations/mailshake-transform");
const dialpadWebhook = await import("../lib/integrations/dialpad");
const dialpad = await import("../lib/integrations/dialpad-client");

const recipient = mailshake.normalizeMailshakeRecipient("1504458", {
  id: 680345500,
  emailAddress: "SangeetaKumar@3sixtyeducation.ca ",
  fullName: "Sangeeta Kumar",
  isPaused: true,
  first: "Sangeeta",
  last: "Kumar",
  fields: {
    account: "3sixty Education",
    phoneNumber: "647-494-4340",
    title: "Principal",
  },
});

assert.equal(recipient.mailshakeLeadId, "recipient:680345500");
assert.equal(recipient.recipientId, "680345500");
assert.equal(recipient.email, "sangeetakumar@3sixtyeducation.ca");
assert.equal(recipient.fullName, "Sangeeta Kumar");
assert.equal(recipient.schoolName, "3sixty Education");
assert.equal(recipient.status, "recipient");
assert.equal(recipient.isPaused, true);
assert.deepEqual(recipient.fields, {
  account: "3sixty Education",
  phoneNumber: "647-494-4340",
  title: "Principal",
});

assert.equal(
  dialpad.buildCallsListPath({
    startedAfter: 1776960470803,
    limit: 100,
  }),
  "/call?started_after=1776960470803&limit=50",
);

assert.equal(
  dialpad.buildCallsListPath({
    userId: "123",
    startedAfter: 1776960470803,
    limit: 10,
    cursor: "abc",
  }),
  "/call?started_after=1776960470803&limit=10&user_id=123&cursor=abc",
);

const outboundCall = dialpadWebhook.extractCallEvent({
  id: "call-1",
  direction: "outbound",
  from: "+14375234132",
  to: "+16475550123",
});

assert.equal(outboundCall?.external_number, "+16475550123");
assert.equal(outboundCall?.internal_number, "+14375234132");

console.log("integration sync transform tests passed");
