/* CalmNotes — just you, your thoughts. nothing in between. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const pad = $('pad'), statusEl = $('status'), clearBtn = $('clear');
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
    const text = pad.value;
    if (text === lastSaved) { if (showIt) flash('saved'); return; }
    if (store.set(text)) { lastSaved = text; if (showIt !== false) flash('saved'); }
    else flash(store.ok ? 'storage is full — download a copy' : 'this browser won’t keep notes', true);
  }

  /* ---------------- status ---------------- */
  let flashTimer;
  function flash(msg, sticky) {
    statusEl.textContent = msg; statusEl.classList.add('show');
    clearTimeout(flashTimer);
    if (!sticky) flashTimer = setTimeout(() => statusEl.classList.remove('show'), 1600);
  }

  /* ---------------- layout ---------------- */
  function grow() {
    const y = window.scrollY;
    pad.style.height = 'auto';
    pad.style.height = pad.scrollHeight + 'px';
    window.scrollTo(0, y);
    document.body.classList.toggle('has-text', pad.value.length > 0);
  }

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
  function lineAt(pos) {
    const v = pad.value, s = v.lastIndexOf('\n', pos - 1) + 1;
    let e = v.indexOf('\n', pos); if (e < 0) e = v.length;
    return { s, e, text: v.slice(s, e) };
  }
  // Edit through the browser so undo keeps working.
  function replace(s, e, str) {
    const y = window.scrollY;
    pad.setSelectionRange(s, e);
    const ok = str ? document.execCommand('insertText', false, str) : (s === e || document.execCommand('delete'));
    if (!ok) { pad.setRangeText(str, s, e, 'end'); pad.dispatchEvent(new Event('input')); }
    window.scrollTo(0, y);
  }
  function siblingBefore(lineStart, lvl) {
    if (lineStart === 0) return 0;
    const lines = pad.value.slice(0, lineStart - 1).split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const p = parse(lines[i]);
      if (!p || p.lvl < lvl) return 0;
      if (p.lvl === lvl) return p.kind === 'ordered' ? p.n : 0;
    }
    return 0;
  }
  function renumberAfter() {
    const v = pad.value, caret = pad.selectionStart, lines = v.split('\n'), orig = lines.slice();
    let idx = 0, pos = 0;
    while (idx < lines.length - 1 && pos + lines[idx].length < caret) { pos += lines[idx].length + 1; idx++; }
    let start = idx; while (start > 0 && parse(lines[start - 1])) start--;
    const count = []; let last = -1;
    for (let i = start; i < lines.length; i++) {
      const p = parse(lines[i]);
      if (!p) { if (i > idx) break; count.length = 0; continue; }
      count.length = p.lvl + 1;
      if (p.kind === 'ordered') {
        count[p.lvl] = (count[p.lvl] || 0) + 1;
        if (i > idx) {
          const want = p.indent + label(count[p.lvl], p.lvl) + '. ' + p.body;
          if (want !== lines[i]) { lines[i] = want; last = i; }
        }
      } else count[p.lvl] = 0;
    }
    if (last < 0) return;
    let from = 0; for (let i = 0; i <= idx; i++) from += orig[i].length + 1;
    let to = from; for (let i = idx + 1; i <= last; i++) to += orig[i].length + (i < last ? 1 : 0);
    replace(from, to, lines.slice(idx + 1, last + 1).join('\n'));
    pad.setSelectionRange(caret, caret);
  }
  function reindent(L, p, dir) {
    const lvl = p.lvl + dir;
    const off = Math.max(0, pad.selectionStart - (L.s + p.prefixLen));
    if (lvl < 0) { replace(L.s, L.s + p.prefixLen, ''); pad.setSelectionRange(L.s + off, L.s + off); renumberAfter(); return; }
    const pre = IND.repeat(lvl) + marker(p.kind, lvl, siblingBefore(L.s, lvl) + 1) + ' ';
    replace(L.s, L.s + p.prefixLen, pre);
    const c = L.s + pre.length + off; pad.setSelectionRange(c, c);
    renumberAfter();
  }

  pad.addEventListener('keydown', e => {
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    const a = pad.selectionStart, b = pad.selectionEnd, L = lineAt(a), p = parse(L.text);

    if (e.key === 'Enter' && !e.shiftKey && a === b && p && a >= L.s + p.prefixLen) {
      e.preventDefault();
      if (!p.body.trim()) {
        if (p.lvl > 0) reindent(L, p, -1); else { replace(L.s, L.e, ''); renumberAfter(); }
        return;
      }
      replace(a, a, '\n' + p.indent + marker(p.kind, p.lvl, (p.n || 0) + 1) + ' ');
      renumberAfter(); return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (p) reindent(L, p, e.shiftKey ? -1 : 1);
      else if (!e.shiftKey) replace(a, b, IND);
      return;
    }
    if (e.key === ' ' && a === b) {
      const m = pad.value.slice(L.s, a).match(/^( *)[-*]$/);
      if (m) { e.preventDefault(); replace(L.s, a, m[1] + BUL[Math.floor(m[1].length / 4) % 3] + ' '); }
      return;
    }
    if (e.key === 'Backspace' && a === b && p && a === L.s + p.prefixLen) {
      e.preventDefault();
      if (p.lvl > 0) reindent(L, p, -1);
      else { replace(L.s, L.s + p.prefixLen, ''); renumberAfter(); }
    }
  });

  /* ---------------- typing & saving ---------------- */
  pad.addEventListener('input', () => {
    grow();
    document.body.classList.add('typing');
    closeMenu();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save(), 1000);
  });
  let lastPt = null;
  document.addEventListener('mousemove', e => {
    if (lastPt && Math.abs(e.clientX - lastPt[0]) + Math.abs(e.clientY - lastPt[1]) > 12) document.body.classList.remove('typing');
    lastPt = [e.clientX, e.clientY];
  });
  document.addEventListener('touchstart', e => { if (e.target !== pad) document.body.classList.remove('typing'); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(false); });
  window.addEventListener('pagehide', () => save(false));
  window.addEventListener('beforeunload', () => save(false));

  // Another tab changed the note: follow it while this tab isn't in use.
  window.addEventListener('storage', e => {
    if (e.key !== KEY || document.hasFocus()) return;
    pad.value = e.newValue || ''; lastSaved = pad.value; grow();
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
    if (!pad.value) { pad.focus(); return; }
    pad.focus(); replace(0, pad.value.length, '');
    save(false);
    flash(`cleared · ${MOD}+z to undo`);
  });
  function disarm() { clearTimeout(armTimer); clearBtn.classList.remove('arm'); clearBtn.textContent = 'clear'; }

  /* ---------------- menu ---------------- */
  function words(t) { const m = t.trim().match(/\S+/g); return m ? m.length : 0; }
  function openMenu() {
    const w = words(pad.value);
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

  const actions = {
    async copy() {
      try { await navigator.clipboard.writeText(pad.value); }
      catch (e) { pad.select(); document.execCommand('copy'); pad.setSelectionRange(pad.value.length, pad.value.length); }
      flash('copied');
    },
    download() {
      const d = new Date(), pad2 = n => String(n).padStart(2, '0');
      const name = `calmnotes-${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}.txt`;
      const url = URL.createObjectURL(new Blob([pad.value], { type: 'text/plain;charset=utf-8' }));
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
    if (act !== 'about') pad.focus();
  });

  function closeAbout() { about.hidden = true; pad.focus(); }
  $('aboutClose').addEventListener('click', closeAbout);
  about.addEventListener('click', e => { if (e.target === about) closeAbout(); });

  /* ---------------- keyboard ---------------- */
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(true); return; }
    if (e.key === 'Escape') {
      if (!about.hidden) closeAbout();
      else if (!menu.hidden) { closeMenu(); pad.focus(); }
      else disarm();
    }
  });

  /* ---------------- start ---------------- */
  pad.value = store.get();
  lastSaved = pad.value;
  grow();
  pad.focus();
  pad.setSelectionRange(pad.value.length, pad.value.length);
  if (!store.ok) flash('this browser won’t keep notes (private mode?)', true);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
