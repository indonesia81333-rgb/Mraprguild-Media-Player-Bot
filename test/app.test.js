import test from 'node:test';
import assert from 'node:assert/strict';
import { replyFor, extractLinks } from '../src/bot.js';
import { novaIntent, srtToVtt, parseHttpUrl } from '../web/links.js';

const msg = (text, type = 'private') => ({ chat: { id: 1, type }, from: { first_name: '<A&B>' }, text });
const web = 'https://example.onrender.com';

test('welcome message escapes names and fits Telegram limit', () => {
  const r = replyFor(msg('/start'), web);
  assert.match(r.text, /Mraprguild Media Player Bot/);
  assert.match(r.text, /&lt;A&amp;B&gt;/);
  assert.ok(r.text.length < 4096);
});

test('video link gives watch and download buttons', () => {
  const r = replyFor(msg('here https://a.com/m.mp4?x=1&y=2 https://a.com/m.srt'), web);
  const [watch, download] = r.reply_markup.inline_keyboard[0];
  const p = new URLSearchParams(new URL(watch.url).hash.slice(1));
  assert.equal(p.get('v'), 'https://a.com/m.mp4?x=1&y=2');
  assert.equal(p.get('s'), 'https://a.com/m.srt');
  assert.equal(download.url, 'https://a.com/m.mp4?x=1&y=2');
});

test('bad input', () => {
  assert.equal(parseHttpUrl('javascript:alert(1)'), null);
  assert.equal(extractLinks('no link').video, undefined);
  assert.equal(replyFor(msg('hello', 'group'), web), null);
  assert.match(replyFor(msg('hello'), web).text, /direct video link/);
});

test('Nova intent and SRT conversion', () => {
  assert.match(novaIntent('https://a.com/v.mkv#t'), /^intent:\/\/a\.com\/v\.mkv#Intent;scheme=https;.*package=org\.courville\.nova;/);
  assert.equal(srtToVtt('1\r\n00:00:01,000 --> 00:00:02,500\r\nHi'), 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500\nHi');
});
