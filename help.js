/* ============================================================
   Family FiN — Help page
   Loads README(.en).md and renders it with a small Markdown subset.
   ============================================================ */

'use strict';

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
const HELP_ICONS = new Set(['edit','trash','check','box','copy','eye','eye-off','export','import',
  'home','tx','income','card','inst','sub','gear','help','logo','monitor','sun','moon','plus','x','bank','wallet','alert']);

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
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')    // strip links → plain text
    .replace(/\{\{([a-z][a-z-]*)\}\}/g, (_, n) => HELP_ICONS.has(n)       // {{edit}} → app SVG icon
      ? `<svg class="help-ico" aria-hidden="true"><use href="#i-${n}"/></svg>` : _);

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
    out.push('<div class="table-scroll-wrap"><table class="help-table"><tbody>');
    dataRows.forEach((row, idx) => {
      const cells = row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const tag   = idx === 0 ? 'th' : 'td';
      out.push(`<tr>${cells.map(c => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`);
    });
    out.push('</tbody></table></div>');
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
    if ((m = line.match(/^(#{1,4}) (.+)/))) {
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
