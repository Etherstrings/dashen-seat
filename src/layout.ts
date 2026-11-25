// 广州体育馆 1 号馆 after the 猫眼 seat map: the rings and their sections,
// shared by the 3D hall (scene.ts) and the 座位海报's floor plan
// (seatPoster.ts), which must agree on where every section is.

// ring: radius from/to, height from/to, rows (from the seat-row estimates)
export const RING: Record<string, [number, number, number, number, number]> = { in: [5.4, 7.4, 0.25, 1.55, 12], mid: [7.6, 9.9, 1.95, 3.5, 10], out: [10.25, 11.3, 4.3, 5.0, 6], pass: [7.6, 11.3, 1.95, 5.0, 16] };
export const LAYOUT: [string, [number, number, string, string][]][] = [
  ["in", [[0, 18, "II", "t3"], [18, 37, "II", "t3"], [37, 55, "JJ", "t3"], [55, 70, "JJ", "t2"], [70, 83, "AA", "t1"], [83, 97, "AA", "t1"], [97, 110, "AA", "t1"], [110, 125, "BB", "t2"], [125, 143, "BB", "x"], [143, 162, "CC", "x"], [162, 180, "CC", "x"], [180, 198, "DD", "x"], [198, 217, "DD", "x"], [217, 235, "EE", "x"], [235, 252, "EE", "t2"], [252, 270, "FF", "t1"], [270, 288, "FF", "t1"], [288, 305, "GG", "t2"], [305, 323, "GG", "x"], [323, 342, "HH", "t3"], [342, 360, "HH", "t3"]]],
  ["mid", [[0, 17, "I", "t5"], [17, 35, "I", "t5"], [35, 55, "J", "t5"], [55, 72, "J", "t4"], [72, 90, "A", "t4"], [90, 108, "A", "t4"], [108, 125, "B", "t4"], [125, 145, "B", "t5"], [145, 162, "C", "t5"], [198, 215, "D", "t5"], [215, 235, "E", "t5"], [235, 252, "E", "t4"], [252, 270, "F", "t4"], [270, 288, "F", "t4"], [288, 305, "G", "t4"], [305, 325, "G", "t5"], [325, 342, "H", "t5"], [342, 360, "H", "t5"]]],
  ["pass", [[162, 180, "C", "pass"], [180, 198, "D", "pass"]]],
  ["out", [[52, 60, "K", "t6"], [60, 75, "K", "t6"], [75, 90, "K", "t6"], [90, 105, "L", "t6"], [105, 120, "L", "t6"], [120, 128, "L", "t6"], [232, 240, "M", "t6"], [240, 255, "M", "t6"], [255, 270, "M", "t6"], [270, 285, "N", "t6"], [285, 300, "N", "t6"], [300, 308, "N", "t6"]]],
];
export const OVAL = 1.32; // the hall is longer east–west

// hash is a stable 0–1 from a string: where a figure stands in its section.
export function hash(s: string, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

// SECTION_NAMES are the sections a seat may be in, inner ring first.
export const SECTION_NAMES = Array.from(new Set(LAYOUT.flatMap(([, list]) => list.map((s) => s[2]))));
