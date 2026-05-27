// -- List view --
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
    return `<div class="list-row${j.featured ? ' featured' : ''}" onclick="openDrawer('${j.id}')">
      <div><div class="list-role">${esc(j.t)}</div></div>
      <div class="list-studio">${esc(j.s)}</div>
      <div class="list-loc">${esc(j.loc)}</div>
      <div class="list-loc">${tRemote(j.remote)}</div>
      <div class="list-loc">${displayLevel(j.l)}</div>
      <div style="display:flex;align-items:center;gap:6px">
        <div class="list-dot" style="background:${sc};box-shadow:0 0 6px ${sc}"></div>
        <span class="list-badge" style="color:${sc};border-color:${sc}20">${t('status.' + j.status)}</span>
      </div>
    </div>`;
  }).join('');
}

// -- Education view --
let EDU_DATA = null;
let eduQuery = '';

async function fetchEduData() {
  const rows = await fetchGviz(EDU_GID, 'gvizEduCb');
  const get = (c, i) => (c[i] && c[i].v != null) ? String(c[i].v).trim() : '';
  return rows
    .map(row => ({
      name:    get(row.c, EDU_COL.name),
      country: get(row.c, EDU_COL.country),
      city:    get(row.c, EDU_COL.city),
      state:   get(row.c, EDU_COL.state),
      desc:    get(row.c, EDU_COL.desc),
    }))
    .filter(e => e.name && e.name.toLowerCase() !== 'name')
    .sort((a, b) => a.name.localeCompare(b.name));
}

function makeEduCardHTML(e, idx) {
  const loc = [e.city, e.country].filter(Boolean).join(' · ') || null;
  const isOnline = !loc;
  return `<div class="edu-card" onclick="openEduDrawer(${idx})">
    <div class="ec-name">${esc(e.name)}</div>
    <div class="ec-loc">${esc(loc || '—')}</div>
    ${isOnline ? `<div class="ec-tags"><span class="ec-tag online">${t('edu.online')}</span></div>` : ''}
    <div class="ec-desc">${esc(e.desc)}</div>
  </div>`;
}

function renderEduCards() {
  const body = document.getElementById('edu-body');
  const q    = eduQuery.toLowerCase();
  let html = '';
  EDU_DATA.forEach((e, i) => {
    if (q && !`${e.name} ${e.city} ${e.country} ${e.desc}`.toLowerCase().includes(q)) return;
    html += makeEduCardHTML(e, i);
  });
  body.innerHTML = html || `<div style="padding:24px;font-family:var(--font-m);font-size:11px;letter-spacing:.14em;color:var(--fg-4);text-align:center;text-transform:uppercase">${t('feed.no_matches')}</div>`;
}

async function initEduView() {
  if (EDU_DATA) { renderEduCards(); return; }
  const body = document.getElementById('edu-body');
  body.innerHTML = `<div style="padding:24px;font-family:var(--font-m);font-size:11px;color:var(--fg-4);text-align:center">${t('app.loading', 1)}</div>`;
  try {
    EDU_DATA = await fetchEduData();
    eduError = null; renderEduCards();
  } catch(e) {
    eduError = e.message;
    renderFetchError(body, e.message, 'initEduView()', t('edu.failed'));
  }
}

// -- Web links view --
let WEB_DATA = null;
let webQuery = '';
let webSort = { col: 'cat', dir: 1 };

async function fetchWebData() {
  const rows = await fetchGviz(WEB_GID, 'gvizWebCb');
  const get = (c, i) => (c[i] && c[i].v != null) ? String(c[i].v).trim() : '';
  let currentCat = '';
  const out = [];
  rows.forEach(row => {
    const name  = get(row.c, WEB_COL.name);
    const url   = get(row.c, WEB_COL.url);
    const notes = get(row.c, WEB_COL.notes);
    if (!name) return;
    if (!url) { currentCat = name; return; }
    if (name.toLowerCase() === 'website') return;
    out.push({ name, url, notes, cat: currentCat });
  });
  return out;
}

function renderWebView() {
  const body = document.getElementById('web-body');
  const q = webQuery.toLowerCase();
  let list = q
    ? WEB_DATA.filter(w => `${w.name} ${w.notes}`.toLowerCase().includes(q))
    : [...WEB_DATA];
  list.sort((a, b) => {
    const av = a[webSort.col] || '', bv = b[webSort.col] || '';
    return av.localeCompare(bv) * webSort.dir;
  });
  elWebColBtns.forEach(btn => {
    const isActive = btn.dataset.col === webSort.col;
    btn.classList.toggle('active', isActive);
    btn.querySelector('.list-sort-icon').textContent = isActive ? (webSort.dir === 1 ? '↑' : '↓') : '↕';
  });
  const CAT_JOBS  = 'JOB SITES/BOARDS';
  body.innerHTML = list.length
    ? list.map(w => {
        const catLabel = w.cat === CAT_JOBS ? t('web.jobs_cat') : t('web.other_cat');
        const catColor = w.cat === CAT_JOBS ? 'var(--amber)' : 'var(--cyan)';
        const href = safeUrl(w.url);
        if (!href) return '';
        return `<a class="web-row" href="${esc(href)}" target="_blank" rel="noopener">
          <div class="web-name">${esc(w.name)}</div>
          <div><span class="web-cat-badge" style="color:${catColor};border-color:${catColor}20">${catLabel}</span></div>
          <div class="web-notes">${esc(w.notes)}</div>
        </a>`;
      }).join('')
    : `<div style="padding:24px;font-family:var(--font-m);font-size:11px;letter-spacing:.14em;color:var(--fg-4);text-align:center;text-transform:uppercase">${t('feed.no_matches')}</div>`;
}

async function initWebView() {
  if (WEB_DATA) { renderWebView(); return; }
  const body = document.getElementById('web-body');
  body.innerHTML = `<div style="padding:24px;font-family:var(--font-m);font-size:11px;color:var(--fg-4);text-align:center">${t('app.loading', 1)}</div>`;
  try {
    WEB_DATA = await fetchWebData();
    webError = null; renderWebView();
  } catch(e) {
    webError = e.message;
    renderFetchError(body, e.message, 'initWebView()', t('web.failed'));
  }
}

elWebColBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const col = btn.dataset.col;
    if (webSort.col === col) webSort.dir *= -1;
    else { webSort.col = col; webSort.dir = 1; }
    if (WEB_DATA) renderWebView();
  });
});

// -- Studios view --
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
