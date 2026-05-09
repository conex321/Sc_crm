// Use the service account to create "CRM Templates" + "CRM Generated"
// folders in Drive (owned by SA, shared with matthew@schoolconex.com as writer).
// Capture both folder IDs to .env.local.
import { config } from "dotenv";
import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

config({ path: ".env.local" });

const ENV_FILE = resolve(process.cwd(), ".env.local");
const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
if (!raw) {
  console.error("GOOGLE_SERVICE_ACCOUNT_KEY not set");
  process.exit(1);
}
const key = JSON.parse(raw) as { client_email: string; private_key: string };

const auth = new JWT({
  email: key.client_email,
  key: key.private_key,
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

async function findOrCreate(name: string): Promise<string> {
  const list = await drive.files.list({
    q: `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    pageSize: 5,
  });
  if (list.data.files && list.data.files.length > 0) {
    console.log(`'${name}' already exists: ${list.data.files[0].id}`);
    return list.data.files[0].id!;
  }
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });
  if (!created.data.id) throw new Error("create returned no id");
  console.log(`created '${name}': ${created.data.id}`);
  return created.data.id;
}

async function shareWith(folderId: string, email: string, role: "reader" | "writer") {
  await drive.permissions.create({
    fileId: folderId,
    sendNotificationEmail: false,
    requestBody: { type: "user", role, emailAddress: email },
  });
  console.log(`  shared ${folderId} with ${email} as ${role}`);
}

async function main() {
  const templatesId = await findOrCreate("CRM Templates");
  const generatedId = await findOrCreate("CRM Generated");

  // Share both with matthew@schoolconex.com (writer)
  await shareWith(templatesId, "matthew@schoolconex.com", "writer");
  await shareWith(generatedId, "matthew@schoolconex.com", "writer");

  // Persist to .env.local
  let env = await readFile(ENV_FILE, "utf-8").catch(() => "");
  const lines = env.split(/\r?\n/);
  let foundT = false;
  let foundG = false;
  const out = lines.map((line) => {
    if (line.startsWith("GOOGLE_DRIVE_TEMPLATES_FOLDER_ID=")) {
      foundT = true;
      return `GOOGLE_DRIVE_TEMPLATES_FOLDER_ID=${templatesId}`;
    }
    if (line.startsWith("GOOGLE_DRIVE_GENERATED_FOLDER_ID=")) {
      foundG = true;
      return `GOOGLE_DRIVE_GENERATED_FOLDER_ID=${generatedId}`;
    }
    return line;
  });
  if (!foundT) out.push(`GOOGLE_DRIVE_TEMPLATES_FOLDER_ID=${templatesId}`);
  if (!foundG) out.push(`GOOGLE_DRIVE_GENERATED_FOLDER_ID=${generatedId}`);
  await writeFile(ENV_FILE, out.join("\n"), "utf-8");
  console.log(`\n.env.local: TEMPLATES=${templatesId}, GENERATED=${generatedId}`);
  console.log(`Drive URLs:`);
  console.log(`  https://drive.google.com/drive/folders/${templatesId}`);
  console.log(`  https://drive.google.com/drive/folders/${generatedId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
