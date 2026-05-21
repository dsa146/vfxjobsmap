# VFX·JOBS·MAP

Live VFX job postings from around the world, plotted on an interactive map with filters, a live feed, and sortable list view.

![Dark mode map view](assets/Screenshot.png)

## Features

- **Interactive map** — Leaflet/CartoDB tiles, clustered pins color-coded by posting age
- **Filter rail** — discipline chips, status, work mode, level, region, software stack, and free-text search
- **Live feed** — right-side panel sorted by urgency (new → recent → active → ongoing)
- **List view** — sortable table with all open roles, CSV export
- **Studios view** — browse and click through by studio
- **Job drawer** — details panel with Apply Now, Save, and Share buttons
- **Saved jobs** — persisted in `localStorage`, amber badge on bookmark icon
- **New jobs notifications** — red badge, auto-marks seen after 2 s
- **Light / dark mode** — smooth cross-fade via View Transitions API
- **HUD** — live counts: open roles, studios, countries, signal quality
- **Internationalisation** — 9 languages with auto-detection and a globe picker
- **Mobile-first** — bottom sheet panels in portrait, side-panel split in landscape

## Internationalisation

Language is auto-detected from the browser on first visit and persisted in `localStorage`. The globe icon in the toolbar opens the language picker.

| Code | Language |
|------|----------|
| `en` | English |
| `fr` | Français |
| `de` | Deutsch |
| `ja` | 日本語 |
| `ko` | 한국어 |
| `zh` | 简体中文 |
| `zh-TW` | 繁體中文 |
| `es` | Español |
| `ru` | Русский |

## Status color key

| Color | Label | Age |
|-------|-------|-----|
| 🔴 `#FF3D5A` | New | today |
| 🟠 `#FF7A3D` | Recent | 1–3 days |
| 🟡 `#F5A524` | Active | 4–9 days |
| 🔵 `#2BC4D2` | Ongoing | 10+ days |

## Data source

Job postings are pulled from a public Google Sheet from Chris Mayne via JSONP (compatible with `file://` origins where `fetch()` is blocked). The sheet is polled on load with 3 automatic retries.

| Column | Field |
|--------|-------|
| 0 | Studio |
| 2 | City |
| 6 | Country |
| 8 | Job Title |
| 10 | Level |
| 12 | Work Mode |
| 14 | Date Posted |
| 16 | Contact |
| 18 | Software |
| 20 | Notes |
| 22 | Region |

## Running locally

No build step. Just open `index.html` in a browser:

```
# Clone
git clone https://github.com/dsa146/vfxjobsmap.git
cd vfxjobsmap

# Open
open index.html        # macOS
start index.html       # Windows
xdg-open index.html    # Linux
```

All dependencies (Leaflet, Google Fonts) are loaded from CDN. No npm install required.

## Project structure

```
vfxjobsmap/
├── index.html          # App shell and markup
├── style.css           # All styles (dark/light themes, responsive layout)
├── app.js              # App logic, filters, views, map rendering
├── i18n.js             # Locale strings and language detection (loaded before app.js)
├── config.js           # Sheet ID, column map, disciplines, status constants
├── coords.js           # City → lat/lng lookup table (CC object)
└── generate-coords.js  # Dev utility: rebuilds coords.js from source data
```

## Tech stack

- [Leaflet 1.9](https://leafletjs.com/) — map rendering
- [CartoDB Basemaps](https://github.com/CartoDB/basemap-styles) — dark/light tiles
- [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) + [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) + [Anton](https://fonts.google.com/specimen/Anton) — typography
- Vanilla JS / CSS — no framework, no build tool

## License

MIT
