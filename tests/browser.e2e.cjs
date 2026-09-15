const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(__dirname, 'artifacts');
const results = [];
const payload = '<img src=x onerror="window.__levelXss=true">';
const oldYear = new Date().getFullYear() - 1;
const today = new Date();
const date = `Date(${today.getFullYear()},${today.getMonth()},${today.getDate()})`;
const rows = Array.from({ length: 45 }, (_, i) => {
  const c = [];
  for (const [index, value] of Object.entries({
    0: 'Review Studio', 2: 'London', 6: 'England', 8: `FX Artist ${String(i).padStart(2, '0')}`,
    10: i === 0 ? payload : 'Senior', 12: 'Remote',
    14: i === 0 ? `Date(${oldYear},8,15)` : date,
    16: 'https://example.com/apply', 18: 'Houdini', 20: 'Browser regression fixture', 21: i === 0,
  })) c[index] = { v: value };
  if (i === 0) c[14].f = `Sep 15, ${oldYear}`;
  return { c };
});
function resourceRow(values) {
  const c = [];
  for (const [index, value] of Object.entries(values)) c[index] = { v: value };
  return { c };
}
const fixtures = {
  jobs: rows,
  '932464799': [resourceRow({ 2: 'Review School', 4: 'England', 6: 'London', 10: 'VFX training' })],
  '1290941975': [resourceRow({ 2: 'JOB SITES/BOARDS' }), resourceRow({ 2: 'Review Board', 4: 'https://example.com/jobs', 6: 'VFX jobs' })],
};
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end(); }
});

async function check(name, action) {
  console.log('RUN', name);
  try {
    const detail = await action();
    results.push({ name, status: 'passed', detail });
    console.log('PASS', name, detail || '');
  } catch (error) {
    results.push({ name, status: 'failed', error: error.stack });
    console.error('FAIL', name, error.message);
  }
}

(async () => {
  await fs.mkdir(artifacts, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
    async function session(options = {}, mock = true) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', ...options });
      const errors = [], networkErrors = [], requests = {}, gates = new Map();
      // Suppress analytics only; Leaflet, fonts and tiles still load from their real CDNs.
      await context.route(/googletagmanager\.com|google-analytics\.com/, route => route.fulfill({ body: '', contentType: 'text/javascript' }));
      if (mock) await context.route('https://docs.google.com/spreadsheets/**', async route => {
        const url = new URL(route.request().url());
        const gid = url.searchParams.get('gid') || 'jobs';
        requests[gid] = (requests[gid] || 0) + 1;
        if (gates.has(gid)) await gates.get(gid).promise;
        const callback = url.searchParams.get('tqx').match(/responseHandler:([^;]+)/)[1];
        await route.fulfill({ contentType: 'text/javascript', body: `${callback}(${JSON.stringify({ table: { rows: fixtures[gid] || [] } })});` });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('requestfailed', req => networkErrors.push({ url: req.url(), error: req.failure()?.errorText }));
      return { context, page, errors, networkErrors, requests, gates };
    }

    await check('Live Google Sheets, Leaflet and map tiles', async () => {
      const s = await session({}, false);
      try {
        await s.page.goto(base, { waitUntil: 'domcontentloaded' });
        await s.page.waitForFunction(() => typeof JOBS !== 'undefined' && JOBS.length > 0, null, { timeout: 70000 });
        await s.page.locator('.leaflet-marker-icon').first().waitFor();
        await s.page.waitForFunction(() => [...document.querySelectorAll('.leaflet-tile')].some(img => img.complete && img.naturalWidth > 0));
        const jobs = await s.page.evaluate(() => JOBS.length);
        await s.page.screenshot({ path: path.join(artifacts, 'live-desktop.png'), animations: 'disabled' });
        assert.deepEqual(s.errors, []);
        return { jobs, networkErrors: s.networkErrors };
      } finally { await s.context.close(); }
    });

    const desktop = await session();
    const { page } = desktop;
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof JOBS !== 'undefined' && JOBS.length === 45);
    const nav = name => page.locator(`.topnav [data-nav="${name}"]`).click();

    await check('Desktop feed, infinite scroll, search, status and featured filters', async () => {
      assert.equal(await page.locator('.jcard').count(), 30);
      await page.locator('#feed-sentinel').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelectorAll('.jcard').length === 45);
      await page.locator('#search').fill('FX Artist 00');
      await page.waitForFunction(() => filtered.length === 1);
      assert.equal(await page.locator('#hud-jobs').textContent(), '1');
      await page.locator('#status-seg [data-v="new"]').click();
      assert.equal(await page.locator('.jcard').count(), 0);
      await page.locator('#status-seg [data-v="ongoing"]').click();
      assert.equal(await page.locator('.jcard').count(), 1);
      await page.locator('#brand-home').click();
      await page.locator('#featured-only').click();
      assert.equal(await page.locator('.jcard').count(), 1);
      await page.locator('#brand-home').click();
    });

    await check('HTML injection blocked in feed, list, popup and drawer; original posted year shown', async () => {
      assert.ok((await page.locator('.jcard').first().textContent()).includes(payload));
      await page.locator('.leaflet-marker-icon').first().click();
      assert.ok((await page.locator('.leaflet-popup-content').textContent()).includes(payload));
      await page.locator('.pop-job').first().click();
      assert.ok((await page.locator('#drawer-tags').textContent()).includes(payload));
      assert.ok((await page.locator('#dm-posted').textContent()).includes(String(oldYear)));
      await page.locator('#drawer-close').click();
      await nav('list');
      assert.ok((await page.locator('.list-row').first().textContent()).includes(payload));
      assert.equal(await page.locator('.jtag img, .ptag img, .list-loc img').count(), 0);
      assert.equal(await page.evaluate(() => window.__levelXss), undefined);
      await nav('map');
    });

    await check('Save/applied persistence and share deep link', async () => {
      await page.locator('.jcard').first().click();
      await page.locator('#drawer-save').click();
      await page.locator('#drawer-applied').click();
      const url = page.url();
      assert.ok(url.includes('?job=JOB-'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('#drawer-backdrop:not(.hidden)').waitFor();
      assert.equal(await page.locator('#drawer-title').textContent(), 'FX Artist 00');
      assert.equal(await page.locator('#drawer-save-label').textContent(), 'Saved');
      assert.ok(await page.locator('#drawer-applied').evaluate(el => el.classList.contains('is-applied')));
      await page.locator('#drawer-close').click();
      await page.locator('#saved-btn').click();
      assert.equal(await page.locator('#saved-body .sp-saved-row').count(), 1);
      await page.locator('.sp-tab[data-tab="applied"]').click();
      assert.equal(await page.locator('#saved-body .sp-saved-row').count(), 1);
      await page.locator('#saved-close').click();
    });

    for (const [view, gid, content] of [['edu', '932464799', '.edu-card'], ['web', '1290941975', '.web-row']]) {
      await check(`${view}: navigate away and return while JSONP is pending`, async () => {
        let release;
        desktop.gates.set(gid, { promise: new Promise(resolve => { release = resolve; }) });
        try {
          const started = page.waitForRequest(request => request.url().includes('gid=' + gid));
          await nav(view);
          await started;
          await nav('map');
          await nav(view);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          assert.equal(desktop.requests[gid], 1);
        } finally { release(); desktop.gates.delete(gid); }
        await page.locator(content).waitFor();
        assert.equal(await page.evaluate(() => gvizPending.size), 0);
        if (view === 'edu') {
          await page.locator(content).click();
          await page.locator('#drawer-edu-map .leaflet-marker-icon').waitFor();
          await page.locator('#drawer-close').click();
        }
        await nav('map');
      });
    }

    await check('List sorting, CSV download, studios and theme', async () => {
      await nav('list');
      await page.locator('.list-col-btn[data-col="t"]').click();
      assert.ok((await page.locator('.list-row').first().textContent()).includes('FX Artist 00'));
      await page.locator('.list-col-btn[data-col="t"]').click();
      assert.ok((await page.locator('.list-row').first().textContent()).includes('FX Artist 44'));
      const downloadPromise = page.waitForEvent('download');
      await page.locator('#csv-export').click();
      const download = await downloadPromise;
      const csv = await fs.readFile(await download.path(), 'utf8');
      assert.ok(csv.includes('FX Artist 00') && csv.includes('FX Artist 44'));
      await nav('studios');
      await page.locator('.studio-card').first().click();
      await page.locator('#map').waitFor();
      const before = await page.locator('body').evaluate(el => el.classList.contains('light'));
      await page.locator('#theme-toggle').click();
      await page.waitForFunction(value => document.body.classList.contains('light') !== value, before);
      await page.screenshot({ path: path.join(artifacts, 'fixture-desktop.png'), animations: 'disabled' });
    });
    await check('Desktop JavaScript errors', async () => assert.deepEqual(desktop.errors, []));
    await desktop.context.close();

    await check('Traditional Chinese detection and persisted language selection', async () => {
      const s = await session({ locale: 'zh-TW' });
      try {
        await s.page.goto(base, { waitUntil: 'domcontentloaded' });
        await s.page.locator('.jcard').first().waitFor();
        assert.equal(await s.page.evaluate(() => LANG), 'zh-TW');
        await s.page.locator('#lang-btn').click();
        await s.page.locator('.lang-item[data-lang="en"]').click();
        await s.page.reload({ waitUntil: 'domcontentloaded' });
        await s.page.locator('.jcard').first().waitFor();
        assert.equal(await s.page.evaluate(() => LANG), 'en');
        assert.deepEqual(s.errors, []);
      } finally { await s.context.close(); }
    });

    await check('Mobile portrait and landscape navigation, filters, feed and drawer', async () => {
      const s = await session({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      try {
        await s.page.goto(base, { waitUntil: 'domcontentloaded' });
        await s.page.waitForFunction(() => typeof JOBS !== 'undefined' && JOBS.length === 45);
        const mobileNav = name => s.page.locator(`#mobile-nav [data-nav="${name}"]`).click();
        await mobileNav('filters');
        await s.page.locator('.rail.sheet-open').waitFor();
        await s.page.locator('#featured-only').click();
        await mobileNav('feed');
        await s.page.locator('.feed.sheet-open .jcard').click();
        await s.page.locator('#drawer-backdrop:not(.hidden)').waitFor();
        await s.page.locator('#drawer-close').click();
        await mobileNav('list');
        await s.page.locator('.list-row').first().waitFor();
        assert.equal(await s.page.locator('.list-row').count(), 1);
        await mobileNav('more');
        await s.page.locator('.mnav-more-item[data-nav="edu"]').click();
        await s.page.locator('.edu-card').waitFor();
        await s.page.screenshot({ path: path.join(artifacts, 'mobile-portrait.png'), animations: 'disabled' });
        await s.page.setViewportSize({ width: 844, height: 390 });
        await mobileNav('map');
        await mobileNav('feed');
        await s.page.locator('.feed.sheet-open .jcard').click();
        await s.page.locator('#drawer-backdrop:not(.hidden)').waitFor();
        await s.page.locator('#drawer-close').click();
        await s.page.screenshot({ path: path.join(artifacts, 'mobile-landscape.png'), animations: 'disabled' });
        assert.deepEqual(s.errors, []);
      } finally { await s.context.close(); }
    });
  } catch (error) {
    results.push({ name: 'Browser test setup', status: 'failed', error: error.stack });
    console.error(error);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    await fs.writeFile(path.join(artifacts, 'browser-report.json'), JSON.stringify(results, null, 2));
    console.log(`RESULT ${results.filter(r => r.status === 'passed').length}/${results.length} passed`);
    if (results.some(r => r.status === 'failed')) process.exitCode = 1;
  }
})();
