/* ============================================================
   Family FiN — Transactions report
   Printable HTML report of the filtered Κινήσεις list (Print / Save as PDF).
   ============================================================ */

'use strict';

// The report always prints in the light version of the selected style (Navy / Sage / Graphite)
const REPORT_STYLES = {
  navy: {
    ink: '#142033', muted: '#5b6b82', faint: '#8592a6', line: '#e1e7ef', zebra: '#f6f8fb', chip: '#eef2f7',
    head: '#13274a', headInk: '#eef3fb', accent: '#2a6fdb', accentHover: '#1f5cc0', badge: '#e3edfc', badgeInk: '#1d4fa8',
    pos: '#12804a', neg: '#c73a3a',
    font: "'Inter', -apple-system, 'Segoe UI', sans-serif", fontHead: "'Inter', -apple-system, 'Segoe UI', sans-serif", fontNum: "'Inter', -apple-system, 'Segoe UI', sans-serif",
  },
  sage: {
    ink: '#16231f', muted: '#5a6c66', faint: '#7d8e88', line: '#dfe6e4', zebra: '#f4f7f6', chip: '#ebf0ee',
    head: '#0b5c54', headInk: '#eefaf8', accent: '#0f8a7e', accentHover: '#0b766c', badge: '#ddf1ed', badgeInk: '#0b6b62',
    pos: '#13804f', neg: '#c4433a',
    font: "'Inter', -apple-system, 'Segoe UI', sans-serif", fontHead: "'Manrope', 'Avenir Next', 'Segoe UI', sans-serif", fontNum: "'Inter', -apple-system, 'Segoe UI', sans-serif",
  },
  graphite: {
    ink: '#18181b', muted: '#5f5f69', faint: '#8a8a94', line: '#e4e4e7', zebra: '#f7f7f8', chip: '#f0f0f2',
    head: '#18181b', headInk: '#f4f4f5', accent: '#4049c4', accentHover: '#343cad', badge: '#e8e9fb', badgeInk: '#343cad',
    pos: '#16794a', neg: '#c23b3b',
    font: "'IBM Plex Sans', 'Helvetica Neue', sans-serif", fontHead: "'IBM Plex Sans', 'Helvetica Neue', sans-serif", fontNum: "'IBM Plex Mono', 'SF Mono', Menlo, monospace",
  },
};

// The app's @font-face rules, with font URLs made absolute so the report window can load them
function reportFontFaces() {
  const rules = [];
  for (const sheet of document.styleSheets) {
    let list;
    try { list = sheet.cssRules; } catch (_) { continue; }
    for (const r of list) {
      if (r instanceof CSSFontFaceRule) {
        rules.push(r.cssText.replace(/url\((["']?)(?!https?:|data:)\/?/g, `url($1${location.origin}/`));
      }
    }
  }
  return rules.join('\n');
}

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

  const P = REPORT_STYLES[getStylePref()] || REPORT_STYLES.navy;
  const fontFaces = reportFontFaces();

  const html = `<!DOCTYPE html>
<html lang="${lang}"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t('report_title')} — Family FiN</title>
<style>
${fontFaces}
:root{--ink:${P.ink};--muted:${P.muted};--faint:${P.faint};--line:${P.line};--zebra:${P.zebra};--chip:${P.chip};--head:${P.head};--head-ink:${P.headInk};--accent:${P.accent};--accent-hover:${P.accentHover};--badge:${P.badge};--badge-ink:${P.badgeInk};--pos:${P.pos};--neg:${P.neg};--font:${P.font};--font-head:${P.fontHead};--font-num:${P.fontNum}}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font);color:var(--ink);font-size:12px;padding:24px 28px;background:#fff}
.pbtn{position:fixed;top:14px;right:14px;padding:10px 22px;background:var(--accent);color:#fff;border:none;border-radius:8px;font:600 13px var(--font);cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,.15);display:flex;align-items:center;gap:6px}
.pbtn:hover{background:var(--accent-hover)}
/* Header */
.hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid var(--head);padding-bottom:14px;margin-bottom:16px}
.logo{display:flex;align-items:center;gap:8px;font:600 22px/1 var(--font-head);color:var(--ink);letter-spacing:-.3px}.logo b{font-weight:700;color:var(--accent)}
.logo svg{width:24px;height:24px;color:var(--accent)}
.rname{font-size:13px;color:var(--muted);margin-top:6px}
.meta{text-align:right;font-size:11px;color:var(--faint);line-height:1.7}.meta b{color:var(--muted)}
/* Filters */
.frow{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center}
.ftit{font-size:11px;color:var(--faint)}
.fc{background:var(--chip);border:1px solid var(--line);border-radius:20px;padding:3px 11px;font-size:11px;color:var(--muted)}.fc b{color:var(--ink)}
/* Summary */
.sbar{display:flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-bottom:20px}
.si{flex:1;padding:14px 8px;text-align:center}.si+.si{border-left:1px solid var(--line)}
.sl{font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:var(--faint);margin-bottom:5px}
.sv{font:700 17px var(--font-num);font-variant-numeric:tabular-nums}
.sv.inc{color:var(--pos)}.sv.exp{color:var(--neg)}.sv.pos{color:var(--ink)}.sv.neg{color:var(--neg)}
/* Table */
table{width:100%;border-collapse:collapse}
thead th{background:var(--head);color:var(--head-ink);padding:9px 10px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}
thead th.r{text-align:right}thead th.c{text-align:center}
tbody tr:nth-child(even){background:var(--zebra)}
td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
td.r{text-align:right;font-family:var(--font-num);font-variant-numeric:tabular-nums}td.c{text-align:center}td.nd{white-space:nowrap}
.ia{color:var(--pos);font-weight:700}.ea{color:var(--neg);font-weight:700}
.cb{display:inline-block;background:var(--badge);color:var(--badge-ink);padding:2px 8px;border-radius:12px;font-size:10px;font-weight:500}
.cb.tr{background:#ede9fe;color:#6d28d9}
.al{background:var(--chip);color:var(--muted);padding:2px 8px;border-radius:12px;display:inline-block;font-size:10px;white-space:nowrap}
.sk{color:var(--pos);font-size:14px}.su{color:var(--line);font-size:14px}.mu{color:var(--faint)}
.nt{font-size:10px;color:var(--faint);margin-top:3px}
/* Footer */
.ftr{margin-top:20px;padding-top:10px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:10px;color:var(--faint)}
.empty{text-align:center;padding:40px;color:var(--faint);font-size:14px}
@media print{
  body{padding:0}
  .pbtn{display:none!important}
  @page{margin:14mm 12mm;size:A4}
  thead th,tbody tr:nth-child(even),.cb,.al,.fc{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style></head><body>

<button class="pbtn" onclick="window.print()">${t('report_print')}</button>

<div class="hdr">
  <div><div class="logo"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="13" width="4.5" height="8" rx="1.3" fill="currentColor"/><rect x="9.75" y="9" width="4.5" height="12" rx="1.3" fill="currentColor"/><rect x="16" y="5" width="4.5" height="16" rx="1.3" fill="currentColor"/></svg><span>Family <b>FiN</b></span></div><div class="rname">${t('report_title')}</div></div>
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
