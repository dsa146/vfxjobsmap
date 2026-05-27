(function initMobileNav() {
  const mobileNav = document.getElementById('mobile-nav');
  if (!mobileNav) return;
  const railEl   = document.querySelector('.rail');
  const feedEl   = document.querySelector('.feed');
  const mnavBtns = mobileNav.querySelectorAll('.mnav-item');
  let activeSheet = 'none';

  const MORE_VIEWS = new Set(['edu', 'studios', 'web']);
  const morePopup  = document.getElementById('mnav-more-popup');
  const moreBtn    = document.getElementById('mnav-more');

  function setMorePopup(open) {
    morePopup.classList.toggle('hidden', !open);
    moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      morePopup.querySelectorAll('.mnav-more-item').forEach(item => {
        item.classList.toggle('on', item.dataset.nav === currentView);
      });
    }
  }

  function setActive(nav) {
    const highlight = MORE_VIEWS.has(nav) ? 'more' : nav;
    mnavBtns.forEach(b => b.classList.toggle('on', b.dataset.nav === highlight));
  }

  morePopup.querySelectorAll('.mnav-more-item').forEach(item => {
    item.addEventListener('click', () => {
      setMorePopup(false);
      openSheet('none');
      switchView(item.dataset.nav);
    });
  });

  document.addEventListener('click', e => {
    if (!morePopup.classList.contains('hidden') &&
        !morePopup.contains(e.target) && e.target !== moreBtn && !moreBtn.contains(e.target)) {
      setMorePopup(false);
    }
  });

  function openSheet(name) {
    const next = (name === activeSheet && name !== 'none') ? 'none' : name;
    activeSheet = next;
    railEl.classList.toggle('sheet-open', next === 'filters');
    feedEl.classList.toggle('sheet-open', next === 'feed');
    setActive(next === 'none' ? currentView : next);
    mnavBtns.forEach(b => {
      if (b.dataset.nav === 'filters' || b.dataset.nav === 'feed')
        b.setAttribute('aria-expanded', b.dataset.nav === next ? 'true' : 'false');
    });
    if (next !== 'none') map.invalidateSize();
  }

  closeMobileSheet = () => openSheet('none');
  syncMobileNav    = (view) => { if (activeSheet === 'none') { setActive(view); setMorePopup(false); } };

  mnavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const nav = btn.dataset.nav;
      if (nav === 'more') {
        setMorePopup(morePopup.classList.contains('hidden'));
      } else if (nav === 'feed' || nav === 'filters') {
        setMorePopup(false);
        if (currentView !== 'map') switchView('map');
        openSheet(nav);
      } else {
        setMorePopup(false);
        openSheet('none');
        switchView(nav);
      }
    });
  });

  document.querySelector('.stage').addEventListener('click', () => {
    if (activeSheet !== 'none') openSheet('none');
  });

  ['rail-handle', 'feed-handle'].forEach(id => {
    const handle = document.getElementById(id);
    if (!handle) return;
    let startY = 0;
    handle.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, {passive:true});
    handle.addEventListener('touchend', e => {
      if (e.changedTouches[0].clientY - startY > Math.max(36, window.innerHeight * 0.06)) openSheet('none');
    }, {passive:true});
    handle.addEventListener('click', () => openSheet('none'));
  });
})();
