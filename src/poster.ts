import { drawPlan, font, GOLD, roundRect, type PlanData } from "./plan";

// 座位海报 (1080 × 1720), drawn on a local canvas: «我在 FF 区 3 排», the hall
// from above with the viewer's section lit and everyone else as dots (no
// names but the viewer's own), how many share the section. No images, no
// QR code, nothing fetched.

export interface PosterData extends PlanData {
  title: string; // «OWCS 2026 全球总决赛 · 广州»
  venue: string;
  dayText: string; // «12.5 周六»
  name: string;
  section: string;
  row?: number;
  near: number; // others in the same section
  total: number; // everyone that day, the viewer included
}

const W = 1080;
const H = 1720;
const S = 31.5;
const CX = W / 2;
const CY = 900;

function fit(ctx: CanvasRenderingContext2D, text: string, size: number, min: number, width: number, weight = 900) {
  let s = size;
  ctx.font = font(s, weight);
  while (s > min && ctx.measureText(text).width > width) {
    s -= 4;
    ctx.font = font(s, weight);
  }
  return s;
}

export function drawPoster(canvas: HTMLCanvasElement, d: PosterData) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1c1606");
  bg.addColorStop(0.3, "#101319");
  bg.addColorStop(1, "#0c1220");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const X = 80;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // The badge.
  ctx.font = font(30, 800);
  const bw = ctx.measureText(d.title).width + 40;
  roundRect(ctx, X, 80, bw, 56, 12);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.fillStyle = "#17171d";
  ctx.fillText(d.title, X + 20, 119);

  // «我在 FF 区 3 排», the section biggest.
  ctx.fillStyle = "#ffffff";
  ctx.font = font(64, 900);
  ctx.fillText("我在", X, 250);
  const rest = d.row ? `区 ${d.row} 排` : "区";
  ctx.font = font(110, 900);
  const restW = ctx.measureText(rest).width;
  ctx.fillStyle = GOLD;
  const big = fit(ctx, d.section, 220, 120, W - X * 2 - restW - 24);
  const base = 250 + big * 0.86;
  ctx.fillText(d.section, X - 6, base);
  const sw = ctx.measureText(d.section).width;
  ctx.fillStyle = "#ffffff";
  ctx.font = font(110, 900);
  ctx.fillText(rest, X + sw + 18, base);
  ctx.fillStyle = "#cfd5df";
  ctx.font = font(36, 700);
  ctx.fillText(`${d.dayText} · ${d.venue}`, X, base + 72);

  // The floor plan.
  roundRect(ctx, 40, CY - 385, W - 80, 770, 36);
  ctx.fillStyle = "#ffffff0a";
  ctx.fill();
  drawPlan(ctx, { cx: CX, cy: CY, s: S }, d);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // How many around.
  let y = CY + 385 + 100;
  ctx.fillStyle = "#ffffff";
  if (d.near > 0) {
    ctx.font = font(54, 900);
    const lead = `${d.section} 区还有 `;
    ctx.fillText(lead, X, y);
    let x = X + ctx.measureText(lead).width;
    ctx.fillStyle = GOLD;
    ctx.font = font(72, 900);
    ctx.fillText(String(d.near), x, y + 2);
    x += ctx.measureText(String(d.near)).width;
    ctx.fillStyle = "#ffffff";
    ctx.font = font(54, 900);
    ctx.fillText(" 位玩家", x, y);
  } else {
    const t = `${d.section} 区我是第一个，等你来坐旁边`;
    fit(ctx, t, 54, 36, W - X * 2);
    ctx.fillText(t, X, y);
  }
  y += 62;
  ctx.fillStyle = "#9aa3b2";
  ctx.font = font(32, 600);
  ctx.fillText(`${d.dayText} 全场 ${d.total} 位玩家选了座位 · 只到区/排，没有座号`, X, y);

  // Who.
  const fy = H - 130;
  ctx.strokeStyle = "#ffffff1f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(X, fy - 60);
  ctx.lineTo(W - X, fy - 60);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  fit(ctx, d.name, 44, 30, W - X * 2, 800);
  ctx.fillText(d.name, X, fy);
  ctx.fillStyle = "#9aa3b2";
  ctx.font = font(28, 500);
  ctx.fillText("网易大神 · 座位全景图 · 看看谁坐你旁边", X, fy + 50);
}
