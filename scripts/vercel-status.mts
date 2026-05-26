// Query Vercel API for recent deployments + production alias status.
import { config } from "dotenv";
config({ path: ".env.local" });

const TOKEN = process.env.VERCEL_TOKEN ?? "MOhP1meKhDSDYtZfXwbTLxhN";
const PROJECT = "prj_17w6nRBLQMGwUMOZu37JcCMxtYcS";
const TEAM = "team_k1H7bSNbtBD2EWDxScLSMHz0";

async function api(path: string) {
  const res = await fetch(`https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${TEAM}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${await res.text()}`);
    return null;
  }
  return res.json();
}

const list = await api(`/v6/deployments?projectId=${PROJECT}&limit=10`);
console.log("=== Latest 10 deployments ===");
for (const d of list?.deployments ?? []) {
  const created = new Date(d.created).toISOString();
  console.log(`  ${created}  state=${d.state}  target=${d.target ?? "preview"}  src=${d.source ?? "?"}  ${d.url}`);
  if (d.meta?.githubCommitSha) console.log(`    commit: ${d.meta.githubCommitSha.slice(0,8)} "${(d.meta.githubCommitMessage ?? "").split("\n")[0].slice(0,60)}"`);
}

// Fetch errors for the latest failed deployment
const latestError = (list?.deployments ?? []).find((d: any) => d.state === "ERROR");
if (latestError) {
  console.log(`\n=== Build log for FAILED deploy ${latestError.uid} ===`);
  const errRes = await fetch(`https://api.vercel.com/v3/deployments/${latestError.uid}/events?teamId=${TEAM}&builds=1&limit=50`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (errRes.ok) {
    const events = await errRes.json();
    const errs = (Array.isArray(events) ? events : []).filter((e: any) => e.type === "stderr" || (e.payload?.text ?? "").toLowerCase().includes("error"));
    for (const e of errs.slice(-15)) {
      const text = e.payload?.text ?? e.text ?? "";
      console.log(`  ${text.trim().slice(0, 200)}`);
    }
  }
}

console.log("\n=== sc-crm-sand alias lookup ===");
const sandAlias = await fetch(`https://api.vercel.com/v4/aliases/sc-crm-sand.vercel.app?teamId=${TEAM}`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});
if (sandAlias.ok) {
  const data: any = await sandAlias.json();
  console.log(`  → deployment ${data.deploymentId} (created ${new Date(data.created).toISOString()})`);
  console.log(`  → project ${data.projectId}`);
} else {
  console.log(`  HTTP ${sandAlias.status}`);
}

console.log("\n=== Production alias ===");
const aliases = await api(`/v4/aliases?projectId=${PROJECT}&limit=3`);
for (const a of aliases?.aliases ?? []) {
  console.log(`  ${a.alias}  → deployment ${a.deploymentId}  created=${new Date(a.created).toISOString()}`);
}

console.log("\n=== Routes in latest prod deployment ===");
const latest = (list?.deployments ?? []).find((d: any) => d.target === "production");
if (latest) {
  const detail = await api(`/v13/deployments/${latest.uid}`);
  const routes = (detail?.routes ?? []).map((r: any) => r.src).slice(0, 20);
  console.log(`  Routes in ${latest.uid}: ${routes.length} found`);
  for (const r of routes) console.log(`    ${r}`);
  const files = await api(`/v6/deployments/${latest.uid}/files`);
  const cronFiles = (files ?? []).filter((f: any) => f.name?.includes("cron")).slice(0, 10);
  console.log(`\n  Cron files in deployment:`);
  for (const f of cronFiles) console.log(`    ${f.name}`);
}
