// check-dist: the built package must make no network request of its own.
// Scans every file in dist/ for network APIs and for any URL / domain; the
// few hits that are not requests are allow-listed below with the reason.
// Usage: node scripts/check-dist.mjs [dir]   (exit 1 on anything unexpected)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const dir = process.argv[2] || new URL("../dist", import.meta.url).pathname;

// Network APIs and loaders. Any hit fails.
const API = [
  /\bfetch\b/g, /XMLHttpRequest/g, /sendBeacon/g, /WebSocket/g, /EventSource/g, /importScripts/g,
  /\bnew\s+Worker\b/g, /SharedWorker/g, /serviceWorker/g, /RTCPeerConnection/g, /\bimport\s*\(/g,
  /\/api\//g, /new\s+Image\b/g, /document\.cookie/g, /window\.open\b/g, /\.src\s*=/g, /\burl\s*\(/g,
];
// URLs and things that look like domains.
const URLS = /\b(?:https?|wss?|ftp):\/\/[^\s"'`)<>]+|(?<![\w.])\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi;
const ALLOW = new Map([
  ["http://www.w3.org/1999/xhtml", "XML namespace string passed to document.createElementNS (three.js, creating a <canvas>); not a request"],
]);

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(dir);

let bad = 0;
const allowed = new Map();
for (const f of files) {
  const name = relative(dir, f);
  if (!/\.(js|css|html|json|txt|svg)$/i.test(f)) {
    console.log(`binary  ${name} (${statSync(f).size} B) — not scanned`);
    continue;
  }
  const s = readFileSync(f, "utf8");
  for (const re of API) {
    for (const m of s.matchAll(re)) {
      bad++;
      console.log(`FAIL    ${name}: ${re} → …${s.slice(Math.max(0, m.index - 50), m.index + 40)}…`);
    }
  }
  for (const m of s.matchAll(URLS)) {
    const u = m[0];
    if (ALLOW.has(u)) {
      allowed.set(u, (allowed.get(u) || 0) + 1);
      continue;
    }
    bad++;
    console.log(`FAIL    ${name}: URL ${u} → …${s.slice(Math.max(0, m.index - 50), m.index + 60)}…`);
  }
  if (name.endsWith(".html")) {
    for (const m of s.matchAll(/(?:src|href)="([^"]*)"/g)) {
      if (!m[1].startsWith("./")) {
        bad++;
        console.log(`FAIL    ${name}: non-relative reference ${m[1]}`);
      }
    }
  }
  console.log(`scanned ${name} (${statSync(f).size} B)`);
}
for (const [u, n] of allowed) console.log(`allowed ${u} ×${n}: ${ALLOW.get(u)}`);
console.log(bad ? `\n${bad} problem(s)` : "\nOK: no network API, no external URL");
process.exit(bad ? 1 : 0);
