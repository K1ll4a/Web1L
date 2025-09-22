
'use strict';


const SEL = {
  xInput:   '#x-input',
  rInput:   '#r-input',
  checkBtn: '#submit',
  clearBtn: '#clear-btn',
  yRadios:  'input[name="y"]',
  yRadiosAlt: 'input[name="Y"]',


  tableBodies: ['#result tbody', '#results tbody', '#result-body', '#results-body', 'table tbody'],
  errorBox: '#errors'
};


const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function showError(msg) {
  const box = $(SEL.errorBox);
  if (box) { box.textContent = msg || ''; box.style.display = msg ? 'block' : 'none'; }
  else if (msg) alert(msg);
}

function parseNumber(v) {
  if (v === null || v === undefined) return NaN;
  const s = String(v).trim().replace(',', '.');
  return s === '' ? NaN : Number(s);
}


function readY() {

  let r = $$(SEL.yRadios).find(el => el.checked);

  if (!r) r = $$(SEL.yRadiosAlt).find(el => el.checked);

  if (!r) r = $$( 'input[type="radio"]:checked' ).find(Boolean);
  if (!r) return NaN;


  let raw = (r.value && r.value !== 'on') ? r.value : (
      (r.dataset && r.dataset.value) ||
      (r.nextSibling && r.nextSibling.nodeType === 3 ? r.nextSibling.nodeValue : '')
  );

  return parseNumber(raw);
}

function readInputs() {
  const x = parseNumber($(SEL.xInput)?.value);
  const r = parseNumber($(SEL.rInput)?.value);
  const y = readY();
  return { x, y, r };
}

function validate({ x, y, r }) {
  if (!Number.isFinite(x)) return 'X must be a number';
  if (x < -3 || x > 3)      return 'X must be in [-3, 3]';

  if (!Number.isFinite(y))  return 'Y must be a number';
  if (!Number.isInteger(y)) return 'Y must be an integer';
  if (y < -3 || y > 5)      return 'Y must be in {-3..5}';

  if (!Number.isFinite(r))  return 'R must be a number';
  if (r < 1 || r > 4)       return 'R must be in [1, 4]';

  return null;
}


function attachNumericGuards() {
  const allow = /[0-9\-\.\,]/;
  [$(SEL.xInput), $(SEL.rInput)].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('keypress', (e) => {
      const k = e.key;
      if (k.length === 1 && !allow.test(k)) e.preventDefault();
    });
  });
}


function fmtNum(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '';
  const n = Number(v);
  return Math.abs(n) >= 1e6 ? n.toExponential(2) : String(n);
}


function pickResultTarget() {
  const grid = document.getElementById('result');
  if (grid) return { type: 'grid', el: grid };


  for (const s of SEL.tableBodies) {
    const el = $(s);
    if (el) return { type: 'table', el };
  }
  const t = document.querySelector('table');
  if (t) {
    let tb = t.tBodies[0];
    if (!tb) tb = t.appendChild(document.createElement('tbody'));
    return { type: 'table', el: tb };
  }
  return null;
}

function appendCellGrid(grid, text) {
  const d = document.createElement('div');
  d.textContent = text;
  grid.appendChild(d);
}

function renderHistory(history) {
  const target = pickResultTarget();
  if (!target) return;

  if (target.type === 'grid') {
    const grid = target.el;
    grid.innerHTML = '';
    (history || []).forEach(row => {
      appendCellGrid(grid, String(row.time || ''));
      appendCellGrid(grid, fmtNum(row.x));
      appendCellGrid(grid, fmtNum(row.y));
      appendCellGrid(grid, fmtNum(row.r));
      appendCellGrid(grid, row.hit ? 'ДА' : 'НЕТ');
      appendCellGrid(grid, (row.durationMs ?? 0) + ' ms');
    });
  } else {
    const tbody = target.el;
    tbody.innerHTML = '';
    (history || []).forEach(row => {
      const tr = document.createElement('tr');

      const tdTime = document.createElement('td'); tdTime.textContent = String(row.time || ''); tr.appendChild(tdTime);
      const tdX = document.createElement('td'); tdX.textContent = fmtNum(row.x); tr.appendChild(tdX);
      const tdY = document.createElement('td'); tdY.textContent = fmtNum(row.y); tr.appendChild(tdY);
      const tdR = document.createElement('td'); tdR.textContent = fmtNum(row.r); tr.appendChild(tdR);
      const tdHit = document.createElement('td'); tdHit.textContent = row.hit ? 'ДА' : 'НЕТ'; tr.appendChild(tdHit);
      const tdDur = document.createElement('td'); tdDur.textContent = (row.durationMs ?? 0) + ' ms'; tr.appendChild(tdDur);

      tbody.appendChild(tr);
    });
  }
}


async function postJson(url, payload) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : '{}'
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} ${url}: ${txt || 'Server error'}`);
  }
  return resp.json();
}


async function onCheck() {
  showError('');
  try {
    const data = readInputs();
    const err = validate(data);
    if (err) { showError(err); return; }

    const res = await postJson('/api/check', data);
    if (!res?.ok) throw new Error(res?.error || 'Unknown server error');

    renderHistory(res.history || []);
  } catch (e) {
    showError(e.message || String(e));
  }
}

async function onClear() {
  showError('');
  try {
    const res = await postJson('/api/clear', {});
    if (!res?.ok) throw new Error(res?.error || 'Unknown server error');
    renderHistory([]);
  } catch (e) {
    showError(e.message || String(e));
  }
}


function init() {
  attachNumericGuards();

  const check = $(SEL.checkBtn);
  const clear = $(SEL.clearBtn);

  if (check) {

    check.addEventListener('click', (e) => { e.preventDefault(); onCheck(); });
    if (check.form) {
      check.form.addEventListener('submit', (e) => { e.preventDefault(); onCheck(); });
    }
  }
  if (clear) {
    clear.addEventListener('click', (e) => { e.preventDefault(); onClear(); });
  }


  [$(SEL.xInput), $(SEL.rInput)].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onCheck(); }
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
