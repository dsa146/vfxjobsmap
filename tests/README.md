# Tests

Run the dependency-free regression checks with Node.js:

```powershell
node --test tests/regressions.test.cjs
```

Run the browser tests with Playwright available to Node.js and Chrome installed:

```powershell
node tests/browser.e2e.cjs
```

If Playwright is installed outside this project, set `PLAYWRIGHT_MODULE_PATH` to its
package directory. `BROWSER_CHANNEL` defaults to `chrome`; set it to `msedge` to
use an installed Edge browser.

The browser runner starts and stops a temporary local HTTP server and uses fresh,
headless browser contexts. It first checks the live Google Sheet and map tiles,
then intercepts sheet requests with fixtures for repeatable desktop and mobile
interaction checks. Leaflet, fonts and map tiles use their actual external hosts;
network access is required. Analytics requests are suppressed during testing.

Regression coverage includes full-year/source IDs, legacy history migration,
delisted snapshots, blocked storage, map cache dependencies and prototype-name studio
grouping. Browser checks also exercise filter reset styles/ARIA, old deep links,
archived drawers, pagination, CSV downloads, theme, navigation and mobile layouts. Mobile tests use
Chromium device emulation, not physical devices or Safari.

Screenshots and the JSON report are saved under `tests/artifacts/` (Git-ignored).
The runner exits with a nonzero status if any check fails.
