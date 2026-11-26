// Link helpers for the web player.
export const APPS = [
  { id: 'mx', name: 'MX Player', pkg: 'com.mxtech.videoplayer.ad' },
  { id: 'mxpro', name: 'MX Player Pro', pkg: 'com.mxtech.videoplayer.pro' },
  { id: 'vlc', name: 'VLC', pkg: 'org.videolan.vlc' },
  { id: 'km', name: 'KMPlayer', pkg: 'com.kmplayer' },
  { id: 'nova', name: 'Nova Player', pkg: 'org.courville.nova' },
  { id: 'any', name: 'All Players', pkg: '' }, // Android picks or asks
];

export const storeLink = (app) =>
  `https://play.google.com/store/search?c=apps&q=${encodeURIComponent(app.pkg ? app.name : 'video player')}`;

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

/** Android intent link that opens the video in a player app. */
export function appIntent(video, app) {
  const u = new URL(video);
  u.hash = '';
  const scheme = u.protocol.slice(0, -1);
  const rest = u.href.slice(u.protocol.length + 2).replace(/;/g, '%3B');
  return `intent://${rest}#Intent;scheme=${scheme};action=android.intent.action.VIEW;type=video/*;` +
    (app.pkg ? `package=${app.pkg};` : '') +
    `S.title=${encodeURIComponent(fileName(video))};` +
    `S.browser_fallback_url=${encodeURIComponent(storeLink(app))};end`;
}

/** Playlist file for desktop players. */
export const m3u = (video) => `#EXTM3U\n#EXTINF:-1,${fileName(video).replace(/[\r\n]/g, ' ')}\n${video}\n`;

export function embedCode(video) {
  const safe = video.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<video controls playsinline width="100%" src="${safe}"></video>`;
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds);
  const two = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  return (h ? `${h}:${two(Math.floor(s / 60) % 60)}` : `${Math.floor(s / 60)}`) + `:${two(s % 60)}`;
}

export function srtToVtt(text) {
  const body = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (body.startsWith('WEBVTT')) return body;
  return 'WEBVTT\n\n' + body.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
}
