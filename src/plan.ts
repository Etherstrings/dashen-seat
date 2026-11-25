import { hash, LAYOUT, OVAL, RING } from "./layout";

// The hall from above on a 2D canvas: the 座位海报's floor plan, and the
// whole page when the web-view has no WebGL. A player's dot sits where the
// 3D hall stands them (same hash, same row), so the pictures agree.

export interface Part {
  name: string;
  a0: number;
  a1: number;
  r0: number;
  r1: number;
  rows: number;
}
export const PARTS: Part[] = LAYOUT.flatMap(([ring, list]) => list.map(([a0, a1, name]) => ({ name, a0, a1, r0: RING[ring][0], r1: RING[ring][1], rows: RING[ring][4] })));
export const partsOf = (name: string) => PARTS.filter((p) => p.name === name);
// maxRow is how many rows a section has (by the layout's estimate).
export const maxRow = (name: string) => Math.max(0, ...partsOf(name).map((p) => p.rows));
export const OUTER = 11.3; // the outermost radius, hall units

export interface PlanView {
  cx: number;
  cy: number;
  s: number; // pixels per hall unit
}

export interface PlanData {
  counts: Record<string, number>;
  mine?: { section: string; row?: number; key: string };
  others: { key: string; section: string; row?: number; color?: string }[];
}

const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
export const GOLD = "#FFD60A";
export const font = (size: number, weight = 800) => `${weight} ${size}px ${FONT}`;

const pt = (v: PlanView, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [v.cx + r * OVAL * Math.cos(a) * v.s, v.cy + r * Math.sin(a) * v.s];
};

export function spot(v: PlanView, key: string, section: string, row?: number): [number, number] | null {
  const parts = partsOf(section);
  if (!parts.length) return null;
  const part = parts[Math.floor(hash(key, 1) * parts.length)];
  const r = Math.min(part.rows, Math.max(1, row || 1 + Math.floor(hash(key, 2) * part.rows)));
  const radius = part.r0 + ((part.r1 - part.r0) * (r - 0.45)) / part.rows;
  const a = part.a0 + 0.9 + (part.a1 - part.a0 - 1.8) * hash(key, 3);
  return pt(v, radius, a);
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function sector(ctx: CanvasRenderingContext2D, v: PlanView, p: Part) {
  const steps = Math.max(4, Math.round((p.a1 - p.a0) / 2));
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const [x, y] = pt(v, p.r1, p.a0 + ((p.a1 - p.a0) * i) / steps);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = steps; i >= 0; i--) {
    const [x, y] = pt(v, p.r0, p.a0 + ((p.a1 - p.a0) * i) / steps);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// heat goes from a dim teal to a bright one as a section fills up (gold is
// the viewer's section alone).
function heat(n: number, top: number) {
  const t = Math.min(1, 0.2 + (0.8 * n) / top);
  const a = [0x1d, 0x4b, 0x57], b = [0x3f, 0xc6, 0xcf];
  return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * t)).join(",")})`;
}

// drawPlan paints the hall; `selected` outlines one section (the fallback's
// tapped section). k scales every mark to the plan's size.
export function drawPlan(ctx: CanvasRenderingContext2D, v: PlanView, d: PlanData, selected?: string) {
  const k = v.s / 31.5;
  const px = (n: number, min = 0) => Math.max(min, n * k);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(v.cx, v.cy, 5.25 * OVAL * v.s, 5.25 * v.s, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#151b28";
  ctx.fill();
  const top = Math.max(1, ...Object.values(d.counts));
  ctx.lineJoin = "round";
  for (const p of PARTS) {
    sector(ctx, v, p);
    const n = d.counts[p.name] || 0;
    ctx.fillStyle = p.name === d.mine?.section ? GOLD : n ? heat(n, top) : "#2a313d";
    ctx.fill();
    ctx.strokeStyle = "#0c1018";
    ctx.lineWidth = px(4, 1);
    ctx.stroke();
  }
  if (selected) {
    for (const p of partsOf(selected)) {
      sector(ctx, v, p);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = px(6, 2);
      ctx.stroke();
    }
  }
  // The stage.
  roundRect(ctx, v.cx - 1.8 * v.s * OVAL, v.cy - 0.85 * v.s, 3.6 * v.s * OVAL, 1.7 * v.s, px(10, 3));
  ctx.fillStyle = "#0b0b0e";
  ctx.fill();
  ctx.strokeStyle = "#1fb5c1";
  ctx.lineWidth = px(4, 1);
  ctx.stroke();
  ctx.fillStyle = "#7fe6ee";
  ctx.font = font(px(30, 10), 900);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("舞台", v.cx, v.cy);
  // The others, as dots.
  for (const o of d.others) {
    const at = spot(v, o.key, o.section, o.row);
    if (!at) continue;
    ctx.beginPath();
    ctx.arc(at[0], at[1], px(8, 2.5), 0, Math.PI * 2);
    ctx.fillStyle = o.color || "#d6dce6";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = px(2.5, 0.8);
    ctx.stroke();
  }
  // Section names, once each.
  const seen = new Set<string>();
  for (const name of PARTS.map((p) => p.name)) {
    if (seen.has(name)) continue;
    seen.add(name);
    const parts = partsOf(name);
    const p = parts[Math.floor((parts.length - 1) / 2)];
    const [x, y] = pt(v, (p.r0 + p.r1) / 2, parts.length % 2 ? (p.a0 + p.a1) / 2 : p.a1);
    ctx.font = font(px(p.r1 - p.r0 < 1.2 ? 18 : 24, 8), 900);
    const mine = name === d.mine?.section;
    ctx.lineWidth = px(5, 2);
    ctx.strokeStyle = mine ? "#fff3b0" : "#0c1018cc";
    ctx.strokeText(name, x, y);
    ctx.fillStyle = mine ? "#17140a" : d.counts[name] ? "#ffffff" : "#ffffff70";
    ctx.fillText(name, x, y);
  }
  // Me: a gold pin with a pulse and «我在这».
  const me = d.mine && spot(v, d.mine.key, d.mine.section, d.mine.row);
  if (me) {
    const [x, y] = me;
    for (const [r, a] of [[46, "33"], [30, "66"]] as [number, string][]) {
      ctx.beginPath();
      ctx.arc(x, y, px(r, r / 3), 0, Math.PI * 2);
      ctx.fillStyle = GOLD + a;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, px(17, 5), 0, Math.PI * 2);
    ctx.fillStyle = GOLD;
    ctx.fill();
    ctx.strokeStyle = "#17140a";
    ctx.lineWidth = px(5, 1.5);
    ctx.stroke();
    const label = "我在这";
    const fs = px(34, 11);
    ctx.font = font(fs, 900);
    const lw = ctx.measureText(label).width + fs;
    const lh = fs * 1.65;
    const gap = px(62, 18);
    const planTop = v.cy - OUTER * v.s - px(20, 6);
    const up = y - gap - lh > planTop;
    const ly = up ? y - gap - lh : y + gap;
    const lx = Math.min(v.cx + OUTER * OVAL * v.s - lw, Math.max(v.cx - OUTER * OVAL * v.s, x - lw / 2));
    roundRect(ctx, lx, ly, lw, lh, lh * 0.28);
    ctx.fillStyle = GOLD;
    ctx.fill();
    ctx.beginPath();
    const tip = up ? ly + lh : ly;
    const tw = px(12, 4);
    ctx.moveTo(x - tw, tip);
    ctx.lineTo(x + tw, tip);
    ctx.lineTo(x, up ? tip + tw * 1.3 : tip - tw * 1.3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#17140a";
    ctx.fillText(label, lx + lw / 2, ly + lh / 2);
  }
  ctx.restore();
}

// sectionAt is the section under a point of the plan, if any.
export function sectionAt(v: PlanView, x: number, y: number): string | null {
  const dx = (x - v.cx) / (v.s * OVAL), dy = (y - v.cy) / v.s;
  const r = Math.hypot(dx, dy);
  let a = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (a < 0) a += 360;
  const hit = PARTS.find((p) => r >= p.r0 - 0.15 && r <= p.r1 + 0.15 && a >= p.a0 && a < p.a1);
  return hit ? hit.name : null;
}
