// Smoke test: SA can read both folders AND create/copy/delete files in the
// Shared Drive (the F-005 fix). Storage is owned by the Shared Drive itself,
// so the SA's per-user quota does not apply.
import { config } from "dotenv";
import { google } from "googleapis";
import { JWT } from "google-auth-library";

config({ path: ".env.local" });

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!;
const key = JSON.parse(raw) as { client_email: string; private_key: string };
const SHARED_DRIVE = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID!;
const TEMPLATES = process.env.GOOGLE_DRIVE_TEMPLATES_FOLDER_ID!;
const GENERATED = process.env.GOOGLE_DRIVE_GENERATED_FOLDER_ID!;

const auth = new JWT({
  email: key.client_email,
  key: key.private_key,
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

console.log(`SA: ${key.client_email}\n`);

// 1. About: confirm auth works
console.log("[1/5] Verifying SA auth (drive.about.get)…");
const about = await drive.about.get({ fields: "user, storageQuota" });
console.log(`  user: ${about.data.user?.emailAddress ?? "?"}`);
console.log(
  `  storage quota limit: ${about.data.storageQuota?.limit ?? "(unset)"}, usage: ${about.data.storageQuota?.usage ?? "?"}`,
);

// 2. Read templates folder
console.log("\n[2/5] Listing 'CRM Templates' folder (Shared Drive)…");
const tmpls = await drive.files.list({
  q: `'${TEMPLATES}' in parents and trashed = false`,
  fields: "files(id, name, mimeType)",
  pageSize: 25,
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
  corpora: "drive",
  driveId: SHARED_DRIVE,
});
console.log(`  ${tmpls.data.files?.length ?? 0} item(s):`);
for (const f of tmpls.data.files ?? []) {
  console.log(`   - ${f.name} [${f.mimeType}] ${f.id}`);
}

// 3. Read generated folder
console.log("\n[3/5] Listing 'CRM Generated' folder (Shared Drive)…");
const gen = await drive.files.list({
  q: `'${GENERATED}' in parents and trashed = false`,
  fields: "files(id, name, mimeType)",
  pageSize: 25,
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
  corpora: "drive",
  driveId: SHARED_DRIVE,
});
console.log(`  ${gen.data.files?.length ?? 0} item(s):`);
for (const f of gen.data.files ?? []) {
  console.log(`   - ${f.name} [${f.mimeType}] ${f.id}`);
}

// 4. Create a Google Doc inside CRM Generated. This is the operation that
// previously failed with storageQuotaExceeded.
console.log("\n[4/5] Creating a test Google Doc in 'CRM Generated'…");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const created = await drive.files.create({
  requestBody: {
    name: `smoke-test-${stamp}`,
    mimeType: "application/vnd.google-apps.document",
    parents: [GENERATED],
  },
  supportsAllDrives: true,
  fields: "id, name, parents, mimeType, driveId",
});
console.log(`  ✓ created: ${created.data.name} (${created.data.id})`);
console.log(`    driveId: ${created.data.driveId} (should match Shared Drive)`);

// 5. Clean up — delete the test file
console.log("\n[5/5] Deleting test file…");
await drive.files.delete({
  fileId: created.data.id!,
  supportsAllDrives: true,
});
console.log(`  ✓ deleted`);

console.log("\n✓ All checks passed. F-005 fix confirmed: SA can create files in the Shared Drive.");
