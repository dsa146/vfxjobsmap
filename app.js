// ── Constants ─────────────────────────────────────────────────────────────
const FETCH_TIMEOUT_MS  = 20000;
const FETCH_RETRY_MS    = 2000;
const FETCH_MAX_RETRIES = 3;
const SEARCH_DEBOUNCE_MS = 150;
const SIG_INTERVAL_MS   = 30000;
const SIG_TIMEOUT_MS    = 4000;
const NOTIF_SEEN_DELAY_MS = 2000;
const FEED_PAGE_SIZE    = 30;

// ── Utilities ─────────────────────────────────────────────────────────────
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function hexRgba(hex, a) {
  const m = hex.replace('#',''); const n = parseInt(m,16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function swRegex(sw)  { return new RegExp('(?:^|[^a-z0-9])' + escapeRe(sw) + '(?:[^a-z0-9]|$)'); }

// ── Date / age helpers ────────────────────────────────────────────────────
function parseSheetDate(raw) {
  if (!raw) return null;
  const s = String(raw);
  const gviz = s.match(/Date\((\d+),(\d+),(\d+)\)/);
  if (gviz) return new Date(+gviz[1], +gviz[2], +gviz[3]);
  const months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  const m = s.match(/(\w{3})\w*\.?\s+(\d+)/);
  if (!m) return null;
  const mo = months[m[1]], day = parseInt(m[2]);
  if (mo === undefined || isNaN(day)) return null;
  return new Date(new Date().getFullYear(), mo, day);
}

function getStatus(date) {
  if (!date) return 'ongoing';
  const diffDays = (Date.now() - date.getTime()) / 86400000;
  if (diffDays < 1)  return 'new';
  if (diffDays < 4)  return 'recent';
  if (diffDays < 10) return 'active';
  return 'ongoing';
}

function getPostedH(date) {
  if (!date) return 500;
  return Math.max(1, Math.round((Date.now() - date.getTime()) / 3600000));
}

function fmtAge(h) {
  if (h >= 48) return t('app.age_d', Math.round(h / 24));
  return t('app.age_h', h);
}

// ── Job field classifiers ─────────────────────────────────────────────────
function getDisc(title) {
  const t = title.toLowerCase();
  if (/compositor|compositing|lighting\/compositing|matte paint/.test(t)) return 'comp';
  if (/\blighting\b/.test(t)) return 'light';
  if (/\banimator|\banimation/.test(t)) return 'anim';
  if (/\bvfx|\bfx\b|fx artist|fx td|cfx/.test(t)) return 'fx';
  if (/modeler|environment artist|character|concept|texture|look dev|generalist|groom|storyboard|illustrator|2d artist|3d artist/.test(t)) return 'model';
  if (/rigger|rigging/.test(t)) return 'rig';
  if (/pipeline|technical director|\btd\b|programmer|developer|engineer|systems|build engineer|technical artist|technical animator/.test(t)) return 'pipe';
  return 'prod';
}

function getRemote(w) {
  const lw = (w || '').toLowerCase();
  if (lw.includes('remote') && lw.includes('on-site')) return 'Hybrid';
  if (lw === 'hybrid') return 'Hybrid';
  if (lw.includes('on-site') || lw.includes('onsite')) return 'On-site';
  return 'Remote';
}
function tLevel(l) {
  const lw = (l || '').toLowerCase();
  if (lw.includes('sup') || lw.includes('manager')) return t('level.sup');
  if (lw.includes('lead')) return t('level.lead');
  if (lw.includes('senior')) return t('level.senior');
  if (lw.includes('mid')) return t('level.mid');
  if (lw.includes('junior') || lw.includes('jr')) return t('level.junior');
  return l || '—';
}
function tRemote(remote) {
  if (remote === 'Remote') return t('work.remote');
  if (remote === 'Hybrid') return t('work.hybrid');
  if (remote === 'On-site') return t('work.on_site');
  return remote;
}

function getCoords(j) {
  if (!j.c) return CO_LL[j.co] || null;
  return CC[j.c + '|' + j.co] || CC[j.c] || CO_LL[j.co] || null;
}


// ── Sheet fetch ───────────────────────────────────────────────────────────
function parseGvizRows(rows) {
  return rows.map(row => {
    const c = row.c;
    const get = i => (c[i] && c[i].v != null) ? String(c[i].v).trim() : '';
    const studio = get(COL.studio), title = get(COL.title);
    if (!studio || !title) return null;
    const dateRaw = c[COL.date] ? (c[COL.date].f || c[COL.date].v) : '';
    const dateStr = dateRaw ? String(dateRaw).replace(/,?\s*\d{4}$/, '').trim() : '';
    return { s:studio, c:get(COL.city), co:get(COL.country), t:title,
             l:get(COL.level), w:get(COL.workMode), d:dateStr,
             r:COUNTRY_REGION[get(COL.country)] || get(COL.region), u:get(COL.contact), sw:get(COL.software), n:get(COL.notes) };
  }).filter(Boolean).map((j, i) => {
    const date = parseSheetDate(j.d);
    const base = {
      ...j,
      id: 'JOB-' + String(i+1).padStart(4,'0'),
      disc: getDisc(j.t), status: getStatus(date), postedH: getPostedH(date),
      remote: getRemote(j.w), ll: getCoords(j),
      loc: j.c ? (j.co ? j.c + ', ' + j.co : j.c) : (j.co || ''),
    };
    base._hay    = `${base.t} ${base.sw||''} ${base.n}`.toLowerCase();
    base._search = `${base.t} ${base.s} ${base.c} ${base.co}`.toLowerCase();
    return base;
  });
}

function fetchSheetJobs() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      if (script.parentNode) script.parentNode.removeChild(script);
      reject(new Error('Request timed out'));
    }, FETCH_TIMEOUT_MS);

    window.google = window.google || {};
    window.google.visualization = window.google.visualization || {};
    window.google.visualization.Query = {
      setResponse: function(res) {
        clearTimeout(timer);
        if (script.parentNode) script.parentNode.removeChild(script);
        if (!res || !res.table) {
          const msg = res && res.errors ? res.errors[0].detailed_message || res.errors[0].message : 'No data returned';
          reject(new Error(msg)); return;
        }
        try { resolve(parseGvizRows(res.table.rows)); } catch(e) { reject(e); }
      }
    };
    script.onerror = () => {
      clearTimeout(timer);
      if (script.parentNode) script.parentNode.removeChild(script);
      reject(new Error('Network error — check internet connection'));
    };
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&t=${Date.now()}`;
    document.head.appendChild(script);
  });
}

async function initData(attempt) {
  attempt = attempt || 1;
  elFeedList.innerHTML = `<div style="padding:24px 16px;color:#555;font-size:12px;font-family:monospace;text-align:center">
    ${t('app.loading', attempt)}</div>`;
  try {
    JOBS = await fetchSheetJobs();
    computeNewJobs();
    applyFilters();
    const sharedJob = new URLSearchParams(location.search).get('job');
    if (sharedJob && JOBS.find(j => j.id === sharedJob)) openDrawer(sharedJob);
  } catch(e) {
    console.error('Sheet fetch failed (attempt ' + attempt + '):', e);
    if (attempt < FETCH_MAX_RETRIES) { setTimeout(() => initData(attempt + 1), FETCH_RETRY_MS); return; }
    elFeedList.innerHTML =
      `<div style="padding:20px;color:#F5A524;font-size:12px;font-family:monospace;line-height:1.8">
        ⚠ ${t('app.failed')}<br>
        <span style="color:#7A7A85;font-size:11px">${esc(e.message)}</span><br><br>
        <button onclick="initData()" style="background:var(--amber);color:#1a1200;border:0;padding:6px 14px;font-family:monospace;font-size:11px;letter-spacing:.12em;cursor:pointer">${t('app.retry')}</button>
      </div>`;
  }
}

// ── App state ─────────────────────────────────────────────────────────────
let JOBS = [];
let fDiscs = [], fSofts = [], fSoftRegexes = [], fStatus = 'all', fRemote = 'Any', fRegion = '', fLevel = '', fQuery = '';
let selectedJob = null, filtered = [], lastMapKey = '';
let feedPage = 1, feedObserver = null;

// ── DOM cache ─────────────────────────────────────────────────────────────
const elFeedList     = document.getElementById('feed-list');
const elFeedCount    = document.getElementById('feed-count');
const elListBody     = document.getElementById('list-body');
const elHudJobs      = document.getElementById('hud-jobs');
const elHudStudios   = document.getElementById('hud-studios');
const elHudCountries = document.getElementById('hud-countries');
const elRailCount    = document.getElementById('rail-count');
const elStudiosBody  = document.getElementById('studios-body');
const elTcTime       = document.getElementById('tc-time');
const elLc = {
  new:     document.getElementById('lc-new'),
  recent:  document.getElementById('lc-recent'),
  active:  document.getElementById('lc-active'),
  ongoing: document.getElementById('lc-ongoing'),
};
const elSig = {
  hud: document.getElementById('sig-hud'),
  tc:  document.getElementById('sig-tc'),
};
const elDr = {
  backdrop:    document.getElementById('drawer-backdrop'),
  eye:         document.getElementById('drawer-eye'),
  title:       document.getElementById('drawer-title'),
  studio:      document.getElementById('drawer-studio'),
  city:        document.getElementById('drawer-city'),
  tags:        document.getElementById('drawer-tags'),
  posted:      document.getElementById('dm-posted'),
  mode:        document.getElementById('dm-mode'),
  level:       document.getElementById('dm-level'),
  sname:       document.getElementById('dm-sname'),
  smeta:       document.getElementById('dm-smeta'),
  notesSection:document.getElementById('drawer-notes-section'),
  notes:       document.getElementById('drawer-notes'),
  viewStudio:  document.getElementById('drawer-view-studio'),
  save:        document.getElementById('drawer-save'),
  saveLabel:   document.getElementById('drawer-save-label'),
  saveIconOff: document.getElementById('drawer-save-icon-off'),
  saveIconOn:  document.getElementById('drawer-save-icon-on'),
  share:       document.getElementById('drawer-share'),
  shareLabel:  document.getElementById('drawer-share-label'),
  apply:       document.getElementById('drawer-apply'),
};
const elListColBtns = document.querySelectorAll('.list-col-btn');

// ── Map ───────────────────────────────────────────────────────────────────
const map = L.map('map', {
  center: [30, 10], zoom: 2, minZoom: 2, maxZoom: 10,
  zoomControl: true, worldCopyJump: false,
  maxBounds: [[-90,-180],[90,180]], maxBoundsViscosity: 1.0,
});
const ATTR = '&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const tileDark  = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',  {attribution:ATTR,subdomains:'abcd',maxZoom:19});
const tileLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {attribution:ATTR,subdomains:'abcd',maxZoom:19});
tileDark.addTo(map);
const markerLayer = L.layerGroup().addTo(map);

function worstStatus(statuses) {
  return statuses.reduce((a,b) => STATUS_PRIORITY[b] > STATUS_PRIORITY[a] ? b : a, 'ongoing');
}

function makeIcon(status, count) {
  const col = STATUS_COLOR[status];
  const badge = count > 1 ? `<span class="pin-count">${count}</span>` : '';
  return L.divIcon({
    html: `<div class="pin-wrap"><span class="pin-pulse" style="border-color:${col}55"></span><span class="pin-dot" style="background:${col};box-shadow:0 0 10px ${col}88"></span>${badge}</div>`,
    className:'', iconSize:[24,24], iconAnchor:[12,12], popupAnchor:[0,-16],
  });
}

function updateMap() {
  const key = filtered.map(j=>j.id).join(',');
  if (key === lastMapKey) return;
  lastMapKey = key;
  markerLayer.clearLayers();
  const groups = {};
  filtered.forEach(j => {
    if (!j.ll) return;
    const k = j.ll[0].toFixed(2)+','+j.ll[1].toFixed(2);
    if (!groups[k]) groups[k] = {ll:j.ll, jobs:[], label:j.loc};
    groups[k].jobs.push(j);
  });
  Object.values(groups).forEach(g => {
    const status = worstStatus(g.jobs.map(j=>j.status));
    const m = L.marker(g.ll, {icon: makeIcon(status, g.jobs.length)});
    m.bindPopup(buildPopup(g.label, g.jobs), {maxWidth:280, className:''});
    markerLayer.addLayer(m);
  });
}

function buildPopup(city, jobs) {
  const rows = jobs.map(j => {
    const disc = DISC_MAP[j.disc];
    return `<div class="pop-job" onclick="openDrawer('${j.id}')">
      <div class="pop-job-title">${esc(j.t)}</div>
      <div class="pop-job-studio">${esc(j.s)}</div>
      <div class="pop-tags">
        <span class="ptag" style="color:${disc?.color};border-color:${disc?.color}44">${t('disc.' + j.disc)}</span>
        <span class="ptag">${tLevel(j.l)}</span>
        <span class="ptag">${tRemote(j.remote)}</span>
      </div>
    </div>`;
  }).join('');
  return `<div class="pop-head"><div class="pop-city">${esc(city)}</div><div class="pop-cnt">${t('app.positions', jobs.length)}</div></div><div class="pop-list">${rows}</div>`;
}

// ── Feed ──────────────────────────────────────────────────────────────────
let feedSorted = [];

function makeCardHTML(j) {
  const disc = DISC_MAP[j.disc], sc = STATUS_COLOR[j.status];
  return `<button class="jcard" data-id="${j.id}" onclick="openDrawer('${j.id}')">
    <div class="jcard-eye">
      <span class="eye-dot" style="background:${sc};box-shadow:0 0 8px ${sc}"></span>
      <span style="color:${sc};text-transform:uppercase">${t('status.' + j.status)}</span>
      <span class="eye-sep">·</span>
      <span>${fmtAge(j.postedH)}</span>
      <span class="eye-id">${j.id}</span>
    </div>
    <div class="jcard-title">${esc(j.t)}</div>
    <div class="jcard-studio">${esc(j.s)} · ${esc(j.loc)}</div>
    <div class="jcard-tags">
      <span class="jtag-disc" style="color:${disc?.color};border-color:${disc?.color}">${t('disc.' + j.disc)}</span>
      <span class="jtag">${tLevel(j.l)}</span>
      <span class="jtag">${tRemote(j.remote)}</span>
    </div>
  </button>`;
}

function attachFeedObserver() {
  if (feedObserver) { feedObserver.disconnect(); feedObserver = null; }
  const sentinel = document.getElementById('feed-sentinel');
  if (!sentinel) return;
  feedObserver = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;
    feedObserver.disconnect(); feedObserver = null;
    sentinel.remove();
    const start = feedPage * FEED_PAGE_SIZE;
    feedPage++;
    const slice = feedSorted.slice(start, feedPage * FEED_PAGE_SIZE);
    slice.forEach(j => elFeedList.insertAdjacentHTML('beforeend', makeCardHTML(j)));
    if (feedPage * FEED_PAGE_SIZE < feedSorted.length) {
      elFeedList.insertAdjacentHTML('beforeend', '<div id="feed-sentinel" style="height:1px"></div>');
      attachFeedObserver();
    }
  }, {root: elFeedList, threshold: 0});
  feedObserver.observe(sentinel);
}

function renderFeed() {
  if (feedObserver) { feedObserver.disconnect(); feedObserver = null; }
  feedPage = 1;
  elFeedCount.textContent = t('app.x_events', filtered.length);
  if (!filtered.length) {
    elFeedList.innerHTML = `<div style="padding:24px;font-family:var(--font-m);font-size:11px;letter-spacing:.14em;color:var(--fg-4);text-align:center;text-transform:uppercase">${t('feed.no_matches')}</div>`;
    feedSorted = []; return;
  }
  feedSorted = [...filtered].sort((a,b) => (STATUS_ORDER[a.status]??3) - (STATUS_ORDER[b.status]??3) || a.postedH - b.postedH);
  const initial = feedSorted.slice(0, FEED_PAGE_SIZE);
  elFeedList.innerHTML = initial.map(makeCardHTML).join('');
  if (feedSorted.length > FEED_PAGE_SIZE) {
    elFeedList.insertAdjacentHTML('beforeend', '<div id="feed-sentinel" style="height:1px"></div>');
    attachFeedObserver();
  }
}

function updateFeedSelected(prevId, nextId) {
  if (prevId) elFeedList.querySelector(`[data-id="${prevId}"]`)?.classList.remove('selected');
  if (nextId) elFeedList.querySelector(`[data-id="${nextId}"]`)?.classList.add('selected');
}

// ── HUD ───────────────────────────────────────────────────────────────────
function updateHUD() {
  const studios = new Set(), countries = new Set();
  const cnt = {new:0, recent:0, active:0, ongoing:0};
  for (const j of filtered) { studios.add(j.s); countries.add(j.co); cnt[j.status]++; }
  elHudJobs.textContent      = filtered.length;
  elHudStudios.textContent   = studios.size;
  elHudCountries.textContent = countries.size;
  elRailCount.textContent    = t('app.x_matches', filtered.length);
  elLc.new.textContent     = cnt.new;
  elLc.recent.textContent  = cnt.recent;
  elLc.active.textContent  = cnt.active;
  elLc.ongoing.textContent = cnt.ongoing;
}

// ── Drawer ────────────────────────────────────────────────────────────────
function openDrawer(jobId) {
  map.closePopup();
  const j = JOBS.find(x => x.id === jobId);
  if (!j) return;
  const prevId = selectedJob?.id;
  selectedJob = j;

  const disc = DISC_MAP[j.disc], sc = STATUS_COLOR[j.status];

  elDr.eye.innerHTML = `
    <span class="eye-dot" style="background:${sc};box-shadow:0 0 8px ${sc}"></span>
    <span style="color:${sc}">${j.status.toUpperCase()}</span>
    <span class="eye-sep">·</span>
    <span>${j.id} · POSTED ${fmtAge(j.postedH).toUpperCase()}</span>`;

  elDr.title.textContent  = j.t;
  elDr.studio.textContent = j.s;
  elDr.city.innerHTML = `
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-7-4.5-7-11a7 7 0 1 1 14 0c0 6.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>
    ${esc(j.loc)}`;

  const relJobs = filtered.filter(x => x.s === j.s);
  elDr.tags.innerHTML = `
    <span class="jtag-disc" style="color:${disc?.color};border-color:${disc?.color}">${t('disc.' + j.disc)}</span>
    <span class="jtag">${tLevel(j.l)}</span>
    <span class="jtag">${tRemote(j.remote)}</span>`;

  elDr.posted.textContent = j.d + ', ' + new Date().getFullYear();
  elDr.mode.textContent   = tRemote(j.remote);
  elDr.level.textContent  = tLevel(j.l);
  elDr.sname.textContent  = j.s;
  elDr.smeta.innerHTML    = t('app.open_roles_meta', relJobs.length, t('status.' + j.status), sc);

  if (j.n) { elDr.notes.textContent = j.n; elDr.notesSection.style.display = ''; }
  else      { elDr.notesSection.style.display = 'none'; }

  elDr.viewStudio.onclick = () => {
    closeDrawer();
    fQuery = j.s;
    searchEl.value = j.s;
    updateSearchClear();
    applyFilters();
    switchView('studios');
  };

  updateDrawerSaveState(j);
  elDr.save.onclick  = () => toggleSaved(j);
  elDr.share.onclick = () => {
    const url = location.origin + location.pathname + '?job=' + j.id;
    navigator.clipboard.writeText(url).then(() => {
      elDr.shareLabel.textContent = t('drawer.copied');
      setTimeout(() => { elDr.shareLabel.textContent = t('drawer.share'); }, 2000);
    });
  };

  if (j.u) {
    elDr.apply.onclick = () => window.open(j.u, '_blank', 'noopener');
    elDr.apply.style.opacity = '1'; elDr.apply.style.pointerEvents = '';
  } else {
    elDr.apply.onclick = null;
    elDr.apply.style.opacity = '0.4'; elDr.apply.style.pointerEvents = 'none';
  }

  elDr.backdrop.classList.remove('hidden');
  updateFeedSelected(prevId, j.id);
  history.replaceState(null, '', '?job=' + j.id);
}

function closeDrawer() {
  elDr.backdrop.classList.add('hidden');
  updateFeedSelected(selectedJob?.id, null);
  selectedJob = null;
  history.replaceState(null, '', location.pathname);
}

elDr.backdrop.addEventListener('click', closeDrawer);
document.getElementById('drawer-close').addEventListener('click', closeDrawer);
document.getElementById('drawer').addEventListener('click', e => e.stopPropagation());

// ── Filters ───────────────────────────────────────────────────────────────
function applyFilters() {
  const fQueryLc = fQuery ? fQuery.toLowerCase() : '';
  filtered = JOBS.filter(j => {
    if (fDiscs.length && !fDiscs.includes(j.disc)) return false;
    if (fStatus !== 'all' && j.status !== fStatus) return false;
    if (fRemote !== 'Any' && j.remote !== fRemote) return false;
    if (fRegion && j.r !== fRegion) return false;
    if (fLevel) {
      const lv = j.l.toLowerCase();
      const lvMatch = fLevel === 'sup' ? (lv.includes('sup') || lv.includes('manager')) : lv.includes(fLevel);
      if (!lvMatch) return false;
    }
    if (fSoftRegexes.length && !fSoftRegexes.some(re => re.test(j._hay))) return false;
    if (fQueryLc && !j._search.includes(fQueryLc)) return false;
    return true;
  });
  listDirty = true; studiosDirty = true;
  updateHUD(); updateMap(); renderFeed();
  if (currentView === 'list')    renderListView();
  if (currentView === 'studios') renderStudiosView();
}

// ── Discipline chips ──────────────────────────────────────────────────────
const chipWrap = document.getElementById('disc-chips');
DISCS.forEach(d => {
  const btn = document.createElement('button');
  btn.className = 'disc-chip';
  btn.innerHTML = `<span class="chip-dot" style="background:${d.color}"></span><span data-i18n="disc.${d.id}">${t('disc.' + d.id)}</span>`;
  btn.onclick = () => {
    if (fDiscs.includes(d.id)) {
      fDiscs = fDiscs.filter(x => x !== d.id);
      btn.classList.remove('on');
      btn.style.borderColor = ''; btn.style.color = ''; btn.style.background = '';
    } else {
      fDiscs.push(d.id);
      btn.classList.add('on');
      btn.style.borderColor = d.color; btn.style.color = d.color;
      btn.style.background  = hexRgba(d.color, .08);
    }
    applyFilters();
  };
  chipWrap.appendChild(btn);
});

// ── Software chips ────────────────────────────────────────────────────────
document.querySelectorAll('.soft-chip').forEach(btn => {
  btn.onclick = () => {
    const sw = btn.textContent.trim().toLowerCase();
    if (fSofts.includes(sw)) {
      const i = fSofts.indexOf(sw);
      fSofts.splice(i, 1); fSoftRegexes.splice(i, 1);
      btn.classList.remove('on');
    } else {
      fSofts.push(sw); fSoftRegexes.push(swRegex(sw));
      btn.classList.add('on');
    }
    applyFilters();
  };
});

// ── Segmented controls ────────────────────────────────────────────────────
function wireSegmented(id, onChange) {
  const btns = document.getElementById(id).querySelectorAll('.seg-item');
  btns.forEach(btn => {
    btn.onclick = () => {
      btns.forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      onChange(btn.dataset.v);
    };
  });
}
wireSegmented('status-seg', v => { fStatus = v; applyFilters(); });
wireSegmented('remote-seg', v => { fRemote = v; applyFilters(); });
wireSegmented('level-seg',  v => { fLevel  = v; applyFilters(); });
wireSegmented('region-seg', v => { fRegion = v; applyFilters(); });

// ── Search ────────────────────────────────────────────────────────────────
const searchEl  = document.getElementById('search');
const clearBtn  = document.getElementById('search-clear');
const searchKbd = document.getElementById('search-kbd');

const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
searchKbd.textContent = isMac ? '⌘K' : 'Ctrl+K';

document.addEventListener('keydown', e => {
  const ctrl = isMac ? e.metaKey : e.ctrlKey;
  if (ctrl && e.key === 'k') { e.preventDefault(); searchEl.focus(); searchEl.select(); }
  if (e.key === 'Escape' && document.activeElement === searchEl) searchEl.blur();
});

function updateSearchClear() {
  const hasVal = searchEl.value.length > 0;
  clearBtn.classList.toggle('visible', hasVal);
  searchKbd.style.display = hasVal ? 'none' : '';
}

let searchTimer = 0;
searchEl.addEventListener('input', e => {
  fQuery = e.target.value.trim();
  updateSearchClear();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, SEARCH_DEBOUNCE_MS);
});
clearBtn.addEventListener('click', () => {
  searchEl.value = ''; fQuery = '';
  applyFilters(); updateSearchClear(); searchEl.focus();
});

// ── Timecode ──────────────────────────────────────────────────────────────
function updateTimecode() {
  const n = new Date(), pad = x => String(x).padStart(2,'0');
  elTcTime.textContent = `${pad(n.getUTCHours())}:${pad(n.getUTCMinutes())}:${pad(n.getUTCSeconds())} UTC`;
}
updateTimecode();
setInterval(updateTimecode, 1000);

// ── Signal (ping) ─────────────────────────────────────────────────────────
function pingToSig(ms) { return Math.max(0, Math.round(100 - Math.sqrt(ms) * 1.8)); }
function setSig(val) {
  const txt = 'SIG ' + val + '%';
  elSig.hud.textContent = txt;
  elSig.tc.textContent  = txt;
}
async function updateSig() {
  try {
    const img = new Image(), t = Date.now();
    await new Promise((res, rej) => {
      const timeout = setTimeout(() => { img.src = ''; rej(new Error('timeout')); }, SIG_TIMEOUT_MS);
      img.onload = img.onerror = () => { clearTimeout(timeout); res(); };
      img.src = 'https://www.gstatic.com/generate_204?t=' + t;
    });
    setSig(pingToSig(Date.now() - t));
  } catch { setSig(0); }
}
updateSig();
setInterval(updateSig, SIG_INTERVAL_MS);

// ── View navigation ───────────────────────────────────────────────────────
const mapPanel  = document.querySelector('.main');
const listPanel = document.getElementById('panel-list');
const studPanel = document.getElementById('panel-studios');
const navLinks  = document.querySelectorAll('.topnav a');
let currentView = 'map';

const mqlLandscape = window.matchMedia('(max-height:500px) and (orientation:landscape)');

function switchView(name) {
  currentView = name;
  navLinks.forEach(a => a.classList.toggle('active', a.dataset.nav === name));
  const landscape = mqlLandscape.matches;
  const mapWithPanel = landscape && name !== 'list' && name !== 'studios';
  mapPanel.style.display  = (name === 'map' || mapWithPanel) ? '' : 'none';
  listPanel.style.display = name === 'list'    ? 'flex' : 'none';
  studPanel.style.display = name === 'studios' ? 'flex' : 'none';
  if (name === 'list')    requestAnimationFrame(renderListView);
  if (name === 'studios') requestAnimationFrame(renderStudiosView);
  if (name === 'map' || mapWithPanel) map.invalidateSize();
  syncMobileNav(name);
}

window.addEventListener('orientationchange', () => {
  setTimeout(() => { switchView(currentView); map.invalidateSize(); }, 300);
});
navLinks.forEach(a => a.addEventListener('click', () => switchView(a.dataset.nav)));

// ── List view ─────────────────────────────────────────────────────────────
let listDirty = true, studiosDirty = true;
let listSort = {col: null, dir: 1};

function updateListHeaders() {
  elListColBtns.forEach(btn => {
    const isActive = btn.dataset.col === listSort.col;
    btn.classList.toggle('active', isActive);
    btn.querySelector('.list-sort-icon').textContent = isActive ? (listSort.dir === 1 ? '↑' : '↓') : '↕';
  });
}
elListColBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const col = btn.dataset.col;
    if (listSort.col === col) listSort.dir *= -1;
    else { listSort.col = col; listSort.dir = 1; }
    updateListHeaders();
    listDirty = true; renderListView();
  });
});

function renderListView() {
  if (!listDirty) return;
  listDirty = false;
  let rows = [...filtered];
  if (listSort.col) {
    rows.sort((a,b) => {
      let av = a[listSort.col]||'', bv = b[listSort.col]||'';
      if (listSort.col === 'status') { av = STATUS_ORDER[av]??9; bv = STATUS_ORDER[bv]??9; return (av-bv)*listSort.dir; }
      return av.toString().localeCompare(bv.toString()) * listSort.dir;
    });
  }
  elListBody.innerHTML = rows.map(j => {
    const sc = STATUS_COLOR[j.status];
    return `<div class="list-row" onclick="openDrawer('${j.id}')">
      <div><div class="list-role">${esc(j.t)}</div></div>
      <div class="list-studio">${esc(j.s)}</div>
      <div class="list-loc">${esc(j.loc)}</div>
      <div class="list-loc">${tRemote(j.remote)}</div>
      <div class="list-loc">${tLevel(j.l)}</div>
      <div style="display:flex;align-items:center;gap:6px">
        <div class="list-dot" style="background:${sc};box-shadow:0 0 6px ${sc}"></div>
        <span class="list-badge" style="color:${sc};border-color:${sc}20">${t('status.' + j.status)}</span>
      </div>
    </div>`;
  }).join('');
}

// ── Studios view ──────────────────────────────────────────────────────────
function renderStudiosView() {
  if (!studiosDirty) return;
  studiosDirty = false;
  const studioMap = {};
  filtered.forEach(j => {
    if (!studioMap[j.s]) studioMap[j.s] = {name:j.s, locs:new Set(), roles:[], jobs:[]};
    studioMap[j.s].locs.add(j.loc);
    studioMap[j.s].roles.push(j.t);
    studioMap[j.s].jobs.push(j);
  });
  const studios = Object.values(studioMap).sort((a,b) => b.jobs.length - a.jobs.length);
  elStudiosBody.innerHTML = studios.map(st => {
    const topRoles = [...new Set(st.roles)].slice(0,4);
    const locs = [...st.locs].slice(0,2).join(' · ');
    const topStatus = st.jobs.reduce((best,j) => STATUS_PRIORITY[j.status]>STATUS_PRIORITY[best.status]?j:best, st.jobs[0]).status;
    const sc = STATUS_COLOR[topStatus];
    return `<div class="studio-card" data-studio="${esc(st.name)}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="sc-name">${esc(st.name)}</div>
        <div class="list-dot" style="background:${sc};box-shadow:0 0 8px ${sc};flex:none;margin-top:4px"></div>
      </div>
      <div class="sc-loc">${esc(locs)||'—'}</div>
      <div class="sc-roles">${topRoles.map(r=>`<span class="sc-role-chip">${esc(r)}</span>`).join('')}${st.roles.length>4?`<span class="sc-role-chip">+${st.roles.length-4}</span>`:''}</div>
      <div class="sc-footer">
        <div>
          <div class="sc-count">${st.jobs.length}</div>
          <div class="sc-count-l">${t('app.open_roles', st.jobs.length)}</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

studPanel.addEventListener('click', e => {
  const card = e.target.closest('.studio-card');
  if (!card) return;
  fQuery = card.dataset.studio;
  document.getElementById('search').value = fQuery;
  updateSearchClear(); applyFilters(); switchView('map');
});

// ── Brand home ────────────────────────────────────────────────────────────
document.getElementById('brand-home').addEventListener('click', e => {
  e.preventDefault();
  fQuery = ''; fDiscs = []; fSofts = []; fSoftRegexes = []; fStatus = 'all'; fRemote = 'Any'; fRegion = ''; fLevel = '';
  document.getElementById('search').value = '';
  updateSearchClear();
  document.querySelectorAll('.disc-chip.on').forEach(b => {
    b.classList.remove('on'); b.style.borderColor=''; b.style.color=''; b.style.background='';
  });
  document.querySelectorAll('.soft-chip.on').forEach(b => b.classList.remove('on'));
  document.getElementById('status-seg').querySelectorAll('.seg-item').forEach((b,i) => b.classList.toggle('on', i===0));
  document.getElementById('remote-seg').querySelectorAll('.seg-item').forEach((b,i) => b.classList.toggle('on', i===0));
  document.getElementById('level-seg').querySelectorAll('.seg-item').forEach((b,i)  => b.classList.toggle('on', i===0));
  document.getElementById('region-seg').querySelectorAll('.seg-item').forEach((b,i) => b.classList.toggle('on', i===0));
  closeMobileSheet();
  applyFilters(); switchView('map');
});

// ── Theme ─────────────────────────────────────────────────────────────────
document.getElementById('theme-toggle').addEventListener('click', () => {
  const goingLight = !document.body.classList.contains('light');
  const applyTheme = () => {
    document.body.classList.toggle('light');
    document.getElementById('theme-icon-dark').style.display  = goingLight ? 'none' : '';
    document.getElementById('theme-icon-light').style.display = goingLight ? '' : 'none';
    localStorage.setItem('vfxmap_theme', goingLight ? 'light' : 'dark');
    if (goingLight) { map.removeLayer(tileDark);  tileLight.addTo(map); }
    else            { map.removeLayer(tileLight); tileDark.addTo(map);  }
  };
  if (!document.startViewTransition) { applyTheme(); return; }
  document.startViewTransition(applyTheme);
});

// ── CSV export ────────────────────────────────────────────────────────────
function exportCSV() {
  const headers = ['ID','Title','Studio','City','Country','Work Mode','Level','Status','Posted','Contact','Software','Notes'];
  const csvRows = [
    headers.join(','),
    ...filtered.map(j => [j.id,j.t,j.s,j.c,j.co,j.w,j.l,j.status,j.d,j.u,j.sw,j.n]
      .map(v => `"${(v||'').replace(/"/g,'""')}"`)
      .join(','))
  ];
  const blob = new Blob([csvRows.join('\n')], {type:'text/csv'});
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {href:url, download:`vfx-jobs-${new Date().toISOString().slice(0,10)}.csv`});
  a.click(); URL.revokeObjectURL(url);
}
document.getElementById('csv-export').addEventListener('click', exportCSV);

// ── Saved jobs & Notifications ────────────────────────────────────────────
const STORAGE_SAVED = 'vfxmap_saved_v1';
const STORAGE_SEEN  = 'vfxmap_seen_v1';

function jobKey(j) { return j.s + '\x00' + j.t; }
function loadSet(key) { try { return new Set(JSON.parse(localStorage.getItem(key)||'[]')); } catch { return new Set(); } }

let savedKeys  = loadSet(STORAGE_SAVED);
let seenKeys   = loadSet(STORAGE_SEEN);
let newJobKeys = new Set();

function persistSaved() { localStorage.setItem(STORAGE_SAVED, JSON.stringify([...savedKeys])); }
function persistSeen()  { localStorage.setItem(STORAGE_SEEN,  JSON.stringify([...seenKeys]));  }

function updateNotifBadge() {
  const n = newJobKeys.size, el = document.getElementById('notif-badge');
  el.textContent = n > 99 ? '99+' : n;
  el.style.display = n ? '' : 'none';
}
function updateSaveBadge() {
  const n = savedKeys.size, el = document.getElementById('save-badge');
  el.textContent = n > 99 ? '99+' : n;
  el.style.display = n ? '' : 'none';
}
function updateDrawerSaveState(j) {
  const saved = j && savedKeys.has(jobKey(j));
  elDr.saveLabel.textContent      = saved ? t('drawer.saved') : t('drawer.save');
  elDr.saveIconOff.style.display  = saved ? 'none' : '';
  elDr.saveIconOn.style.display   = saved ? '' : 'none';
  elDr.save.style.color           = saved ? 'var(--amber)' : '';
}
function toggleSaved(j) {
  const k = jobKey(j);
  if (savedKeys.has(k)) savedKeys.delete(k); else savedKeys.add(k);
  persistSaved(); updateSaveBadge(); updateDrawerSaveState(j);
  if (!document.getElementById('saved-panel').classList.contains('hidden')) renderSavedPanel();
}
function computeNewJobs() {
  newJobKeys = new Set(JOBS.map(j => jobKey(j)).filter(k => !seenKeys.has(k)));
  updateNotifBadge();
}
function markAllSeen() {
  JOBS.forEach(j => seenKeys.add(jobKey(j)));
  persistSeen(); newJobKeys.clear(); updateNotifBadge();
}

function renderJobMiniCard(j, removable) {
  const disc = DISC_MAP[j.disc], sc = STATUS_COLOR[j.status];
  const rmBtn = removable
    ? `<button class="sp-rm" onclick="event.stopPropagation();toggleSaved(JOBS.find(x=>x.id==='${j.id}'))" title="Remove">
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
       </button>`
    : '';
  return `<div class="sp-saved-row" onclick="openDrawer('${j.id}')">
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span class="eye-dot" style="background:${sc};box-shadow:0 0 6px ${sc};flex:none"></span>
        <span style="font-family:var(--font-m);font-size:9px;color:${sc};text-transform:uppercase;letter-spacing:.12em">${j.status}</span>
        <span style="font-family:var(--font-m);font-size:9px;color:var(--fg-4)">· ${fmtAge(j.postedH)}</span>
      </div>
      <div style="font-family:var(--font-s);font-size:13px;font-weight:600;color:var(--fg-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(j.t)}</div>
      <div style="font-family:var(--font-m);font-size:10px;color:var(--fg-3);letter-spacing:.10em;text-transform:uppercase;margin-top:2px">${esc(j.s)} · ${esc(j.c||j.co)}</div>
    </div>
    ${rmBtn}
  </div>`;
}

function renderNotifPanel() {
  const body = document.getElementById('notif-body');
  const newJobs = JOBS.filter(j => newJobKeys.has(jobKey(j)))
    .sort((a,b) => (STATUS_ORDER[a.status]??3) - (STATUS_ORDER[b.status]??3) || a.postedH - b.postedH);
  document.getElementById('notif-count').textContent = newJobs.length ? t('app.x_new', newJobs.length) : '';
  body.innerHTML = newJobs.length
    ? newJobs.map(j => renderJobMiniCard(j, false)).join('')
    : `<div class="sp-empty">${t('panel.no_new')}</div>`;
}
function renderSavedPanel() {
  const body = document.getElementById('saved-body');
  const savedJobs = JOBS.filter(j => savedKeys.has(jobKey(j)));
  document.getElementById('saved-count').textContent = savedJobs.length ? t('app.x_saved', savedJobs.length) : '';
  body.innerHTML = savedJobs.length
    ? savedJobs.map(j => renderJobMiniCard(j, true)).join('')
    : `<div class="sp-empty">${t('panel.no_saved')}<br><span style="font-size:10px;opacity:.6">${t('panel.save_hint')}</span></div>`;
}

function openNotifPanel() {
  document.getElementById('saved-panel').classList.add('hidden');
  const panel = document.getElementById('notif-panel');
  if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
  renderNotifPanel(); panel.classList.remove('hidden');
  setTimeout(markAllSeen, NOTIF_SEEN_DELAY_MS);
}
function openSavedPanel() {
  document.getElementById('notif-panel').classList.add('hidden');
  const panel = document.getElementById('saved-panel');
  if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
  renderSavedPanel(); panel.classList.remove('hidden');
}

document.getElementById('notif-btn').addEventListener('click', e => { e.stopPropagation(); openNotifPanel(); });
document.getElementById('saved-btn').addEventListener('click', e => { e.stopPropagation(); openSavedPanel(); });
document.getElementById('notif-close').addEventListener('click', () => document.getElementById('notif-panel').classList.add('hidden'));
document.getElementById('saved-close').addEventListener('click', () => document.getElementById('saved-panel').classList.add('hidden'));
document.addEventListener('click', e => {
  if (!e.target.closest('#notif-panel') && !e.target.closest('#notif-btn'))
    document.getElementById('notif-panel').classList.add('hidden');
  if (!e.target.closest('#saved-panel') && !e.target.closest('#saved-btn'))
    document.getElementById('saved-panel').classList.add('hidden');
});

// ── Language ──────────────────────────────────────────────────────────────
function setLang(code) {
  LANG = code;
  localStorage.setItem('vfxmap_lang', code);
  document.documentElement.lang = code;
  document.getElementById('notif-panel').classList.add('hidden');
  document.getElementById('saved-panel').classList.add('hidden');
  applyI18n();
  map.closePopup();
  lastMapKey = '';
  applyFilters();
  if (selectedJob) openDrawer(selectedJob.id);
  document.querySelectorAll('.lang-item').forEach(el => {
    el.classList.toggle('on', el.dataset.lang === LANG);
  });
}

(function initLangPicker() {
  const btn      = document.getElementById('lang-btn');
  const dropdown = document.getElementById('lang-dropdown');
  btn.addEventListener('click', e => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#lang-picker')) dropdown.classList.add('hidden');
  });
  document.querySelectorAll('.lang-item').forEach(item => {
    item.addEventListener('click', () => {
      setLang(item.dataset.lang);
      dropdown.classList.add('hidden');
    });
  });
  document.querySelectorAll('.lang-item').forEach(el => {
    el.classList.toggle('on', el.dataset.lang === LANG);
  });
})();

// ── Boot ──────────────────────────────────────────────────────────────────
(function initTheme() {
  const stored = localStorage.getItem('vfxmap_theme');
  const preferLight = stored ? stored === 'light' : window.matchMedia('(prefers-color-scheme: light)').matches;
  if (preferLight) {
    document.body.classList.add('light');
    document.getElementById('theme-icon-dark').style.display  = 'none';
    document.getElementById('theme-icon-light').style.display = '';
    map.removeLayer(tileDark); tileLight.addTo(map);
  }
})();

applyI18n();
applyFilters();
initData();

// ── Mobile sheet nav ──────────────────────────────────────────────────────
let closeMobileSheet = () => {};
let syncMobileNav    = () => {};

(function initMobileNav() {
  const mobileNav = document.getElementById('mobile-nav');
  if (!mobileNav) return;
  const railEl   = document.querySelector('.rail');
  const feedEl   = document.querySelector('.feed');
  const mnavBtns = mobileNav.querySelectorAll('.mnav-item');
  let activeSheet = 'none';

  function setActive(nav) {
    mnavBtns.forEach(b => b.classList.toggle('on', b.dataset.nav === nav));
  }

  function openSheet(name) {
    const next = (name === activeSheet && name !== 'none') ? 'none' : name;
    activeSheet = next;
    railEl.classList.toggle('sheet-open', next === 'filters');
    feedEl.classList.toggle('sheet-open', next === 'feed');
    setActive(next === 'none' ? currentView : next);
    if (next !== 'none') map.invalidateSize();
  }

  closeMobileSheet = () => openSheet('none');
  syncMobileNav    = (view) => { if (activeSheet === 'none') setActive(view); };

  mnavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const nav = btn.dataset.nav;
      if (nav === 'feed' || nav === 'filters') {
        if (currentView !== 'map') switchView('map');
        openSheet(nav);
      } else {
        openSheet('none');
        switchView(nav);
      }
    });
  });

  // Tap the map stage to close any open sheet
  document.querySelector('.stage').addEventListener('click', () => {
    if (activeSheet !== 'none') openSheet('none');
  });

  // Handle tap + swipe-down on sheet drag handles
  ['rail-handle', 'feed-handle'].forEach(id => {
    const handle = document.getElementById(id);
    if (!handle) return;
    let startY = 0;
    handle.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, {passive:true});
    handle.addEventListener('touchend', e => {
      if (e.changedTouches[0].clientY - startY > 40) openSheet('none');
    }, {passive:true});
    handle.addEventListener('click', () => openSheet('none'));
  });
})();
