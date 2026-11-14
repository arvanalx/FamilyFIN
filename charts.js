/* ============================================================
   Family FiN — Dashboard charts
   SVG/canvas rendering only; the numbers come from calc.js.
   ============================================================ */

'use strict';

// ── CHART STATE ───────────────────────────────────────────────────────────────
// Neutral chart colours come from CSS variables so charts follow light/dark theme
const CHART = {};
function refreshChartColors() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['text', 'muted', 'grid', 'axis', 'track', 'strong']) {
    CHART[k] = cs.getPropertyValue('--chart-' + k).trim();
  }
  CHART.bg     = cs.getPropertyValue('--card-bg').trim();
  CHART.accent = cs.getPropertyValue('--accent').trim();
  CHART.pos    = cs.getPropertyValue('--success').trim();
  CHART.neg    = cs.getPropertyValue('--danger').trim();
  CHART.font   = cs.getPropertyValue('--font-ui').trim() || 'system-ui, sans-serif';
  CHART.cats   = Array.from({ length: 8 }, (_, i) => cs.getPropertyValue(`--cat-${i + 1}`).trim());
}

// Blend two #rrggbb colours (t = share of `a`) — used for lighter tints of a series colour
function mixHex(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [ca, cb] = [p(a), p(b)];
  return '#' + ca.map((v, i) => Math.round(v * t + cb[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
}

// Account colours follow the validated categorical slots; the light tint marks the forecast part
const balPal = i => {
  const c = CHART.cats[i % CHART.cats.length];
  return [c, mixHex(c, CHART.bg, 0.5)];
};

// More than 8 categories fold into one "other" slice (8 validated colours, never cycled)
function foldCategories(catData) {
  if (catData.length <= 8) return catData;
  const rest = catData.slice(7).reduce((s, c) => s + c.amount, 0);
  return [...catData.slice(0, 7), { category: t('chart_other'), amount: rest }];
}

let _balanceData = [];
let _balanceView = 'compare'; // 'compare' | 'delta'
let _expChartOffset = 0;      // 0 = current month, -1 = previous, etc.
let _expView = 'donut';       // 'donut' | 'bars'

function setBalanceView(v) {
  _balanceView = v;
  document.querySelectorAll('[data-bal-view]').forEach(b =>
    b.classList.toggle('chart-tog-active', b.dataset.balView === v));
  renderBalanceChart(_balanceData);
}

function setExpView(v) {
  _expView = v;
  document.querySelectorAll('[data-exp-view]').forEach(b =>
    b.classList.toggle('chart-tog-active', b.dataset.expView === v));
  renderExpChartForOffset();
}

function navigateExpChart(dir) {
  _expChartOffset = Math.min(0, _expChartOffset + dir);
  renderExpChartForOffset();
}

function renderExpChartForOffset() {
  const now   = new Date();
  const d     = new Date(now.getFullYear(), now.getMonth() + _expChartOffset, 1);
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  const nextBtn = document.getElementById('expChartNext');
  if (nextBtn) nextBtn.disabled = _expChartOffset >= 0;

  const expMonthEl = document.getElementById('expChartMonth');
  if (expMonthEl) expMonthEl.textContent = fmtDate(month + '-01').slice(3);

  const catData = expensesByCategory(state, month, { none: t('no_category'), installments: t('installments_cat') });
  renderExpenseCategoryChart(catData);
}

// ── MONTHLY EXPENSES BAR CHART ────────────────────────────────

function fmtAxisVal(v) {
  if (v >= 1000) return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k';
  return v.toFixed(0);
}

function initMonthlyExpYearSel() {
  const sel = document.getElementById('monthlyExpYearSel');
  if (!sel || sel.dataset.init) return;
  const curYear = new Date().getFullYear();
  const years = new Set([curYear]);
  state.transactions.forEach(tx => years.add(parseInt(tx.date.slice(0, 4))));
  state.cardTransactions.forEach(tx => years.add(parseInt(tx.date.slice(0, 4))));
  const sorted = [...years].filter(y => y >= 2020 && y <= curYear + 1).sort();
  sel.innerHTML = sorted.map(y =>
    `<option value="${y}"${y === curYear ? ' selected' : ''}>${y}</option>`).join('');
  sel.dataset.init = '1';
}

function renderMonthlyExpenseChart() {
  const wrap = document.getElementById('monthlyExpWrapper');
  if (!wrap) return;
  const sel  = document.getElementById('monthlyExpYearSel');
  const year = sel ? parseInt(sel.value) : new Date().getFullYear();
  const curYear = new Date().getFullYear();
  const curMon  = new Date().getMonth() + 1; // 1-12

  const totals = Array.from({ length: 12 }, (_, i) => monthExpenseTotal(state, `${year}-${String(i + 1).padStart(2, '0')}`));

  const W      = Math.max(wrap.clientWidth || 300, 300);
  const H      = 220;
  const padL   = 48, padR = 10, padT = 26, padB = 36;
  const cW     = W - padL - padR;
  const cH     = H - padT - padB;
  const maxVal = Math.max(...totals, 1);
  const slotW  = cW / 12;
  const barW   = Math.max(6, slotW * 0.68);
  const gap    = (slotW - barW) / 2;

  // Gridlines (4 levels)
  let svg = '';
  for (let g = 1; g <= 4; g++) {
    const v  = (maxVal / 4) * g;
    const yg = (padT + cH - (v / maxVal) * cH).toFixed(1);
    svg += `<line x1="${padL}" y1="${yg}" x2="${W - padR}" y2="${yg}" stroke="${CHART.grid}" stroke-width="1"/>`;
    svg += `<text x="${(padL - 5).toFixed(1)}" y="${(parseFloat(yg) + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="${CHART.muted}" font-family="${CHART.font}">${esc(fmtAxisVal(v))}</text>`;
  }
  // Baseline
  svg += `<line x1="${padL}" y1="${(padT + cH).toFixed(1)}" x2="${W - padR}" y2="${(padT + cH).toFixed(1)}" stroke="${CHART.axis}" stroke-width="1.5"/>`;

  // Bars
  totals.forEach((val, i) => {
    const monthNum = i + 1;
    const isCurrent = year === curYear && monthNum === curMon;
    const isFuture  = year > curYear || (year === curYear && monthNum > curMon);
    const barH  = val > 0 ? Math.max(2, (val / maxVal) * cH) : 0;
    const x     = (padL + i * slotW + gap).toFixed(1);
    const y     = (padT + cH - barH).toFixed(1);
    const fill  = isCurrent ? CHART.accent : mixHex(CHART.accent, CHART.bg, isFuture ? 0.22 : 0.5);
    const opacity = isFuture ? '0.6' : '1';
    const lblCol  = isCurrent ? CHART.strong : CHART.muted;
    const lblW    = isCurrent ? '700' : '400';

    svg += `<rect x="${x}" y="${y}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="${fill}" opacity="${opacity}"><title>${t('months')[i]}: ${esc(fmtEuro(val))}</title></rect>`;

    // Amount label above bar (only when bar tall enough)
    if (val > 0 && barH > 22) {
      const lbl = fmtEuro(val).replace(' €', '');
      svg += `<text x="${(parseFloat(x) + barW / 2).toFixed(1)}" y="${(parseFloat(y) - 4).toFixed(1)}" text-anchor="middle" font-size="9" fill="${CHART.text}" font-family="${CHART.font}">${esc(lbl)}</text>`;
    }

    // Month label below bar
    const lx = (parseFloat(x) + barW / 2).toFixed(1);
    const ly = (padT + cH + 15).toFixed(1);
    svg += `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="10" fill="${lblCol}" font-weight="${lblW}" font-family="${CHART.font}">${t('months')[i]}</text>`;
  });

  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${H}px">${svg}</svg>`;
}

// ── SVG BALANCE CHART ─────────────────────────────────────────────────────────
// Palette: [solid color, light extension color]

function renderBalanceChart(accounts) {
  _balanceData = accounts;
  const wrap = document.getElementById('balanceChartWrapper');
  if (!wrap) return;
  if (!accounts.length) {
    wrap.innerHTML = `<p class="empty-state">${t('chart_no_accounts')}</p>`;
    return;
  }
  _balanceView === 'delta'
    ? _renderBalanceDelta(accounts, wrap)
    : _renderBalanceCompare(accounts, wrap);
}

function _renderBalanceCompare(accounts, wrap) {
  const W   = Math.max(wrap.clientWidth || 0, 280);
  const LW  = Math.min(100, Math.floor(W * 0.27));  // label area
  const RW  = 148;                                    // right values area
  const BW  = Math.max(40, W - LW - RW - 20);        // bar area
  const RH  = 62;                                     // row height
  const PAD = 10;
  const LEG = 24;
  const H   = accounts.length * RH + PAD * 2 + LEG + 4;
  const maxV = Math.max(...accounts.flatMap(a => [Math.abs(a.now), Math.abs(a.future)]), 1);

  let rows = '';
  accounts.forEach((a, i) => {
    const [baseCol, lightCol] = balPal(i);
    const isNeg = a.now < 0;
    const col   = isNeg ? CHART.neg : baseCol;
    const ext   = isNeg ? mixHex(CHART.neg, CHART.bg, 0.45) : lightCol;

    const y0    = PAD + i * RH;
    const barY  = y0 + 14;
    const barH  = 26;
    const nowPx = Math.max(0, (Math.abs(a.now)    / maxV) * BW);
    const futPx = Math.max(0, (Math.abs(a.future) / maxV) * BW);
    const delta  = a.future - a.now;
    const pct    = a.now !== 0 ? (delta / Math.abs(a.now) * 100).toFixed(1) : null;
    const up     = delta > 0;
    const flat   = Math.abs(delta) < 0.005;
    const arrow  = up ? '↑' : flat ? '→' : '↓';
    const acol   = up ? CHART.pos : flat ? CHART.muted : CHART.neg;

    // Background track
    const track = `<rect x="${LW + 8}" y="${barY}" width="${BW}" height="${barH}" rx="5" fill="${CHART.track}"/>`;

    // Today bar
    const todayBar = nowPx > 0
      ? `<rect x="${LW + 8}" y="${barY}" width="${nowPx}" height="${barH}" rx="5" fill="${esc(col)}" opacity="0.88"/>`
      : '';

    // Future delta overlay (gain extension or loss overlay)
    let futOver = '';
    if (!flat) {
      const extX = LW + 8 + Math.min(nowPx, futPx);
      const extW = Math.abs(futPx - nowPx);
      if (extW > 1) {
        const da = up ? `stroke="${esc(col)}" stroke-width="1" stroke-dasharray="4,2"` : '';
        futOver = `<rect x="${extX}" y="${barY + 5}" width="${extW}" height="${barH - 10}" rx="3" fill="${esc(ext)}" opacity="${up ? '0.65' : '0.55'}" ${da}/>`;
      }
    }

    // Future marker line (vertical dashed)
    const futLine = `<line x1="${LW + 8 + futPx}" y1="${barY - 5}" x2="${LW + 8 + futPx}" y2="${barY + barH + 5}" stroke="${esc(acol)}" stroke-width="2.5" stroke-linecap="round"/>`;

    // Account name
    const lbl  = a.label.length > 13 ? a.label.slice(0, 12) + '…' : a.label;
    const nameEl = `<text x="${LW + 4}" y="${barY + barH / 2 + 4}" text-anchor="end" font-size="12" fill="${CHART.text}" font-family="${CHART.font}" font-weight="500">${esc(lbl)}</text>`;

    // Right column
    const rx = LW + BW + 18;
    const todayTxt  = `<text x="${rx}" y="${barY + 10}"  font-size="10" fill="${CHART.muted}" font-family="${CHART.font}">${t('chart_today')}: ${esc(fmtEuro(a.now))}</text>`;
    const futureTxt = `<text x="${rx}" y="${barY + barH - 2}" font-size="11" fill="${esc(acol)}" font-weight="600" font-family="${CHART.font}">${esc(arrow)} ${esc(fmtEuro(a.future))}${pct ? ' (' + (up ? '+' : '') + esc(pct) + '%)' : ''}</text>`;

    const ttip = `<title>${esc(a.label)}: ${t('chart_today')} ${esc(fmtEuro(a.now))} → ${t('chart_forecast')} ${esc(fmtEuro(a.future))}${pct ? ' (' + (up ? '+' : '') + pct + '%)' : ''}</title>`;

    rows += `<g>${ttip}${track}${todayBar}${futOver}${futLine}${nameEl}${todayTxt}${futureTxt}</g>\n`;
  });

  // Legend
  const legY = PAD + accounts.length * RH + 4;
  const legend = `
    <rect x="${LW + 8}" y="${legY + 4}" width="14" height="13" rx="3" fill="${CHART.cats[0]}" opacity="0.88"/>
    <text x="${LW + 26}" y="${legY + 14}" font-size="10" fill="${CHART.muted}" font-family="${CHART.font}">${t('chart_today')}</text>
    <rect x="${LW + 78}" y="${legY + 4}" width="14" height="13" rx="3" fill="${mixHex(CHART.cats[0], CHART.bg, 0.5)}" opacity="0.65" stroke="${CHART.cats[0]}" stroke-width="1" stroke-dasharray="4,2"/>
    <text x="${LW + 96}" y="${legY + 14}" font-size="10" fill="${CHART.muted}" font-family="${CHART.font}">${t('chart_increase')}</text>
    <rect x="${LW + 158}" y="${legY + 4}" width="14" height="13" rx="3" fill="${mixHex(CHART.neg, CHART.bg, 0.45)}" opacity="0.55"/>
    <text x="${LW + 176}" y="${legY + 14}" font-size="10" fill="${CHART.muted}" font-family="${CHART.font}">${t('chart_decrease')}</text>
    <line x1="${LW + 228}" y1="${legY + 10}" x2="${LW + 241}" y2="${legY + 10}" stroke="${CHART.pos}" stroke-width="2.5" stroke-linecap="round"/>
    <text x="${LW + 245}" y="${legY + 14}" font-size="10" fill="${CHART.muted}" font-family="${CHART.font}">${t('chart_forecast')}</text>`;

  wrap.innerHTML = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;overflow:visible">${rows}${legend}</svg>`;
}

function _renderBalanceDelta(accounts, wrap) {
  const W    = Math.max(wrap.clientWidth || 0, 280);
  const LW   = Math.min(100, Math.floor(W * 0.27));
  const RW   = 140;
  const BW   = Math.max(40, W - LW - RW - 20);
  const RH   = 52;
  const PAD  = 16;
  const H    = accounts.length * RH + PAD * 2;
  const midX = LW + 8 + BW / 2;

  const maxD = Math.max(...accounts.map(a => Math.abs(a.future - a.now)), 1);

  let rows = '';
  accounts.forEach((a, i) => {
    const y0    = PAD + i * RH;
    const barY  = y0 + 6;
    const barH  = 32;
    const delta = a.future - a.now;
    const pct   = a.now !== 0 ? (delta / Math.abs(a.now) * 100).toFixed(1) : null;
    const up    = delta >= 0;
    const flat  = Math.abs(delta) < 0.005;
    const col   = flat ? CHART.muted : up ? CHART.pos : CHART.neg;
    const hw    = flat ? 0 : (Math.abs(delta) / maxD) * (BW / 2);
    const sign  = delta > 0 ? '+' : '';

    const track = `<rect x="${LW + 8}" y="${barY + 8}" width="${BW}" height="${barH - 16}" rx="3" fill="${CHART.track}"/>`;
    const zline = `<line x1="${midX}" y1="${barY}" x2="${midX}" y2="${barY + barH}" stroke="${CHART.axis}" stroke-width="1.5"/>`;
    const bar   = flat
      ? `<circle cx="${midX}" cy="${barY + barH / 2}" r="5" fill="${CHART.muted}"/>`
      : `<rect x="${up ? midX : midX - hw}" y="${barY + 5}" width="${hw}" height="${barH - 10}" rx="3" fill="${esc(col)}" opacity="0.82"/>`;

    const lbl    = a.label.length > 13 ? a.label.slice(0, 12) + '…' : a.label;
    const nameEl = `<text x="${LW + 4}" y="${barY + barH / 2 + 5}" text-anchor="end" font-size="12" fill="${CHART.text}" font-family="${CHART.font}" font-weight="500">${esc(lbl)}</text>`;

    const rx     = LW + BW + 18;
    const valTxt = `<text x="${rx}" y="${barY + barH / 2 - 2}" font-size="11" fill="${esc(col)}" font-weight="600" font-family="${CHART.font}">${esc(sign + fmtEuro(delta))}</text>`;
    const pctTxt = pct
      ? `<text x="${rx}" y="${barY + barH / 2 + 13}" font-size="10" fill="${esc(col)}" font-family="${CHART.font}">${esc(sign + pct + '%')}</text>`
      : '';

    const ttip = `<title>${esc(a.label)}: ${esc(sign + fmtEuro(delta))}${pct ? ' (' + sign + pct + '%)' : ''}</title>`;

    rows += `<g>${ttip}${track}${zline}${bar}${nameEl}${valTxt}${pctTxt}</g>\n`;
  });

  const zeroLbl = `<text x="${midX}" y="${PAD - 4}" text-anchor="middle" font-size="10" fill="${CHART.axis}" font-family="${CHART.font}">${t('chart_change')}</text>`;

  wrap.innerHTML = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;overflow:visible">${zeroLbl}${rows}</svg>`;
}

function renderExpenseCategoryChart(catData) {
  catData = foldCategories(catData);
  if (_expView === 'bars') { _renderExpBarsChart(catData); return; }
  _renderExpDonutChart(catData);
}

function _renderExpDonutChart(catData) {
  const canvas = document.getElementById('expenseCategoryChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W   = canvas.parentElement.clientWidth - 40;

  // Palette
  const COLORS = CHART.cats;

  const items = catData.map((c, i) => ({ ...c, color: COLORS[i % COLORS.length] }));

  // ── Empty state ──────────────────────────────────────────────
  if (!items.length) {
    canvas.width = W; canvas.height = 60;
    ctx.clearRect(0, 0, W, 60);
    ctx.fillStyle = CHART.muted; ctx.font = `13px ${CHART.font}`; ctx.textAlign = 'center';
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
    ctx.strokeStyle = CHART.bg;
    ctx.lineWidth = 2;
    ctx.stroke();
    angle += sweep;
  });

  // ── Center label (total) ─────────────────────────────────────
  ctx.textAlign = 'center';
  ctx.fillStyle = CHART.strong;
  ctx.font = `bold ${donutR >= 80 ? 13 : 11}px ${CHART.font}`;
  ctx.fillText(fmtEuro(total).replace(' €', '€'), cx, cy + 5);
  ctx.fillStyle = CHART.muted;
  ctx.font = `9px ${CHART.font}`;
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
    ctx.fillStyle = CHART.text;
    ctx.font = `11px ${CHART.font}`;
    ctx.textAlign = 'left';
    const lbl = c.category.length > maxLabelChars
      ? c.category.slice(0, maxLabelChars - 1) + '…'
      : c.category;
    ctx.fillText(`${lbl} (${pct}%)`, lgX + 15, y + 14);

    // Amount — right-aligned
    ctx.fillStyle = CHART.strong;
    ctx.font = `bold 11px ${CHART.font}`;
    ctx.textAlign = 'right';
    ctx.fillText(fmtEuro(c.amount).replace(' €', '€'), lgX + lgW, y + 14);
  });
}

function _renderExpBarsChart(catData) {
  const canvas = document.getElementById('expenseCategoryChart');
  if (!canvas) return;
  const ctx  = canvas.getContext('2d');
  const W    = canvas.parentElement.clientWidth - 40;
  const COLORS = CHART.cats;

  if (!catData.length) {
    canvas.width = W; canvas.height = 60;
    ctx.clearRect(0, 0, W, 60);
    ctx.fillStyle = CHART.muted; ctx.font = `13px ${CHART.font}`; ctx.textAlign = 'center';
    ctx.fillText(t('dash_no_expenses'), W / 2, 34);
    return;
  }

  const total  = catData.reduce((s, c) => s + c.amount, 0);
  const maxAmt = catData[0].amount;
  const BAR_H  = 26;
  const GAP    = 9;
  const LW     = Math.min(150, Math.floor(W * 0.36));
  const RW     = 95;
  const BW     = W - LW - RW - 8;
  const H      = catData.length * (BAR_H + GAP) + GAP + 22;

  canvas.width  = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  catData.forEach((c, i) => {
    const y   = GAP + i * (BAR_H + GAP);
    const col = COLORS[i % COLORS.length];
    const bw  = Math.max(2, (c.amount / maxAmt) * BW);
    const pct = Math.round(c.amount / total * 100);

    // Track
    ctx.fillStyle = CHART.track;
    roundRect(ctx, LW, y, BW, BAR_H, 5); ctx.fill();

    // Bar
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.85;
    roundRect(ctx, LW, y, bw, BAR_H, 5); ctx.fill();
    ctx.globalAlpha = 1;

    // Category label
    const lbl = c.category.length > 21 ? c.category.slice(0, 20) + '…' : c.category;
    ctx.fillStyle = CHART.text;
    ctx.font = `11px ${CHART.font}`;
    ctx.textAlign = 'right';
    ctx.fillText(lbl, LW - 6, y + BAR_H / 2 + 4);

    // Percentage inside bar (if wide enough)
    if (bw > 32) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold 10px ${CHART.font}`;
      ctx.textAlign = 'left';
      ctx.fillText(pct + '%', LW + 6, y + BAR_H / 2 + 4);
    }

    // Amount right
    ctx.fillStyle = CHART.strong;
    ctx.font = `bold 11px ${CHART.font}`;
    ctx.textAlign = 'left';
    ctx.fillText(fmtEuro(c.amount).replace(' €', '€'), LW + BW + 7, y + BAR_H / 2 + 4);
  });

  // Total footer
  ctx.fillStyle = CHART.muted;
  ctx.font = `10px ${CHART.font}`;
  ctx.textAlign = 'left';
  ctx.fillText(t('dash_total') + ': ' + fmtEuro(total), LW, H - 5);
}

// ── DAILY BALANCE LINE CHART ─────────────────────────────────

function renderDailyBalanceChart() {
  const wrap = document.getElementById('dailyBalanceWrapper');
  if (!wrap) return;
  if (!state.accounts.length) {
    wrap.innerHTML = '<p class="empty-state">—</p>';
    return;
  }

  const todayStr = today();
  const fd       = calcFutureDate(state);

  // Build a data series per account
  const series = state.accounts.map((acc, idx) => {
    const points = dailyBalancePoints(acc, state.transactions, todayStr, fd);

    return { label: acc.name, color: balPal(idx)[0], points };
  });

  // All "breakpoint" dates (transaction dates + today + fd) for X axis
  const breakDates = [...new Set([
    todayStr, fd,
    ...series.flatMap(s => s.points.map(p => p.date))
  ])].sort();

  // Layout constants
  const W  = Math.max(wrap.clientWidth || 0, 300);
  const H  = 230;
  const ML = 72;   // left margin for Y labels
  const MR = 16;
  const MT = 20;
  const MB = 50;   // bottom margin for X labels + legend
  const CW = W - ML - MR;
  const CH = H - MT - MB;

  // X scale: proportional to real calendar days
  const t0     = new Date(todayStr).getTime();
  const t1     = new Date(fd).getTime();
  const totMs  = Math.max(t1 - t0, 86400000); // minimum 1 day
  const xOf    = d => ML + ((new Date(d).getTime() - t0) / totMs) * CW;

  // Y scale
  const allVals = series.flatMap(s => s.points.map(p => p.value));
  let yMin = Math.min(...allVals);
  let yMax = Math.max(...allVals);
  if (yMin === yMax) { yMin -= 200; yMax += 200; }
  const yPad = (yMax - yMin) * 0.12;
  yMin -= yPad; yMax += yPad;
  const yOf = v => MT + CH - ((v - yMin) / (yMax - yMin)) * CH;

  // Compact Y axis formatter
  const fmtAx = v => {
    const sign = v < 0 ? '-' : '';
    const abs  = Math.abs(v);
    if (abs >= 1000) {
      const k = (abs / 1000).toFixed(1).replace('.0', '');
      return sign + (getLang() === 'en' ? k : k.replace('.', ',')) + 'k €';
    }
    return sign + Math.round(abs) + ' €';
  };

  // Y gridlines + labels
  let gridSvg = '', yLabels = '';
  for (let i = 0; i <= 4; i++) {
    const v = yMin + (yMax - yMin) * (i / 4);
    const y = yOf(v).toFixed(1);
    gridSvg  += `<line x1="${ML}" y1="${y}" x2="${ML + CW}" y2="${y}" stroke="${CHART.grid}" stroke-width="1"/>`;
    yLabels  += `<text x="${ML - 6}" y="${(parseFloat(y) + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="${CHART.muted}" font-family="${CHART.font}">${fmtAx(v)}</text>`;
  }

  // X axis labels (max 6, evenly spaced)
  let xLabels = '';
  const nLbl  = Math.min(breakDates.length, 6);
  const step  = (breakDates.length - 1) / Math.max(nLbl - 1, 1);
  for (let i = 0; i < nLbl; i++) {
    const bd = breakDates[Math.min(Math.round(i * step), breakDates.length - 1)];
    const x  = xOf(bd).toFixed(1);
    const [, mm, dd] = bd.split('-');
    xLabels += `<text x="${x}" y="${(MT + CH + 15).toFixed(1)}" text-anchor="middle" font-size="10" fill="${CHART.muted}" font-family="${CHART.font}">${dd}/${mm}</text>`;
  }

  // "Σήμερα" vertical dashed marker
  const tx = xOf(todayStr).toFixed(1);
  const todayMarker = `<line x1="${tx}" y1="${MT}" x2="${tx}" y2="${MT + CH}" stroke="${CHART.axis}" stroke-width="1.5" stroke-dasharray="4,3"/>
    <text x="${tx}" y="${MT - 5}" text-anchor="middle" font-size="9" fill="${CHART.muted}" font-family="${CHART.font}">${t('chart_today')}</text>`;

  // Series: polylines (carry-forward step) + dots at real data points
  let seriesSvg = '';
  series.forEach(s => {
    // Carry-forward value at each breakpoint
    const coords = breakDates.map(d => {
      let val = null;
      for (const p of s.points) {
        if (p.date <= d) val = p.value;
        else break;
      }
      return val !== null ? { x: xOf(d), y: yOf(val), v: val } : null;
    });

    // Polyline
    let path = '';
    coords.forEach(c => {
      if (!c) return;
      path += (path ? ` L${c.x.toFixed(1)},${c.y.toFixed(1)}` : `M${c.x.toFixed(1)},${c.y.toFixed(1)}`);
    });
    if (path) seriesSvg += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;

    // Dots at actual transaction change points
    s.points.forEach(p => {
      const cx = xOf(p.date).toFixed(1);
      const cy = yOf(p.value).toFixed(1);
      const [, mm, dd] = p.date.split('-');
      seriesSvg += `<circle cx="${cx}" cy="${cy}" r="5" fill="${s.color}" stroke="${CHART.bg}" stroke-width="2"><title>${esc(s.label)}: ${dd}/${mm} → ${fmtEuro(p.value)}</title></circle>`;
    });
  });

  // Legend (centered below chart)
  const legY      = H - 14;
  const legItemW  = Math.min(150, Math.floor(CW / series.length));
  const legStartX = ML + (CW - series.length * legItemW) / 2;
  let legSvg = '';
  series.forEach((s, i) => {
    const lx  = (legStartX + i * legItemW).toFixed(1);
    const lbl = s.label.length > 14 ? s.label.slice(0, 13) + '…' : s.label;
    legSvg += `<line x1="${lx}" y1="${legY - 4}" x2="${(parseFloat(lx) + 18).toFixed(1)}" y2="${legY - 4}" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="${(parseFloat(lx) + 9).toFixed(1)}" cy="${legY - 4}" r="3" fill="${s.color}"/>
      <text x="${(parseFloat(lx) + 24).toFixed(1)}" y="${legY}" font-size="10" fill="${CHART.text}" font-family="${CHART.font}">${esc(lbl)}</text>`;
  });

  // Axes border
  const axes = `<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + CH}" stroke="${CHART.axis}" stroke-width="1.5"/>
    <line x1="${ML}" y1="${MT + CH}" x2="${ML + CW}" y2="${MT + CH}" stroke="${CHART.axis}" stroke-width="1.5"/>`;

  wrap.innerHTML = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;overflow:visible">
    ${gridSvg}${axes}${todayMarker}${seriesSvg}${yLabels}${xLabels}${legSvg}
  </svg>`;
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
