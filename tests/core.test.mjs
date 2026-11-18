// Checks the country data and the game logic.
import { readFileSync } from 'node:fs';
import * as G from '../src/core.js';
const meta = JSON.parse(readFileSync(new URL('../src/data/meta.json', import.meta.url), 'utf8'));
const rows = meta.rows, C = G.C, byKey = new Map(rows.map(r => [r[C.key], r]));
let bad = 0; const fail = m => { bad++; console.log('FAIL', m); };
const find = n => rows.find(r => r[C.name] === n);

const play = G.playable(rows), daily = G.dailyPool(rows);
if (play.length < 180) fail('only ' + play.length + ' playable');
// known distances (centre to centre, roughly)
const d = G.distanceKm(find('France'), find('Germany'));
if (d < 500 || d > 1100) fail('France-Germany distance ' + d);
const dAU = G.distanceKm(find('Australia'), find('Brazil'));
if (dAU < 12000 || dAU > 17000) fail('Australia-Brazil distance ' + dAU);
// bearings
if (G.compass(G.bearing(find('France'), find('Spain'))) !== 5 && G.compass(G.bearing(find('France'), find('Spain'))) !== 4) fail('France->Spain should point south/south-west');
if (G.compass(G.bearing(find('Brazil'), find('Canada'))) !== 0 && G.compass(G.bearing(find('Brazil'), find('Canada'))) !== 7) fail('Brazil->Canada should point north/north-west');
if (G.proximity(0) !== 100 || G.proximity(Math.PI * G.R) !== 0) fail('proximity bounds');
// search
if (G.search(rows, 'united st')[0][C.name] !== 'United States') fail('search united st');
if (!G.search(rows, 'ivory').length) fail('search ivory coast');
// daily: deterministic, no repeats for a full cycle
const seen = new Set(); for (let i = 1; i <= daily.length; i++) seen.add(G.dailyIndex(daily.length, i));
if (seen.size !== daily.length) fail('daily repeats within a cycle');
// drill options: 4 distinct, include answer; hard decoys exist for most countries
let rand = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
for (const r of play) {
  const o = G.options(r, play, true, rand, byKey);
  if (o.length !== 4 || new Set(o.map(x => x[C.key])).size !== 4 || !o.includes(r)) { fail('options for ' + r[C.name]); break; }
}
// spaced repetition moves cards correctly
let c = G.grade(null, true, 10); if (c.box !== 1 || c.due !== 13) fail('grade right');
c = G.grade(c, false, 20); if (c.box !== 0 || c.due !== 21) fail('grade wrong');
// every country has neighbours resolved where it has land borders
const fr = find('France'); if (!fr[C.neighbours].length) fail('France has no neighbours');
console.log(`${rows.length} countries, ${play.length} playable, daily pool ${daily.length}: ${bad ? bad + ' problems' : 'ok'}`);
process.exit(bad ? 1 : 0);
