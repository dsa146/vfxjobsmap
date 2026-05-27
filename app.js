// -- App constants --
const SEARCH_DEBOUNCE_MS  = 150;
const SIG_INTERVAL_MS     = 30000;
const SIG_TIMEOUT_MS      = 4000;
const NOTIF_SEEN_DELAY_MS = 2000;
const FEED_PAGE_SIZE      = 30;

// -- App state --
let JOBS = [], dataLoadFailed = false;
let jobsError = null, eduError = null, webError = null;
let fDiscs = [], fSofts = [], fSoftRegexes = [], fStatus = 'all', fRemote = 'Any', fRegion = '', fLevel = '', fQuery = '';
let selectedJob = null, filtered = [], lastMapKey = '';
let feedPage = 1, feedObserver = null;

// -- DOM cache --
const elFeedList     = document.getElementById('feed-list');
const elFeedCount    = document.getElementById('feed-count');
const elListBody     = document.getElementById('list-body');
const elHudJobs      = document.getElementById('hud-jobs');
const elHudStudios   = document.getElementById('hud-studios');
const elHudCountries = document.getElementById('hud-countries');
const elRailCount    = document.getElementById('rail-count');
const elStudiosBody  = document.getElementById('studios-body');
const elTcTime       = document.getElementById('tc-time');
const elLc = {
  new:     document.getElementById('lc-new'),
  recent:  document.getElementById('lc-recent'),
  active:  document.getElementById('lc-active'),
  ongoing: document.getElementById('lc-ongoing'),
};
function applyLegendLabels() {
  const d = t('legend.day');
  document.getElementById('lc-age-recent').textContent  = `1-${STATUS_DAYS.recent - 1}${d}`;
  document.getElementById('lc-age-active').textContent  = `${STATUS_DAYS.recent}-${STATUS_DAYS.active - 1}${d}`;
  document.getElementById('lc-age-ongoing').textContent = `${STATUS_DAYS.active}${d}+`;
}
const elSig = {
  hud: document.getElementById('sig-hud'),
  tc:  document.getElementById('sig-tc'),
};
const elDr = {
  backdrop:      document.getElementById('drawer-backdrop'),
  drawer:        document.getElementById('drawer'),
  eye:           document.getElementById('drawer-eye'),
  title:         document.getElementById('drawer-title'),
  studio:        document.getElementById('drawer-studio'),
  city:          document.getElementById('drawer-city'),
  tags:          document.getElementById('drawer-tags'),
  meta:          document.querySelector('.drawer-meta'),
  posted:        document.getElementById('dm-posted'),
  mode:          document.getElementById('dm-mode'),
  level:         document.getElementById('dm-level'),
  sname:         document.getElementById('dm-sname'),
  smeta:         document.getElementById('dm-smeta'),
  notesSection:  document.getElementById('drawer-notes-section'),
  notes:         document.getElementById('drawer-notes'),
  studioSection: document.getElementById('drawer-studio-section'),
  viewStudio:    document.getElementById('drawer-view-studio'),
  actions:       document.querySelector('.drawer-actions'),
  save:          document.getElementById('drawer-save'),
  saveLabel:     document.getElementById('drawer-save-label'),
  saveIconOff:   document.getElementById('drawer-save-icon-off'),
  saveIconOn:    document.getElementById('drawer-save-icon-on'),
  share:         document.getElementById('drawer-share'),
  shareLabel:    document.getElementById('drawer-share-label'),
  apply:         document.getElementById('drawer-apply'),
};
const elListColBtns = document.querySelectorAll('.list-col-btn');
const elWebColBtns  = document.querySelectorAll('.web-col-btn');

// Mobile nav hooks are assigned by mobile.js when the mobile UI exists.
let closeMobileSheet = () => {};
let syncMobileNav    = () => {};
