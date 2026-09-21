const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Run the browser scripts without CDN or Google Sheets access.
function setup(language = 'en', storedLanguage = null, blockedStorage = false) {
  const elements = new Map(), scripts = [], timers = new Map();
  const storage = new Map();
  let timerId = 0;
  const element = () => ({
    innerHTML: '', textContent: '', style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  });
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const layer = () => ({ addTo() { return this; }, closePopup() {} });
  const context = vm.createContext({
    console, URL, URLSearchParams, Date,
    location: { href: 'https://example.test/', pathname: '/' },
    history: { replaceState() {} },
    navigator: { language },
    localStorage: {
      getItem(key) { if (blockedStorage) throw new Error('SecurityError'); return key === 'vfxmap_lang' ? storedLanguage : storage.get(key) || null; },
      setItem(key, value) { if (blockedStorage) throw new Error('QuotaExceededError'); storage.set(key, value); },
    },
    matchMedia: () => ({ matches: false }),
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    document: {
      addEventListener() {}, querySelectorAll() { return []; },
      getElementById: getElement,
      createElement: element,
      head: {
        appendChild(script) {
          scripts.push(script);
          script.parentNode = { removeChild() { script.parentNode = null; } };
        },
      },
    },
    L: { map: layer, tileLayer: layer, layerGroup: layer },
    elListColBtns: [], elWebColBtns: [], studPanel: element(),
    elListBody: getElement('list-body'),
    elDr: new Proxy({}, { get: (_, key) => getElement('drawer-' + key) }),
    updateDrawerSaveState() {}, updateDrawerAppliedState() {},
  });
  context.window = context;
  const run = code => vm.runInContext(code, context);
  const load = file => run(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
  ['config.js', 'coords.js', 'storage-utils.js', 'i18n.js', 'data.js'].forEach(load);
  run("let fLevel = '', selectedJob = null; let JOBS = [], filtered = []; let eduError = null, webError = null;");
  function row(dateCell, level = 'Senior') {
    const c = [];
    c[0] = { v: 'Example Studio' };
    c[2] = { v: 'London' };
    c[6] = { v: 'United Kingdom' };
    c[8] = { v: 'FX Artist' };
    c[10] = { v: level };
    c[14] = dateCell;
    return { c };
  }
  function respond(script, rows = []) {
    const callback = script.src.match(/responseHandler:([^&]+)/)[1];
    context[callback]({ table: { rows } });
    return callback;
  }
  return { context, run, load, row, respond, scripts, timers, elements, storage };
}

test('raw sheet date wins over formatting, preserving the year and old link alias', () => {
  const s = setup();
  const year = new Date().getFullYear() - 1;
  const j = s.context.parseGvizRows([s.row({ v: `Date(${year},8,15)`, f: `Sep 15, ${year}` })])[0];
  assert.equal(j.postedDate.getFullYear(), year);
  assert.equal(j.status, 'ongoing');
  assert.equal(j.id, s.context.stableJobId({ ...j, d: 'Sep 15' }));
  assert.equal(j.legacyHashId, s.context.legacyJobId(j));
  const numericFormat = s.context.parseGvizRows([s.row({ v: `Date(${year},8,15)`, f: '9/15' })])[0];
  assert.equal(numericFormat.postedDate.getFullYear(), year);
});

test('text dates retain explicit years and yearless dates still parse', () => {
  const s = setup();
  for (const value of ['Sep 15, 2020', 'September 15 2020']) {
    const j = s.context.parseGvizRows([s.row({ v: value })])[0];
    assert.equal(j.postedDate.getFullYear(), 2020);
    assert.equal(j.status, 'ongoing');
  }
  assert.ok(s.context.parseSheetDate('Sep 15'));
  assert.equal(s.context.parseSheetDate(''), null);
});

test('all HTML level renderers escape sheet content; drawer text stays readable', () => {
  const s = setup();
  const payload = '<img src=x onerror=alert(1)> & "custom"';
  const job = s.context.parseGvizRows([s.row({ v: 'Date(2020,8,15)' }, payload)])[0];
  s.context.job = job;
  s.run('JOBS = filtered = [job]');
  ['map.js', 'feed.js', 'views.js', 'drawer.js'].forEach(s.load);
  s.run('updateFeedSelected = () => {}; renderListView(); openDrawer(job.id);');
  const html = [
    s.context.makeCardHTML(job), s.context.buildPopup(job.loc, [job]),
    s.elements.get('list-body').innerHTML, s.elements.get('drawer-tags').innerHTML,
  ];
  for (const rendered of html) {
    assert.ok(!rendered.includes('<img'));
    assert.ok(rendered.includes(s.context.esc(payload)));
  }
  assert.equal(s.elements.get('drawer-level').textContent, payload);
  assert.match(s.elements.get('drawer-posted').textContent, /2020/);
});

for (const [view, gid] of [['Edu', '932464799'], ['Web', '1290941975']]) {
  test(`${view} navigation during loading shares one request and leaves no timeout`, async () => {
    const s = setup();
    s.load('views.js');
    const first = s.context[`init${view}View`]();
    const second = s.context[`init${view}View`]();
    assert.equal(s.scripts.length, 1);
    assert.ok(s.scripts[0].src.includes('gid=' + gid));
    const callback = s.respond(s.scripts[0]);
    await Promise.all([first, second]);
    assert.equal(s.context[callback], undefined);
    assert.equal(s.timers.size, 0);
    assert.equal(s.run(view.toLowerCase() + 'Error'), null);
    await s.context[`init${view}View`]();
    assert.equal(s.scripts.length, 1);
  });
}

test('different sheets use isolated callbacks even with the same callback prefix', async () => {
  const s = setup();
  const first = s.context.fetchGviz('one', 'callback');
  const second = s.context.fetchGviz('two', 'callback');
  const cb2 = s.respond(s.scripts[1], ['second']);
  const cb1 = s.respond(s.scripts[0], ['first']);
  assert.notEqual(cb1, cb2);
  assert.deepEqual(await first, ['first']);
  assert.deepEqual(await second, ['second']);
  assert.equal(s.timers.size, 0);
});

for (const failure of ['network', 'timeout', 'response']) {
  test(`failed ${failure} request can be retried with a fresh callback`, async () => {
    const s = setup();
    const first = s.context.fetchGviz('edu', 'callback');
    const rejection = assert.rejects(first);
    const oldCallback = s.scripts[0].src.match(/responseHandler:([^&]+)/)[1];
    if (failure === 'network') s.scripts[0].onerror();
    else if (failure === 'response') s.context[oldCallback]({ errors: [{ message: 'Invalid sheet' }] });
    else {
      const [id, fn] = s.timers.entries().next().value;
      s.timers.delete(id);
      fn();
    }
    await rejection;
    assert.equal(s.context[oldCallback], undefined);
    const retry = s.context.fetchGviz('edu', 'callback');
    assert.equal(s.scripts.length, 2);
    assert.notEqual(s.respond(s.scripts[1]), oldCallback);
    await retry;
    assert.equal(s.timers.size, 0);
  });
}

test('language detection matches canonical locale keys and honors saved preference', () => {
  for (const [browser, expected] of [['zh-TW', 'zh-TW'], ['zh-tw', 'zh-TW'], ['zh-CN', 'zh'], ['fr-CA', 'fr'], ['xx', 'en']]) {
    assert.equal(setup(browser).run('LANG'), expected);
  }
  assert.equal(setup('zh-TW', 'en').run('LANG'), 'en');
});

test('posting IDs distinguish years and survive row reorder and date formatting changes', () => {
  const s = setup();
  const old = s.row({ v: 'Date(2025,8,15)', f: 'Sep 15, 2025' });
  const fresh = s.row({ v: 'Date(2026,8,15)', f: 'Sep 15, 2026' });
  const [a, b] = s.context.parseGvizRows([old, fresh]);
  assert.notEqual(a.id, b.id);
  const reversed = s.context.parseGvizRows([fresh, old]);
  assert.equal(reversed[0].id, b.id); assert.equal(reversed[1].id, a.id);
  old.c[14].f = '9/15/2025';
  assert.equal(s.context.parseGvizRows([old])[0].id, a.id);
  s.context.jobs = [a, b]; s.run('JOBS = jobs');
  assert.equal(s.context.findJob(a.legacyHashId).id, a.id);
  assert.equal(s.context.findJob(b.legacyHashId).id, b.id);
  assert.equal(s.context.findJob('JOB-0001').id, a.id);
});

test('configured source IDs survive posting metadata edits', () => {
  const s = setup();
  s.run('COL.id = 23');
  const row = s.row({ v: 'Date(2025,8,15)' });
  row.c[23] = { v: 'source-123' };
  const before = s.context.parseGvizRows([row])[0];
  row.c[8] = { v: 'Updated title' }; row.c[16] = { v: 'https://example.test/new-apply' };
  assert.equal(s.context.parseGvizRows([row])[0].id, before.id);
});

test('map invalidates on level, locale and posting changes even when IDs match', () => {
  const s = setup();
  const job = s.context.parseGvizRows([s.row({ v: 'Date(2025,8,15)' }, 'Junior, Senior')])[0];
  s.context.job = job;
  s.run('JOBS = filtered = [job]; let lastMapKey = ""; fLevel = "junior";');
  let clears = 0, popup = '';
  s.context.L.layerGroup = () => ({ addTo() { return this; }, clearLayers() { clears++; }, addLayer() {} });
  s.context.L.divIcon = x => x;
  s.context.L.marker = () => ({ bindPopup(html) { popup = html; } });
  s.load('map.js');
  s.context.updateMap(); assert.match(popup, /Junior/);
  s.context.updateMap(); assert.equal(clears, 1);
  s.run('fLevel = "senior"; updateMap();'); assert.match(popup, /Senior/); assert.equal(clears, 2);
  s.run('LANG = "zh"; updateMap();'); assert.equal(clears, 3);
  s.run('job.t = "Updated role"; updateMap();'); assert.match(popup, /Updated role/); assert.equal(clears, 4);
});

test('studio grouping handles Object prototype names as ordinary studio names', () => {
  const s = setup();
  const rows = ['constructor', '__proto__', 'toString'].map(name => {
    const row = s.row({ v: 'Date(2025,8,15)' }); row.c[0] = { v: name }; return row;
  });
  s.context.jobs = s.context.parseGvizRows(rows);
  s.context.elStudiosBody = { innerHTML: '' };
  s.run('filtered = jobs'); s.load('views.js'); s.context.renderStudiosView();
  for (const name of ['constructor', '__proto__', 'toString']) assert.ok(s.context.elStudiosBody.innerHTML.includes(name));
  assert.equal((s.context.elStudiosBody.innerHTML.match(/class="studio-card"/g) || []).length, 3);
});

test('legacy history migrates once, retains snapshots after delisting and survives reload', () => {
  const s = setup();
  const job = s.context.parseGvizRows([s.row({ v: 'Date(2025,8,15)' })])[0];
  const oldKey = [job.s, job.t, job.loc].join('\x00');
  s.storage.set('vfxmap_saved_v1', JSON.stringify([oldKey]));
  s.storage.set('vfxmap_applied_v1', JSON.stringify([oldKey]));
  s.storage.set('vfxmap_seen_v1', JSON.stringify([oldKey]));
  s.load('storage.js'); s.context.job = job; s.run('JOBS = [job]; reconcileJobHistory();');
  assert.equal(s.run('appliedKeys.has(job.id) && savedKeys.has(job.id) && seenKeys.has(job.id)'), true);
  s.run('JOBS = []; reconcileJobHistory();');
  assert.equal(s.context.findJob(job.id).archived, true);
  const reloaded = setup();
  for (const [key, value] of s.storage) reloaded.storage.set(key, value);
  reloaded.load('storage.js');
  const archived = reloaded.context.findJob(job.id);
  assert.equal(archived.t, job.t); assert.equal(archived.postedDate.getFullYear(), 2025);
  reloaded.context.renderSavedPanel();
  assert.match(reloaded.elements.get('saved-body').innerHTML, /No longer listed/);
  reloaded.context.toggleApplied(archived);
  assert.equal(reloaded.run('appliedKeys.size'), 0);
  assert.equal(reloaded.run('savedKeys.size'), 1);
  reloaded.context.toggleSaved(archived);
  assert.equal(reloaded.run('jobSnapshots.size'), 0);
});

test('missing and ambiguous legacy history remains visible without attaching to a different posting', () => {
  const s = setup();
  const a = s.context.parseGvizRows([s.row({ v: 'Date(2025,8,15)' })])[0];
  const b = s.context.parseGvizRows([s.row({ v: 'Date(2026,8,15)' })])[0];
  const key = [a.s, a.t, a.loc].join('\x00');
  const missing = ['Gone Studio', 'Old Role', 'Paris'].join('\x00');
  s.storage.set('vfxmap_applied_v1', JSON.stringify([key, missing]));
  s.load('storage.js'); s.context.jobs = [a, b]; s.run('JOBS = jobs; reconcileJobHistory();');
  assert.equal(s.run('appliedKeys.size'), 2);
  assert.equal(s.run('appliedKeys.has(JOBS[0].id) || appliedKeys.has(JOBS[1].id)'), false);
  const records = s.run('trackedJobs(appliedKeys)');
  assert.equal(records.length, 2); assert.ok(records.every(j => j.archived));
  s.run('JOBS = [jobs[1]]; reconcileJobHistory();');
  assert.equal(s.run('appliedKeys.has(JOBS[0].id)'), false);
  s.context.toggleApplied(records[1]);
  assert.equal(s.run('appliedKeys.size'), 1);
});

test('a repost from a different year does not inherit an earlier application', () => {
  const s = setup(); s.load('storage.js');
  const a = s.context.parseGvizRows([s.row({ v: 'Date(2025,8,15)' })])[0];
  const b = s.context.parseGvizRows([s.row({ v: 'Date(2026,8,15)' })])[0];
  s.context.toggleApplied(a); s.context.job = b;
  s.run('JOBS = [job]; reconcileJobHistory();');
  assert.equal(s.run('appliedKeys.has(job.id)'), false);
  assert.equal(s.context.findJob(a.id).archived, true);
});

test('blocked storage permits language detection, job loading and in-memory saved state', async () => {
  const s = setup('fr', null, true);
  assert.equal(s.run('LANG'), 'fr');
  s.load('storage.js');
  const job = s.context.parseGvizRows([s.row({ v: 'Date(2025,8,15)' })])[0];
  s.context.fetchSheetJobs = async () => [job];
  s.context.makeSkelFeed = () => '';
  s.context.elFeedList = { innerHTML: '' };
  let renders = 0;
  s.context.applyFilters = () => { renders++; };
  s.run(fs.readFileSync(path.join(__dirname, '..', 'boot.js'), 'utf8').split('(function initTheme()')[0]);
  await s.context.initData();
  assert.equal(s.context.dataLoadFailed, false); assert.equal(renders, 1);
  assert.equal(s.timers.size, 0);
  s.context.toggleSaved(job);
  assert.equal(s.run('savedKeys.size'), 1);
});

test('rendering failures do not schedule a network retry', async () => {
  const s = setup(); s.load('storage.js');
  s.context.fetchSheetJobs = async () => [];
  s.context.makeSkelFeed = () => ''; s.context.elFeedList = { innerHTML: '' };
  s.context.applyFilters = () => { throw new Error('render failed'); };
  s.run(fs.readFileSync(path.join(__dirname, '..', 'boot.js'), 'utf8').split('(function initTheme()')[0]);
  await assert.rejects(s.context.initData(), /render failed/);
  assert.equal(s.timers.size, 0); assert.equal(s.context.dataLoadFailed, false);
});
