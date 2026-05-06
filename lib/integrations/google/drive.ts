import "server-only";
import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { getAuthedDriveClient } from "./oauth";

function parseServiceAccountKey() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY not set. Paste the JSON key from your GCP service account into .env.local.",
    );
  }
  try {
    return JSON.parse(raw) as { client_email: string; private_key: string };
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON");
  }
}

export function getServiceAccountClient(scopes: string[] = ["https://www.googleapis.com/auth/drive"]) {
  const key = parseServiceAccountKey();
  return new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes,
  });
}

export async function getDriveForUser(userId: string) {
  const auth = await getAuthedDriveClient(userId);
  return google.drive({ version: "v3", auth });
}

export function getDriveAsService() {
  return google.drive({ version: "v3", auth: getServiceAccountClient() });
}

export function getDocsAsService() {
  return google.docs({ version: "v1", auth: getServiceAccountClient() });
}

export type DriveFileInfo = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  createdTime?: string | null;
  modifiedTime?: string | null;
};

export async function getFileMetadata(
  userId: string,
  fileId: string,
): Promise<DriveFileInfo> {
  const drive = await getDriveForUser(userId);
  const res = await drive.files.get({
    fileId,
    fields: "id, name, mimeType, webViewLink, createdTime, modifiedTime",
    supportsAllDrives: true,
  });
  const f = res.data;
  if (!f.id || !f.name || !f.mimeType || !f.webViewLink) {
    throw new Error("Drive file missing required fields");
  }
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    webViewLink: f.webViewLink,
    createdTime: f.createdTime,
    modifiedTime: f.modifiedTime,
  };
}

/**
 * Generate a contract from a template. Service-account based: the template
 * folder + generated folder must both be shared with the service account.
 *
 *  1. Copy the template into the generated folder.
 *  2. Replace placeholder tokens via Docs batchUpdate.
 *  3. Optionally transfer ownership to the rep via Drive permissions.
 */
export async function copyTemplateAndFill(opts: {
  templateFileId: string;
  generatedFolderId: string;
  newName: string;
  placeholders: Record<string, string>;
  shareWithEmail?: string;
}): Promise<DriveFileInfo> {
  const drive = getDriveAsService();
  const docs = getDocsAsService();

  const copyRes = await drive.files.copy({
    fileId: opts.templateFileId,
    requestBody: {
      name: opts.newName,
      parents: [opts.generatedFolderId],
    },
    supportsAllDrives: true,
  });
  const newId = copyRes.data.id;
  if (!newId) throw new Error("Drive copy returned no file ID");

  const requests = Object.entries(opts.placeholders).map(([key, value]) => ({
    replaceAllText: {
      containsText: { text: `{{${key}}}`, matchCase: true },
      replaceText: value,
    },
  }));
  if (requests.length > 0) {
    await docs.documents.batchUpdate({
      documentId: newId,
      requestBody: { requests },
    });
  }

  if (opts.shareWithEmail) {
    await drive.permissions.create({
      fileId: newId,
      sendNotificationEmail: false,
      requestBody: {
        type: "user",
        role: "writer",
        emailAddress: opts.shareWithEmail,
      },
      supportsAllDrives: true,
    });
  }

  const meta = await drive.files.get({
    fileId: newId,
    fields: "id, name, mimeType, webViewLink, createdTime, modifiedTime",
    supportsAllDrives: true,
  });
  const f = meta.data;
  return {
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType!,
    webViewLink: f.webViewLink!,
    createdTime: f.createdTime,
    modifiedTime: f.modifiedTime,
  };
}

/**
 * For status reconciliation: list permissions on a file (to detect whether
 * it was shared externally) and any "SIGNED" rename heuristic.
 */
export async function reconcileFileStatus(
  fileId: string,
): Promise<{ name: string; sharedExternally: boolean; mimeType: string }> {
  const drive = getDriveAsService();
  const meta = await drive.files.get({
    fileId,
    fields: "name, mimeType",
    supportsAllDrives: true,
  });
  const perms = await drive.permissions.list({
    fileId,
    fields: "permissions(emailAddress, role, type)",
    supportsAllDrives: true,
  });
  const sharedExternally = (perms.data.permissions ?? []).some((p) => {
    if (p.type !== "user") return false;
    const email = p.emailAddress ?? "";
    const allowed = process.env.ALLOWED_EMAIL_DOMAIN ?? "schoolconex.com";
    return email && !email.endsWith(`@${allowed}`);
  });
  return {
    name: meta.data.name ?? "",
    sharedExternally,
    mimeType: meta.data.mimeType ?? "",
  };
}
