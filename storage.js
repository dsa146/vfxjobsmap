// ── Saved jobs & Notifications ────────────────────────────────────────────
const STORAGE_SAVED = 'vfxmap_saved_v1';
const STORAGE_SEEN  = 'vfxmap_seen_v1';
const STORAGE_APPLIED = 'vfxmap_applied_v1';
const STORAGE_HISTORY = 'vfxmap_jobs_v2';

function legacyJobKey(j) { return j.s + '\x00' + j.t + '\x00' + j.loc; }
function jobKey(j) { return j.storageKey || j.id; }
function loadSet(key) {
  try {
    const values = JSON.parse(readStorage(key) || '[]');
    return new Set(Array.isArray(values) ? values.filter(value => typeof value === 'string') : []);
  } catch { return new Set(); }
}

function loadJobHistory() {
  try {
    const state = JSON.parse(readStorage(STORAGE_HISTORY));
    if (state?.version !== 2 || !['saved', 'applied', 'seen', 'jobs'].every(key => Array.isArray(state[key]))) return null;
    if (!['saved', 'applied', 'seen'].every(key => state[key].every(value => typeof value === 'string'))) return null;
    return state;
  } catch { return null; }
}

function restoreJobSnapshot(raw) {
  if (!raw || typeof raw.id !== 'string' || !/^JOB-[A-Z0-9-]+$/.test(raw.id)) return null;
  const j = {};
  for (const field of ['id', 'legacyId', 'legacyHashId', 'displayId', 's', 't', 'loc', 'c', 'co', 'l', 'w', 'd', 'r', 'u', 'sw', 'n', 'sourceId']) {
    j[field] = typeof raw[field] === 'string' ? raw[field] : '';
  }
  if (!j.s || !j.t) return null;
  if (!/^JOB(?: \d+|-[A-Z0-9-]+)$/.test(j.displayId)) j.displayId = j.id;
  const date = raw.postedDate ? new Date(raw.postedDate) : null;
  j.postedDate = date && !isNaN(date.getTime()) ? date : null;
  j.disc = getDisc(j.t); j.status = getStatus(j.postedDate); j.postedH = getPostedH(j.postedDate);
  j.remote = j.w ? getRemote(j.w) : '—'; j.ll = getCoords(j); j.featured = raw.featured === true;
  if (raw.storageKey === legacyJobKey(j)) j.storageKey = raw.storageKey;
  return j;
}

const initialHistory = loadJobHistory();
let needsLegacyMigration = !initialHistory;
let savedKeys  = initialHistory ? new Set(initialHistory.saved) : loadSet(STORAGE_SAVED);
let seenKeys   = initialHistory ? new Set(initialHistory.seen) : loadSet(STORAGE_SEEN);
let appliedKeys = initialHistory ? new Set(initialHistory.applied) : loadSet(STORAGE_APPLIED);
const jobSnapshots = new Map((initialHistory?.jobs || []).flatMap(raw => {
  const j = restoreJobSnapshot(raw);
  return j ? [[jobKey(j), j]] : [];
}));
let newJobKeys = new Set();
let myJobsTab = 'saved';

function persistJobHistory() {
  const retained = new Set([...savedKeys, ...appliedKeys]);
  for (const key of jobSnapshots.keys()) if (!retained.has(key)) jobSnapshots.delete(key);
  return writeStorage(STORAGE_HISTORY, JSON.stringify({
    version: 2, saved: [...savedKeys], applied: [...appliedKeys], seen: [...seenKeys], jobs: [...jobSnapshots.values()],
  }));
}
function persistSaved() { return persistJobHistory(); }
function persistSeen() { return persistJobHistory(); }
function persistApplied() { return persistJobHistory(); }

function rememberJob(j) {
  const snapshot = restoreJobSnapshot(j);
  if (snapshot) jobSnapshots.set(jobKey(j), snapshot);
}

function reconcileJobHistory() {
  const legacyMatches = new Map();
  for (const j of JOBS) {
    const key = legacyJobKey(j);
    if (!legacyMatches.has(key)) legacyMatches.set(key, []);
    legacyMatches.get(key).push(j);
  }
  if (needsLegacyMigration) {
    for (const keys of [savedKeys, appliedKeys, seenKeys]) {
      for (const key of [...keys]) {
        const matches = legacyMatches.get(key);
        // Old keys have no posting date: never guess between multiple postings.
        if (matches?.length === 1) { keys.delete(key); keys.add(matches[0].id); }
      }
    }
    needsLegacyMigration = false;
  }
  for (const j of JOBS) if (savedKeys.has(j.id) || appliedKeys.has(j.id)) rememberJob(j);
  persistJobHistory();
}

function legacySnapshot(key) {
  const parts = key.split('\x00');
  if (parts.length !== 3 || !parts[0] || !parts[1]) return null;
  const [s, title, loc] = parts;
  return restoreJobSnapshot({ id: 'JOB-ARCHIVE-' + hashString(key) + hashString('archive:' + key),
    s, t: title, loc, storageKey: key });
}

function trackedJobs(keys) {
  const live = new Map(JOBS.map(j => [j.id, j]));
  return [...keys].flatMap(key => {
    if (live.has(key)) return [live.get(key)];
    const snapshot = jobSnapshots.get(key) || legacySnapshot(key);
    return snapshot ? [{ ...snapshot, archived: true }] : [];
  });
}

function findStoredJob(id) {
  return trackedJobs(new Set([...savedKeys, ...appliedKeys])).find(j => j.id === id);
}

function updateNotifBadge() {
  const n = newJobKeys.size, el = document.getElementById('notif-badge');
  el.textContent = n > 99 ? '99+' : n;
  el.style.display = n ? '' : 'none';
}

function updateSaveBadge() {
  const n = new Set([...savedKeys, ...appliedKeys]).size, el = document.getElementById('save-badge');
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

function updateDrawerAppliedState(j) {
  const applied = j && appliedKeys.has(jobKey(j));
  elDr.appliedLabel.textContent = applied ? t('drawer.applied') : t('drawer.mark_applied');
  elDr.applied.classList.toggle('is-applied', applied);
  elDr.applied.style.color = applied ? 'var(--green)' : '';
}

function toggleSaved(j) {
  if (!j) return;
  const k = jobKey(j);
  if (savedKeys.has(k)) savedKeys.delete(k); else savedKeys.add(k);
  rememberJob(j);
  persistSaved(); updateSaveBadge(); updateDrawerSaveState(j);
  if (!document.getElementById('saved-panel').classList.contains('hidden')) renderSavedPanel();
}

function toggleApplied(j) {
  if (!j) return;
  const k = jobKey(j);
  if (appliedKeys.has(k)) appliedKeys.delete(k); else appliedKeys.add(k);
  rememberJob(j);
  persistApplied(); updateSaveBadge(); updateDrawerAppliedState(j);
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

function renderJobMiniCard(j, mode) {
  const disc = DISC_MAP[j.disc], sc = STATUS_COLOR[j.status];
  const applied = appliedKeys.has(jobKey(j));
  const isSavedMode = mode === 'saved';
  const rmAction = isSavedMode ? 'toggleSaved' : 'toggleApplied';
  const rmTitle = isSavedMode ? t('drawer.saved') : t('drawer.applied');
  const rmBtn = mode
    ? `<button class="sp-rm" onclick="event.stopPropagation();${rmAction}(findJob('${j.id}'))" onkeydown="event.stopPropagation()" title="${esc(rmTitle)}">
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
       </button>`
    : '';
  return `<div class="sp-saved-row" role="button" tabindex="0" onclick="openDrawer('${j.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openDrawer('${j.id}')}">
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span class="eye-dot" style="background:${sc};box-shadow:0 0 6px ${sc};flex:none"></span>
        <span style="font-family:var(--font-m);font-size:9px;color:${sc};text-transform:uppercase;letter-spacing:.12em">${j.archived ? t('job.archived') : t('status.' + j.status)}</span>
        ${j.postedDate || !j.archived ? `<span style="font-family:var(--font-m);font-size:9px;color:var(--fg-4)">· ${fmtAge(j.postedH)}</span>` : ''}
        ${applied ? `<span class="sp-pill applied">${t('drawer.applied')}</span>` : ''}
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
    ? newJobs.map(j => renderJobMiniCard(j, '')).join('')
    : `<div class="sp-empty">${t('panel.no_new')}</div>`;
}

function renderSavedPanel() {
  const body = document.getElementById('saved-body');
  const tabBtns = document.querySelectorAll('.sp-tab');
  tabBtns.forEach(btn => {
    const on = btn.dataset.tab === myJobsTab;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const isSaved = myJobsTab === 'saved';
  const keys = isSaved ? savedKeys : appliedKeys;
  const jobs = trackedJobs(keys);
  document.getElementById('saved-count').textContent = jobs.length
    ? (isSaved ? t('app.x_saved', jobs.length) : t('app.x_applied', jobs.length))
    : '';
  body.innerHTML = jobs.length
    ? jobs.map(j => renderJobMiniCard(j, myJobsTab)).join('')
    : `<div class="sp-empty">${isSaved ? t('panel.no_saved') : t('panel.no_applied')}<br><span style="font-size:10px;opacity:.6">${isSaved ? t('panel.save_hint') : t('panel.applied_hint')}</span></div>`;
}

function closePanel(id) { document.getElementById(id).classList.add('hidden'); }
function closePanels() { closePanel('notif-panel'); closePanel('saved-panel'); }

function openNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel.classList.contains('hidden')) { closePanel('notif-panel'); return; }
  closePanel('saved-panel');
  renderNotifPanel(); panel.classList.remove('hidden');
  setTimeout(markAllSeen, NOTIF_SEEN_DELAY_MS);
}

function openSavedPanel() {
  const panel = document.getElementById('saved-panel');
  if (!panel.classList.contains('hidden')) { closePanel('saved-panel'); return; }
  closePanel('notif-panel');
  renderSavedPanel(); panel.classList.remove('hidden');
}

document.getElementById('notif-btn').addEventListener('click', e => { e.stopPropagation(); openNotifPanel(); });
document.getElementById('saved-btn').addEventListener('click', e => { e.stopPropagation(); openSavedPanel(); });
document.getElementById('notif-close').addEventListener('click', () => closePanel('notif-panel'));
document.getElementById('saved-close').addEventListener('click', () => closePanel('saved-panel'));
document.querySelectorAll('.sp-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    myJobsTab = btn.dataset.tab || 'saved';
    renderSavedPanel();
  });
});
document.addEventListener('click', e => {
  if (!e.target.closest('#notif-panel') && !e.target.closest('#notif-btn')) closePanel('notif-panel');
  if (!e.target.closest('#saved-panel') && !e.target.closest('#saved-btn')) closePanel('saved-panel');
});
