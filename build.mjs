// Build Shape Atlas.
//   dist/artifact.html  single self-contained page (for the Claude preview link)
//   dist/web/           installable web app; map data fetched from data/
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { feature } from 'topojson-client';
import { geoMercator } from 'd3-geo';

const r = p => readFileSync(p, 'utf8');
const out = await build({ entryPoints: ['src/app.js'], bundle: true, minify: true, format: 'iife', write: false, target: ['es2020'], legalComments: 'inline' });
const bundle = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const tpl = r('src/app.html');
const meta = r('src/data/meta.json'), t50 = r('src/data/countries-50m.json'), t110 = r('src/data/countries-110m.json');

rmSync('dist', { recursive: true, force: true }); mkdirSync('dist/web/icons', { recursive: true }); mkdirSync('dist/web/data', { recursive: true });
writeFileSync('dist/artifact.html', tpl.replace('<!--PWA_LINKS-->', () => '')
  .replace('<!--DATA-->', () => `<script>window.SA_META=${meta};window.SA_50=${t50};window.SA_110=${t110}</script>`)
  .replace('<!--BUNDLE-->', () => `<script>${bundle}</script>`));
const links = '<link rel="manifest" href="manifest.json">\n<link rel="apple-touch-icon" href="icons/icon-180.png">\n<link rel="icon" href="icons/icon-192.png">';
const sw = `<script>if('serviceWorker' in navigator){try{navigator.serviceWorker.register('sw.js').catch(function(){})}catch(e){}}</script>`;
writeFileSync('dist/web/index.html', tpl.replace('<!--PWA_LINKS-->', () => links).replace('<!--DATA-->', () => '').replace('<!--BUNDLE-->', () => `<script>${bundle}</script>\n${sw}`));
for (const f of ['meta.json', 'countries-50m.json', 'countries-110m.json']) copyFileSync('src/data/' + f, 'dist/web/data/' + f);
writeFileSync('dist/web/manifest.json', JSON.stringify({ name: 'Shape Atlas', short_name: 'Shape Atlas', description: 'Train country shapes and locations: daily shape guess, spaced-repetition drill and map tapping.',
  start_url: './', scope: './', display: 'standalone', background_color: '#ffffff', theme_color: '#0c3b5e',
  icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] }, null, 2));
writeFileSync('dist/web/sw.js', `// Offline cache for Shape Atlas. Bump VERSION when you ship changes.
const VERSION = 'sa-v1';
const FILES = ['./', './index.html', './manifest.json', './data/meta.json', './data/countries-50m.json', './data/countries-110m.json', './icons/icon-192.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('sa-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
`);
// Icon: Italy's outline (public-domain Natural Earth shape) in ink on an ocean-blue tile.
const topo = JSON.parse(t50), it = feature(topo, topo.objects.countries).features.find(f => f.properties.name === 'Italy');
const big = it.geometry.coordinates.map(p => p[0]).sort((a, b) => b.length - a.length).slice(0, 3);
const proj = geoMercator().rotate([-12.5, 0]).fitExtent([[0.2, 0.14], [0.8, 0.86]], { type: 'MultiPolygon', coordinates: big.map(ring => [ring]) });
writeFileSync('dist/icon-shape.json', JSON.stringify(big.map(ring => ring.map(p => proj(p)))));
execSync('python3 scripts/icons.py dist/icon-shape.json dist/web/icons', { stdio: 'inherit' });
rmSync('dist/icon-shape.json');
console.log(`built: bundle ${(bundle.length / 1024).toFixed(0)} KB, artifact ${(readFileSync('dist/artifact.html').length / 1024).toFixed(0)} KB`);
