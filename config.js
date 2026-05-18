// ── Sheet ─────────────────────────────────────────────────────────────────
const SHEET_ID = '1eR2oAXOuflr8CZeGoz3JTrsgNj3KuefbdXJOmNtjEVM';

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

// ── Status ────────────────────────────────────────────────────────────────
const STATUS_ORDER    = {new:0, recent:1, active:2, ongoing:3};
const STATUS_COLOR    = {new:'#FF3D5A', recent:'#FF7A3D', active:'#F5A524', ongoing:'#2BC4D2'};
const STATUS_PRIORITY = {new:3, recent:2, active:1, ongoing:0};
