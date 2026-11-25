// The one seam to the host: 大神 injects window.DashenSeatAdapter (its own
// account, storage and 私信). Without it the package runs as 试玩模式 on
// localStorage and a few made-up players, so the whole flow works offline.
// This package itself never talks to any network.

import { SECTION_NAMES } from "./layout";

export interface Profile {
  id: string;
  nickname: string;
}

export interface SeatRecord {
  id: string; // the host's user id (passed back to openChat)
  nickname: string;
  section: string;
  row?: number;
  tag?: string; // optional: one of config.tags
  role?: string; // optional, only shown when config.showGameRole is on
}

export interface DashenAdapter {
  getProfile(): Promise<Profile>;
  listSeats(day: string): Promise<SeatRecord[]>;
  // tag is an optional 4th argument; an adapter that ignores it still works.
  saveSeat(day: string, section: string, row?: number, tag?: string): Promise<void>;
  removeSeat(day: string): Promise<void>;
  openChat?(userId: string): void;
}

declare global {
  interface Window {
    DashenSeatAdapter?: DashenAdapter;
  }
}

// --- 试玩模式 -------------------------------------------------------------

const KEY = "dashen-seat:demo:v1";
const memory: Record<string, string> = {};
const store = {
  get(): Record<string, { section: string; row?: number; tag?: string }> {
    try {
      return JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem(KEY)) || memory[KEY] || "{}");
    } catch {
      return JSON.parse(memory[KEY] || "{}");
    }
  },
  set(v: object) {
    const s = JSON.stringify(v);
    memory[KEY] = s;
    try {
      localStorage.setItem(KEY, s);
    } catch {
      // Storage off (private mode, some web-views): keep it for this visit.
    }
  },
};

// Made-up players: fixed names, spread over the hall the same way every load.
const FAKE_NAMES = ["试玩·小天使", "试玩·奶妈本妈", "试玩·广州土著", "试玩·坐高铁来的", "试玩·盾就是我", "试玩·C 位观众", "试玩·半场应援", "试玩·一个人来", "试玩·拍照担当", "试玩·吃饭搭子", "试玩·夜猫子", "试玩·第一次线下", "试玩·老观众", "试玩·快跑选手", "试玩·前排举牌", "试玩·喊麦担当", "试玩·深圳过来", "试玩·佛山队友", "试玩·只看决赛", "试玩·熬夜党", "试玩·奶茶续命", "试玩·二楼看台", "试玩·灯牌在手", "试玩·散场约饭"];
const HOT = ["FF", "FF", "AA", "AA", "BB", "F", "A", "GG", "EE", "E", "B", "JJ"];

function rand(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function fakeSeats(day: string, tags: string[]): SeatRecord[] {
  const r = rand(day.split("-").reduce((a, b) => a * 31 + Number(b), 7));
  const n = 14 + Math.floor(r() * 9);
  const roles = ["重装", "输出", "支援"];
  return FAKE_NAMES.slice(0, n).map((nickname, i) => {
    const section = r() < 0.65 ? HOT[Math.floor(r() * HOT.length)] : SECTION_NAMES[Math.floor(r() * SECTION_NAMES.length)];
    return {
      id: `demo-${i}`,
      nickname,
      section,
      row: r() < 0.6 ? 1 + Math.floor(r() * 6) : undefined,
      tag: r() < 0.45 ? tags[Math.floor(r() * tags.length)] : undefined,
      role: roles[i % 3],
    };
  });
}

export function demoAdapter(tags: string[]): DashenAdapter {
  const me: Profile = { id: "demo-me", nickname: "试玩的我" };
  const wait = <T,>(v: T) => new Promise<T>((ok) => setTimeout(() => ok(v), 120));
  return {
    getProfile: () => wait(me),
    async listSeats(day) {
      const mine = store.get()[day];
      const list = fakeSeats(day, tags);
      return wait(mine ? [...list, { id: me.id, nickname: me.nickname, ...mine }] : list);
    },
    async saveSeat(day, section, row, tag) {
      const all = store.get();
      all[day] = { section, row: row || undefined, tag: tag || undefined };
      store.set(all);
      await wait(null);
    },
    async removeSeat(day) {
      const all = store.get();
      delete all[day];
      store.set(all);
      await wait(null);
    },
    // No openChat: made-up players can't be messaged.
  };
}

// resolveAdapter picks the host's adapter when it is there and whole.
export function resolveAdapter(tags: string[]): { adapter: DashenAdapter; demo: boolean } {
  const a = typeof window !== "undefined" ? window.DashenSeatAdapter : undefined;
  const ok = !!a && ["getProfile", "listSeats", "saveSeat", "removeSeat"].every((k) => typeof (a as unknown as Record<string, unknown>)[k] === "function");
  return ok ? { adapter: a!, demo: false } : { adapter: demoAdapter(tags), demo: true };
}

// clean drops anything a host might hand back beyond what we show, and
// anything malformed, so a bad record can't break the page.
export function cleanSeats(list: unknown, tags: string[]): SeatRecord[] {
  if (!Array.isArray(list)) return [];
  const out: SeatRecord[] = [];
  for (const x of list as Record<string, unknown>[]) {
    if (!x || typeof x !== "object") continue;
    const section = String(x.section ?? "");
    if (!SECTION_NAMES.includes(section)) continue;
    const row = Number(x.row);
    const tag = typeof x.tag === "string" && tags.includes(x.tag) ? x.tag : undefined;
    const role = typeof x.role === "string" && ["重装", "输出", "支援"].includes(x.role) ? x.role : undefined;
    out.push({ id: String(x.id ?? ""), nickname: String(x.nickname ?? "").slice(0, 24) || "大神玩家", section, row: Number.isInteger(row) && row > 0 && row < 100 ? row : undefined, tag, role });
  }
  return out;
}
