/* CalmNotes — just you, your thoughts. nothing in between. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const ed = $('pad'), meas = $('meas'), statusEl = $('status'), clearBtn = $('clear');
  const menuBtn = $('menuBtn'), menu = $('menu'), about = $('about');
  const KEY = 'calmnotes.pad';
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const MOD = isMac ? '⌘' : 'ctrl';

  /* ---------------- storage ---------------- */
  const store = (() => {
    try {
      const t = '__calmnotes_test__';
      localStorage.setItem(t, t); localStorage.removeItem(t);
      return {
        ok: true,
        get: () => localStorage.getItem(KEY) || '',
        set: v => { try { localStorage.setItem(KEY, v); return true; } catch (e) { return false; } }
      };
    } catch (e) {
      return { ok: false, get: () => '', set: () => false };
    }
  })();

  let saveTimer = null, lastSaved = null;
  function save(showIt) {
    clearTimeout(saveTimer);
    const text = getText();
    if (text === lastSaved) { if (showIt) flash('saved'); return; }
    if (store.set(text)) { lastSaved = text; if (showIt !== false) flash('saved'); }
    else flash(store.ok ? 'storage is full — download a copy' : 'this browser won’t keep notes', true);
  }

  let flashTimer;
  function flash(msg, sticky) {
    statusEl.textContent = msg; statusEl.classList.add('show');
    clearTimeout(flashTimer);
    if (!sticky) flashTimer = setTimeout(() => statusEl.classList.remove('show'), 1600);
  }

  /* ---------------- the editor: one <div> per line ---------------- */
  // Each line is its own element, so a long list item can wrap with a
  // hanging indent: wrapped lines sit under the item's text, not under its marker.
  const lines = () => Array.from(ed.children);
  const getText = () => lines().map(d => d.textContent).join('\n');

  function mkLine(t) {
    const d = document.createElement('div');
    if (t) d.textContent = t; else d.appendChild(document.createElement('br'));
    return d;
  }
  function setText(t) {
    ed.textContent = '';
    for (const l of t.split('\n')) ed.appendChild(mkLine(l));
    refresh();
  }
  let busy = false;                  // true while our own edits run
  function exec(cmd, val) {
    busy = true;
    try { return document.execCommand(cmd, false, val); } finally { busy = false; }
  }

  // Caret: which line, and how many characters into it.
  function caret() {
    const s = getSelection();
    if (!s.rangeCount) return null;
    const r = s.getRangeAt(0);
    let n = r.startContainer;
    while (n && n.parentNode !== ed) n = n.parentNode;
    if (!n || n.nodeType !== 1) return null;
    const pre = document.createRange();
    pre.setStart(n, 0); pre.setEnd(r.startContainer, r.startOffset);
    return { div: n, off: pre.toString().length, collapsed: r.collapsed };
  }
  function posIn(div, off) {
    const w = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
    let t, left = off;
    while ((t = w.nextNode())) { if (left <= t.length) return [t, left]; left -= t.length; }
    const k = div.childNodes.length;
    return [div, k && div.lastChild.nodeName === 'BR' ? k - 1 : k];
  }
  function select(div, s, e = s) {
    const r = document.createRange();
    r.setStart(...posIn(div, s)); r.setEnd(...posIn(div, e));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  function replaceIn(div, s, e, str) {
    select(div, s, e);
    if (str) exec('insertText', str);
    else if (s !== e) exec('delete');
  }

  // Keep the structure tidy: only line <div>s directly inside the editor.
  function normalize() {
    let stray = null, fixed = false;
    for (const n of Array.from(ed.childNodes)) {
      if (n.nodeType === 1 && n.tagName === 'DIV') { stray = null; continue; }
      if (!stray) { stray = document.createElement('div'); ed.insertBefore(stray, n); fixed = true; }
      stray.appendChild(n);
    }
    for (const d of lines()) {
      if (d.querySelector('div,p')) { d.textContent = d.textContent; fixed = true; }  // flatten anything nested
      if (!d.firstChild) d.appendChild(document.createElement('br'));
    }
    if (!ed.firstChild) { ed.appendChild(mkLine('')); fixed = true; }
    return fixed;
  }

  /* ---------------- hanging indent ---------------- */
  const widths = new Map();
  function measure(prefix) {
    if (!widths.has(prefix)) { meas.textContent = prefix; widths.set(prefix, meas.getBoundingClientRect().width); }
    return widths.get(prefix);
  }
  function prefixLen(t) {
    const p = parse(t);
    return p ? p.prefixLen : t.match(/^ */)[0].length;
  }
  function restyle() {
    for (const d of lines()) {
      const t = d.textContent, n = prefixLen(t);
      const w = n ? Math.round(measure(t.slice(0, n)) * 100) / 100 : 0;
      if (d.dataset.h === String(w)) continue;
      d.dataset.h = String(w);
      if (w) { d.style.paddingLeft = w + 'px'; d.style.textIndent = -w + 'px'; }
      else d.removeAttribute('style');
    }
  }
  function refresh() {
    restyle();
    ed.classList.toggle('empty', ed.children.length <= 1 && !ed.textContent);
    document.body.classList.toggle('has-text', !!ed.textContent);
  }
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { widths.clear(); lines().forEach(d => delete d.dataset.h); restyle(); }, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { widths.clear(); lines().forEach(d => delete d.dataset.h); restyle(); });

  /* ---------------- lists, Google Docs style ---------------- */
  const IND = '    ';
  const STYLES = ['num', 'alpha', 'roman'];
  const BUL = ['•', '◦', '▪'];
  const PAT = { num: '\\d{1,3}', alpha: '[a-z]{1,2}', roman: '[ivxlc]{1,6}' };
  const styleOf = l => STYLES[l % 3];
  const toAlpha = n => { let s = ''; while (n > 0) { n--; s = String.fromCharCode(97 + n % 26) + s; n = Math.floor(n / 26); } return s; };
  const fromAlpha = s => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 96, 0);
  const toRoman = n => { let s = ''; for (const [v, r] of [[100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]) while (n >= v) { s += r; n -= v; } return s; };
  const fromRoman = s => { const v = { i: 1, v: 5, x: 10, l: 50, c: 100 }; let n = 0; for (let i = 0; i < s.length; i++) { const a = v[s[i]], b = v[s[i + 1]] || 0; n += a < b ? -a : a; } return n; };
  const label = (n, l) => ({ num: String(n), alpha: toAlpha(n), roman: toRoman(n) })[styleOf(l)];
  const marker = (kind, l, n) => kind === 'bullet' ? BUL[l % 3] : label(n, l) + '.';

  function parse(line) {
    const sp = line.match(/^ */)[0].length, lvl = Math.floor(sp / 4), indent = ' '.repeat(sp), rest = line.slice(sp);
    const b = rest.match(/^([•◦▪\-*]) (.*)$/s);
    if (b) return { kind: 'bullet', lvl, indent, prefixLen: sp + 2, body: b[2] };
    const st = styleOf(lvl), o = rest.match(new RegExp('^(' + PAT[st] + ')\\. (.*)$', 's'));
    if (o) {
      const t = o[1], n = st === 'num' ? parseInt(t, 10) : st === 'alpha' ? fromAlpha(t) : fromRoman(t);
      return { kind: 'ordered', lvl, indent, n, prefixLen: sp + t.length + 2, body: o[2] };
    }
    return null;
  }
  function siblingBefore(div, lvl) {
    for (let d = div.previousElementSibling; d; d = d.previousElementSibling) {
      const p = parse(d.textContent);
      if (!p || p.lvl < lvl) return 0;
      if (p.lvl === lvl) return p.kind === 'ordered' ? p.n : 0;
    }
    return 0;
  }
  // Fix numbering of list lines below `div`, keeping the caret where it is.
  function renumberFrom(div) {
    const keep = caret();
    let start = div;
    while (start.previousElementSibling && parse(start.previousElementSibling.textContent)) start = start.previousElementSibling;
    const count = []; let after = false;
    for (let d = start; d; d = d.nextElementSibling) {
      const p = parse(d.textContent);
      if (!p) { if (after) break; count.length = 0; if (d === div) after = true; continue; }
      count.length = p.lvl + 1;
      if (p.kind === 'ordered') {
        count[p.lvl] = (count[p.lvl] || 0) + 1;
        if (after) {
          const want = p.indent + label(count[p.lvl], p.lvl) + '. ';
          if (d.textContent.slice(0, p.prefixLen) !== want) replaceIn(d, 0, p.prefixLen, want);
        }
      } else count[p.lvl] = 0;
      if (d === div) after = true;
    }
    if (keep) select(keep.div, keep.off);
  }
  function reindent(div, p, dir, off) {
    const lvl = p.lvl + dir, rel = Math.max(0, off - p.prefixLen);
    if (lvl < 0) { replaceIn(div, 0, p.prefixLen, ''); select(div, rel); renumberFrom(div); return; }
    const pre = IND.repeat(lvl) + marker(p.kind, lvl, siblingBefore(div, lvl) + 1) + ' ';
    replaceIn(div, 0, p.prefixLen, pre);
    select(div, pre.length + rel);
    renumberFrom(div);
  }

  try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch (e) {}

  ed.addEventListener('beforeinput', e => {
    if (busy) return;
    const t = e.inputType;

    if (t === 'insertParagraph' || t === 'insertLineBreak') {
      const c = caret();
      if (!c) return;
      const text = c.div.textContent, p = parse(text);
      if (p && c.collapsed && c.off >= p.prefixLen) {
        e.preventDefault();
        if (!p.body.trim()) {                       // empty item: step out
          if (p.lvl > 0) reindent(c.div, p, -1, c.off);
          else { replaceIn(c.div, 0, text.length, ''); renumberFrom(c.div); }
        } else {
          exec('insertParagraph');
          const nd = caret().div;
          replaceIn(nd, 0, 0, p.indent + marker(p.kind, p.lvl, (p.n || 0) + 1) + ' ');
          renumberFrom(nd);
        }
        afterEdit();
        return;
      }
      if (t === 'insertLineBreak') { e.preventDefault(); exec('insertParagraph'); afterEdit(); }
      return;
    }

    if (t === 'deleteContentBackward') {
      const c = caret();
      if (!c || !c.collapsed) return;
      const p = parse(c.div.textContent);
      if (p && c.off === p.prefixLen) {
        e.preventDefault();
        if (p.lvl > 0) reindent(c.div, p, -1, c.off);
        else { replaceIn(c.div, 0, p.prefixLen, ''); renumberFrom(c.div); }
        afterEdit();
      }
    }
  });

  ed.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    const c = caret();
    if (!c) return;
    const p = parse(c.div.textContent);
    if (p) reindent(c.div, p, e.shiftKey ? -1 : 1, c.off);
    else if (!e.shiftKey) exec('insertText', IND);
    afterEdit();
  });

  ed.addEventListener('input', e => {
    if (busy) return;
    if (normalize()) { const c = caret(); if (!c) { const l = ed.lastElementChild; select(l, l.textContent.length); } }
    // "- " or "* " at the start of a line becomes a bullet
    if (e.inputType === 'insertText' && e.data === ' ') {
      const c = caret();
      if (c) {
        const m = c.div.textContent.slice(0, c.off).match(/^( *)[-*] $/);
        if (m) replaceIn(c.div, 0, c.off, m[1] + BUL[Math.floor(m[1].length / 4) % 3] + ' ');
      }
    }
    afterEdit();
  });

  // Paste and drop as plain text only.
  ed.addEventListener('paste', e => {
    e.preventDefault();
    const t = ((e.clipboardData || window.clipboardData).getData('text/plain') || '').replace(/\r\n?/g, '\n');
    const parts = t.split('\n');
    if (parts[0]) exec('insertText', parts[0]);
    for (const part of parts.slice(1)) { exec('insertParagraph'); if (part) exec('insertText', part); }
    normalize(); afterEdit();
  });
  ed.addEventListener('drop', e => e.preventDefault());

  function afterEdit() {
    refresh();
    document.body.classList.add('typing');
    closeMenu();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save(), 1000);
  }

  /* ---------------- quiet chrome ---------------- */
  let lastPt = null;
  document.addEventListener('mousemove', e => {
    if (lastPt && Math.abs(e.clientX - lastPt[0]) + Math.abs(e.clientY - lastPt[1]) > 12) document.body.classList.remove('typing');
    lastPt = [e.clientX, e.clientY];
  });
  document.addEventListener('touchstart', e => { if (!ed.contains(e.target)) document.body.classList.remove('typing'); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(false); });
  window.addEventListener('pagehide', () => save(false));
  window.addEventListener('beforeunload', () => save(false));

  // Another tab changed the note: follow it while this tab isn't in use.
  window.addEventListener('storage', e => {
    if (e.key !== KEY || document.hasFocus()) return;
    setText(e.newValue || ''); lastSaved = getText();
  });

  /* ---------------- clear (undoable) ---------------- */
  let armTimer;
  clearBtn.addEventListener('click', () => {
    if (!clearBtn.classList.contains('arm')) {
      clearBtn.classList.add('arm'); clearBtn.textContent = 'clear everything?';
      armTimer = setTimeout(disarm, 3000);
      return;
    }
    disarm();
    ed.focus();
    if (!ed.textContent) return;
    const r = document.createRange(); r.selectNodeContents(ed);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    exec('delete');
    normalize(); refresh(); save(false);
    flash(`cleared · ${MOD}+z to undo`);
  });
  function disarm() { clearTimeout(armTimer); clearBtn.classList.remove('arm'); clearBtn.textContent = 'clear'; }

  /* ---------------- menu ---------------- */
  function words(t) { const m = t.trim().match(/\S+/g); return m ? m.length : 0; }
  function openMenu() {
    const w = words(getText());
    $('count').textContent = `${w} word${w === 1 ? '' : 's'}`;
    menu.hidden = false; menuBtn.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() { if (!menu.hidden) { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); } }
  menuBtn.addEventListener('click', e => { e.stopPropagation(); menu.hidden ? openMenu() : closeMenu(); });
  document.addEventListener('click', e => { if (!menu.contains(e.target) && e.target !== menuBtn) closeMenu(); });

  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); installPrompt = e;
    menu.querySelector('[data-act="install"]').hidden = false;
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; menu.querySelector('[data-act="install"]').hidden = true; });

  function focusEnd() { ed.focus(); const l = ed.lastElementChild; if (l) select(l, l.textContent.length); }

  const actions = {
    async copy() {
      const t = getText();
      try { await navigator.clipboard.writeText(t); flash('copied'); }
      catch (e) { flash('couldn’t copy — select and copy instead'); }
    },
    download() {
      const d = new Date(), p2 = n => String(n).padStart(2, '0');
      const name = `calmnotes-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.txt`;
      const url = URL.createObjectURL(new Blob([getText()], { type: 'text/plain;charset=utf-8' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    async install() {
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice.catch(() => {});
      installPrompt = null; menu.querySelector('[data-act="install"]').hidden = true;
    },
    about() { about.hidden = false; $('aboutClose').focus(); }
  };
  menu.addEventListener('click', e => {
    const act = e.target.closest('button')?.dataset.act;
    if (!act) return;
    closeMenu();
    actions[act]();
    if (act !== 'about') ed.focus();
  });

  function closeAbout() { about.hidden = true; ed.focus(); }
  $('aboutClose').addEventListener('click', closeAbout);
  about.addEventListener('click', e => { if (e.target === about) closeAbout(); });

  /* ---------------- keyboard ---------------- */
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(true); return; }
    if (e.key === 'Escape') {
      if (!about.hidden) closeAbout();
      else if (!menu.hidden) { closeMenu(); ed.focus(); }
      else disarm();
    }
  });

  /* ---------------- start ---------------- */
  setText(store.get());
  lastSaved = getText();
  focusEnd();
  if (!store.ok) flash('this browser won’t keep notes (private mode?)', true);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
