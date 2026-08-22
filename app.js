/* ============================================================
   SmartExam — ระบบตรวจข้อสอบ (ทำงานบนเบราว์เซอร์ล้วน)
   ฐานข้อมูล: localStorage  |  รันบน GitHub Pages ได้ทันที
   ============================================================ */
(function () {
'use strict';

/* ---------- helpers ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const TH_DAY   = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const TH_DAY_S = ['อา','จ','อ','พ','พฤ','ศ','ส'];
const TH_MON   = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const thaiDate = (d = new Date(), full = false) => {
  const be = d.getFullYear() + 543;
  return (full ? `วัน${TH_DAY[d.getDay()]}ที่ ` : '') + `${d.getDate()} ${TH_MON[d.getMonth()]} ${be}`;
};
const clock2 = n => String(n).padStart(2, '0');

/* ชุดตัวเลือก */
const LABELSETS = {
  thai:   ['ก','ข','ค','ง','จ','ฉ'],
  eng:    ['A','B','C','D','E','F'],
  number: ['1','2','3','4','5','6'],
};
const labelsFor = (kind, n) => LABELSETS[kind].slice(0, n);

/* ---------- Database (localStorage) ---------- */
const DB = {
  K: 'smartexam.v1',
  _d: null,
  load() {
    if (this._d) return this._d;
    try { this._d = JSON.parse(localStorage.getItem(this.K)) || null; } catch (e) { this._d = null; }
    if (!this._d) this._d = { profile: { name: 'นายศิริพงษ์ ธิวรรณ', role: 'ครูผู้สอน' }, sheets: [], results: [] };
    if (!this._d.sheets)  this._d.sheets  = [];
    if (!this._d.results) this._d.results = [];
    return this._d;
  },
  save() { localStorage.setItem(this.K, JSON.stringify(this._d)); },
  get sheets()  { return this.load().sheets; },
  get results() { return this.load().results; },
  get profile() { return this.load().profile; },
  sheet(id) { return this.sheets.find(s => s.id === id); },
  addSheet(s)  { this.load().sheets.unshift(s); this.save(); },
  updSheet(id, patch) { const s = this.sheet(id); if (s) Object.assign(s, patch); this.save(); },
  delSheet(id) { const d = this.load(); d.sheets = d.sheets.filter(s => s.id !== id); d.results = d.results.filter(r => r.sheetId !== id); this.save(); },
  addResult(r) { this.load().results.unshift(r); this.save(); },
  delResult(id){ const d = this.load(); d.results = d.results.filter(r => r.id !== id); this.save(); },
  resultsOf(sheetId) { return this.results.filter(r => r.sheetId === sheetId); },
  keyDone(s) { return Array.isArray(s.key) && s.key.length === s.questions && s.key.every(k => k !== null && k !== undefined && k !== ''); },
  exportAll() { return JSON.stringify(this.load(), null, 2); },
  importAll(json) {
    const o = JSON.parse(json);
    if (!o || !Array.isArray(o.sheets)) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
    this._d = { profile: o.profile || this.profile, sheets: o.sheets, results: o.results || [] };
    this.save();
  },
  wipe() { localStorage.removeItem(this.K); this._d = null; this.load(); },
};

/* ---------- Toast ---------- */
function toast(msg, kind = '') {
  let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast-x ' + kind;
  t.innerHTML = `<span>${esc(msg)}</span>`;
  box.appendChild(t);
  setTimeout(() => { t.style.transition = '.3s'; t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; setTimeout(() => t.remove(), 320); }, 2600);
}

/* ---------- Modal ---------- */
function modal({ title, body, actions = [] }) {
  const ov = document.createElement('div'); ov.className = 'ov on';
  ov.innerHTML = `<div class="modal"><div class="modal-h">${esc(title)}</div>
    <div class="modal-b">${body}</div>
    <div class="modal-f">${actions.map((a, i) => `<button class="btn ${a.cls || 'btn-ghost'} btn-sm px-3" data-i="${i}">${esc(a.label)}</button>`).join('')}</div></div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  actions.forEach((a, i) => $(`[data-i="${i}"]`, ov).addEventListener('click', () => { const r = a.onClick && a.onClick(ov); if (r !== false) close(); }));
  return { ov, close };
}
function confirmBox(msg, onYes, yes = 'ยืนยัน', danger = true) {
  modal({ title: 'ยืนยัน', body: `<p class="mb-0" style="color:var(--sub)">${esc(msg)}</p>`,
    actions: [{ label: 'ยกเลิก' }, { label: yes, cls: danger ? 'btn-danger-soft' : 'btn-brand', onClick: () => { onYes(); } }] });
}

/* ============================================================
   LAYOUT (sidebar + topbar)  — SPA hash routing
   ============================================================ */
const NAV = [
  { id: 'dashboard', label: 'แดชบอร์ด',        cap: 'เมนูครูผู้สอน', icon: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>' },
  { id: 'sheets',    label: 'กระดาษคำตอบ',      icon: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>' },
  { id: 'scan',      label: 'สแกนตรวจข้อสอบ',   icon: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>' },
  { id: 'results',   label: 'รายงานคะแนน',      icon: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>' },
];
const IC = { chev: '<path d="m9 18 6-6-6-6"/>', plus: '<path d="M5 12h14"/><path d="M12 5v14"/>' };
const svg = (paths, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

function renderShell() {
  const p = DB.profile;
  document.body.innerHTML = `
  <div class="backdrop" id="bd"></div>
  <aside class="sidebar" id="sb">
    <a href="#/dashboard" class="sb-brand">
      <svg width="36" height="36" viewBox="0 0 48 48" fill="none" class="brand-mark">
        <defs><linearGradient id="lg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
        <stop stop-color="#6366f1"/><stop offset=".55" stop-color="#8b5cf6"/><stop offset="1" stop-color="#06b6d4"/></linearGradient></defs>
        <rect width="48" height="48" rx="13" fill="url(#lg)"/>
        <path d="M14 15v-2.5a2 2 0 0 1 2-2H19" stroke="#fff" stroke-opacity=".85" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M29 10.5h3a2 2 0 0 1 2 2V15" stroke="#fff" stroke-opacity=".85" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M34 33v2.5a2 2 0 0 1-2 2H29" stroke="#fff" stroke-opacity=".85" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M19 37.5h-3a2 2 0 0 1-2-2V33" stroke="#fff" stroke-opacity=".85" stroke-width="2.4" stroke-linecap="round"/>
        <path d="m17.5 24.2 4.6 4.6 8.4-9.6" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div><b>SmartExam</b><span>ระบบตรวจข้อสอบอัจฉริยะ</span></div>
    </a>
    <div class="sb-cap">เมนูครูผู้สอน</div>
    <nav id="nav"></nav>
    <div class="sb-cap">ทางลัด</div>
    <a href="#/sheets?new=1" class="sb-a">${svg(IC.plus)}<span>สร้างกระดาษคำตอบ</span></a>
    <div class="sb-foot">
      <div class="sb-user">
        <div class="av">${esc((p.name || 'ค')[0])}</div>
        <div class="flex-grow-1 overflow-hidden">
          <div class="text-white text-truncate" style="font-size:.85rem">${esc(p.name)}</div>
          <div class="text-truncate" style="font-size:.7rem;color:#7c8aa8">${esc(p.role || 'ครูผู้สอน')}</div>
        </div>
        <button class="btn btn-icon text-secondary" id="btnSettings" title="ตั้งค่า" style="background:transparent;border:0;color:#7c8aa8">
          ${svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>', 'ic-sm')}
        </button>
      </div>
    </div>
  </aside>
  <div class="main">
    <div class="topbar">
      <button class="btn btn-ghost btn-icon d-lg-none" id="mbtn">${svg('<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>')}</button>
      <div class="flex-grow-1 overflow-hidden">
        <h1 class="ptitle text-truncate" id="pt">แดชบอร์ด</h1>
        <p class="psub text-truncate" id="ps">ภาพรวมการตรวจข้อสอบของคุณ</p>
      </div>
      <div class="d-none d-md-flex align-items-center gap-2 muted" style="font-size:.82rem">
        ${svg('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>', 'ic-sm')}<span>${thaiDate()}</span>
      </div>
      <a href="#/scan" class="btn btn-brand btn-sm px-3">${svg('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>', 'ic-sm')} <span class="d-none d-sm-inline">สแกนตรวจ</span></a>
    </div>
    <div id="view"></div>
    <footer class="noprint px-3 py-3 text-center muted" style="font-size:.76rem;border-top:1px solid var(--line)">
      SmartExam · ${thaiDate(new Date(), true)} · ฐานข้อมูลถูกเก็บในเบราว์เซอร์เครื่องนี้
    </footer>
  </div>`;

  // nav
  $('#nav').innerHTML = NAV.map(n => `<a href="#/${n.id}" class="sb-a" data-nav="${n.id}">${svg(n.icon)}<span>${n.label}</span></a>`).join('');
  // mobile drawer
  const sb = $('#sb'), bd = $('#bd');
  const drawer = o => { sb.classList.toggle('open', o); bd.classList.toggle('on', o); };
  $('#mbtn').addEventListener('click', () => drawer(!sb.classList.contains('open')));
  bd.addEventListener('click', () => drawer(false));
  $$('.sb-a', sb).forEach(a => a.addEventListener('click', () => drawer(false)));
  $('#btnSettings').addEventListener('click', openSettings);
}

function setActive(id) {
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === id));
  const meta = {
    dashboard: ['แดชบอร์ด', 'ภาพรวมการตรวจข้อสอบของคุณ'],
    sheets:    ['กระดาษคำตอบ', 'สร้างและจัดการชุดข้อสอบ + คีย์เฉลย'],
    scan:      ['สแกนตรวจข้อสอบ', 'ใช้กล้องมือถือตรวจอัตโนมัติ'],
    results:   ['รายงานคะแนน', 'ดูสถิติและส่งออก CSV'],
  }[id] || ['แดชบอร์ด', ''];
  $('#pt').textContent = meta[0]; $('#ps').textContent = meta[1];
}

/* ---------- settings ---------- */
function openSettings() {
  const p = DB.profile;
  const m = modal({
    title: 'ตั้งค่า',
    body: `<div class="field"><label>ชื่อครูผู้สอน</label><input class="inp" id="stName" value="${esc(p.name)}"></div>
      <div class="field"><label>ตำแหน่ง</label><input class="inp" id="stRole" value="${esc(p.role || '')}"></div>
      <hr style="border-color:var(--line)">
      <div class="d-flex gap-2 flex-wrap">
        <button class="btn btn-soft btn-sm" id="stExport">สำรองข้อมูล (.json)</button>
        <button class="btn btn-soft btn-sm" id="stImport">นำเข้าข้อมูล</button>
        <button class="btn btn-danger-soft btn-sm" id="stWipe">ล้างข้อมูลทั้งหมด</button>
      </div>
      <input type="file" id="stFile" accept=".json" hidden>`,
    actions: [{ label: 'ปิด' }, { label: 'บันทึก', cls: 'btn-brand', onClick: ov => {
      DB.load().profile = { name: $('#stName', ov).value.trim() || 'ครูผู้สอน', role: $('#stRole', ov).value.trim() };
      DB.save(); renderShell(); route(); toast('บันทึกแล้ว', 'ok');
    }}],
  });
  $('#stExport', m.ov).addEventListener('click', () => {
    const blob = new Blob([DB.exportAll()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'smartexam-backup.json'; a.click();
  });
  $('#stImport', m.ov).addEventListener('click', () => $('#stFile', m.ov).click());
  $('#stFile', m.ov).addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => { try { DB.importAll(r.result); m.close(); renderShell(); route(); toast('นำเข้าข้อมูลสำเร็จ', 'ok'); } catch (err) { toast('ไฟล์ไม่ถูกต้อง', 'err'); } };
    r.readAsText(f);
  });
  $('#stWipe', m.ov).addEventListener('click', () => confirmBox('ลบข้อมูลทั้งหมดในเครื่องนี้? ย้อนกลับไม่ได้', () => { DB.wipe(); m.close(); renderShell(); route(); toast('ล้างข้อมูลแล้ว', 'warn'); }, 'ล้างทั้งหมด'));
}

/* ============================================================
   PAGE · Dashboard
   ============================================================ */
function pageDashboard() {
  const p = DB.profile, sheets = DB.sheets, results = DB.results;
  const graded = results.length;
  const avg = graded ? Math.round(results.reduce((a, r) => a + r.percent, 0) / graded) : null;
  const noKey = sheets.filter(s => !DB.keyDone(s)).length;
  const now = new Date();

  // 7-day chart
  const days = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-i); days.push(d); }
  const counts = days.map(d => results.filter(r => { const t = new Date(r.createdAt); t.setHours(0,0,0,0); return t.getTime() === d.getTime(); }).length);
  const maxc = Math.max(1, ...counts), sum7 = counts.reduce((a,b)=>a+b,0), peak = Math.max(0, ...counts);

  const stat = (icon, g, label, val, unit) => `
    <div class="col-6 col-xl-3"><div class="stat hoverup h-100"><div class="d-flex align-items-center gap-3">
      <div class="sicon ${g}">${svg(icon)}</div>
      <div class="overflow-hidden"><div class="sl text-truncate">${label}</div>
      <div class="sv">${val}<span class="muted fw-normal" style="font-size:.8rem"> ${unit}</span></div></div>
    </div></div></div>`;

  const recent = results.slice(0, 6);
  const recentHtml = recent.length ? `
    <div class="cardx-b p-0"><table class="tbl"><thead><tr><th>นักเรียน</th><th>ชุดข้อสอบ</th><th>คะแนน</th><th class="text-end">เมื่อ</th></tr></thead>
    <tbody>${recent.map(r => { const s = DB.sheet(r.sheetId); return `<tr>
      <td><div class="fw-6">${esc(r.studentName || '-')}</div><div class="muted" style="font-size:.76rem">${esc(r.studentId || '')}</div></td>
      <td>${esc(s ? s.name : '(ถูกลบ)')}</td>
      <td><span class="chip ${r.percent>=50?'chip-ok':'chip-warn'}">${r.score}/${r.total} · ${r.percent}%</span></td>
      <td class="text-end muted" style="font-size:.78rem">${timeAgo(r.createdAt)}</td></tr>`; }).join('')}</tbody></table></div>`
    : `<div class="cardx-b empty"><div class="sicon g6">${svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>')}</div>
      <p class="muted mb-3" style="font-size:.9rem">ยังไม่มีการตรวจข้อสอบ</p>
      <a href="#/sheets?new=1" class="btn btn-brand btn-sm">${svg(IC.plus,'ic-sm')} สร้างกระดาษคำตอบชุดแรก</a></div>`;

  const bars = days.map((d, i) => {
    const h = Math.round((counts[i] / maxc) * 78);
    const x = 14 + i * 38, y = 100 - Math.max(h, 2);
    return `<rect x="${x}" y="${y}" width="22" height="${Math.max(h,2)}" rx="6" fill="${counts[i]?'url(#bg1)':'#e9edf5'}"/>
      <text x="${x+11}" y="${y-4}" text-anchor="middle" font-size="10" fill="#64748b" font-family="Prompt">${counts[i]||''}</text>
      <text x="${x+11}" y="117" text-anchor="middle" font-size="10.5" fill="#94a3b8" font-family="Prompt">${TH_DAY_S[d.getDay()]}</text>`;
  }).join('');

  $('#view').innerHTML = `<div class="wrap">
    <div class="cardx mb-4 text-white position-relative overflow-hidden" style="border:0;background:var(--grad)">
      <div style="position:absolute;inset:0;opacity:.16;background-image:radial-gradient(circle,#fff 1px,transparent 1px);background-size:22px 22px"></div>
      <div class="cardx-b position-relative d-flex flex-wrap align-items-center gap-3">
        <div class="d-grid" style="width:54px;height:54px;border-radius:17px;background:rgba(255,255,255,.18);place-items:center">
          ${svg('<path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>', 'ic-lg')}
        </div>
        <div class="flex-grow-1"><h2 class="fw-6 mb-1" style="font-size:1.25rem;letter-spacing:-.6px">สวัสดี, ${esc(p.name)}</h2>
          <p class="mb-0" style="opacity:.85;font-size:.87rem">${esc(p.role || 'ครูผู้สอน')}</p></div>
        <div class="text-lg-end"><div style="font-size:.87rem;opacity:.85">${thaiDate(now, true)}</div>
          <div class="fw-6" style="font-size:1.05rem" id="clk">${clock2(now.getHours())}:${clock2(now.getMinutes())} น.</div></div>
      </div>
    </div>

    <div class="row g-3 mb-4">
      ${stat('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>', 'g1', 'กระดาษคำตอบของฉัน', sheets.length, 'ชุด')}
      ${stat('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/>', 'g2', 'ตรวจแล้ว', graded, 'ใบ')}
      ${stat('<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>', 'g3', 'คะแนนเฉลี่ย', avg===null?'-':avg, '%')}
      ${stat('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>', 'g4', 'ยังไม่ได้คีย์เฉลย', noKey, 'ชุด')}
    </div>

    <div class="cardx mb-4">
      <div class="cardx-h"><h2 class="fw-6 mb-0 d-flex align-items-center gap-2" style="font-size:1rem">
        <span style="color:var(--brand)">${svg('<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>')}</span>ทางลัด</h2></div>
      <div class="cardx-b"><div class="row g-3">
        ${shortcut('#/sheets', 'g1', 'กระดาษคำตอบ', 'สร้างชุดข้อสอบและคีย์เฉลย', '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>')}
        ${shortcut('#/scan', 'g2', 'สแกนตรวจข้อสอบ', 'ใช้กล้องมือถือตรวจอัตโนมัติ', '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>')}
        ${shortcut('#/results', 'g4', 'รายงานคะแนน', 'ดูสถิติและส่งออก CSV', '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>')}
      </div></div>
    </div>

    <div class="row g-3">
      <div class="col-lg-7"><div class="cardx h-100">
        <div class="cardx-h"><h2 class="fw-6 mb-0 d-flex align-items-center gap-2" style="font-size:1rem">
          <span style="color:var(--brand)">${svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>')}</span>ผลการตรวจล่าสุด</h2>
          <a href="#/results" class="btn btn-ghost btn-sm">ดูทั้งหมด ${svg(IC.chev,'ic-sm')}</a></div>
        ${recentHtml}
      </div></div>
      <div class="col-lg-5"><div class="cardx h-100">
        <div class="cardx-h"><h2 class="fw-6 mb-0 d-flex align-items-center gap-2" style="font-size:1rem">
          <span style="color:var(--brand)">${svg('<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>')}</span>การตรวจ 7 วันล่าสุด</h2></div>
        <div class="cardx-b">
          <svg viewBox="0 0 280 130" style="width:100%;height:auto" role="img">
            <defs><linearGradient id="bg1" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#6366f1"/><stop offset="1" stop-color="#a5b4fc"/></linearGradient></defs>
            <line x1="6" x2="274" y1="12" y2="12" stroke="#eef1f7"/><line x1="6" x2="274" y1="56" y2="56" stroke="#eef1f7"/><line x1="6" x2="274" y1="100" y2="100" stroke="#eef1f7"/>
            ${bars}
          </svg>
          <div class="d-flex justify-content-between mt-3 pt-3" style="border-top:1px solid var(--line)">
            <div><div class="muted" style="font-size:.75rem">รวม 7 วัน</div><div class="fw-6">${sum7} ใบ</div></div>
            <div class="text-end"><div class="muted" style="font-size:.75rem">สูงสุด/วัน</div><div class="fw-6">${peak} ใบ</div></div>
          </div>
        </div>
      </div></div>
    </div>
  </div>`;

  const clk = $('#clk');
  if (clk) { clearInterval(window.__clk); window.__clk = setInterval(() => { const n = new Date(); clk.textContent = `${clock2(n.getHours())}:${clock2(n.getMinutes())} น.`; }, 10000); }
}
function shortcut(href, g, title, sub, icon) {
  return `<div class="col-md-4"><a href="${href}" class="cardx hoverup d-flex align-items-center gap-3 p-3 h-100" style="color:var(--ink)">
    <div class="sicon ${g}">${svg(icon)}</div>
    <div class="flex-grow-1 overflow-hidden"><div class="fw-6" style="font-size:.95rem">${title}</div>
      <div class="muted text-truncate" style="font-size:.78rem">${sub}</div></div>
    <span class="muted">${svg(IC.chev,'ic-sm')}</span></a></div>`;
}
function timeAgo(ts) {
  const s = (Date.now() - new Date(ts)) / 1000;
  if (s < 60) return 'เมื่อสักครู่';
  if (s < 3600) return Math.floor(s/60) + ' นาทีก่อน';
  if (s < 86400) return Math.floor(s/3600) + ' ชม.ก่อน';
  return thaiDate(new Date(ts));
}

/* ============================================================
   PAGE · Sheets (list + editor)
   ============================================================ */
function pageSheets(params) {
  if (params.get('new') === '1') return sheetEditor(null);
  if (params.get('edit'))        return sheetEditor(params.get('edit'));
  const sheets = DB.sheets;

  const rows = sheets.map(s => {
    const done = DB.keyDone(s), n = DB.resultsOf(s.id).length;
    return `<tr>
      <td><div class="fw-6">${esc(s.name)}</div><div class="muted" style="font-size:.76rem">${esc(s.subject || 'ไม่ระบุวิชา')}</div></td>
      <td>${s.questions} ข้อ · ${s.choices} ตัวเลือก</td>
      <td>${done ? '<span class="chip chip-ok">คีย์เฉลยครบ</span>' : '<span class="chip chip-warn">ยังไม่ครบ</span>'}</td>
      <td>${n} ใบ</td>
      <td class="text-end"><div class="d-inline-flex gap-1">
        <a class="btn btn-ghost btn-icon" title="พิมพ์กระดาษคำตอบ" data-print="${s.id}">${svg('<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>','ic-sm')}</a>
        <a class="btn btn-ghost btn-icon" title="สแกนตรวจ" href="#/scan?sheet=${s.id}">${svg('<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>','ic-sm')}</a>
        <a class="btn btn-ghost btn-icon" title="แก้ไข" href="#/sheets?edit=${s.id}">${svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>','ic-sm')}</a>
        <button class="btn btn-danger-soft btn-icon" title="ลบ" data-del="${s.id}">${svg('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>','ic-sm')}</button>
      </div></td></tr>`;
  }).join('');

  $('#view').innerHTML = `<div class="wrap">
    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <div class="flex-grow-1"><div class="fw-6" style="font-size:1.05rem">ชุดกระดาษคำตอบ</div>
        <div class="muted" style="font-size:.82rem">สร้างชุดข้อสอบ กำหนดจำนวนข้อและคีย์เฉลย</div></div>
      <a href="#/sheets?new=1" class="btn btn-brand btn-sm px-3">${svg(IC.plus,'ic-sm')} สร้างกระดาษคำตอบ</a>
    </div>
    <div class="cardx">${sheets.length ? `<div class="cardx-b p-0"><table class="tbl">
      <thead><tr><th>ชื่อชุด</th><th>รูปแบบ</th><th>คีย์เฉลย</th><th>ตรวจแล้ว</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : `<div class="cardx-b empty">
      <div class="sicon g1">${svg('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/>')}</div>
      <p class="muted mb-3">ยังไม่มีชุดกระดาษคำตอบ</p>
      <a href="#/sheets?new=1" class="btn btn-brand btn-sm">${svg(IC.plus,'ic-sm')} สร้างชุดแรก</a></div>`}
    </div>
  </div>`;

  $$('[data-del]').forEach(b => b.addEventListener('click', () => {
    const s = DB.sheet(b.dataset.del);
    confirmBox(`ลบ "${s.name}" และผลตรวจที่เกี่ยวข้องทั้งหมด?`, () => { DB.delSheet(b.dataset.del); pageSheets(new URLSearchParams()); toast('ลบแล้ว', 'warn'); }, 'ลบ');
  }));
  $$('[data-print]').forEach(b => b.addEventListener('click', () => printSheet(DB.sheet(b.dataset.print))));
}

function sheetEditor(id) {
  const editing = !!id;
  const s = editing ? DB.sheet(id) : { id: uid(), name: '', subject: '', questions: 20, choices: 4, labelKind: 'thai', key: Array(20).fill(null) };
  if (!s) { location.hash = '#/sheets'; return; }
  const work = JSON.parse(JSON.stringify(s));

  $('#view').innerHTML = `<div class="wrap" style="max-width:960px">
    <a href="#/sheets" class="btn btn-ghost btn-sm mb-3">${svg('<path d="m15 18-6-6 6-6"/>','ic-sm')} กลับ</a>
    <div class="cardx mb-3"><div class="cardx-h"><h2 class="fw-6 mb-0" style="font-size:1rem">${editing ? 'แก้ไขชุดข้อสอบ' : 'สร้างชุดข้อสอบใหม่'}</h2></div>
      <div class="cardx-b"><div class="row g-3">
        <div class="col-md-6 field mb-0"><label>ชื่อชุดข้อสอบ *</label><input class="inp" id="fName" placeholder="เช่น สอบกลางภาค ม.3" value="${esc(work.name)}"></div>
        <div class="col-md-6 field mb-0"><label>วิชา</label><input class="inp" id="fSubj" placeholder="เช่น คณิตศาสตร์" value="${esc(work.subject)}"></div>
        <div class="col-md-4 field mb-0"><label>จำนวนข้อ</label><input class="inp" id="fQ" type="number" min="1" max="200" value="${work.questions}"></div>
        <div class="col-md-4 field mb-0"><label>จำนวนตัวเลือก</label>
          <select class="inp" id="fC">${[2,3,4,5,6].map(n=>`<option value="${n}" ${n===work.choices?'selected':''}>${n} ตัวเลือก</option>`).join('')}</select></div>
        <div class="col-md-4 field mb-0"><label>รูปแบบตัวเลือก</label>
          <select class="inp" id="fL">
            <option value="thai" ${work.labelKind==='thai'?'selected':''}>ก ข ค ง</option>
            <option value="eng" ${work.labelKind==='eng'?'selected':''}>A B C D</option>
            <option value="number" ${work.labelKind==='number'?'selected':''}>1 2 3 4</option>
          </select></div>
      </div></div>
    </div>

    <div class="cardx"><div class="cardx-h">
      <h2 class="fw-6 mb-0 d-flex align-items-center gap-2" style="font-size:1rem">
        <span style="color:var(--brand)">${svg('<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>')}</span>คีย์เฉลย</h2>
      <div class="d-flex gap-2"><button class="btn btn-ghost btn-sm" id="btnClear">ล้างเฉลย</button>
        <span class="chip chip-muted" id="keyStat">0/${work.questions}</span></div></div>
      <div class="cardx-b"><div class="keygrid" id="keyGrid"></div></div>
    </div>

    <div class="d-flex justify-content-end gap-2 mt-3">
      <a href="#/sheets" class="btn btn-ghost btn-sm px-3">ยกเลิก</a>
      <button class="btn btn-brand btn-sm px-4" id="btnSave">${editing?'บันทึกการแก้ไข':'บันทึกชุดข้อสอบ'}</button>
    </div>
  </div>`;

  const rebuildKeyGrid = () => {
    const nQ = work.questions, labels = labelsFor(work.labelKind, work.choices);
    if (work.key.length !== nQ) { const k = Array(nQ).fill(null); for (let i=0;i<Math.min(nQ,work.key.length);i++) k[i]=work.key[i]; work.key=k; }
    // drop out-of-range answers if choices reduced
    work.key = work.key.map(v => (v!==null && v>=work.choices) ? null : v);
    $('#keyGrid').innerHTML = Array.from({length:nQ},(_,q)=>`<div class="keyrow"><span class="qn">${q+1}.</span>
      ${labels.map((L,c)=>`<button class="opt ${work.key[q]===c?'sel':''}" data-q="${q}" data-c="${c}">${L}</button>`).join('')}</div>`).join('');
    $$('#keyGrid .opt').forEach(b=>b.addEventListener('click',()=>{
      const q=+b.dataset.q,c=+b.dataset.c; work.key[q]=work.key[q]===c?null:c; rebuildKeyGrid();
    }));
    const done = work.key.filter(v=>v!==null).length;
    $('#keyStat').textContent = `${done}/${nQ}`;
    $('#keyStat').className = 'chip ' + (done===nQ?'chip-ok':'chip-muted');
  };
  rebuildKeyGrid();

  $('#fQ').addEventListener('change', e => { let v=Math.max(1,Math.min(200,+e.target.value||1)); e.target.value=v; work.questions=v; rebuildKeyGrid(); });
  $('#fC').addEventListener('change', e => { work.choices=+e.target.value; rebuildKeyGrid(); });
  $('#fL').addEventListener('change', e => { work.labelKind=e.target.value; rebuildKeyGrid(); });
  $('#btnClear').addEventListener('click', () => { work.key=Array(work.questions).fill(null); rebuildKeyGrid(); });

  $('#btnSave').addEventListener('click', () => {
    work.name = $('#fName').value.trim(); work.subject = $('#fSubj').value.trim();
    if (!work.name) { toast('กรุณาใส่ชื่อชุดข้อสอบ', 'err'); $('#fName').focus(); return; }
    if (editing) DB.updSheet(id, work); else DB.addSheet(work);
    toast('บันทึกแล้ว', 'ok'); location.hash = '#/sheets';
  });
}

/* ============================================================
   ANSWER-SHEET LAYOUT (ใช้ร่วมกันทั้งพิมพ์และสแกน)
   canonical 800 x 1120
   ============================================================ */
function buildLayout(nQ, nC) {
  const W = 800, H = 1120, pad = 56, headerH = 158;
  const gridTop = headerH, gridBottom = H - 40;
  const numCols = Math.ceil(nQ / 25), perCol = Math.ceil(nQ / numCols);
  const colGap = 16, colW = (W - 2 * pad - (numCols - 1) * colGap) / numCols;
  const rowH = (gridBottom - gridTop) / perCol;
  const R = Math.min(14, rowH * 0.34), numW = 34;
  const bubbles = [];
  for (let q = 0; q < nQ; q++) {
    const col = Math.floor(q / perCol), row = q % perCol;
    const x0 = pad + col * (colW + colGap), cy = gridTop + rowH * (row + 0.5);
    const bx0 = x0 + numW, sp = (colW - numW) / nC, choices = [];
    for (let c = 0; c < nC; c++) choices.push({ c, x: bx0 + sp * (c + 0.5), y: cy });
    bubbles.push({ q, numX: x0 + 6, numY: cy, choices });
  }
  return { W, H, pad, headerH, R, bubbles, numCols };
}

function printSheet(s) {
  if (!s) return;
  const L = buildLayout(s.questions, s.choices), labels = labelsFor(s.labelKind, s.choices);
  const marks = L.bubbles.map(b => `
    <text x="${b.numX}" y="${b.numY + 4}" font-size="13" font-family="Prompt" fill="#111" font-weight="600">${b.q + 1}</text>
    ${b.choices.map((ch, i) => `<circle cx="${ch.x}" cy="${ch.y}" r="${L.R}" fill="none" stroke="#111" stroke-width="1.4"/>
      <text x="${ch.x}" y="${ch.y + 4}" text-anchor="middle" font-size="11" font-family="Prompt" fill="#333">${labels[i]}</text>`).join('')}`).join('');

  const svgSheet = `<svg viewBox="0 0 ${L.W} ${L.H}" xmlns="http://www.w3.org/2000/svg" width="100%">
    <rect x="8" y="8" width="${L.W-16}" height="${L.H-16}" fill="none" stroke="#111" stroke-width="6"/>
    <rect x="20" y="20" width="34" height="34" fill="#111"/><rect x="${L.W-54}" y="20" width="34" height="34" fill="#111"/>
    <rect x="20" y="${L.H-54}" width="34" height="34" fill="#111"/><rect x="${L.W-54}" y="${L.H-54}" width="34" height="34" fill="#111"/>
    <text x="${L.W/2}" y="52" text-anchor="middle" font-size="26" font-weight="600" font-family="Prompt" fill="#111">${esc(s.name)}</text>
    <text x="${L.W/2}" y="80" text-anchor="middle" font-size="15" font-family="Prompt" fill="#444">${esc(s.subject||'')} · ${s.questions} ข้อ</text>
    <text x="70" y="118" font-size="14" font-family="Prompt" fill="#111">ชื่อ-สกุล ...................................................</text>
    <text x="470" y="118" font-size="14" font-family="Prompt" fill="#111">รหัส/เลขที่ .......................</text>
    <line x1="56" y1="140" x2="${L.W-56}" y2="140" stroke="#ccc" stroke-width="1"/>
    <text x="56" y="152" font-size="10.5" font-family="Prompt" fill="#888">ระบายวงกลมให้เต็มด้วยดินสอ/ปากกาสีเข้ม · ถ่ายให้เห็นกรอบสี่เหลี่ยมครบทั้งใบ</text>
    ${marks}
  </svg>`;

  const w = window.open('', '_blank');
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(s.name)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600&display=swap" rel="stylesheet">
    <style>@page{size:A4 portrait;margin:10mm}body{margin:0;font-family:Prompt,sans-serif}
    .bar{padding:10px 14px;text-align:center;background:#f1f5f9;border-bottom:1px solid #e2e8f0}
    button{font-family:inherit;padding:.5rem 1.2rem;border:0;border-radius:8px;background:#6366f1;color:#fff;cursor:pointer;font-size:.9rem}
    .page{max-width:800px;margin:0 auto;padding:12px}@media print{.bar{display:none}.page{padding:0}}</style></head>
    <body><div class="bar noprint"><button onclick="window.print()">🖨️ พิมพ์ / บันทึกเป็น PDF</button></div>
    <div class="page">${svgSheet}</div></body></html>`);
  w.document.close();
}

/* ============================================================
   PAGE · Scan (OMR ด้วยกล้อง / อัปโหลดรูป / กรอกมือ)
   ============================================================ */
let scanState = null;
function pageScan(params) {
  stopCam();
  const sheets = DB.sheets;
  const preSel = params.get('sheet') || (sheets[0] && sheets[0].id) || '';
  scanState = { sheetId: preSel, image: null, answers: null, flags: null };

  if (!sheets.length) {
    $('#view').innerHTML = `<div class="wrap"><div class="cardx"><div class="cardx-b empty">
      <div class="sicon g2">${svg('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>')}</div>
      <p class="muted mb-3">ต้องสร้างชุดข้อสอบและคีย์เฉลยก่อนจึงจะตรวจได้</p>
      <a href="#/sheets?new=1" class="btn btn-brand btn-sm">${svg(IC.plus,'ic-sm')} สร้างกระดาษคำตอบ</a></div></div></div>`;
    return;
  }

  $('#view').innerHTML = `<div class="wrap" style="max-width:1080px">
    <div class="row g-3">
      <div class="col-lg-6">
        <div class="cardx"><div class="cardx-b">
          <div class="field"><label>เลือกชุดข้อสอบ</label>
            <select class="inp" id="scSheet">${sheets.map(s=>`<option value="${s.id}" ${s.id===preSel?'selected':''}>${esc(s.name)} (${s.questions} ข้อ)</option>`).join('')}</select>
          </div>
          <div id="scKeyWarn"></div>
          <div class="scanstage mb-3" id="scStage">
            <div class="d-flex flex-column align-items-center justify-content-center h-100 text-center px-4" id="scHint" style="color:#94a3b8;gap:10px">
              ${svg('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>','ic-lg')}
              <div style="font-size:.85rem">เปิดกล้อง หรืออัปโหลดรูปกระดาษคำตอบ<br>ให้เห็นกรอบสี่เหลี่ยมครบทั้งใบ</div>
            </div>
          </div>
          <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-brand btn-sm flex-grow-1" id="scCam">${svg('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>','ic-sm')} เปิดกล้อง</button>
            <button class="btn btn-soft btn-sm flex-grow-1" id="scUp">${svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>','ic-sm')} อัปโหลดรูป</button>
            <button class="btn btn-ghost btn-sm" id="scManual">กรอกเอง</button>
          </div>
          <button class="btn btn-brand w-100 mt-2 d-none" id="scShoot">📸 ถ่าย & ตรวจ</button>
          <input type="file" id="scFile" accept="image/*" capture="environment" hidden>
        </div></div>
      </div>
      <div class="col-lg-6"><div class="cardx h-100"><div class="cardx-h">
        <h2 class="fw-6 mb-0" style="font-size:1rem">ผลการตรวจ</h2><span id="scScore"></span></div>
        <div class="cardx-b" id="scResult"><div class="empty muted" style="padding:30px 10px">ยังไม่มีผล — สแกนหรือกรอกคำตอบเพื่อเริ่มตรวจ</div></div>
      </div></div>
    </div>
  </div>`;

  const refreshWarn = () => {
    const s = DB.sheet($('#scSheet').value);
    $('#scKeyWarn').innerHTML = DB.keyDone(s) ? '' :
      `<div class="chip chip-warn mb-2">⚠ ชุดนี้ยังคีย์เฉลยไม่ครบ ตรวจได้แต่คะแนนอาจไม่ถูกต้อง</div>`;
    scanState.sheetId = s.id;
  };
  refreshWarn();
  $('#scSheet').addEventListener('change', () => { refreshWarn(); clearResult(); });
  $('#scCam').addEventListener('click', startCam);
  $('#scShoot').addEventListener('click', shootAndGrade);
  $('#scUp').addEventListener('click', () => $('#scFile').click());
  $('#scFile').addEventListener('change', e => { const f=e.target.files[0]; if (f) loadImageAndGrade(f); });
  $('#scManual').addEventListener('click', manualEntry);
}

function clearResult(){ $('#scResult').innerHTML = '<div class="empty muted" style="padding:30px 10px">ยังไม่มีผล — สแกนหรือกรอกคำตอบเพื่อเริ่มตรวจ</div>'; $('#scScore').innerHTML=''; }

function stopCam() {
  if (window.__stream) { window.__stream.getTracks().forEach(t => t.stop()); window.__stream = null; }
}
async function startCam() {
  const stage = $('#scStage'); if (!stage) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false });
    window.__stream = stream;
    stage.innerHTML = `<video id="scVideo" autoplay playsinline muted></video>
      <div class="scanframe"><span class="tl"></span><span class="tr"></span><span class="bl"></span><span class="br"></span></div>`;
    const v = $('#scVideo'); v.srcObject = stream; await v.play();
    $('#scShoot').classList.remove('d-none');
    $('#scCam').textContent = 'กล้องเปิดอยู่';
  } catch (e) {
    toast('เปิดกล้องไม่ได้ — ใช้ "อัปโหลดรูป" แทน', 'err');
  }
}
function shootAndGrade() {
  const v = $('#scVideo'); if (!v) return;
  const cv = document.createElement('canvas'); cv.width = v.videoWidth; cv.height = v.videoHeight;
  cv.getContext('2d').drawImage(v, 0, 0);
  stopCam(); gradeFromCanvas(cv);
}
function loadImageAndGrade(file) {
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const cv = document.createElement('canvas'); cv.width = img.width*scale|0; cv.height = img.height*scale|0;
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    gradeFromCanvas(cv);
  };
  img.onerror = () => toast('อ่านรูปไม่ได้', 'err');
  img.src = URL.createObjectURL(file);
}

/* ---------- core OMR (pure canvas) ---------- */
function otsu(gray) {
  const hist = new Array(256).fill(0); for (let i=0;i<gray.length;i++) hist[gray[i]]++;
  const total = gray.length; let sum=0; for (let i=0;i<256;i++) sum+=i*hist[i];
  let sumB=0,wB=0,max=0,thr=127;
  for (let i=0;i<256;i++){ wB+=hist[i]; if(!wB)continue; const wF=total-wB; if(!wF)break;
    sumB+=i*hist[i]; const mB=sumB/wB,mF=(sum-sumB)/wF,between=wB*wF*(mB-mF)*(mB-mF);
    if(between>max){max=between;thr=i;} }
  return thr;
}
function gradeFromCanvas(srcCanvas) {
  const s = DB.sheet(scanState.sheetId);
  const stage = $('#scStage'); stage.innerHTML = `<div class="d-flex align-items-center justify-content-center h-100" style="color:#fff">กำลังตรวจ...</div>`;

  // downscale for processing
  const W = srcCanvas.width, H = srcCanvas.height;
  const ctx = srcCanvas.getContext('2d');
  const px = ctx.getImageData(0,0,W,H).data;
  const gray = new Uint8ClampedArray(W*H);
  for (let i=0,p=0;i<px.length;i+=4,p++) gray[p]=(px[i]*0.299+px[i+1]*0.587+px[i+2]*0.114)|0;
  const thr = otsu(gray);
  const isDark = (x,y) => gray[(y*W+x)] < thr;

  // detect frame (solid border rectangle) via projections
  const rowDark = new Int32Array(H), colDark = new Int32Array(W);
  for (let y=0;y<H;y++){ let c=0; const off=y*W; for (let x=0;x<W;x++) if(gray[off+x]<thr) c++; rowDark[y]=c; }
  for (let x=0;x<W;x++){ let c=0; for (let y=0;y<H;y++) if(gray[y*W+x]<thr) c++; colDark[x]=c; }
  const rTh = W*0.45, cTh = H*0.45;
  let top=-1,bot=-1,left=-1,right=-1;
  for (let y=0;y<H;y++) if(rowDark[y]>rTh){top=y;break;}
  for (let y=H-1;y>=0;y--) if(rowDark[y]>rTh){bot=y;break;}
  for (let x=0;x<W;x++) if(colDark[x]>cTh){left=x;break;}
  for (let x=W-1;x>=0;x--) if(colDark[x]>cTh){right=x;break;}

  let x0,y0,x1,y1;
  const ok = top>=0 && bot>top+H*0.3 && left>=0 && right>left+W*0.3;
  if (ok) { x0=left; y0=top; x1=right; y1=bot; }
  else    { x0=W*0.04; y0=H*0.04; x1=W*0.96; y1=H*0.96; }  // fallback: assume aligned in frame

  const L = buildLayout(s.questions, s.choices);
  const mapX = X => x0 + (X / L.W) * (x1 - x0);
  const mapY = Y => y0 + (Y / L.H) * (y1 - y0);
  const rSrc = Math.max(3, (L.R * 0.72) * ((x1 - x0) / L.W));

  // ความเข้มเฉลี่ยของวง (0 = ว่าง/ขาว, 1 = ดำเต็ม) — ทนต่อแสงมากกว่าไบนารี
  const meanDark = (X, Y) => {
    const cx = mapX(X)|0, cy = mapY(Y)|0, r = rSrc|0;
    let sum=0, tot=0;
    for (let dy=-r;dy<=r;dy++) for (let dx=-r;dx<=r;dx++){
      if (dx*dx+dy*dy>r*r) continue;
      const xx=cx+dx, yy=cy+dy; if(xx<0||yy<0||xx>=W||yy>=H) continue;
      tot++; sum += gray[yy*W+xx];
    }
    return tot ? (255 - sum/tot) / 255 : 0;
  };

  const answers = [], flags = [];
  for (const b of L.bubbles) {
    const fills = b.choices.map(ch => meanDark(ch.x, ch.y));
    let best=-1, bv=0, second=0;
    fills.forEach((f,i)=>{ if(f>bv){second=bv;bv=f;best=i;} else if(f>second){second=f;} });
    if (bv < 0.30) { answers.push(null); flags.push('blank'); }         // ไม่มีร่องรอยระบายชัด
    else if (bv - second < 0.15 && second > 0.25) { answers.push(best); flags.push('unsure'); } // ระบายซ้ำ/ไม่ชัด
    else { answers.push(best); flags.push('ok'); }
  }

  // preview cropped region
  const prev = document.createElement('canvas'); prev.width=L.W; prev.height=L.H;
  prev.getContext('2d').drawImage(srcCanvas, x0,y0,x1-x0,y1-y0, 0,0,L.W,L.H);
  stage.innerHTML=''; prev.style.width='100%'; prev.style.height='100%'; prev.style.objectFit='contain'; stage.appendChild(prev);

  scanState.answers = answers; scanState.flags = flags;
  const unsure = flags.filter(f=>f!=='ok').length;
  toast(ok ? `ตรวจแล้ว${unsure?` · มี ${unsure} ข้อควรตรวจสอบ`:''}` : 'ไม่พบกรอบชัดเจน — โปรดตรวจทานคำตอบ', ok?'ok':'warn');
  renderReview(s, answers, flags);
}

function manualEntry() {
  const s = DB.sheet(scanState.sheetId);
  const answers = Array(s.questions).fill(null);
  const stage = $('#scStage');
  if (stage) stage.innerHTML = `<div class="d-flex align-items-center justify-content-center h-100 text-center px-4" style="color:#94a3b8">โหมดกรอกเอง — เลือกคำตอบทางขวา</div>`;
  scanState.answers = answers; scanState.flags = answers.map(()=> 'blank');
  renderReview(s, answers, answers.map(()=> 'blank'));
}

function renderReview(s, answers, flags) {
  const labels = labelsFor(s.labelKind, s.choices);
  const keyDone = DB.keyDone(s);
  const box = $('#scResult');

  const grid = () => answers.map((a,q)=>{
    const key = s.key[q];
    const correct = keyDone && a!==null && a===key;
    const wrong = keyDone && a!==null && a!==key;
    const cls = correct?'good':(wrong?'bad':'');
    return `<div class="rvq ${cls}"><div class="h"><span>ข้อ ${q+1}</span>${flags[q]==='unsure'?'<span style="color:#d97706">?</span>':''}</div>
      <div class="opts">${labels.map((L,c)=>`<button class="rvo ${a===c?'sel':''} ${keyDone&&key===c?'key':''}" data-q="${q}" data-c="${c}">${L}</button>`).join('')}</div></div>`;
  }).join('');

  box.innerHTML = `
    <div class="row g-2 mb-3">
      <div class="col-6"><input class="inp" id="rvName" placeholder="ชื่อ-สกุล นักเรียน"></div>
      <div class="col-6"><input class="inp" id="rvId" placeholder="รหัส/เลขที่"></div>
    </div>
    <div class="d-flex align-items-center justify-content-between mb-2">
      <div class="muted" style="font-size:.8rem">แตะเพื่อแก้คำตอบ · <span style="outline:2px solid #86efac;border-radius:3px;padding:0 3px">กรอบเขียว</span> = เฉลย</div>
      <button class="btn btn-ghost btn-sm" id="rvClear">ล้าง</button>
    </div>
    <div class="rvgrid" id="rvGrid">${grid()}</div>
    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-brand flex-grow-1" id="rvSave">${svg('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>','ic-sm')} บันทึกผลตรวจ</button>
    </div>`;

  const recalc = () => {
    if (!keyDone) { $('#scScore').innerHTML = '<span class="chip chip-warn">ยังไม่มีเฉลย</span>'; return; }
    let score=0; answers.forEach((a,q)=>{ if(a!==null && a===s.key[q]) score++; });
    const pct = Math.round(score/s.questions*100);
    $('#scScore').innerHTML = `<span class="chip ${pct>=50?'chip-ok':'chip-warn'}">${score}/${s.questions} · ${pct}%</span>`;
    return { score, pct };
  };
  const rebind = () => {
    $('#rvGrid').innerHTML = grid();
    $$('#rvGrid .rvo').forEach(b=>b.addEventListener('click',()=>{
      const q=+b.dataset.q,c=+b.dataset.c; answers[q]=answers[q]===c?null:c; flags[q]='ok'; rebind(); recalc();
    }));
  };
  rebind(); recalc();

  $('#rvClear').addEventListener('click', ()=>{ for(let i=0;i<answers.length;i++){answers[i]=null;flags[i]='blank';} rebind(); recalc(); });
  $('#rvSave').addEventListener('click', ()=>{
    const name=$('#rvName').value.trim(), sid=$('#rvId').value.trim();
    if (!name && !sid) { toast('ใส่ชื่อหรือรหัสนักเรียนก่อนบันทึก','err'); $('#rvName').focus(); return; }
    let score=0; answers.forEach((a,q)=>{ if(keyDone && a!==null && a===s.key[q]) score++; });
    const pct = Math.round(score/s.questions*100);
    DB.addResult({ id:uid(), sheetId:s.id, studentName:name, studentId:sid, answers:answers.slice(), score, total:s.questions, percent:pct, createdAt:new Date().toISOString() });
    toast('บันทึกผลแล้ว','ok');
    clearResult();
    const stage=$('#scStage'); if(stage) stage.innerHTML=`<div class="d-flex flex-column align-items-center justify-content-center h-100 text-center px-4" style="color:#94a3b8;gap:10px">${svg('<path d="M20 6 9 17l-5-5"/>','ic-lg')}<div style="font-size:.85rem">บันทึกแล้ว! สแกนคนต่อไปได้เลย</div></div>`;
  });
}

/* ============================================================
   PAGE · Results
   ============================================================ */
function pageResults(params) {
  const sheets = DB.sheets;
  const filter = params.get('sheet') || 'all';
  let results = DB.results.slice();
  if (filter !== 'all') results = results.filter(r => r.sheetId === filter);

  const n = results.length;
  const avg = n ? Math.round(results.reduce((a,r)=>a+r.percent,0)/n) : 0;
  const hi = n ? Math.max(...results.map(r=>r.percent)) : 0;
  const lo = n ? Math.min(...results.map(r=>r.percent)) : 0;
  const pass = results.filter(r=>r.percent>=50).length;

  const opts = `<option value="all" ${filter==='all'?'selected':''}>ทุกชุดข้อสอบ</option>` +
    sheets.map(s=>`<option value="${s.id}" ${filter===s.id?'selected':''}>${esc(s.name)}</option>`).join('');

  const rows = results.map((r,i)=>{ const s=DB.sheet(r.sheetId); return `<tr>
    <td class="muted">${i+1}</td>
    <td><div class="fw-6">${esc(r.studentName||'-')}</div><div class="muted" style="font-size:.76rem">${esc(r.studentId||'')}</div></td>
    <td>${esc(s?s.name:'(ถูกลบ)')}</td>
    <td>${r.score}/${r.total}</td>
    <td style="min-width:120px"><div class="d-flex align-items-center gap-2"><div class="bar flex-grow-1"><i style="width:${r.percent}%"></i></div>
      <span class="fw-6" style="font-size:.82rem">${r.percent}%</span></div></td>
    <td>${r.percent>=50?'<span class="chip chip-ok">ผ่าน</span>':'<span class="chip chip-warn">ไม่ผ่าน</span>'}</td>
    <td class="muted" style="font-size:.78rem">${thaiDate(new Date(r.createdAt))}</td>
    <td class="text-end"><button class="btn btn-danger-soft btn-icon" data-del="${r.id}" title="ลบ">${svg('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>','ic-sm')}</button></td>
  </tr>`; }).join('');

  const statMini = (label,val,unit,g,icon)=>`<div class="col-6 col-lg-3"><div class="stat h-100"><div class="d-flex align-items-center gap-3">
    <div class="sicon ${g}">${svg(icon)}</div><div><div class="sl">${label}</div><div class="sv">${val}<span class="muted fw-normal" style="font-size:.8rem"> ${unit}</span></div></div></div></div></div>`;

  $('#view').innerHTML = `<div class="wrap">
    <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
      <div class="flex-grow-1"><div class="fw-6" style="font-size:1.05rem">รายงานคะแนน</div>
        <div class="muted" style="font-size:.82rem">${n} รายการ${filter!=='all'?' · กรองตามชุดข้อสอบ':''}</div></div>
      <select class="inp" id="rsFilter" style="width:auto;max-width:240px">${opts}</select>
      <button class="btn btn-soft btn-sm px-3" id="rsCsv">${svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>','ic-sm')} ส่งออก CSV</button>
    </div>

    <div class="row g-3 mb-3">
      ${statMini('คะแนนเฉลี่ย', avg, '%', 'g1', '<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>')}
      ${statMini('ผ่านเกณฑ์', pass, `/${n} คน`, 'g2', '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>')}
      ${statMini('สูงสุด', hi, '%', 'g3', '<path d="m6 9 6-6 6 6"/><path d="M12 3v14"/><path d="M5 21h14"/>')}
      ${statMini('ต่ำสุด', lo, '%', 'g4', '<path d="m6 15 6 6 6-6"/><path d="M12 21V7"/><path d="M5 3h14"/>')}
    </div>

    <div class="cardx">${n?`<div class="cardx-b p-0" style="overflow-x:auto"><table class="tbl">
      <thead><tr><th>#</th><th>นักเรียน</th><th>ชุดข้อสอบ</th><th>คะแนน</th><th>ร้อยละ</th><th>ผล</th><th>วันที่</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`:`<div class="cardx-b empty">
      <div class="sicon g6">${svg('<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>')}</div>
      <p class="muted mb-3">ยังไม่มีผลการตรวจ</p><a href="#/scan" class="btn btn-brand btn-sm">ไปสแกนตรวจ</a></div>`}</div>
  </div>`;

  $('#rsFilter').addEventListener('change', e => { location.hash = '#/results' + (e.target.value==='all'?'':`?sheet=${e.target.value}`); });
  $('#rsCsv').addEventListener('click', () => exportCSV(results, filter));
  $$('[data-del]').forEach(b => b.addEventListener('click', () => confirmBox('ลบผลการตรวจนี้?', () => { DB.delResult(b.dataset.del); pageResults(new URLSearchParams(filter==='all'?'':`sheet=${filter}`)); toast('ลบแล้ว','warn'); }, 'ลบ')));
}

function exportCSV(results, filter) {
  if (!results.length) { toast('ไม่มีข้อมูลให้ส่งออก','warn'); return; }
  const head = ['ลำดับ','ชื่อ-สกุล','รหัส/เลขที่','ชุดข้อสอบ','วิชา','คะแนน','เต็ม','ร้อยละ','ผล','วันที่ตรวจ'];
  const lines = results.map((r,i)=>{ const s=DB.sheet(r.sheetId);
    return [i+1, r.studentName||'', r.studentId||'', s?s.name:'(ถูกลบ)', s?s.subject:'', r.score, r.total, r.percent, r.percent>=50?'ผ่าน':'ไม่ผ่าน', thaiDate(new Date(r.createdAt))]
      .map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',');
  });
  const csv = '\uFEFF' + [head.join(','), ...lines].join('\r\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download = `smartexam-results-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  toast('ส่งออก CSV แล้ว','ok');
}

/* ============================================================
   ROUTER
   ============================================================ */
function route() {
  stopCam();
  const raw = (location.hash || '#/dashboard').slice(2);
  const [path, qs] = raw.split('?');
  const params = new URLSearchParams(qs || '');
  const id = path || 'dashboard';
  setActive(id);
  window.scrollTo(0, 0);
  ({ dashboard: pageDashboard, sheets: pageSheets, scan: pageScan, results: pageResults }[id] || pageDashboard)(params);
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', () => { DB.load(); renderShell(); route(); });

})();
