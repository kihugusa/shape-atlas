"""App icons: a country outline (coordinates in 0..1 from build.mjs) in ink on an ocean-blue tile."""
import json, os, sys
from PIL import Image, ImageDraw
rings = json.load(open(sys.argv[1])); out = sys.argv[2]
def icon(size, path, pad=0.0):
    im = Image.new('RGB', (size, size), '#0c3b5e'); d = ImageDraw.Draw(im)
    s = size * (1 - 2 * pad); o = size * pad
    for ring in rings:
        d.polygon([(o + x * s, o + y * s) for x, y in ring], fill='#efe4c8')
    r = size * 0.035; cx, cy = o + 0.64 * s, o + 0.78 * s
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill='#ff4b2b')
    im.save(path)
for size, name in [(180, 'icon-180.png'), (192, 'icon-192.png'), (512, 'icon-512.png')]:
    icon(size, os.path.join(out, name))
icon(512, os.path.join(out, 'icon-maskable-512.png'), pad=0.08)
