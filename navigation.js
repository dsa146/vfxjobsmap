// -- View navigation --
const mapPanel  = document.querySelector('.main');
const listPanel = document.getElementById('panel-list');
const studPanel = document.getElementById('panel-studios');
const eduPanel  = document.getElementById('panel-edu');
const webPanel  = document.getElementById('panel-web');
const navLinks  = document.querySelectorAll('.topnav a');
let currentView = 'map';

const mqlLandscape = window.matchMedia('(max-height:500px) and (orientation:landscape)');
const ALT_VIEWS = new Set(['edu', 'web']); // views that use their own search, not fQuery

function switchView(name) {
  const leaving = currentView;
  currentView = name;
  navLinks.forEach(a => a.classList.toggle('active', a.dataset.nav === name));
  const landscape = mqlLandscape.matches;
  const mapWithPanel = landscape && !['list','studios','edu','web'].includes(name);
  mapPanel.style.display  = (name === 'map' || mapWithPanel) ? '' : 'none';
  listPanel.style.display = name === 'list'    ? 'flex' : 'none';
  studPanel.style.display = name === 'studios' ? 'flex' : 'none';
  eduPanel.style.display  = name === 'edu'     ? 'flex' : 'none';
  webPanel.style.display  = name === 'web'     ? 'flex' : 'none';
  if (name === 'list')    requestAnimationFrame(renderListView);
  if (name === 'studios') requestAnimationFrame(renderStudiosView);
  if (name === 'edu')     requestAnimationFrame(initEduView);
  if (name === 'web')     requestAnimationFrame(initWebView);
  if (name === 'map' || mapWithPanel) map.invalidateSize();
  syncMobileNav(name);
  if (name !== leaving) {
    const enteringAlt = ALT_VIEWS.has(name);
    const leavingAlt  = ALT_VIEWS.has(leaving);
    if (enteringAlt) {
      fQuery = ''; eduQuery = ''; webQuery = '';
      clearTimeout(searchTimer);
      searchEl.value = '';
      updateSearchClear();
      applyFilters();
    } else if (leavingAlt) {
      eduQuery = ''; webQuery = '';
      fQuery = '';
      searchEl.value = '';
      updateSearchClear();
      applyFilters();
    }
    syncSearchPlaceholder();
  }
}

window.addEventListener('orientationchange', () => {
  setTimeout(() => { switchView(currentView); map.invalidateSize(); }, 300);
});
navLinks.forEach(a => a.addEventListener('click', () => switchView(a.dataset.nav)));
