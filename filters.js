// -- Filters --
function applyFilters() {
  const fQueryLc = fQuery ? fQuery.toLowerCase() : '';
  filtered = JOBS.filter(j => {
    if (fDiscs.length && !fDiscs.includes(j.disc)) return false;
    if (fStatus !== 'all' && j.status !== fStatus) return false;
    if (fRemote !== 'Any' && j.remote !== fRemote) return false;
    if (fRegion && j.r !== fRegion) return false;
    if (fLevel && !j.l.split(/[,\/]/).some(p => normalizeLevel(p.trim()) === fLevel)) return false;
    if (fSoftRegexes.length && !fSoftRegexes.some(re => re.test(j._hay))) return false;
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
  btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = `<span class="chip-dot" style="background:${d.color}"></span><span data-i18n="disc.${d.id}">${t('disc.' + d.id)}</span>`;
  btn.onclick = () => {
    if (fDiscs.includes(d.id)) {
      fDiscs = fDiscs.filter(x => x !== d.id);
      btn.classList.remove('on');
      btn.setAttribute('aria-pressed', 'false');
      btn.style.borderColor = ''; btn.style.color = ''; btn.style.background = '';
    } else {
      fDiscs.push(d.id);
      btn.classList.add('on');
      btn.setAttribute('aria-pressed', 'true');
      btn.style.borderColor = d.color; btn.style.color = d.color;
      btn.style.background  = hexRgba(d.color, .08);
    }
    applyFilters();
  };
  chipWrap.appendChild(btn);
});

// -- Software chips --
document.querySelectorAll('.soft-chip').forEach(btn => {
  btn.setAttribute('aria-pressed', 'false');
  btn.onclick = () => {
    const sw = btn.textContent.trim().toLowerCase();
    if (fSofts.includes(sw)) {
      const i = fSofts.indexOf(sw);
      fSofts.splice(i, 1); fSoftRegexes.splice(i, 1);
      btn.classList.remove('on');
      btn.setAttribute('aria-pressed', 'false');
    } else {
      fSofts.push(sw); fSoftRegexes.push(swRegex(sw));
      btn.classList.add('on');
      btn.setAttribute('aria-pressed', 'true');
    }
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
      btns.forEach(b => { b.classList.remove('on'); b.setAttribute('aria-selected', 'false'); });
      btn.classList.add('on');
      btn.setAttribute('aria-selected', 'true');
      onChange(btn.dataset.v);
    };
  });
}
wireSegmented('status-seg', v => { fStatus = v; applyFilters(); });
wireSegmented('remote-seg', v => { fRemote = v; applyFilters(); });
wireSegmented('level-seg',  v => { fLevel  = v; applyFilters(); });
wireSegmented('region-seg', v => { fRegion = v; applyFilters(); });

