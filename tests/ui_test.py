"""Headless phone test of Shape Atlas: Daily, Drill (choice, decoys, typed), Locate (map taps), Stats."""
import os, pathlib, shutil
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'dist' / 'artifact.html').as_uri()
SH = ROOT / 'shots'; SH.mkdir(exist_ok=True)
CHROME = os.environ.get('CHROME') or shutil.which('google-chrome')
errs = []
def pick(pg, inp, name):
    pg.fill(inp, name); pg.wait_for_selector(inp.replace('Input', 'Sugg') + ' li')
    pg.keyboard.press('Enter')
with sync_playwright() as p:
    b = p.chromium.launch(**({'executable_path': CHROME} if CHROME else {}), args=['--no-sandbox'])
    for scheme in ['light', 'dark']:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, color_scheme=scheme, device_scale_factor=2)
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        pg.goto(URL); pg.wait_for_selector('#dShape path')
        ans = pg.evaluate('window.__sa().daily')
        wrong = [n for n in ['Brazil', 'Japan', 'Egypt'] if n != ans][:2]
        for w in wrong: pick(pg, '#dInput', w)
        rows = pg.eval_on_selector_all('#dList li:not(.empty)', 'l => l.map(x => x.innerText.replace(/\\n/g, " | "))')
        print(scheme, 'daily answer', ans, '| guesses:', rows)
        pg.screenshot(path=str(SH / f'daily-{scheme}.png'))
        if scheme == 'dark':
            pg.click('[data-m=locate]'); pg.wait_for_selector('#mapSvg'); pg.screenshot(path=str(SH / 'locate-dark.png')); ctx.close(); continue
        pick(pg, '#dInput', ans); pg.wait_for_selector('.end')
        print('daily end:', pg.inner_text('.end h2'))
        pg.screenshot(path=str(SH / 'daily-won.png'), full_page=True)
        # drill: one right, one wrong, then hard + typed
        pg.click('[data-m=drill]'); pg.wait_for_selector('#qOpts button')
        q = pg.evaluate('window.__sa().drill'); pg.click(f'#qOpts button:text-is("{q}")'); pg.wait_for_selector('.fb.ok')
        print('drill right:', pg.inner_text('.fb p')[:80])
        pg.screenshot(path=str(SH / 'drill.png'), full_page=True)
        pg.click('#qNext'); pg.wait_for_selector('#qOpts button:not([disabled])')
        q = pg.evaluate('window.__sa().drill')
        other = pg.eval_on_selector_all('#qOpts button', f'l => l.map(x => x.textContent).filter(t => t !== {q!r})')[0]
        pg.click(f'#qOpts button:text-is("{other}")'); pg.wait_for_selector('.fb.no'); print('drill wrong:', pg.inner_text('.fb p')[:80])
        pg.click('#qNext'); pg.click('#hardBtn'); pg.wait_for_selector('#qOpts button:not([disabled])')
        print('hard decoys for', pg.evaluate('window.__sa().drill'), '->', pg.eval_on_selector_all('#qOpts button', 'l => l.map(x => x.textContent)'))
        pg.click('#typeBtn'); pg.wait_for_selector('#qType:not([hidden])')
        q = pg.evaluate('window.__sa().drill'); pick(pg, '#qInput', q); pg.wait_for_selector('.fb'); print('typed answer graded:', 'ok' if pg.query_selector('.fb.ok') else 'wrong')
        print('drill meta:', pg.inner_text('#qMeta').replace('\n', ' '))
        # locate: tap the centre of each country (zoom in once for the first)
        pg.click('[data-m=locate]'); pg.wait_for_selector('#mapSvg')
        pg.click('#zIn')
        box = pg.query_selector('#mapSvg').bounding_box()
        for i in range(5):
            st = pg.evaluate('window.__sa()'); x, y = st['proj']; Lz = st['L']
            sx, sy = box['x'] + Lz['tx'] + x * Lz['k'], box['y'] + Lz['ty'] + y * Lz['k']
            if i == 1: sx, sy = box['x'] + 20, box['y'] + 20  # a deliberately bad tap
            sx = min(max(sx, box['x'] + 2), box['x'] + box['width'] - 2); sy = min(max(sy, box['y'] + 2), box['y'] + box['height'] - 2)
            pg.mouse.click(sx, sy); pg.wait_for_selector('#lNext')
            print(f'  locate {st["locate"]}:', pg.inner_text('#lFeedback p'))
            if i == 0: pg.screenshot(path=str(SH / 'locate.png'))
            pg.click('#lNext')
        pg.wait_for_selector('#lFeedback .end'); print('locate round:', pg.inner_text('#lFeedback .end h2'), '/', pg.inner_text('#lFeedback .lres').replace(chr(10), ' '))
        pg.click('[data-m=stats]'); pg.screenshot(path=str(SH / 'stats.png'), full_page=True)
        print('stats:', pg.inner_text('#stats').replace('\n', ' ')[:140])
        print('scrollWidth', pg.evaluate('document.documentElement.scrollWidth'))
        ctx.close()
    b.close()
print('ERRORS:', errs or 'none')
