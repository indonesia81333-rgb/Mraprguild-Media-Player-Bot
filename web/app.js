import {
  parseHttpUrl, fileName, playerIntent, srtToVtt, PLAYERS, NOVA_STORE
} from "./links.js";

const $ = (id) => document.getElementById(id);
const player = $("player");
let current = null;
let subtitle = "";
let hls = null;
let subtitleObjectUrls = [];

const say = (message, type = "") => {
  $("status").textContent = message;
  $("status").dataset.type = type;
};
const isAndroid = /Android/i.test(navigator.userAgent);

function fill(select, labels, selected = 0, disabled = false) {
  select.replaceChildren(...labels.map((label, index) => new Option(label, index)));
  select.selectedIndex = Math.max(0, selected);
  select.disabled = disabled;
}

function textTracks() {
  return [...player.textTracks].filter((track) =>
    track.kind === "subtitles" || track.kind === "captions"
  );
}

function reset() {
  if (hls) { hls.destroy(); hls = null; }
  player.pause();
  player.removeAttribute("src");
  player.querySelectorAll("track").forEach((track) => track.remove());
  subtitleObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  subtitleObjectUrls = [];
  [...player.textTracks].forEach((track) => { track.mode = "disabled"; });
  player.load();
  player.hidden = true;
  fill($("audio"), ["Main source"], 0, true);
  fill($("subs"), ["Off"], 0, true);
  $("playerPanel").hidden = true;
}

function refreshTracks() {
  if (hls?.audioTracks?.length) {
    const tracks = hls.audioTracks;
    fill($("audio"), ["Main source", ...tracks.map((track, i) =>
      track.name || track.lang || `Audio ${i + 1}`)], 0, false);
    $("audio").dataset.hls = "true";
  } else if (player.audioTracks?.length > 1) {
    const tracks = [...player.audioTracks];
    fill($("audio"), tracks.map((track, i) =>
      track.label || track.language || `Audio ${i + 1}`),
      Math.max(0, tracks.findIndex((track) => track.enabled)), false);
    $("audio").dataset.hls = "false";
  }

  const tracks = textTracks();
  if (tracks.length) {
    fill($("subs"), ["Off", ...tracks.map((track, i) =>
      track.label || track.language || `Subtitle ${i + 1}`)],
      tracks.findIndex((track) => track.mode === "showing") + 1, false);
  }
}

$("audio").addEventListener("change", (event) => {
  const selected = Number(event.target.value);
  if (event.target.dataset.hls === "true") {
    hls.audioTrack = selected - 1;
  } else if (player.audioTracks?.length) {
    [...player.audioTracks].forEach((track, index) => {
      track.enabled = index === selected;
    });
  }
});

$("subs").addEventListener("change", (event) => {
  const selected = Number(event.target.value) - 1;
  textTracks().forEach((track, index) => {
    track.mode = index === selected ? "showing" : "disabled";
  });
});

function addSubtitle(text, label) {
  const track = document.createElement("track");
  track.kind = "subtitles";
  track.label = label;
  track.srclang = "und";
  const objectUrl = URL.createObjectURL(
    new Blob([srtToVtt(text)], { type: "text/vtt" })
  );
  subtitleObjectUrls.push(objectUrl);
  track.src = objectUrl;
  player.append(track);
  track.addEventListener("load", () => {
    textTracks().forEach((item) => { item.mode = "disabled"; });
    track.track.mode = "showing";
    refreshTracks();
  }, { once: true });
  refreshTracks();
}

async function loadSubtitleUrl(url, video) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (current === video) addSubtitle(text, fileName(url));
  } catch {
    say("Subtitle URL could not be fetched. Try adding the subtitle file from your device.", "warning");
  }
}

$("subfile").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (file) {
    addSubtitle(await file.text(), file.name);
    say(`Subtitle added: ${file.name}`, "success");
  }
  event.target.value = "";
});

function watchInBrowser() {
  if (!current) return;
  reset();
  $("playerPanel").hidden = false;
  player.hidden = false;
  say("Browser playback is optional. For full codec support, open the video in an installed player.");
  const videoUrl = new URL(current);
  const isHls = videoUrl.pathname.toLowerCase().endsWith(".m3u8");

  if (isHls && window.Hls?.isSupported()) {
    hls = new window.Hls({ enableWorker: true, lowLatencyMode: true });
    hls.on(window.Hls.Events.AUDIO_TRACKS_UPDATED, refreshTracks);
    hls.on(window.Hls.Events.SUBTITLE_TRACKS_UPDATED, () => refreshTracks());
    hls.on(window.Hls.Events.ERROR, (_, data) => {
      if (data.fatal) say("This stream cannot be played in the browser. Open it in VLC, MX Player, KMPlayer or Nova.", "warning");
    });
    hls.loadSource(current);
    hls.attachMedia(player);
  } else {
    player.src = current;
  }

  const subUrl = parseHttpUrl(subtitle);
  if (subUrl) loadSubtitleUrl(subUrl.href, current);
  player.play().catch(() => say("Tap Play to start browser playback."));
}

function configureExternalPlayers() {
  Object.entries(PLAYERS).forEach(([key, app]) => {
    const anchor = $(`open-${key}`);
    anchor.href = isAndroid && current
      ? playerIntent(current, key)
      : app.store;
    anchor.title = isAndroid
      ? `Open with ${app.name}. If it is not installed, its Play Store page opens.`
      : `Install ${app.name} on a compatible device`;
  });
  $("store").href = NOVA_STORE;
}

function show(url) {
  reset();
  current = url.href;
  $("name").textContent = fileName(current);
  $("download").href = current;
  $("download").download = fileName(current);
  $("result").hidden = false;
  configureExternalPlayers();

  if (!isAndroid) {
    say("External-player buttons open the app listing. On Android, they launch the installed player directly.");
  } else {
    say("Choose an external player below for native playback. The browser player is optional.");
  }
}

$("watch").addEventListener("click", watchInBrowser);
$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    say("Player link copied.", "success");
  } catch {
    say("Copy the link from your browser address bar.", "warning");
  }
});

function fromHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const url = parseHttpUrl(params.get("v"));
  subtitle = params.get("s") || "";
  if (!url) {
    reset();
    current = null;
    $("result").hidden = true;
    say("Send a video link to the Mraprguild Media Player Bot on Telegram, then open the generated player link.");
    return;
  }
  show(url);
}

player.addEventListener("loadedmetadata", refreshTracks);
player.addEventListener("error", () => {
  if (player.currentSrc) say("Browser playback failed (unsupported codec, format, or host restriction). Try an external player.", "warning");
});
window.addEventListener("hashchange", fromHash);
fromHash();
