// Probe CDP endpoint and report current pages.
const url = "http://127.0.0.1:9222/json/version";
try {
  const v = await fetch(url).then((r) => r.json());
  console.log("CDP up:", v.Browser, v.webSocketDebuggerUrl ? "(ws ok)" : "");
  const pages = await fetch("http://127.0.0.1:9222/json/list").then((r) => r.json());
  for (const p of pages) {
    console.log(` - [${p.type}] ${p.title} :: ${p.url}`);
  }
} catch (e) {
  console.log("not yet:", (e as Error).message);
  process.exit(1);
}
