// Shape Atlas — pure game logic (no DOM). Shared by the app and the tests.
export const LAUNCH = '2026-11-17';
export const R = 6371.0088;
export const MAX_GUESSES = 6;
export const C = { key: 0, idx: 1, name: 2, alt: 3, region: 4, subregion: 5, capital: 6, sovereign: 7, lon: 8, lat: 9, area: 10, keep: 11, neighbours: 12, like: 13 };
export const REGIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];

const rad = d => (d * Math.PI) / 180;
export function distanceKm(a, b) {
  const [l1, p1, l2, p2] = [rad(a[C.lon]), rad(a[C.lat]), rad(b[C.lon]), rad(b[C.lat])];
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
// Initial compass bearing from a to b, degrees clockwise from north.
export function bearing(a, b) {
  const [l1, p1, l2, p2] = [rad(a[C.lon]), rad(a[C.lat]), rad(b[C.lon]), rad(b[C.lat])];
  const y = Math.sin(l2 - l1) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(l2 - l1);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
export const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
export const ARROW_EMOJI = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
export const compass = deg => Math.round(deg / 45) % 8;
// 100% = same place, 0% = the far side of the planet.
export const proximity = km => Math.max(0, Math.round(100 * (1 - km / (Math.PI * R))));

export function dayNumber(dateStr) {
  const p = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((p(dateStr) - p(LAUNCH)) / 86400000) + 1;
}
// Playable: real countries and territories with a recognisable outline.
export const playable = rows => rows.filter(r => REGIONS.includes(r[C.region]) && r[C.area] >= 1000);
export const dailyPool = rows => playable(rows).filter(r => r[C.area] >= 10000).sort((a, b) => (a[C.key] < b[C.key] ? -1 : 1));
export function dailyIndex(n, day) {
  if (n <= 1) return 0;
  const gcd = (x, y) => (y ? gcd(y, x % y) : x);
  let a = Math.floor(n * 0.6180339887) | 1; while (gcd(a, n) !== 1) a++;
  const i = ((day - 1) % n + n) % n;
  return (a * i + (7907 % n)) % n;
}

export const norm = s => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export function search(rows, q, exclude, limit = 8) {
  const n = norm(q); if (!n) return [];
  const out = [];
  for (const r of rows) {
    if (exclude && exclude.has(r[C.key])) continue;
    let s = -1;
    for (const t of [r[C.name], ...(r[C.alt] || [])].map(norm)) {
      if (t === n) s = Math.max(s, 100);
      else if (t.startsWith(n)) s = Math.max(s, 80 - t.length / 100);
      else if (t.split(' ').some(w => w.startsWith(n))) s = Math.max(s, 60);
    }
    if (s >= 0) out.push([s + (r[C.sovereign] ? 1 : 0), r]);
  }
  return out.sort((a, b) => b[0] - a[0]).slice(0, limit).map(x => x[1]);
}

// ---- Drill: Leitner-style spaced repetition ----
export const INTERVALS = [1, 3, 7, 15, 30, 60]; // questions until a card is due again, by box
export function pickDrill(pool, cards, seq, rand) {
  const due = pool.filter(r => cards[r[C.key]] && cards[r[C.key]].due <= seq);
  const fresh = pool.filter(r => !cards[r[C.key]]);
  let src;
  if (due.length && (rand() < 0.7 || !fresh.length)) {
    const minBox = Math.min(...due.map(r => cards[r[C.key]].box));
    src = due.filter(r => cards[r[C.key]].box <= minBox + 1);
  } else src = fresh.length ? fresh : pool;
  return src[Math.floor(rand() * src.length)];
}
export function grade(card, right, seq) {
  const c = card || { box: 0, due: 0, seen: 0, right: 0 };
  c.seen++; if (right) c.right++;
  c.box = right ? Math.min(INTERVALS.length - 1, c.box + 1) : 0;
  c.due = seq + INTERVALS[c.box];
  return c;
}
// Four options: the answer plus decoys. Hard mode uses look-alike outlines and neighbours.
export function options(answer, pool, hard, rand, byKey) {
  const inPool = new Set(pool.map(r => r[C.key]));
  let decoys = [];
  if (hard) {
    const like = (answer[C.like] || []).filter(k => byKey.has(k)).map(k => byKey.get(k));
    const near = (answer[C.neighbours] || []).filter(k => byKey.has(k)).map(k => byKey.get(k));
    for (const r of [...like.slice(0, 4), ...near]) if (r[C.key] !== answer[C.key] && !decoys.includes(r) && REGIONS.includes(r[C.region]) && r[C.area] >= 1000) decoys.push(r);
    decoys = decoys.sort(() => rand() - 0.5).slice(0, 3);
  }
  const same = pool.filter(r => r[C.key] !== answer[C.key] && r[C.region] === answer[C.region] && !decoys.includes(r));
  const any = pool.filter(r => r[C.key] !== answer[C.key] && !decoys.includes(r));
  while (decoys.length < 3) {
    const src = same.length ? same : any;
    const r = src.splice(Math.floor(rand() * src.length), 1)[0];
    if (!r) break; decoys.push(r);
  }
  const all = [answer, ...decoys];
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all;
}

// ---- Locate: score a tap by distance to the country ----
export const locateScore = (km, inside) => (inside ? 100 : Math.round(100 * Math.exp(-km / 1000)));
