// Everything the host may want to change without a rebuild. The host can set
// window.DashenSeatConfig (any subset) before this package's script runs.

export interface Day {
  day: string; // YYYY-MM-DD, the key passed to the adapter
  label: string; // «12.4»
  weekday: string; // «周五»
}

export interface SeatConfig {
  title: string;
  event: string;
  venue: string;
  days: Day[];
  // Preset 头顶标签 a player may wear (no free text: nothing typed by users
  // besides their 大神 nickname ever shows).
  tags: string[];
  // 游戏角色信息 (定位颜色): off until 大神 approves it. When on, an adapter
  // may return seat.role (重装 / 输出 / 支援) and figures are coloured by it.
  showGameRole: boolean;
  // One line of plain-text link at the bottom (e.g. to a third-party site). Empty =
  // nothing rendered. Must be a bare https URL without query or fragment.
  promoLink: string;
  promoText: string;
  // How many figures the 3D hall draws at most (the viewer and their
  // section first); counts per section always use every seat.
  maxFigures: number;
}

export const DEFAULT_CONFIG: SeatConfig = {
  title: "OWCS 2026 广州 · 座位全景图",
  event: "OWCS 2026 全球总决赛",
  venue: "广州体育馆 1 号馆",
  days: [
    { day: "2026-12-04", label: "12.4", weekday: "周五" },
    { day: "2026-12-05", label: "12.5", weekday: "周六" },
    { day: "2026-12-06", label: "12.6", weekday: "周日" },
  ],
  tags: ["第一次来线下", "一个人来的", "带了应援物", "求合影", "坐等开赛", "散场一起吃饭"],
  showGameRole: false,
  promoLink: "",
  promoText: "",
  maxFigures: 300,
};

declare global {
  interface Window {
    DashenSeatConfig?: Partial<SeatConfig>;
  }
}

// safeLink keeps a promo link only when it is a bare https URL.
function safeLink(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !u.search && !u.hash && !u.username ? u.href : "";
  } catch {
    return "";
  }
}

export function loadConfig(): SeatConfig {
  const over = (typeof window !== "undefined" && window.DashenSeatConfig) || {};
  const c: SeatConfig = { ...DEFAULT_CONFIG, ...over };
  if (!Array.isArray(c.days) || !c.days.length) c.days = DEFAULT_CONFIG.days;
  if (!Array.isArray(c.tags)) c.tags = DEFAULT_CONFIG.tags;
  c.promoLink = c.promoLink ? safeLink(String(c.promoLink)) : "";
  c.showGameRole = c.showGameRole === true;
  return c;
}
