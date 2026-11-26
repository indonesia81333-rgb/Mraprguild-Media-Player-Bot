// Link helpers for the web player.
export const NOVA_PACKAGE = 'org.courville.nova';
export const NOVA_STORE = `https://play.google.com/store/apps/details?id=${NOVA_PACKAGE}`;

export function parseHttpUrl(text) {
  try {
    const u = new URL(String(text).trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

export function fileName(url) {
  const last = new URL(url).pathname.split('/').filter(Boolean).pop() || 'video';
  try { return decodeURIComponent(last); } catch { return last; }
}

export function playerLink(base, video, subtitle) {
  const p = new URLSearchParams({ v: video });
  if (subtitle) p.set('s', subtitle);
  // Fragment (#) keeps the media link out of web server logs.
  return `${base.replace(/\/+$/, '')}/#${p}`;
}

export function novaIntent(video) {
  const u = new URL(video);
  u.hash = '';
  const scheme = u.protocol.slice(0, -1);
  const rest = u.href.slice(u.protocol.length + 2).replace(/;/g, '%3B');
  return `intent://${rest}#Intent;scheme=${scheme};action=android.intent.action.VIEW;` +
    `type=video/*;package=${NOVA_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(NOVA_STORE)};end`;
}

export function srtToVtt(text) {
  const body = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (body.startsWith('WEBVTT')) return body;
  return 'WEBVTT\n\n' + body.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
}
