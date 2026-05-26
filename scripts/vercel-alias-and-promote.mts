// Promote the latest READY deployment to production + alias sc-crm-sand to it.
import { config } from "dotenv";
config({ path: ".env.local" });

const TOKEN = process.env.VERCEL_TOKEN ?? "MOhP1meKhDSDYtZfXwbTLxhN";
const PROJECT = "prj_17w6nRBLQMGwUMOZu37JcCMxtYcS";
const TEAM = "team_k1H7bSNbtBD2EWDxScLSMHz0";
const TARGET_ALIAS = "sc-crm-sand.vercel.app";

async function api(method: string, path: string, body?: unknown) {
  const url = `https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${TEAM}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

const list = await api("GET", `/v6/deployments?projectId=${PROJECT}&limit=10`);
const latestReady = (list.body?.deployments ?? []).find(
  (d: any) => d.state === "READY",
);
if (!latestReady) {
  console.error("No READY deployment found");
  process.exit(1);
}
console.log(`Latest READY deployment: ${latestReady.uid}  (${latestReady.url})  target=${latestReady.target ?? "preview"}`);
console.log(`  commit: ${latestReady.meta?.githubCommitSha?.slice(0, 8) ?? "?"}`);

// 1. Promote to production
console.log("\n=== Promoting to production ===");
const promote = await api("POST", `/v10/projects/${PROJECT}/promote/${latestReady.uid}`, {});
console.log(`HTTP ${promote.status}`);
if (promote.status !== 200 && promote.status !== 201) {
  console.log(JSON.stringify(promote.body, null, 2).slice(0, 500));
}

// 2. Set sc-crm-sand alias
console.log("\n=== Aliasing sc-crm-sand.vercel.app → new deploy ===");
const alias = await api("POST", `/v2/deployments/${latestReady.uid}/aliases`, {
  alias: TARGET_ALIAS,
});
console.log(`HTTP ${alias.status}`);
console.log(JSON.stringify(alias.body, null, 2).slice(0, 400));

// 3. Verify
console.log("\n=== Verifying alias ===");
const verify = await fetch(`https://api.vercel.com/v4/aliases/${TARGET_ALIAS}?teamId=${TEAM}`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});
const verifyBody: any = await verify.json();
console.log(`  ${TARGET_ALIAS} → deployment ${verifyBody.deploymentId}`);
console.log(`  matches latest READY (${latestReady.uid})? ${verifyBody.deploymentId === latestReady.uid ? "YES ✓" : "NO ✗"}`);
