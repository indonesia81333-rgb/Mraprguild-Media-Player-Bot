import { APPS, parseHttpUrl, fileName, appIntent, m3u, embedCode, formatTime, srtToVtt } from './links.js';

const $ = (id) => document.getElementById(id);
const player = $('player');
const stage = $('stage');
const isAndroid = /Android/i.test(navigator.userAgent);
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3];
const FITS = [['contain', 'Fit'], ['cover', 'Crop'], ['fill', 'Stretch']];

let current = null;
let subtitle = '';
let hls = null;
let started = false;
let fit = 0;
let delay = 0;
let seeking = false;
let hideTimer, toastTimer, lastSaved = 0;
const applied = new WeakMap(); // subtitle delay already applied to each track

const say = (msg) => { $('status').textContent = msg; };
function toast(msg) {
  $('toast').textContent = msg;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 1200);
}

// Browser storage can be unavailable (private mode), so every access is guarded.
const key = (url) => 'pos:' + [...url].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
const load = (url) => { try { return Number(localStorage.getItem(key(url))) || 0; } catch { return 0; } };
const save = (url, t) => {
  try { if (t) localStorage.setItem(key(url), t); else localStorage.removeItem(key(url)); } catch { /* ignore */ }
};

function fill(select, labels, selected = 0, disabled = false) {
  select.replaceChildren(...labels.map((label, i) => new Option(label, i)));
  select.selectedIndex = selected;
  select.disabled = disabled;
}

/* ---------- tracks ---------- */
const textTracks = () => [...player.textTracks].filter((t) => t.kind === 'subtitles' || t.kind === 'captions');

function refreshTracks() {
  if (hls && hls.audioTracks.length > 1) {
    fill($('audio'), hls.audioTracks.map((t) => t.name || t.lang || 'Audio'), hls.audioTrack);
  } else if (!hls && player.audioTracks?.length > 1) {
    const list = [...player.audioTracks];
    fill($('audio'), list.map((t, i) => t.label || t.language || `Audio ${i + 1}`), list.findIndex((t) => t.enabled));
  }
  const subs = textTracks();
  if (subs.length) {
    fill($('subs'), ['Off', ...subs.map((t, i) => t.label || t.language || `Subtitle ${i + 1}`)],
      subs.findIndex((t) => t.mode === 'showing') + 1);
  }
}

function applyDelay() {
  for (const el of player.querySelectorAll('track')) {
    const { track } = el;
    if (!track.cues?.length) continue;
    const diff = delay - (applied.get(track) || 0);
    if (!diff) continue;
    for (const cue of [...track.cues]) { cue.startTime += diff; cue.endTime += diff; }
    applied.set(track, delay);
  }
}

function addSubtitle(text, label) {
  const el = document.createElement('track');
  el.kind = 'subtitles';
  el.label = label;
  el.src = URL.createObjectURL(new Blob([srtToVtt(text)], { type: 'text/vtt' }));
  el.onload = applyDelay;
  player.append(el);
  textTracks().forEach((t) => { t.mode = 'disabled'; });
  el.track.mode = 'showing';
  refreshTracks();
}

async function loadSubtitleUrl(url, video) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const text = await res.text();
    if (current === video) addSubtitle(text, fileName(url));
  } catch {
    say('Could not load the subtitle link (the host may block it). Download the file and add it below.');
  }
}

/* ---------- loading and playback ---------- */
function reset() {
  if (hls) { hls.destroy(); hls = null; }
  started = false;
  player.pause();
  player.removeAttribute('src');
  player.querySelectorAll('track').forEach((t) => { URL.revokeObjectURL(t.src); t.remove(); });
  // Tracks added by the browser or hls.js cannot be removed, so disable them.
  for (const t of player.textTracks) t.mode = 'disabled';
  player.load();
  fill($('audio'), ['Default'], 0, true);
  fill($('subs'), ['Off'], 0, true);
  fill($('quality'), ['Auto'], 0, true);
  $('seek').value = 0;
  $('seek').disabled = true;
  $('now').textContent = $('total').textContent = '0:00';
  $('spinner').hidden = true;
  stage.classList.remove('locked', 'idle');
  stage.classList.add('paused');
  $('unlock').hidden = true;
}

function start() {
  started = true;
  say('');
  const video = current;
  const isHls = new URL(video).pathname.toLowerCase().endsWith('.m3u8');
  if (isHls && window.Hls?.isSupported()) {
    const { Events, ErrorTypes } = window.Hls;
    let retries = 0;
    hls = new window.Hls();
    hls.on(Events.MANIFEST_PARSED, () => {
      if (hls.levels.length > 1) {
        fill($('quality'), ['Auto', ...hls.levels.map((l) => (l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps`))]);
      }
    });
    hls.on(Events.AUDIO_TRACKS_UPDATED, refreshTracks);
    hls.on(Events.SUBTITLE_TRACKS_UPDATED, () => setTimeout(refreshTracks, 0));
    hls.on(Events.ERROR, (_, data) => {
      if (!data.fatal) return;
      if (retries++ < 2 && data.type === ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else if (retries <= 2 && data.type === ErrorTypes.NETWORK_ERROR && hls.levels?.length) hls.startLoad();
      else { $('spinner').hidden = true; say('This stream could not be played here. Open it in an app below.'); }
    });
    hls.loadSource(video);
    hls.attachMedia(player);
  } else {
    player.src = video;
  }
  const sub = parseHttpUrl(subtitle);
  if (sub) loadSubtitleUrl(sub.href, video);
}

function toggle() {
  if (!current) return;
  if (!started || player.error) { if (started) reset(); start(); }
  else if (!player.paused) return player.pause();
  player.play().catch(() => {}); // errors are reported by the error event
}

function seekTo(t) {
  if (!Number.isFinite(player.duration)) return;
  player.currentTime = Math.min(Math.max(t, 0), player.duration);
}
function skip(sec) {
  seekTo(player.currentTime + sec);
  toast(`${sec > 0 ? '+' : ''}${sec}s`);
}
function setVolume(v) {
  player.volume = Math.min(Math.max(v, 0), 1);
  player.muted = player.volume === 0;
  toast(`Volume ${Math.round(player.volume * 100)}%`);
}
function setBrightness(v) {
  const b = Math.min(Math.max(v, 0.3), 1.5);
  player.style.filter = `brightness(${b})`;
  $('bright').value = b;
  toast(`Brightness ${Math.round(b * 100)}%`);
}

/* ---------- controls visibility, full screen ---------- */
function wake() {
  stage.classList.remove('idle');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (!player.paused) stage.classList.add('idle'); }, 3000);
}

async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (stage.requestFullscreen) {
      await stage.requestFullscreen();
      if (player.videoWidth > player.videoHeight) await screen.orientation?.lock?.('landscape');
    } else player.webkitEnterFullscreen?.(); // iPhone
  } catch { /* orientation lock is not available everywhere */ }
}

/* ---------- gestures ---------- */
const surface = $('surface');
let press = null;
let lastTap = { time: 0, x: 0 };
let tapTimer;

surface.addEventListener('pointerdown', (e) => {
  if (!e.isPrimary || e.button !== 0 || stage.classList.contains('locked')) return;
  surface.setPointerCapture(e.pointerId);
  press = { x: e.clientX, y: e.clientY, mode: '', volume: player.volume,
    bright: Number($('bright').value), time: player.currentTime, speed: player.playbackRate };
  press.hold = setTimeout(() => {
    if (press && !press.mode && !player.paused) { press.mode = 'hold'; player.playbackRate = 2; toast('2× speed'); }
  }, 600);
});

surface.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') wake();
  if (!press || press.mode === 'hold') return;
  const dx = e.clientX - press.x;
  const dy = e.clientY - press.y;
  const box = surface.getBoundingClientRect();
  if (!press.mode) {
    if (Math.hypot(dx, dy) < 12) return;
    clearTimeout(press.hold);
    if (Math.abs(dx) > Math.abs(dy)) press.mode = 'seek';
    else if (document.fullscreenElement) press.mode = press.x < box.left + box.width / 2 ? 'bright' : 'volume';
    else press.mode = 'scroll';
  }
  if (press.mode === 'seek' && Number.isFinite(player.duration)) {
    press.target = Math.min(Math.max(press.time + (dx / box.width) * 120, 0), player.duration);
    toast(`${formatTime(press.target)} / ${formatTime(player.duration)}`);
  } else if (press.mode === 'volume') setVolume(press.volume - dy / box.height);
  else if (press.mode === 'bright') setBrightness(press.bright - dy / box.height);
});

function release(e) {
  if (!press) return;
  const p = press;
  press = null;
  clearTimeout(p.hold);
  if (p.mode === 'hold') player.playbackRate = p.speed;
  if (e.type !== 'pointerup') return;
  if (p.mode === 'seek' && p.target !== undefined) seekTo(p.target);
  if (p.mode) return;

  const box = surface.getBoundingClientRect();
  const side = (e.clientX - box.left) / box.width;
  const now = Date.now();
  if (now - lastTap.time < 300 && Math.abs(e.clientX - lastTap.x) < 60) {
    clearTimeout(tapTimer);
    lastTap.time = 0;
    if (side < 0.35) skip(-10);
    else if (side > 0.65) skip(10);
    else if (e.pointerType === 'mouse') fullscreen();
    else toggle();
    return;
  }
  lastTap = { time: now, x: e.clientX };
  const wasIdle = stage.classList.contains('idle');
  tapTimer = setTimeout(() => {
    if (e.pointerType === 'mouse') toggle();
    else if (wasIdle || player.paused) wake();
    else stage.classList.add('idle');
  }, 300);
}
surface.addEventListener('pointerup', release);
surface.addEventListener('pointercancel', release);
surface.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------- buttons ---------- */
$('big').onclick = toggle;
$('play').onclick = toggle;
$('back').onclick = () => skip(-10);
$('fwd').onclick = () => skip(10);
$('mute').onclick = () => { player.muted = !player.muted; };
$('volume').oninput = (e) => setVolume(Number(e.target.value));
$('full').onclick = fullscreen;
$('lock').onclick = () => { stage.classList.add('locked'); $('unlock').hidden = false; };
$('unlock').onclick = () => { stage.classList.remove('locked'); $('unlock').hidden = true; wake(); };
$('fit').onclick = () => {
  fit = (fit + 1) % FITS.length;
  player.style.objectFit = FITS[fit][0];
  $('fit').textContent = FITS[fit][1];
  toast(FITS[fit][1]);
};
$('pip').hidden = !document.pictureInPictureEnabled;
$('pip').onclick = async () => {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await player.requestPictureInPicture();
  } catch { toast('Start the video first'); }
};
$('controls').addEventListener('pointerdown', wake);
$('seek').oninput = (e) => {
  seeking = true;
  $('now').textContent = formatTime((e.target.value / 1000) * player.duration);
  wake();
};
$('seek').onchange = (e) => { seekTo((e.target.value / 1000) * player.duration); seeking = false; };
$('restart').onclick = () => {
  if (current) save(current, 0);
  if (started) seekTo(0);
  toggleOn();
};
function toggleOn() { if (!started || player.paused) toggle(); }

/* ---------- settings ---------- */
fill($('speed'), SPEEDS.map((s) => `${s}×`), SPEEDS.indexOf(1));
$('speed').onchange = (e) => { player.defaultPlaybackRate = player.playbackRate = SPEEDS[e.target.value]; };
$('quality').onchange = (e) => { if (hls) hls.currentLevel = Number(e.target.value) - 1; };
$('audio').onchange = (e) => {
  const i = Number(e.target.value);
  if (hls) hls.audioTrack = i;
  else [...player.audioTracks].forEach((t, n) => { t.enabled = n === i; });
};
$('subs').onchange = (e) => {
  const i = Number(e.target.value) - 1;
  textTracks().forEach((t, n) => { t.mode = n === i ? 'showing' : 'disabled'; });
  setTimeout(applyDelay, 200);
};
$('subsize').onchange = (e) => {
  stage.classList.remove('sub-s', 'sub-m', 'sub-l');
  stage.classList.add(`sub-${e.target.value}`);
};
$('delay').onchange = (e) => { delay = Number(e.target.value) || 0; applyDelay(); };
$('bright').oninput = (e) => setBrightness(Number(e.target.value));
$('loop').onchange = (e) => { player.loop = e.target.checked; };
$('subfile').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !current) return;
  if (!started) start();
  addSubtitle(await file.text(), file.name);
};

/* ---------- video events ---------- */
player.addEventListener('loadedmetadata', () => {
  refreshTracks();
  $('total').textContent = formatTime(player.duration);
  $('seek').disabled = !Number.isFinite(player.duration);
  if (!Number.isFinite(player.duration)) $('total').textContent = 'LIVE';
  const at = load(current);
  if (at && at < player.duration - 10) { player.currentTime = at; toast(`Resumed at ${formatTime(at)}`); }
});
player.addEventListener('timeupdate', () => {
  const { currentTime: t, duration: d } = player;
  if (!seeking) {
    $('now').textContent = formatTime(t);
    if (Number.isFinite(d) && d) $('seek').value = (t / d) * 1000;
  }
  if (Number.isFinite(d) && t > 5 && Math.abs(t - lastSaved) >= 5) {
    lastSaved = t;
    save(current, t < d - 10 ? Math.floor(t) : 0);
  }
});
player.addEventListener('play', () => { stage.classList.remove('paused'); $('play').textContent = '⏸'; wake(); });
player.addEventListener('pause', () => { stage.classList.add('paused'); $('play').textContent = '▶'; wake(); });
player.addEventListener('ended', () => save(current, 0));
player.addEventListener('volumechange', () => {
  $('mute').textContent = player.muted ? '🔇' : '🔊';
  $('volume').value = player.muted ? 0 : player.volume;
});
for (const name of ['waiting', 'seeking']) player.addEventListener(name, () => { $('spinner').hidden = false; });
for (const name of ['playing', 'canplay', 'seeked']) player.addEventListener(name, () => { $('spinner').hidden = true; });
player.addEventListener('error', () => {
  if (!player.getAttribute('src')) return;
  $('spinner').hidden = true;
  say('This browser cannot play the file (format, codec, or the host blocks it). Open it in an app below.');
});

document.addEventListener('keydown', (e) => {
  if (!current || e.ctrlKey || e.metaKey || e.altKey || stage.classList.contains('locked')) return;
  if (e.target.closest('input, select, textarea, button, a, summary')) return;
  const actions = {
    ' ': toggle, k: toggle, ArrowLeft: () => skip(-10), ArrowRight: () => skip(10),
    ArrowUp: () => setVolume(player.volume + 0.1), ArrowDown: () => setVolume(player.volume - 0.1),
    f: fullscreen, m: () => $('mute').click(),
  };
  const action = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (action) { e.preventDefault(); action(); wake(); }
});

/* ---------- apps and copy ---------- */
async function copy(box, button) {
  try { await navigator.clipboard.writeText(box.value); }
  catch { box.select(); if (!document.execCommand('copy')) { button.textContent = 'Select & copy'; return; } }
  button.textContent = 'Copied ✓';
  setTimeout(() => { button.textContent = 'Copy'; }, 1500);
}

function codeBlock(title, value) {
  const wrap = document.createElement('div');
  wrap.className = 'code';
  const label = document.createElement('b');
  label.textContent = title;
  const box = document.createElement('textarea');
  box.readOnly = true;
  box.rows = 2;
  box.value = value;
  box.setAttribute('aria-label', title);
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Copy';
  button.onclick = () => copy(box, button);
  wrap.append(label, box, button);
  return wrap;
}

function renderApps() {
  $('apps').replaceChildren(...APPS.map((app) => {
    const a = document.createElement('a');
    a.className = 'btn';
    a.dataset.app = app.id;
    a.textContent = app.name;
    if (isAndroid) a.href = appIntent(current, app);
    else {
      a.href = '#';
      a.onclick = (e) => { e.preventDefault(); toast(''); say('App buttons work on Android. On a PC, use the .m3u playlist file.'); };
    }
    return a;
  }));
  $('apphint').textContent = isAndroid
    ? 'If nothing opens (for example inside Telegram), open this page in Chrome. A missing app sends you to the Play Store. External subtitles must be loaded inside the app.'
    : 'These buttons need an Android phone or TV.';
}

function show(url) {
  reset();
  current = url.href;
  lastSaved = 0;
  say(location.protocol === 'https:' && url.protocol === 'http:'
    ? 'This is an http link. The browser may block online playback; an app or Download will work better.' : '');
  const name = fileName(current);
  $('name').textContent = name;
  document.title = `${name} | Mraprguild Media Player`;
  $('download').href = current;
  $('download').download = name;
  if ($('playlist').href) URL.revokeObjectURL($('playlist').href);
  $('playlist').href = URL.createObjectURL(new Blob([m3u(current)], { type: 'audio/x-mpegurl' }));
  $('playlist').download = `${name}.m3u`;
  renderApps();
  $('codes').replaceChildren(
    codeBlock('Video link', current),
    codeBlock('Player link', location.href),
    ...(subtitle ? [codeBlock('Subtitle link', subtitle)] : []),
    codeBlock('HTML embed code', embedCode(current)),
    ...APPS.map((app) => codeBlock(`${app.name} intent code`, appIntent(current, app))),
  );
  $('result').hidden = false;
}

function fromHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const url = parseHttpUrl(p.get('v'));
  subtitle = parseHttpUrl(p.get('s'))?.href || '';
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
