// Prepare country data for Shape Atlas.
// Shapes: Natural Earth (public domain) via world-atlas 50m. Facts: world-countries (ODbL).
// Output: src/data/meta.json  (one record per country, see COLS)
//         src/data/countries-50m.json, src/data/countries-110m.json (copied TopoJSON)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoArea, geoCentroid, geoDistance, geoMercator, geoPath } from 'd3-geo';

const R = 6371.0088; // mean Earth radius, km
const topo = JSON.parse(readFileSync('node_modules/world-atlas/countries-50m.json', 'utf8'));
const wc = JSON.parse(readFileSync('node_modules/world-countries/countries.json', 'utf8'));
const fc = feature(topo, topo.objects.countries);

const byNum = new Map(wc.map(c => [String(+c.ccn3), c]));
const norm = s => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const byName = new Map();
for (const c of wc) for (const n of [c.name.common, c.name.official, ...(c.altSpellings || [])]) byName.set(norm(n), c);
const NAME_FIX = { 'Dem. Rep. Congo': 'DR Congo', 'Central African Rep.': 'Central African Republic', 'Bosnia and Herz.': 'Bosnia and Herzegovina',
  'Dominican Rep.': 'Dominican Republic', 'Eq. Guinea': 'Equatorial Guinea', 'S. Sudan': 'South Sudan', 'Solomon Is.': 'Solomon Islands',
  'Falkland Is.': 'Falkland Islands', 'Fr. S. Antarctic Lands': 'French Southern and Antarctic Lands', 'N. Cyprus': 'Northern Cyprus',
  'W. Sahara': 'Western Sahara', 'Somaliland': 'Somaliland', 'Kosovo': 'Kosovo', 'eSwatini': 'Eswatini', 'Macedonia': 'North Macedonia',
  "Côte d'Ivoire": 'Ivory Coast', 'United States of America': 'United States', 'Czechia': 'Czechia', 'Timor-Leste': 'Timor-Leste' };

// Split a (Multi)Polygon into its polygons.
const parts = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];

// Keep the main landmass plus nearby or sizeable parts, so far-flung territories (Réunion for France,
// Hawaii for the USA) don't distort the silhouette. Indices refer to the TopoJSON MultiPolygon order.
function mainParts(geom) {
  const ps = parts(geom).map((coords, i) => {
    const f = { type: 'Polygon', coordinates: coords };
    return { i, area: geoArea(f), c: geoCentroid(f) };
  });
  if (!ps.length) return { keep: [], polys: [] };
  const big = ps.reduce((a, b) => (b.area > a.area ? b : a));
  const keep = ps.filter(p => p === big || p.area >= 0.2 * big.area || geoDistance(p.c, big.c) * R <= 1800).map(p => p.i);
  return { keep, polys: keep.map(i => parts(geom)[i]) };
}

// Rasterise a silhouette to a 24x24 grid (Mercator centred on the country), for look-alike matching.
const N = 24;
function raster(polys, lon) {
  const shape = { type: 'MultiPolygon', coordinates: polys };
  const proj = geoMercator().rotate([-lon, 0]).fitExtent([[1, 1], [N - 1, N - 1]], shape);
  const rings = [];
  for (const poly of polys) for (const ring of poly) rings.push(ring.map(p => proj(p)));
  const bits = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = x + 0.5, py = y + 0.5; let inside = false;
    for (const ring of rings) for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const [xa, ya] = ring[a], [xb, yb] = ring[b];
      if ((ya > py) !== (yb > py) && px < ((xb - xa) * (py - ya)) / (yb - ya) + xa) inside = !inside;
    }
    bits[y * N + x] = inside ? 1 : 0;
  }
  return bits;
}
const iou = (a, b) => { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { i += a[k] & b[k]; u += a[k] | b[k]; } return u ? i / u : 0; };

const out = [];
for (const f of fc.features) {
  const name = f.properties.name;
  let c = (f.id && byNum.get(String(+f.id))) || byName.get(norm(NAME_FIX[name] || name)) || byName.get(norm(name));
  const { keep, polys } = mainParts(f.geometry);
  if (!polys.length) continue;
  const main = { type: 'MultiPolygon', coordinates: polys };
  const [lon, lat] = geoCentroid(main);
  const area = Math.round(geoArea(main) * R * R);
  out.push({
    key: f.id || 'X' + norm(name).slice(0, 6), idx: fc.features.indexOf(f),
    name: c ? c.name.common : (NAME_FIX[name] || name),
    alt: c ? [...new Set([name, c.name.official, ...(c.altSpellings || []).filter(s => s.length > 3)])].filter(s => s !== (c && c.name.common)).slice(0, 6) : [name],
    region: c ? (c.region === 'Antarctic' ? 'Antarctica' : c.region) : 'Unknown', subregion: c ? c.subregion || '' : '',
    cca3: c ? c.cca3 : null, borders: c ? c.borders || [] : [], capital: c && c.capital ? c.capital[0] : null,
    sovereign: c ? !!c.independent : false, lon: +lon.toFixed(3), lat: +lat.toFixed(3), area, keep,
    bits: raster(polys, lon)
  });
}
// Neighbours as our keys; look-alikes as the 8 most similar silhouettes (excluding tiny blobs).
const byCca3 = new Map(out.filter(o => o.cca3).map(o => [o.cca3, o.key]));
for (const o of out) {
  o.neighbours = o.borders.map(b => byCca3.get(b)).filter(Boolean);
  o.like = out.filter(p => p !== o && p.area >= 2000).map(p => [p.key, iou(o.bits, p.bits)]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x[0]);
}
const COLS = ['key', 'idx', 'name', 'alt', 'region', 'subregion', 'capital', 'sovereign', 'lon', 'lat', 'area', 'keep', 'neighbours', 'like'];
mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/meta.json', JSON.stringify({ v: 1, source: 'Shapes: Natural Earth (public domain) via world-atlas. Facts: world-countries by Mohammed Le Doze (ODbL 1.0); this derived file is also ODbL 1.0.',
  cols: COLS, rows: out.map(o => COLS.map(k => o[k])) }));
copyFileSync('node_modules/world-atlas/countries-50m.json', 'src/data/countries-50m.json');
copyFileSync('node_modules/world-atlas/countries-110m.json', 'src/data/countries-110m.json');
const unmatched = out.filter(o => o.region === 'Unknown').map(o => o.name);
console.log(`${out.length} countries; unmatched to world-countries: ${unmatched.length ? unmatched.join(', ') : 'none'}`);
for (const n of ['France', 'United States', 'Norway', 'Italy', 'Chile', 'Russia']) {
  const o = out.find(x => x.name === n); if (!o) continue;
  console.log(`  ${n}: area ${o.area.toLocaleString()} km², parts kept ${o.keep.length}, centre ${o.lat},${o.lon}, looks like ${o.like.slice(0, 3).map(k => out.find(x => x.key === k).name).join(', ')}`);
}
