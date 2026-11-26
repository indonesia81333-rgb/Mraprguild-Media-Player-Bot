import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { replyFor, BOT_NAME } from './bot.js';

try { process.loadEnvFile(); } catch { /* no .env file */ }

const { BOT_TOKEN } = process.env;
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
const WEB_URL = process.env.WEB_URL || PUBLIC_URL;
const secret = createHash('sha256').update(`webhook:${BOT_TOKEN}`).digest('hex');
const dist = new URL('../dist/', import.meta.url);

const FILES = {
  '/': ['index.html', 'text/html'],
  '/index.html': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/links.js': ['links.js', 'text/javascript'],
  '/style.css': ['style.css', 'text/css'],
};

async function telegram(method, body, timeout = 15000) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

async function handle(update) {
  // Telegram only accepts public URLs in buttons.
  if (!WEB_URL) throw new Error('Set WEB_URL (or PUBLIC_URL) to your public player address');
  const reply = replyFor(update.message, WEB_URL);
  if (reply) await telegram('sendMessage', reply);
}

const server = http.createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/health') return res.end('ok');

  if (req.method === 'POST' && path === '/webhook') {
    const got = Buffer.from(String(req.headers['x-telegram-bot-api-secret-token'] || ''));
    if (!BOT_TOKEN || got.length !== secret.length || !timingSafeEqual(got, Buffer.from(secret))) {
      return res.writeHead(401).end();
    }
    try {
      const chunks = [];
      let size = 0;
      for await (const c of req) {
        if ((size += c.length) > 1_000_000) return res.writeHead(413).end();
        chunks.push(c);
      }
      const update = JSON.parse(Buffer.concat(chunks));
      res.end('ok');
      await handle(update);
    } catch (err) {
      console.error(err.message);
      if (!res.headersSent) res.writeHead(400).end();
    }
    return;
  }

  const file = Object.hasOwn(FILES, path) && FILES[path];
  if (!file || !['GET', 'HEAD'].includes(req.method)) return res.writeHead(404).end('Not found');
  try {
    const body = await readFile(new URL(file[0], dist));
    res.writeHead(200, {
      'content-type': `${file[1]}; charset=utf-8`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-cache',
    }).end(body);
  } catch {
    res.writeHead(500).end('Run "npm run build" first');
  }
});

async function poll() {
  await telegram('deleteWebhook', {});
  console.log('Bot running in polling mode');
  let offset = 0;
  for (;;) {
    try {
      const updates = await telegram('getUpdates', { offset, timeout: 30 }, 40000);
      for (const u of updates) {
        offset = u.update_id + 1;
        await handle(u).catch((e) => console.error(e.message));
      }
    } catch (err) {
      console.error(err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function startBot() {
  const quiet = (p) => p.catch((e) => console.warn(e.message));
  await quiet(telegram('setMyName', { name: BOT_NAME }));
  await quiet(telegram('setMyShortDescription', { short_description: 'Paste a video link: watch online, download, or open in Nova Player.' }));
  await quiet(telegram('setMyDescription', { description: `${BOT_NAME}\n\nPaste a direct video link to get Watch Online and Download buttons, with subtitle support and Nova Video Player.\n\nPress START.` }));
  await quiet(telegram('setMyCommands', { commands: [
    { command: 'start', description: 'Welcome message' },
    { command: 'help', description: 'How to use' },
  ] }));
  if (!PUBLIC_URL) return poll();
  await telegram('setWebhook', { url: `${PUBLIC_URL}/webhook`, secret_token: secret, allowed_updates: ['message'] });
  console.log('Webhook set');
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Listening on port ${PORT}`);
  if (!BOT_TOKEN) return console.warn('BOT_TOKEN missing: web player only');
  startBot().catch((e) => { console.error(`Bot start failed: ${e.message}`); process.exit(1); });
});
