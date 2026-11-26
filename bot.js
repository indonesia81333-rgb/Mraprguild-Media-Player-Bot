import { parseHttpUrl, fileName, playerLink, NOVA_STORE } from '../web/links.js';

export const BOT_NAME = 'Mraprguild Media Player Bot';

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function welcomeText(firstName = 'friend') {
  return `👋 <b>Hello ${escapeHtml(firstName)}!</b>
Welcome to <b>${BOT_NAME}</b> 🎬

I turn a direct video link into an online player.

<b>✨ Features</b>
▶️ Watch Online in your browser
⬇️ Download from the original link
📱 Open in Nova Video Player (Android)
🎧 Audio track switching (HLS streams; other files depend on browser, or use Nova)
💬 Subtitles: SRT / VTT online; Nova supports more formats
🔗 Shareable player link

<b>📌 How to use</b>
1. Copy a direct video link
2. Paste it in this chat and send
3. Tap <b>Watch Online</b> or <b>Download</b>

<b>💬 With subtitles</b>
Send both links in one message:
<code>https://site.com/movie.mp4 https://site.com/movie.srt</code>

<b>🎞 Links</b>
Best online: MP4 (H.264/AAC), WebM, M3U8
Best in Nova: MKV, AVI, AC3/DTS audio

<b>⚙️ Commands</b>
/start - Welcome message
/help - How to use

⚠️ Web page links (YouTube etc.) and files uploaded to Telegram are not supported. Share only content you have the right to use.`;
}

export function extractLinks(text = '') {
  const urls = (text.match(/https?:\/\/[^\s<>"]+/gi) || [])
    .map((m) => parseHttpUrl(m.replace(/[.,!?)\]]+$/, '')))
    .filter(Boolean);
  const isSub = (u) => /\.(srt|vtt)$/i.test(u.pathname);
  return { video: urls.find((u) => !isSub(u))?.href, subtitle: urls.find(isSub)?.href };
}

/** Returns the Telegram sendMessage payload for an incoming message, or null. */
export function replyFor(message, webUrl) {
  if (!message?.chat) return null;
  const text = message.text || message.caption || '';
  const base = { chat_id: message.chat.id, parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
  const isPrivate = message.chat.type === 'private';

  if (/^\/(start|help)(@\w+)?(\s|$)/i.test(text)) {
    return {
      ...base,
      text: welcomeText(message.from?.first_name),
      reply_markup: { inline_keyboard: [
        [{ text: '📱 Get Nova Video Player', url: NOVA_STORE }],
      ] },
    };
  }

  const { video, subtitle } = extractLinks(text);
  if (!video) {
    // Stay quiet in groups unless there is something to convert.
    return isPrivate ? { ...base, text: '❗ Send a direct video link (http or https). Type /help for details.' } : null;
  }
  const watch = playerLink(webUrl, video, subtitle);
  let name = fileName(video);
  if (name.length > 200) name = name.slice(0, 200) + '…';
  return {
    ...base,
    text: `✅ <b>Your player is ready</b>\n\n🎬 ${escapeHtml(name)}${subtitle ? '\n💬 Subtitle added' : ''}\n\n` +
      'For Nova Video Player, tap Watch Online, then <b>Open in Nova Player</b>.',
    reply_markup: { inline_keyboard: [
      [{ text: '▶️ Watch Online', url: watch }, { text: '⬇️ Download', url: video }],
      [{ text: '📱 Get Nova Video Player', url: NOVA_STORE }],
    ] },
  };
}
