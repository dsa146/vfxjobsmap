// -- Feed --
let feedSorted = [];

function makeSkelFeed() {
  const widths = [[72,44],[80,50],[65,40],[78,55],[68,46]];
  return widths.map(([tw, sw], i) => `
    <div class="jcard skel-card" style="animation-delay:${i * 70}ms">
      <div class="jcard-eye">
        <span class="skel-line" style="width:7px;height:7px;border-radius:999px"></span>
        <span class="skel-line" style="width:52px;height:9px"></span>
        <span class="skel-line" style="width:34px;height:9px;margin-left:auto"></span>
      </div>
      <div class="skel-line" style="height:15px;width:${tw}%;margin-bottom:5px"></div>
      <div class="skel-line" style="height:10px;width:${sw}%;margin-bottom:10px"></div>
      <div style="display:flex;gap:5px">
        <span class="skel-line" style="width:48px;height:18px;border-radius:10px"></span>
        <span class="skel-line" style="width:38px;height:18px;border-radius:10px"></span>
        <span class="skel-line" style="width:52px;height:18px;border-radius:10px"></span>
      </div>
    </div>`).join('');
}

function makeCardHTML(j) {
  const disc = DISC_MAP[j.disc], sc = STATUS_COLOR[j.status];
  return `<button class="jcard${j.featured ? ' featured' : ''}" data-id="${j.id}" onclick="openDrawer('${j.id}')">
    <div class="jcard-eye">
      <span class="eye-dot" style="background:${sc};box-shadow:0 0 8px ${sc}"></span>
      <span style="color:${sc};text-transform:uppercase">${t('status.' + j.status)}</span>
      <span class="eye-sep">·</span>
      <span>${fmtAge(j.postedH)}</span>
      <span class="eye-id">${j.displayId || j.legacyId || j.id}</span>
    </div>
    <div class="jcard-title">${esc(j.t)}</div>
    <div class="jcard-studio">${esc(j.s)} · ${esc(j.loc)}</div>
    <div class="jcard-tags">
      <span class="jtag-disc" style="color:${disc?.color};border-color:${disc?.color}">${t('disc.' + j.disc)}</span>
      ${j.featured ? `<span class="jtag featured-pill">${t('job.featured')}</span>` : ''}
      <span class="jtag">${displayLevel(j.l)}</span>
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
  if (dataLoadFailed) return;
  if (feedObserver) { feedObserver.disconnect(); feedObserver = null; }
  feedPage = 1;
  elFeedCount.textContent = t('app.x_events', filtered.length);
  if (!filtered.length) {
    elFeedList.innerHTML = `<div style="padding:24px;font-family:var(--font-m);font-size:11px;letter-spacing:.14em;color:var(--fg-4);text-align:center;text-transform:uppercase">${t('feed.no_matches')}</div>`;
    feedSorted = []; return;
  }
  feedSorted = [...filtered].sort((a,b) => Number(b.featured) - Number(a.featured) || (STATUS_ORDER[a.status]??3) - (STATUS_ORDER[b.status]??3) || a.postedH - b.postedH);
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

// -- HUD --
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
