/* ============================================================
   Family FiN — Transactions report
   Printable HTML report of the filtered Κινήσεις list (Print / Save as PDF).
   ============================================================ */

'use strict';

// ── TRANSACTION PDF REPORT ────────────────────────────────────
function generateTransactionReport() {
  const { month, account, cat, search, txs } = getFilteredTransactions();

  const income   = txs.filter(tx => tx.type === 'income'  && !tx.transferId).reduce((s, tx) => s + tx.amount, 0);
  const expenses = txs.filter(tx => tx.type === 'expense' && !tx.transferId).reduce((s, tx) => s + tx.amount, 0);
  const balance  = income - expenses;

  // Filter labels
  const [fy, fm] = month.split('-');
  const monthLabel = month ? `${t('months_full')[parseInt(fm, 10) - 1]} ${fy}` : t('report_all');
  const acctSel  = document.getElementById('txAccountFilter');
  const catSel   = document.getElementById('txCategoryFilter');
  const acctLabel = account ? (acctSel.selectedOptions[0]?.text || account) : t('report_all');
  const catLabel  = cat     ? (catSel.selectedOptions[0]?.text  || cat)     : t('report_all');
  const col = key => t(key).replace(' ↕', '');

  const lang    = getLang();
  const locale  = lang === 'en' ? 'en-GB' : 'el-GR';
  const now     = new Date();
  const dateStr = now.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const appVer  = document.querySelector('.version')?.textContent || 'Family FiN';

  // Build table rows
  const rows = txs.map(tx => {
    const isIncome   = tx.type === 'income';
    const isTransfer = !!tx.transferId;
    const amtStr  = (isIncome ? '+' : '−') + fmtEuro(tx.amount);
    const amtCls  = isIncome ? 'ia' : 'ea';
    const catBadge = tx.category
      ? `<span class="cb${isTransfer ? ' tr' : ''}">${esc(tx.category)}</span>`
      : '<span class="mu">—</span>';
    const notesHtml = (tx.notes && !tx.subId && !isTransfer)
      ? `<div class="nt">${esc(tx.notes)}</div>` : '';
    const icons = (tx.subId ? ' 🔄' : '') + (isTransfer ? ' ↔' : '');
    const settled = tx.settled
      ? '<span class="sk">✓</span>' : '<span class="su">○</span>';
    return `<tr>
      <td class="nd">${fmtDate(tx.date)}</td>
      <td><b>${esc(tx.desc)}${icons}</b>${notesHtml}</td>
      <td>${catBadge}</td>
      <td><span class="al">${esc(accountLabel(tx.account))}</span></td>
      <td class="r ${amtCls}">${amtStr}</td>
      <td class="c">${settled}</td>
    </tr>`;
  }).join('');

  const noData = txs.length === 0
    ? `<div class="empty">${t('report_empty')}</div>` : '';

  const tableHtml = txs.length ? `
  <table>
    <thead><tr>
      <th>${col('col_date')}</th><th>${col('col_desc')}</th><th>${col('col_category')}</th>
      <th>${col('col_account')}</th><th class="r">${col('col_amount')}</th><th class="c">✓</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>` : noData;

  const html = `<!DOCTYPE html>
<html lang="${lang}"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t('report_title')} — Family FiN</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;color:#1e293b;font-size:12px;padding:24px 28px;background:#fff}
.pbtn{position:fixed;top:14px;right:14px;padding:10px 22px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600;box-shadow:0 2px 12px rgba(59,130,246,.3);display:flex;align-items:center;gap:6px}
.pbtn:hover{background:#2563eb}
/* Header */
.hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #0f1f3d;padding-bottom:14px;margin-bottom:16px}
.logo{font-size:22px;font-weight:300;color:#0f1f3d;letter-spacing:-.5px}.logo b{font-weight:800;color:#3b82f6}
.rname{font-size:13px;color:#64748b;margin-top:4px}
.meta{text-align:right;font-size:11px;color:#94a3b8;line-height:1.7}.meta b{color:#475569}
/* Filters */
.frow{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center}
.ftit{font-size:11px;color:#94a3b8}
.fc{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:20px;padding:3px 11px;font-size:11px;color:#475569}.fc b{color:#0f172a}
/* Summary */
.sbar{display:flex;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:20px}
.si{flex:1;padding:14px 8px;text-align:center}.si+.si{border-left:1px solid #e2e8f0}
.sl{font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin-bottom:5px}
.sv{font-size:17px;font-weight:700}
.sv.inc{color:#16a34a}.sv.exp{color:#dc2626}.sv.pos{color:#0f1f3d}.sv.neg{color:#dc2626}
/* Table */
table{width:100%;border-collapse:collapse}
thead th{background:#0f1f3d;color:#e2e8f0;padding:9px 10px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}
thead th.r{text-align:right}thead th.c{text-align:center}
tbody tr:nth-child(even){background:#f8fafc}
td{padding:7px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
td.r{text-align:right}td.c{text-align:center}td.nd{white-space:nowrap}
.ia{color:#16a34a;font-weight:700}.ea{color:#dc2626;font-weight:700}
.cb{display:inline-block;background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:500}
.cb.tr{background:#ede9fe;color:#6d28d9}
.al{background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:12px;display:inline-block;font-size:10px;white-space:nowrap}
.sk{color:#16a34a;font-size:14px}.su{color:#cbd5e1;font-size:14px}.mu{color:#94a3b8}
.nt{font-size:10px;color:#94a3b8;margin-top:3px}
/* Footer */
.ftr{margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8}
.empty{text-align:center;padding:40px;color:#94a3b8;font-size:14px}
@media print{
  body{padding:0}
  .pbtn{display:none!important}
  @page{margin:14mm 12mm;size:A4}
  thead th{background:#0f1f3d!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  tbody tr:nth-child(even){background:#f8fafc!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style></head><body>

<button class="pbtn" onclick="window.print()">${t('report_print')}</button>

<div class="hdr">
  <div><div class="logo">Family <b>FiN</b></div><div class="rname">${t('report_title')}</div></div>
  <div class="meta"><div><b>${dateStr}</b> — ${timeStr}</div><div>${tf('report_count', txs.length)}</div></div>
</div>

<div class="frow">
  <span class="ftit">${t('report_filters')}</span>
  <span class="fc">📅 ${t('report_month')}: <b>${esc(monthLabel)}</b></span>
  <span class="fc">🏦 ${col('col_account')}: <b>${esc(acctLabel)}</b></span>
  <span class="fc">🏷 ${col('col_category')}: <b>${esc(catLabel)}</b></span>
  ${search ? `<span class="fc">🔍 <b>${esc(search)}</b></span>` : ''}
</div>

<div class="sbar">
  <div class="si"><div class="sl">${t('report_income')}</div><div class="sv inc">${fmtEuro(income)}</div></div>
  <div class="si"><div class="sl">${t('report_expenses')}</div><div class="sv exp">${fmtEuro(expenses)}</div></div>
  <div class="si"><div class="sl">${t('report_balance')}</div><div class="sv ${balance >= 0 ? 'pos' : 'neg'}">${fmtEuro(balance)}</div></div>
</div>

${tableHtml}

<div class="ftr">
  <span>${esc(appVer)}</span>
  <span>${tf('report_count', txs.length)} &nbsp;·&nbsp; ${t('report_income')}: ${fmtEuro(income)} &nbsp;·&nbsp; ${t('report_expenses')}: ${fmtEuro(expenses)} &nbsp;·&nbsp; ${t('report_balance')}: ${fmtEuro(balance)}</span>
</div>

<script>setTimeout(()=>window.print(),500);<\/script>
</body></html>`;

  const win = window.open('', '_blank', 'width=920,height=720,menubar=yes');
  if (!win) {
    showToast(t('report_popup_blocked'), 'error');
    return;
  }
  win.document.write(html);
  win.document.close();
}
