/**
 * Mobin Panel — main application
 * Created by Mobin.A
 *
 * SPA bootstrap: auth flow, hash routing, page registry, settings
 * auto-save and all page renderers.
 */
(function () {
  'use strict';

  const { $, el, icon, toast, modal, card, field, input, select, toggleRow, checkGroup, chipList, entryList, renderQR, copy, spinner } = UI;
  const api = MobinAPI;

  /* ------------------------------ static data ------------------------------ */

  const PAGES = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', group: 'Overview' },
    { id: 'proxy', label: 'Proxy Settings', icon: 'proxy', group: 'Configuration' },
    { id: 'vless', label: 'VLESS / Trojan', icon: 'vless', group: 'Configuration' },
    { id: 'proxyip', label: 'Proxy IP', icon: 'ip', group: 'Configuration' },
    { id: 'ech', label: 'ECH', icon: 'ech', group: 'Configuration' },
    { id: 'cdn', label: 'Custom CDN', icon: 'cdn', group: 'Configuration' },
    { id: 'fragment', label: 'Fragment', icon: 'fragment', group: 'Configuration' },
    { id: 'raw', label: 'Raw Configs', icon: 'code', group: 'Configuration' },
    { id: 'warp', label: 'WARP', icon: 'warp', group: 'WARP' },
    { id: 'warppro', label: 'WARP PRO', icon: 'warppro', group: 'WARP' },
    { id: 'routing', label: 'Routing Rules', icon: 'route', group: 'Routing' },
    { id: 'importexport', label: 'Import / Export', icon: 'transfer', group: 'Data' },
    { id: 'telegram', label: 'Telegram Bot', icon: 'telegram', group: 'Data' },
    { id: 'subscriptions', label: 'Subscriptions', icon: 'subs', group: 'Access' },
  ];

  const CLIENTS = [
    { id: 'v2rayn', label: 'v2rayN (Windows)', format: 'JSON' },
    { id: 'v2rayng', label: 'v2rayNG (Android)', format: 'JSON' },
    { id: 'mahsa', label: 'MahsaNG (iOS)', format: 'JSON' },
    { id: 'streisand', label: 'Streisand (iOS)', format: 'Links' },
    { id: 'singbox', label: 'sing-box', format: 'JSON' },
    { id: 'husi', label: 'husi (iOS)', format: 'Links' },
    { id: 'clashmeta', label: 'Clash Meta', format: 'YAML' },
    { id: 'clashverge', label: 'Clash Verge (Rev)', format: 'YAML' },
    { id: 'flclash', label: 'FLClash', format: 'YAML' },
    { id: 'stash', label: 'Stash (iOS)', format: 'JSON' },
    { id: 'shadowrocket', label: 'Shadowrocket (iOS)', format: 'Links' },
    { id: 'passwall', label: 'PassWall / OpenClash', format: 'Links' },
    { id: 'nekobox', label: 'NekoBox', format: 'Links' },
    { id: 'hiddify', label: 'Hiddify', format: 'JSON' },
    { id: 'karing', label: 'Karing (iOS)', format: 'Links' },
    { id: 'wireguard', label: 'WireGuard', format: 'WG conf' },
    { id: 'amnezia', label: 'Amnezia VPN', format: 'WG conf' },
    { id: 'wgtunnel', label: 'WG Tunnel', format: 'WG conf' },
  ];

  const TLS_PORTS = [443, 8443, 2053, 2083, 2087, 2096];
  const NON_TLS_PORTS = [80, 8080, 8880, 2052, 2082, 2086, 2095];
  const FINGERPRINTS = ['chrome', 'firefox', 'safari', 'ios', 'android', 'edge', '360', 'qq', 'random', 'randomized'];
  const LOG_LEVELS = ['disabled', 'warning', 'error', 'info', 'debug'];
  const FRAGMENT_MODES = [
    { value: 'off', label: 'Off' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'severe', label: 'Severe' },
    { value: 'custom', label: 'Custom' },
  ];
  const FRAGMENT_PACKETS = ['tlshello', '1-1', '1-2', '1-3', '1-5'];
  const PROXY_IP_MODES = [
    { value: 'none', label: 'Disabled' },
    { value: 'proxy', label: 'Proxy IP' },
    { value: 'nat64', label: 'NAT64' },
  ];
  const NAT64_PRESETS = ['64:ff9b::', '64:ff9b:1::', '2001:db8::', '2001:db8:1::'];
  const WARP_ENDPOINT_PRESETS = [
    '2606:4700:4700::1111', '104.16.132.222', '104.16.133.222',
    '188.114.96.170', '188.114.97.170', '172.64.32.67', '172.64.33.67',
    '198.41.200.138', '198.41.201.138',
  ];
  const SANCTION_PRESETS = [
    { id: 'chatgpt', label: 'ChatGPT', domains: ['chatgpt.com', 'openai.com', 'oaistatic.com', 'oaiusercontent.com'] },
    { id: 'google-ai', label: 'Google AIs', domains: ['gemini.google.com', 'ai.google.dev', 'aistudio.google.com'] },
    { id: 'microsoft', label: 'Microsoft', domains: ['bing.com', 'bingapis.com', 'copilot.microsoft.com'] },
    { id: 'oracle', label: 'Oracle', domains: ['oracle.com'] },
    { id: 'docker', label: 'Docker', domains: ['docker.com', 'docker.io'] },
    { id: 'adobe', label: 'Adobe', domains: ['adobe.com', 'adobedtm.com'] },
    { id: 'epic', label: 'Epic Games', domains: ['epicgames.com', 'unrealengine.com'] },
    { id: 'intel', label: 'Intel', domains: ['intel.com'] },
    { id: 'amd', label: 'AMD', domains: ['amd.com'] },
    { id: 'nvidia', label: 'Nvidia', domains: ['nvidia.com'] },
    { id: 'asus', label: 'Asus', domains: ['asus.com'] },
    { id: 'hp', label: 'HP', domains: ['hp.com'] },
    { id: 'lenovo', label: 'Lenovo', domains: ['lenovo.com'] },
  ];

  /* --------------------------------- state --------------------------------- */

  const state = {
    settings: null,
    route: 'dashboard',
    saveTimer: null,
    authMode: 'login', // login | setup
  };

  /* ------------------------------- auth view ------------------------------- */

  function showAuth(mode) {
    state.authMode = mode;
    $('#main-view').classList.add('hidden');
    $('#auth-view').classList.remove('hidden');
    const setup = mode === 'setup';
    $('#auth-subtitle').textContent = setup
      ? 'First run — create your admin password'
      : 'Enter your admin password to continue';
    $('#auth-pw-label').textContent = setup ? 'Create Password' : 'Password';
    $('#auth-pw-hint').textContent = setup
      ? 'Choose a strong password (min 8 characters). You will need it to access the panel.'
      : 'Minimum 8 characters.';
    $('#auth-submit .btn-label').textContent = setup ? 'Create & Enter' : 'Unlock Panel';
    $('#auth-error').classList.add('hidden');
    $('#auth-password').value = '';
    setTimeout(() => $('#auth-password').focus(), 60);
  }

  function bindAuth() {
    $('#auth-toggle-pw').addEventListener('click', () => {
      const p = $('#auth-password');
      p.type = p.type === 'password' ? 'text' : 'password';
    });
    $('#auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = $('#auth-password').value;
      const btn = $('#auth-submit');
      const label = btn.querySelector('.btn-label');
      const old = label.textContent;
      btn.disabled = true;
      label.textContent = state.authMode === 'setup' ? 'Creating…' : 'Unlocking…';
      $('#auth-error').classList.add('hidden');
      try {
        if (state.authMode === 'setup') await api.init(pw);
        else await api.login(pw);
        await enterPanel();
      } catch (err) {
        const box = $('#auth-error');
        box.textContent = err.message || 'Something went wrong';
        box.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        label.textContent = old;
      }
    });
  }

  function showMain() {
    $('#auth-view').classList.add('hidden');
    $('#main-view').classList.remove('hidden');
  }

  /* --------------------------------- saving -------------------------------- */

  function queueSave() {
    const ind = $('#save-indicator');
    ind.textContent = 'saving…';
    ind.classList.add('show');
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(async () => {
      try {
        state.settings = await api.saveSettings(state.settings);
        ind.textContent = 'saved';
        setTimeout(() => ind.classList.remove('show'), 1200);
      } catch (err) {
        ind.textContent = 'save failed';
        toast(err.message, 'error');
      }
    }, 700);
  }

  function set(path, value) {
    // path like ['routing','blockAds']
    let o = state.settings;
    for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
    o[path[path.length - 1]] = value;
    queueSave();
  }

  /* --------------------------------- routing ------------------------------- */

  function buildNav() {
    const nav = $('#sidebar-nav');
    nav.innerHTML = '';
    let lastGroup = '';
    for (const p of PAGES) {
      if (p.group !== lastGroup) {
        nav.append(el('div', { class: 'nav-group-label' }, p.group));
        lastGroup = p.group;
      }
      const b = el(
        'button',
        {
          class: 'nav-item',
          'data-route': p.id,
          onclick: () => {
            location.hash = `/${p.id}`;
            closeSidebar();
          },
        },
        icon(p.icon),
        p.label,
      );
      nav.append(b);
    }
  }

  function setActiveNav(id) {
    for (const b of $$('#sidebar-nav .nav-item')) {
      b.classList.toggle('active', b.dataset.route === id);
    }
  }

  function currentRoute() {
    const h = location.hash.replace(/^#\//, '').split('?')[0];
    return PAGES.some((p) => p.id === h) ? h : 'dashboard';
  }

  function render() {
    const route = currentRoute();
    state.route = route;
    const page = $('#page');
    page.innerHTML = '';
    const title = PAGES.find((p) => p.id === route);
    $('#page-title').textContent = title ? title.label : 'Dashboard';
    setActiveNav(route);

    const builders = {
      dashboard: renderDashboard,
      proxy: renderProxy,
      vless: renderVless,
      proxyip: renderProxyIp,
      ech: renderEch,
      cdn: renderCdn,
      fragment: renderFragment,
      raw: renderRaw,
      warp: renderWarp,
      warppro: renderWarpPro,
      routing: renderRouting,
      importexport: renderImportExport,
      telegram: renderTelegram,
      subscriptions: renderSubscriptions,
    };
    const b = builders[route] || renderDashboard;
    b(page, state.settings);
  }

  /* ------------------------------ dashboard -------------------------------- */

  function renderDashboard(page, s) {
    page.append(
      card('System Overview', null, { dot: '', desc: 'Live usage of your worker instance (VLESS / Trojan / DoH traffic).' }),
    );
    const grid = el('div', { class: 'grid-3' });
    const totalCard = el('div', { class: 'card stat-card' });
    totalCard.append(
      el('div', { class: 'stat-label' }, 'Total Requests'),
      el('div', { class: 'stat-value', id: 'stat-total' }, '—'),
      el('div', { class: 'stat-sub' }, 'all time'),
    );
    const h24Card = el('div', { class: 'card stat-card' });
    h24Card.append(
      el('div', { class: 'stat-label' }, 'Last 24 Hours'),
      el('div', { class: 'stat-value magenta', id: 'stat-24h' }, '—'),
      el('div', { class: 'stat-sub' }, 'rolling window'),
    );
    const verCard = el('div', { class: 'card stat-card' });
    verCard.append(
      el('div', { class: 'stat-label' }, 'Panel Version'),
      el('div', { class: 'stat-value lime', id: 'stat-version' }, '—'),
      el('div', { class: 'stat-sub' }, id: 'stat-panelurl', '' ),
    );
    grid.append(totalCard, h24Card, verCard);
    page.firstChild.append(grid);

    // usage bar
    const usageCard = el('div', { class: 'card' });
    usageCard.append(el('h2', {}, el('span', { class: 'dot magenta' }), 'Daily Usage'));
    const wrap = el('div', { class: 'usage-wrap' });
    const track = el('div', { class: 'usage-track' });
    const fill = el('div', { class: 'usage-fill', id: 'usage-fill' });
    track.append(fill);
    wrap.append(track, el('div', { class: 'usage-labels' }, el('span', { id: 'usage-left' }, '0 req'), el('span', { id: 'usage-right' }, '100,000 req / day')));
    usageCard.append(wrap);
    page.append(usageCard);

    // quick actions
    const qaCard = el('div', { class: 'card' });
    qaCard.append(el('h2', {}, el('span', { class: 'dot lime' }), 'Quick Actions'));
    const qa = el('div', { class: 'qa-grid' });

    const updBtn = el('button', { class: 'btn btn-primary' }, icon('refresh'), 'Check for Updates');
    updBtn.addEventListener('click', async () => {
      updBtn.disabled = true;
      updBtn.innerHTML = '<span class="spinner"></span> Checking…';
      try {
        const r = await api.update();
        modal({ title: 'Update Check', body: `<p style="font-size:.9rem;line-height:1.7">${r.message}<br><br>Current: <b>v${r.current}</b> · Latest: <b>v${r.latest}</b></p>` });
      } catch (e) { toast(e.message, 'error'); }
      render();
    });

    const pwBtn = el('button', { class: 'btn btn-ghost' }, icon('ech'), 'Reset Password');
    pwBtn.addEventListener('click', () => {
      const pw = input({ type: 'password', placeholder: 'New password (min 8 chars)' });
      modal({
        title: 'Reset Password',
        body: field('New Password', pw, 'Applies immediately to future logins.'),
        actions: [
          el('button', { class: 'btn btn-ghost', onclick: (e) => e.target.closest('.modal').__close && e.target.closest('.modal').__close() }, 'Cancel'),
          el('button', {
            class: 'btn btn-primary',
            onclick: async (e) => {
              const m = e.target.closest('.modal');
              try {
                await api.resetPassword(pw.value);
                toast('Password updated', 'success');
                if (m.__close) m.__close();
              } catch (err) { toast(err.message, 'error'); }
            },
          }, 'Update'),
        ],
      });
    });

    const delBtn = el('button', { class: 'btn btn-danger' }, icon('trash'), 'Delete Panel');
    delBtn.addEventListener('click', () => {
      const m = modal({
        title: 'Delete Panel',
        body: '<p style="font-size:.9rem;line-height:1.7;color:#ff8ba3">This wipes <b>all</b> panel data (settings, credentials, stats) from KV. The panel returns to its first-run state. This cannot be undone.</p>',
        actions: [
          el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Cancel'),
          el('button', {
            class: 'btn btn-danger',
            onclick: async () => {
              try {
                await api.deletePanel();
                toast('Panel data deleted', 'success');
                setTimeout(() => location.reload(), 800);
              } catch (err) { toast(err.message, 'error'); }
            },
          }, 'Delete Everything'),
        ],
      });
    });

    qa.append(updBtn, pwBtn, delBtn);
    qaCard.append(qa);
    page.append(qaCard);

    // panel info
    const infoCard = el('div', { class: 'card' });
    infoCard.append(el('h2', {}, el('span', { class: 'dot violet' }), 'Panel Endpoints'));
    const host = location.host;
    const info = el('div');
    const rows = [
      ['Panel URL', `${location.origin}`],
      ['Private DoH (dns-json)', `https://${host}/doh`],
      ['VLESS WebSocket', `wss://${host}/vless`],
      ['Trojan WebSocket', `wss://${host}/trojan`],
      ['Subscription base', `${location.origin}${s.subscriptionPath}/{client}?t=${s.subscriptionKey}`],
    ];
    for (const [k, v] of rows) {
      const row = el('div', { class: 'kv-row' }, el('span', { class: 'k' }, k), el('span', { class: 'v' }, v));
      const cp = el('button', { class: 'icon-btn', title: 'Copy', onclick: async () => { await copy(v); toast('Copied to clipboard', 'success'); } }, icon('copy'));
      row.append(cp);
      info.append(row);
    }
    infoCard.append(info);
    page.append(infoCard);

    // load live stats
    api.dashboard()
      .then((d) => {
        $('#stat-total').textContent = d.totalRequests.toLocaleString();
        $('#stat-24h').textContent = d.requestsLast24h.toLocaleString();
        $('#stat-version').textContent = 'v' + d.version;
        $('#stat-panelurl').textContent = d.panelName;
        const pct = d.usagePct;
        const f = $('#usage-fill');
        requestAnimationFrame(() => { f.style.width = pct + '%'; });
        if (pct > 75) f.classList.add('warn');
        $('#usage-left').textContent = d.requestsLast24h.toLocaleString() + ' req';
        $('#usage-right').textContent = (d.dailyQuota || 100000).toLocaleString() + ' req / day';
        $('#version-chip').textContent = 'v' + d.version;
        $('#foot-version').textContent = 'v' + d.version;
      })
      .catch(() => {});
  }

  /* ------------------------------ proxy page ------------------------------- */

  function renderProxy(page, s) {
    const c1 = el('div');
    c1.append(
      toggleRow('Local DNS', 'Use the device’s own DNS for direct/bypass traffic (avoids DNS leaks).', s.localDns, (v) => set(['localDns'], v)),
      toggleRow('Anti-Sanction DNS', 'Resolve sanction-blocked services through a US DoH automatically.', s.antiSanctionDns, (v) => set(['antiSanctionDns'], v)),
      toggleRow('Fake DNS', 'Return non-leaking fake IPs for bypassed domains from the panel DoH.', s.fakeDns, (v) => set(['fakeDns'], v)),
      toggleRow('IPv6', 'Prefer/allow IPv6 (AAAA) answers and IPv6 routes in generated configs.', s.ipv6, (v) => set(['ipv6'], v)),
      toggleRow('Allow LAN connections', 'Let other devices on your local network use the panel.', s.allowLan, (v) => set(['allowLan'], v)),
    );
    page.append(card('DNS & Network', c1, { dot: '', desc: 'Behaviour of the panel’s private DNS server and generated client configs.' }));

    const f1 = el('div', { class: 'grid-2' });
    f1.append(
      field('Log Level', select(LOG_LEVELS.map((l) => ({ value: l, label: l })), s.logLevel, (v) => set(['logLevel'], v))),
      field('Custom Domain', input({ value: s.customDomain, placeholder: 'example.com', mono: true, oninput: (v) => set(['customDomain'], v) }), 'Replaces the worker host as the SNI/Host in generated configs.'),
      field('Underlying DoH', input({ value: s.underlyingDoh, placeholder: 'https://1.1.1.1/dns-query', mono: true, oninput: (v) => set(['underlyingDoh'], v) }), 'Fallback DoH used inside client configs.'),
      field('Fallback Domain', input({ value: s.fallbackDomain, placeholder: 'optional.example.com', mono: true, oninput: (v) => set(['fallbackDomain'], v) })),
    );
    page.append(card('General', f1, { dot: 'magenta' }));

    const f2 = el('div', { class: 'grid-2' });
    f2.append(
      field('Panel Subscriptions Path', input({ value: s.subscriptionPath, mono: true, oninput: (v) => { set(['subscriptionPath'], v); toast('Sub path updated — use the new path in clients', 'info'); } }), 'Subscription endpoints live at YOUR-PANEL{path}/<client>?t=KEY'),
    );
    page.append(card('Subscriptions', f2, { dot: 'lime' }));
  }

  /* ------------------------------- vless page ------------------------------ */

  function renderVless(page, s) {
    const protoCard = el('div', { class: 'grid-2' });
    protoCard.append(
      field('Protocols', select([
        { value: 'both', label: 'VLESS & Trojan' },
        { value: 'vless', label: 'VLESS only' },
        { value: 'trojan', label: 'Trojan only' },
      ], s.protocol, (v) => set(['protocol'], v))),
      field('Fingerprint (uTLS)', select(FINGERPRINTS.map((f) => ({ value: f, label: f })), s.fingerprint, (v) => set(['fingerprint'], v))),
    );
    page.append(card('Protocol', protoCard, { dot: '' }));

    // uuid + trojan
    const idCard = el('div');
    const uuidRow = el('div', { class: 'input-wrap' });
    const uuidInp = input({ value: s.uuid, readonly: true, mono: true });
    const uuidBtn = el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button', title: 'Regenerate UUID',
      onclick: () => {
        const u = (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        }));
        uuidInp.value = u;
        set(['uuid'], u);
        toast('New UUID generated', 'success');
      },
    }, icon('refresh'), 'Refresh');
    uuidRow.append(uuidInp, uuidBtn);
    idCard.append(field('VLESS UUID', uuidRow, 'Client identity for the VLESS protocol.'));

    const passRow = el('div', { class: 'input-wrap' });
    const passInp = input({ value: s.trojanPassword, readonly: true, mono: true });
    const passBtn = el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button', title: 'Regenerate password',
      onclick: () => {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let p = '';
        const arr = new Uint32Array(16);
        crypto.getRandomValues(arr);
        for (let i = 0; i < 16; i++) p += chars[arr[i] % chars.length];
        passInp.value = p;
        set(['trojanPassword'], p);
        toast('New Trojan password generated', 'success');
      },
    }, icon('refresh'), 'Refresh');
    passRow.append(passInp, passBtn);
    idCard.append(field('Trojan Password', passRow, 'Client identity for the Trojan protocol.'));
    page.append(card('Credentials', idCard, { dot: 'magenta', desc: 'Both values are embedded in every generated configuration.' }));

    // dns & proxies
    const net = el('div', { class: 'grid-2' });
    net.append(
      field('Remote DNS (DoH)', input({ value: s.remoteDns, placeholder: 'https://1.1.1.1/dns-query', mono: true, oninput: (v) => set(['remoteDns'], v) }), 'Used by the worker to resolve target domains.'),
      field('Best Ping Interval (ms)', input({ value: s.bestPingInterval, type: 'number', min: 50, max: 5000, oninput: (v) => set(['bestPingInterval'], Math.max(50, Math.min(5000, parseInt(v, 10) || 250))) }), 'How long to measure when picking the fastest IP.'),
      field('Upstream TCP Proxy', input({ value: s.upstreamTcpProxy, placeholder: 'socks5://user:pass@host:port', mono: true, oninput: (v) => set(['upstreamTcpProxy'], v) }), 'Optional: route DIRECT traffic through an upstream socks5/http proxy (client-side).'),
      field('Chain Proxy', input({ value: s.chainProxy, placeholder: 'vless://… / trojan://… / http://user:pass@host:port', mono: true, oninput: (v) => set(['chainProxy'], v) }), 'Optional second hop to change the exit IP (VLESS, Trojan, SS, SOCKS5, HTTP).'),
    );
    page.append(card('Network', net, { dot: 'violet' }));

    // clean ips
    const cleanCard = el('div');
    cleanCard.append(entryList(s.cleanIps, (list) => set(['cleanIps'], list), { keyLabel: 'Domain', valLabel: 'IPs' }));
    page.append(card('Clean IPs — Domains', cleanCard, { dot: 'lime', desc: 'Preferred (unpoisoned) IPs for specific domains, used by the worker resolver.' }));

    // ports
    const portCard = el('div');
    portCard.append(
      field('TLS Ports', checkGroup(TLS_PORTS, s.tlsPorts, (p, on) => {
        const list = new Set(s.tlsPorts);
        if (on) list.add(p); else list.delete(p);
        if (!list.size) { list.add(443); toast('At least one TLS port is required', 'info'); }
        set(['tlsPorts'], [...list]);
      })),
      field('Non-TLS Ports', checkGroup(NON_TLS_PORTS, s.nonTlsPorts, (p, on) => {
        const list = new Set(s.nonTlsPorts);
        if (on) list.add(p); else list.delete(p);
        set(['nonTlsPorts'], [...list]);
      })),
    );
    page.append(card('Ports', portCard, { dot: '', desc: 'One configuration entry is generated per selected port.' }));

    const tfo = el('div');
    tfo.append(toggleRow('TCP Fast Open', 'Enable TFO on the client side when supported.', s.tcpFastOpen, (v) => set(['tcpFastOpen'], v)));
    page.append(card('Extras', tfo, { dot: 'magenta' }));
  }

  /* ------------------------------ proxy ip page ---------------------------- */

  function renderProxyIp(page, s) {
    const modeCard = el('div');
    modeCard.append(
      field('Mode', select(PROXY_IP_MODES, s.proxyIpMode, (v) => set(['proxyIpMode'], v)),
        'Proxy IP: connect to specific domains through pinned IPs. NAT64: map IPv4 targets to IPv6 under the prefix.'),
    );
    page.append(card('Mode', modeCard, { dot: '' }));

    const ips = el('div');
    ips.append(entryList(s.proxyIps, (list) => set(['proxyIps'], list), { keyLabel: 'Domain', valLabel: 'IPs', keyPh: 'target.com', valPh: '1.2.3.4, 5.6.7.8' }));
    page.append(card('Proxy IPs — Domains', ips, { dot: 'lime', desc: 'Force specific domains to use these IPs when connecting through the proxy.' }));

    const nat = el('div');
    nat.append(chipList(s.nat64Prefixes, (l) => set(['nat64Prefixes'], l), (l) => set(['nat64Prefixes'], l), { placeholder: '64:ff9b::' }));
    const presets = el('div', { class: 'chips', style: 'margin-top:10px' });
    presets.append(el('span', { class: 'empty-note', style: 'width:100%' }, 'presets:'));
    for (const p of NAT64_PRESETS) {
      if (!s.nat64Prefixes.includes(p)) {
        const chip = el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button',
          onclick: () => { set(['nat64Prefixes'], [...s.nat64Prefixes, p]); render(); },
        }, p);
        presets.append(chip);
      }
    }
    nat.append(presets);
    page.append(card('NAT64 Prefixes', nat, { dot: 'violet', desc: 'The first selected prefix is used for IPv4→IPv6 mapping.' }));
  }

  /* -------------------------------- ech page ------------------------------- */

  function renderEch(page, s) {
    const c = el('div');
    c.append(
      toggleRow('Enable ECH', 'Encrypted Client Hello — hides the SNI from middleboxes.', s.echEnabled, (v) => set(['echEnabled'], v)),
      field('ECH Server Name', input({ value: s.echServerName, placeholder: 'e.g. cdn.mozilla.net', mono: true, oninput: (v) => set(['echServerName'], v) }), 'A well-known ECH-capable domain (e.g. cdn.mozilla.net, *.cloudfront.net).'),
    );
    page.append(card('Encrypted Client Hello (ECH)', c, { dot: '', desc: 'ECH config is added to generated client links; works with compatible Xray cores.' }));
  }

  /* -------------------------------- cdn page ------------------------------- */

  function renderCdn(page, s) {
    const c = el('div');
    c.append(
      toggleRow('Enable Custom CDN', 'Serve the proxy through your own CDN address.', s.cdnEnabled, (v) => set(['cdnEnabled'], v)),
    );
    page.append(card('Custom CDN', c, { dot: '', desc: 'Use a CDN hostname instead of the worker address (e.g. your own Cloudflare zone).' }));

    const f = el('div');
    f.append(
      field('CDN Addresses', chipList(s.cdnAddresses, (l) => set(['cdnAddresses'], l), (l) => set(['cdnAddresses'], l), { placeholder: 'cdn.example.com' }), 'One or more CDN hostnames / IPs.'),
      field('Host', input({ value: s.cdnHost, placeholder: 'cdn.example.com', mono: true, oninput: (v) => set(['cdnHost'], v) }), 'Host used in generated configs.'),
      field('SNI', input({ value: s.cdnSni, placeholder: 'sni.example.com', mono: true, oninput: (v) => set(['cdnSni'], v) }), 'Server Name Indication sent during the TLS handshake.'),
    );
    page.append(card('CDN Settings', f, { dot: 'magenta' }));
  }

  /* ------------------------------ fragment page ---------------------------- */

  function renderFragment(page, s) {
    const c = el('div');
    c.append(
      toggleRow('Enable Fragmentation', 'Split TLS ClientHello packets — evades DPI in fragile networks.', s.fragmentEnabled, (v) => set(['fragmentEnabled'], v)),
      field('Mode', select(FRAGMENT_MODES, s.fragmentMode, (v) => {
        set(['fragmentMode'], v);
        render();
      })),
    );
    page.append(card('Xray Fragment', c, { dot: '', desc: 'Fragmentation applies to VLESS/Trojan over WebSocket in supporting clients (Xray cores).' }));

    if (s.fragmentMode === 'custom') {
      const f = el('div', { class: 'grid-2' });
      f.append(
        field('Packets', select(FRAGMENT_PACKETS.map((p) => ({ value: p, label: p })), s.fragmentPackets, (v) => set(['fragmentPackets'], v))),
        field('Length (min-max)', input({ value: s.fragmentLength, placeholder: '100-200', mono: true, oninput: (v) => set(['fragmentLength'], v) })),
        field('Delay (min-max ms)', input({ value: s.fragmentDelay, placeholder: '0-10', mono: true, oninput: (v) => set(['fragmentDelay'], v) })),
        field('Max Split', input({ value: s.fragmentMaxSplit, placeholder: '3', mono: true, oninput: (v) => set(['fragmentMaxSplit'], v) })),
      );
      page.append(card('Custom Fragment Parameters', f, { dot: 'lime' }));
    } else {
      const note = el('div', { class: 'card' });
      note.append(el('p', { class: 'card-desc' }, 'A preset is active. Switch mode to “Custom” to fine-tune packets, length, delay and max split.'));
      page.append(note);
    }
  }

  /* -------------------------------- raw page ------------------------------- */

  function renderRaw(page, s) {
    const subs = el('div');
    const subsTa = el('textarea', { class: 'input mono', placeholder: 'vless://…\ntrojan://…\nss://… (one per line)' });
    subsTa.value = s.externalSubscriptions;
    subsTa.addEventListener('input', () => set(['externalSubscriptions'], subsTa.value));
    subs.append(field('Subscriptions (external)', subsTa, 'Aggregated into every subscription alongside the panel’s own proxies.'));
    const subsBtns = el('div', { style: 'display:flex;gap:8px' });
    subsBtns.append(el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button',
      onclick: async () => { await copy(s.externalSubscriptions); toast('Copied', 'success'); },
    }, icon('copy'), 'Copy'));
    subs.append(subsBtns);
    page.append(card('External Raw Configs — Subscriptions', subs, { dot: '', desc: 'Paste raw configs/links from other panels (proxy aggregation).' }));

    const single = el('div');
    const singleTa = el('textarea', { class: 'input mono', placeholder: 'vless://… / trojan://… / ss://… (one per line)' });
    singleTa.value = s.externalSingle;
    singleTa.addEventListener('input', () => set(['externalSingle'], singleTa.value));
    single.append(field('Single Configs (external)', singleTa));
    const singleBtns = el('div', { style: 'display:flex;gap:8px' });
    singleBtns.append(el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button',
      onclick: async () => { await copy(s.externalSingle); toast('Copied', 'success'); },
    }, icon('copy'), 'Copy'));
    single.append(singleBtns);
    page.append(card('External Raw Configs — Single', single, { dot: 'magenta' }));
  }

  /* -------------------------------- warp page ------------------------------ */

  function renderWarp(page, s) {
    const f = el('div', { class: 'grid-2' });
    f.append(
      field('Remote DNS', input({ value: s.warpRemoteDns, placeholder: 'https://1.1.1.1/dns-query', mono: true, oninput: (v) => set(['warpRemoteDns'], v) }), 'DNS server written into the WARP WireGuard configs.'),
      field('Best Ping Interval (ms)', input({ value: s.warpBestPing, type: 'number', min: 50, max: 5000, oninput: (v) => set(['warpBestPing'], Math.max(50, Math.min(5000, parseInt(v, 10) || 250))) })),
      field('Endpoints', chipList(s.warpEndpoints, (l) => set(['warpEndpoints'], l), (l) => set(['warpEndpoints'], l), { placeholder: '2606:4700:4700::1111' }), 'The first endpoint is used in generated configs. Add more for redundancy.'),
      field('Reserved Bytes', input({ value: s.warpReservedBytes, placeholder: '16 (0 = off)', mono: true, oninput: (v) => set(['warpReservedBytes'], v) }), 'WIREGUARD reserved-bytes size for WARP tuning (max 48).'),
    );
    page.append(card('WARP General', f, { dot: '', desc: 'Cloudflare Warp via WireGuard. The first run generates a stable keypair stored in KV.' }));

    const epPresets = el('div', { class: 'chips', style: 'margin-top:8px' });
    for (const p of WARP_ENDPOINT_PRESETS) {
      if (!s.warpEndpoints.includes(p)) {
        epPresets.append(el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button',
          onclick: () => { set(['warpEndpoints'], [...s.warpEndpoints, p]); render(); },
        }, p));
      }
    }
    if (epPresets.children.length) {
      const c = el('div', { class: 'card' });
      c.append(el('p', { class: 'card-desc' }, 'Endpoint presets:'), epPresets);
      page.append(c);
    }

    const actions = el('div');
    actions.append(toggleRow('Auto renew WARP accounts', 'A daily cron trigger re-registers the WARP account automatically.', s.warpAutoRenew, (v) => set(['warpAutoRenew'], v)));
    const renewBtn = el('button', { class: 'btn btn-lime' }, icon('refresh'), 'Renew Warp Accounts');
    renewBtn.addEventListener('click', async () => {
      renewBtn.disabled = true;
      renewBtn.innerHTML = '<span class="spinner"></span> Renewing…';
      try {
        const r = await api.warpRenew();
        toast(r.message || (r.ok ? 'WARP renewed' : 'Renewal failed'), r.ok ? 'success' : 'error');
      } catch (e) { toast(e.message, 'error'); }
      render();
    });
    actions.append(el('div', { style: 'margin-top:14px;display:flex;gap:10px;flex-wrap:wrap' }, renewBtn));
    page.append(card('Account', actions, { dot: 'lime' }));
  }

  /* ------------------------------- warppro page ---------------------------- */

  function renderWarpPro(page, s) {
    const mahsa = el('div');
    const m = s.warpPro.mahsaNoise;
    mahsa.append(
      toggleRow('Enable MahsaNG Noise', 'Packet padding for MahsaNG WARP.', m.enabled, (v) => set(['warpPro', 'mahsaNoise', 'enabled'], v)),
    );
    const mGrid = el('div', { class: 'grid-2' });
    mGrid.append(
      field('Mode', select([{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }], m.mode, (v) => set(['warpPro', 'mahsaNoise', 'mode'], v))),
      field('Packets', select(FRAGMENT_PACKETS.map((p) => ({ value: p, label: p })), m.packets, (v) => set(['warpPro', 'mahsaNoise', 'packets'], v))),
      field('Count', input({ value: m.count, type: 'number', min: 0, max: 64, oninput: (v) => set(['warpPro', 'mahsaNoise', 'count'], parseInt(v, 10) || 0) })),
      field('Size (bytes)', input({ value: m.size, type: 'number', min: 0, max: 65535, oninput: (v) => set(['warpPro', 'mahsaNoise', 'size'], parseInt(v, 10) || 0) })),
      field('Delay (ms)', input({ value: m.delay, type: 'number', min: 0, max: 10000, oninput: (v) => set(['warpPro', 'mahsaNoise', 'delay'], parseInt(v, 10) || 0) })),
    );
    mahsa.append(mGrid);
    page.append(card('MahsaNG Noise', mahsa, { dot: '', desc: 'Noise parameters are embedded in the WARP configs for MahsaNG.' }));

    const clash = el('div', { class: 'grid-2' });
    const cn = s.warpPro.clashNoise;
    clash.append(
      field('Count', input({ value: cn.count, type: 'number', min: 0, max: 64, oninput: (v) => set(['warpPro', 'clashNoise', 'count'], parseInt(v, 10) || 0) })),
      field('Size (bytes)', input({ value: cn.size, type: 'number', min: 0, max: 65535, oninput: (v) => set(['warpPro', 'clashNoise', 'size'], parseInt(v, 10) || 0) })),
    );
    page.append(card('Clash / Amnezia Noise', clash, { dot: 'magenta', desc: 'Noise for WARP via Clash Meta and AmneziaWG.' }));

    const v2 = el('div');
    const renderV2 = () => {
      v2.innerHTML = '';
      s.warpPro.v2rayNoise.forEach((n, i) => {
        const row = el('div', { class: 'entry-row', style: 'align-items:flex-end' });
        const mode = select([{ value: 'on', label: 'on' }, { value: 'off', label: 'off' }], n.mode, (v) => { n.mode = v; set(['warpPro', 'v2rayNoise'], [...s.warpPro.v2rayNoise]); });
        const packets = select(FRAGMENT_PACKETS.map((p) => ({ value: p, label: p })), n.packets, (v) => { n.packets = v; set(['warpPro', 'v2rayNoise'], [...s.warpPro.v2rayNoise]); });
        const count = input({ value: n.count, type: 'number', min: 0, max: 64, oninput: (v) => { n.count = parseInt(v, 10) || 0; set(['warpPro', 'v2rayNoise'], [...s.warpPro.v2rayNoise]); } });
        const size = input({ value: n.size, type: 'number', min: 0, max: 65535, oninput: (v) => { n.size = parseInt(v, 10) || 0; set(['warpPro', 'v2rayNoise'], [...s.warpPro.v2rayNoise]); } });
        const delay = input({ value: n.delay, type: 'number', min: 0, max: 10000, oninput: (v) => { n.delay = parseInt(v, 10) || 0; set(['warpPro', 'v2rayNoise'], [...s.warpPro.v2rayNoise]); } });
        const rm = el('button', { class: 'icon-btn danger', type: 'button', title: 'Remove', onclick: () => { s.warpPro.v2rayNoise.splice(i, 1); set(['warpPro', 'v2rayNoise'], [...s.warpPro.v2rayNoise]); render(); } }, icon('trash'));
        // enabled checkbox
        const chk = el('input', { type: 'checkbox' });
        chk.checked = n.enabled;
        chk.addEventListener('change', () => { n.enabled = chk.checked; set(['warpPro', 'v2rayNoise'], [...s.warpPro.v2rayNoise]); });
        const chkWrap = el('label', { class: 'check', style: 'flex:none;padding:9px 10px' }, chk, el('span', { class: 'box', html: UI.ICONS.check }), el('span', {}, 'on'));
        row.append(chkWrap, mode, packets, count, size, delay, rm);
        v2.append(row);
      });
      const add = el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: () => {
          s.warpPro.v2rayNoise.push({ enabled: true, mode: 'on', packets: 'tlshello', count: 3, size: 300, delay: 20 });
          set(['warpPro', 'v2rayNoise'], [...s.warpPro.v2rayNoise]);
          render();
        },
      }, icon('plus'), 'Add Noise Config');
      v2.append(add);
    };
    renderV2();
    page.append(card('v2ray Noise', v2, { dot: 'violet', desc: 'Add one or more noise configurations for v2ray-based WARP clients.' }));
  }

  /* ------------------------------- routing page ---------------------------- */

  function renderRouting(page, s) {
    const r = s.routing;
    const bypass = el('div');
    bypass.append(
      toggleRow('Bypass Iran', 'Route Iranian domains/IPs directly (no proxy).', r.bypassIran, (v) => set(['routing', 'bypassIran'], v)),
      toggleRow('Bypass China', 'Route Chinese domains/IPs directly.', r.bypassChina, (v) => set(['routing', 'bypassChina'], v)),
      toggleRow('Bypass Russia', 'Route Russian domains/IPs directly.', r.bypassRussia, (v) => set(['routing', 'bypassRussia'], v)),
    );
    page.append(card('Preset Rules — Bypass', bypass, { dot: 'lime', desc: 'Traffic matching these rules is sent DIRECT (and resolved locally when Local DNS is on).' }));

    const block = el('div');
    block.append(
      toggleRow('Block Ads', 'Reject known advertising domains.', r.blockAds, (v) => set(['routing', 'blockAds'], v)),
      toggleRow('Block Porn', 'Reject adult content domains.', r.blockPorn, (v) => set(['routing', 'blockPorn'], v)),
      toggleRow('Block QUIC', 'Force TCP-only transport for proxied traffic.', r.blockQuic, (v) => set(['routing', 'blockQuic'], v)),
      toggleRow('Block Malware', 'Reject known malware infrastructure.', r.blockMalware, (v) => set(['routing', 'blockMalware'], v)),
      toggleRow('Block Phishing', 'Reject known phishing/typosquat domains.', r.blockPhishing, (v) => set(['routing', 'blockPhishing'], v)),
      toggleRow('Block Cryptominers', 'Reject browser cryptomining scripts/domains.', r.blockCryptominers, (v) => set(['routing', 'blockCryptominers'], v)),
    );
    page.append(card('Preset Rules — Block', block, { dot: 'magenta' }));

    const custom = el('div', { class: 'grid-2' });
    custom.append(
      field('Custom Bypass Domains', chipList(r.customBypassDomains, (l) => set(['routing', 'customBypassDomains'], l), (l) => set(['routing', 'customBypassDomains'], l), { placeholder: 'example.com' })),
      field('Custom Bypass IPs/CIDR', chipList(r.customBypassIps, (l) => set(['routing', 'customBypassIps'], l), (l) => set(['routing', 'customBypassIps'], l), { placeholder: '1.2.3.4/32' })),
      field('Custom Block Domains', chipList(r.customBlockDomains, (l) => set(['routing', 'customBlockDomains'], l), (l) => set(['routing', 'customBlockDomains'], l), { placeholder: 'bad.example.com' })),
      field('Custom Block IPs/CIDR', chipList(r.customBlockIps, (l) => set(['routing', 'customBlockIps'], l), (l) => set(['routing', 'customBlockIps'], l), { placeholder: '5.6.7.0/24' })),
    );
    page.append(card('Custom Rules', custom, { dot: 'violet' }));

    const sanc = el('div');
    sanc.append(
      toggleRow('Enable Sanctions Bypass', 'Route sanction-blocked services (ChatGPT, Google AIs, …) DIRECT.', r.sanctionsEnabled, (v) => set(['routing', 'sanctionsEnabled'], v)),
    );
    const sancList = chipList(r.sanctions, (l) => set(['routing', 'sanctions'], l), (l) => set(['routing', 'sanctions'], l), { placeholder: 'service.com' });
    sanc.append(field('Bypass Domains', sancList));
    const presets = el('div', { class: 'chips', style: 'margin-top:12px' });
    presets.append(el('span', { class: 'empty-note', style: 'width:100%' }, 'quick add:'));
    for (const p of SANCTION_PRESETS) {
      const allIn = p.domains.every((d) => r.sanctions.includes(d));
      const b = el('button', {
        class: `btn btn-sm ${allIn ? 'btn-lime' : 'btn-ghost'}`, type: 'button',
        onclick: () => {
          if (allIn) set(['routing', 'sanctions'], r.sanctions.filter((d) => !p.domains.includes(d)));
          else set(['routing', 'sanctions'], [...new Set([...r.sanctions, ...p.domains])]);
          render();
        },
      }, p.label);
      presets.append(b);
    }
    sanc.append(presets);
    page.append(card('Sanctions Rules', sanc, { dot: '', desc: 'Services commonly blocked by US sanctions for some regions — sent DIRECT to reach them.' }));
  }

  /* ---------------------------- import/export page ------------------------- */

  function renderImportExport(page, s) {
    const remote = el('div');
    const urlInp = input({ placeholder: 'https://example.com/settings.json or a raw links file', mono: true });
    remote.append(field('Remote Settings URL', urlInp, 'Import another panel’s shared settings (node sharing).'));
    const remoteBtn = el('button', {
      class: 'btn btn-primary', type: 'button',
      onclick: async () => {
        const url = urlInp.value.trim();
        if (!url) return toast('Enter a URL first', 'error');
        remoteBtn.disabled = true;
        remoteBtn.innerHTML = '<span class="spinner"></span> Importing…';
        try {
          const r = await api.importSettings({ url });
          state.settings = r.imported || state.settings;
          toast(r.importedAs ? 'Imported as external configs' : 'Settings imported', 'success');
          render();
        } catch (e) { toast(e.message, 'error'); }
      },
    }, icon('transfer'), 'Import');
    remote.append(el('div', { style: 'margin-top:4px' }, remoteBtn));
    page.append(card('Import — Remote Settings', remote, { dot: '' }));

    const share = el('div');
    const shareTa = el('textarea', { class: 'input mono', style: 'min-height:140px' });
    shareTa.value = JSON.stringify(s, null, 2);
    share.append(field('Share Your Settings', shareTa, 'Copy this JSON (or upload the file) to share the whole panel state with other users.'));
    const shareBtn = el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button',
      onclick: async () => { await copy(JSON.stringify(state.settings, null, 2)); toast('Settings JSON copied', 'success'); },
    }, icon('copy'), 'Copy');
    share.append(el('div', { style: 'margin-top:8px' }, shareBtn));
    page.append(card('Share Your Settings', share, { dot: 'lime' }));

    const fileCard = el('div', { class: 'grid-2' });
    const upDiv = el('div');
    const fileInp = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    const upBtn = el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => fileInp.click() }, icon('download').cloneNode(true), 'Upload / Import File');
    fileInp.addEventListener('change', async () => {
      const f = fileInp.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        const json = JSON.parse(text);
        const r = await api.importSettings({ json });
        state.settings = r.imported || state.settings;
        toast('Settings imported from file', 'success');
        render();
      } catch (e) { toast('Could not parse the file as settings JSON', 'error'); }
    });
    upDiv.append(field('File Import', el('div', {}, upBtn, fileInp, el('p', { class: 'hint' }, '.json settings file'))));
    const dlDiv = el('div');
    const dlBtn = el('button', {
      class: 'btn btn-lime', type: 'button',
      onclick: () => {
        api.download(`mobin-panel-settings-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state.settings, null, 2), 'application/json');
        toast('Settings exported', 'success');
      },
    }, icon('download'), 'Download / Export');
    dlDiv.append(field('File Export', el('div', {}, dlBtn, el('p', { class: 'hint' }, 'Download the full settings JSON.'))));
    fileCard.append(upDiv, dlDiv);
    page.append(card('File Settings', fileCard, { dot: 'violet' }));
  }

  /* ------------------------------- telegram page --------------------------- */

  function renderTelegram(page, s) {
    const c = el('div');
    const tokenInp = input({ placeholder: '123456:ABC-DEF…', mono: true });
    const uidInp = input({ placeholder: '123456789', mono: true });
    c.append(
      field('Bot Token', tokenInp, 'Create a bot with @BotFather and copy the token.'),
      field('Your User ID', uidInp, 'Message @userinfobot to find your numeric id.'),
    );
    const btns = el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-top:6px' });
    const setupBtn = el('button', { class: 'btn btn-primary' }, icon('check'), 'Setup');
    const removeBtn = el('button', { class: 'btn btn-ghost' }, icon('trash'), 'Remove');
    const testBtn = el('button', { class: 'btn btn-lime' }, icon('telegram'), 'Send Test Message');
    btns.append(setupBtn, removeBtn, testBtn);
    c.append(btns);
    page.append(card('Telegram Bot Integration', c, { dot: '', desc: 'Get panel events (initialization, WARP renewals, …) in your private chat.' }));

    setupBtn.addEventListener('click', async () => {
      setupBtn.disabled = true;
      setupBtn.innerHTML = '<span class="spinner"></span> Verifying…';
      try {
        const r = await api.telegramSetup(tokenInp.value.trim(), uidInp.value.trim());
        toast(r.message, r.ok ? 'success' : 'error');
      } catch (e) { toast(e.message, 'error'); }
      render();
    });
    removeBtn.addEventListener('click', async () => {
      try {
        const r = await api.telegramRemove();
        toast(r.message, 'success');
      } catch (e) { toast(e.message, 'error'); }
      render();
    });
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.innerHTML = '<span class="spinner"></span> Sending…';
      try {
        const r = await api.telegramTest();
        toast(r.message, r.ok ? 'success' : 'error');
      } catch (e) { toast(e.message, 'error'); }
      render();
    });
  }

  /* ----------------------------- subscriptions page ------------------------ */

  function renderSubscriptions(page, s) {
    const head = el('div', { class: 'card' });
    head.append(
      el('h2', {}, el('span', { class: 'dot' }), 'Subscription Links'),
      el('p', { class: 'card-desc' }, `Import these into your clients. Every link is protected by your subscription key — rotate it in <b>Proxy Settings</b> when needed.`,
        el('br'),
        el('span', { class: 'badge cyan' }, 'base: ' + location.origin + s.subscriptionPath),
      ),
    );
    page.append(head);

    const grid = el('div', { class: 'sub-grid' });
    for (const c of CLIENTS) {
      const url = `${location.origin}${s.subscriptionPath}/${c.id}?t=${encodeURIComponent(s.subscriptionKey)}`;
      const subCard = el('div', { class: 'card sub-card' });
      subCard.append(
        el('div', { class: 'sub-head' }, el('span', { class: 'sub-name' }, c.label), el('span', { class: 'sub-format' }, c.format)),
      );
      const qrHost = el('div');
      renderQR(url, qrHost, 180);
      subCard.append(qrHost);
      subCard.append(el('div', { class: 'sub-url' }, url));
      const actions = el('div', { class: 'sub-actions' });
      const copyBtn = el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: async () => { await copy(url); toast(`${c.label} link copied`, 'success'); },
      }, icon('copy'), 'Copy Link');
      const qrBtn = el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: () => {
          const host = el('div');
          renderQR(url, host, 300);
          const m = modal({
            title: `QR — ${c.label}`,
            body: host,
            actions: [el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Close')],
            wide: false,
          });
        },
      }, icon('qr'), 'QR');
      const dlBtn = el('button', {
        class: 'btn btn-primary btn-sm', type: 'button',
        onclick: async () => {
          dlBtn.disabled = true;
          dlBtn.innerHTML = '<span class="spinner"></span>…';
          try {
            const body = await api.config(c.id);
            api.download(`${s.panelName.toLowerCase().replace(/\s+/g, '-')}-${c.id}`, body);
            toast('Config downloaded', 'success');
          } catch (e) { toast(e.message, 'error'); }
          render();
        },
      }, icon('download'), 'Download Config');
      actions.append(copyBtn, qrBtn, dlBtn);
      subCard.append(actions);
      grid.append(subCard);
    }
    page.append(grid);
  }

  /* --------------------------------- boot ---------------------------------- */

  async function enterPanel() {
    showMain();
    state.settings = await api.getSettings();
    buildNav();
    render();
    const st = await api.status().catch(() => null);
    if (st) {
      $('#version-chip').textContent = 'v' + (st.version || '');
      $('#foot-version').textContent = 'v' + (st.version || '');
      $('#auth-version').textContent = 'v' + (st.version || '');
    }
  }

  async function boot() {
    UI.initParticles();
    UI.initRipple();
    bindAuth();

    $('#logout-btn').addEventListener('click', async () => {
      try { await api.logout(); } catch { /* ignore */ }
      location.reload();
    });
    $('#save-btn').addEventListener('click', async () => {
      try {
        state.settings = await api.saveSettings(state.settings);
        toast('Settings saved', 'success');
      } catch (e) { toast(e.message, 'error'); }
    });
    $('#menu-btn').addEventListener('click', () => {
      const sb = $('#sidebar');
      sb.classList.toggle('open');
      let scrim = $('.sidebar-scrim');
      if (sb.classList.contains('open') && !scrim) {
        scrim = el('div', { class: 'sidebar-scrim', onclick: () => { sb.classList.remove('open'); scrim.remove(); } });
        document.body.append(scrim);
      } else if (!sb.classList.contains('open') && scrim) scrim.remove();
    });
    window.addEventListener('hashchange', render);

    try {
      const st = await api.status();
      if (!st.initialized) showAuth('setup');
      else if (!st.authenticated) showAuth('login');
      else await enterPanel();
    } catch (e) {
      showAuth('login');
      const box = $('#auth-error');
      box.textContent = e.message || 'Could not reach the panel API.';
      box.classList.remove('hidden');
    }
  }

  function closeSidebar() {
    const sb = $('#sidebar');
    if (sb) sb.classList.remove('open');
    const scrim = $('.sidebar-scrim');
    if (scrim) scrim.remove();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
