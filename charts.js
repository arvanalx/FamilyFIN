/* ============================================================
   Family FiN — Dashboard charts
   SVG rendering only; the numbers come from calc.js.
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
  CHART.num    = cs.getPropertyValue('--font-num').trim() || CHART.font;
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


// ── SHARED HELPERS ────────────────────────────────────────────

// Compact axis label: 1250 → "1,3k", -800 → "-800"
function fmtCompact(v, euro) {
  const sign = v < 0 ? '-' : '';
  const abs  = Math.abs(v);
  let s;
  if (abs >= 1000) {
    s = (abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1).replace('.0', '') + 'k';
  } else {
    s = String(Math.round(abs));
  }
  if (getLang() !== 'en') s = s.replace('.', ',');
  return sign + s + (euro ? ' €' : '');
}
function fmtAxisVal(v) { return fmtCompact(v, false); }

// "Nice" axis domain so gridlines land on round numbers
function niceDomain(min, max, count = 4) {
  if (min === max) { min -= 100; max += 100; }
  const raw  = (max - min) / count;
  const mag  = 10 ** Math.floor(Math.log10(raw));
  const n    = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
}

function chartSvg(W, H, inner, label) {
  return `<svg class="chart-svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" style="display:block;overflow:visible">${inner}</svg>`;
}

// ── TOOLTIP (hover on desktop, tap on touch) ─────────────────
// A tip is a list of lines: a string (first = title, others = note) or [colour, label, value].
// Elements carry it as data-tip='[...]'; nothing is shown while privacy mode is on.
const tipData = lines => esc(JSON.stringify(lines));
let _tipEl = null;

function hideChartTip() {
  if (_tipEl) _tipEl.hidden = true;
  document.querySelectorAll('.chart-cross').forEach(el => el.setAttribute('visibility', 'hidden'));
}

function showChartTip(lines, x, y) {
  if (!lines || document.body.classList.contains('privacy-mode')) { hideChartTip(); return; }
  if (!_tipEl) {
    _tipEl = document.createElement('div');
    _tipEl.className = 'chart-tip';
    _tipEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(_tipEl);
    window.addEventListener('scroll', hideChartTip, { passive: true, capture: true });
    document.addEventListener('pointerdown', e => { if (!e.target.closest?.('.chart-tips')) hideChartTip(); });
  }
  _tipEl.replaceChildren(...lines.map((l, i) => {
    const row = document.createElement('div');
    if (typeof l === 'string') {
      row.className = i === 0 ? 'chart-tip-title' : 'chart-tip-note';
      row.textContent = l;
    } else {
      row.className = 'chart-tip-row';
      const sw = document.createElement('i'); sw.style.background = l[0];
      const lb = document.createElement('span'); lb.textContent = l[1];
      const v  = document.createElement('b'); v.textContent = l[2];
      row.append(sw, lb, v);
    }
    return row;
  }));
  _tipEl.hidden = false;
  const r  = _tipEl.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const left = Math.min(Math.max(8, x - r.width / 2), vw - r.width - 8);
  let top = y - r.height - 10;
  if (top < 8) top = y + 18;
  _tipEl.style.left = left + 'px';
  _tipEl.style.top  = top + 'px';
}

function defaultTipResolve(e) {
  const el = e.target.closest?.('[data-tip]');
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { lines: JSON.parse(el.dataset.tip), x: b.left + b.width / 2, y: b.top };
}

// Wire a chart wrapper once (its contents are re-rendered, the wrapper stays)
function bindChartTips(wrap, resolve) {
  wrap._tipResolve = resolve || defaultTipResolve;
  if (wrap.dataset.tips) return;
  wrap.dataset.tips = '1';
  wrap.classList.add('chart-tips');
  const handle = e => {
    const r = wrap._tipResolve(e);
    if (r) showChartTip(r.lines, r.x, r.y); else hideChartTip();
  };
  wrap.addEventListener('pointermove', handle);
  wrap.addEventListener('pointerdown', handle);
  wrap.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hideChartTip(); });
}

// ── MONTHLY EXPENSES BAR CHART ────────────────────────────────

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
  const H      = 230;
  const padL   = 46, padR = 10, padT = 26, padB = 34;
  const cW     = W - padL - padR;
  const cH     = H - padT - padB;
  const dom    = niceDomain(0, Math.max(...totals, 1));
  const maxVal = dom.max;
  const slotW  = cW / 12;
  const barW   = Math.max(6, slotW * 0.64);
  const gap    = (slotW - barW) / 2;
  const yOf    = v => padT + cH - (v / maxVal) * cH;

  // Gridlines on round values
  let svg = '';
  for (let v = dom.step; v <= maxVal + 1e-9; v += dom.step) {
    const yg = yOf(v).toFixed(1);
    svg += `<line x1="${padL}" y1="${yg}" x2="${W - padR}" y2="${yg}" stroke="${CHART.grid}" stroke-width="1"/>`;
    svg += `<text x="${padL - 6}" y="${(+yg + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="${CHART.muted}" font-family="${CHART.num}">${esc(fmtAxisVal(v))}</text>`;
  }
  svg += `<line x1="${padL}" y1="${(padT + cH).toFixed(1)}" x2="${W - padR}" y2="${(padT + cH).toFixed(1)}" stroke="${CHART.axis}" stroke-width="1.5"/>`;

  const months = t('months');
  const full   = t('months_full');
  totals.forEach((val, i) => {
    const monthNum  = i + 1;
    const isCurrent = year === curYear && monthNum === curMon;
    const isFuture  = year > curYear || (year === curYear && monthNum > curMon);
    const barH  = val > 0 ? Math.max(2, (val / maxVal) * cH) : 0;
    const x     = padL + i * slotW + gap;
    const y     = padT + cH - barH;
    const fill  = isCurrent ? CHART.accent : mixHex(CHART.accent, CHART.bg, isFuture ? 0.22 : 0.5);
    const lblCol = isCurrent ? CHART.strong : CHART.muted;

    if (barH) svg += `<path d="M${x.toFixed(1)},${(padT + cH).toFixed(1)} V${(y + Math.min(4, barH)).toFixed(1)} q0,-4 4,-4 H${(x + barW - 4).toFixed(1)} q4,0 4,4 V${(padT + cH).toFixed(1)} Z" fill="${fill}"${isFuture ? ' opacity="0.6"' : ''}/>`;

    // Compact value above the bar, only where there is room
    if (val > 0 && barH > 18 && barW >= 26) {
      svg += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="11" fill="${isCurrent ? CHART.strong : CHART.text}" font-weight="${isCurrent ? 700 : 500}" font-family="${CHART.num}">${esc(fmtAxisVal(val))}</text>`;
    }
    // On narrow screens label every other month (and always the current one)
    const curIdx = year === curYear ? curMon - 1 : -9;
    if (slotW >= 32 || isCurrent || (i % 2 === 0 && Math.abs(i - curIdx) !== 1)) {
      svg += `<text x="${(x + barW / 2).toFixed(1)}" y="${(padT + cH + 17).toFixed(1)}" text-anchor="middle" font-size="11" fill="${lblCol}" font-weight="${isCurrent ? 700 : 400}" font-family="${CHART.font}">${esc(months[i])}</text>`;
    }

    // Full-height hit area so small bars are easy to tap
    svg += `<rect x="${(padL + i * slotW).toFixed(1)}" y="${padT}" width="${slotW.toFixed(1)}" height="${cH}" fill="transparent" data-tip="${tipData([`${full[i]} ${year}`, [fill, t('stat_expense'), fmtEuro(val)]])}"/>`;
  });

  wrap.innerHTML = chartSvg(W, H, svg, t('dash_expense_by_month'));
  bindChartTips(wrap);
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
  const H   = accounts.length * RH + PAD * 2;
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
    const todayTxt  = `<text x="${rx}" y="${barY + 10}"  font-size="11" fill="${CHART.muted}" font-family="${CHART.font}">${t('chart_today')}: ${esc(fmtEuro(a.now))}</text>`;
    const futureTxt = `<text x="${rx}" y="${barY + barH - 2}" font-size="11" fill="${esc(acol)}" font-weight="600" font-family="${CHART.font}">${esc(arrow)} ${esc(fmtEuro(a.future))}${pct ? ' (' + (up ? '+' : '') + esc(pct) + '%)' : ''}</text>`;

    const hit = `<rect x="0" y="${y0}" width="${W}" height="${RH}" fill="transparent" data-tip="${tipData([a.label,
      [col, t('chart_today'), fmtEuro(a.now)],
      [acol, t('chart_forecast'), fmtEuro(a.future) + (pct ? ' (' + (up ? '+' : '') + pct + '%)' : '')]])}"/>`;

    rows += `<g>${track}${todayBar}${futOver}${futLine}${nameEl}${todayTxt}${futureTxt}${hit}</g>\n`;
  });

  // Legend (HTML, so it wraps instead of overflowing)
  const legend = `<div class="chart-legend">
    <span><i style="background:${CHART.cats[0]}"></i>${t('chart_today')}</span>
    <span><i style="background:${mixHex(CHART.cats[0], CHART.bg, 0.5)};outline:1px dashed ${CHART.cats[0]};outline-offset:-1px"></i>${t('chart_increase')}</span>
    <span><i style="background:${mixHex(CHART.neg, CHART.bg, 0.45)}"></i>${t('chart_decrease')}</span>
    <span><i class="line" style="background:${CHART.pos}"></i>${t('chart_forecast')}</span>
  </div>`;

  wrap.innerHTML = chartSvg(W, H, rows, t('dash_balance_chart')) + legend;
  bindChartTips(wrap);
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
      ? `<text x="${rx}" y="${barY + barH / 2 + 13}" font-size="11" fill="${esc(col)}" font-family="${CHART.font}">${esc(sign + pct + '%')}</text>`
      : '';

    const hit = `<rect x="0" y="${y0}" width="${W}" height="${RH}" fill="transparent" data-tip="${tipData([a.label,
      [col, t('chart_change'), sign + fmtEuro(delta) + (pct ? ' (' + sign + pct + '%)' : '')],
      [CHART.muted, t('chart_today'), fmtEuro(a.now)],
      [CHART.muted, t('chart_forecast'), fmtEuro(a.future)]])}"/>`;

    rows += `<g>${track}${zline}${bar}${nameEl}${valTxt}${pctTxt}${hit}</g>\n`;
  });

  const zeroLbl = `<text x="${midX}" y="${PAD - 4}" text-anchor="middle" font-size="11" fill="${CHART.axis}" font-family="${CHART.font}">${t('chart_change')}</text>`;

  wrap.innerHTML = chartSvg(W, H, zeroLbl + rows, t('dash_balance_chart'));
  bindChartTips(wrap);
}

function renderExpenseCategoryChart(catData) {
  catData = foldCategories(catData);
  const wrap = document.getElementById('expenseCategoryChart');
  if (!wrap) return;
  if (!catData.length) {
    wrap.innerHTML = `<p class="empty-state">${t('dash_no_expenses')}</p>`;
    return;
  }
  const total = catData.reduce((s, c) => s + c.amount, 0);
  const items = catData.map((c, i) => ({
    ...c,
    color: CHART.cats[i],
    pct:   Math.round(c.amount / total * 100),
  }));
  items.forEach(c => { c.tip = tipData([c.category, [c.color, fmtEuro(c.amount), c.pct + '%']]); });
  wrap.innerHTML = _expView === 'bars' ? _expBarsHtml(items, total) : _expDonutHtml(items, total);
  bindChartTips(wrap);
}

// Ring segment between angles a0→a1 (radians, clockwise from 12 o'clock)
function arcPath(cx, cy, R, r, a0, a1) {
  const p = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(R, a0)} A${R},${R} 0 ${large} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${large} 0 ${p(r, a0)} Z`;
}

function _expDonutHtml(items, total) {
  const S = 200, C = S / 2, R = 94, r = 60;
  let a = -Math.PI / 2, segs = '';
  items.forEach(c => {
    const sweep = c.amount / total * 2 * Math.PI;
    // A full ring can't be one arc — split it in two halves
    const parts = sweep > 2 * Math.PI - 1e-6 ? [[a, a + Math.PI], [a + Math.PI, a + sweep]] : [[a, a + sweep]];
    parts.forEach(([s, e]) => {
      segs += `<path d="${arcPath(C, C, R, r, s, e)}" fill="${c.color}"${items.length > 1 ? ` stroke="${CHART.bg}" stroke-width="2"` : ''} data-tip="${c.tip}"/>`;
    });
    a += sweep;
  });
  const centre = `
    <text x="${C}" y="${C + 3}" text-anchor="middle" font-size="17" font-weight="700" fill="${CHART.strong}" font-family="${CHART.num}">${esc(fmtEuro(total).replace(' €', '€'))}</text>
    <text x="${C}" y="${C + 21}" text-anchor="middle" font-size="11" fill="${CHART.muted}" font-family="${CHART.font}">${esc(t('dash_subtotal'))}</text>`;
  const legend = items.map(c => `
    <li data-tip="${c.tip}"><i style="background:${c.color}"></i><span class="lg-name">${esc(c.category)}</span><span class="lg-pct">${c.pct}%</span><b class="lg-val">${esc(fmtEuro(c.amount))}</b></li>`).join('');
  return `<div class="exp-donut">
    <svg class="chart-svg" viewBox="0 0 ${S} ${S}" role="img" aria-label="${esc(t('dash_expense_by_cat'))}">${segs}${centre}</svg>
    <ul class="exp-legend">${legend}</ul>
  </div>`;
}

function _expBarsHtml(items, total) {
  const max = items[0].amount || 1;
  const rows = items.map(c => `
    <div class="exp-bar-row" data-tip="${c.tip}">
      <span class="exp-bar-name">${esc(c.category)}<small>${c.pct}%</small></span>
      <span class="exp-bar-track"><span class="exp-bar-fill" style="width:${Math.max(1, c.amount / max * 100).toFixed(1)}%;background:${c.color}"></span></span>
      <b class="exp-bar-val">${esc(fmtEuro(c.amount))}</b>
    </div>`).join('');
  return `<div class="exp-bars">${rows}<div class="exp-bars-total">${t('dash_total')}: <b>${esc(fmtEuro(total))}</b></div></div>`;
}

// ── DAILY BALANCE (STEP) CHART ───────────────────────────────
// A balance stays flat between transactions and jumps on the day of each one,
// so it is drawn as a step line. Zero is marked whenever it is in range.

function renderDailyBalanceChart() {
  const wrap = document.getElementById('dailyBalanceWrapper');
  if (!wrap) return;
  if (!state.accounts.length) {
    wrap.innerHTML = '<p class="empty-state">—</p>';
    return;
  }

  const todayStr = today();
  const fd       = calcFutureDate(state);
  const DAY      = 86400000;

  const series = state.accounts.map((acc, idx) => ({
    label:  acc.name,
    color:  balPal(idx)[0],
    points: dailyBalancePoints(acc, state.transactions, todayStr, fd),
  }));

  // Layout
  const W  = Math.max(wrap.clientWidth || 0, 300);
  const H  = 240;
  const ML = 56, MR = 14, MT = 16, MB = 30;
  const CW = W - ML - MR;
  const CH = H - MT - MB;

  // X: real calendar days (UTC dates, so no DST drift)
  const t0   = new Date(todayStr).getTime();
  const days = Math.max(1, Math.round((new Date(fd).getTime() - t0) / DAY));
  const xOf  = d => ML + ((new Date(d).getTime() - t0) / DAY / days) * CW;

  // Y: include zero when it is near or crossed, so "how close to 0" is visible
  const vals = series.flatMap(s => s.points.map(p => p.value));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo > 0 && lo < hi * 0.35) lo = 0;
  if (hi < 0) hi = 0;
  const pad = (hi - lo) * 0.08 || 100;
  const dom = niceDomain(lo < 0 || lo === 0 ? lo - (lo < 0 ? pad : 0) : lo - pad, hi + pad);
  const yOf = v => MT + CH - ((v - dom.min) / (dom.max - dom.min)) * CH;

  let svg = '';

  // Negative zone + gridlines
  if (dom.min < 0) {
    const y0 = yOf(Math.min(0, dom.max));
    svg += `<rect x="${ML}" y="${y0.toFixed(1)}" width="${CW}" height="${(MT + CH - y0).toFixed(1)}" fill="${CHART.neg}" opacity="0.07"/>`;
  }
  for (let v = dom.min; v <= dom.max + 1e-9; v += dom.step) {
    const y = yOf(v).toFixed(1);
    const zero = Math.abs(v) < 1e-9 && dom.min < 0;
    svg += `<line x1="${ML}" y1="${y}" x2="${ML + CW}" y2="${y}" stroke="${zero ? CHART.neg : CHART.grid}" stroke-width="${zero ? 1.5 : 1}"${zero ? ' stroke-dasharray="5,4"' : ''}/>`;
    svg += `<text x="${ML - 7}" y="${(+y + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="${zero ? CHART.neg : CHART.muted}" font-weight="${zero ? 600 : 400}" font-family="${CHART.num}">${fmtCompact(v, true)}</text>`;
  }

  // X ticks evenly spread over the period; the first one is "today"
  const nX = Math.max(2, Math.min(6, Math.floor(CW / 85), days + 1));
  const xDates = [...new Set(Array.from({ length: nX }, (_, i) =>
    new Date(t0 + Math.round(i / (nX - 1) * days) * DAY).toISOString().slice(0, 10)))];
  xDates.forEach((d, i) => {
    const [, mm, dd] = d.split('-');
    svg += `<text x="${xOf(d).toFixed(1)}" y="${MT + CH + 19}" text-anchor="${i === 0 ? 'start' : i === xDates.length - 1 ? 'end' : 'middle'}" font-size="11" fill="${i === 0 ? CHART.text : CHART.muted}" font-weight="${i === 0 ? 600 : 400}" font-family="${CHART.font}">${i === 0 ? t('chart_today') : `${dd}/${mm}`}</text>`;
  });
  svg += `<line x1="${ML}" y1="${MT + CH}" x2="${ML + CW}" y2="${MT + CH}" stroke="${CHART.axis}" stroke-width="1.5"/>`;

  // Step lines (+ soft area when there is a single account)
  series.forEach(s => {
    const P = s.points;
    let d = `M${xOf(P[0].date).toFixed(1)},${yOf(P[0].value).toFixed(1)}`;
    for (let i = 1; i < P.length; i++) d += ` H${xOf(P[i].date).toFixed(1)} V${yOf(P[i].value).toFixed(1)}`;
    d += ` H${(ML + CW).toFixed(1)}`;
    if (series.length === 1) {
      const base = yOf(Math.max(dom.min, Math.min(0, dom.max))).toFixed(1);
      svg += `<path d="${d} V${base} H${ML} Z" fill="${s.color}" opacity="0.10"/>`;
    }
    svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.25" stroke-linejoin="round"/>`;
    P.slice(1).forEach(p => {
      svg += `<circle cx="${xOf(p.date).toFixed(1)}" cy="${yOf(p.value).toFixed(1)}" r="3.5" fill="${s.color}" stroke="${CHART.bg}" stroke-width="1.5"/>`;
    });
  });

  // Crosshair (moved by the tooltip handler)
  svg += `<g class="chart-cross" visibility="hidden" pointer-events="none">
    <line y1="${MT}" y2="${MT + CH}" stroke="${CHART.axis}" stroke-width="1.5"/>
    ${series.map(s => `<circle r="5" fill="${s.color}" stroke="${CHART.bg}" stroke-width="2"/>`).join('')}
  </g>`;
  // Capture layer over the plot
  svg += `<rect x="${ML}" y="${MT}" width="${CW}" height="${CH}" fill="transparent"/>`;

  const legend = series.length > 1
    ? `<div class="chart-legend">${series.map(s => `<span><i class="line" style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>`
    : '';
  wrap.innerHTML = chartSvg(W, H, svg, t('dash_daily_balance')) + legend;

  // Value of an account on date d (carry forward the last change)
  const valueAt = (s, d) => {
    let v = s.points[0].value;
    for (const p of s.points) { if (p.date <= d) v = p.value; else break; }
    return v;
  };
  bindChartTips(wrap, e => {
    const el = wrap.querySelector('svg');
    const b  = el.getBoundingClientRect();
    const k  = W / b.width;
    const sx = (e.clientX - b.left) * k;
    const sy = (e.clientY - b.top) * k;
    if (sx < ML - 8 || sx > ML + CW + 8 || sy < MT - 8 || sy > MT + CH + 8) return null;
    const di = Math.round(Math.min(Math.max((sx - ML) / CW, 0), 1) * days);
    const d  = new Date(t0 + di * DAY).toISOString().slice(0, 10);
    const x  = xOf(d);
    const cross = el.querySelector('.chart-cross');
    cross.setAttribute('visibility', 'visible');
    cross.querySelector('line').setAttribute('x1', x);
    cross.querySelector('line').setAttribute('x2', x);
    const vs = series.map(s => valueAt(s, d));
    cross.querySelectorAll('circle').forEach((c, i) => { c.setAttribute('cx', x); c.setAttribute('cy', yOf(vs[i])); });
    return {
      lines: [d === todayStr ? `${t('chart_today')} · ${fmtDate(d)}` : fmtDate(d),
              ...series.map((s, i) => [s.color, s.label, fmtEuro(vs[i])])],
      x: b.left + x / k,
      y: b.top + MT / k,
    };
  });
}
