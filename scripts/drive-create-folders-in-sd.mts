// Creates "CRM Templates" and "CRM Generated" folders inside the SchoolConex
// CRM Shared Drive, using the service account. Prints folder IDs to update
// .env.local with.
//
// Requires the SA to already be a member of the Shared Drive (we did that in
// drive-oauth-add-sa.mts).
import { config } from "dotenv";
import { google } from "googleapis";
import { JWT } from "google-auth-library";

config({ path: ".env.local" });

const SHARED_DRIVE_ID = process.argv[2] ?? "0AFnM-2HvmqO2Uk9PVA";
const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!;
const key = JSON.parse(raw) as { client_email: string; private_key: string };

const auth = new JWT({
  email: key.client_email,
  key: key.private_key,
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

console.log(`SA: ${key.client_email}`);
console.log(`Shared Drive: ${SHARED_DRIVE_ID}\n`);

async function ensureFolder(name: string): Promise<string> {
  // Check if it already exists in the Shared Drive root
  const existing = await drive.files.list({
    q: `'${SHARED_DRIVE_ID}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "drive",
    driveId: SHARED_DRIVE_ID,
  });
  if (existing.data.files && existing.data.files.length > 0) {
    const id = existing.data.files[0].id!;
    console.log(`  ${name}: already exists (${id})`);
    return id;
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [SHARED_DRIVE_ID],
    },
    supportsAllDrives: true,
    fields: "id, name",
  });
  console.log(`  ${name}: created (${created.data.id})`);
  return created.data.id!;
}

console.log("Creating folders…");
const templatesId = await ensureFolder("CRM Templates");
const generatedId = await ensureFolder("CRM Generated");

console.log("\nUpdate .env.local:");
console.log(`GOOGLE_DRIVE_SHARED_DRIVE_ID=${SHARED_DRIVE_ID}`);
console.log(`GOOGLE_DRIVE_TEMPLATES_FOLDER_ID=${templatesId}`);
console.log(`GOOGLE_DRIVE_GENERATED_FOLDER_ID=${generatedId}`);
