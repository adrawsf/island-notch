// Converts docs/shots/*.png to WebP (alpha kept) with headless Edge, then
// removes the PNGs. Run after scripts/screenshots.mjs.
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DIR = new URL("../docs/shots/", import.meta.url);
const BROWSER =
  process.env.SHOT_BROWSER ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9445;
const QUALITY = Number(process.env.WEBP_QUALITY ?? 0.86);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(BROWSER, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "notch-webp-"))}`,
  "--allow-file-access-from-files",
  "about:blank",
]);
let page;
for (let i = 0; i < 50 && !page; i++) {
  await sleep(200);
  try {
    page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  } catch {}
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let nextId = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

try {
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".png"))) {
    const url = pathToFileURL(new URL(file, DIR).pathname.replace(/^\/([A-Za-z]:)/, "$1")).href;
    await send("Page.navigate", { url });
    await sleep(400);
    const r = await send("Runtime.evaluate", {
      awaitPromise: true,
      returnByValue: true,
      expression: `new Promise((done) => {
        const img = document.querySelector('img');
        const go = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); done(c.toDataURL('image/webp', ${QUALITY}).split(',')[1]); };
        img.complete ? go() : (img.onload = go);
      })`,
    });
    const data = r.result?.result?.value;
    if (!data) {
      console.warn("failed", file, JSON.stringify(r.result?.exceptionDetails ?? r.error));
      continue;
    }
    const out = new URL(file.replace(/\.png$/, ".webp"), DIR);
    writeFileSync(out, Buffer.from(data, "base64"));
    unlinkSync(new URL(file, DIR));
    console.log("webp", file, Math.round(Buffer.from(data, "base64").length / 1024) + " KB", "from", Math.round(readFileSync(out).length / 1024));
  }
} finally {
  ws.close();
  browser.kill();
}
