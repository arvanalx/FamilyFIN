/* ============================================================
   Family FiN — Application Logic
   ============================================================ */

'use strict';

let state;        // populated async on DOMContentLoaded
let activeCardId; // tracks selected card on the Πιστωτικές Κάρτες page

const API = '/api/data';

// ── PERSISTENCE / SYNC ───────────────────────────────────────
// Every save carries the server revision it was based on; the server rejects
// stale saves (409) so one device can never silently overwrite another's changes.
const LS_KEY      = 'familyfin_v1';
const LOCAL_ONLY  = location.protocol === 'file:';
let stateRev      = 0;
let saveInFlight  = false;
let savePending   = false;
let pendingReason = '';
let retryTimer    = null;
let mutationSeq   = 0; // bumped on every local change or server reload (guards Undo)

function apiHeaders(reason) {
  const h = { 'Content-Type': 'application/json', 'X-FamilyFin': '1' };
  if (reason) h['X-FamilyFin-Reason'] = reason;
  return h;
}

function persistLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ rev: stateRev, state })); } catch (_) {}
}

function loadLocal() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (parsed?.state) return { state: parsed.state, rev: parsed.rev || 0 };
    if (parsed?.accounts) return { state: parsed, rev: 0 }; // legacy format
  } catch (_) {}
  return null;
}

async function loadState() {
  if (!LOCAL_ONLY) {
    try {
      const res = await fetch(API, { headers: apiHeaders(), cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        stateRev = data.rev || 0;
        return migrateState(data.state?.accounts ? data.state : cloneDefaults());
      }
    } catch (_) { /* server unreachable — fall through to the local copy */ }
    setTimeout(() => { setSyncStatus('error'); showToast(t('sync_offline_load'), 'error'); }, 0);
  }
  const local = loadLocal();
  if (local) { stateRev = local.rev; return migrateState(local.state); }
  return cloneDefaults();
}

function saveState(reason = '') {
  mutationSeq++;
  persistLocal();
  if (LOCAL_ONLY) return;
  savePending = true;
  if (reason) pendingReason = reason;
  flushSave();
}

async function flushSave() {
  if (saveInFlight || !savePending) return;
  saveInFlight  = true;
  savePending   = false;
  const reason  = pendingReason;
  pendingReason = '';
  setSyncStatus('saving');
  let res = null, body = null;
  try {
    res  = await fetch(API, {
      method: 'POST',
      headers: apiHeaders(reason),
      body: JSON.stringify({ rev: stateRev, state }),
    });
    body = await res.json();
  } catch (_) { res = null; }
  saveInFlight = false;

  if (res?.ok) {
    stateRev = body.rev;
    persistLocal();
    setSyncStatus('saved');
  } else if (res?.status === 409) {
    try { localStorage.setItem('familyfin_conflict_backup', JSON.stringify(state)); } catch (_) {}
    savePending = false;
    applyServerState(body.state, body.rev);
    setSyncStatus('saved');
    showToast(t('sync_conflict'), 'error');
    return;
  } else {
    savePending = true;
    if (reason && !pendingReason) pendingReason = reason;
    setSyncStatus('error');
    if (!retryTimer) retryTimer = setTimeout(() => { retryTimer = null; flushSave(); }, 15000);
    return;
  }
  if (savePending) flushSave();
}

function retrySaveNow() {
  clearTimeout(retryTimer);
  retryTimer = null;
  if (savePending) flushSave();
}

function applyServerState(serverState, rev) {
  state    = migrateState(serverState?.accounts ? serverState : cloneDefaults());
  stateRev = rev || 0;
  mutationSeq++;
  persistLocal();
  populateAllDropdowns();
  renderPage(currentPage());
  updateDueBadge();
}

let syncFadeTimer;
function setSyncStatus(status) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  const icons = { saving: '⟳', saved: '✓', error: '⚠' };
  el.textContent = icons[status] || '';
  el.className   = 'sync-status sync-' + status;
  el.title       = t('sync_' + status);
  el.setAttribute('aria-label', el.title);
  clearTimeout(syncFadeTimer);
  if (status === 'saved') syncFadeTimer = setTimeout(() => el.classList.add('sync-idle'), 2500);
}

// ── HELPERS ─────────────────────────────────────────────────
const fmtEuro = n => {
  const abs = Math.abs(n || 0);
  const locale = (typeof getLang === 'function' && getLang() === 'en') ? 'en-US' : 'el-GR';
  const str = abs.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + str + ' €';
};

const readAmount = id => round2(parseFloat(document.getElementById(id).value));

function adjustBalance(accId, delta) {
  const acc = state.accounts.find(a => a.id === accId);
  if (acc) acc.balance = round2((acc.balance || 0) + delta);
}

// ── MONTH PICKER HELPERS (Safari compat — replaces type="month") ──
const MP_MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12'];

// Re-labels every month dropdown in the current language
function localizeMonthPickers() {
  const names = t('months_full');
  document.querySelectorAll('.mp-month').forEach(sel =>
    [...sel.options].forEach((o, i) => { o.textContent = names[i]; }));
}

function getMonthValue(id) {
  const w = document.getElementById(id);
  if (!w) return thisMonth();
  const m = w.querySelector('.mp-month')?.value || '';
  const y = w.querySelector('.mp-year')?.value || '';
  return (y && m) ? `${y}-${m}` : thisMonth();
}

function setMonthValue(id, val) {
  const w = document.getElementById(id);
  if (!w) return;
  const [y, m] = (val || thisMonth()).split('-');
  const ms = w.querySelector('.mp-month');
  const ys = w.querySelector('.mp-year');
  if (ms && m) ms.value = m;
  if (ys && y) ys.value = y;
}

function addMonthPickerListener(id, callback) {
  const w = document.getElementById(id);
  if (!w) return;
  w.querySelectorAll('select').forEach(s => s.addEventListener('change', callback));
}

function buildMonthPickerHTML(id, val, onchangeFn) {
  const [y, m] = (val || thisMonth()).split('-');
  const cy = new Date().getFullYear();
  const names = t('months_full');
  const mOpts = MP_MONTHS.map((v, i) =>
    `<option value="${v}"${v === m ? ' selected' : ''}>${names[i]}</option>`).join('');
  let yOpts = '';
  for (let yr = cy - 5; yr <= cy + 3; yr++)
    yOpts += `<option value="${yr}"${String(yr) === y ? ' selected' : ''}>${yr}</option>`;
  const oc = onchangeFn ? ` onchange="${onchangeFn}"` : '';
  return `<div class="month-picker-wrap" id="${id}">` +
    `<select class="form-control mp-month"${oc}>${mOpts}</select>` +
    `<select class="form-control mp-year"${oc}>${yOpts}</select>` +
    `</div>`;
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);

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
  // Fallback for pre-init or legacy ids
  const legacy = { cash: 'Μετρητά', alpha: 'AlphaBank', winbank: 'WinBank',
                   visa: 'VISA', mastercard: 'MASTERCARD' }[id];
  return legacy || (state ? t('account_deleted') : id);
}

// ── NAVIGATION ───────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');
  const link = document.querySelector(`.nav-link[data-page="${name}"]`);
  if (link) link.classList.add('active');
  document.getElementById('pageTitle').textContent = link?.querySelector('.nav-label')?.textContent || '';
  // Sync bottom nav active state
  document.querySelectorAll('.bottom-nav-item').forEach(item => item.classList.remove('active'));
  const bottomItem = document.querySelector(`.bottom-nav-item[data-page="${name}"]`);
  if (bottomItem) bottomItem.classList.add('active');
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

function renderDashboard() {
  // Auto-calculated future date
  const fd = calcFutureDate(state);
  document.getElementById('dashFutureDate').textContent = t('dash_future_label') + ' ' + fmtDate(fd);

  // Per-account future balance = current balance + net income/expense transactions up to future date
  const futureMap = Object.fromEntries(state.accounts.map(acc => [acc.id, accountForecast(acc, state.transactions, fd)]));

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
  const mtx = state.transactions.filter(t => t.date.startsWith(month) && !t.transferId);
  const income   = mtx.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
  const expenses = mtx.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
  document.getElementById('monthlyIncome').textContent = fmtEuro(income);
  document.getElementById('monthlyExpenses').textContent = fmtEuro(expenses);
  const balEl = document.getElementById('monthlyBalance');
  balEl.textContent = fmtEuro(income - expenses);
  balEl.className = 'stat-value ' + (income - expenses >= 0 ? 'positive' : 'negative');

  // Credit cards summary
  const ccDiv  = document.getElementById('creditCardsSummary');
  const curMon = thisMonth();
  ccDiv.innerHTML = (state.cards || []).map(card => {
    const txAmt   = state.cardTransactions
      .filter(t => t.card === card.id && t.date.startsWith(curMon))
      .reduce((s, t) => s + t.amount, 0);
    const instAmt = state.installments
      .filter(i => i.card === card.id && installmentDue(i, curMon))
      .reduce((s, i) => s + i.monthlyAmount, 0);
    const total     = txAmt + instAmt;
    const logoClass = card.id === 'mastercard' ? 'mc-logo' : 'visa-logo';
    const logoText  = card.id === 'mastercard' ? 'MC' : card.name.substring(0, 4);
    return `
      <div class="credit-card-item">
        <div class="cc-logo ${logoClass}">${esc(logoText)}</div>
        <div class="cc-info">
          <div class="cc-bank">${esc(card.bank)}</div>
        </div>
        <div class="cc-extra">
          <div class="cc-balance">${fmtEuro(total)}</div>
          <div class="cc-inst">${fmtEuro(txAmt)} ${t('dash_tx_pm')}</div>
          ${instAmt > 0 ? `<div class="cc-inst">${fmtEuro(instAmt)} ${t('dash_installments_pm')}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  // Recent transactions (last 6)
  const recent = [...state.transactions]
    .sort((a,b) => b.date.localeCompare(a.date))
    .slice(0, 6);
  renderRecentTransactions(recent);

  // Expense chart — reset to current month on dashboard navigation
  _expChartOffset = 0;
  renderExpChartForOffset();

  // Monthly expenses bar chart — init year selector once, then render
  initMonthlyExpYearSel();
  renderMonthlyExpenseChart();

  // Balance chart (SVG)
  renderBalanceChart(state.accounts.map(a => ({
    label: a.name, now: a.balance || 0, future: futureMap[a.id],
  })));

  // Daily balance line chart
  renderDailyBalanceChart();
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
          <span>${esc(accountLabel(t.account))}</span>
        </div>
      </div>
      <div class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${fmtEuro(t.amount)}</div>
    </div>
  `).join('');
}

// ── TRANSACTIONS ─────────────────────────────────────────────
let txSort = { field: 'date', asc: false };

function renderTransactions() {
  populateCategorySelect('txCategoryFilter');

  if (!document.getElementById('txMonthFilter')?.dataset.init) {
    setMonthValue('txMonthFilter', thisMonth());
    const w = document.getElementById('txMonthFilter');
    if (w) w.dataset.init = '1';
  }

  filterAndRenderTransactions();
}

// Transactions matching the filters on the Κινήσεις page, in the current sort order
function getFilteredTransactions() {
  const month   = getMonthValue('txMonthFilter');
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

  txs.sort((a, b) => {
    let av = a[txSort.field], bv = b[txSort.field];
    if (txSort.field === 'amount') { av = +av; bv = +bv; }
    else { av = String(av||'').toLowerCase(); bv = String(bv||'').toLowerCase(); }
    if (av === bv) return 0;
    return txSort.asc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });
  return { month, account, cat, search, txs };
}

function filterAndRenderTransactions() {
  const { txs } = getFilteredTransactions();

  const income   = txs.filter(t => t.type === 'income'  && !t.transferId).reduce((s,t) => s + t.amount, 0);
  const expenses = txs.filter(t => t.type === 'expense' && !t.transferId).reduce((s,t) => s + t.amount, 0);
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
    <tr onclick="${tx.transferId ? `showTransferActions('${tx.id}')` : `showTransactionActions('${tx.id}')`}" style="cursor:pointer">
      <td>${fmtDate(tx.date)}</td>
      <td>
        <div style="font-weight:600">${esc(tx.desc)}${tx.subId ? ` <svg class="desc-ico" role="img" aria-label="${t('auto_sub_note')}"><title>${t('auto_sub_note')}</title><use href="#i-sub"/></svg>` : ''}${tx.transferId ? ` <svg class="desc-ico" role="img" aria-label="${t('transfer_label')}"><title>${t('transfer_label')}</title><use href="#i-tx"/></svg>` : ''}${tx.settled ? ` <svg class="desc-ico settled" role="img" aria-label="${t('label_settled')}"><title>${t('label_settled')}</title><use href="#i-check"/></svg>` : ''}</div>
        ${tx.notes && !tx.subId && !tx.transferId ? `<div style="font-size:.75rem;color:#64748b">${esc(tx.notes)}</div>` : ''}
      </td>
      <td>${tx.category ? `<span class="badge ${tx.transferId ? 'badge-purple' : 'badge-blue'}">${esc(tx.category)}</span>` : '<span class="muted">—</span>'}</td>
      <td><span class="badge badge-gray">${esc(accountLabel(tx.account))}</span></td>
      <td class="amount-cell ${tx.type === 'income' ? 'positive' : 'negative'}">
        ${tx.type === 'income' ? '+' : '-'}${fmtEuro(tx.amount)}
      </td>
      <td>
        <div class="tx-actions">
          <button class="btn-icon${tx.settled ? ' settled' : ''}" onclick="event.stopPropagation();toggleTransactionSettled('${tx.id}')" title="${t('btn_toggle_settled')}" aria-label="${t('btn_toggle_settled')}">${ico(tx.settled ? 'check' : 'box')}</button>
          <button class="btn-icon" onclick="event.stopPropagation();${tx.transferId ? 'editTransfer' : 'editTransaction'}('${tx.id}')" title="${t('btn_edit')}" aria-label="${t('btn_edit')}">${ico('edit')}</button>
          <button class="btn-icon danger" onclick="event.stopPropagation();deleteTransaction('${tx.id}')" title="${t('btn_delete')}" aria-label="${t('btn_delete')}">${ico('trash')}</button>
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
  document.getElementById('txDeleteBtn').style.display = 'none';
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
  // Show delete button when editing (useful on mobile where Actions col is hidden)
  document.getElementById('txDeleteBtn').style.display = '';
  openModal('addTransactionModal');
}

function deleteCurrentTransaction() {
  const id = document.getElementById('editTransactionId').value;
  if (!id) return;
  closeModal('addTransactionModal');
  deleteTransaction(id);
}

function deleteTransaction(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;

  if (tx.transferId) {
    // Delete both sides and reverse both balances
    deleteWithUndo(() => {
      state.transactions
        .filter(x => x.transferId === tx.transferId)
        .forEach(x => { if (x.settled) adjustBalance(x.account, -txDelta(x)); });
      state.transactions = state.transactions.filter(x => x.transferId !== tx.transferId);
    }, t('toast_transfer_deleted'));
    return;
  }
  deleteWithUndo(() => {
    if (tx.subId && tx.subMonth) state.deletedSubKeys.push(`${tx.subId}|${tx.subMonth}`);
    if (tx.settled) adjustBalance(tx.account, -txDelta(tx));
    state.transactions = state.transactions.filter(x => x.id !== id);
  }, t('toast_tx_deleted'));
}

// ── TRANSFERS ─────────────────────────────────────────────────
function openTransferModal() {
  const opts = state.accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  document.getElementById('transferFrom').innerHTML = opts;
  document.getElementById('transferTo').innerHTML   = opts;
  // Default to second account for "To" if available
  if (state.accounts.length > 1) {
    document.getElementById('transferTo').value = state.accounts[1].id;
  }
  document.getElementById('transferModalTitle').textContent = t('modal_transfer');
  document.getElementById('editTransferId').value    = '';
  document.getElementById('transferDate').value      = today();
  document.getElementById('transferAmount').value   = '';
  document.getElementById('transferNotes').value    = '';
  document.getElementById('transferSettled').checked = false;
  openModal('transferModal');
}

function editTransfer(id) {
  const tx = state.transactions.find(x => x.id === id);
  if (!tx?.transferId) return;
  const pair = state.transactions.filter(x => x.transferId === tx.transferId);
  const out  = pair.find(x => x.type === 'expense');
  const inc  = pair.find(x => x.type === 'income');
  openTransferModal();
  document.getElementById('transferModalTitle').textContent = t('modal_edit_transfer');
  document.getElementById('editTransferId').value    = tx.transferId;
  if (out) document.getElementById('transferFrom').value = out.account;
  if (inc) document.getElementById('transferTo').value   = inc.account;
  document.getElementById('transferDate').value      = tx.date;
  document.getElementById('transferAmount').value    = tx.amount;
  document.getElementById('transferNotes').value     = tx.notes || '';
  document.getElementById('transferSettled').checked = !!tx.settled;
}

function saveTransfer() {
  const editTid = document.getElementById('editTransferId').value;
  const date   = document.getElementById('transferDate').value;
  const amount = readAmount('transferAmount');
  const fromId  = document.getElementById('transferFrom').value;
  const toId    = document.getElementById('transferTo').value;
  const notes   = document.getElementById('transferNotes').value.trim();
  const settled = document.getElementById('transferSettled').checked;

  if (!date || isNaN(amount) || amount <= 0) {
    showToast(t('toast_fill_required'), 'error'); return;
  }
  if (fromId === toId) {
    showToast(t('err_same_account'), 'error'); return;
  }

  const fromAcc = state.accounts.find(a => a.id === fromId);
  const toAcc   = state.accounts.find(a => a.id === toId);
  if (!fromAcc || !toAcc) return;

  // Editing = undo the old pair's balance effect, then rebuild both sides under the same transferId
  if (editTid) {
    state.transactions
      .filter(x => x.transferId === editTid)
      .forEach(x => { if (x.settled) adjustBalance(x.account, -txDelta(x)); });
    state.transactions = state.transactions.filter(x => x.transferId !== editTid);
  }

  const tid = editTid || uid();
  const label = t('transfer_label');

  state.transactions.push({
    id: uid(), type: 'expense', date, amount,
    desc: `${label} → ${toAcc.name}`,
    category: label, account: fromId,
    notes, settled, transferId: tid,
  });
  state.transactions.push({
    id: uid(), type: 'income', date, amount,
    desc: `${label} ← ${fromAcc.name}`,
    category: label, account: toId,
    notes, settled, transferId: tid,
  });

  if (settled) {
    adjustBalance(fromId, -amount);
    adjustBalance(toId, amount);
  }

  saveState();
  closeModal('transferModal');
  showToast(editTid ? t('toast_tx_updated') : t('toast_transfer_saved'), 'success');
  renderPage(currentPage());
  updateDueBadge();
}

function toggleTransactionSettled(id) {
  const tx = state.transactions.find(x => x.id === id);
  if (!tx) return;

  const wasSettled = !!tx.settled;
  const newSettled = !wasSettled;

  if (tx.transferId) {
    // Toggle both sides of the transfer simultaneously
    state.transactions
      .filter(t => t.transferId === tx.transferId)
      .forEach(t => {
        adjustBalance(t.account, wasSettled ? -txDelta(t) : txDelta(t));
        t.settled = newSettled;
      });
  } else {
    if (!state.accounts.some(a => a.id === tx.account)) return;
    adjustBalance(tx.account, wasSettled ? -txDelta(tx) : txDelta(tx));
    tx.settled = newSettled;
  }

  saveState();
  filterAndRenderTransactions();
  updateDueBadge();
}

function saveTransaction() {
  const type    = document.querySelector('input[name="txType"]:checked').value;
  const date    = document.getElementById('txDate').value;
  const amount  = readAmount('txAmount');
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
      if (oldTx.settled) adjustBalance(oldTx.account, -txDelta(oldTx));
      const newTx = { ...oldTx, type, date, amount, desc, category: cat, account, notes, settled };
      state.transactions[idx] = newTx;
      if (settled) adjustBalance(account, txDelta(newTx));
    }
  } else {
    const newTx = { id: uid(), type, date, amount, desc, category: cat, account, notes, settled };
    state.transactions.push(newTx);
    if (settled) adjustBalance(account, txDelta(newTx));
  }

  saveState();
  closeModal('addTransactionModal');
  showToast(editId ? t('toast_tx_updated') : t('toast_tx_saved'), 'success');
  renderPage(currentPage());
  updateDueBadge();
}

// ── INCOME ───────────────────────────────────────────────────
function renderIncome() {
  if (!document.getElementById('incomeMonthFilter')?.dataset.init) {
    setMonthValue('incomeMonthFilter', thisMonth());
    const w = document.getElementById('incomeMonthFilter');
    if (w) w.dataset.init = '1';
  }
  filterAndRenderIncome();
}

function filterAndRenderIncome() {
  const month = getMonthValue('incomeMonthFilter');
  let txs = state.transactions.filter(tx => tx.type === 'income' && !tx.transferId);
  if (month) txs = txs.filter(tx => tx.date.startsWith(month));
  txs.sort((a,b) => b.date.localeCompare(a.date));

  const total = txs.reduce((s, tx) => s + tx.amount, 0);
  document.getElementById('incomeMonthTotal').textContent  = fmtEuro(total);
  document.getElementById('incomeYearEstimate').textContent = fmtEuro(estimateYearlyIncome(state.transactions, month));

  const copyTitle = t('action_copy_next_month');
  document.getElementById('incomeTbody').innerHTML = txs.length
    ? txs.map(tx => `
        <tr onclick="showIncomeActions('${tx.id}')">
          <td>${fmtDate(tx.date)}</td>
          <td>${esc(tx.desc)}</td>
          <td>${tx.category ? `<span class="badge badge-green">${esc(tx.category)}</span>` : '—'}</td>
          <td>${esc(accountLabel(tx.account))}</td>
          <td class="amount-cell positive">+${fmtEuro(tx.amount)}</td>
          <td>
            <button class="btn-icon" title="${copyTitle}" aria-label="${copyTitle}" onclick="event.stopPropagation();copyIncomeToNextMonth('${tx.id}')">${ico('copy')}</button>
            <button class="btn-icon" onclick="event.stopPropagation();editTransaction('${tx.id}')" title="${t('btn_edit')}" aria-label="${t('btn_edit')}">${ico('edit')}</button>
            <button class="btn-icon danger" onclick="event.stopPropagation();deleteTransaction('${tx.id}')" title="${t('btn_delete')}" aria-label="${t('btn_delete')}">${ico('trash')}</button>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="6" class="empty-state">${t('income_none')}</td></tr>`;
}

function copyIncomeToNextMonth(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;

  const newDate = sameDayNextMonth(tx.date);

  state.transactions.push({ ...tx, id: uid(), date: newDate, settled: false });
  saveState();
  showToast(`${t('toast_copied_to')} ${fmtDate(newDate)}`, 'success');
  renderPage(currentPage());
}

// ── Transaction action sheet (mobile row tap — regular rows) ──
let _txActionId = null;

function showTransactionActions(id) {
  const tx = state.transactions.find(x => x.id === id);
  if (!tx) return;
  _txActionId = id;
  document.getElementById('txActionDesc').textContent = tx.desc;
  document.getElementById('txActionSettledBtn').innerHTML = tx.settled ? ico('box') + esc(t('action_unmark_settled')) : ico('check') + esc(t('action_mark_settled'));
  const editBtn = document.getElementById('txActionEditBtn');
  editBtn.style.display = tx.transferId ? 'none' : '';
  document.getElementById('txActionSheet').classList.add('open');
}

function closeTxActionSheet() {
  document.getElementById('txActionSheet').classList.remove('open');
  _txActionId = null;
}

function doTxAction(action) {
  if (!_txActionId) return;
  const id = _txActionId;
  closeTxActionSheet();
  if (action === 'settled') toggleTransactionSettled(id);
  if (action === 'edit')    editTransaction(id);
  if (action === 'delete')  deleteTransaction(id);
}

// ── Transfer action sheet (mobile row tap) ───────────────────
let _transferActionId = null;

function showTransferActions(id) {
  const tx = state.transactions.find(x => x.id === id);
  if (!tx) return;
  _transferActionId = id;
  document.getElementById('transferActionDesc').textContent = tx.desc;
  document.getElementById('transferActionSettledBtn').innerHTML = tx.settled ? ico('box') + esc(t('action_unmark_settled')) : ico('check') + esc(t('action_mark_settled'));
  document.getElementById('transferActionSheet').classList.add('open');
}

function closeTransferActionSheet() {
  document.getElementById('transferActionSheet').classList.remove('open');
  _transferActionId = null;
}

function doTransferAction(action) {
  if (!_transferActionId) return;
  const id = _transferActionId;
  closeTransferActionSheet();
  if (action === 'settled') toggleTransactionSettled(id);
  if (action === 'edit')    editTransfer(id);
  if (action === 'delete')  deleteTransaction(id);
}

// ── Income action sheet (mobile row tap — Έσοδα page) ────────
let _incomeActionId = null;

function showIncomeActions(id) {
  const tx = state.transactions.find(x => x.id === id);
  if (!tx) return;
  _incomeActionId = id;
  document.getElementById('incomeActionDesc').textContent = tx.desc;
  document.getElementById('incomeActionSettledBtn').innerHTML = tx.settled ? ico('box') + esc(t('action_unmark_settled')) : ico('check') + esc(t('action_mark_settled'));
  document.getElementById('incomeActionSheet').classList.add('open');
}

function closeIncomeActionSheet() {
  document.getElementById('incomeActionSheet').classList.remove('open');
  _incomeActionId = null;
}

function doIncomeAction(action) {
  if (!_incomeActionId) return;
  const id = _incomeActionId;
  closeIncomeActionSheet();
  if (action === 'settled') toggleTransactionSettled(id);
  if (action === 'copy')    copyIncomeToNextMonth(id);
  if (action === 'edit')    editTransaction(id);
  if (action === 'delete')  deleteTransaction(id);
}

// ── Card transaction action sheet (mobile row tap) ────────────
let _cardTxActionId = null;

function showCardTxActions(id) {
  const tx = state.cardTransactions.find(x => x.id === id);
  if (!tx) return;
  _cardTxActionId = id;
  document.getElementById('cardTxActionDesc').textContent = tx.desc;
  document.getElementById('cardTxActionSheet').classList.add('open');
}

function closeCardTxActionSheet() {
  document.getElementById('cardTxActionSheet').classList.remove('open');
  _cardTxActionId = null;
}

function doCardTxAction(action) {
  if (!_cardTxActionId) return;
  const id = _cardTxActionId;
  closeCardTxActionSheet();
  if (action === 'delete') deleteCardTx(id);
  else if (action === 'edit') editCardTransaction(id);
}

function saveIncome() {
  const date    = document.getElementById('incDate').value;
  const amount  = readAmount('incAmount');
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
              onclick="selectCard('${c.id}')">${ico('card')}${esc(c.name)}</button>`;
  }).join('');

  renderCard(activeCardId);
}

function selectCard(cardId) {
  activeCardId = cardId;
  renderCardsPage();
}

function renderCard(cardId) {
  const cardData = (state.cards || []).find(c => c.id === cardId);
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
          <div class="cc-stat-value" id="ccStatBalance">—</div>
          <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="openCardPaymentModal('${cardId}')">
            ${ico('card')}${t('btn_card_payment')}
          </button>
        </div>
        <div class="cc-stat">
          <div class="cc-stat-label">${t('card_monthly_inst')}</div>
          <div class="cc-stat-value" id="ccStatInst">—</div>
        </div>
        <div class="cc-stat">
          <div class="cc-stat-label">${t('card_monthly_tx')}</div>
          <div class="cc-stat-value" id="ccStatTx">—</div>
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
        <div style="display:flex;gap:8px;align-items:center">
          ${buildMonthPickerHTML('cardTxMonthFilter', thisMonth(), `filterAndRenderCardTransactions('${cardId}')`)}
          <button class="btn btn-sm btn-primary" onclick="openCardTransactionModal('${cardId}')">${t('btn_add_card_tx')}</button>
        </div>
      </div>
      <table class="data-table" id="cardTransactionsTable">
        <thead>
          <tr><th>${t('col_date')}</th><th>${t('col_desc')}</th><th>${t('col_category')}</th><th>${t('col_amount')}</th><th>${t('col_actions')}</th></tr>
        </thead>
        <tbody id="cardTransactionsTbody"></tbody>
      </table>
    </div>
  `;

  const inst = state.installments.filter(i => i.card === cardId && i.active);
  renderInstallmentCards('cardInstallmentsList', inst);
  filterAndRenderCardTransactions(cardId);
}

function updateCardSummary(cardId) {
  const month     = getMonthValue('cardTxMonthFilter');
  const inst      = state.installments.filter(i => i.card === cardId && installmentDue(i, month));
  const totalInst = inst.reduce((s, i) => s + i.monthlyAmount, 0);
  const monthlyTx = state.cardTransactions
    .filter(t => t.card === cardId && t.date.startsWith(month))
    .reduce((s, t) => s + t.amount, 0);
  const totalBalance = monthlyTx + totalInst;

  const elBal  = document.getElementById('ccStatBalance');
  const elInst = document.getElementById('ccStatInst');
  const elTx   = document.getElementById('ccStatTx');
  if (elBal)  elBal.textContent  = fmtEuro(totalBalance);
  if (elInst) elInst.textContent = fmtEuro(totalInst);
  if (elTx)   elTx.textContent   = fmtEuro(monthlyTx);
}

function filterAndRenderCardTransactions(cardId) {
  const month = getMonthValue('cardTxMonthFilter');
  const txs = state.cardTransactions
    .filter(t => t.card === cardId && t.date.startsWith(month));
  renderCardTransactions('cardTransactionsTbody', txs);
  updateCardSummary(cardId);
}

function openCardPaymentModal(cardId) {
  const cardData     = (state.cards || []).find(c => c.id === cardId);
  const month        = getMonthValue('cardTxMonthFilter');
  const inst         = state.installments.filter(i => i.card === cardId && installmentDue(i, month));
  const totalInst    = inst.reduce((s, i) => s + i.monthlyAmount, 0);
  const monthlyTx    = state.cardTransactions.filter(t => t.card === cardId && t.date.startsWith(month)).reduce((s, t) => s + t.amount, 0);
  const totalBalance = monthlyTx + totalInst;
  const name         = cardData?.name || cardId.toUpperCase();

  document.getElementById('transactionModalTitle').textContent = t('modal_card_payment');
  document.getElementById('editTransactionId').value = '';
  document.querySelector('input[name="txType"][value="expense"]').checked = true;
  document.getElementById('txDate').value    = today();
  document.getElementById('txAmount').value  = totalBalance.toFixed(2);
  document.getElementById('txDesc').value    = t('card_payment_prefix') + ' ' + name;
  document.getElementById('txNotes').value   = '';
  document.getElementById('txSettled').checked = false;
  document.getElementById('txDeleteBtn').style.display = 'none';
  populateTxCategorySelect();
  const catEl = document.getElementById('txCategory');
  const match = Array.from(catEl.options).find(o =>
    isCardPaymentCat(o.value)
  );
  if (match) catEl.value = match.value;
  openModal('addTransactionModal');
}

function renderInstallmentCards(containerId, list) {
  const el = document.getElementById(containerId);
  if (!list.length) { el.innerHTML = `<div class="empty-state">${t('inst_none')}</div>`; return; }

  el.innerHTML = list.map(i => {
    const done = i.totalCount && i.paidCount >= i.totalCount;
    const pct = i.totalCount ? Math.min(100, Math.round((i.paidCount / i.totalCount) * 100)) : 0;
    const remaining = i.totalCount ? Math.max(0, i.totalCount - i.paidCount) : '?';
    return `
    <div class="installment-card${done ? ' inst-completed' : ''}">
      <div class="inst-header">
        <div>
          <div class="inst-name">${esc(i.desc)}</div>
          ${i.store ? `<div class="inst-store">${esc(i.store)}</div>` : ''}
        </div>
        <span class="inst-badge ${i.card}">${i.card.toUpperCase()}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill${done ? ' progress-done' : ''}" style="width:${pct}%"></div>
      </div>
      <div class="inst-footer">
        <span>${i.paidCount}/${i.totalCount || '?'} ${t('inst_installments')} (${pct}%)</span>
        <span>${remaining} ${t('inst_remaining')}</span>
        ${!done && i.monthlyAmount ? `<span><strong class="pv">${fmtEuro(i.monthlyAmount)}</strong>${t('per_month')}</span>` : ''}
      </div>
      <div class="inst-actions">
        ${!done ? `<button class="btn btn-sm btn-secondary" onclick="payInstallment('${i.id}')">${t('btn_pay_inst')}</button>` : ''}
        <button class="btn btn-sm btn-secondary" onclick="editInstallment('${i.id}')" title="${t('btn_edit')}" aria-label="${t('btn_edit')}">${ico('edit')}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteInstallment('${i.id}')" title="${t('btn_delete')}" aria-label="${t('btn_delete')}">${ico('trash')}</button>
      </div>
    </div>`;
  }).join('');
}

function renderCardTransactions(tbodyId, txs) {
  const tbody = document.getElementById(tbodyId);
  txs.sort((a,b) => b.date.localeCompare(a.date));
  tbody.innerHTML = txs.length
    ? txs.map(tx => `
        <tr onclick="showCardTxActions('${tx.id}')" style="cursor:pointer">
          <td>${fmtDate(tx.date)}</td>
          <td>${esc(tx.desc)}${tx.subId ? ` <svg class="desc-ico" role="img" aria-label="${t('auto_sub_note')}"><title>${t('auto_sub_note')}</title><use href="#i-sub"/></svg>` : ''}</td>
          <td>${tx.category ? `<span class="badge badge-blue">${esc(tx.category)}</span>` : '—'}</td>
          <td class="amount-cell negative">-${fmtEuro(tx.amount)}</td>
          <td style="white-space:nowrap">
            <button class="btn-icon" onclick="event.stopPropagation();editCardTransaction('${tx.id}')" title="${t('btn_edit')}" aria-label="${t('btn_edit')}">${ico('edit')}</button>
            <button class="btn-icon danger" onclick="event.stopPropagation();deleteCardTx('${tx.id}')" title="${t('btn_delete')}" aria-label="${t('btn_delete')}">${ico('trash')}</button>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="5" class="empty-state">${t('tx_empty')}</td></tr>`;
}

// ── INSTALLMENTS PAGE ────────────────────────────────────────
function renderInstallments() {
  const active = state.installments.filter(i => i.active);
  const incomplete = active.filter(i => !i.totalCount || i.paidCount < i.totalCount);
  const monthly = active.filter(i => installmentDue(i)).reduce((s,i)=>s+i.monthlyAmount,0);
  const totalRem = incomplete.filter(i=>i.monthlyAmount && i.totalCount)
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
  setMonthValue('instStart', thisMonth());
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
  setMonthValue('instStart', i.startMonth || thisMonth());
  document.getElementById('instCard').value  = i.card;
  populateCategorySelect('instCategory');
  document.getElementById('instCategory').value = i.category || '';
  openModal('addInstallmentModal');
}

function saveInstallment() {
  const desc     = document.getElementById('instDesc').value.trim();
  const total    = readAmount('instTotal') || null;
  const monthly  = readAmount('instMonthly') || null;
  const paid     = parseInt(document.getElementById('instPaid').value) || 0;
  const totalCount = parseInt(document.getElementById('instTotalCount').value) || null;
  const card     = document.getElementById('instCard').value;
  const store    = document.getElementById('instStore').value.trim();
  const start    = getMonthValue('instStart');
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
  if (i.totalCount && i.paidCount >= i.totalCount) return; // already complete
  i.paidCount = Math.min(i.paidCount + 1, i.totalCount || Infinity);
  saveState();
  renderPage(currentPage());
  showToast(t('toast_inst_paid'), 'success');
}

function deleteInstallment(id) {
  deleteWithUndo(() => {
    state.installments = state.installments.filter(i => i.id !== id);
  }, t('toast_inst_deleted'));
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
    if (sub.paused) continue; // skip paused subscriptions

    const isCard = sub.card === 'visa' || sub.card === 'mastercard' ||
                   (state.cards || []).some(c => c.id === sub.card);
    const months = subscriptionBillingMonths(sub, current);

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

// Manually generates the next-month transaction for a single subscription.
// Bypasses the deletedSubKeys blacklist (intentional user action).
function generateNextMonthForSub(id) {
  const sub = state.subscriptions.find(s => s.id === id);
  if (!sub) return;

  const month  = nextMonth();
  const isCard = sub.card === 'visa' || sub.card === 'mastercard' ||
                 (state.cards || []).some(c => c.id === sub.card);

  const exists = isCard
    ? state.cardTransactions.some(t => t.subId === sub.id && t.subMonth === month)
    : state.transactions.some(t => t.subId === sub.id && t.subMonth === month);

  if (exists) {
    showToast(t('toast_sub_next_exists'), 'info');
    return;
  }

  // Remove from blacklist so future syncs don't skip it
  if (state.deletedSubKeys) {
    state.deletedSubKeys = state.deletedSubKeys.filter(k => k !== `${sub.id}|${month}`);
  }

  const subCat = sub.category || 'Συνδρομές';
  const day    = Math.min(sub.day || 1, daysInMonth(month));
  const date   = `${month}-${String(day).padStart(2,'0')}`;

  if (isCard) {
    state.cardTransactions.push({
      id: uid(), card: sub.card, date, amount: sub.amount,
      desc: sub.name, category: subCat,
      subId: sub.id, subMonth: month,
    });
  } else {
    state.transactions.push({
      id: uid(), type: 'expense', date, amount: sub.amount,
      desc: sub.name, category: subCat, account: sub.card,
      notes: t('auto_sub_note'), subId: sub.id, subMonth: month,
    });
  }

  saveState();
  showToast(t('toast_sub_next_created'), 'success');
}

// ── SUBSCRIPTIONS ────────────────────────────────────────────
function renderSubscriptions() {
  const subs    = state.subscriptions;
  const { monthly, yearly } = subscriptionCosts(subs);
  document.getElementById('subMonthly').textContent = fmtEuro(monthly);
  document.getElementById('subYearly').textContent  = fmtEuro(yearly);

  const grid = document.getElementById('subscriptionsGrid');
  if (!subs.length) { grid.innerHTML = `<div class="empty-state">${t('sub_none')}</div>`; return; }

  grid.innerHTML = subs.map(s => `
    <div class="sub-card${s.paused ? ' sub-paused' : ''}" onclick="editSubscription('${s.id}')">
      <button class="sub-delete" onclick="event.stopPropagation();deleteSubscription('${s.id}')" title="${t('btn_delete')}" aria-label="${t('btn_delete')}">✕</button>
      <button class="sub-gen-next" onclick="event.stopPropagation();generateNextMonthForSub('${s.id}')" title="${t('btn_gen_next_month')}" aria-label="${t('btn_gen_next_month')}">${ico('inst')}+1</button>
      <div class="sub-icon">${s.icon || '📱'}</div>
      <div class="sub-name">${esc(s.name)}</div>
      <div class="sub-amount">${fmtEuro(s.amount)}</div>
      <div class="sub-freq">${s.frequency === 'monthly' ? t('freq_monthly') : t('freq_yearly')}</div>
      <div class="sub-card-type">${esc(accountLabel(s.card))}</div>
      ${s.paused ? `<div class="sub-paused-badge">${t('sub_paused_badge')}</div>` : ''}
    </div>
  `).join('');
}

function toggleSubBillingMonth() {
  document.getElementById('subBillingMonthGroup').hidden =
    document.getElementById('subFrequency').value !== 'yearly';
}

function openSubscriptionModal() {
  document.getElementById('subscriptionModalTitle').textContent = t('modal_new_sub');
  document.getElementById('editSubscriptionId').value = '';
  document.getElementById('subName').value      = '';
  document.getElementById('subAmount').value    = '';
  document.getElementById('subFrequency').value = 'monthly';
  document.getElementById('subDay').value       = '';
  document.getElementById('subIcon').value      = '';
  document.getElementById('subPaused').checked  = false;
  document.getElementById('subBillingMonth').value = thisMonth().split('-')[1];
  toggleSubBillingMonth();
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
  document.getElementById('subPaused').checked  = !!s.paused;
  document.getElementById('subBillingMonth').value = s.billingMonth || (s.startMonth || thisMonth()).split('-')[1];
  toggleSubBillingMonth();
  populateCategorySelect('subCategory');
  document.getElementById('subCategory').value  = s.category || '';
  openModal('addSubscriptionModal');
}

function saveSubscription() {
  const name     = document.getElementById('subName').value.trim();
  const amount   = readAmount('subAmount');
  const freq     = document.getElementById('subFrequency').value;
  const card     = document.getElementById('subCard').value;
  const day      = parseInt(document.getElementById('subDay').value) || 1;
  const icon     = document.getElementById('subIcon').value.trim() || '📱';
  const category = document.getElementById('subCategory').value;
  const paused   = document.getElementById('subPaused').checked;
  const editId   = document.getElementById('editSubscriptionId').value;

  if (!name || isNaN(amount)) { showToast(t('toast_fill_required'), 'error'); return; }

  const billingMonth = freq === 'yearly' ? document.getElementById('subBillingMonth').value : undefined;
  const obj = { name, amount, frequency: freq, card, day, icon, category, paused, billingMonth };
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
    // Detach auto-generated transactions: remove subId/subMonth so they
    // become regular independent transactions and are no longer re-generated.
    state.cardTransactions.forEach(tx => {
      if (tx.subId === id) { delete tx.subId; delete tx.subMonth; }
    });
    state.transactions.forEach(tx => {
      if (tx.subId === id) { delete tx.subId; delete tx.subMonth; }
    });
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
  document.getElementById('editCardTransactionId').value = '';
  document.getElementById('cardTxModalTitle').textContent = t('modal_card_tx') + ' ' + card.toUpperCase();
  document.getElementById('cardTxDate').value = today();
  document.getElementById('cardTxAmount').value = '';
  document.getElementById('cardTxDesc').value = '';
  populateCategorySelect('cardTxCategory');
  openModal('cardTransactionModal');
}

function editCardTransaction(id) {
  const tx = state.cardTransactions.find(x => x.id === id);
  if (!tx) return;
  document.getElementById('cardTxCard').value = tx.card;
  document.getElementById('editCardTransactionId').value = id;
  document.getElementById('cardTxModalTitle').textContent = t('modal_edit_card_tx');
  document.getElementById('cardTxDate').value = tx.date;
  document.getElementById('cardTxAmount').value = tx.amount;
  document.getElementById('cardTxDesc').value = tx.desc;
  populateCategorySelect('cardTxCategory');
  document.getElementById('cardTxCategory').value = tx.category || '';
  openModal('cardTransactionModal');
}

function saveCardTransaction() {
  const card    = document.getElementById('cardTxCard').value;
  const editId  = document.getElementById('editCardTransactionId').value;
  const date    = document.getElementById('cardTxDate').value;
  const amount  = readAmount('cardTxAmount');
  const desc    = document.getElementById('cardTxDesc').value.trim();
  const cat     = document.getElementById('cardTxCategory').value;

  if (!date || !desc || isNaN(amount) || amount <= 0) { showToast(t('toast_fill_fields'), 'error'); return; }

  if (editId) {
    const idx = state.cardTransactions.findIndex(x => x.id === editId);
    if (idx !== -1) {
      state.cardTransactions[idx] = { ...state.cardTransactions[idx], date, amount, desc, category: cat };
    }
    showToast(t('toast_tx_updated'), 'success');
  } else {
    state.cardTransactions.push({ id: uid(), card, date, amount, desc, category: cat });
    showToast(t('toast_tx_saved'), 'success');
  }
  saveState();
  closeModal('cardTransactionModal');
  renderPage(currentPage());
}

function deleteCardTx(id) {
  const tx = state.cardTransactions.find(x => x.id === id);
  if (!tx) return;
  deleteWithUndo(() => {
    if (tx.subId && tx.subMonth) state.deletedSubKeys.push(`${tx.subId}|${tx.subMonth}`);
    state.cardTransactions = state.cardTransactions.filter(x => x.id !== id);
  }, t('toast_card_tx_deleted'));
}

// ── SETTINGS ─────────────────────────────────────────────────
function renderSettings() {
  renderAccountsSettings();
  renderCardsSettings();
  renderCategoriesList();
  renderIncomeCategoriesList();
  renderNotificationSettings();
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
          <input type="text" id="accBank_${acc.id}" class="form-control" value="${esc(acc.bank || '')}" placeholder="${t('placeholder_bank')}">
        </div>
        <div class="form-group">
          <label>${t('acc_label_balance')}</label>
          <input type="number" id="accBalance_${acc.id}" class="form-control" step="0.01" value="${acc.balance || 0}">
        </div>
      </div>
      <div class="acc-setting-actions">
        <button class="btn btn-sm btn-primary" onclick="saveAccountSetting('${acc.id}')">${t('btn_save')}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteAccount('${acc.id}')" title="${t('btn_delete')}" aria-label="${t('btn_delete')}">${ico('trash')}</button>
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
          <input type="text" id="cardBank_${card.id}" class="form-control" value="${esc(card.bank || '')}" placeholder="${t('placeholder_bank')}">
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
        <button class="btn btn-sm btn-danger"  onclick="deleteCard('${card.id}')">${ico('trash')}${t('btn_delete_card')}</button>
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
  const bal  = readAmount(`accBalance_${id}`);
  if (!name) { showToast(t('toast_enter_acc_name'), 'error'); return; }
  if (isNaN(bal)) { showToast(t('toast_invalid_balance'), 'error'); return; }
  acc.name = name; acc.type = type; acc.bank = bank; acc.balance = bal;
  saveState();
  populateAllDropdowns();
  showToast(t('toast_saved'), 'success');
}

function deleteAccount(id) {
  const linked = state.transactions.filter(tx => tx.account === id).length
               + state.subscriptions.filter(s => s.card === id).length;
  const msg = linked ? tf('confirm_del_acc_msg_linked', linked) : t('confirm_del_acc_msg');
  showConfirm(t('confirm_del_acc'), msg, () => {
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
      <button class="tag-remove" onclick="removeCategory(${esc(JSON.stringify(c))})">✕</button>
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
      <button class="tag-remove" onclick="removeIncomeCategory(${esc(JSON.stringify(c))})">✕</button>
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
      if (!data || !Array.isArray(data.transactions) || !data.accounts) {
        showToast(t('toast_import_invalid'), 'error');
        return;
      }
      showConfirm(t('confirm_import'), t('confirm_import_msg'), () => {
        state = migrateState({ ...cloneDefaults(), ...data });
        saveState('import');
        populateAllDropdowns();
        renderPage(currentPage());
        updateDueBadge();
        showToast(t('toast_import_ok'), 'success');
      });
    } catch { showToast(t('toast_import_error'), 'error'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function confirmReset() {
  showConfirm(t('confirm_reset'), t('confirm_reset_msg'), () => {
    state = cloneDefaults();
    saveState('reset');
    populateAllDropdowns();
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

// ── THEME ────────────────────────────────────────────────────
// 'auto' follows the OS; the choice is stored per device. index.html applies it before first paint.
const THEME_KEY = 'familyfin_theme';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function getThemePref() {
  try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (_) { return 'auto'; }
}

function setThemePref(pref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch (_) {}
  applyTheme();
}

// Visual style (navy / sage / graphite) — independent of light/dark, also stored per device
const STYLE_KEY = 'familyfin_style';
const STYLES    = ['navy', 'sage', 'graphite'];

function getStylePref() {
  try {
    const s = localStorage.getItem(STYLE_KEY);
    return STYLES.includes(s) ? s : 'navy';
  } catch (_) { return 'navy'; }
}

function setStylePref(style) {
  try { localStorage.setItem(STYLE_KEY, style); } catch (_) {}
  applyTheme();
}

function applyTheme(rerender = true) {
  const pref  = getThemePref();
  const style = getStylePref();
  const dark  = pref === 'dark' || (pref === 'auto' && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.style = style;
  document.querySelectorAll('[data-theme-pref]').forEach(b => {
    const on = b.dataset.themePref === pref;
    b.classList.toggle('chart-tog-active', on);
    b.setAttribute('aria-pressed', on);
  });
  document.querySelectorAll('[data-style-pref]').forEach(b => b.setAttribute('aria-pressed', b.dataset.stylePref === style));
  refreshChartColors();
  if (rerender && currentPage() === 'dashboard') renderDashboard();
}

function ico(name) {
  return `<svg class="btn-ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function togglePrivacy() {
  const on  = document.body.classList.toggle('privacy-mode');
  const btn = document.getElementById('privacyToggle');
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.title       = on ? t('privacy_show') : t('privacy_hide');
  btn.setAttribute('aria-label', btn.title);
}

function currentPage() {
  const active = document.querySelector('.nav-link.active');
  return active ? active.dataset.page : 'dashboard';
}

// ── MODALS ───────────────────────────────────────────────────
// Keyboard users land in the first field and return to the button that opened the dialog
const modalOpeners = {};
function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  modalOpeners[id] = document.activeElement;
  m.classList.add('open');
  const first = m.querySelector('.modal-body input:not([type=hidden]):not([type=radio]):not([type=checkbox]), .modal-body select, .modal-body textarea, .modal-footer .btn-primary');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 50);
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (!m?.classList.contains('open')) return;
  m.classList.remove('open');
  modalOpeners[id]?.focus?.({ preventScroll: true });
  delete modalOpeners[id];
}

// ── TOAST ────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '', action = null) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  if (action) {
    const btn = document.createElement('button');
    btn.className   = 'toast-action';
    btn.textContent = action.label;
    btn.onclick     = () => { el.classList.remove('show'); action.onClick(); };
    el.append(btn);
  }
  el.className = 'toast' + (type ? ' ' + type : '') + (action ? ' has-action' : '') + ' show';
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 6000 : 2800);
}

// Deletes immediately and offers "Undo" in the toast instead of a confirm dialog.
// Undo restores the pre-delete snapshot, but only if nothing else changed since.
function deleteWithUndo(mutate, msg) {
  const snapshot = JSON.stringify(state);
  mutate();
  saveState();
  const seq = mutationSeq;
  renderPage(currentPage());
  updateDueBadge();
  showToast(msg, 'success', {
    label: t('btn_undo'),
    onClick: () => {
      if (mutationSeq !== seq) { showToast(t('undo_unavailable'), 'error'); return; }
      state = migrateState(JSON.parse(snapshot));
      saveState();
      populateAllDropdowns();
      renderPage(currentPage());
      updateDueBadge();
      showToast(t('toast_undone'), 'success');
    },
  });
}

// ── NOTIFICATIONS ────────────────────────────────────────────
function getDueTransactions() {
  const todayStr = today();
  return state.transactions.filter(tx =>
    tx.type === 'expense' &&
    !tx.settled &&
    !tx.transferId &&
    tx.date <= todayStr
  );
}

function updateDueBadge() {
  const badge = document.getElementById('dueBadge');
  if (!badge) return;
  const due = getDueTransactions();
  if (due.length > 0) {
    badge.textContent = due.length > 99 ? '99+' : due.length;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

function checkDailyNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const key = 'familyfin_notified_date';
  if (localStorage.getItem(key) === today()) return;
  const due = getDueTransactions();
  if (due.length === 0) return;
  localStorage.setItem(key, today());
  const body = due.length === 1
    ? t('notif_body_single')
    : t('notif_body_many').replace('{n}', due.length);
  new Notification(t('notif_title'), { body, icon: 'icon-192.png', badge: 'icon-192.png' });
}

function showNotificationBanner() {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'default') return;
  if (localStorage.getItem('familyfin_notif_banner_dismissed')) return;
  document.getElementById('notifBanner')?.classList.add('visible');
}

function dismissNotificationBanner() {
  localStorage.setItem('familyfin_notif_banner_dismissed', '1');
  document.getElementById('notifBanner')?.classList.remove('visible');
}

async function enableNotifications() {
  if (!('Notification' in window)) return;
  const perm = await Notification.requestPermission();
  dismissNotificationBanner();
  if (perm === 'granted') checkDailyNotifications();
  if (currentPage() === 'settings') renderNotificationSettings();
}

function testNotification() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(t('notif_test_title'), { body: t('notif_test_body'), icon: 'icon-192.png' });
}

function renderNotificationSettings() {
  const container = document.getElementById('notifSettingsContainer');
  if (!container) return;
  const supported = 'Notification' in window;
  const perm = supported ? Notification.permission : 'unsupported';
  let statusText, statusClass;
  if (!supported)        { statusText = '—';                           statusClass = ''; }
  else if (perm === 'granted') { statusText = t('notif_status_granted'); statusClass = 'badge-green'; }
  else if (perm === 'denied')  { statusText = t('notif_status_denied');  statusClass = 'badge-red'; }
  else                         { statusText = t('notif_status_default'); statusClass = 'badge-yellow'; }

  container.innerHTML = `
    <div class="notif-settings-row">
      <span>${t('notif_status_label')}</span>
      <span class="badge ${statusClass}">${statusText}</span>
    </div>
    ${perm === 'default' && supported ? `
    <div class="notif-settings-row" style="margin-top:8px">
      <button class="btn btn-primary btn-sm" onclick="enableNotifications()">${t('notif_enable_btn')}</button>
    </div>` : ''}
    ${perm === 'denied' ? `
    <div style="margin-top:10px;font-size:.83rem;color:var(--text-muted);line-height:1.5">
      ${t('notif_denied_hint')}
    </div>` : ''}
    ${perm === 'granted' ? `
    <div class="notif-settings-row" style="margin-top:8px">
      <button class="btn btn-secondary btn-sm" onclick="testNotification()">${t('notif_test_btn')}</button>
    </div>` : ''}
  `;
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
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // Filter events
  addMonthPickerListener('txMonthFilter', filterAndRenderTransactions);
  ['txAccountFilter','txCategoryFilter'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', filterAndRenderTransactions);
  });
  document.getElementById('txSearch')?.addEventListener('input', filterAndRenderTransactions);
  addMonthPickerListener('incomeMonthFilter', filterAndRenderIncome);
  document.getElementById('subFrequency').addEventListener('change', toggleSubBillingMonth);

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
      document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id));
      document.querySelectorAll('.action-sheet-overlay.open').forEach(m => m.classList.remove('open'));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      openNewTransactionModal();
    }
  });

  // Redraw charts on resize (debounced) and when the OS switches light/dark theme
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (currentPage() === 'dashboard') renderDashboard(); }, 150);
  });
  applyTheme(false);
  darkQuery.addEventListener('change', () => { if (getThemePref() === 'auto') applyTheme(); });

  // Bottom nav links
  document.querySelectorAll('.bottom-nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      showPage(item.dataset.page);
    });
  });

  // Swipe gesture: swipe right from left edge → open sidebar; swipe left → close
  let swipeStartX = 0, swipeStartY = 0, swipeStartTime = 0;
  document.addEventListener('touchstart', e => {
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
    swipeStartTime = Date.now();
  }, { passive: true });

  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - swipeStartX;
    const dy = e.changedTouches[0].clientY - swipeStartY;
    const dt = Date.now() - swipeStartTime;
    const sidebar = document.getElementById('sidebar');
    // Only on mobile, fast swipe, more horizontal than vertical
    if (window.innerWidth > 768) return;
    if (dt > 400) return;
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (dx > 50 && swipeStartX < 30) {
      // Swipe right from left edge → open sidebar
      sidebar.classList.add('mobile-open');
    } else if (dx < -50 && sidebar.classList.contains('mobile-open')) {
      // Swipe left → close sidebar
      sidebar.classList.remove('mobile-open');
    }
  }, { passive: true });

  // PWA install prompt (Android/Chrome)
  window.installPWA = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById('pwaInstallBar')?.classList.remove('visible');
  };
  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const bar = document.getElementById('pwaInstallBar');
    if (bar) bar.classList.add('visible');
  });

  // Register Service Worker
  if ('serviceWorker' in navigator && !LOCAL_ONLY) {
    // Reload once when an updated worker takes over, so a new version appears without Cmd+Shift+R
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded || savePending || saveInFlight) return;
      reloaded = true;
      location.reload();
    });
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  window.addEventListener('online', retrySaveNow);

  // Apply translations (static elements with data-i18n)
  applyTranslations();

  // Notifications: show banner if permission not yet decided, fire daily check if granted
  showNotificationBanner();
  checkDailyNotifications();
  updateDueBadge();

  // Initial render
  showPage('dashboard');
});
