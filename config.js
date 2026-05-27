// ── Sheet ─────────────────────────────────────────────────────────────────
const SHEET_ID  = '1eR2oAXOuflr8CZeGoz3JTrsgNj3KuefbdXJOmNtjEVM';
const EDU_GID   = '932464799';
const EDU_COL   = { name:2, country:4, city:6, state:8, desc:10 };
const WEB_GID   = '1290941975';
const WEB_COL   = { name:2, url:4, notes:6 };

// Column indices in the gviz response (0-based)
const COL = {
  studio:   0,
  city:     2,
  country:  6,
  title:    8,
  level:    10,
  workMode: 12,
  date:     14,
  contact:  16,
  software: 18,
  notes:    20,
  featured: 21,
  region:   22,
};

// ── Disciplines ───────────────────────────────────────────────────────────
const DISCS = [
  {id:'anim',  label:'Animation',   color:'#C77DFF'},
  {id:'comp',  label:'Compositing', color:'#F5A524'},
  {id:'fx',    label:'FX / Sim',    color:'#FF3D5A'},
  {id:'light', label:'Lighting',    color:'#FFD166'},
  {id:'model', label:'Model / Art', color:'#6DE0EA'},
  {id:'pipe',  label:'Pipeline',    color:'#2BC4D2'},
  {id:'prod',  label:'Production',  color:'#B4B4BC'},
  {id:'rig',   label:'Rigging',     color:'#A8E10C'},
];
const DISC_MAP = Object.fromEntries(DISCS.map(d => [d.id, d]));

// ── Country → Region ──────────────────────────────────────────────────────
const COUNTRY_REGION = {
  'United States':'North America','USA':'North America','US':'North America',
  'Canada':'North America','Mexico':'North America',

  'United Kingdom':'Europe','UK':'Europe','England':'Europe','Scotland':'Europe','Wales':'Europe',
  'France':'Europe','Germany':'Europe','Spain':'Europe','Italy':'Europe',
  'Netherlands':'Europe','Belgium':'Europe','Sweden':'Europe','Norway':'Europe',
  'Denmark':'Europe','Finland':'Europe','Austria':'Europe','Switzerland':'Europe',
  'Poland':'Europe','Czech Republic':'Europe','Hungary':'Europe','Romania':'Europe',
  'Portugal':'Europe','Ireland':'Europe','Greece':'Europe','Croatia':'Europe',
  'Bulgaria':'Europe','Serbia':'Europe','Ukraine':'Europe','Slovakia':'Europe',
  'Luxembourg':'Europe','Iceland':'Europe','Estonia':'Europe','Latvia':'Europe',
  'Lithuania':'Europe','Slovenia':'Europe',

  'China':'Asia','Japan':'Asia','South Korea':'Asia','Korea':'Asia',
  'India':'Asia','Singapore':'Asia','Taiwan':'Asia','Hong Kong':'Asia',
  'Thailand':'Asia','Vietnam':'Asia','Malaysia':'Asia','Indonesia':'Asia',
  'Philippines':'Asia','Pakistan':'Asia','Bangladesh':'Asia',

  'Australia':'Oceania/Australia','New Zealand':'Oceania/Australia',

  'Brazil':'South America','Argentina':'South America','Colombia':'South America',
  'Chile':'South America','Peru':'South America','Venezuela':'South America',
  'Uruguay':'South America','Ecuador':'South America',

  'Israel':'Middle East','UAE':'Middle East','United Arab Emirates':'Middle East',
  'Saudi Arabia':'Middle East','Turkey':'Middle East',
  'South Africa':'Africa','Nigeria':'Africa','Kenya':'Africa',
};

// ── Status ────────────────────────────────────────────────────────────────
const STATUS_DAYS     = {new:1, recent:4, active:10}; // thresholds in days; legend labels derive from these
const STATUS_ORDER    = {new:0, recent:1, active:2, ongoing:3};
const STATUS_COLOR    = {new:'#FF3D5A', recent:'#FF7A3D', active:'#F5A524', ongoing:'#2BC4D2'};
const STATUS_PRIORITY = {new:3, recent:2, active:1, ongoing:0};
