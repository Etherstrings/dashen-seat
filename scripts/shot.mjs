// shot: open dist/index.html from file:// in headless Chrome (no window, no
// focus taken), walk 试玩模式 选座 → 3D/平面 → 海报, screenshot each step and
// log every request the page makes. Anything but file:/data: fails.
// Usage: node scripts/shot.mjs [--no-webgl] [--out shots]
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const noGL = process.argv.includes("--no-webgl");
const out = resolve(process.argv[process.argv.indexOf("--out") + 1] && process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "shots");
const tag = noGL ? "nowebgl" : "webgl";
mkdirSync(out, { recursive: true });
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const page = pathToFileURL(resolve("dist/index.html")).href;
const port = 9400 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), "dashen-seat-"));
const args = [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
  "--disable-background-networking", "--disable-component-update", "--disable-sync", "--hide-scrollbars", "--window-size=390,844",
  ...(noGL ? ["--disable-webgl", "--disable-3d-apis", "--disable-gpu"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]),
  "about:blank",
];
const chrome = spawn(CHROME, args, { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(path) {
  for (let i = 0; i < 50; i++) {
    try {
      return await (await fetch(`http://127.0.0.1:${port}${path}`)).json();
    } catch {
      await sleep(200);
    }
  }
  throw new Error("chrome did not start");
}

let ws, seq = 0;
const waiting = new Map();
const requests = [];
const consoleLines = [];
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((ok, fail) => waiting.set(id, { ok, fail }));
}
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
async function until(expr, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await evaluate(expr).catch(() => false)) return;
    await sleep(100);
  }
  throw new Error("timeout: " + expr);
}
let n = 0;
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const f = join(out, `${tag}-${String(++n).padStart(2, "0")}-${name}.png`);
  writeFileSync(f, Buffer.from(data, "base64"));
  console.log("shot", f);
}
const click = (sel, text) => evaluate(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})]; const el = els.find((e) => ${text ? `e.textContent.includes(${JSON.stringify(text)})` : "true"}); if (!el) throw new Error("no " + ${JSON.stringify(sel + " " + (text || ""))}); el.click(); return true; })()`);
const choose = (sel, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event("change", { bubbles: true })); return el.value; })()`);

try {
  await json("/json/version");
  // A background target (no focus); headless has no window anyway.
  const target = await new Promise(async (ok) => {
    const list = await json("/json/list");
    ok(list.find((t) => t.type === "page"));
  });
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok) => (ws.onopen = ok));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) {
      const w = waiting.get(m.id);
      waiting.delete(m.id);
      m.error ? w.fail(new Error(m.error.message)) : w.ok(m.result);
    } else if (m.method === "Network.requestWillBeSent") requests.push(m.params.request.url);
    else if (m.method === "Runtime.consoleAPICalled") consoleLines.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    else if (m.method === "Runtime.exceptionThrown") consoleLines.push("exception: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  };
  await send("Network.enable");
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await send("Page.navigate", { url: page });
  await until(`document.querySelector("#veil")?.hidden === true`);
  const mode = await evaluate(`document.querySelector("#c2d").hidden ? "3d" : "2d"`);
  const gl = await evaluate(`(() => { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); })()`);
  console.log(`webgl available: ${gl}; page shows: ${mode}; demo badge: ${await evaluate(`!!document.querySelector(".badge")`)}`);
  await sleep(1800);
  await shot("home");

  await click(".actions .btn", "选我的座位");
  await until(`!!document.querySelector("#f-section")`);
  await choose("#f-section", "FF");
  await choose("#f-row", "3");
  await click(".sheet .chip", "求合影");
  await click(".pick", "12.6"); // 12.4 is checked (first day), add 12.6
  await sleep(200);
  await shot("bind");
  await click(".sheet .btn-primary");
  await until(`document.querySelector("#sheet").hidden && document.querySelector(".near") !== null`);
  await sleep(2600); // the camera flies to the seat
  await shot("seated");

  // A neighbour's card (3D: tap a figure; 2D: tap the section chip).
  if (mode === "3d") await evaluate(`(() => { const f = [...document.querySelectorAll(".pfig:not(.me)")].find((e) => e.style.display !== "none"); f?.click(); return !!f; })()`);
  else await click(".chips .chip", "FF 区");
  await sleep(500);
  await shot(mode === "3d" ? "figure-card" : "section-list");
  await evaluate(`document.querySelector(".sheet .x")?.click()`);

  if (mode === "3d") {
    await click(".tools button", "平面图");
    await sleep(400);
    await shot("flat-plan");
    await click(".tools button", "看 3D");
  }

  await click(".actions .btn", "生成座位海报");
  await until(`!!document.querySelector(".sheet img.poster")?.complete`);
  await sleep(300);
  await shot("poster");
  const poster = await evaluate(`document.querySelector(".sheet img.poster").src`);
  writeFileSync(join(out, `${tag}-poster-full.png`), Buffer.from(poster.split(",")[1], "base64"));
  await evaluate(`document.querySelector(".sheet .x").click()`);

  // Saved on this device: a reload keeps the seat and opens on its day.
  await send("Page.reload");
  await sleep(300);
  await until(`document.querySelector("#veil")?.hidden === true`);
  const kept = await evaluate(`document.querySelector(".sum")?.textContent`);
  console.log("after reload:", kept);

  // A host adapter injected late (DashenSeat.setAdapter): leaves 试玩模式,
  // lists the host's seats, «私信» calls openChat with the user id.
  await evaluate(`(() => {
    const seats = { "2026-12-05": [{ id: "u1", nickname: "宿主用户甲", section: "AA", row: 2, tag: "求合影", extra: "dropped" }, { id: "u2", nickname: "<b>宿主用户乙</b>", section: "AA" }, { id: "me1", nickname: "宿主的我", section: "AA", row: 3 }, { id: "bad", nickname: "x", section: "ZZ" }] };
    window.__chats = [];
    window.DashenSeat.setAdapter({
      getProfile: async () => ({ id: "me1", nickname: "宿主的我" }),
      listSeats: async (d) => seats[d] || [],
      saveSeat: async () => {},
      removeSeat: async () => {},
      openChat: (id) => window.__chats.push(id),
    });
    return true;
  })()`);
  await until(`!document.querySelector(".badge") && document.querySelector("#veil").hidden && document.querySelector(".sum")?.textContent.includes("12.5")`);
  await sleep(2200);
  await shot("host-adapter");
  await click(".near button", "私信");
  const host = await evaluate(`({ sum: document.querySelector(".sum").textContent, near: [...document.querySelectorAll(".near li b")].map((b) => b.textContent), chats: window.__chats, html: document.querySelector(".near").innerHTML.includes("<b>宿主用户乙</b>") })`);
  console.log("host adapter:", JSON.stringify(host));
  if (host.chats[0] !== "u1" || host.html) {
    console.log("FAIL: host adapter path");
    process.exitCode = 1;
  }

  const outside = requests.filter((u) => !/^(file|data|blob):/.test(u));
  console.log(`requests: ${requests.length} total; schemes: ${[...new Set(requests.map((u) => u.split(":")[0]))].join(", ")}`);
  for (const u of requests) console.log("  ", u.length > 100 ? u.slice(0, 100) + "…" : u);
  if (consoleLines.length) console.log("console:\n  " + consoleLines.join("\n  "));
  if (outside.length) {
    console.log("FAIL: requests outside the package:", outside);
    process.exitCode = 1;
  } else console.log("OK: every request stayed inside the package (file:/data:)");
} catch (e) {
  console.error("FAIL", e);
  await shot("error").catch(() => {});
  process.exitCode = 1;
} finally {
  ws?.close();
  chrome.kill();
}
