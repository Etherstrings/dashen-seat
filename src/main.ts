import "./style.css";
import { cleanSeats, resolveAdapter, type DashenAdapter, type Profile, type SeatRecord } from "./adapter";
import { loadConfig, type Day } from "./config";
import { OVAL, SECTION_NAMES } from "./layout";
import { drawPlan, maxRow, OUTER, sectionAt, type PlanView } from "./plan";
import { drawPoster } from "./poster";
import { createPanorama, type Figure, type Panorama } from "./scene";

// OWCS 广州 · 座位全景图 for the 网易大神 小游戏专区. Everything here runs in
// the page: the host's adapter (window.DashenSeatAdapter) does accounts,
// storage and 私信; without one it is 试玩模式 on localStorage. No request
// leaves this package — no fetch, no XHR, no images, fonts or scripts from
// anywhere.

const cfg = loadConfig();
let { adapter, demo } = resolveAdapter(cfg.tags);

// --- tiny DOM helper -------------------------------------------------------

type Kid = Node | string | number | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, unknown> | null, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else if (k in el && typeof v !== "string") (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(typeof c === "number" ? String(c) : c);
  return el;
}
// fill replaces el's children, skipping the empty ones.
function fill(el: Element, ...kids: Kid[]) {
  el.replaceChildren(...kids.filter((c): c is Node | string | number => c !== null && c !== undefined && c !== false).map((c) => (typeof c === "number" ? String(c) : c)));
}
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

// --- state -------------------------------------------------------------------

const ROLE: Record<string, string> = { 重装: "tank", 输出: "damage", 支援: "support" };
const ROLE_COLOR: Record<string, string> = { 重装: "#4f86f0", 输出: "#f0625e", 支援: "#33c98a" };
const keyOf = (s: SeatRecord) => "u:" + s.id;

let me: Profile | null = null;
let day = cfg.days[0].day;
const byDay = new Map<string, SeatRecord[]>();
let pano: Panorama | null = null;
let flat = false; // the 2D plan instead of the 3D hall
let selected = ""; // the 2D plan's tapped section
let planView: PlanView = { cx: 0, cy: 0, s: 1 };
let status: "loading" | "ready" | "error" = "loading";
let errorText = "";

const dayOf = (d: string) => cfg.days.find((x) => x.day === d) as Day;
const seats = () => byDay.get(day) || [];
const mine = (d = day) => (me ? (byDay.get(d) || []).find((s) => s.id === me!.id) : undefined);
const counts = (list: SeatRecord[]) => list.reduce<Record<string, number>>((m, s) => ((m[s.section] = (m[s.section] || 0) + 1), m), {});
const where = (s: { section: string; row?: number }) => `${s.section} 区${s.row ? ` ${s.row} 排` : ""}`;
// near: others in my section, the closest rows first (no row last).
function near(list: SeatRecord[], m: SeatRecord) {
  return list
    .filter((s) => s.id !== m.id && s.section === m.section)
    .sort((a, b) => (a.row && m.row ? Math.abs(a.row - m.row) : 99) - (b.row && m.row ? Math.abs(b.row - m.row) : 99));
}

// --- the page ------------------------------------------------------------------

function shell() {
  const root = $("#app");
  root.replaceChildren(
    h("header", { class: "top" },
      h("h1", null, cfg.title),
      h("p", { class: "sub" }, `${cfg.event} · ${cfg.venue}`),
      demo && h("span", { class: "badge", title: "没有接入大神账号，数据只存在这台手机里" }, "试玩模式"),
    ),
    h("nav", { class: "days", role: "tablist", id: "days" }),
    h("section", { class: "stage", id: "stage" },
      h("canvas", { class: "c3d", id: "c3d", "aria-label": "3D 场馆，可以拖动、双指缩放" }),
      h("div", { class: "figs", id: "figs" }),
      h("div", { class: "here", id: "here", hidden: true }, "你在这"),
      h("canvas", { class: "c2d", id: "c2d", hidden: true, "aria-label": "场馆平面图，点一个区看这个区的人" }),
      h("div", { class: "tools", id: "tools" }),
      h("div", { class: "veil", id: "veil" }),
    ),
    h("section", { class: "foot", id: "foot" }),
    h("div", { class: "sheet-wrap", id: "sheet", hidden: true }),
  );
}

function renderDays() {
  $("#days").replaceChildren(
    ...cfg.days.map((d) => {
      const m = mine(d.day);
      return h("button", { type: "button", role: "tab", "aria-selected": String(d.day === day), class: d.day === day ? "on" : "", onclick: () => switchDay(d.day) },
        h("b", null, d.label), h("em", null, d.weekday), m && h("i", { class: "dot", title: `已选 ${where(m)}` }));
    }),
  );
}

function renderTools() {
  const m = mine();
  const tools: Kid[] = flat
    ? [pano ? h("button", { type: "button", onclick: () => setFlat(false) }, "看 3D") : h("span", { class: "hint" }, "这台设备显示不了 3D，已换成平面图 · 点一个区看这个区的人")]
    : [
        h("button", { type: "button", disabled: !m, onclick: () => { pano?.spin(false); pano?.flyMe(); } }, "我的位置"),
        h("button", { type: "button", onclick: () => { pano?.spin(false); pano?.flyAll(); } }, "全馆"),
        h("button", { type: "button", onclick: () => pano?.spin(true) }, "转一圈"),
        h("button", { type: "button", onclick: () => setFlat(true) }, "平面图"),
      ];
  fill($("#tools"), ...tools);
}

function renderVeil() {
  const veil = $("#veil");
  veil.hidden = status === "ready";
  veil.replaceChildren(
    status === "loading" ? h("p", null, "正在搭场馆…") : h("div", { class: "err" }, h("p", null, errorText || "没加载出来"), h("button", { type: "button", class: "btn", onclick: () => loadAll() }, "再试一次")),
  );
}

function figures(list: SeatRecord[]): Figure[] {
  const m = mine();
  // The viewer, then their section, then everyone else, up to maxFigures.
  const ordered = m ? [m, ...list.filter((s) => s !== m && s.section === m.section), ...list.filter((s) => s !== m && s.section !== m.section)] : list;
  return ordered.slice(0, cfg.maxFigures).map((s) => ({
    key: keyOf(s),
    name: s.nickname,
    section: s.section,
    row: s.row,
    tag: s.tag,
    role: cfg.showGameRole && s.role ? ROLE[s.role] : undefined,
    me: s === m,
  }));
}

let flown = "";
function renderStage() {
  const list = seats();
  if (pano && !flat) {
    pano.setFigures(figures(list), counts(list));
    // Fly once per day shown: to the viewer's seat, or the whole hall.
    if (flown !== day) {
      flown = day;
      const d = day;
      setTimeout(() => d === day && (mine() ? pano?.flyMe() : pano?.flyAll()), 500);
    }
  }
  if (flat) drawFlat();
}

function drawFlat() {
  const c = $<HTMLCanvasElement>("#c2d");
  const w = c.clientWidth, hh = c.clientHeight;
  if (!w || !hh) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(w * dpr);
  c.height = Math.round(hh * dpr);
  const ctx = c.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, hh);
  const s = Math.min((w - 12) / (2 * OUTER * OVAL), (hh - 12) / (2 * OUTER));
  planView = { cx: w / 2, cy: hh / 2, s };
  const list = seats();
  const m = mine();
  drawPlan(ctx, planView, {
    counts: counts(list),
    mine: m && { key: keyOf(m), section: m.section, row: m.row },
    others: list.filter((x) => x !== m).map((x) => ({ key: keyOf(x), section: x.section, row: x.row, color: cfg.showGameRole && x.role ? ROLE_COLOR[x.role] : undefined })),
  }, selected || undefined);
}

function renderFoot() {
  const list = seats();
  const m = mine();
  const d = dayOf(day);
  const c = counts(list);
  const nearList = m ? near(list, m) : [];
  const foot = $("#foot");
  if (status !== "ready") return foot.replaceChildren();
  fill(foot,
    h("p", { class: "sum" }, `${d.label} ${d.weekday} 共 ${list.length} 位玩家选了座位`, m && ` · 你在 ${where(m)}，同区还有 ${nearList.length} 人`),
    h("div", { class: "actions" },
      h("button", { type: "button", class: "btn btn-primary", onclick: () => openBind() }, m ? "改我的座位" : "选我的座位"),
      m && h("button", { type: "button", class: "btn btn-gold", onclick: () => openPoster() }, "生成座位海报"),
    ),
    m && h("div", { class: "near" },
      h("h2", null, `同在 ${m.section} 区`),
      nearList.length ? h("ul", null, ...nearList.slice(0, 30).map((s) => personRow(s))) : h("p", { class: "muted" }, "这个区还没有别人，等等看。"),
    ),
    h("div", { class: "chips" },
      ...SECTION_NAMES.filter((s) => c[s]).map((s) => h("button", { type: "button", class: "chip" + (m?.section === s ? " on" : ""), onclick: () => showSection(s) }, `${s} 区 · ${c[s]}`)),
    ),
    h("p", { class: "note" }, "只显示大神昵称、你选的区（和排）以及标签；不填座号。分区按公开座位图画，排数是估算的。"),
    cfg.promoLink && h("p", { class: "promo" }, cfg.promoText ? cfg.promoText + " " : "", h("a", { href: cfg.promoLink, target: "_blank", rel: "noopener noreferrer" }, cfg.promoLink)),
  );
}

function personRow(s: SeatRecord) {
  const isMe = s.id === me?.id;
  return h("li", null,
    h("span", { class: "who" }, h("b", null, s.nickname), h("span", { class: "muted" }, where(s)), s.tag && h("span", { class: "tag" }, s.tag)),
    isMe ? h("span", { class: "muted" }, "你") : chatButton(s),
  );
}

function chatButton(s: SeatRecord) {
  if (adapter.openChat && !demo) return h("button", { type: "button", class: "btn btn-small", onclick: () => adapter.openChat!(s.id) }, "私信");
  return h("button", { type: "button", class: "btn btn-small", disabled: true, title: "试玩模式里的是假人" }, "私信");
}

function render() {
  renderDays();
  renderTools();
  renderVeil();
  renderStage();
  renderFoot();
}

// --- sheets ------------------------------------------------------------------

function openSheet(label: string, ...body: Kid[]) {
  const wrap = $("#sheet");
  const card = h("div", { class: "sheet", role: "dialog", "aria-label": label },
    h("button", { type: "button", class: "x", "aria-label": "关闭", onclick: closeSheet }, "×"),
    ...body);
  fill(wrap, h("div", { class: "backdrop", onclick: closeSheet }), card);
  wrap.hidden = false;
  return card;
}
function closeSheet() {
  const wrap = $("#sheet");
  wrap.hidden = true;
  wrap.replaceChildren();
  if (selected) {
    selected = "";
    if (flat) drawFlat();
  }
}

function showPerson(key: string) {
  const s = seats().find((x) => keyOf(x) === key);
  if (!s) return;
  const isMe = s.id === me?.id;
  openSheet(`${s.nickname} 的座位`,
    h("h3", null, isMe ? `${s.nickname}（你）` : s.nickname),
    h("p", { class: "where" }, where(s), s.tag && h("span", { class: "tag" }, s.tag)),
    isMe
      ? h("button", { type: "button", class: "btn btn-primary btn-block", onclick: () => openBind() }, "改我的座位")
      : h("div", { class: "stack" },
          chatButton(s),
          demo && h("p", { class: "muted small" }, "试玩模式里是假人；接入大神后，这里点「私信」走大神站内私信。"),
        ),
  );
}

function showSection(name: string) {
  const list = seats().filter((s) => s.section === name).sort((a, b) => (a.row || 99) - (b.row || 99));
  if (flat) {
    selected = name;
    drawFlat();
  } else pano?.flySection(name);
  if (!list.length) return openSheet(`${name} 区`, h("h3", null, `${name} 区`), h("p", { class: "muted" }, "这个区还没人选。"));
  openSheet(`${name} 区`, h("h3", null, `${name} 区 · ${list.length} 人`), h("ul", { class: "people" }, ...list.slice(0, 100).map(personRow)), list.length > 100 && h("p", { class: "muted small" }, `只列前 100 位。`));
}

function openBind() {
  const current = mine();
  const form = { section: current?.section || "", row: current?.row || 0, tag: current?.tag || "", days: new Set([day]) };
  const dayBoxes = h("div", { class: "pick-days" });
  const sectionSel = h("select", { id: "f-section", onchange: () => { form.section = sectionSel.value; form.row = Math.min(form.row, maxRow(form.section)); rowsFill(); sync(); } },
    h("option", { value: "" }, "选区"),
    ...([["内圈看台", (s: string) => s.length === 2], ["中圈看台", (s: string) => s.length === 1 && s <= "J"], ["外圈看台", (s: string) => s.length === 1 && s > "J"]] as [string, (s: string) => boolean][])
      .map(([label, f]) => h("optgroup", { label }, ...SECTION_NAMES.filter(f).map((s) => h("option", { value: s }, `${s} 区`)))),
  );
  sectionSel.value = form.section;
  const rowSel = h("select", { id: "f-row", onchange: () => { form.row = Number(rowSel.value); sync(); } });
  const rowsFill = () => {
    const n = maxRow(form.section) || 12;
    rowSel.replaceChildren(h("option", { value: "0" }, "不填（只显示到区）"), ...Array.from({ length: n }, (_, i) => h("option", { value: String(i + 1) }, `第 ${i + 1} 排`)));
    rowSel.value = String(form.row || 0);
  };
  rowsFill();
  const tags = h("div", { class: "chips" });
  const save = h("button", { type: "button", class: "btn btn-primary btn-block", onclick: () => submit() }, "确认");
  const msg = h("p", { class: "msg", hidden: true });
  const removeBtn = current ? h("button", { type: "button", class: "link danger", onclick: () => remove() }, `取消 ${dayOf(day).label} 的座位`) : null;
  let armed = false;

  function sync() {
    dayBoxes.replaceChildren(...cfg.days.map((d) => {
      const m = mine(d.day);
      return h("label", { class: "pick" + (form.days.has(d.day) ? " on" : "") },
        h("input", { type: "checkbox", checked: form.days.has(d.day), onchange: (e: Event) => { const on = (e.target as HTMLInputElement).checked; if (on) form.days.add(d.day); else form.days.delete(d.day); sync(); } }),
        h("b", null, `${d.label} ${d.weekday}`), h("span", { class: "muted" }, m ? `现在：${where(m)}` : "还没选"));
    }));
    tags.replaceChildren(...cfg.tags.map((t) => h("button", { type: "button", class: "chip" + (form.tag === t ? " on" : ""), onclick: () => { form.tag = form.tag === t ? "" : t; sync(); } }, t)));
    save.disabled = !form.section || !form.days.size;
    save.textContent = form.days.size > 1 ? `确认，${form.days.size} 天都坐这里` : "确认，放上全景图";
  }

  async function submit() {
    save.disabled = true;
    msg.hidden = true;
    const days = cfg.days.map((d) => d.day).filter((d) => form.days.has(d));
    const failed: string[] = [];
    for (const d of days) {
      try {
        await adapter.saveSeat(d, form.section, form.row || undefined, form.tag || undefined);
      } catch (e) {
        failed.push(`${dayOf(d).label}：${errText(e)}`);
      }
    }
    await Promise.all(days.map(loadDay));
    if (failed.length) {
      msg.textContent = `没保存上 —— ${failed.join("；")}`;
      msg.hidden = false;
      sync();
      render();
      return;
    }
    closeSheet();
    if (!days.includes(day)) day = days[0];
    flown = "";
    render();
    toast(days.length > 1 ? `${days.map((d) => dayOf(d).label).join(" / ")} 都放上全景图了` : "已放上全景图");
  }

  async function remove() {
    if (!armed) {
      armed = true;
      removeBtn!.textContent = `再点一次，确认取消 ${dayOf(day).label} 的座位`;
      return;
    }
    try {
      await adapter.removeSeat(day);
      await loadDay(day);
      closeSheet();
      render();
      toast(`${dayOf(day).label} 的座位已取消`);
    } catch (e) {
      msg.textContent = errText(e);
      msg.hidden = false;
    }
  }

  sync();
  openSheet("选我的座位",
    h("h3", null, current ? "改我的座位" : "选我的座位"),
    h("div", { class: "field" }, h("span", null, "哪几天"), dayBoxes),
    h("div", { class: "fields" },
      h("label", { class: "field" }, h("span", null, "区"), sectionSel),
      h("label", { class: "field" }, h("span", null, "排（可不填）"), rowSel),
    ),
    h("div", { class: "field" }, h("span", null, "头顶标签（可不选）"), tags),
    h("p", { class: "muted small" }, "只填区和排，不填座号。别人能看到的只有：你的大神昵称、区、排（填了才有）和标签。"),
    msg,
    save,
    removeBtn,
  );
}

function openPoster() {
  const m = mine();
  if (!m || !me) return;
  const list = seats();
  const d = dayOf(day);
  const canvas = document.createElement("canvas");
  try {
    drawPoster(canvas, {
      title: `${cfg.event} · 广州`,
      venue: cfg.venue,
      dayText: `${d.label} ${d.weekday}`,
      name: m.nickname,
      section: m.section,
      row: m.row,
      near: near(list, m).length,
      total: list.length,
      counts: counts(list),
      mine: { key: keyOf(m), section: m.section, row: m.row },
      others: list.filter((x) => x !== m).map((x) => ({ key: keyOf(x), section: x.section, row: x.row })),
    });
  } catch {
    return toast("海报没画出来，再试一次");
  }
  const src = canvas.toDataURL("image/png");
  openSheet("座位海报",
    h("h3", null, "座位海报"),
    h("img", { class: "poster", src, alt: `座位海报：${where(m)}` }),
    h("a", { class: "btn btn-primary btn-block", href: src, download: `座位海报-${m.section}区-${d.label}.png` }, "保存图片"),
    h("p", { class: "muted small" }, "保存不了的话，长按图片保存。海报只印你的昵称和区/排，别人只是小圆点，不印名字。"),
  );
}

let toastTimer = 0;
function toast(text: string) {
  let el = document.getElementById("toast");
  if (!el) document.body.append((el = h("div", { id: "toast", class: "toast", role: "status" })));
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove("show"), 2200);
}

const errText = (e: unknown) => (e instanceof Error ? e.message : typeof e === "string" ? e : "出错了");

// --- data ------------------------------------------------------------------

async function loadDay(d: string) {
  byDay.set(d, cleanSeats(await adapter.listSeats(d), cfg.tags));
}

async function loadAll(first = false) {
  status = "loading";
  renderVeil();
  try {
    const p = await adapter.getProfile();
    me = { id: String(p?.id ?? ""), nickname: String(p?.nickname ?? "") };
    await Promise.all(cfg.days.map((d) => loadDay(d.day)));
    if (first) {
      // Open on the viewer's own day: today when they have a seat today,
      // else the first day they have one, else today / the first day.
      const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // 北京时间
      const has = (d: string) => !!mine(d);
      const ds = cfg.days.map((d) => d.day);
      day = (ds.includes(today) && has(today) && today) || ds.find(has) || (ds.includes(today) ? today : ds[0]);
    }
    status = "ready";
  } catch (e) {
    status = "error";
    errorText = errText(e);
  }
  render();
}

async function switchDay(d: string) {
  if (d === day) return;
  day = d;
  selected = "";
  render();
}

// --- 3D / 2D -------------------------------------------------------------------

function setFlat(on: boolean) {
  flat = on;
  $("#c3d").hidden = on;
  $("#figs").hidden = on;
  $("#c2d").hidden = !on;
  if (on) $("#here").hidden = true;
  pano?.spin(false);
  render();
}

function start3d() {
  try {
    const p = createPanorama($("#c3d"), $("#figs"), $("#here"), (f) => showPerson(f.key), () => {});
    pano = p;
    $<HTMLCanvasElement>("#c3d").addEventListener("webglcontextlost", () => {
      pano?.dispose();
      pano = null;
      setFlat(true);
    });
  } catch {
    // No WebGL (driver blocklist, web-view without it, hardware acceleration
    // off): the flat plan does everything but the 3D.
    pano = null;
    setFlat(true);
  }
}

function startFlatInput() {
  const c = $<HTMLCanvasElement>("#c2d");
  c.addEventListener("click", (e) => {
    const r = c.getBoundingClientRect();
    const s = sectionAt(planView, e.clientX - r.left, e.clientY - r.top);
    if (s) showSection(s);
  });
  window.addEventListener("resize", () => flat && drawFlat());
}

// The host may inject its adapter after this script runs: DashenSeat.setAdapter.
declare global {
  interface Window {
    DashenSeat?: { setAdapter(a: DashenAdapter): void; reload(): void; version: string };
  }
}

function boot() {
  shell();
  startFlatInput();
  if (/(^|[#&])2d\b/.test(location.hash)) setFlat(true);
  else start3d();
  window.DashenSeat = {
    version: "0.1.0",
    setAdapter(a) {
      window.DashenSeatAdapter = a;
      ({ adapter, demo } = resolveAdapter(cfg.tags));
      const badge = document.querySelector(".top .badge");
      if (!demo) badge?.remove();
      byDay.clear();
      loadAll(true);
    },
    reload: () => loadAll(),
  };
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeSheet());
  loadAll(true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
