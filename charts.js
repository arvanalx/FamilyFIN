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
let _expChartOffset = 0;      // 0 = current month, -1 = previous, etc.
let _expView = 'donut';       // 'donut' | 'bars'

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

  // Months that have already happened (all of them for past years) and have expenses
  const lastIdx = year < curYear ? 11 : year === curYear ? curMon - 1 : -1;
  const seen    = totals.slice(0, lastIdx + 1).map((v, i) => ({ v, i })).filter(m => m.v > 0);
  const sum     = seen.reduce((s, m) => s + m.v, 0);
  const avg     = seen.length ? sum / seen.length : 0;
  const top     = seen.reduce((b, m) => (!b || m.v > b.v ? m : b), null);
  const full    = t('months_full');
  const months  = t('months');

  const W      = Math.max(wrap.clientWidth || 300, 300);
  const H      = 230;
  const padL   = 46, padR = avg ? 50 : 10, padT = 26, padB = 34;
  const cW     = W - padL - padR;
  const cH     = H - padT - padB;
  const dom    = niceDomain(0, Math.max(...totals, 1));
  const maxVal = dom.max;
  const slotW  = cW / 12;
  const barW   = Math.max(6, slotW * 0.6);
  const gap    = (slotW - barW) / 2;
  const yOf    = v => padT + cH - (v / maxVal) * cH;
  const curIdx = year === curYear ? curMon - 1 : -9;

  let svg = '';
  for (let v = dom.step; v <= maxVal + 1e-9; v += dom.step) {
    const yg = yOf(v).toFixed(1);
    svg += `<line x1="${padL}" y1="${yg}" x2="${W - padR}" y2="${yg}" stroke="${CHART.grid}" stroke-width="1"/>`;
    svg += `<text x="${padL - 6}" y="${(+yg + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="${CHART.muted}" font-family="${CHART.num}">${esc(fmtAxisVal(v))}</text>`;
  }
  svg += `<line x1="${padL}" y1="${(padT + cH).toFixed(1)}" x2="${W - padR}" y2="${(padT + cH).toFixed(1)}" stroke="${CHART.axis}" stroke-width="1.5"/>`;

  totals.forEach((val, i) => {
    const isCurrent = i === curIdx;
    const isFuture  = i > lastIdx;
    const barH  = val > 0 ? Math.max(2, (val / maxVal) * cH) : 0;
    const x     = padL + i * slotW + gap;
    const y     = padT + cH - barH;
    // Current month in the accent; months above average a shade stronger than the rest
    const fill  = isCurrent ? CHART.accent
                : mixHex(CHART.accent, CHART.bg, isFuture ? 0.2 : avg && val > avg ? 0.45 : 0.28);

    if (barH) svg += `<path d="M${x.toFixed(1)},${(padT + cH).toFixed(1)} V${(y + Math.min(4, barH)).toFixed(1)} q0,-4 4,-4 H${(x + barW - 4).toFixed(1)} q4,0 4,4 V${(padT + cH).toFixed(1)} Z" fill="${fill}"${isFuture ? ' opacity="0.6"' : ''}/>`;

    // Amounts only where they matter: the current month and the most expensive one
    if (val > 0 && (isCurrent || (top && i === top.i))) {
      const txt = slotW >= 52 ? fmtEuro(val).replace(/,\d\d €$/, ' €') : fmtAxisVal(val);
      svg += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="${isCurrent ? CHART.strong : CHART.text}" font-family="${CHART.num}">${esc(txt)}</text>`;
    }

    // On narrow screens label every other month (and always the current one)
    if (slotW >= 32 || isCurrent || (i % 2 === 0 && Math.abs(i - curIdx) !== 1)) {
      svg += `<text x="${(x + barW / 2).toFixed(1)}" y="${(padT + cH + 17).toFixed(1)}" text-anchor="middle" font-size="11" fill="${isCurrent ? CHART.strong : CHART.muted}" font-weight="${isCurrent ? 700 : 400}" font-family="${CHART.font}">${esc(months[i])}</text>`;
    }

    const lines = [`${full[i]} ${year}`, [fill, t('stat_expense'), fmtEuro(val)]];
    if (avg && val > 0 && !isFuture) {
      const diff = val - avg;
      lines.push(`${diff >= 0 ? '+' : '−'}${fmtEuro(Math.abs(diff))} ${t('chart_vs_avg')}`);
    }
    svg += `<rect x="${(padL + i * slotW).toFixed(1)}" y="${padT}" width="${slotW.toFixed(1)}" height="${cH}" fill="transparent" data-tip="${tipData(lines)}"/>`;
  });

  // Average line
  if (avg) {
    const ya = yOf(avg).toFixed(1);
    svg += `<line x1="${padL}" y1="${ya}" x2="${W - padR}" y2="${ya}" stroke="${CHART.strong}" stroke-width="1.25" stroke-dasharray="5,4" opacity="0.7" pointer-events="none"/>`;
    svg += `<text x="${W - padR + 6}" y="${(+ya - 2).toFixed(1)}" font-size="11" font-weight="600" fill="${CHART.text}" font-family="${CHART.font}">${esc(t('chart_avg_short'))}</text>`;
    svg += `<text x="${W - padR + 6}" y="${(+ya + 12).toFixed(1)}" font-size="11" fill="${CHART.muted}" font-family="${CHART.num}">${esc(fmtCompact(avg, true))}</text>`;
  }

  const summary = seen.length ? `<div class="chart-summary">
      <span>${t('chart_year_total')} <b>${esc(fmtEuro(sum))}</b></span>
      <span>${t('chart_avg')} <b>${esc(fmtEuro(avg))}</b>${t('per_month')}</span>
      <span>${t('chart_highest')} <b>${esc(full[top.i])} · ${esc(fmtEuro(top.v))}</b></span>
    </div>` : '';

  wrap.innerHTML = summary + chartSvg(W, H, svg, t('dash_expense_by_month'));
  bindChartTips(wrap);
}

// ── ACCOUNT CHANGES (today → forecast) ───────────────────────
// One row per account on a shared axis: ring = today, dot = forecast, joined by a line
// that is green when the balance rises and red when it falls. Zero is always on the axis.

function renderBalanceChart(accounts) {
  _balanceData = accounts;
  const wrap = document.getElementById('balanceChartWrapper');
  if (!wrap) return;
  if (!accounts.length) {
    wrap.innerHTML = `<p class="empty-state">${t('chart_no_accounts')}</p>`;
    return;
  }

  const W      = Math.max(wrap.clientWidth || 0, 280);
  const narrow = W < 520;
  const LW     = narrow ? 0 : Math.min(130, Math.floor(W * 0.22));   // names column
  const RW     = narrow ? 0 : 170;                                    // amount + change column
  const RH     = narrow ? 62 : 52;
  const TOP    = 6;
  const plotB  = TOP + accounts.length * RH;
  const H      = plotB + 26;

  const vals = accounts.flatMap(a => [a.now, a.future]);
  const dom  = niceDomain(Math.min(0, ...vals), Math.max(0, ...vals), narrow ? 3 : 4);
  const X0   = LW + 10, X1 = W - RW - 10;
  const xOf  = v => X0 + (v - dom.min) / (dom.max - dom.min) * (X1 - X0);

  const chip = (delta, x, y, anchor) => {
    const flat = Math.abs(delta) < 0.005, up = delta > 0;
    const col  = flat ? CHART.muted : up ? CHART.pos : CHART.neg;
    const txt  = flat ? t('chart_no_change') : `${up ? '▲ +' : '▼ '}${fmtEuro(delta)}`;
    const w    = txt.length * 6.4 + 16;
    const x0   = anchor === 'end' ? x - w : x;
    return `<rect x="${x0.toFixed(1)}" y="${(y - 13).toFixed(1)}" width="${w.toFixed(1)}" height="20" rx="10" fill="${col}" opacity="0.14"/>` +
           `<text x="${(x0 + w / 2).toFixed(1)}" y="${(y + 1).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="600" fill="${col}" font-family="${CHART.num}">${esc(txt)}</text>`;
  };

  // Vertical gridlines + axis values (zero emphasised)
  let svg = '';
  for (let v = dom.min; v <= dom.max + 1e-9; v += dom.step) {
    const x = xOf(v).toFixed(1), zero = Math.abs(v) < 1e-9;
    svg += `<line x1="${x}" y1="${TOP}" x2="${x}" y2="${plotB}" stroke="${zero ? CHART.axis : CHART.grid}" stroke-width="${zero ? 1.5 : 1}"/>`;
    svg += `<text x="${x}" y="${plotB + 17}" text-anchor="middle" font-size="11" fill="${zero ? CHART.text : CHART.muted}" font-weight="${zero ? 600 : 400}" font-family="${CHART.num}">${fmtCompact(v, true)}</text>`;
  }

  accounts.forEach((a, i) => {
    const delta = a.future - a.now;
    const flat  = Math.abs(delta) < 0.005;
    const col   = flat ? CHART.muted : delta > 0 ? CHART.pos : CHART.neg;
    const y     = TOP + i * RH + (narrow ? 42 : RH / 2);
    const xn    = xOf(a.now), xf = xOf(a.future);
    const pct   = a.now !== 0 && !flat ? ` (${delta > 0 ? '+' : ''}${(delta / Math.abs(a.now) * 100).toFixed(1).replace('.', getLang() === 'en' ? '.' : ',')}%)` : '';
    const amt   = fmtEuro(a.future);

    if (narrow) {
      svg += `<text x="${X0}" y="${y - 22}" font-size="12" font-weight="600" fill="${CHART.text}" font-family="${CHART.font}">${esc(a.label.length > 18 ? a.label.slice(0, 17) + '…' : a.label)}</text>`;
      svg += `<text x="${X1}" y="${y - 22}" text-anchor="end" font-size="12" font-weight="700" fill="${CHART.strong}" font-family="${CHART.num}">${esc(amt)}</text>`;
      svg += chip(delta, X1 - amt.length * 7.2 - 8, y - 22, 'end');
    } else {
      const lbl = a.label.length > 16 ? a.label.slice(0, 15) + '…' : a.label;
      svg += `<text x="${LW}" y="${y + 4}" text-anchor="end" font-size="12" font-weight="500" fill="${CHART.text}" font-family="${CHART.font}">${esc(lbl)}</text>`;
      svg += `<text x="${X1 + 18}" y="${y - 4}" font-size="12" font-weight="700" fill="${CHART.strong}" font-family="${CHART.num}">${esc(amt)}</text>`;
      svg += chip(delta, X1 + 18, y + 15, 'start');
    }

    svg += `<line x1="${xn.toFixed(1)}" y1="${y}" x2="${xf.toFixed(1)}" y2="${y}" stroke="${col}" stroke-width="3" stroke-linecap="round" opacity="0.55"/>`;
    svg += `<circle cx="${xn.toFixed(1)}" cy="${y}" r="6" fill="${CHART.bg}" stroke="${CHART.muted}" stroke-width="2"/>`;
    svg += `<circle cx="${xf.toFixed(1)}" cy="${y}" r="6.5" fill="${col}" stroke="${CHART.bg}" stroke-width="2"/>`;

    svg += `<rect x="0" y="${TOP + i * RH}" width="${W}" height="${RH}" fill="transparent" data-tip="${tipData([a.label,
      [CHART.muted, t('chart_today'), fmtEuro(a.now)],
      [col, t('chart_forecast'), amt],
      [col, t('chart_change'), (delta > 0 ? '+' : '') + fmtEuro(delta) + pct]])}"/>`;
  });

  const legend = `<div class="chart-legend">
    <span><i class="ring" style="border-color:${CHART.muted}"></i>${t('chart_today')}</span>
    <span><i class="dot" style="background:${CHART.pos}"></i>${t('chart_forecast')} · ${t('chart_increase')}</span>
    <span><i class="dot" style="background:${CHART.neg}"></i>${t('chart_forecast')} · ${t('chart_decrease')}</span>
  </div>`;

  wrap.innerHTML = chartSvg(W, H, svg, t('dash_balance_chart')) + legend;
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

  const series = orderedAccounts().map((acc, idx) => ({
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
