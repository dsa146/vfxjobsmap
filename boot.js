// -- Boot --
async function initData(attempt = 1) {
  dataLoadFailed = false; jobsError = null;
  elFeedList.innerHTML = attempt === 1
    ? makeSkelFeed()
    : `<div style="padding:24px 16px;color:#555;font-size:12px;font-family:monospace;text-align:center">${t('app.loading', attempt)}</div>`;
  try {
    JOBS = await fetchSheetJobs();
    const validKeys = new Set(JOBS.map(j => jobKey(j)));
    savedKeys.forEach(k => { if (!validKeys.has(k)) savedKeys.delete(k); });
    persistSaved(); updateSaveBadge();
    computeNewJobs();
    applyFilters();
    const sharedJob = new URLSearchParams(location.search).get('job');
    if (sharedJob && JOBS.find(j => j.id === sharedJob || j.legacyId === sharedJob)) openDrawer(sharedJob);
  } catch(e) {
    console.error('Sheet fetch failed (attempt ' + attempt + '):', e);
    if (attempt < FETCH_MAX_RETRIES) { setTimeout(() => initData(attempt + 1), FETCH_RETRY_MS); return; }
    dataLoadFailed = true; jobsError = e.message;
    renderFetchError(elFeedList, e.message, 'initData()');
  }
}

(function initTheme() {
  const stored = localStorage.getItem('vfxmap_theme');
  const preferLight = stored ? stored === 'light' : window.matchMedia('(prefers-color-scheme: light)').matches;
  if (preferLight) {
    document.body.classList.add('light');
    document.getElementById('theme-icon-dark').style.display  = 'none';
    document.getElementById('theme-icon-light').style.display = '';
    map.removeLayer(tileDark); tileLight.addTo(map);
    syncEduMiniTile();
  }
})();

applyI18n(); applyLegendLabels(); syncSearchPlaceholder();
applyFilters();
initData();
