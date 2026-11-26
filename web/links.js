// External Android player integrations and safe URL helpers.
export const PLAYERS = {
  nova: {
    name: "Nova Video Player",
    package: "org.courville.nova",
    store: "https://play.google.com/store/apps/details?id=org.courville.nova",
    icon: "✦",
    description: "Library-focused video player"
  },
  mx: {
    name: "MX Player",
    package: "com.mxtech.videoplayer.ad",
    store: "https://play.google.com/store/apps/details?id=com.mxtech.videoplayer.ad",
    icon: "▶",
    description: "Popular hardware-accelerated player"
  },
  vlc: {
    name: "VLC",
    package: "org.videolan.vlc",
    store: "https://play.google.com/store/apps/details?id=org.videolan.vlc",
    icon: "◉",
    description: "Open-source media player"
  },
  km: {
    name: "KMPlayer",
    package: "com.kmplayer",
    store: "https://play.google.com/store/apps/details?id=com.kmplayer",
    icon: "K",
    description: "Advanced playback and subtitles"
  }
};

export const NOVA_PACKAGE = PLAYERS.nova.package;
export const NOVA_STORE = PLAYERS.nova.store;

export function parseHttpUrl(text) {
  try {
    const url = new URL(String(text).trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function fileName(url) {
  const last = new URL(url).pathname.split("/").filter(Boolean).pop() || "video";
  try { return decodeURIComponent(last); } catch { return last; }
}

export function playerLink(base, video, subtitle) {
  const params = new URLSearchParams({ v: video });
  if (subtitle) params.set("s", subtitle);
  return `${base.replace(/\\/+$/, "")}/#${params}`;
}

export function playerIntent(video, playerKey) {
  const app = PLAYERS[playerKey];
  if (!app) throw new Error("Unsupported player");
  const url = new URL(video);
  url.hash = "";
  const scheme = url.protocol.slice(0, -1);
  const rest = url.href.slice(url.protocol.length + 2).replace(/;/g, "%3B");
  return `intent://${rest}#Intent;scheme=${scheme};action=android.intent.action.VIEW;` +
    `type=video/*;package=${app.package};` +
    `S.browser_fallback_url=${encodeURIComponent(app.store)};end`;
}

export function novaIntent(video) {
  return playerIntent(video, "nova");
}

export function srtToVtt(text) {
  const body = String(text).replace(/^\\uFEFF/, "").replace(/\\r\\n?/g, "\\n");
  if (body.startsWith("WEBVTT")) return body;
  return "WEBVTT\\n\\n" + body.replace(/(\\d{1,2}:\\d{2}:\\d{2}),(\\d{3})/g, "$1.$2");
}
