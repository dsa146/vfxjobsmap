// ── Saved jobs & Notifications ────────────────────────────────────────────
const STORAGE_SAVED = 'vfxmap_saved_v1';
const STORAGE_SEEN  = 'vfxmap_seen_v1';
const STORAGE_APPLIED = 'vfxmap_applied_v1';

function jobKey(j) { return j.s + '\x00' + j.t + '\x00' + j.loc; }
function loadSet(key) { try { return new Set(JSON.parse(localStorage.getItem(key)||'[]')); } catch { return new Set(); } }

let savedKeys  = loadSet(STORAGE_SAVED);
let seenKeys   = loadSet(STORAGE_SEEN);
let appliedKeys = loadSet(STORAGE_APPLIED);
let newJobKeys = new Set();
let myJobsTab = 'saved';

function persistSaved() { localStorage.setItem(STORAGE_SAVED, JSON.stringify([...savedKeys])); }
function persistSeen()  { localStorage.setItem(STORAGE_SEEN,  JSON.stringify([...seenKeys]));  }
function persistApplied() { localStorage.setItem(STORAGE_APPLIED, JSON.stringify([...appliedKeys])); }

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
  persistSaved(); updateSaveBadge(); updateDrawerSaveState(j);
  if (!document.getElementById('saved-panel').classList.contains('hidden')) renderSavedPanel();
}

function toggleApplied(j) {
  if (!j) return;
  const k = jobKey(j);
  if (appliedKeys.has(k)) appliedKeys.delete(k); else appliedKeys.add(k);
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
    ? `<button class="sp-rm" onclick="event.stopPropagation();${rmAction}(JOBS.find(x=>x.id==='${j.id}'))" onkeydown="event.stopPropagation()" title="${esc(rmTitle)}">
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
       </button>`
    : '';
  return `<div class="sp-saved-row" role="button" tabindex="0" onclick="openDrawer('${j.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openDrawer('${j.id}')}">
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span class="eye-dot" style="background:${sc};box-shadow:0 0 6px ${sc};flex:none"></span>
        <span style="font-family:var(--font-m);font-size:9px;color:${sc};text-transform:uppercase;letter-spacing:.12em">${t('status.' + j.status)}</span>
        <span style="font-family:var(--font-m);font-size:9px;color:var(--fg-4)">· ${fmtAge(j.postedH)}</span>
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
  const jobs = JOBS.filter(j => keys.has(jobKey(j)));
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
