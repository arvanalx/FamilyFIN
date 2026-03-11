/* ============================================================
   Family FiN — Application Logic
   ============================================================ */

'use strict';

// ── DATA STORE ──────────────────────────────────────────────
const DEFAULT_STATE = {
  accounts:         [],
  cards:            [],
  categories: [
    'Σούπερ μάρκετ', 'Εστιατόριο / Καφέ', 'Μεταφορές', 'Υγεία / Γιατροί',
    'Ρουχισμός', 'Ηλεκτρονικά', 'Ψυχαγωγία', 'Εκπαίδευση',
    'Τηλεπικοινωνίες', 'Ενέργεια / Νερό', 'Ενοίκιο', 'Ασφάλειες',
    'Δάνειο', 'Παιδιά', 'Εφάπαξ', 'Άλλο',
  ],
  incomeCategories: [
    'Μισθός', 'Ελεύθερος Επαγγελματίας', 'Σύνταξη',
    'Ενοίκιο (είσπραξη)', 'Επίδομα', 'Άλλο',
  ],
  transactions:     [], // { id, date, desc, category, account, amount, type, notes }
  installments:     [],
  subscriptions:    [],
  cardTransactions: [], // { id, date, desc, category, card, amount, [subId, subMonth] }
  deletedSubKeys:   [], // "subId|YYYY-MM" — tracks manually-deleted auto transactions
};

let state;        // populated async on DOMContentLoaded
let activeCardId; // tracks selected card on the Πιστωτικές Κάρτες page

const API = '/api/data';

function migrateState(data) {
  // Migration: accounts object → array (old format)
  if (data.accounts && !Array.isArray(data.accounts)) {
    data.accounts = [
      { id: 'cash',    name: 'Μετρητά',   type: 'cash', bank: '',           balance: data.accounts.cash    ?? 0 },
      { id: 'alpha',   name: 'AlphaBank', type: 'bank', bank: 'Alpha Bank', balance: data.accounts.alpha   ?? 0 },
      { id: 'winbank', name: 'WinBank',   type: 'bank', bank: 'WinBank',    balance: data.accounts.winbank ?? 0 },
    ];
  }
  // Migration: add cards array if missing
  if (!data.cards) {
    data.cards = JSON.parse(JSON.stringify(DEFAULT_STATE.cards));
  }
  // Migration: remove legacy futureDate field
  delete data.futureDate;
  // Migration: add incomeCategories if missing
  if (!data.incomeCategories) {
    data.incomeCategories = JSON.parse(JSON.stringify(DEFAULT_STATE.incomeCategories));
  }
  // Migration: convert old income category slugs → Greek labels
  const slugMap = {
    salary:     'Μισθός',
    freelance:  'Ελεύθερος Επαγγελματίας',
    pension:    'Σύνταξη',
    rent:       'Ενοίκιο (είσπραξη)',
    other:      'Άλλο',
  };
  if (data.transactions) {
    data.transactions.forEach(t => {
      if (t.type === 'income' && slugMap[t.category]) {
        t.category = slugMap[t.category];
      }
    });
  }
  // Ensure required arrays exist
  if (!data.deletedSubKeys) data.deletedSubKeys = [];
  if (!data.cardTransactions) data.cardTransactions = [];
  return data;
}

async function loadState() {
  // 1. Try the local server (persistent file)
  try {
    const res = await fetch(API);
    if (res.ok) {
      const data = await res.json();
      if (data && data.accounts) return migrateState(data);
    }
  } catch (_) { /* server not running — fall through */ }

  // 2. Fallback: localStorage (e.g. opened via file://)
  try {
    const raw = localStorage.getItem('familyfin_v1');
    if (raw) return migrateState(JSON.parse(raw));
  } catch (_) {}

  // 3. First run — use defaults
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function saveState() {
  // Fire-and-forget POST to server; mirror to localStorage as safety net
  fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  }).catch(() => {});
  try { localStorage.setItem('familyfin_v1', JSON.stringify(state)); } catch (_) {}
}

// ── HELPERS ─────────────────────────────────────────────────
const fmtEuro = n => {
  const abs = Math.abs(n || 0);
  const locale = (typeof getLang === 'function' && getLang() === 'en') ? 'en-US' : 'el-GR';
  const str = abs.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + str + ' €';
};

const today = () => new Date().toISOString().split('T')[0];

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);

// Returns the number of days in a given "YYYY-MM" month
const daysInMonth = ym => { const [y,m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };

// Returns array of "YYYY-MM" strings from startYM to endYM (inclusive)
function monthRange(startYM, endYM) {
  const [sy, sm] = startYM.split('-').map(Number);
  const [ey, em] = endYM.split('-').map(Number);
  const months = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2,'0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return months;
}

const fmtDate = s => {
  if (!s) return '—';
  const [y,m,d] = s.split('-');
  return `${d}/${m}/${y}`;
};

const fmtMonth = s => {
  if (!s) return '—';
  const [y,m] = s.split('-');
  const months = (typeof t === 'function') ? t('months') : ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
  return `${months[+m-1]} ${y}`;
};

function accountLabel(id) {
  if (state) {
    const acc = (state.accounts || []).find(a => a.id === id);
    if (acc) return acc.name;
    const card = (state.cards || []).find(c => c.id === id);
    if (card) return card.name;
  }
  // Fallback for pre-init or unknown ids
  return { cash: 'Μετρητά', alpha: 'AlphaBank', winbank: 'WinBank',
           visa: 'VISA', mastercard: 'MASTERCARD' }[id] || id;
}

// ── NAVIGATION ───────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');
  const link = document.querySelector(`[data-page="${name}"]`);
  if (link) link.classList.add('active');
  document.getElementById('pageTitle').textContent = link?.querySelector('.nav-label')?.textContent || '';
  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('mobile-open');
  // Render page
  renderPage(name);
}

function renderPage(name) {
  switch(name) {
    case 'dashboard':    renderDashboard(); break;
    case 'transactions': renderTransactions(); break;
    case 'income':       renderIncome(); break;
    case 'cards':        renderCardsPage(); break;
    case 'installments': renderInstallments(); break;
    case 'subscriptions':renderSubscriptions(); break;
    case 'settings':     renderSettings(); break;
    case 'help':         renderHelp(); break;
  }
}

// ── DASHBOARD ───────────────────────────────────────────────

// Auto-calculates the "future" reference date:
// = latest transaction date, capped at the end of next month
function calcFutureDate() {
  const allDates = [
    ...state.transactions.map(t => t.date),
    ...state.cardTransactions.map(t => t.date),
  ].filter(Boolean);
  // Cap = last day of next month
  const now = new Date();
  const capD = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const cap  = capD.toISOString().split('T')[0];
  if (!allDates.length) return cap;
  const max = allDates.reduce((a, b) => a > b ? a : b);
  return max > cap ? cap : max;
}

// Total debt on a card = current cycle transactions + monthly installments
function cardMonthlyDebt(cardId) {
  const txAmt   = state.cardTransactions
    .filter(t => t.card === cardId)
    .reduce((s, t) => s + t.amount, 0);
  const instAmt = state.installments
    .filter(i => i.card === cardId && i.active && i.monthlyAmount)
    .reduce((s, i) => s + i.monthlyAmount, 0);
  return txAmt + instAmt;
}

function renderDashboard() {
  // Auto-calculated future date
  const fd = calcFutureDate();
  document.getElementById('dashFutureDate').textContent = t('dash_future_label') + ' ' + fmtDate(fd);

  // Per-account future balance = current balance + net income/expense transactions up to future date
  const futureMap = {};
  state.accounts.forEach(acc => {
    const accTxs  = state.transactions.filter(t => t.account === acc.id && t.date <= fd && !t.settled);
    const income  = accTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = accTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    futureMap[acc.id] = (acc.balance || 0) + income - expense;
  });

  // Build balance table rows dynamically
  const tbody = document.getElementById('balanceTbody');
  const rowCls = { cash: 'highlight-cash', alpha: 'highlight-alpha', winbank: 'highlight-win' };
  let totalNow = 0, totalFut = 0;
  const rows = state.accounts.map(acc => {
    const now = acc.balance || 0;
    const fut = futureMap[acc.id];
    totalNow += now; totalFut += fut;
    const cls = rowCls[acc.id] || '';
    const bankSub = (acc.type === 'bank' && acc.bank)
      ? ` <span class="acc-bank-sub">(${esc(acc.bank)})</span>` : '';
    return `<tr class="account-row ${cls}">
      <td class="account-name">${esc(acc.name)}${bankSub}</td>
      <td class="amount">${fmtEuro(now)}</td>
      <td class="amount future-amount${fut < 0 ? ' negative' : ''}">${fmtEuro(fut)}</td>
    </tr>`;
  });
  rows.push(`<tr class="total-row">
    <td class="account-name"><strong>${t('dash_total')}</strong></td>
    <td class="amount"><strong>${fmtEuro(totalNow)}</strong></td>
    <td class="amount"><strong>${fmtEuro(totalFut)}</strong></td>
  </tr>`);
  tbody.innerHTML = rows.join('');

  // Monthly stats (Fix 5: Δόσεις Καρτών removed)
  const month = thisMonth();
  const mtx = state.transactions.filter(t => t.date.startsWith(month));
  const income   = mtx.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
  const expenses = mtx.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
  document.getElementById('monthlyIncome').textContent = fmtEuro(income);
  document.getElementById('monthlyExpenses').textContent = fmtEuro(expenses);
  const balEl = document.getElementById('monthlyBalance');
  balEl.textContent = fmtEuro(income - expenses);
  balEl.className = 'stat-value ' + (income - expenses >= 0 ? 'positive' : 'negative');

  // Credit cards summary — dynamic with installments info (Fix 6)
  const ccDiv = document.getElementById('creditCardsSummary');
  ccDiv.innerHTML = (state.cards || []).map(card => {
    const txAmt   = state.cardTransactions
      .filter(t => t.card === card.id)
      .reduce((s, t) => s + t.amount, 0);
    const instAmt = state.installments
      .filter(i => i.card === card.id && i.active && i.monthlyAmount)
      .reduce((s, i) => s + i.monthlyAmount, 0);
    const total     = txAmt + instAmt;
    const logoClass = card.id === 'mastercard' ? 'mc-logo' : 'visa-logo';
    const logoText  = card.id === 'mastercard' ? 'MC' : card.name.substring(0, 4);
    return `
      <div class="credit-card-item">
        <div class="cc-logo ${logoClass}">${esc(logoText)}</div>
        <div class="cc-info">
          <div class="cc-bank">${esc(card.bank)}</div>
          <div class="cc-balance">${fmtEuro(txAmt)}</div>
        </div>
        <div class="cc-extra">
          ${instAmt > 0 ? `<div class="cc-inst">+${fmtEuro(instAmt)} ${t('dash_installments_pm')}</div>` : ''}
          <div class="cc-total-debt">${t('dash_total_colon')} <strong>${fmtEuro(total)}</strong></div>
        </div>
      </div>`;
  }).join('');

  // Recent transactions (last 6)
  const recent = [...state.transactions]
    .sort((a,b) => b.date.localeCompare(a.date))
    .slice(0, 6);
  renderRecentTransactions(recent);

  // Expense category chart
  const catMap = {};
  const addCat = (cat, amt) => {
    const k = (cat && cat.trim()) ? cat : t('no_category');
    catMap[k] = (catMap[k] || 0) + amt;
  };
  // 1. Account expenses — εξαιρούνται οι κινήσεις με κατηγορία 'Κάρτες'
  state.transactions
    .filter(t => t.type === 'expense' && t.date.startsWith(month) && t.category !== 'Κάρτες')
    .forEach(t => addCat(t.category, t.amount));
  // 2. Κινήσεις καρτών τρέχοντος μήνα
  state.cardTransactions
    .filter(t => t.date.startsWith(month))
    .forEach(t => addCat(t.category, t.amount));
  // 3. Ενεργές δόσεις (μηνιαία δόση)
  state.installments
    .filter(i => i.active && i.monthlyAmount)
    .forEach(i => addCat(i.category || t('installments_cat'), i.monthlyAmount));

  const catData = Object.entries(catMap)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const expMonthEl = document.getElementById('expChartMonth');
  if (expMonthEl) expMonthEl.textContent = fmtDate(month + '-01').slice(3);
  renderExpenseCategoryChart(catData);

  // Chart — all accounts (including cash)
  renderBalanceChart(state.accounts.map(a => ({
    label: a.name, now: a.balance || 0, future: futureMap[a.id],
  })));
}

function monthlyInstallmentTotal() {
  return state.installments
    .filter(i => i.active && i.monthlyAmount)
    .reduce((s,i) => s + i.monthlyAmount, 0);
}

function renderRecentTransactions(txs) {
  const el = document.getElementById('recentTransactions');
  if (!txs.length) { el.innerHTML = `<div class="empty-state">${t('dash_no_tx')}</div>`; return; }
  el.innerHTML = txs.map(t => `
    <div class="tx-item">
      <div class="tx-icon ${t.type}">${t.type === 'income' ? '↑' : '↓'}</div>
      <div class="tx-info">
        <div class="tx-desc">${esc(t.desc)}</div>
        <div class="tx-meta">
          <span>${fmtDate(t.date)}</span>
          <span>${esc(t.category || '—')}</span>
          <span>${accountLabel(t.account)}</span>
        </div>
      </div>
      <div class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${fmtEuro(t.amount)}</div>
    </div>
  `).join('');
}

// Simple canvas bar chart — accounts is [{ label, now, future }]
function renderBalanceChart(accounts) {
  const canvas = document.getElementById('balanceChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.parentElement.clientWidth - 40;
  const H = 180;
  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  // Paired palette: same hue per account — vivid=now, pastel=future
  const PALETTE = [
    { now: '#1e40af', future: '#93c5fd' },  // Μπλε
    { now: '#b91c1c', future: '#fca5a5' },  // Κόκκινο
    { now: '#15803d', future: '#86efac' },  // Πράσινο
    { now: '#b45309', future: '#fcd34d' },  // Κεχριμπάρι
    { now: '#6d28d9', future: '#c4b5fd' },  // Μωβ
    { now: '#0e7490', future: '#67e8f9' },  // Κυανό
  ];
  const data = [];
  accounts.forEach((a, i) => {
    const p = PALETTE[i % PALETTE.length];
    data.push({ label: a.label + ' ' + t('dash_today_label'),  value: a.now,    color: p.now    });
    data.push({ label: a.label + ' ' + t('dash_future_label'), value: a.future, color: p.future });
  });
  if (!data.length) return;

  const max = Math.max(...data.map(d => Math.abs(d.value)), 100);
  const barW = Math.min(60, (W - 40) / data.length - 10);
  const gap  = (W - 40 - barW * data.length) / (data.length + 1);
  const baseline = H - 30;

  ctx.font = '11px system-ui';
  ctx.textAlign = 'center';

  data.forEach((d, i) => {
    const x = 20 + gap + i * (barW + gap) + barW / 2;
    const barH = Math.abs(d.value / max) * (baseline - 30);
    const y = d.value >= 0 ? baseline - barH : baseline;

    ctx.fillStyle = d.color;
    roundRect(ctx, x - barW/2, y, barW, barH || 2, 4);
    ctx.fill();

    // Value label
    ctx.fillStyle = d.value < 0 ? '#dc2626' : '#1e293b';
    ctx.fillText(fmtEuro(d.value).replace(' €','€'), x, d.value >= 0 ? y - 5 : y + barH + 14);

    // X label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px system-ui';
    const words = d.label.split(' ');
    ctx.fillText(words[0], x, H - 14);
    ctx.fillText(words.slice(1).join(' '), x, H - 4);
    ctx.font = '11px system-ui';
  });

  // Baseline
  ctx.beginPath();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.moveTo(10, baseline);
  ctx.lineTo(W - 10, baseline);
  ctx.stroke();
}

function renderExpenseCategoryChart(catData) {
  const canvas = document.getElementById('expenseCategoryChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W   = canvas.parentElement.clientWidth - 40;

  // Palette
  const COLORS = ['#1e40af','#b91c1c','#15803d','#b45309','#6d28d9',
                  '#0e7490','#be185d','#0f766e','#92400e','#374151','#7c3aed','#0369a1'];

  const items = catData.map((c, i) => ({ ...c, color: COLORS[i % COLORS.length] }));

  // ── Empty state ──────────────────────────────────────────────
  if (!items.length) {
    canvas.width = W; canvas.height = 60;
    ctx.clearRect(0, 0, W, 60);
    ctx.fillStyle = '#94a3b8'; ctx.font = '13px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(t('dash_no_expenses'), W / 2, 34);
    return;
  }

  const total = items.reduce((s, c) => s + c.amount, 0);

  // ── Layout: side-by-side (≥440px) vs stacked (mobile) ───────
  const LH       = 21;   // legend row height
  const SIDE      = W >= 440;
  const donutR    = SIDE ? Math.min(100, Math.floor(W * 0.27)) : Math.min(85, Math.floor(W / 2) - 16);
  const innerR    = Math.round(donutR * 0.54);
  const lgRows    = items.length;
  const lgHeight  = lgRows * LH;

  let H, cx, cy, lgX, lgY, lgW;
  if (SIDE) {
    H   = Math.max(donutR * 2 + 20, lgHeight + 16);
    cx  = donutR + 10;
    cy  = Math.round(H / 2);
    lgX = donutR * 2 + 26;
    lgY = Math.round((H - lgHeight) / 2);
    lgW = W - lgX - 4;
  } else {
    H   = donutR * 2 + 24 + lgHeight + 10;
    cx  = Math.round(W / 2);
    cy  = donutR + 10;
    lgX = 4;
    lgY = donutR * 2 + 26;
    lgW = W - 8;
  }

  canvas.width  = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  // ── Donut segments ───────────────────────────────────────────
  let angle = -Math.PI / 2;
  items.forEach(c => {
    const sweep = (c.amount / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
    ctx.arc(cx, cy, donutR, angle, angle + sweep);
    ctx.arc(cx, cy, innerR, angle + sweep, angle, true);
    ctx.closePath();
    ctx.fillStyle = c.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    angle += sweep;
  });

  // ── Center label (total) ─────────────────────────────────────
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1e293b';
  ctx.font = `bold ${donutR >= 80 ? 13 : 11}px system-ui`;
  ctx.fillText(fmtEuro(total).replace(' €', '€'), cx, cy + 5);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px system-ui';
  ctx.fillText(t('dash_subtotal'), cx, cy + 16);

  // ── Legend ───────────────────────────────────────────────────
  const maxLabelChars = SIDE ? Math.max(10, Math.floor((lgW * 0.62) / 6.2)) : 22;

  items.forEach((c, i) => {
    const y   = lgY + i * LH;
    const pct = Math.round(c.amount / total * 100);

    // Colored dot
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(lgX + 6, y + 9, 5, 0, Math.PI * 2);
    ctx.fill();

    // Category name + percentage
    ctx.fillStyle = '#475569';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';
    const lbl = c.category.length > maxLabelChars
      ? c.category.slice(0, maxLabelChars - 1) + '…'
      : c.category;
    ctx.fillText(`${lbl} (${pct}%)`, lgX + 15, y + 14);

    // Amount — right-aligned
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(fmtEuro(c.amount).replace(' €', '€'), lgX + lgW, y + 14);
  });
}

// ── HELP / MANUAL PAGE ───────────────────────────────────────

function renderHelp() {
  const cont = document.getElementById('helpContent');
  if (!cont || cont.dataset.loaded) return;  // cache — don't re-parse on every nav click
  const file = (typeof getLang === 'function' && getLang() === 'en') ? '/README.en.md' : '/README.md';
  fetch(file)
    .then(r => r.ok ? r.text() : Promise.reject('not found'))
    .then(md => { cont.innerHTML = mdToHtml(md); cont.dataset.loaded = '1'; })
    .catch(() => { cont.innerHTML = `<p class="muted" style="padding:24px">${t('help_not_found')}</p>`; });
}

// Lightweight Markdown → HTML converter (supports the subset used in README.md)
function mdToHtml(md) {
  const lines = md.split('\n');
  const out   = [];
  let inCode = false, codeBuf = [];
  let inTable = false, tableRows = [];
  let inUl = false, inOl = false;

  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const inline = txt => txt
    .replace(/`([^`]+)`/g,        (_, c) => `<code>${esc(c)}</code>`)
    .replace(/\*\*([^*]+)\*\*/g,  '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g,      '<em>$1</em>')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');   // strip links → plain text

  const flushUl  = () => { if (inUl)  { out.push('</ul>');  inUl  = false; } };
  const flushOl  = () => { if (inOl)  { out.push('</ol>');  inOl  = false; } };
  const flushLists = () => { flushUl(); flushOl(); };

  const flushTable = () => {
    if (!inTable || !tableRows.length) { inTable = false; tableRows = []; return; }
    // Drop separator rows (cells are only dashes / colons / spaces)
    const dataRows = tableRows.filter(row => {
      const inner = row.replace(/^\|/, '').replace(/\|$/, '');
      return !inner.split('|').every(c => /^[\s:|-]+$/.test(c));
    });
    if (!dataRows.length) { inTable = false; tableRows = []; return; }
    out.push('<table class="help-table"><tbody>');
    dataRows.forEach((row, idx) => {
      const cells = row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const tag   = idx === 0 ? 'th' : 'td';
      out.push(`<tr>${cells.map(c => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`);
    });
    out.push('</tbody></table>');
    inTable = false; tableRows = [];
  };

  for (const line of lines) {
    // ── fenced code block ──────────────────────────────────
    if (line.startsWith('```')) {
      if (!inCode) { flushLists(); flushTable(); inCode = true; codeBuf = []; }
      else { out.push(`<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`); inCode = false; }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    // ── table row ──────────────────────────────────────────
    if (line.startsWith('|')) {
      flushLists();
      if (!inTable) inTable = true;
      tableRows.push(line);
      continue;
    }
    if (inTable) flushTable();

    // ── horizontal rule ────────────────────────────────────
    if (/^---+\s*$/.test(line)) { flushLists(); out.push('<hr>'); continue; }

    // ── headings ───────────────────────────────────────────
    let m;
    if ((m = line.match(/^(#{1,3}) (.+)/))) {
      flushLists();
      const lvl = m[1].length;
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
      continue;
    }

    // ── blockquote ─────────────────────────────────────────
    if ((m = line.match(/^> (.*)/))) {
      flushLists();
      out.push(`<blockquote>${inline(m[1])}</blockquote>`);
      continue;
    }

    // ── ordered list ───────────────────────────────────────
    if ((m = line.match(/^\d+\. (.*)/))) {
      flushUl();
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push(`<li>${inline(m[1])}</li>`);
      continue;
    }

    // ── unordered list ─────────────────────────────────────
    if ((m = line.match(/^[-*] (.*)/))) {
      flushOl();
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${inline(m[1])}</li>`);
      continue;
    }

    // ── empty line ─────────────────────────────────────────
    if (!line.trim()) { flushLists(); continue; }

    // ── paragraph ──────────────────────────────────────────
    flushLists();
    out.push(`<p>${inline(line)}</p>`);
  }

  flushLists(); flushTable();
  return out.join('\n');
}

function roundRect(ctx, x, y, w, h, r) {
  if (h < 0) { y += h; h = -h; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── TRANSACTIONS ─────────────────────────────────────────────
let txSort = { field: 'date', asc: false };

function renderTransactions() {
  populateCategorySelect('txCategoryFilter');

  const monthEl  = document.getElementById('txMonthFilter');
  if (!monthEl.value) monthEl.value = thisMonth();

  filterAndRenderTransactions();
}

function filterAndRenderTransactions() {
  const month   = document.getElementById('txMonthFilter').value;
  const account = document.getElementById('txAccountFilter').value;
  const cat     = document.getElementById('txCategoryFilter').value;
  const search  = document.getElementById('txSearch').value.trim().toLowerCase();

  let txs = [...state.transactions];
  if (month)   txs = txs.filter(tx => tx.date.startsWith(month));
  if (account) txs = txs.filter(tx => tx.account === account);
  if (cat)     txs = txs.filter(tx => tx.category === cat);
  if (search)  txs = txs.filter(tx =>
    tx.desc.toLowerCase().includes(search) ||
    (tx.notes || '').toLowerCase().includes(search)
  );

  // Sort
  txs.sort((a, b) => {
    let av = a[txSort.field], bv = b[txSort.field];
    if (txSort.field === 'amount') { av = +av; bv = +bv; }
    else { av = String(av||'').toLowerCase(); bv = String(bv||'').toLowerCase(); }
    return txSort.asc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  const income   = txs.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
  const expenses = txs.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
  document.getElementById('txTotalIncome').textContent   = fmtEuro(income);
  document.getElementById('txTotalExpense').textContent  = fmtEuro(expenses);
  const balEl = document.getElementById('txBalance');
  balEl.textContent = fmtEuro(income - expenses);
  balEl.className = income - expenses >= 0 ? 'positive' : 'negative';

  const tbody = document.getElementById('transactionsTbody');
  const empty = document.getElementById('txEmptyState');

  if (!txs.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = txs.map(tx => `
    <tr>
      <td>${fmtDate(tx.date)}</td>
      <td>
        <div style="font-weight:600">${esc(tx.desc)}${tx.subId ? ` <span title="${t('auto_sub_note')}" style="font-size:.85em">🔄</span>` : ''}</div>
        ${tx.notes && !tx.subId ? `<div style="font-size:.75rem;color:#64748b">${esc(tx.notes)}</div>` : ''}
      </td>
      <td>${tx.category ? `<span class="badge badge-blue">${esc(tx.category)}</span>` : '<span class="muted">—</span>'}</td>
      <td><span class="badge badge-gray">${accountLabel(tx.account)}</span></td>
      <td class="amount-cell ${tx.type === 'income' ? 'positive' : 'negative'}">
        ${tx.type === 'income' ? '+' : '-'}${fmtEuro(tx.amount)}
      </td>
      <td>
        <div class="tx-actions">
          <button class="btn-icon${tx.settled ? ' settled' : ''}" onclick="toggleTransactionSettled('${tx.id}')" title="${t('btn_toggle_settled')}">${tx.settled ? '✅' : '☐'}</button>
          ${!tx.subId ? `<button class="btn-icon" onclick="editTransaction('${tx.id}')">✏️</button>` : '<span class="btn-icon-spacer"></span>'}
          <button class="btn-icon danger" onclick="deleteTransaction('${tx.id}')">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openNewTransactionModal() {
  document.getElementById('transactionModalTitle').textContent = t('modal_new_tx');
  document.getElementById('editTransactionId').value = '';
  document.querySelector('input[name="txType"][value="expense"]').checked = true;
  document.getElementById('txDate').value   = today();
  document.getElementById('txAmount').value = '';
  document.getElementById('txDesc').value   = '';
  document.getElementById('txNotes').value  = '';
  document.getElementById('txSettled').checked = false;
  populateTxCategorySelect();
  openModal('addTransactionModal');
}

function editTransaction(id) {
  const tx = state.transactions.find(x => x.id === id);
  if (!tx) return;
  document.getElementById('transactionModalTitle').textContent = t('modal_edit_tx');
  document.getElementById('editTransactionId').value = id;
  document.querySelector(`input[name="txType"][value="${tx.type}"]`).checked = true;
  document.getElementById('txDate').value     = tx.date;
  document.getElementById('txAmount').value   = tx.amount;
  document.getElementById('txDesc').value     = tx.desc;
  document.getElementById('txNotes').value    = tx.notes || '';
  populateTxCategorySelect();
  document.getElementById('txCategory').value = tx.category || '';
  document.getElementById('txAccount').value  = tx.account;
  document.getElementById('txSettled').checked = !!tx.settled;
  openModal('addTransactionModal');
}

function deleteTransaction(id) {
  const tx = state.transactions.find(t => t.id === id);
  const msg = tx?.subId ? t('confirm_del_sub_tx') : t('confirm_del_tx_msg');
  showConfirm(t('confirm_del_tx'), msg, () => {
    if (tx?.subId && tx?.subMonth) {
      if (!state.deletedSubKeys) state.deletedSubKeys = [];
      state.deletedSubKeys.push(`${tx.subId}|${tx.subMonth}`);
    }
    // Reverse settled balance effect before removing
    if (tx?.settled) {
      const acc = state.accounts.find(a => a.id === tx.account);
      if (acc) {
        const delta = tx.type === 'income' ? tx.amount : -tx.amount;
        acc.balance = (acc.balance || 0) - delta;
      }
    }
    state.transactions = state.transactions.filter(t => t.id !== id);
    saveState();
    filterAndRenderTransactions();
    showToast(t('toast_tx_deleted'), 'success');
  });
}

function toggleTransactionSettled(id) {
  const tx = state.transactions.find(x => x.id === id);
  if (!tx) return;
  const acc = state.accounts.find(a => a.id === tx.account);
  if (!acc) return;

  const wasSettled = !!tx.settled;
  tx.settled = !wasSettled;

  const delta = tx.type === 'income' ? tx.amount : -tx.amount;
  acc.balance = (acc.balance || 0) + (wasSettled ? -delta : delta);

  saveState();
  filterAndRenderTransactions();
}

function saveTransaction() {
  const type    = document.querySelector('input[name="txType"]:checked').value;
  const date    = document.getElementById('txDate').value;
  const amount  = parseFloat(document.getElementById('txAmount').value);
  const desc    = document.getElementById('txDesc').value.trim();
  const cat     = document.getElementById('txCategory').value;
  const account = document.getElementById('txAccount').value;
  const notes   = document.getElementById('txNotes').value.trim();
  const settled = document.getElementById('txSettled').checked;
  const editId  = document.getElementById('editTransactionId').value;

  if (!date || !desc || isNaN(amount) || amount <= 0) {
    showToast(t('toast_fill_required'), 'error'); return;
  }

  if (editId) {
    const idx = state.transactions.findIndex(tx => tx.id === editId);
    if (idx >= 0) {
      const oldTx = state.transactions[idx];
      // Reverse old settled effect on old account
      if (oldTx.settled) {
        const oldAcc = state.accounts.find(a => a.id === oldTx.account);
        if (oldAcc) {
          const d = oldTx.type === 'income' ? oldTx.amount : -oldTx.amount;
          oldAcc.balance = (oldAcc.balance || 0) - d;
        }
      }
      state.transactions[idx] = { ...oldTx, type, date, amount, desc, category: cat, account, notes, settled };
      // Apply new settled effect on (possibly new) account
      if (settled) {
        const newAcc = state.accounts.find(a => a.id === account);
        if (newAcc) {
          const d = type === 'income' ? amount : -amount;
          newAcc.balance = (newAcc.balance || 0) + d;
        }
      }
    }
  } else {
    state.transactions.push({ id: uid(), type, date, amount, desc, category: cat, account, notes, settled });
    if (settled) {
      const newAcc = state.accounts.find(a => a.id === account);
      if (newAcc) {
        const d = type === 'income' ? amount : -amount;
        newAcc.balance = (newAcc.balance || 0) + d;
      }
    }
  }

  saveState();
  closeModal('addTransactionModal');
  showToast(editId ? t('toast_tx_updated') : t('toast_tx_saved'), 'success');
  renderPage(currentPage());
}

// ── INCOME ───────────────────────────────────────────────────
function renderIncome() {
  const monthEl = document.getElementById('incomeMonthFilter');
  if (!monthEl.value) monthEl.value = thisMonth();
  filterAndRenderIncome();
}

function filterAndRenderIncome() {
  const month = document.getElementById('incomeMonthFilter').value;
  let txs = state.transactions.filter(t => t.type === 'income');
  if (month) txs = txs.filter(t => t.date.startsWith(month));
  txs.sort((a,b) => b.date.localeCompare(a.date));

  const total = txs.reduce((s,t) => s + t.amount, 0);
  document.getElementById('incomeMonthTotal').textContent  = fmtEuro(total);
  document.getElementById('incomeYearEstimate').textContent = fmtEuro(total * 12);

  document.getElementById('incomeTbody').innerHTML = txs.length
    ? txs.map(t => `
        <tr>
          <td>${fmtDate(t.date)}</td>
          <td>${esc(t.desc)}</td>
          <td>${t.category ? `<span class="badge badge-green">${esc(t.category)}</span>` : '—'}</td>
          <td>${accountLabel(t.account)}</td>
          <td class="amount-cell positive">+${fmtEuro(t.amount)}</td>
          <td>
            <button class="btn-icon" title="Αντιγραφή στον επόμενο μήνα" onclick="copyIncomeToNextMonth('${t.id}')">📋</button>
            <button class="btn-icon danger" onclick="deleteTransaction('${t.id}')">🗑️</button>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="6" class="empty-state">${t('income_none')}</td></tr>`;
}

function copyIncomeToNextMonth(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;

  // Shift date by exactly 1 month (JS Date handles Dec→Jan & overflow like Jan 31→Feb 28 correctly)
  const [y, m, d] = tx.date.split('-').map(Number);
  const next = new Date(y, m, d); // month m is 1-12; Date(y, m, d) treats m as 0-indexed → +1 month
  const newDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;

  state.transactions.push({ ...tx, id: uid(), date: newDate });
  saveState();
  showToast(`${t('toast_copied_to')} ${fmtDate(newDate)}`, 'success');
  renderPage(currentPage());
}

function saveIncome() {
  const date    = document.getElementById('incDate').value;
  const amount  = parseFloat(document.getElementById('incAmount').value);
  const desc    = document.getElementById('incDesc').value.trim();
  const cat     = document.getElementById('incCategory').value;
  const account = document.getElementById('incAccount').value;

  if (!date || !desc || isNaN(amount) || amount <= 0) {
    showToast(t('toast_fill_required'), 'error'); return;
  }

  state.transactions.push({ id: uid(), type: 'income', date, amount, desc, category: cat, account, notes: '' });
  saveState();
  closeModal('addIncomeModal');
  showToast(t('toast_income_saved'), 'success');
  renderPage(currentPage());
}

// ── CREDIT CARDS ─────────────────────────────────────────────
function renderCardsPage() {
  const cards = state.cards || [];
  const tabs  = document.getElementById('cardTabs');
  const cont  = document.getElementById('cardPageContent');
  if (!tabs || !cont) return;

  if (!cards.length) {
    tabs.innerHTML = '';
    cont.innerHTML = `<div class="empty-state" style="padding:40px">${t('cards_not_set')}</div>`;
    return;
  }

  // Default to first card if none selected or selection no longer valid
  if (!activeCardId || !cards.find(c => c.id === activeCardId)) {
    activeCardId = cards[0].id;
  }

  // Render card selector tabs
  tabs.innerHTML = cards.map(c => {
    const n   = (c.id + ' ' + c.name).toLowerCase();
    const cls = n.includes('visa') ? 'tab-visa' : n.includes('master') ? 'tab-mc' : '';
    return `<button class="card-tab ${cls}${c.id === activeCardId ? ' active' : ''}"
              onclick="selectCard('${c.id}')">💳 ${esc(c.name)}</button>`;
  }).join('');

  renderCard(activeCardId);
}

function selectCard(cardId) {
  activeCardId = cardId;
  renderCardsPage();
}

function renderCard(cardId) {
  const cardData   = (state.cards || []).find(c => c.id === cardId);
  const inst       = state.installments.filter(i => i.card === cardId && i.active);
  const txs        = state.cardTransactions.filter(t => t.card === cardId);
  const totalInst  = inst.filter(i => i.monthlyAmount).reduce((s, i) => s + i.monthlyAmount, 0);
  const totalTx    = txs.reduce((s, t) => s + t.amount, 0);
  const totalBalance = totalTx + totalInst;
  const month      = thisMonth();
  const monthlyTx  = txs.filter(t => t.date.startsWith(month)).reduce((s, t) => s + t.amount, 0);

  const name = cardData?.name || cardId.toUpperCase();
  const bank = cardData?.bank || '';
  const n    = (cardId + ' ' + name).toLowerCase();
  const hdr  = n.includes('visa') ? 'visa-header' : 'mc-header';

  document.getElementById('cardPageContent').innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="cc-header ${hdr}">
          <span class="cc-title">${esc(name)}</span>
          <span class="cc-bank-label">${esc(bank)}</span>
        </div>
      </div>
      <div class="cc-summary">
        <div class="cc-stat">
          <div class="cc-stat-label">${t('card_current_balance')}</div>
          <div class="cc-stat-value">${fmtEuro(totalBalance)}</div>
        </div>
        <div class="cc-stat">
          <div class="cc-stat-label">${t('card_monthly_inst')}</div>
          <div class="cc-stat-value">${fmtEuro(totalInst)}</div>
        </div>
        <div class="cc-stat">
          <div class="cc-stat-label">${t('card_monthly_tx')}</div>
          <div class="cc-stat-value">${fmtEuro(monthlyTx)}</div>
        </div>
      </div>
    </div>

    <div class="card card-wide">
      <div class="card-header">
        <h2>${t('card_inst_hdr')} ${esc(name)}</h2>
        <button class="btn btn-sm btn-primary" onclick="openInstallmentModal('${cardId}')">${t('btn_add_inst')}</button>
      </div>
      <div class="installments-list" id="cardInstallmentsList"></div>
    </div>

    <div class="card card-wide">
      <div class="card-header">
        <h2>${t('card_tx_hdr')} ${esc(name)}</h2>
        <button class="btn btn-sm btn-primary" onclick="openCardTransactionModal('${cardId}')">${t('btn_add_card_tx')}</button>
      </div>
      <table class="data-table">
        <thead>
          <tr><th>${t('col_date')}</th><th>${t('col_desc')}</th><th>${t('col_category')}</th><th>${t('col_amount')}</th><th>${t('col_actions')}</th></tr>
        </thead>
        <tbody id="cardTransactionsTbody"></tbody>
      </table>
    </div>
  `;

  renderInstallmentCards('cardInstallmentsList', inst);
  renderCardTransactions('cardTransactionsTbody', txs);
}

function renderInstallmentCards(containerId, list) {
  const el = document.getElementById(containerId);
  if (!list.length) { el.innerHTML = `<div class="empty-state">${t('inst_none')}</div>`; return; }

  el.innerHTML = list.map(i => {
    const pct = i.totalCount ? Math.round((i.paidCount / i.totalCount) * 100) : 0;
    const remaining = i.totalCount ? i.totalCount - i.paidCount : '?';
    return `
    <div class="installment-card">
      <div class="inst-header">
        <div>
          <div class="inst-name">${esc(i.desc)}</div>
          ${i.store ? `<div class="inst-store">${esc(i.store)}</div>` : ''}
        </div>
        <span class="inst-badge ${i.card}">${i.card.toUpperCase()}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="inst-footer">
        <span>${i.paidCount}/${i.totalCount || '?'} ${t('inst_installments')} (${pct}%)</span>
        <span>${remaining} ${t('inst_remaining')}</span>
        ${i.monthlyAmount ? `<span><strong class="pv">${fmtEuro(i.monthlyAmount)}</strong>${t('per_month')}</span>` : ''}
      </div>
      <div class="inst-actions">
        <button class="btn btn-sm btn-secondary" onclick="payInstallment('${i.id}')">${t('btn_pay_inst')}</button>
        <button class="btn btn-sm btn-secondary" onclick="editInstallment('${i.id}')">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteInstallment('${i.id}')">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function renderCardTransactions(tbodyId, txs) {
  const tbody = document.getElementById(tbodyId);
  txs.sort((a,b) => b.date.localeCompare(a.date));
  tbody.innerHTML = txs.length
    ? txs.map(tx => `
        <tr>
          <td>${fmtDate(tx.date)}</td>
          <td>${esc(tx.desc)}${tx.subId ? ` <span title="${t('auto_sub_note')}" style="font-size:.85em">🔄</span>` : ''}</td>
          <td>${tx.category ? `<span class="badge badge-blue">${esc(tx.category)}</span>` : '—'}</td>
          <td class="amount-cell negative">-${fmtEuro(tx.amount)}</td>
          <td><button class="btn-icon danger" onclick="deleteCardTx('${tx.id}')">🗑️</button></td>
        </tr>`).join('')
    : `<tr><td colspan="5" class="empty-state">${t('tx_empty')}</td></tr>`;
}

// ── INSTALLMENTS PAGE ────────────────────────────────────────
function renderInstallments() {
  const active = state.installments.filter(i => i.active);
  const monthly = active.filter(i=>i.monthlyAmount).reduce((s,i)=>s+i.monthlyAmount,0);
  const totalRem = active.filter(i=>i.monthlyAmount && i.totalCount)
    .reduce((s,i) => s + i.monthlyAmount * (i.totalCount - i.paidCount), 0);

  document.getElementById('installmentMonthly').textContent   = fmtEuro(monthly) + t('per_month');
  document.getElementById('installmentRemaining').textContent = fmtEuro(totalRem);
  renderInstallmentCards('allInstallmentsList', active);
}

function openInstallmentModal(card) {
  document.getElementById('installmentModalTitle').textContent = t('modal_new_inst');
  document.getElementById('editInstallmentId').value = '';
  document.getElementById('instDesc').value  = '';
  document.getElementById('instTotal').value = '';
  document.getElementById('instMonthly').value = '';
  document.getElementById('instPaid').value  = '0';
  document.getElementById('instTotalCount').value = '';
  document.getElementById('instStore').value = '';
  document.getElementById('instStart').value = thisMonth();
  populateCategorySelect('instCategory');
  if (card) document.getElementById('instCard').value = card;
  openModal('addInstallmentModal');
}

function editInstallment(id) {
  const i = state.installments.find(x => x.id === id);
  if (!i) return;
  document.getElementById('installmentModalTitle').textContent = t('modal_edit_inst');
  document.getElementById('editInstallmentId').value = id;
  document.getElementById('instDesc').value  = i.desc;
  document.getElementById('instTotal').value = i.totalAmount || '';
  document.getElementById('instMonthly').value = i.monthlyAmount || '';
  document.getElementById('instPaid').value  = i.paidCount;
  document.getElementById('instTotalCount').value = i.totalCount || '';
  document.getElementById('instStore').value = i.store || '';
  document.getElementById('instStart').value = i.startMonth || thisMonth();
  document.getElementById('instCard').value  = i.card;
  populateCategorySelect('instCategory');
  document.getElementById('instCategory').value = i.category || '';
  openModal('addInstallmentModal');
}

function saveInstallment() {
  const desc     = document.getElementById('instDesc').value.trim();
  const total    = parseFloat(document.getElementById('instTotal').value) || null;
  const monthly  = parseFloat(document.getElementById('instMonthly').value) || null;
  const paid     = parseInt(document.getElementById('instPaid').value) || 0;
  const totalCount = parseInt(document.getElementById('instTotalCount').value) || null;
  const card     = document.getElementById('instCard').value;
  const store    = document.getElementById('instStore').value.trim();
  const start    = document.getElementById('instStart').value;
  const category = document.getElementById('instCategory').value;
  const editId   = document.getElementById('editInstallmentId').value;

  if (!desc) { showToast(t('toast_enter_desc'), 'error'); return; }

  const obj = { desc, totalAmount: total, monthlyAmount: monthly, paidCount: paid,
    totalCount, card, store, startMonth: start, category, active: true };

  if (editId) {
    const idx = state.installments.findIndex(i => i.id === editId);
    if (idx >= 0) state.installments[idx] = { ...state.installments[idx], ...obj };
  } else {
    state.installments.push({ id: uid(), ...obj });
  }

  saveState();
  closeModal('addInstallmentModal');
  showToast(t('toast_inst_saved'), 'success');
  renderPage(currentPage());
}

function payInstallment(id) {
  const i = state.installments.find(x => x.id === id);
  if (!i) return;
  i.paidCount = Math.min(i.paidCount + 1, i.totalCount || Infinity);
  if (i.totalCount && i.paidCount >= i.totalCount) i.active = false;
  saveState();
  renderPage(currentPage());
  showToast(t('toast_inst_paid'), 'success');
}

function deleteInstallment(id) {
  showConfirm(t('confirm_del_inst'), t('confirm_del_inst_msg'), () => {
    state.installments = state.installments.filter(i => i.id !== id);
    saveState();
    renderPage(currentPage());
    showToast(t('toast_inst_deleted'), 'success');
  });
}

// ── SUBSCRIPTION AUTO-SYNC ───────────────────────────────────
// Generates missing transactions for every active subscription,
// respecting manually-deleted entries (stored in state.deletedSubKeys).
function syncSubscriptionTransactions() {
  const current = thisMonth();
  if (!state.deletedSubKeys) state.deletedSubKeys = [];
  const deleted = new Set(state.deletedSubKeys);
  let changed = false;

  for (const sub of state.subscriptions) {
    if (!sub.amount || sub.amount <= 0) continue;

    const isCard = sub.card === 'visa' || sub.card === 'mastercard';
    const start  = sub.startMonth || current;
    let months   = [];

    if (sub.frequency === 'monthly') {
      months = monthRange(start, current);
    } else {
      // yearly: one entry per year on the billing month
      const billingMM = start.split('-')[1];
      const [sy] = start.split('-');
      const [cy] = current.split('-');
      for (let y = parseInt(sy); y <= parseInt(cy); y++) {
        const ym = `${y}-${billingMM}`;
        if (ym >= start && ym <= current) months.push(ym);
      }
    }

    for (const month of months) {
      const key = `${sub.id}|${month}`;
      if (deleted.has(key)) continue;

      const subCat = sub.category || 'Συνδρομές';
      if (isCard) {
        const exists = state.cardTransactions.some(t => t.subId === sub.id && t.subMonth === month);
        if (!exists) {
          const day  = Math.min(sub.day || 1, daysInMonth(month));
          const date = `${month}-${String(day).padStart(2,'0')}`;
          state.cardTransactions.push({
            id: uid(), card: sub.card, date, amount: sub.amount,
            desc: sub.name, category: subCat,
            subId: sub.id, subMonth: month,
          });
          changed = true;
        }
      } else {
        const exists = state.transactions.some(t => t.subId === sub.id && t.subMonth === month);
        if (!exists) {
          const day  = Math.min(sub.day || 1, daysInMonth(month));
          const date = `${month}-${String(day).padStart(2,'0')}`;
          state.transactions.push({
            id: uid(), type: 'expense', date, amount: sub.amount,
            desc: sub.name, category: subCat, account: sub.card,
            notes: t('auto_sub_note'), subId: sub.id, subMonth: month,
          });
          changed = true;
        }
      }
    }
  }

  if (changed) saveState();
  return changed;
}

// ── SUBSCRIPTIONS ────────────────────────────────────────────
function renderSubscriptions() {
  const subs = state.subscriptions;
  const monthly = subs.reduce((s,x) => s + (x.frequency === 'monthly' ? x.amount : 0), 0);
  const yearly  = subs.reduce((s,x) => s + (x.frequency === 'monthly' ? x.amount * 12 : x.amount), 0);
  document.getElementById('subMonthly').textContent = fmtEuro(monthly);
  document.getElementById('subYearly').textContent  = fmtEuro(yearly);

  const grid = document.getElementById('subscriptionsGrid');
  if (!subs.length) { grid.innerHTML = `<div class="empty-state">${t('sub_none')}</div>`; return; }

  grid.innerHTML = subs.map(s => `
    <div class="sub-card" onclick="editSubscription('${s.id}')">
      <button class="sub-delete" onclick="event.stopPropagation();deleteSubscription('${s.id}')">✕</button>
      <div class="sub-icon">${s.icon || '📱'}</div>
      <div class="sub-name">${esc(s.name)}</div>
      <div class="sub-amount">${fmtEuro(s.amount)}</div>
      <div class="sub-freq">${s.frequency === 'monthly' ? t('freq_monthly') : t('freq_yearly')}</div>
      <div class="sub-card-type">${accountLabel(s.card)}</div>
    </div>
  `).join('');
}

function openSubscriptionModal() {
  document.getElementById('subscriptionModalTitle').textContent = t('modal_new_sub');
  document.getElementById('editSubscriptionId').value = '';
  document.getElementById('subName').value      = '';
  document.getElementById('subAmount').value    = '';
  document.getElementById('subFrequency').value = 'monthly';
  document.getElementById('subDay').value       = '';
  document.getElementById('subIcon').value      = '';
  populateCategorySelect('subCategory');
  openModal('addSubscriptionModal');
}

function editSubscription(id) {
  const s = state.subscriptions.find(x => x.id === id);
  if (!s) return;
  document.getElementById('subscriptionModalTitle').textContent = t('modal_edit_sub');
  document.getElementById('editSubscriptionId').value = id;
  document.getElementById('subName').value      = s.name;
  document.getElementById('subAmount').value    = s.amount;
  document.getElementById('subFrequency').value = s.frequency;
  document.getElementById('subCard').value      = s.card;
  document.getElementById('subDay').value       = s.day || '';
  document.getElementById('subIcon').value      = s.icon || '';
  populateCategorySelect('subCategory');
  document.getElementById('subCategory').value  = s.category || '';
  openModal('addSubscriptionModal');
}

function saveSubscription() {
  const name     = document.getElementById('subName').value.trim();
  const amount   = parseFloat(document.getElementById('subAmount').value);
  const freq     = document.getElementById('subFrequency').value;
  const card     = document.getElementById('subCard').value;
  const day      = parseInt(document.getElementById('subDay').value) || 1;
  const icon     = document.getElementById('subIcon').value.trim() || '📱';
  const category = document.getElementById('subCategory').value;
  const editId   = document.getElementById('editSubscriptionId').value;

  if (!name || isNaN(amount)) { showToast(t('toast_fill_required'), 'error'); return; }

  const obj = { name, amount, frequency: freq, card, day, icon, category };
  if (editId) {
    const idx = state.subscriptions.findIndex(s => s.id === editId);
    if (idx >= 0) {
      state.subscriptions[idx] = { ...state.subscriptions[idx], ...obj };
      // Ενημέρωση κατηγορίας σε υπάρχουσες αυτόματες κινήσεις
      const cat = category || 'Συνδρομές';
      state.cardTransactions.forEach(t => { if (t.subId === editId) t.category = cat; });
      state.transactions.forEach(t => { if (t.subId === editId) t.category = cat; });
    }
  } else {
    // New subscription: record start month so sync knows from when to generate
    state.subscriptions.push({ id: uid(), startMonth: thisMonth(), ...obj });
  }

  saveState();
  syncSubscriptionTransactions();
  closeModal('addSubscriptionModal');
  showToast(t('toast_sub_saved'), 'success');
  renderPage(currentPage());
}

function deleteSubscription(id) {
  showConfirm(t('confirm_del_sub'), t('confirm_del_sub_msg'), () => {
    // Remove all auto-generated transactions for this subscription
    state.cardTransactions = state.cardTransactions.filter(t => t.subId !== id);
    state.transactions     = state.transactions.filter(t => t.subId !== id);
    // Clean up any tracked deletions for this sub
    state.deletedSubKeys = (state.deletedSubKeys || []).filter(k => !k.startsWith(id + '|'));
    state.subscriptions  = state.subscriptions.filter(s => s.id !== id);
    saveState();
    renderPage(currentPage());
    showToast(t('toast_sub_deleted'), 'success');
  });
}

// ── CARD TRANSACTIONS ────────────────────────────────────────
function openCardTransactionModal(card) {
  document.getElementById('cardTxCard').value = card;
  document.getElementById('cardTxModalTitle').textContent = t('modal_card_tx') + ' ' + card.toUpperCase();
  document.getElementById('cardTxDate').value = today();
  document.getElementById('cardTxAmount').value = '';
  document.getElementById('cardTxDesc').value = '';
  populateCategorySelect('cardTxCategory');
  openModal('cardTransactionModal');
}

function saveCardTransaction() {
  const card   = document.getElementById('cardTxCard').value;
  const date   = document.getElementById('cardTxDate').value;
  const amount = parseFloat(document.getElementById('cardTxAmount').value);
  const desc   = document.getElementById('cardTxDesc').value.trim();
  const cat    = document.getElementById('cardTxCategory').value;

  if (!date || !desc || isNaN(amount) || amount <= 0) { showToast(t('toast_fill_fields'), 'error'); return; }

  state.cardTransactions.push({ id: uid(), card, date, amount, desc, category: cat });
  saveState();
  closeModal('cardTransactionModal');
  showToast(t('toast_tx_saved'), 'success');
  renderPage(currentPage());
}

function deleteCardTx(id) {
  const tx = state.cardTransactions.find(t => t.id === id);
  const msg = tx?.subId
    ? t('confirm_del_sub_tx')
    : t('confirm_del_card_tx_msg');
  showConfirm(t('confirm_del_tx'), msg, () => {
    if (tx?.subId && tx?.subMonth) {
      if (!state.deletedSubKeys) state.deletedSubKeys = [];
      state.deletedSubKeys.push(`${tx.subId}|${tx.subMonth}`);
    }
    state.cardTransactions = state.cardTransactions.filter(tx => tx.id !== id);
    saveState();
    renderPage(currentPage());
    showToast(t('toast_card_tx_deleted'), 'success');
  });
}

// ── SETTINGS ─────────────────────────────────────────────────
function renderSettings() {
  renderAccountsSettings();
  renderCardsSettings();
  renderCategoriesList();
  renderIncomeCategoriesList();
}

function renderAccountsSettings() {
  const container = document.getElementById('accountsSettingsContainer');
  if (!container) return;
  container.innerHTML = state.accounts.map(acc => `
    <div class="acc-setting-block">
      <div class="acc-setting-fields">
        <div class="form-group">
          <label>${t('acc_label_name')}</label>
          <input type="text" id="accName_${acc.id}" class="form-control" value="${esc(acc.name)}">
        </div>
        <div class="form-group">
          <label>${t('acc_label_type')}</label>
          <select id="accType_${acc.id}" class="form-control" onchange="toggleBankField('${acc.id}')">
            <option value="cash" ${acc.type === 'cash' ? 'selected' : ''}>${t('acc_type_cash')}</option>
            <option value="bank" ${acc.type === 'bank' ? 'selected' : ''}>${t('acc_type_bank')}</option>
          </select>
        </div>
        <div class="form-group" id="accBankGroup_${acc.id}" ${acc.type === 'cash' ? 'style="display:none"' : ''}>
          <label>${t('acc_label_bank')}</label>
          <input type="text" id="accBank_${acc.id}" class="form-control" value="${esc(acc.bank || '')}" placeholder="π.χ. Alpha Bank">
        </div>
        <div class="form-group">
          <label>${t('acc_label_balance')}</label>
          <input type="number" id="accBalance_${acc.id}" class="form-control" step="0.01" value="${acc.balance || 0}">
        </div>
      </div>
      <div class="acc-setting-actions">
        <button class="btn btn-sm btn-primary" onclick="saveAccountSetting('${acc.id}')">${t('btn_save')}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteAccount('${acc.id}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

function renderCardsSettings() {
  const container = document.getElementById('cardsSettingsContainer');
  if (!container) return;
  const accOptions = (state.accounts || []).map(a =>
    `<option value="${a.id}">${esc(a.name)}</option>`
  ).join('');
  container.innerHTML = (state.cards || []).map(card => `
    <div class="acc-setting-block">
      <div class="acc-setting-fields">
        <div class="form-group">
          <label>${t('card_label_name')}</label>
          <input type="text" id="cardName_${card.id}" class="form-control" value="${esc(card.name)}">
        </div>
        <div class="form-group">
          <label>${t('card_label_bank')}</label>
          <input type="text" id="cardBank_${card.id}" class="form-control" value="${esc(card.bank || '')}" placeholder="π.χ. Alpha Bank">
        </div>
        <div class="form-group">
          <label>${t('card_label_linked')}</label>
          <select id="cardLinkedAcc_${card.id}" class="form-control">
            <option value="">${t('card_none_linked')}</option>
            ${accOptions}
          </select>
        </div>
      </div>
      <div class="acc-setting-actions">
        <button class="btn btn-sm btn-primary" onclick="saveCardSetting('${card.id}')">${t('btn_save')}</button>
        <button class="btn btn-sm btn-danger"  onclick="deleteCard('${card.id}')">${t('btn_delete_card')}</button>
      </div>
    </div>
  `).join('');
  // Set current linkedAccount value for each card
  (state.cards || []).forEach(card => {
    const sel = document.getElementById(`cardLinkedAcc_${card.id}`);
    if (sel) sel.value = card.linkedAccount || '';
  });
}

function deleteCard(id) {
  const card = (state.cards || []).find(c => c.id === id);
  if (!card) return;
  const hasTx   = (state.cardTransactions || []).some(tx => tx.card === id);
  const hasInst = (state.installments     || []).some(i => i.card === id);
  const hasSub  = (state.subscriptions    || []).some(s => s.card === id);
  const extras  = [hasTx && t('linked_card_tx'), hasInst && t('linked_inst'), hasSub && t('linked_subs')]
                    .filter(Boolean).join(', ');
  const msg = extras
    ? tf('confirm_del_card_msg_extras', card.name, extras)
    : tf('confirm_del_card_msg_simple', card.name);
  showConfirm(t('confirm_del_card'), msg, () => {
    state.cards            = state.cards.filter(c => c.id !== id);
    state.cardTransactions = (state.cardTransactions || []).filter(tx => tx.card !== id);
    state.installments     = (state.installments     || []).filter(i => i.card !== id);
    state.subscriptions    = (state.subscriptions    || []).filter(s => s.card !== id);
    saveState();
    renderCardsSettings();
    populateAllDropdowns();
    showToast(t('toast_card_deleted'), 'success');
  });
}

function toggleBankField(accId) {
  const type = document.getElementById(`accType_${accId}`).value;
  const grp  = document.getElementById(`accBankGroup_${accId}`);
  if (grp) grp.style.display = type === 'cash' ? 'none' : '';
}

function saveAccountSetting(id) {
  const acc = state.accounts.find(a => a.id === id);
  if (!acc) return;
  const name = document.getElementById(`accName_${id}`).value.trim();
  const type = document.getElementById(`accType_${id}`).value;
  const bank = type === 'bank' ? (document.getElementById(`accBank_${id}`).value.trim()) : '';
  const bal  = parseFloat(document.getElementById(`accBalance_${id}`).value);
  if (!name) { showToast(t('toast_enter_acc_name'), 'error'); return; }
  if (isNaN(bal)) { showToast(t('toast_invalid_balance'), 'error'); return; }
  acc.name = name; acc.type = type; acc.bank = bank; acc.balance = bal;
  saveState();
  populateAllDropdowns();
  showToast(t('toast_saved'), 'success');
}

function deleteAccount(id) {
  showConfirm(t('confirm_del_acc'), t('confirm_del_acc_msg'), () => {
    state.accounts = state.accounts.filter(a => a.id !== id);
    saveState();
    renderAccountsSettings();
    populateAllDropdowns();
    showToast(t('toast_acc_deleted'), 'success');
  });
}

function addAccount() {
  const newId = 'acc_' + uid();
  state.accounts.push({ id: newId, name: t('account_new'), type: 'bank', bank: '', balance: 0 });
  saveState();
  renderAccountsSettings();
  populateAllDropdowns();
}

function saveCardSetting(id) {
  const card = (state.cards || []).find(c => c.id === id);
  if (!card) return;
  const name      = document.getElementById(`cardName_${id}`).value.trim();
  const bank      = document.getElementById(`cardBank_${id}`).value.trim();
  const linkedAcc = document.getElementById(`cardLinkedAcc_${id}`).value;
  if (!name) { showToast(t('toast_enter_card_name'), 'error'); return; }
  card.name = name; card.bank = bank; card.linkedAccount = linkedAcc;
  saveState();
  populateAllDropdowns();
  showToast(t('toast_saved'), 'success');
}

function addCard() {
  const newId = 'card_' + uid();
  state.cards = state.cards || [];
  state.cards.push({ id: newId, name: t('card_new'), bank: '', linkedAccount: '' });
  saveState();
  renderCardsSettings();
  populateAllDropdowns();
}

function renderCategoriesList() {
  document.getElementById('categoriesList').innerHTML = state.categories.map(c => `
    <span class="tag">
      ${esc(c)}
      <button class="tag-remove" onclick="removeCategory('${esc(c)}')">✕</button>
    </span>
  `).join('');
}

function addCategory() {
  const val = document.getElementById('newCategory').value.trim();
  if (!val) return;
  if (!state.categories.includes(val)) {
    state.categories.push(val);
    saveState();
    renderCategoriesList();
    document.getElementById('newCategory').value = '';
    showToast(t('toast_cat_added'), 'success');
  }
}

function removeCategory(cat) {
  state.categories = state.categories.filter(c => c !== cat);
  saveState();
  renderCategoriesList();
}

function renderIncomeCategoriesList() {
  document.getElementById('incomeCategoriesList').innerHTML = state.incomeCategories.map(c => `
    <span class="tag">
      ${esc(c)}
      <button class="tag-remove" onclick="removeIncomeCategory('${esc(c)}')">✕</button>
    </span>
  `).join('');
}

function addIncomeCategory() {
  const val = document.getElementById('newIncomeCategory').value.trim();
  if (!val) return;
  if (!state.incomeCategories.includes(val)) {
    state.incomeCategories.push(val);
    saveState();
    renderIncomeCategoriesList();
    populateIncomeCategorySelect('incCategory');
    document.getElementById('newIncomeCategory').value = '';
    showToast(t('toast_cat_added'), 'success');
  }
}

function removeIncomeCategory(cat) {
  state.incomeCategories = state.incomeCategories.filter(c => c !== cat);
  saveState();
  renderIncomeCategoriesList();
  populateIncomeCategorySelect('incCategory');
}

// Γεμίζει το txCategory με Εξόδων ή Εσόδων ανάλογα με τον επιλεγμένο τύπο
function populateTxCategorySelect() {
  const type = document.querySelector('input[name="txType"]:checked')?.value || 'expense';
  if (type === 'income') {
    populateIncomeCategorySelect('txCategory');
  } else {
    populateCategorySelect('txCategory');
  }
}

function populateIncomeCategorySelect(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = el.value;
  el.innerHTML = `<option value="">${t('no_cat_option')}</option>` +
    state.incomeCategories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if (current) el.value = current;
}

function openIncomeModal() {
  document.getElementById('incDate').value = today();
  document.getElementById('incAmount').value = '';
  document.getElementById('incDesc').value = '';
  populateIncomeCategorySelect('incCategory');
  openModal('addIncomeModal');
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `familyfin-backup-${today()}.json`;
  a.click();
  showToast(t('toast_export'), 'success');
}

function importData() { document.getElementById('importFile').click(); }

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.accounts && data.transactions !== undefined) {
        state = data;
        saveState();
        renderPage(currentPage());
        showToast(t('toast_import_ok'), 'success');
      } else {
        showToast(t('toast_import_invalid'), 'error');
      }
    } catch { showToast(t('toast_import_error'), 'error'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function confirmReset() {
  showConfirm(t('confirm_reset'), t('confirm_reset_msg'), () => {
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    saveState();
    renderPage(currentPage());
    showToast(t('toast_reset_done'), 'success');
  });
}

// ── UTILITIES ────────────────────────────────────────────────

// Populate all account/card dropdowns from current state
function populateAllDropdowns() {
  // Transaction account dropdown — accounts only (Fix 4)
  const txAcc = document.getElementById('txAccount');
  if (txAcc) {
    const cur = txAcc.value;
    txAcc.innerHTML = state.accounts.map(a =>
      `<option value="${a.id}">${esc(a.name)}</option>`).join('');
    if (cur) txAcc.value = cur;
  }

  // Income account dropdown — accounts only
  const incAcc = document.getElementById('incAccount');
  if (incAcc) {
    const cur = incAcc.value;
    incAcc.innerHTML = state.accounts.map(a =>
      `<option value="${a.id}">${esc(a.name)}</option>`).join('');
    if (cur) incAcc.value = cur;
  }

  // Transaction account filter — accounts only (from Settings)
  const txFil = document.getElementById('txAccountFilter');
  if (txFil) {
    const cur = txFil.value;
    txFil.innerHTML = `<option value="">${t('filter_all_accounts')}</option>` +
      state.accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
    if (cur) txFil.value = cur;
  }

  // Subscription card/account dropdown — cards first, then accounts
  const subCard = document.getElementById('subCard');
  if (subCard) {
    const cur = subCard.value;
    subCard.innerHTML =
      (state.cards || []).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('') +
      state.accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
    if (cur) subCard.value = cur;
  }

  // Installment card dropdown — cards only
  const instCard = document.getElementById('instCard');
  if (instCard) {
    const cur = instCard.value;
    instCard.innerHTML = (state.cards || []).map(c =>
      `<option value="${c.id}">${esc(c.name)}${c.bank ? ' (' + esc(c.bank) + ')' : ''}</option>`).join('');
    if (cur) instCard.value = cur;
  }
}

function populateCategorySelect(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = el.value;
  el.innerHTML = `<option value="">${t('no_cat_option')}</option>` +
    state.categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if (current) el.value = current;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function togglePrivacy() {
  const on  = document.body.classList.toggle('privacy-mode');
  const btn = document.getElementById('privacyToggle');
  btn.textContent = on ? '🙈' : '👁️';
  btn.title       = on ? t('privacy_show') : t('privacy_hide');
}

function currentPage() {
  const active = document.querySelector('.nav-link.active');
  return active ? active.dataset.page : 'dashboard';
}

// ── MODALS ───────────────────────────────────────────────────
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}

// ── TOAST ────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (type ? ' ' + type : '') + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ── CONFIRM DIALOG ───────────────────────────────────────────
function showConfirm(title, msg, onConfirm) {
  document.getElementById('confirmTitle').textContent   = title;
  document.getElementById('confirmMessage').textContent = msg;
  const btn = document.getElementById('confirmBtn');
  btn.onclick = () => { closeModal('confirmModal'); onConfirm(); };
  openModal('confirmModal');
}

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Load persisted state before rendering anything
  state = await loadState();
  // Generate any missing subscription transactions for the current month
  syncSubscriptionTransactions();

  // Set today's date on forms
  document.getElementById('txDate').value   = today();
  document.getElementById('incDate').value  = today();
  document.getElementById('cardTxDate').value = today();

  // Populate all dynamic dropdowns
  populateAllDropdowns();

  // Populate categories
  populateCategorySelect('txCategory');
  populateCategorySelect('cardTxCategory');
  populateCategorySelect('subCategory');
  populateCategorySelect('instCategory');
  populateIncomeCategorySelect('incCategory');

  // Nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      showPage(link.dataset.page);
    });
  });

  // Sidebar toggle
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    const sb = document.getElementById('sidebar');
    const mc = document.getElementById('mainContent');
    sb.classList.toggle('collapsed');
    mc.classList.toggle('expanded');
  });

  // Mobile menu
  document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('mobile-open');
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  // Filter events
  ['txMonthFilter','txAccountFilter','txCategoryFilter'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', filterAndRenderTransactions);
  });
  document.getElementById('txSearch')?.addEventListener('input', filterAndRenderTransactions);
  document.getElementById('incomeMonthFilter')?.addEventListener('change', filterAndRenderIncome);

  // Αλλαγή τύπου στο modal κινήσεων → ανανέωση κατηγοριών
  document.querySelectorAll('input[name="txType"]').forEach(r => {
    r.addEventListener('change', () => {
      const prev = document.getElementById('txCategory').value;
      populateTxCategorySelect();
      // Διατηρεί την επιλογή αν υπάρχει στη νέα λίστα, αλλιώς αδειάζει
      document.getElementById('txCategory').value = prev;
    });
  });

  // Sort headers
  document.querySelectorAll('.data-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (txSort.field === field) txSort.asc = !txSort.asc;
      else { txSort.field = field; txSort.asc = false; }
      filterAndRenderTransactions();
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      openNewTransactionModal();
    }
  });

  // Redraw chart on resize
  window.addEventListener('resize', () => {
    if (currentPage() === 'dashboard') renderDashboard();
  });

  // Apply translations (static elements with data-i18n)
  applyTranslations();

  // Initial render
  showPage('dashboard');
});
