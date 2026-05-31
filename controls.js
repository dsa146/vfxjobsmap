// -- Search --
const searchEl  = document.getElementById('search');
const clearBtn  = document.getElementById('search-clear');
const searchKbd = document.getElementById('search-kbd');

const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
searchKbd.textContent = isMac ? 'Cmd+K' : 'Ctrl+K';

document.addEventListener('keydown', e => {
  const ctrl = isMac ? e.metaKey : e.ctrlKey;
  if (ctrl && e.key === 'k') { e.preventDefault(); searchEl.focus(); searchEl.select(); }
  if (e.key === 'Escape') {
    if (document.activeElement === searchEl) searchEl.blur();
    else if (selectedJob) closeDrawer();
  }
});

function updateSearchClear() {
  const hasVal = searchEl.value.length > 0;
  clearBtn.classList.toggle('visible', hasVal);
  searchKbd.style.display = hasVal ? 'none' : '';
}

function syncSearchPlaceholder() {
  const key = currentView === 'edu' ? 'edu.search_placeholder'
            : currentView === 'web' ? 'web.search_placeholder'
            : 'search.placeholder';
  searchEl.placeholder = t(key);
}

let searchTimer = 0;
searchEl.addEventListener('input', e => {
  updateSearchClear();
  if (currentView === 'edu') {
    eduQuery = e.target.value.trim();
    if (EDU_DATA) renderEduCards();
  } else if (currentView === 'web') {
    webQuery = e.target.value.trim();
    if (WEB_DATA) renderWebView();
  } else {
    fQuery = e.target.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, SEARCH_DEBOUNCE_MS);
  }
});
clearBtn.addEventListener('click', () => {
  searchEl.value = '';
  updateSearchClear();
  searchEl.focus();
  if (currentView === 'edu') {
    eduQuery = '';
    if (EDU_DATA) renderEduCards();
  } else if (currentView === 'web') {
    webQuery = '';
    if (WEB_DATA) renderWebView();
  } else {
    fQuery = '';
    applyFilters();
  }
});

// -- Timecode --
function updateTimecode() {
  const n = new Date(), pad = x => String(x).padStart(2,'0');
  const tzAbbr = new Intl.DateTimeFormat('en', { timeZoneName: 'short' }).formatToParts(n).find(p => p.type === 'timeZoneName')?.value || '';
  elTcTime.textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())} ${tzAbbr}`;
}
updateTimecode();
setInterval(updateTimecode, 1000);

// -- Signal (ping) --
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

// -- Brand home --
document.getElementById('brand-home').addEventListener('click', e => {
  e.preventDefault();
  fQuery = ''; fDiscs = []; fSofts = []; fSoftRegexes = []; fStatus = 'all'; fRemote = 'Any'; fRegion = ''; fLevel = '';
  fFeaturedOnly = false;
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
  syncFeaturedOnlyBtn();
  closeMobileSheet();
  applyFilters(); switchView('map');
});

// -- Theme --
document.getElementById('theme-toggle').addEventListener('click', () => {
  const goingLight = !document.body.classList.contains('light');
  const applyTheme = () => {
    document.body.classList.toggle('light');
    document.getElementById('theme-icon-dark').style.display  = goingLight ? 'none' : '';
    document.getElementById('theme-icon-light').style.display = goingLight ? '' : 'none';
    localStorage.setItem('vfxmap_theme', goingLight ? 'light' : 'dark');
    if (goingLight) { map.removeLayer(tileDark);  tileLight.addTo(map); }
    else            { map.removeLayer(tileLight); tileDark.addTo(map);  }
    syncEduMiniTile();
  };
  if (!document.startViewTransition) { applyTheme(); return; }
  document.startViewTransition(applyTheme);
});

// -- CSV export --
function exportCSV() {
  const headers = ['ID','Title','Studio','City','Country','Work Mode','Level','Status','Featured','Saved','Applied','Posted','Contact','Software','Notes'];
  const csvRows = [
    headers.join(','),
    ...filtered.map(j => [j.id,j.t,j.s,j.c,j.co,j.w,j.l,j.status,j.featured?'yes':'',savedKeys.has(jobKey(j))?'yes':'',appliedKeys.has(jobKey(j))?'yes':'',j.d,j.u,j.sw,j.n]
      .map(v => `"${(v||'').replace(/"/g,'""')}"`)
      .join(','))
  ];
  const blob = new Blob([csvRows.join('\n')], {type:'text/csv'});
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {href:url, download:`vfx-jobs-${new Date().toISOString().slice(0,10)}.csv`});
  a.click(); URL.revokeObjectURL(url);
}
document.getElementById('csv-export').addEventListener('click', exportCSV);

// -- Language --
function setLang(code) {
  if (!LOCALES[code]) return;
  LANG = code;
  localStorage.setItem('vfxmap_lang', code);
  document.documentElement.lang = code;
  closePanels();
  applyI18n(); applyLegendLabels(); syncSearchPlaceholder();
  if (EDU_DATA) renderEduCards();
  else if (eduError) renderFetchError(document.getElementById('edu-body'), eduError, 'initEduView()', t('edu.failed'));
  if (WEB_DATA) renderWebView();
  else if (webError) renderFetchError(document.getElementById('web-body'), webError, 'initWebView()', t('web.failed'));
  if (jobsError) renderFetchError(elFeedList, jobsError, 'initData()');
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
