/**
 * Mobin Panel — UI component library
 * Created by Mobin.A
 *
 * Framework-free DOM helpers: toasts, modals, form controls (toggles,
 * inputs, selects, chip lists), QR rendering (vendored qrcode-generator),
 * particle background and icon set.
 */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  /* --------------------------------- icons -------------------------------- */

  const ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    proxy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>',
    vless: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
    ip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M5 12h14M12 5c2.5 2.6 2.5 11.4 0 14M12 5c-2.5 2.6-2.5 11.4 0 14"/></svg>',
    ech: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.6"/></svg>',
    cdn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" opacity="0.5"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/><path d="M18 6l3-2v8l-3-2"/></svg>',
    fragment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h5M15 7h5M4 12h9M19 12h1M4 17h3M11 17h9"/></svg>',
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="8 6 3 12 8 18"/><polyline points="16 6 21 12 16 18"/><line x1="13.5" y1="4" x2="10.5" y2="20"/></svg>',
    warp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
    warppro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/><path d="M19 8l1.5 1.5M20.5 4.5l1 1" opacity="0.6"/></svg>',
    route: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7.5 6H15a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h7.5" transform="translate(0,-2)"/></svg>',
    transfer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3L4 7l4 4"/><path d="M4 7h16"/><path d="M16 21l4-4-4-4"/><path d="M20 17H4"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 3L2 10.5l7 2.5M22 3l-4 18-8.5-8M22 3L9 13m0 0l-.5 6 4-4.5"/></svg>',
    subs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15v-4M11 15v-6M15 15v-3M19 15v-5"/></svg>',
    copy: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fff" stroke-width="3"><polyline points="4 12.5 9.5 18 20 6"/></svg>',
    download: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    eye: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    qr: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14h1M14 20h1M20 20h1"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  };

  function icon(name, cls = '') {
    const span = el('span', { class: `icon ${cls}`, html: ICONS[name] || '' });
    return span;
  }

  /* --------------------------------- toasts -------------------------------- */

  function toast(message, type = 'info', timeout = 3200) {
    const box = $('#toasts');
    if (!box) return;
    const icons = {
      success: '<svg viewBox="0 0 24 24" class="t-icon" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>',
      error: '<svg viewBox="0 0 24 24" class="t-icon" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info: '<svg viewBox="0 0 24 24" class="t-icon" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.5" fill="currentColor"/></svg>',
    };
    const t = el('div', { class: `toast ${type}`, html: (icons[type] || icons.info) + '' });
    const msg = el('div', { class: 't-msg' }, message);
    t.append(msg, el('div', { class: 't-bar' }));
    box.append(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 400);
    }, timeout);
  }

  /* --------------------------------- modal --------------------------------- */

  function modal({ title, body, actions = [], wide = false, onClose }) {
    const root = $('#modal-root');
    root.innerHTML = '';
    root.classList.remove('hidden');
    const close = () => {
      root.classList.add('hidden');
      root.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
    };
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);

    const m = el('div', { class: 'modal', style: wide ? 'max-width:860px' : '' });
    m.__close = close;
    const h3 = el('h3', {}, el('span', {}, title));
    const x = el('button', {
      class: 'icon-btn',
      title: 'Close',
      onclick: close,
      html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    });
    h3.append(x);
    m.append(h3);
    if (typeof body === 'string') m.append(el('div', { class: 'modal-body' }, body));
    else if (body) m.append(body);
    if (actions.length) {
      const bar = el('div', { class: 'modal-actions' });
      for (const a of actions) bar.append(a);
      m.append(bar);
    }
    root.append(el('div', { class: 'modal-backdrop', onclick: close }), m);
    return { close, node: m };
  }

  /* ------------------------------- form builders --------------------------- */

  function card(title, content, { dot = '', desc = '' } = {}) {
    const c = el('section', { class: 'card' });
    const h = el('h2', {}, el('span', { class: `dot ${dot}` }), title);
    c.append(h);
    if (desc) c.append(el('p', { class: 'card-desc' }, desc));
    if (typeof content === 'string') c.append(el('div', {}, content));
    else if (content) c.append(content);
    return c;
  }

  function field(label, control, hint = '') {
    const f = el('div', { class: 'field' });
    f.append(el('label', {}, label));
    if (typeof control === 'string') f.append(el('div', { class: 'hint' }, control));
    else f.append(control);
    if (hint) f.append(el('p', { class: 'hint' }, hint));
    return f;
  }

  function input({ value = '', type = 'text', mono = false, placeholder = '', id, disabled = false, readonly = false, oninput, onchange, min, max }) {
    const inp = el('input', {
      class: `input ${mono ? 'mono' : ''}`,
      type,
      value,
      placeholder,
      id,
      'data-init': value,
    });
    if (disabled) inp.disabled = true;
    if (readonly) inp.readOnly = true;
    if (min !== undefined) inp.min = String(min);
    if (max !== undefined) inp.max = String(max);
    if (oninput) inp.addEventListener('input', (e) => oninput(e.target.value));
    if (onchange) inp.addEventListener('change', (e) => onchange(e.target.value));
    return inp;
  }

  function select(options, value, oninput) {
    const sel = el('select', { class: 'input' });
    for (const o of options) {
      const opt = el('option', { value: o.value }, o.label);
      if (o.value === value) opt.selected = true;
      sel.append(opt);
    }
    if (oninput) sel.addEventListener('input', (e) => oninput(e.target.value));
    return sel;
  }

  function toggleRow(label, sub, checked, onchange) {
    const row = el('div', { class: 'toggle-row' });
    const labels = el('div', {}, el('div', { class: 'tr-label' }, label));
    if (sub) labels.append(el('div', { class: 'tr-sub' }, sub));
    const t = el('label', { class: 'toggle' });
    const inp = el('input', { type: 'checkbox' });
    if (checked) inp.checked = true;
    inp.addEventListener('change', () => onchange(inp.checked));
    t.append(inp, el('span', { class: 'track' }));
    row.append(labels, t);
    return row;
  }

  function checkGroup(items, selected, onToggle) {
    const grid = el('div', { class: 'check-grid' });
    for (const it of items) {
      const label = el('label', { class: 'check' });
      const inp = el('input', { type: 'checkbox' });
      if (selected.includes(it)) inp.checked = true;
      inp.addEventListener('change', () => onToggle(it, inp.checked));
      label.append(
        inp,
        el('span', { class: 'box', html: ICONS.check }),
        el('span', { class: 'port-label' }, String(it)),
      );
      grid.append(label);
    }
    return grid;
  }

  /** Multi-value chip list with add/remove. */
  function chipList(items, onAdd, onRemove, { placeholder = 'value', mono = true } = {}) {
    const wrap = el('div');
    const chips = el('div', { class: 'chips' });

    const render = () => {
      chips.innerHTML = '';
      if (!items.length) chips.append(el('span', { class: 'empty-note' }, 'no entries yet'));
      for (const it of items) {
        chips.append(
          el('span', { class: 'chip' }, it,
            el('button', {
              type: 'button', class: 'chip-x', title: 'Remove',
              onclick: () => { items.splice(items.indexOf(it), 1); onRemove(items); render(); },
            }, '×'),
        );
      }
    };

    const addBtn = el('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, icon('plus'), 'Add');
    const addInput = input({ placeholder, mono, oninput: (v) => { addInput.value = v; } });
    addBtn.addEventListener('click', () => {
      const v = addInput.value.trim();
      if (v && !items.includes(v)) {
        items.push(v);
        onAdd(items);
        addInput.value = '';
        render();
      }
    });
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
    });
    wrap.append(chips, el('div', { class: 'chip-add' }, addInput, addBtn));
    render();
    return wrap;
  }

  /** Keyed entry list (domain + ips rows). */
  function entryList(entries, onChange, { keyLabel = 'Domain', valLabel = 'Preferred IPs (comma separated)', keyPh = 'example.com', valPh = '1.2.3.4, 5.6.7.8' } = {}) {
    const wrap = el('div');

    const render = () => {
      wrap.innerHTML = '';
      entries.forEach((e, i) => {
        const row = el('div', { class: 'entry-row' });
        const k = input({ value: e.domain, placeholder: keyPh, mono: true });
        const v = input({ value: e.ips, placeholder: valPh, mono: true });
        v.classList.add('grow-2');
        const rm = el('button', { type: 'button', class: 'icon-btn danger', title: 'Remove' }, icon('trash'));
        k.addEventListener('input', () => { e.domain = k.value; onChange(entries); });
        v.addEventListener('input', () => { e.ips = v.value; onChange(entries); });
        rm.addEventListener('click', () => { entries.splice(i, 1); onChange(entries); render(); });
        row.append(k, v, rm);
        wrap.append(row);
      });
      if (!entries.length) wrap.append(el('div', { class: 'empty-note' }, 'no entries'));
      const add = el('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, icon('plus'), `Add ${keyLabel.toLowerCase()}`);
      add.addEventListener('click', () => {
        entries.push({ id: `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, domain: '', ips: '' });
        onChange(entries);
        render();
      });
      wrap.append(add);
    };
    render();
    return wrap;
  }

  /* --------------------------------- QR ------------------------------------ */

  /**
   * Render a QR code onto a canvas using the vendored qrcode-generator.
   * @param {string} text
   * @param {HTMLElement} parent — replaced with a .qr-box canvas
   */
  function renderQR(text, parent, size = 220) {
    parent.innerHTML = '';
    const box = el('div', { class: 'qr-box' });
    const canvas = el('canvas');
    try {
      const qr = new qrcode(0, 'M'); // auto type number, error correction M
      qr.addData(text);
      qr.make();
      const n = qr.getModuleCount();
      const scale = Math.max(2, Math.floor(size / n));
      const quiet = 2;
      canvas.width = (n + quiet * 2) * scale;
      canvas.height = canvas.width;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(8, 8, 14, 0.95)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#eafffb';
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
          }
        }
      }
    } catch (e) {
      box.append(el('div', { class: 'empty-note' }, 'QR unavailable'));
    }
    box.append(canvas);
    parent.append(box);
  }

  /* --------------------------------- copy ---------------------------------- */

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for sandboxed contexts.
      const ta = el('textarea', { style: 'position:fixed;opacity:0' });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  /* ------------------------------ particles -------------------------------- */

  function initParticles() {
    const canvas = $('#particles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h, parts = [];
    const N = window.innerWidth < 700 ? 34 : 64;
    const COLORS = ['0, 255, 255', '255, 0, 255', '57, 255, 20', '122, 92, 255'];

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < N; i++) {
      parts.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.7 + 0.5,
        c: COLORS[(Math.random() * COLORS.length) | 0],
        a: Math.random() * 0.5 + 0.15,
      });
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function tick() {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.c}, ${p.a})`;
        ctx.fill();
      }
      // faint links
      ctx.lineWidth = 0.6;
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const a = parts[i], b = parts[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 130 * 130) {
            const alpha = (1 - Math.sqrt(d2) / 130) * 0.08;
            ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      if (!reduced) requestAnimationFrame(tick);
    }
    tick();
  }

  /* --------------------------------- misc ---------------------------------- */

  function spinner() {
    return el('span', { class: 'spinner' });
  }

  /** Attach the ripple effect to all .btn elements (delegated). */
  function initRipple() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn');
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const d = Math.max(rect.width, rect.height);
      const r = el('span', {
        class: 'ripple',
        style: `width:${d}px;height:${d}px;left:${e.clientX - rect.left - d / 2}px;top:${e.clientY - rect.top - d / 2}px`,
      });
      btn.append(r);
      setTimeout(() => r.remove(), 600);
    });
  }

  window.UI = {
    $, $$, el, icon, ICONS,
    toast, modal,
    card, field, input, select, toggleRow, checkGroup, chipList, entryList,
    renderQR, copy, initParticles, spinner, initRipple,
  };
})();
