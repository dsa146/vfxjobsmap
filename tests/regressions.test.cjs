const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Run the browser scripts without CDN or Google Sheets access.
function setup(language = 'en', storedLanguage = null) {
  const elements = new Map(), scripts = [], timers = new Map();
  let timerId = 0;
  const element = () => ({
    innerHTML: '', textContent: '', style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, querySelector() { return null; },
  });
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const layer = () => ({ addTo() { return this; }, closePopup() {} });
  const context = vm.createContext({
    console, URL, Date,
    location: { href: 'https://example.test/', pathname: '/' },
    history: { replaceState() {} },
    navigator: { language },
    localStorage: { getItem: () => storedLanguage },
    matchMedia: () => ({ matches: false }),
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    document: {
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
  ['config.js', 'coords.js', 'i18n.js', 'data.js'].forEach(load);
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
  return { context, run, load, row, respond, scripts, timers, elements };
}

test('raw sheet date wins over formatting, preserving the year and shared ID', () => {
  const s = setup();
  const year = new Date().getFullYear() - 1;
  const j = s.context.parseGvizRows([s.row({ v: `Date(${year},8,15)`, f: `Sep 15, ${year}` })])[0];
  assert.equal(j.postedDate.getFullYear(), year);
  assert.equal(j.status, 'ongoing');
  assert.equal(j.id, s.context.stableJobId({ ...j, d: 'Sep 15' }));
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
