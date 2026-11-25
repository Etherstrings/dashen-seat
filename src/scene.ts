import * as THREE from "three";
import { hash, LAYOUT, OVAL, RING } from "./layout";

// 广州体育馆 1 号馆 as a bowl (public seat-map layout, rows estimated):
// the inner ring AA–JJ, the middle ring A–J, the outer K–N, the stage in the
// middle. Players stand in their section — on their row when they gave
// one — at a spot worked out from their id, never a seat number. Figures are
// HTML laid over the canvas, placed every frame; no images are loaded.

export interface Figure {
  key: string;
  name: string;
  section: string;
  row?: number;
  tag?: string;
  role?: string; // tank | damage | support, only when the host turns roles on
  me?: boolean;
  verified?: boolean;
}

const TIER: Record<string, number> = { svip: 0xe5484d, t1: 0xe8893a, t2: 0xe5c84a, t3: 0x3f7a52, t4: 0x34507a, t5: 0x5fae6a, t6: 0x6f9fe0, pass: 0xe88f97, x: 0x3a414a };
const at = (r: number, deg: number, y: number) => {
  const a = (deg * Math.PI) / 180;
  return new THREE.Vector3(r * OVAL * Math.cos(a), y, r * Math.sin(a));
};

interface Section {
  name: string;
  tier: string;
  a0: number;
  a1: number;
  r0: number;
  r1: number;
  y0: number;
  y1: number;
  rows: number;
  mesh: THREE.Mesh;
}

function sectionGeometry(r0: number, r1: number, y0: number, y1: number, rows: number, a0: number, a1: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  const steps = Math.max(3, Math.round((a1 - a0) / 3));
  const A0 = a0 + 0.7, A1 = a1 - 0.7;
  const strip = (pa: THREE.Vector3[], pb: THREE.Vector3[]) => {
    const base = pos.length / 3;
    pa.concat(pb).forEach((p) => pos.push(p.x, p.y, p.z));
    for (let i = 0; i < pa.length - 1; i++) {
      const a = base + i, b = base + i + 1, c = base + pa.length + i, d = base + pa.length + i + 1;
      idx.push(a, c, b, b, c, d);
    }
  };
  for (let k = 0; k < rows; k++) {
    const ra = r0 + ((r1 - r0) * k) / rows, rb = r0 + ((r1 - r0) * (k + 1)) / rows;
    const y = y0 + ((y1 - y0) * (k + 1)) / rows, yPrev = k === 0 ? 0 : y0 + ((y1 - y0) * k) / rows;
    const arc = (r: number, yy: number) => Array.from({ length: steps + 1 }, (_, i) => at(r, A0 + ((A1 - A0) * i) / steps, yy));
    strip(arc(ra, yPrev), arc(ra, y));
    strip(arc(ra, y), arc(rb, y));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export type ColorBy = "people" | "tier";

export interface Panorama {
  setFigures(figures: Figure[], counts: Record<string, number>): void;
  colorBy(mode: ColorBy): void;
  flyMe(): void;
  flyAll(): void;
  flySection(name: string): void;
  spin(on: boolean): void;
  dispose(): void;
}


export function createPanorama(canvas: HTMLCanvasElement, layer: HTMLElement, here: HTMLElement, onTap: (f: Figure) => void, onEmpty: () => void): Panorama {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a0d14, 26, 60);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x10131c, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(-6, 14, 8);
  scene.add(sun);
  const stageLight = new THREE.PointLight(0xffd23f, 1.1, 16);
  stageLight.position.set(0, 3, 0);
  scene.add(stageLight);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: 0x141a26, roughness: 1 }));
  floor.scale.set(5.3 * OVAL, 5.3, 1);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const stage = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.35, 1.7), new THREE.MeshStandardMaterial({ color: 0x0b0b0e, emissive: 0x332300, roughness: 0.4 }));
  stage.position.y = 0.18;
  scene.add(stage);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 0.08), new THREE.MeshBasicMaterial({ color: 0x1fb5c1 }));
  screen.position.set(0, 2.6, -0.2);
  scene.add(screen);
  const screen2 = screen.clone();
  screen2.rotation.y = Math.PI;
  screen2.position.z = 0.2;
  scene.add(screen2);

  const sections: Section[] = [];
  LAYOUT.forEach(([ring, list]) => list.forEach(([a0, a1, name, tier]) => {
    const [r0, r1, y0, y1, rows] = RING[ring];
    const mesh = new THREE.Mesh(sectionGeometry(r0, r1, y0, y1, rows, a0, a1), new THREE.MeshStandardMaterial({ color: 0x3a414a, roughness: 0.85, side: THREE.DoubleSide }));
    scene.add(mesh);
    sections.push({ name, tier, a0, a1, r0, r1, y0, y1, rows, mesh });
  }));
  const partsOf = (name: string) => sections.filter((s) => s.name === name);

  let mode: ColorBy = "people";
  let counts: Record<string, number> = {};
  function paint() {
    const top = Math.max(1, ...Object.values(counts));
    for (const s of sections) {
      const mat = s.mesh.material as THREE.MeshStandardMaterial;
      if (mode === "tier") {
        mat.color = new THREE.Color(TIER[s.tier]).multiplyScalar(s.tier === "x" ? 0.9 : 0.62);
      } else {
        const n = counts[s.name] || 0;
        // Grey when empty; one person already shows.
        mat.color = n === 0 ? new THREE.Color(0x3a414a) : new THREE.Color(0x1f5f66).lerp(new THREE.Color(0xffc93c), Math.min(1, 0.25 + (0.75 * n) / top));
      }
    }
  }

  // Where a figure stands: the half of the section and the spot along its
  // row come from the name (not the seat); the row is theirs when shared.
  function place(f: Figure) {
    const parts = partsOf(f.section);
    if (!parts.length) return null;
    const part = parts[Math.floor(hash(f.key, 1) * parts.length)];
    const row = Math.min(part.rows, Math.max(1, f.row || 1 + Math.floor(hash(f.key, 2) * part.rows)));
    const k = row - 1;
    const r = part.r0 + ((part.r1 - part.r0) * (k + 0.55)) / part.rows;
    const y = part.y0 + ((part.y1 - part.y0) * (k + 1)) / part.rows;
    const along = hash(f.key, 3);
    const a = part.a0 + 0.9 + (part.a1 - part.a0 - 1.8) * along;
    return { world: at(r, a, y), part };
  }

  interface Placed { f: Figure; world: THREE.Vector3; part: Section; el: HTMLButtonElement; tagW: number }
  let placed: Placed[] = [];
  let me: Placed | null = null;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.26, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  function setFigures(figures: Figure[], c: Record<string, number>) {
    counts = c;
    paint();
    placed.forEach((p) => p.el.remove());
    placed = [];
    me = null;
    for (const f of figures) {
      const spot = place(f);
      if (!spot) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "pfig" + (f.me ? " me" : "") + (f.role ? ` r-${f.role}` : "");
      el.setAttribute("aria-label", [f.me ? "你" : f.name, f.tag].filter(Boolean).join("，"));
      const tag = document.createElement("span");
      tag.className = "pfig-tag";
      tag.textContent = f.me ? "我" : f.name;
      const bob = document.createElement("span");
      bob.className = "pfig-bob";
      bob.style.animationDelay = (hash(f.key, 4) * 2).toFixed(2) + "s";
      bob.innerHTML = '<span class="pfig-head"></span><span class="pfig-body"></span>';
      el.append(tag, bob);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        el.classList.remove("jump");
        void el.offsetWidth;
        el.classList.add("jump");
        onTap(f);
      });
      layer.appendChild(el);
      const p: Placed = { f, world: spot.world, part: spot.part, el, tagW: 0 };
      placed.push(p);
      if (f.me) me = p;
    }
    ring.visible = !!me;
    if (me) ring.position.copy(me.world).add(new THREE.Vector3(0, 0.02, 0));
  }

  const view = { theta: Math.PI / 2, phi: 0.95, dist: 30, target: new THREE.Vector3(0, 1.2, 0) };
  const goal = { ...view, target: view.target.clone() };
  const flyTo = (t: Partial<typeof view>) => Object.assign(goal, t, { target: (t.target || goal.target).clone() });
  const flyAll = () => flyTo({ theta: Math.PI / 2, phi: 0.95, dist: 30, target: new THREE.Vector3(0, 1.2, 0) });
  const flyAt = (part: Section, target: THREE.Vector3) => {
    const a = (((part.a0 + part.a1) / 2) * Math.PI) / 180;
    flyTo({ theta: a + Math.PI - 0.15, phi: 0.82, dist: 9, target });
  };
  const flyMe = () => (me ? flyAt(me.part, me.world.clone()) : flyAll());
  const flySection = (name: string) => {
    const part = partsOf(name)[0];
    if (part) flyAt(part, at((part.r0 + part.r1) / 2, (part.a0 + part.a1) / 2, (part.y0 + part.y1) / 2));
  };

  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; theta: number; phi: number } | null = null;
  let pinch: { d: number; dist: number } | null = null;
  let moved = false;
  let spinning = false;
  const down = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, theta: goal.theta, phi: goal.phi };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: goal.dist };
      drag = null;
    }
  };
  const move = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      goal.dist = THREE.MathUtils.clamp(pinch.dist * (pinch.d / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y))), 4, 40);
      moved = true;
    } else if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      goal.theta = drag.theta - dx * 0.008;
      goal.phi = THREE.MathUtils.clamp(drag.phi - dy * 0.006, 0.35, 1.35);
    }
  };
  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      if (!moved) onEmpty();
      drag = null;
    }
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    goal.dist = THREE.MathUtils.clamp(goal.dist * (1 + e.deltaY * 0.0012), 4, 40);
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", wheel, { passive: false });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.fov = w < h ? 55 : 42;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // Name tags that would sit on top of one another: the viewer's own and
  // «你在这» always show, then the nearest; a hidden tag's figure stays
  // (tap it for the card).
  type Tag = { p: Placed | null; d: number; box: [number, number, number, number] };
  let hereW = 0;
  function declutter(tags: Tag[]) {
    tags.sort((a, b) => a.d - b.d);
    const kept: Tag["box"][] = [];
    for (const t of tags) {
      const [l, tp, r, b] = t.box;
      const hit = kept.some(([l2, t2, r2, b2]) => l < r2 + 2 && r > l2 - 2 && tp < b2 + 1 && b > t2 - 1);
      t.p?.el.classList.toggle("notag", hit && !t.p.f.me);
      if (!hit || t.p?.f.me || !t.p) kept.push(t.box);
    }
  }

  const v = new THREE.Vector3();
  let last = performance.now();
  let raf = 0;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function frame(t: number) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (spinning && !reduce) goal.theta += dt * 0.35;
    const k = 1 - Math.pow(0.002, dt);
    view.theta += (goal.theta - view.theta) * k;
    view.phi += (goal.phi - view.phi) * k;
    view.dist += (goal.dist - view.dist) * k;
    view.target.lerp(goal.target, k);
    camera.position.set(view.target.x + view.dist * Math.sin(view.phi) * Math.cos(view.theta), view.target.y + view.dist * Math.cos(view.phi), view.target.z + view.dist * Math.sin(view.phi) * Math.sin(view.theta));
    camera.lookAt(view.target);
    const ringMat = ring.material as THREE.MeshBasicMaterial;
    ringMat.opacity = 0.55 + 0.45 * Math.sin(t / 300);
    ring.scale.setScalar(1 + 0.25 * Math.sin(t / 300));
    renderer.render(scene, camera);

    const w = canvas.clientWidth, h = canvas.clientHeight;
    let meShown = false;
    const tags: Tag[] = [];
    for (const p of placed) {
      v.copy(p.world).project(camera);
      if (v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.2) {
        p.el.style.display = "none";
        continue;
      }
      p.el.style.display = "";
      const d = camera.position.distanceTo(p.world);
      const scale = THREE.MathUtils.clamp(9 / d, 0.35, 1.5);
      const far = scale < 0.55;
      p.el.classList.toggle("far", far);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      p.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${far ? 1 : scale.toFixed(3)})`;
      p.el.style.zIndex = String(p.f.me ? 2000 : 1000 - Math.round(d * 10));
      if (p.f.me) {
        meShown = true;
        const hy = y - (far ? 14 : 62 * scale);
        here.style.transform = `translate(${x}px, ${hy}px) translate(-50%, -100%)`;
        hereW ||= here.offsetWidth;
        tags.push({ p: null, d: -1, box: [x - hereW / 2, hy - 30, x + hereW / 2, hy] });
      }
      if (!far) {
        p.tagW ||= (p.el.querySelector(".pfig-tag") as HTMLElement).offsetWidth;
        const bottom = y - 49 * scale;
        tags.push({ p, d: p.f.me ? -1 : d, box: [x - (p.tagW / 2) * scale, bottom - 18 * scale, x + (p.tagW / 2) * scale, bottom] });
      }
    }
    here.hidden = !meShown;
    declutter(tags);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    setFigures,
    colorBy(m) {
      mode = m;
      paint();
    },
    flyMe,
    flyAll,
    flySection,
    spin(on) {
      spinning = on;
      if (on) flyAll();
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
      placed.forEach((p) => p.el.remove());
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      renderer.dispose();
    },
  };
}
