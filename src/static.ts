/**
 * Mobin Panel — static assets
 * Created by Mobin.A
 *
 * Every file under public/ is inlined into the bundle as text by the
 * esbuild `inline-assets` plugin, so the Worker serves the entire UI with
 * zero external dependencies (no Workers Assets, no KV reads per request).
 */
import indexHtml from '~public/index.html';
import neonCss from '~public/assets/css/neon.css';
import appJs from '~public/assets/js/app.js';
import uiJs from '~public/assets/js/ui.js';
import apiJs from '~public/assets/js/api.js';
import qrJs from '~public/assets/js/qr.js';
import logoSvg from '~public/assets/images/logo.svg';

/** path → raw file content. */
export const ASSETS: Record<string, string> = {
  '/': indexHtml,
  '/index.html': indexHtml,
  '/favicon.svg': logoSvg,
  '/assets/css/neon.css': neonCss,
  '/assets/js/app.js': appJs,
  '/assets/js/ui.js': uiJs,
  '/assets/js/api.js': apiJs,
  '/assets/js/qr.js': qrJs,
  '/assets/images/logo.svg': logoSvg,
};

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  ico: 'image/x-icon',
};

export function contentType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return TYPES[ext] || 'application/octet-stream';
}

export const INDEX_HTML = indexHtml;
