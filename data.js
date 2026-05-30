// ── Fetch constants ───────────────────────────────────────────────────────
const FETCH_TIMEOUT_MS  = 20000;
const FETCH_RETRY_MS    = 2000;
const FETCH_MAX_RETRIES = 3;

// ── Utilities ─────────────────────────────────────────────────────────────
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function hexRgba(hex, a) {
  const m = hex.replace('#',''); const n = parseInt(m,16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function swRegex(sw)  { return new RegExp('(?:^|[^a-z0-9])' + escapeRe(sw) + '(?:[^a-z0-9]|$)'); }

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).toUpperCase().padStart(7, '0');
}

function stableJobId(j) {
  const key = [j.s, j.t, j.loc, j.d, j.u]
    .map(v => String(v || '').trim().toLowerCase().replace(/\s+/g, ' '))
    .join('|');
  return 'JOB-' + hashString(key);
}

function safeUrl(raw, fallbackProtocol) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(s);
  if (!hasProtocol && !fallbackProtocol) return '';
  const candidate = fallbackProtocol && !hasProtocol
    ? fallbackProtocol + s
    : s;
  try {
    const url = new URL(candidate, location.href);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function contactUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return safeUrl(s);

  const email = s.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  if (email) return safeUrl(email[0], 'mailto:');

  const web = s.match(/(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s<>"']*)?/i);
  if (web) return safeUrl(web[0].startsWith('www.') ? 'https://' + web[0] : web[0], 'https://');

  return safeUrl(s);
}

// ── Date / age helpers ────────────────────────────────────────────────────
function parseSheetDate(raw) {
  if (!raw) return null;
  const s = String(raw);
  const gviz = s.match(/Date\((\d+),(\d+),(\d+)\)/);
  if (gviz) return new Date(+gviz[1], +gviz[2], +gviz[3]);
  const months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  const m = s.match(/(\w{3})\w*\.?\s+(\d+)/);
  if (!m) return null;
  const mo = months[m[1]], day = parseInt(m[2]);
  if (mo === undefined || isNaN(day)) return null;
  const now = new Date();
  const d = new Date(now.getFullYear(), mo, day);
  // If the parsed date is more than 30 days in the future, it belongs to last year
  if (d.getTime() - now.getTime() > 30 * 86400000) d.setFullYear(now.getFullYear() - 1);
  return d;
}

function getStatus(date) {
  if (!date) return 'ongoing';
  const diffDays = (Date.now() - date.getTime()) / 86400000;
  if (diffDays < STATUS_DAYS.new)    return 'new';
  if (diffDays < STATUS_DAYS.recent) return 'recent';
  if (diffDays < STATUS_DAYS.active) return 'active';
  return 'ongoing';
}

function getPostedH(date) {
  if (!date) return 500;
  return Math.max(1, Math.round((Date.now() - date.getTime()) / 3600000));
}

function fmtAge(h) {
  if (h >= 48) return t('app.age_d', Math.round(h / 24));
  return t('app.age_h', h);
}

// ── Job field classifiers ─────────────────────────────────────────────────
function getDisc(title) {
  const tl = title.toLowerCase();
  if (/compositor|compositing|lighting\/compositing|matte paint/.test(tl)) return 'comp';
  if (/\blighting\b/.test(tl)) return 'light';
  if (/\banimator|\banimation/.test(tl)) return 'anim';
  if (/\bvfx|\bfx\b|fx artist|fx td|cfx/.test(tl)) return 'fx';
  if (/modeler|environment artist|character|concept|texture|look dev|generalist|groom|storyboard|illustrator|2d artist|3d artist/.test(tl)) return 'model';
  if (/rigger|rigging/.test(tl)) return 'rig';
  if (/pipeline|technical director|\btd\b|programmer|developer|engineer|systems|build engineer|technical artist|technical animator/.test(tl)) return 'pipe';
  return 'prod';
}

function getRemote(w) {
  const lw = (w || '').toLowerCase();
  if (lw.includes('remote') && lw.includes('on-site')) return 'Hybrid';
  if (lw === 'hybrid') return 'Hybrid';
  if (lw.includes('on-site') || lw.includes('onsite')) return 'On-site';
  return 'Remote';
}

function normalizeLevel(l) {
  const lw = (l || '').toLowerCase();
  if (lw.includes('head') || lw.includes('director')) return 'head';
  if (lw.includes('sup') || lw.includes('manager')) return 'sup';
  if (lw.includes('lead')) return 'lead';
  if (lw.includes('senior')) return 'senior';
  if (lw.includes('mid')) return 'mid';
  if (lw.includes('junior') || lw.includes('jr')) return 'junior';
  if (lw.includes('assistant') || lw.includes('associate') || lw.includes('trainee') || lw.includes('intern')) return 'entry';
  return '';
}

function tLevel(l) {
  const key = normalizeLevel(l);
  return key ? t('level.' + key) : (l || '—');
}

function displayLevel(l) {
  if (fLevel) return t('level.' + fLevel);
  return tLevel(l);
}

function tRemote(remote) {
  if (remote === 'Remote') return t('work.remote');
  if (remote === 'Hybrid') return t('work.hybrid');
  if (remote === 'On-site') return t('work.on_site');
  return remote;
}

function getCoords(j) {
  if (!j.c) return CO_LL[j.co] || null;
  return CC[j.c + '|' + j.co] || CC[j.c] || CO_LL[j.co] || null;
}

// ── Sheet fetch ───────────────────────────────────────────────────────────
function renderFetchError(el, msg, retryExpr, title) {
  const label = title !== undefined ? title : t('app.failed');
  const hint = msg.includes('timed out') ? t('app.err_hint_access') : t('app.err_hint_network');
  const sheetHref = `https://docs.google.com/spreadsheets/d/${SHEET_ID}`;
  const btn = retryExpr
    ? `<br><br><button onclick="${retryExpr}" style="background:var(--amber);color:#1a1200;border:0;padding:6px 14px;font-family:monospace;font-size:11px;letter-spacing:.12em;cursor:pointer">${t('app.retry')}</button>`
    : '';
  el.innerHTML = `<div style="padding:20px;color:#F5A524;font-size:12px;font-family:monospace;line-height:1.8">
    ⚠ ${label}<br>
    <span style="color:#7A7A85;font-size:11px">${esc(msg)}</span><br><br>
    <span style="color:#7A7A85;font-size:10px;line-height:1.7">${hint}<br>
    <a href="${sheetHref}" target="_blank" rel="noopener" style="color:var(--amber)">${t('app.err_open_sheet')}</a>
    </span>${btn}
  </div>`;
}

function fetchGviz(gid, cbName) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      if (script.parentNode) script.parentNode.removeChild(script);
      delete window[cbName];
      reject(new Error('Request timed out'));
    }, FETCH_TIMEOUT_MS);
    window[cbName] = res => {
      clearTimeout(timer);
      if (script.parentNode) script.parentNode.removeChild(script);
      delete window[cbName];
      if (!res || !res.table) {
        const msg = res?.errors?.[0]?.detailed_message || res?.errors?.[0]?.message || 'No data returned';
        reject(new Error(msg)); return;
      }
      resolve(res.table.rows);
    };
    script.onerror = () => {
      clearTimeout(timer);
      if (script.parentNode) script.parentNode.removeChild(script);
      delete window[cbName];
      reject(new Error('Network error'));
    };
    const qs = gid ? `tqx=out:json;responseHandler:${cbName}&gid=${gid}` : `tqx=out:json;responseHandler:${cbName}&t=${Date.now()}`;
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?${qs}`;
    document.head.appendChild(script);
  });
}

function parseGvizRows(rows) {
  const seenIds = new Map();
  return rows.map(row => {
    const c = row.c;
    const get = i => (c[i] && c[i].v != null) ? String(c[i].v).trim() : '';
    const studio = get(COL.studio), title = get(COL.title);
    if (!studio || !title) return null;
    const dateRaw = c[COL.date] ? (c[COL.date].f || c[COL.date].v) : '';
    const dateStr = dateRaw ? String(dateRaw).replace(/,?\s*\d{4}$/, '').trim() : '';
    const featuredRaw = c[COL.featured]?.v;
    return { s:studio, c:get(COL.city), co:get(COL.country), t:title,
             l:get(COL.level), w:get(COL.workMode), d:dateStr,
             r:COUNTRY_REGION[get(COL.country)] || get(COL.region), u:get(COL.contact), sw:get(COL.software), n:get(COL.notes),
             featured: featuredRaw === 1 || featuredRaw === '1' };
  }).filter(Boolean).map((j, i) => {
    const date = parseSheetDate(j.d);
    const loc = j.c ? (j.co ? j.c + ', ' + j.co : j.c) : (j.co || '');
    const baseId = stableJobId({...j, loc});
    const seenCount = (seenIds.get(baseId) || 0) + 1;
    seenIds.set(baseId, seenCount);
    const legacyId = 'JOB-' + String(i+1).padStart(4,'0');
    const displayId = 'JOB ' + String(i+1).padStart(4,'0');
    const base = {
      ...j,
      id: seenCount === 1 ? baseId : `${baseId}-${seenCount}`,
      legacyId,
      displayId,
      disc: getDisc(j.t), status: getStatus(date), postedH: getPostedH(date),
      remote: getRemote(j.w), ll: getCoords(j),
      loc,
    };
    base._hay    = `${base.t} ${base.sw||''} ${base.n}`.toLowerCase();
    base._search = `${base.t} ${base.s} ${base.c} ${base.co}`.toLowerCase();
    return base;
  });
}

async function fetchSheetJobs() {
  const rows = await fetchGviz(null, 'gvizJobsCb');
  return parseGvizRows(rows);
}
