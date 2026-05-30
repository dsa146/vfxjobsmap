// -- Map --
const map = L.map('map', {
  center: [30, 10], zoom: 2, minZoom: 2, maxZoom: 10,
  zoomControl: true, worldCopyJump: false,
  maxBounds: [[-90,-180],[90,180]], maxBoundsViscosity: 1.0,
});
const ATTR = '&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const tileDark  = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',  {attribution:ATTR,subdomains:'abcd',maxZoom:19});
const tileLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {attribution:ATTR,subdomains:'abcd',maxZoom:19});
tileDark.addTo(map);
const markerLayer = L.layerGroup().addTo(map);
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches;

function worstStatus(statuses) {
  return statuses.reduce((a,b) => STATUS_PRIORITY[b] > STATUS_PRIORITY[a] ? b : a, 'ongoing');
}

function makeIcon(status, count, idx = 0) {
  const col = STATUS_COLOR[status];
  const delay = Math.min(idx * 25, 500);
  const badge = count > 1 ? `<span class="pin-count">${count}</span>` : '';
  const pulse = (IS_TOUCH || status === 'ongoing') ? '' : `<span class="pin-pulse" style="border-color:${col}55"></span>`;
  return L.divIcon({
    html: `<div class="pin-wrap" style="animation-delay:${delay}ms">${pulse}<span class="pin-dot" style="background:${col};box-shadow:0 0 10px ${col}88"></span>${badge}</div>`,
    className:'', iconSize:[24,24], iconAnchor:[12,12], popupAnchor:[0,-16],
  });
}

function updateMap() {
  const key = filtered.map(j => j.id).join('|');
  if (key === lastMapKey) return;
  lastMapKey = key;
  markerLayer.clearLayers();
  const groups = {};
  filtered.forEach(j => {
    if (!j.ll) return;
    const k = j.ll[0].toFixed(2)+','+j.ll[1].toFixed(2);
    if (!groups[k]) groups[k] = {ll:j.ll, jobs:[], label:j.loc};
    groups[k].jobs.push(j);
  });
  Object.values(groups).forEach((g, idx) => {
    const status = worstStatus(g.jobs.map(j=>j.status));
    const m = L.marker(g.ll, {icon: makeIcon(status, g.jobs.length, idx)});
    m.bindPopup(buildPopup(g.label, g.jobs), {maxWidth:280, className:''});
    markerLayer.addLayer(m);
  });
}

function buildPopup(city, jobs) {
  const rows = jobs.map(j => {
    const disc = DISC_MAP[j.disc];
    return `<button class="pop-job" onclick="openDrawer('${j.id}')">
      <div class="pop-job-title">${esc(j.t)}</div>
      <div class="pop-job-studio">${esc(j.s)}</div>
      <div class="pop-tags">
        <span class="ptag" style="color:${disc?.color};border-color:${disc?.color}44">${t('disc.' + j.disc)}</span>
        <span class="ptag">${displayLevel(j.l)}</span>
        <span class="ptag">${tRemote(j.remote)}</span>
      </div>
    </button>`;
  }).join('');
  return `<div class="pop-head"><div class="pop-city">${esc(city)}</div><div class="pop-cnt">${t('app.positions', jobs.length)}</div></div><div class="pop-list">${rows}</div>`;
}
