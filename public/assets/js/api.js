/**
 * Mobin Panel — backend API client
 * Created by Mobin.A
 *
 * Thin promise-based wrapper over the Worker JSON API. All network errors
 * are normalized into Error objects with a readable `message`.
 */
(function () {
  'use strict';

  async function request(path, opts = {}) {
    const init = {
      method: opts.method || 'GET',
      headers: { ...(opts.headers || {}) },
      credentials: 'same-origin',
    };
    if (opts.body !== undefined) {
      init.body = JSON.stringify(opts.body);
      init.headers['content-type'] = 'application/json';
    }
    let res;
    try {
      res = await fetch(path, init);
    } catch (e) {
      throw new Error('Network error — is the panel reachable?');
    }
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { data = await res.json(); } catch { data = null; }
    } else {
      data = await res.text();
    }
    if (!res.ok) {
      const msg = (data && typeof data === 'object' && data.error) || `HTTP ${res.status}`;
      const err = new Error(typeof msg === 'string' ? msg : 'request failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const api = {
    /* auth */
    status: () => request('/api/auth/status'),
    init: (password) => request('/api/auth/init', { method: 'POST', body: { password } }),
    login: (password) => request('/api/auth/login', { method: 'POST', body: { password } }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
    resetPassword: (newPassword) =>
      request('/api/auth/reset', { method: 'POST', body: { newPassword } }),

    /* settings */
    getSettings: () => request('/api/settings'),
    saveSettings: (settings) => request('/api/settings', { method: 'POST', body: settings }),

    /* dashboard */
    dashboard: () => request('/api/dashboard'),

    /* import */
    importSettings: (payload) => request('/api/import', { method: 'POST', body: payload }),

    /* configs (raw, for downloads/previews) */
    config: (client) => request(`/api/configs/${encodeURIComponent(client)}`),

    /* telegram */
    telegramSetup: (botToken, userId) =>
      request('/api/telegram/setup', { method: 'POST', body: { botToken, userId } }),
    telegramRemove: () => request('/api/telegram/remove', { method: 'POST' }),
    telegramTest: () => request('/api/telegram/test', { method: 'POST' }),

    /* misc */
    update: () => request('/api/update', { method: 'POST' }),
    deletePanel: () => request('/api/panel/delete', { method: 'POST' }),
    warpRenew: () => request('/api/warp/renew', { method: 'POST' }),
  };

  /** Fetch a raw subscription payload (used by the QR/download helpers). */
  api.subRaw = async (client, key) => {
    const res = await fetch(
      `${encodeURIComponent(client)}?t=${encodeURIComponent(key)}`,
      { credentials: 'same-origin' },
    );
    if (!res.ok) throw new Error(`subscription request failed (${res.status})`);
    return res.text();
  };

  /** Blob → object URL download helper. */
  api.download = (filename, text, mime = 'text/plain') => {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  window.MobinAPI = api;
})();
