// Run with:  node --test   (from the project folder)
'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const C      = require('../calc.js');

const baseState = over => C.migrateState({ accounts: [], transactions: [], ...over });

test('migrateState converts the legacy accounts object and fills missing collections', () => {
  const s = C.migrateState({ accounts: { cash: 10, alpha: 20, winbank: 0 }, transactions: [], futureDate: 'x' });
  assert.deepEqual(s.accounts.map(a => [a.id, a.balance]), [['cash', 10], ['alpha', 20], ['winbank', 0]]);
  assert.equal(s.futureDate, undefined);
  for (const key of Object.keys(C.DEFAULT_STATE)) assert.ok(Array.isArray(s[key]), key);
  assert.equal(s.categories.length, C.DEFAULT_STATE.categories.length);
});

test('migrateState maps old income slugs and moves card subscription rows', () => {
  const s = C.migrateState({
    accounts: [], cards: [{ id: 'c1' }],
    transactions: [
      { id: '1', type: 'income', category: 'salary', account: 'a', amount: 1, date: '2026-01-01' },
      { id: '2', type: 'expense', subId: 's', subMonth: '2026-01', account: 'c1', amount: 5, date: '2026-01-03' },
    ],
  });
  assert.equal(s.transactions.length, 1);
  assert.equal(s.transactions[0].category, 'Μισθός');
  assert.deepEqual(s.cardTransactions.map(t => [t.card, t.subId]), [['c1', 's']]);
});

test('dates use the local calendar and handle month/year boundaries', () => {
  assert.equal(C.ymd(new Date(2026, 0, 5, 0, 30)), '2026-01-05');
  assert.equal(C.addMonths('2026-12', 1), '2027-01');
  assert.equal(C.addMonths('2026-01', -11), '2025-02');
  assert.deepEqual(C.monthRange('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.deepEqual(C.monthRange('2026-05', '2026-04'), []);
  assert.equal(C.daysInMonth('2028-02'), 29);
});

test('sameDayNextMonth clamps to the last day of the next month', () => {
  assert.equal(C.sameDayNextMonth('2026-01-31'), '2026-02-28');
  assert.equal(C.sameDayNextMonth('2028-01-31'), '2028-02-29');
  assert.equal(C.sameDayNextMonth('2026-12-31'), '2027-01-31');
  assert.equal(C.sameDayNextMonth('2026-03-15'), '2026-04-15');
});

test('round2 removes floating-point drift', () => {
  assert.equal(C.round2(0.1 + 0.2), 0.3);
  assert.equal(C.round2(1.005), 1.01);
  assert.equal(C.round2(-2.345), -2.34);
});

test('card payment category matches Greek and English names', () => {
  assert.ok(C.isCardPaymentCat('Κάρτες'));
  assert.ok(C.isCardPaymentCat(' cards '));
  assert.ok(!C.isCardPaymentCat('Άλλο'));
  assert.ok(!C.isCardPaymentCat(undefined));
});

test('installmentDue respects start month, completion and active flag', () => {
  const i = { active: true, monthlyAmount: 50, paidCount: 2, totalCount: 10, startMonth: '2026-03' };
  assert.ok(C.installmentDue(i, '2026-03'));
  assert.ok(!C.installmentDue(i, '2026-02'), 'not before it starts');
  assert.ok(!C.installmentDue({ ...i, paidCount: 10 }, '2026-06'), 'not after it is paid off');
  assert.ok(!C.installmentDue({ ...i, active: false }, '2026-06'));
  assert.ok(!C.installmentDue({ ...i, monthlyAmount: null }, '2026-06'));
  assert.ok(C.installmentDue({ ...i, startMonth: undefined, totalCount: null }, '2020-01'));
});

test('subscriptionBillingMonths for monthly and yearly subscriptions', () => {
  assert.deepEqual(C.subscriptionBillingMonths({ frequency: 'monthly', startMonth: '2026-10' }, '2026-12'),
    ['2026-10', '2026-11', '2026-12']);
  // yearly without billing month → billed in the start month
  assert.deepEqual(C.subscriptionBillingMonths({ frequency: 'yearly', startMonth: '2024-11' }, '2026-11'),
    ['2024-11', '2025-11', '2026-11']);
  // yearly with a billing month earlier in the year than the start
  assert.deepEqual(C.subscriptionBillingMonths({ frequency: 'yearly', startMonth: '2025-11', billingMonth: '03' }, '2027-02'),
    ['2026-03']);
});

test('subscriptionCosts ignores paused subscriptions', () => {
  const subs = [
    { frequency: 'monthly', amount: 10 },
    { frequency: 'yearly', amount: 60 },
    { frequency: 'monthly', amount: 99, paused: true },
  ];
  assert.deepEqual(C.subscriptionCosts(subs), { monthly: 10, yearly: 180 });
});

test('calcFutureDate uses the latest transaction, capped at the end of next month', () => {
  const now = new Date(2026, 10, 14);
  assert.equal(C.calcFutureDate(baseState({}), now), '2026-12-31');
  assert.equal(C.calcFutureDate(baseState({ transactions: [{ date: '2026-12-10' }] }), now), '2026-12-10');
  assert.equal(C.calcFutureDate(baseState({ cardTransactions: [{ date: '2027-06-01' }] }), now), '2026-12-31');
});

test('forecast and daily chart end at the same balance', () => {
  const acc = { id: 'a', balance: 1000 };
  const txs = [
    { account: 'a', type: 'expense', amount: 100, date: '2026-11-01' },               // overdue
    { account: 'a', type: 'income',  amount: 10,  date: '2026-11-14' },               // today
    { account: 'a', type: 'expense', amount: 50,  date: '2026-12-10' },               // future
    { account: 'a', type: 'expense', amount: 999, date: '2026-12-11', settled: true }, // already in balance
    { account: 'a', type: 'expense', amount: 7,   date: '2027-01-05' },               // beyond horizon
    { account: 'b', type: 'expense', amount: 5,   date: '2026-11-20' },               // other account
  ];
  const fd = '2026-12-31';
  assert.equal(C.accountForecast(acc, txs, fd), 860);
  const pts = C.dailyBalancePoints(acc, txs, '2026-11-14', fd);
  assert.deepEqual(pts, [{ date: '2026-11-14', value: 910 }, { date: '2026-12-10', value: 860 }]);
  assert.equal(pts.at(-1).value, C.accountForecast(acc, txs, fd));
});

test('monthly expenses exclude transfers and card payments, include installments only this month', () => {
  const s = baseState({
    transactions: [
      { type: 'expense', amount: 40, date: '2026-11-05', category: 'Σούπερ μάρκετ' },
      { type: 'expense', amount: 300, date: '2026-11-06', category: 'Κάρτες' },
      { type: 'expense', amount: 200, date: '2026-11-07', transferId: 't1', category: 'Μεταφορά' },
      { type: 'income',  amount: 1500, date: '2026-11-01' },
    ],
    cardTransactions: [{ amount: 25, date: '2026-11-09', category: '' }],
    installments: [{ active: true, monthlyAmount: 30, paidCount: 0, totalCount: 5, startMonth: '2026-01' }],
  });
  assert.equal(C.monthExpenseTotal(s, '2026-11', '2026-11'), 95);
  assert.equal(C.monthExpenseTotal(s, '2026-11', '2026-12'), 65, 'past month: no installments');
  assert.deepEqual(C.expensesByCategory(s, '2026-11', { none: 'Χωρίς', installments: 'Δόσεις' }, '2026-11'), [
    { category: 'Σούπερ μάρκετ', amount: 40 },
    { category: 'Δόσεις', amount: 30 },
    { category: 'Χωρίς', amount: 25 },
  ]);
});

test('spendingBridge goes from cash flow to spending and matches monthExpenseTotal', () => {
  const s = baseState({
    transactions: [
      { type: 'expense', amount: 40, date: '2026-11-05', category: 'Σούπερ μάρκετ' },
      { type: 'expense', amount: 300, date: '2026-11-06', category: 'Κάρτες' },
      { type: 'expense', amount: 200, date: '2026-11-07', transferId: 't1', category: 'Μεταφορά' },
      { type: 'income',  amount: 1500, date: '2026-11-01' },
    ],
    cardTransactions: [{ amount: 25, date: '2026-11-09', category: '' }],
    installments: [{ active: true, monthlyAmount: 30, paidCount: 0, totalCount: 5, startMonth: '2026-01' }],
  });
  const b = C.spendingBridge(s, '2026-11', '2026-11');
  assert.deepEqual(b, { paidOut: 340, cardPayment: 300, cardSpend: 25, installments: 30, installmentsCounted: true, spending: 95 });
  assert.equal(b.spending, C.monthExpenseTotal(s, '2026-11', '2026-11'));
  const past = C.spendingBridge(s, '2026-11', '2026-12');
  assert.equal(past.installments, 0);
  assert.equal(past.installmentsCounted, false);
  assert.equal(past.spending, C.monthExpenseTotal(s, '2026-11', '2026-12'));
});

test('estimateYearlyIncome averages the months that had income in the last 12', () => {
  const tx = (date, amount, extra = {}) => ({ type: 'income', date, amount, ...extra });
  const txs = [
    tx('2026-10-01', 1000), tx('2026-11-01', 2000),
    tx('2025-11-01', 9999),                      // 13 months back → ignored
    tx('2026-11-02', 500, { transferId: 't' }),  // transfer → ignored
  ];
  assert.equal(C.estimateYearlyIncome(txs, '2026-11'), 18000);
  assert.equal(C.estimateYearlyIncome([], '2026-11'), 0);
});
