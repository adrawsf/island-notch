// Takes the landing page screenshots (docs/shots/*.png) from the dev server's
// browser mode (sample data), with transparent backgrounds at 2x.
//
//   npx vite --port 1499 --strictPort      (in another terminal)
//   node scripts/screenshots.mjs
//   node scripts/to-webp.mjs
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.SHOT_BASE ?? "http://localhost:1499";
const OUT = new URL("../docs/shots/", import.meta.url);
const BROWSER =
  process.env.SHOT_BROWSER ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9444;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const browser = spawn(BROWSER, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "notch-shots-"))}`,
  "--hide-scrollbars",
  "--no-first-run",
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
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
const run = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};

async function open(path, width = 1280, height = 900) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false });
  await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send("Page.navigate", { url: BASE + path });
  await sleep(4000);
}

/** Screenshot of an element (plus `pad` px around it, for the shadow). */
async function shot(name, selector, pad = 36) {
  const rect = await run(`(() => {
    const el = ${selector};
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  })()`);
  if (!rect) throw new Error(`${name}: element not found`);
  const x = Math.max(0, rect.x - pad);
  const y = Math.max(0, rect.y - pad / 3);
  const clip = { x, y, width: rect.width + pad * 2, height: rect.height + pad, scale: 1 };
  const { data } = await send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: true });
  writeFileSync(new URL(`${name}.png`, OUT), Buffer.from(data, "base64"));
  console.log("saved", name, `${Math.round(clip.width)}x${Math.round(clip.height)}`);
}

const NOTCH = `document.querySelector('.glass')?.parentElement`;
const settings = `await import('/src/core/settings/settings.ts')`;
const tab = (label) =>
  run(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === ${JSON.stringify(label)} || b.dataset.tip === ${JSON.stringify(label)}); b?.click(); return !!b; })()`);

try {
  // ---------- The notch ----------
  await open("/");
  await sleep(3000); // the welcome toast goes away

  // Sample notes and a teleprompter script (the browser keeps them in memory).
  await run(`(async () => {
    const n = await import('/src/features/notes/notesStore.ts');
    const a = n.createNote('checklist'); n.setTitle(a, 'Belanja mingguan');
    for (const t of ['Kopi susu', 'Roti gandum', 'Sabun cuci', 'Buah naga']) n.addItem(a, t);
    const b = n.createNote('text'); n.setTitle(b, 'Ide konten');
    n.setText(b, 'Video singkat: setup meja kerja minimalis dengan notch di layar.');
    const c = n.createNote('text'); n.setTitle(c, 'Rapat Senin');
    n.setText(c, 'Bahas rilis v0.2, cek masukan pengguna, bagi tugas desain.');
    const t = await import('/src/features/teleprompter/teleprompterStore.ts');
    const s = t.createScript(); t.updateScript(s, { title: 'Pembuka podcast', body: 'Halo semuanya, selamat datang kembali di episode minggu ini!' });
    const s2 = t.createScript(); t.updateScript(s2, { title: 'Presentasi produk', body: 'Hari ini kami mau menunjukkan cara kerja yang lebih fokus.' });
  })()`);

  await shot("pill-lyrics", NOTCH);

  await run(`(async () => { const s = ${settings}; s.updateSetting('idleShowsMedia', false); s.updateSetting('idleWidgets', ['clock', 'date', 'cpu', 'battery']); })()`);
  await sleep(1500);
  await shot("pill-widgets", NOTCH);

  await run(`(async () => { const s = ${settings}; s.updateSetting('idleWidgets', ['clock', 'pet']); s.updateSetting('notchDndUntil', -1); })()`);
  await sleep(1500);
  await shot("pill-dnd", NOTCH);
  await run(`(async () => { const s = ${settings}; s.updateSetting('notchDndUntil', 0); s.updateSetting('idleWidgets', ['clock']); s.updateSetting('idleShowsMedia', true); })()`);

  await run(`(async () => {
    const { showToast } = await import('/src/core/toast/toastQueue.ts');
    const icon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#25D366"/><path d="M32 14a18 18 0 0 0-15.6 27L14 50l9.2-2.4A18 18 0 1 0 32 14z" fill="#fff"/></svg>');
    window.__demoToast = showToast({ title: 'Rina', body: 'Jadi berangkat jam berapa? Aku udah di stasiun.', icon, durationMs: 20000, source: 'windows' });
  })()`);
  await sleep(1800);
  await shot("toast", NOTCH);
  await run(`(async () => { const q = await import('/src/core/toast/toastQueue.ts'); q.dismissToast(window.__demoToast); })()`);
  await sleep(1500);

  // Expanded tabs.
  await run(`(async () => { const s = ${settings}; s.updateSetting('worldClocks', ['Asia/Tokyo', 'Europe/London', 'America/New_York']); s.updateSetting('homeCards', ['clock', 'worldClocks', 'pet']); })()`);
  await run(`document.querySelector('.glass button')?.click()`);
  await sleep(1200);
  const tabs = [
    ["Beranda", "tab-home"],
    ["Media", "tab-media"],
    ["Notifikasi", "tab-notifications"],
    ["Suara", "tab-sound"],
    ["Sistem", "tab-system"],
    ["Catatan", "tab-notes"],
    ["Clipboard", "tab-clipboard"],
    ["Shelf", "tab-shelf"],
    ["Pomodoro", "tab-pomodoro"],
    ["Prompter", "tab-teleprompter"],
  ];
  for (const [label, name] of tabs) {
    if (!(await tab(label))) {
      console.warn("no tab", label);
      continue;
    }
    await sleep(1800);
    await shot(name, NOTCH);
    if (label === "Media") {
      await run(`document.querySelector('[aria-label="Tampilkan lirik"]')?.click()`);
      await sleep(1800);
      await shot("tab-media-lyrics", NOTCH);
      await run(`document.querySelector('[aria-label="Tampilkan info lagu"]')?.click()`);
    }
  }

  // ---------- Other windows ----------
  await open("/settings.html", 728, 528);
  await shot("settings", `document.querySelector('.glass') ?? document.body.firstElementChild`, 0);
  await open("/miniplayer.html", 600, 700);
  await shot("miniplayer", `document.querySelector('.glass') ?? document.body.firstElementChild`, 0);
} finally {
  ws.close();
  browser.kill();
}
