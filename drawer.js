// -- Drawer --
function openDrawer(jobId) {
  map.closePopup();
  const j = JOBS.find(x => x.id === jobId);
  if (!j) return;
  elDr.drawer.classList.remove('drawer--edu');
  elEduMapSection.style.display = 'none';
  const prevId = selectedJob?.id;
  selectedJob = j;

  const disc = DISC_MAP[j.disc], sc = STATUS_COLOR[j.status];

  elDr.eye.innerHTML = `
    <span class="eye-dot" style="background:${sc};box-shadow:0 0 8px ${sc}"></span>
    <span style="color:${sc};text-transform:uppercase">${t('status.' + j.status)}</span>
    <span class="eye-sep">·</span>
    <span>${j.id} · ${t('drawer.posted').toUpperCase()} ${fmtAge(j.postedH).toUpperCase()}</span>`;

  elDr.title.textContent  = j.t;
  elDr.studio.textContent = j.s;
  elDr.city.innerHTML = `
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-7-4.5-7-11a7 7 0 1 1 14 0c0 6.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>
    ${esc(j.loc)}`;

  const relJobs = filtered.filter(x => x.s === j.s);
  elDr.tags.innerHTML = `
    <span class="jtag-disc" style="color:${disc?.color};border-color:${disc?.color}">${t('disc.' + j.disc)}</span>
    <span class="jtag">${displayLevel(j.l)}</span>
    <span class="jtag">${tRemote(j.remote)}</span>`;

  const postDate = new Date(Date.now() - j.postedH * 3600000);
  elDr.posted.textContent = postDate.toLocaleDateString(LANG, { year: 'numeric', month: 'short', day: 'numeric' });
  elDr.mode.textContent   = tRemote(j.remote);
  elDr.level.textContent  = displayLevel(j.l);
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
    }).catch(() => {
      elDr.shareLabel.textContent = t('drawer.copied_fail');
      setTimeout(() => { elDr.shareLabel.textContent = t('drawer.share'); }, 2000);
    });
  };

  if (j.u) {
    const href = /^https?:\/\//i.test(j.u) ? j.u : `mailto:${j.u}`;
    elDr.apply.onclick = () => window.open(href, '_blank', 'noopener');
    elDr.apply.style.opacity = '1'; elDr.apply.style.pointerEvents = '';
  } else {
    elDr.apply.onclick = null;
    elDr.apply.style.opacity = '0.4'; elDr.apply.style.pointerEvents = 'none';
    elDr.apply.title = t('drawer.no_contact');
  }

  elDr.backdrop.classList.remove('hidden');
  updateFeedSelected(prevId, j.id);
  history.replaceState(null, '', '?job=' + j.id);
}

function closeDrawer() {
  elDr.backdrop.classList.add('hidden');
  elDr.drawer.classList.remove('drawer--edu');
  updateFeedSelected(selectedJob?.id, null);
  selectedJob = null;
  history.replaceState(null, '', location.pathname);
}

elDr.backdrop.addEventListener('click', closeDrawer);
document.getElementById('drawer-close').addEventListener('click', closeDrawer);
document.getElementById('drawer').addEventListener('click', e => e.stopPropagation());

// -- Edu drawer --
const EDU_COLOR = '#2BC4D2';
let eduMiniMap = null, eduMiniMarker = null, eduMiniTile = null;
const elEduMapSection = document.getElementById('drawer-edu-map-section');
const MINI_TILE_DARK  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const MINI_TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

function getEduCoords(e) {
  if (!e.city && !e.country) return null;
  return CC[e.city + '|' + e.country] || CC[e.city] || CO_LL[e.country] || null;
}

function syncEduMiniTile() {
  if (!eduMiniMap) return;
  const url = document.body.classList.contains('light') ? MINI_TILE_LIGHT : MINI_TILE_DARK;
  if (eduMiniTile) eduMiniMap.removeLayer(eduMiniTile);
  eduMiniTile = L.tileLayer(url, { subdomains: 'abcd', maxZoom: 19 }).addTo(eduMiniMap);
}

function updateEduMiniMap(ll) {
  if (!eduMiniMap) {
    eduMiniMap = L.map('drawer-edu-map', {
      zoomControl: false, attributionControl: false,
      dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false,
    });
    syncEduMiniTile();
  }
  eduMiniMap.setView(ll, 10);
  const icon = L.divIcon({
    html: `<div class="pin-wrap"><span class="pin-dot" style="background:${EDU_COLOR};box-shadow:0 0 10px ${EDU_COLOR}88"></span></div>`,
    className: '', iconSize: [24, 24], iconAnchor: [12, 12],
  });
  if (eduMiniMarker) eduMiniMarker.setLatLng(ll).setIcon(icon);
  else eduMiniMarker = L.marker(ll, { icon }).addTo(eduMiniMap);
  setTimeout(() => eduMiniMap.invalidateSize(), 0);
}

function openEduDrawer(idx) {
  const e = EDU_DATA[idx];
  if (!e) return;
  selectedJob = null;
  elDr.drawer.classList.add('drawer--edu');
  elDr.eye.innerHTML = `<span class="eye-dot" style="background:${EDU_COLOR};box-shadow:0 0 8px ${EDU_COLOR}"></span><span style="color:${EDU_COLOR};text-transform:uppercase">${t('nav.edu')}</span>`;
  elDr.title.textContent = e.name;
  elDr.studio.textContent = '';
  const loc = [e.city, e.state, e.country].filter(Boolean).join(', ');
  const isOnline = !loc;
  elDr.city.innerHTML = isOnline
    ? `<span style="color:${EDU_COLOR}">${t('edu.online')}</span>`
    : `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-7-4.5-7-11a7 7 0 1 1 14 0c0 6.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg> ${esc(loc)}`;
  elDr.tags.innerHTML = isOnline ? `<span class="jtag" style="color:${EDU_COLOR};border-color:${EDU_COLOR}">${t('edu.online')}</span>` : '';
  const ll = getEduCoords(e);
  if (ll) {
    elEduMapSection.style.display = '';
    updateEduMiniMap(ll);
  } else {
    elEduMapSection.style.display = 'none';
  }
  if (e.desc) { elDr.notes.textContent = e.desc; elDr.notesSection.style.display = ''; }
  else        { elDr.notesSection.style.display = 'none'; }
  elDr.backdrop.classList.remove('hidden');
}
