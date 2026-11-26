"""Message handling for the Telegram bot."""
import html
import re
from urllib.parse import unquote, urlencode, urlsplit

BOT_NAME = "Mraprguild Media Player Bot"
NOVA_STORE = "https://play.google.com/store/apps/details?id=org.courville.nova"

WELCOME = """👋 <b>Hello {name}!</b>
Welcome to <b>{bot}</b> 🎬

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

⚠️ Web page links (YouTube etc.) and files uploaded to Telegram are not supported. Share only content you have the right to use."""


def welcome_text(first_name="friend"):
    return WELCOME.format(name=html.escape(first_name, quote=False), bot=BOT_NAME)


def is_http_url(url):
    try:
        parts = urlsplit(url)
        parts.port  # raises ValueError on an invalid port
    except ValueError:
        return False
    return parts.scheme in ("http", "https") and bool(parts.hostname)


def extract_links(text):
    """Return (video_url, subtitle_url); either may be None."""
    found = (m.rstrip(".,!?)]") for m in re.findall(r'https?://[^\s<>"]+', text, re.I))
    video = subtitle = None
    for url in filter(is_http_url, found):
        if urlsplit(url).path.lower().endswith((".srt", ".vtt")):
            subtitle = subtitle or url
        else:
            video = video or url
    return video, subtitle


def file_name(url):
    parts = [p for p in urlsplit(url).path.split("/") if p]
    return unquote(parts[-1]) if parts else "video"


def player_link(base, video, subtitle=None):
    params = {"v": video}
    if subtitle:
        params["s"] = subtitle
    # The fragment (#) keeps the media link out of web server logs.
    return f"{base.rstrip('/')}/#{urlencode(params)}"


def reply_for(message, web_url):
    """Return a sendMessage payload for an incoming message, or None."""
    if not message or "chat" not in message:
        return None
    chat = message["chat"]
    text = message.get("text") or message.get("caption") or ""
    base = {
        "chat_id": chat["id"],
        "parse_mode": "HTML",
        "link_preview_options": {"is_disabled": True},
    }
    nova_row = [{"text": "📱 Get Nova Video Player", "url": NOVA_STORE}]

    if re.match(r"/(start|help)(@\w+)?(\s|$)", text, re.I):
        name = message.get("from", {}).get("first_name") or "friend"
        return {**base, "text": welcome_text(name),
                "reply_markup": {"inline_keyboard": [nova_row]}}

    video, subtitle = extract_links(text)
    if not video:
        # Stay quiet in groups unless there is something to convert.
        if chat.get("type") != "private":
            return None
        return {**base, "text": "❗ Send a direct video link (http or https). Type /help for details."}

    name = file_name(video)
    if len(name) > 200:
        name = name[:200] + "…"
    note = "\n💬 Subtitle added" if subtitle else ""
    return {
        **base,
        "text": f"✅ <b>Your player is ready</b>\n\n🎬 {html.escape(name, quote=False)}{note}\n\n"
                "For Nova Video Player, tap Watch Online, then <b>Open in Nova Player</b>.",
        "reply_markup": {"inline_keyboard": [
            [{"text": "▶️ Watch Online", "url": player_link(web_url, video, subtitle)},
             {"text": "⬇️ Download", "url": video}],
            nova_row,
        ]},
    }
