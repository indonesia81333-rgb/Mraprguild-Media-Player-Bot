import { parseHttpUrl, fileName, novaIntent, srtToVtt, NOVA_STORE } from './links.js';

const $ = (id) => document.getElementById(id);
const player = $('player');
let current = null;
let subtitle = '';
let hls = null;

const say = (msg) => { $('status').textContent = msg; };
$('store').href = NOVA_STORE;

function reset() {
  if (hls) { hls.destroy(); hls = null; }
  player.pause();
  player.removeAttribute('src');
  player.querySelectorAll('track').forEach((t) => { URL.revokeObjectURL(t.src); t.remove(); });
  // Tracks added by the browser or hls.js cannot be removed, so disable them.
  for (const t of player.textTracks) t.mode = 'disabled';
  player.load();
  player.hidden = true;
  fill($('audio'), ['Default'], 0, true);
  fill($('subs'), ['Off'], 0, true);
}

function fill(select, labels, selected, disabled) {
  select.replaceChildren(...labels.map((label, i) => new Option(label, i)));
  select.selectedIndex = selected;
  select.disabled = disabled;
}

const textTracks = () => [...player.textTracks].filter((t) => t.kind === 'subtitles' || t.kind === 'captions');

function refreshTracks() {
  if (hls && hls.audioTracks.length > 1) {
    fill($('audio'), hls.audioTracks.map((t) => t.name || t.lang || 'Audio'), hls.audioTrack, false);
  } else if (!hls && player.audioTracks?.length > 1) {
    const list = [...player.audioTracks];
    fill($('audio'), list.map((t, i) => t.label || t.language || `Audio ${i + 1}`),
      list.findIndex((t) => t.enabled), false);
  }
  const subs = textTracks();
  if (subs.length) {
    fill($('subs'), ['Off', ...subs.map((t, i) => t.label || t.language || `Subtitle ${i + 1}`)],
      subs.findIndex((t) => t.mode === 'showing') + 1, false);
  }
}

$('audio').onchange = (e) => {
  const i = Number(e.target.value);
  if (hls) hls.audioTrack = i;
  else [...player.audioTracks].forEach((t, n) => { t.enabled = n === i; });
};
$('subs').onchange = (e) => {
  const i = Number(e.target.value) - 1;
  textTracks().forEach((t, n) => { t.mode = n === i ? 'showing' : 'disabled'; });
};

function addSubtitle(text, label) {
  const track = document.createElement('track');
  track.kind = 'subtitles';
  track.label = label;
  track.src = URL.createObjectURL(new Blob([srtToVtt(text)], { type: 'text/vtt' }));
  player.append(track);
  textTracks().forEach((t) => { t.mode = 'disabled'; });
  track.track.mode = 'showing';
  refreshTracks();
}

async function loadSubtitleUrl(url, video) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const text = await res.text();
    if (current === video) addSubtitle(text, fileName(url));
  } catch {
    say('Could not load the subtitle link (the host may block it). Download the file and add it from your device.');
  }
}

$('subfile').onchange = async (e) => {
  const file = e.target.files[0];
  if (file) addSubtitle(await file.text(), file.name);
  e.target.value = '';
};

function watch() {
  const video = current;
  reset();
  player.hidden = false;
  say('');
  const isHls = new URL(video).pathname.toLowerCase().endsWith('.m3u8');
  if (isHls && window.Hls?.isSupported()) {
    hls = new window.Hls();
    hls.on(window.Hls.Events.AUDIO_TRACKS_UPDATED, refreshTracks);
    hls.on(window.Hls.Events.SUBTITLE_TRACKS_UPDATED, () => setTimeout(refreshTracks, 0));
    hls.on(window.Hls.Events.ERROR, (_, data) => {
      if (data.fatal) say('This stream could not be played here. Try Nova Player.');
    });
    hls.loadSource(video);
    hls.attachMedia(player);
  } else {
    player.src = video;
  }
  const sub = parseHttpUrl(subtitle);
  if (sub) loadSubtitleUrl(sub.href, video);
  player.play().catch(() => {}); // autoplay may be blocked; controls remain
}

player.addEventListener('loadedmetadata', refreshTracks);
player.addEventListener('error', () => {
  if (player.getAttribute('src')) say('This browser cannot play the file (format, codec, or the host blocks it). Try Nova Player.');
});

function show(url) {
  reset();
  current = url.href;
  say(location.protocol === 'https:' && url.protocol === 'http:'
    ? 'This is an http link. The browser may block online playback; Nova Player or Download will work better.' : '');
  $('name').textContent = fileName(current);
  $('download').href = current;
  $('download').download = fileName(current);
  $('nova').href = /Android/i.test(navigator.userAgent) ? novaIntent(current) : NOVA_STORE;
  $('result').hidden = false;
}

$('watch').onclick = watch;
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); say('Player link copied.'); }
  catch { say('Copy the link from the address bar.'); }
};

function fromHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const url = parseHttpUrl(p.get('v'));
  subtitle = p.get('s') || '';
  if (!url) {
    reset();
    current = null;
    $('result').hidden = true;
    say('Send your video link to the Mraprguild Media Player Bot on Telegram, then tap Watch Online.');
    return;
  }
  show(url);
}
addEventListener('hashchange', fromHash);
fromHash();
