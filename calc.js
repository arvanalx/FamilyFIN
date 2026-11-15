/* ============================================================
   Family FiN — Data model & calculations
   Pure functions only (no DOM, no global app state), so they can be
   unit-tested with `node --test`. Loaded before the other scripts.
   ============================================================ */

'use strict';

// ── DATA MODEL ───────────────────────────────────────────────
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

const cloneDefaults = () => JSON.parse(JSON.stringify(DEFAULT_STATE));

function migrateState(data) {
  // Migration: accounts object → array (old format)
  if (data.accounts && !Array.isArray(data.accounts)) {
    data.accounts = [
      { id: 'cash',    name: 'Μετρητά',   type: 'cash', bank: '',           balance: data.accounts.cash    ?? 0 },
      { id: 'alpha',   name: 'AlphaBank', type: 'bank', bank: 'Alpha Bank', balance: data.accounts.alpha   ?? 0 },
      { id: 'winbank', name: 'WinBank',   type: 'bank', bank: 'WinBank',    balance: data.accounts.winbank ?? 0 },
    ];
  }
  // Migration: remove legacy futureDate field
  delete data.futureDate;
  // Migration: convert old income category slugs → Greek labels
  const slugMap = {
    salary:     'Μισθός',
    freelance:  'Ελεύθερος Επαγγελματίας',
    pension:    'Σύνταξη',
    rent:       'Ενοίκιο (είσπραξη)',
    other:      'Άλλο',
  };
  if (Array.isArray(data.transactions)) {
    data.transactions.forEach(t => {
      if (t.type === 'income' && slugMap[t.category]) {
        t.category = slugMap[t.category];
      }
    });
  }
  // Ensure every top-level collection exists (partial imports / older backups)
  for (const [key, def] of Object.entries(DEFAULT_STATE)) {
    if (!Array.isArray(data[key])) data[key] = JSON.parse(JSON.stringify(def));
  }
  // Migration: move sub transactions that landed in state.transactions but belong to a card
  const cardIds = new Set(data.cards.map(c => c.id));
  cardIds.add('visa'); cardIds.add('mastercard');
  const misplaced = data.transactions.filter(t => t.subId && cardIds.has(t.account));
  if (misplaced.length > 0) {
    const misplacedIds = new Set(misplaced.map(t => t.id));
    misplaced.forEach(t => {
      if (!data.cardTransactions.some(ct => ct.subId === t.subId && ct.subMonth === t.subMonth)) {
        data.cardTransactions.push({
          id: t.id, card: t.account, date: t.date, amount: t.amount,
          desc: t.desc, category: t.category,
          subId: t.subId, subMonth: t.subMonth,
        });
      }
    });
    data.transactions = data.transactions.filter(t => !misplacedIds.has(t.id));
  }
  return data;
}

// ── DATES ────────────────────────────────────────────────────
// Local calendar date (toISOString would give the UTC date — wrong after midnight in Greece)
const pad2      = n => String(n).padStart(2, '0');
const ymd       = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const monthOf   = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const today     = () => ymd(new Date());
const thisMonth = () => monthOf(new Date());

// "YYYY-MM" shifted by n months
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  return monthOf(new Date(y, m - 1 + n, 1));
}
const nextMonth = () => addMonths(thisMonth(), 1);

// Number of days in a "YYYY-MM" month
const daysInMonth = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };

// "YYYY-MM" strings from startYM to endYM (inclusive)
function monthRange(startYM, endYM) {
  const months = [];
  for (let ym = startYM; ym <= endYM; ym = addMonths(ym, 1)) months.push(ym);
  return months;
}

// Same day next month, clamped to that month's last day (31/01 → 28/02, not 03/03)
function sameDayNextMonth(dateStr) {
  const nextYM = addMonths(dateStr.slice(0, 7), 1);
  const day    = Math.min(Number(dateStr.slice(8, 10)), daysInMonth(nextYM));
  return `${nextYM}-${pad2(day)}`;
}

// ── MONEY ────────────────────────────────────────────────────
const round2  = n => Math.round((n + Number.EPSILON) * 100) / 100;
const txDelta = tx => tx.type === 'income' ? tx.amount : -tx.amount;

// Card payments from an account are excluded from expense stats (the card spending is counted instead)
const isCardPaymentCat = c => ['κάρτες', 'cards'].includes(String(c || '').trim().toLowerCase());

// ── INSTALLMENTS & SUBSCRIPTIONS ─────────────────────────────
// An installment is charged in a month once it has started and until it is fully paid
function installmentDue(i, month = thisMonth()) {
  return !!i.active && i.monthlyAmount > 0
    && (!i.totalCount || i.paidCount < i.totalCount)
    && (!i.startMonth || i.startMonth <= month);
}

// Months (up to `current`) in which a subscription should have produced a transaction
function subscriptionBillingMonths(sub, current) {
  const start = sub.startMonth || current;
  if (sub.frequency === 'monthly') return monthRange(start, current);
  // yearly: one entry per year on the billing month
  const billingMM = sub.billingMonth || start.slice(5, 7);
  const months = [];
  for (let y = Number(start.slice(0, 4)); y <= Number(current.slice(0, 4)); y++) {
    const ym = `${y}-${billingMM}`;
    if (ym >= start && ym <= current) months.push(ym);
  }
  return months;
}

// Monthly / yearly cost of the subscriptions that are not paused
function subscriptionCosts(subs) {
  const running = subs.filter(s => !s.paused);
  return {
    monthly: running.reduce((s, x) => s + (x.frequency === 'monthly' ? x.amount : 0), 0),
    yearly:  running.reduce((s, x) => s + (x.frequency === 'monthly' ? x.amount * 12 : x.amount), 0),
  };
}

// ── FORECAST ─────────────────────────────────────────────────
// Forecast horizon: latest transaction date, capped at the end of next month
function calcFutureDate(s, now = new Date()) {
  const cap = ymd(new Date(now.getFullYear(), now.getMonth() + 2, 0));
  let max = '';
  for (const t of [...s.transactions, ...s.cardTransactions]) if (t.date > max) max = t.date;
  return !max || max > cap ? cap : max;
}

// Balance after every unsettled transaction of the account up to `fd`
function accountForecast(acc, transactions, fd) {
  return round2(transactions
    .filter(t => t.account === acc.id && !t.settled && t.date <= fd)
    .reduce((bal, t) => bal + txDelta(t), acc.balance || 0));
}

// Step points for the daily balance chart. Uses exactly the same transactions as
// accountForecast: overdue/today ones fold into today's point, later ones become steps.
function dailyBalancePoints(acc, transactions, todayStr, fd) {
  const byDate = {};
  let bal = acc.balance || 0;
  transactions
    .filter(t => t.account === acc.id && !t.settled && t.date <= fd)
    .forEach(t => {
      if (t.date <= todayStr) bal += txDelta(t);
      else byDate[t.date] = (byDate[t.date] || 0) + txDelta(t);
    });
  const points = [{ date: todayStr, value: round2(bal) }];
  Object.keys(byDate).sort().forEach(d => {
    bal += byDate[d];
    points.push({ date: d, value: round2(bal) });
  });
  return points;
}

// ── EXPENSES ─────────────────────────────────────────────────
// Every expense counted for a month: account expenses (minus transfers and card payments),
// card transactions, and — for the current month only — installments that are due.
function monthExpenseItems(s, month, currentMonth = thisMonth()) {
  const items = [];
  s.transactions
    .filter(tx => tx.type === 'expense' && tx.date.startsWith(month) && !isCardPaymentCat(tx.category) && !tx.transferId)
    .forEach(tx => items.push({ category: tx.category, amount: tx.amount }));
  s.cardTransactions
    .filter(tx => tx.date.startsWith(month))
    .forEach(tx => items.push({ category: tx.category, amount: tx.amount }));
  if (month === currentMonth) {
    s.installments
      .filter(i => installmentDue(i, month))
      .forEach(i => items.push({ category: i.category, amount: i.monthlyAmount, installment: true }));
  }
  return items;
}

function monthExpenseTotal(s, month, currentMonth = thisMonth()) {
  return round2(monthExpenseItems(s, month, currentMonth).reduce((sum, i) => sum + i.amount, 0));
}

// [{ category, amount }] sorted by amount, with fallback labels for uncategorised entries
function expensesByCategory(s, month, labels, currentMonth = thisMonth()) {
  const map = {};
  for (const item of monthExpenseItems(s, month, currentMonth)) {
    const cat = item.category && item.category.trim() ? item.category
              : item.installment ? labels.installments : labels.none;
    map[cat] = (map[cat] || 0) + item.amount;
  }
  return Object.entries(map)
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);
}

// From money that left the accounts (cash flow) to spending (by category), step by step.
// The result always equals monthExpenseTotal, because it is built from the same rules.
function spendingBridge(s, month, currentMonth = thisMonth()) {
  const acctExp = s.transactions.filter(tx => tx.type === 'expense' && tx.date.startsWith(month) && !tx.transferId);
  const paidOut     = round2(acctExp.reduce((sum, tx) => sum + tx.amount, 0));
  const cardPayment = round2(acctExp.filter(tx => isCardPaymentCat(tx.category)).reduce((sum, tx) => sum + tx.amount, 0));
  const cardSpend   = round2(s.cardTransactions.filter(tx => tx.date.startsWith(month)).reduce((sum, tx) => sum + tx.amount, 0));
  const installments = month === currentMonth
    ? round2(s.installments.filter(i => installmentDue(i, month)).reduce((sum, i) => sum + i.monthlyAmount, 0))
    : 0;
  return {
    paidOut, cardPayment, cardSpend, installments,
    installmentsCounted: month === currentMonth,
    spending: round2(paidOut - cardPayment + cardSpend + installments),
  };
}

// ── INCOME ───────────────────────────────────────────────────
// Average monthly income over the 12 months ending at `month` (counting only months
// that had income, so a short history isn't diluted), projected to a full year
function estimateYearlyIncome(transactions, month) {
  const from = addMonths(month, -11);
  const perMonth = {};
  transactions
    .filter(tx => tx.type === 'income' && !tx.transferId)
    .forEach(tx => {
      const ym = tx.date.slice(0, 7);
      if (ym >= from && ym <= month) perMonth[ym] = (perMonth[ym] || 0) + tx.amount;
    });
  const totals = Object.values(perMonth);
  return totals.length ? round2(totals.reduce((s, v) => s + v, 0) / totals.length * 12) : 0;
}

if (typeof module !== 'undefined') {
  module.exports = {
    DEFAULT_STATE, cloneDefaults, migrateState,
    ymd, monthOf, addMonths, daysInMonth, monthRange, sameDayNextMonth,
    round2, txDelta, isCardPaymentCat,
    installmentDue, subscriptionBillingMonths, subscriptionCosts,
    calcFutureDate, accountForecast, dailyBalancePoints,
    monthExpenseItems, monthExpenseTotal, expensesByCategory, spendingBridge,
    estimateYearlyIncome,
  };
}
