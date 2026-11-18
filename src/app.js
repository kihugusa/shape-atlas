// Shape Atlas — app. Bundled with d3-geo and topojson-client (ISC) by build.mjs.
import { feature, mesh } from 'topojson-client';
import { geoMercator, geoEqualEarth, geoPath, geoContains, geoDistance, geoInterpolate } from 'd3-geo';
import * as G from './core.js';

const C = G.C, $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, k) => today(new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + k));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const km = n => Math.round(n).toLocaleString() + ' km';

const KEY = 'sa:v1';
const blank = () => ({ daily: {}, dist: [0, 0, 0, 0, 0, 0, 0], cards: {}, seq: 0, drill: { seen: 0, right: 0, best: 0 }, regions: {}, locate: { rounds: 0, best: 0, total: 0 } });
let S; try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = blank(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

let ROWS, BYKEY, PLAY, DAILY, FEAT50, WORLD110, BORDERS110;
let mode = 'daily';

// ---------- geometry ----------
// Main landmass of a country (drops far-flung territories).
function shape(r) {
  const f = FEAT50[r[C.idx]], g = f.geometry;
  if (g.type === 'Polygon') return { type: 'Feature', geometry: g };
  return { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: r[C.keep].map(i => g.coordinates[i]) } };
}
function silhouetteSvg(r, size) {
  const s = shape(r);
  const proj = geoMercator().rotate([-r[C.lon], 0]).fitExtent([[10, 10], [size - 10, size - 10]], s);
  return `<svg viewBox="0 0 ${size} ${size}" class="sil" role="img" aria-label="Country outline"><path d="${geoPath(proj)(s)}"/></svg>`;
}
// Small world map with one country highlighted (and a ring so tiny countries are visible).
function locatorSvg(r, w) {
  const h = Math.round(w * 0.5);
  const proj = geoEqualEarth().fitExtent([[2, 2], [w - 2, h - 2]], { type: 'Sphere' });
  const p = geoPath(proj), [x, y] = proj([r[C.lon], r[C.lat]]);
  return `<svg viewBox="0 0 ${w} ${h}" class="loc" role="img" aria-label="${esc(r[C.name])} on a world map">
    <path class="sea" d="${p({ type: 'Sphere' })}"/><path class="land" d="${p(WORLD110)}"/><path class="hit" d="${p(shape(r))}"/>
    <circle cx="${x}" cy="${y}" r="9" class="ring"/></svg>`;
}

// ---------- DAILY (shape + distance/direction/proximity) ----------
let dTarget, dGuesses, dOver;
function openDaily() {
  const n = G.dayNumber(today());
  dTarget = DAILY[G.dailyIndex(DAILY.length, n)];
  const sv = S.daily[today()];
  dGuesses = sv ? sv.g.map(k => BYKEY.get(k)).filter(Boolean) : []; dOver = !!(sv && sv.done);
  $('dNum').textContent = `#${n} · ${new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
  $('dShape').innerHTML = silhouetteSvg(dTarget, 320);
  renderDaily(false);
}
function guessRow(r) {
  const dist = G.distanceKm(r, dTarget), right = r[C.key] === dTarget[C.key], pr = right ? 100 : G.proximity(dist);
  const dir = right ? '🎯' : G.ARROWS[G.compass(G.bearing(r, dTarget))];
  return `<li class="${right ? 'right' : ''}"><span class="gname">${esc(r[C.name])}</span><span class="gdist">${right ? 'Got it' : km(dist)}</span><span class="gdir" aria-label="direction">${dir}</span><span class="gpct" style="--p:${pr}%">${pr}%</span></li>`;
}
function renderDaily(fresh) {
  const won = dGuesses.some(r => r[C.key] === dTarget[C.key]);
  $('dList').innerHTML = dGuesses.map(guessRow).join('') + Array.from({ length: Math.max(0, G.MAX_GUESSES - dGuesses.length) }, () => '<li class="empty"><span></span></li>').join('');
  $('dSearch').hidden = dOver;
  $('dEnd').innerHTML = dOver ? `<div class="end"><h2>${won ? `Got it in ${dGuesses.length}` : 'Out of guesses'}</h2>
    <p><b>${esc(dTarget[C.name])}</b>, ${esc(dTarget[C.subregion] || dTarget[C.region])}${dTarget[C.capital] ? `. Capital ${esc(dTarget[C.capital])}` : ''}.</p>
    ${locatorSvg(dTarget, 360)}
    ${dTarget[C.neighbours].length ? `<p class="mute">Borders ${dTarget[C.neighbours].map(k => BYKEY.get(k)).filter(Boolean).map(r => esc(r[C.name])).join(', ')}.</p>` : '<p class="mute">No land borders.</p>'}
    <div class="row"><button class="primary" id="dShare">Copy result</button><button id="dDrill">Drill this region</button></div></div>` : '';
  if (dOver) {
    $('dShare').onclick = () => copy(dailyShare(won));
    $('dDrill').onclick = () => { drillRegion = dTarget[C.region]; setMode('drill'); };
  }
}
function dailyShare(won) {
  const lines = dGuesses.map(r => {
    const right = r[C.key] === dTarget[C.key], pr = right ? 100 : G.proximity(G.distanceKm(r, dTarget));
    const g = Math.floor(pr / 20), y = pr - g * 20 >= 10 ? 1 : 0;
    return '🟩'.repeat(g) + '🟨'.repeat(y) + '⬛'.repeat(5 - g - y) + (right ? '🎉' : G.ARROW_EMOJI[G.compass(G.bearing(r, dTarget))]);
  });
  return `Shape Atlas #${G.dayNumber(today())} ${won ? dGuesses.length : 'X'}/${G.MAX_GUESSES}\n${lines.join('\n')}`;
}
function dailyGuess(r) {
  if (dOver || !r || dGuesses.some(g => g[C.key] === r[C.key])) return;
  dGuesses.push(r);
  const won = r[C.key] === dTarget[C.key];
  if (won || dGuesses.length >= G.MAX_GUESSES) { dOver = true; S.dist[won ? dGuesses.length - 1 : 6]++; tally(dTarget, won); }
  S.daily[today()] = { g: dGuesses.map(x => x[C.key]), done: dOver, won }; save();
  renderDaily(true);
}

// ---------- DRILL (spaced repetition) ----------
let drillRegion = 'All', drillHard = false, drillTyped = false, drillQ = null, drillOpts = [], drillDone = false, streak = 0;
function drillPool() { return drillRegion === 'All' ? PLAY : PLAY.filter(r => r[C.region] === drillRegion); }
function nextDrill() {
  const pool = drillPool();
  drillQ = G.pickDrill(pool, S.cards, S.seq, Math.random);
  drillOpts = G.options(drillQ, PLAY, drillHard, Math.random, BYKEY);
  drillDone = false;
  $('qShape').innerHTML = silhouetteSvg(drillQ, 300);
  $('qFeedback').innerHTML = '';
  $('qOpts').hidden = drillTyped; $('qType').hidden = !drillTyped;
  $('qOpts').innerHTML = drillOpts.map((r, i) => `<button data-k="${esc(r[C.key])}">${esc(r[C.name])}</button>`).join('');
  if (drillTyped) { $('qInput').value = ''; setTimeout(() => $('qInput').focus(), 50); }
  renderDrillMeta();
}
function renderDrillMeta() {
  const box = (S.cards[drillQ && drillQ[C.key]] || {}).box;
  const pool = drillPool(), mastered = pool.filter(r => (S.cards[r[C.key]] || {}).box >= 3).length;
  $('qMeta').innerHTML = `<span>Streak <b>${streak}</b></span><span>Best <b>${S.drill.best}</b></span><span>Mastered <b>${mastered}/${pool.length}</b></span>${box != null ? `<span class="mute">Box ${box + 1}/6</span>` : '<span class="mute">New</span>'}`;
}
function answerDrill(r) {
  if (drillDone) return;
  drillDone = true; S.seq++;
  const right = r && r[C.key] === drillQ[C.key];
  S.cards[drillQ[C.key]] = G.grade(S.cards[drillQ[C.key]], right, S.seq);
  S.drill.seen++; if (right) S.drill.right++;
  streak = right ? streak + 1 : 0; S.drill.best = Math.max(S.drill.best, streak);
  tally(drillQ, right); save();
  document.querySelectorAll('#qOpts button').forEach(b => {
    if (b.dataset.k === drillQ[C.key]) b.classList.add('right');
    else if (r && b.dataset.k === r[C.key]) b.classList.add('wrong');
    b.disabled = true;
  });
  const near = drillQ[C.neighbours].map(k => BYKEY.get(k)).filter(Boolean).slice(0, 4).map(x => esc(x[C.name]));
  $('qFeedback').innerHTML = `<div class="fb ${right ? 'ok' : 'no'}"><p><b>${right ? 'Right' : 'It’s ' + esc(drillQ[C.name])}</b>${right ? '' : r ? `, not ${esc(r[C.name])}` : ''}. ${esc(drillQ[C.subregion] || drillQ[C.region])}${near.length ? `; borders ${near.join(', ')}` : ''}.</p>
    ${locatorSvg(drillQ, 320)}<button class="primary" id="qNext">Next</button></div>`;
  $('qNext').onclick = nextDrill;
  renderDrillMeta();
  if (right) setTimeout(() => { if (drillDone && mode === 'drill' && $('qNext')) nextDrill(); }, 1400);
  else $('qNext').focus();
}

// ---------- LOCATE (tap the map) ----------
let L = null; // { round:[rows], i, score, results:[], k, tx, ty }
function openLocate() {
  const pool = PLAY.filter(r => r[C.area] >= 5000);
  const pick = []; while (pick.length < 5) { const r = pool[Math.floor(Math.random() * pool.length)]; if (!pick.includes(r)) pick.push(r); }
  L = { round: pick, i: 0, score: 0, results: [], k: 1, tx: 0, ty: 0, done: false };
  drawMap(); askLocate();
}
let MAPW = 0, MAPH = 0, MAPPROJ = null;
function drawMap() {
  const box = $('map');
  MAPW = box.clientWidth; MAPH = Math.round(MAPW * 0.62);
  box.style.height = MAPH + 'px';
  MAPPROJ = geoMercator().fitExtent([[0, 0], [MAPW, MAPH]], { type: 'MultiPoint', coordinates: [[-169, -57], [180, 80]] });
  const p = geoPath(MAPPROJ);
  box.innerHTML = `<svg id="mapSvg" viewBox="0 0 ${MAPW} ${MAPH}" width="${MAPW}" height="${MAPH}"><rect width="100%" height="100%" class="sea"/>
    <g id="mapG"><path class="land" d="${p(WORLD110)}"/><path class="border" d="${p(BORDERS110)}"/><g id="mapMarks"></g></g></svg>`;
  applyZoom(); bindMap();
}
function applyZoom() {
  const g = $('mapG'); if (!g) return;
  g.setAttribute('transform', `translate(${L.tx},${L.ty}) scale(${L.k})`);
  g.style.setProperty('--k', L.k);
}
function zoomAt(f, cx, cy) {
  const k = Math.max(1, Math.min(12, L.k * f));
  L.tx = cx - (cx - L.tx) * (k / L.k); L.ty = cy - (cy - L.ty) * (k / L.k); L.k = k;
  L.tx = Math.min(0, Math.max(MAPW - MAPW * k, L.tx)); L.ty = Math.min(0, Math.max(MAPH - MAPH * k, L.ty));
  applyZoom();
}
function bindMap() {
  const svg = $('mapSvg'), pts = new Map(); let moved = false, start = null, pinch0 = null;
  const pos = e => { const b = svg.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, pos(e)); moved = false; start = pos(e); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: L.k }; } });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId), cur = pos(e); pts.set(e.pointerId, cur);
    if (pts.size === 2 && pinch0) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt((pinch0.k * d / pinch0.d) / L.k, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); moved = true;
    } else if (pts.size === 1) {
      if (Math.hypot(cur[0] - start[0], cur[1] - start[1]) > 6) moved = true;
      if (moved && L.k > 1) { L.tx += cur[0] - prev[0]; L.ty += cur[1] - prev[1]; zoomAt(1, 0, 0); }
    }
  });
  const end = e => {
    const had = pts.has(e.pointerId); pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null;
    if (had && !moved && pts.size === 0 && e.type === 'pointerup') tapMap(pos(e));
  };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = pos(e); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, x, y); }, { passive: false });
}
function askLocate() {
  const r = L.round[L.i];
  $('lPrompt').innerHTML = `<span class="mute">${L.i + 1} of 5</span><b>${esc(r[C.name])}</b>`;
  $('lScore').textContent = L.score;
  $('lFeedback').innerHTML = '<p class="mute">Tap where it is. Pinch or use + and − to zoom.</p>';
  $('mapMarks').innerHTML = '';
}
// Nearest point of the country's outline to the tap (great-circle distance over its vertices).
function nearest(r, ll) {
  let best = Infinity, bp = null;
  const g = shape(r).geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of polys) for (const ring of poly) for (let i = 0; i < ring.length; i += Math.max(1, Math.floor(ring.length / 400))) {
    const d = geoDistance(ll, ring[i]); if (d < best) { best = d; bp = ring[i]; }
  }
  return { km: best * G.R, p: bp };
}
function tapMap([sx, sy]) {
  if (!L || L.done || L.answered) return;
  const r = L.round[L.i];
  const x = (sx - L.tx) / L.k, y = (sy - L.ty) / L.k, ll = MAPPROJ.invert([x, y]);
  if (!ll || isNaN(ll[0])) return;
  const s = shape(r), inside = geoContains(s, ll);
  const n = inside ? { km: 0, p: ll } : nearest(r, ll);
  const pts = L.round.length;
  const score = G.locateScore(n.km, inside);
  L.score += score; L.results.push({ r, km: n.km, score }); L.answered = true;
  const p = geoPath(MAPPROJ), [cx, cy] = MAPPROJ([r[C.lon], r[C.lat]]);
  const line = inside ? '' : `<path class="gc" d="${p({ type: 'LineString', coordinates: [ll, n.p] })}"/>`;
  $('mapMarks').innerHTML = `<path class="target" d="${p(s)}"/><circle class="tring" cx="${cx}" cy="${cy}" r="10"/>${line}<circle class="tap" cx="${x}" cy="${y}" r="4.5"/>`;
  $('lScore').textContent = L.score;
  const last = L.i === pts - 1;
  $('lFeedback').innerHTML = `<p><b>${inside ? 'Inside it! 100 points' : `${km(n.km)} away: ${score} point${score === 1 ? '' : 's'}`}</b></p><button class="primary" id="lNext">${last ? 'See round score' : 'Next country'}</button>`;
  tally(r, inside);
  $('lNext').onclick = () => { L.answered = false; if (last) return endLocate(); L.i++; askLocate(); };
}
function endLocate() {
  L.done = true;
  const best = L.score > S.locate.best; S.locate.rounds++; S.locate.total += L.score; S.locate.best = Math.max(S.locate.best, L.score); save();
  $('lFeedback').innerHTML = `<div class="end"><h2>${L.score} / 500</h2><p>${best ? 'New best round.' : `Best is ${S.locate.best}.`}</p>
    <ul class="lres">${L.results.map(x => `<li><span>${esc(x.r[C.name])}</span><span>${x.km ? km(x.km) : 'inside'}</span><b>${x.score}</b></li>`).join('')}</ul>
    <div class="row"><button class="primary" id="lAgain">New round</button><button id="lCopy">Copy result</button></div></div>`;
  $('lAgain').onclick = openLocate;
  $('lCopy').onclick = () => copy(`Shape Atlas Locate ${L.score}/500\n${L.results.map(x => x.score === 100 ? '🟩' : x.score >= 50 ? '🟨' : '⬛').join('')}`);
}

// ---------- STATS ----------
function tally(r, right) { const x = S.regions[r[C.region]] || [0, 0]; x[0] += right ? 1 : 0; x[1]++; S.regions[r[C.region]] = x; }
function dailyStreak() { let d = today(), n = 0; if (!(S.daily[d] && S.daily[d].won)) d = addDays(d, -1); while (S.daily[d] && S.daily[d].won) { n++; d = addDays(d, -1); } return n; }
function renderStats() {
  const days = Object.values(S.daily).filter(x => x.done), won = days.filter(x => x.won).length;
  const weak = Object.entries(S.cards).filter(([, c]) => c.seen >= 2).map(([k, c]) => [BYKEY.get(k), c.right / c.seen, c.seen]).filter(x => x[0]).sort((a, b) => a[1] - b[1] || b[2] - a[2]).slice(0, 10);
  const maxD = Math.max(1, ...S.dist);
  $('stats').innerHTML = `<div class="nums"><div><b>${dailyStreak()}</b><span>Daily streak</span></div><div><b>${days.length ? Math.round(100 * won / days.length) : 0}%</b><span>Daily wins</span></div><div><b>${S.drill.seen ? Math.round(100 * S.drill.right / S.drill.seen) : 0}%</b><span>Drill accuracy</span></div><div><b>${S.locate.best}</b><span>Best locate</span></div></div>
    <h3>By region</h3>${G.REGIONS.map(g => { const x = S.regions[g] || [0, 0]; const p = x[1] ? Math.round(100 * x[0] / x[1]) : 0; return `<div class="trow"><span>${g}</span><span class="bar"><i style="width:${p}%"></i></span><span>${x[1] ? p + '% of ' + x[1] : 'none yet'}</span></div>`; }).join('')}
    <h3>Weakest countries</h3>${weak.length ? `<div class="weak">${weak.map(([r, p, n]) => `<button data-k="${esc(r[C.key])}">${silhouetteSvg(r, 80)}<span>${esc(r[C.name])}</span><small>${Math.round(p * 100)}% of ${n}</small></button>`).join('')}</div>` : '<p class="mute">Drill a few rounds and your trouble spots show up here.</p>'}
    <h3>Daily guesses</h3><div class="dist">${S.dist.map((n, i) => `<div><span>${i < 6 ? i + 1 : 'X'}</span><i style="width:${Math.max(6, 100 * n / maxD)}%">${n}</i></div>`).join('')}</div>`;
  document.querySelectorAll('#stats .weak button').forEach(b => b.onclick = () => { const r = BYKEY.get(b.dataset.k); drillRegion = r[C.region]; setMode('drill'); });
}

// ---------- shared UI ----------
async function copy(t) {
  try { await navigator.clipboard.writeText(t); toast('Copied'); }
  catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); toast('Copied'); } catch (e2) { toast('Copy not available here'); } a.remove(); }
}
let tt; function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 1800); }

function combobox(input, listEl, onPick, exclude) {
  let list = [], sel = -1;
  const close = () => { listEl.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  const open = () => {
    list = G.search(PLAY, input.value, exclude(), 8); sel = list.length ? 0 : -1;
    if (!list.length) return close();
    listEl.innerHTML = list.map((r, i) => `<li role="option" data-i="${i}" aria-selected="${i === sel}">${esc(r[C.name])}<small>${esc(r[C.subregion] || r[C.region])}</small></li>`).join('');
    listEl.hidden = false; input.setAttribute('aria-expanded', 'true');
  };
  const mark = () => listEl.querySelectorAll('li').forEach((li, i) => li.setAttribute('aria-selected', i === sel));
  input.addEventListener('input', open);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.length) { sel = (sel + 1) % list.length; mark(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (list.length) { sel = (sel - 1 + list.length) % list.length; mark(); } }
    else if (e.key === 'Enter') { e.preventDefault(); if (sel >= 0) { onPick(list[sel]); input.value = ''; close(); } }
    else if (e.key === 'Escape') close();
  });
  listEl.addEventListener('mousedown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); onPick(list[+li.dataset.i]); input.value = ''; close(); } });
  document.addEventListener('click', e => { if (!e.target.closest('.searchbox')) close(); });
}

function setMode(m) {
  mode = m;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === m));
  for (const v of ['daily', 'drill', 'locate', 'stats']) $('v-' + v).hidden = v !== m;
  if (m === 'daily') openDaily();
  if (m === 'drill') { document.querySelectorAll('#regions button').forEach(b => b.setAttribute('aria-pressed', b.dataset.r === drillRegion)); nextDrill(); }
  if (m === 'locate') openLocate();
  if (m === 'stats') renderStats();
}

function wire() {
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => setMode(b.dataset.m));
  combobox($('dInput'), $('dSugg'), dailyGuess, () => new Set(dGuesses.map(r => r[C.key])));
  combobox($('qInput'), $('qSugg'), r => answerDrill(r), () => new Set());
  $('qGiveUp').onclick = () => answerDrill(null);
  $('qOpts').addEventListener('click', e => { const b = e.target.closest('button'); if (b) answerDrill(BYKEY.get(b.dataset.k)); });
  $('regions').innerHTML = ['All', ...G.REGIONS].map(g => `<button data-r="${g}" aria-pressed="${g === drillRegion}">${g}</button>`).join('');
  $('regions').onclick = e => { const b = e.target.closest('button'); if (!b) return; drillRegion = b.dataset.r; document.querySelectorAll('#regions button').forEach(x => x.setAttribute('aria-pressed', x === b)); streak = 0; nextDrill(); };
  $('hardBtn').onclick = () => { drillHard = !drillHard; $('hardBtn').setAttribute('aria-pressed', drillHard); nextDrill(); };
  $('typeBtn').onclick = () => { drillTyped = !drillTyped; $('typeBtn').setAttribute('aria-pressed', drillTyped); nextDrill(); };
  $('zIn').onclick = () => zoomAt(1.6, MAPW / 2, MAPH / 2);
  $('zOut').onclick = () => zoomAt(1 / 1.6, MAPW / 2, MAPH / 2);
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (mode === 'locate' && L) { drawMap(); } }, 200); });
}

async function boot() {
  let meta = window.SA_META, t50 = window.SA_50, t110 = window.SA_110;
  try {
    if (!meta) [meta, t50, t110] = await Promise.all(['data/meta.json', 'data/countries-50m.json', 'data/countries-110m.json'].map(u => fetch(u).then(r => r.json())));
  } catch (e) { $('dNum').textContent = 'Could not load maps. Check your connection and reload.'; return; }
  ROWS = meta.rows; BYKEY = new Map(ROWS.map(r => [r[C.key], r]));
  PLAY = G.playable(ROWS); DAILY = G.dailyPool(ROWS);
  FEAT50 = feature(t50, t50.objects.countries).features;
  WORLD110 = feature(t110, t110.objects.countries);
  BORDERS110 = mesh(t110, t110.objects.countries, (a, b) => a !== b);
  wire();
  const hot = window.claude && window.claude.hot;
  const start = d => setMode(d && ['daily', 'drill', 'locate', 'stats'].includes(d.mode) ? d.mode : 'daily');
  if (hot && hot.snapshot) hot.snapshot(() => ({ mode }));
  if (hot && hot.ready) hot.ready(start); else start(hot && hot.data);
}
window.__sa = () => ({ mode, daily: dTarget && dTarget[C.name], drill: drillQ && drillQ[C.name], locate: L && L.round[L.i] && L.round[L.i][C.name], L: L && { i: L.i, score: L.score, k: L.k, tx: L.tx, ty: L.ty }, proj: MAPPROJ && L && L.round[L.i] ? MAPPROJ([L.round[L.i][C.lon], L.round[L.i][C.lat]]) : null });
boot();
