# Shape Atlas

Play: https://kihugusa.github.io/shape-atlas/

A trainer for country-shape and map games: learn every country by its outline and its place on the map. It installs on a phone as an app and works offline.

## Modes

- **Daily:** one outline a day, six guesses.
  - Each guess shows the distance between country centres, an arrow pointing to the answer, and a closeness score (100% = same place).
  - The result copies as a shareable grid.
  - Answers come from 167 countries and territories over 10,000 km², in a fixed shuffled order with no repeats.
- **Drill:** rapid-fire outline recognition with spaced repetition.
  - Misses come back after one question; each correct answer pushes a country further out (3, 7, 15, 30, then 60 questions).
  - You can filter by region.
  - **Look-alike decoys** fills the wrong answers with countries whose outlines match closely (24×24 silhouette overlap) or that share a border.
  - **Type the answer** removes the options entirely.
- **Locate:** five named countries per round. Tap where each one is on a world map.
  - A tap inside the country scores 100. Otherwise the score is `100 · e^(−km/1000)`, measured to the nearest point of its outline.
  - Pinch or use + and − to zoom.
- **Stats:**
  - Accuracy by region.
  - Your weakest countries; tap one to drill its region.
  - Daily guess distribution and your best Locate round.

## Data

- **Outlines:** [Natural Earth](https://www.naturalearthdata.com/) 1:50m (public domain) via [world-atlas](https://github.com/topojson/world-atlas). Far-flung territories are dropped from each outline, such as Réunion for France and Hawaii for the USA. Borders are as drawn by Natural Earth.
- **Names, regions, neighbours and capitals:** [world-countries](https://github.com/mledoze/countries) by Mohammed Le Doze, under ODbL 1.0. The derived `src/data/meta.json` is also ODbL 1.0.
- **Not playable:** territories under 1,000 km², Antarctica, and four entries with no country record (Somaliland, Northern Cyprus, Indian Ocean Territories, Siachen Glacier).

## Build

```bash
npm ci
node scripts/build-data.mjs     # outlines, centres, areas, neighbours, look-alikes -> src/data/
node tests/core.test.mjs        # distances, bearings, search, daily rotation, drill logic
node build.mjs                  # dist/artifact.html + dist/web/ (installable app)
cp -r dist/web/. docs/          # docs/ is what GitHub Pages serves
python3 tests/ui_test.py        # headless phone test of all modes (Playwright)
```

Code: MIT. Not affiliated with Worldle, MapTap or any other game.
