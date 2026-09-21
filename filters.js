// -- Filters --
function applyFilters() {
  syncFilterControls();
  const fQueryLc = fQuery ? fQuery.toLowerCase() : '';
  const softRegexes = fSofts.map(swRegex);
  filtered = JOBS.filter(j => {
    if (fDiscs.length && !fDiscs.includes(j.disc)) return false;
    if (fFeaturedOnly && !j.featured) return false;
    if (fStatus !== 'all' && j.status !== fStatus) return false;
    if (fRemote !== 'Any' && j.remote !== fRemote) return false;
    if (fRegion && j.r !== fRegion) return false;
    if (fLevel && !j.l.split(/[,\/]/).some(p => normalizeLevel(p.trim()) === fLevel)) return false;
    if (softRegexes.length && !softRegexes.some(re => re.test(j._hay))) return false;
    if (fQueryLc && !j._search.includes(fQueryLc)) return false;
    return true;
  });
  listDirty = true; studiosDirty = true;
  updateHUD(); updateMap(); renderFeed();
  if (currentView === 'list')    renderListView();
  if (currentView === 'studios') renderStudiosView();
}

// -- Discipline chips --
const chipWrap = document.getElementById('disc-chips');
DISCS.forEach(d => {
  const btn = document.createElement('button');
  btn.className = 'disc-chip';
  btn.dataset.disc = d.id;
  btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = `<span class="chip-dot" style="background:${d.color}"></span><span data-i18n="disc.${d.id}">${t('disc.' + d.id)}</span>`;
  btn.onclick = () => {
    fDiscs = toggleFilterValue(fDiscs, d.id);
    applyFilters();
  };
  chipWrap.appendChild(btn);
});

// -- Software chips --
document.querySelectorAll('.soft-chip').forEach(btn => {
  btn.dataset.software = btn.textContent.trim().toLowerCase();
  btn.setAttribute('aria-pressed', 'false');
  btn.onclick = () => {
    fSofts = toggleFilterValue(fSofts, btn.dataset.software);
    applyFilters();
  };
});

// -- Segmented controls --
function wireSegmented(id, onChange) {
  const btns = document.getElementById(id).querySelectorAll('.seg-item');
  btns.forEach(btn => {
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', btn.classList.contains('on') ? 'true' : 'false');
    btn.onclick = () => {
      onChange(btn.dataset.v);
    };
  });
}
wireSegmented('status-seg', v => { fStatus = v; applyFilters(); });
wireSegmented('remote-seg', v => { fRemote = v; applyFilters(); });
wireSegmented('level-seg',  v => { fLevel  = v; applyFilters(); });
wireSegmented('region-seg', v => { fRegion = v; applyFilters(); });

// -- Featured-only filter --
const featuredOnlyBtn = document.getElementById('featured-only');
function syncFeaturedOnlyBtn() {
  if (!featuredOnlyBtn) return;
  featuredOnlyBtn.classList.toggle('on', fFeaturedOnly);
  featuredOnlyBtn.setAttribute('aria-pressed', fFeaturedOnly ? 'true' : 'false');
}
if (featuredOnlyBtn) {
  featuredOnlyBtn.setAttribute('aria-pressed', 'false');
  featuredOnlyBtn.addEventListener('click', () => {
    fFeaturedOnly = !fFeaturedOnly;
    applyFilters();
  });
}

function toggleFilterValue(values, value) {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value];
}

function syncFilterControls() {
  chipWrap.querySelectorAll('.disc-chip').forEach(btn => {
    const on = fDiscs.includes(btn.dataset.disc), color = DISC_MAP[btn.dataset.disc].color;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.style.borderColor = on ? color : '';
    btn.style.color = on ? color : '';
    btn.style.background = on ? hexRgba(color, .08) : '';
  });
  document.querySelectorAll('.soft-chip').forEach(btn => {
    const on = fSofts.includes(btn.dataset.software);
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
  });
  for (const [id, value] of Object.entries({ 'status-seg': fStatus, 'remote-seg': fRemote, 'level-seg': fLevel, 'region-seg': fRegion })) {
    document.getElementById(id).querySelectorAll('.seg-item').forEach(btn => {
      const on = btn.dataset.v === value;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-selected', String(on));
    });
  }
  syncFeaturedOnlyBtn();
}

function resetFilters() {
  fQuery = ''; fDiscs = []; fSofts = []; fStatus = 'all';
  fRemote = 'Any'; fRegion = ''; fLevel = ''; fFeaturedOnly = false;
  syncFilterControls();
}

