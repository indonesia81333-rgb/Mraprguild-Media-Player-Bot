"""Web server for the watch page plus Telegram webhook (or polling)."""
import hashlib
import hmac
import json
import os
import signal
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from bot import BOT_NAME, reply_for

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"


def load_env(path=ROOT / ".env"):
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and not key.strip().startswith("#"):
                os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


load_env()
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
PORT = int(os.getenv("PORT") or 3000)
PUBLIC_URL = (os.getenv("PUBLIC_URL") or os.getenv("RENDER_EXTERNAL_URL") or "").rstrip("/")
WEB_URL = os.getenv("WEB_URL") or PUBLIC_URL
SECRET = hashlib.sha256(f"webhook:{BOT_TOKEN}".encode()).hexdigest()

FILES = {
    "/": ("index.html", "text/html"),
    "/index.html": ("index.html", "text/html"),
    "/app.js": ("app.js", "text/javascript"),
    "/links.js": ("links.js", "text/javascript"),
    "/style.css": ("style.css", "text/css"),
}


def telegram(method, payload=None, timeout=15):
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{BOT_TOKEN}/{method}",
        data=json.dumps(payload or {}).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = json.load(response)
    except urllib.error.HTTPError as error:
        data = json.load(error)
    if not data.get("ok"):
        raise RuntimeError(f"{method}: {data.get('description')}")
    return data["result"]


def handle(update):
    # Telegram only accepts public URLs in buttons.
    if not WEB_URL:
        raise RuntimeError("Set WEB_URL (or PUBLIC_URL) to your public player address")
    reply = reply_for(update.get("message"), WEB_URL)
    if reply:
        telegram("sendMessage", reply)


def safe_handle(update):
    try:
        handle(update)
    except Exception as error:  # one bad update must not stop the bot
        print(f"Update failed: {error}", flush=True)


class Handler(BaseHTTPRequestHandler):
    timeout = 20

    def send(self, status, body=b"", content_type="text/plain"):
        self.send_response(status)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/health":
            return self.send(200, b"ok")
        if path not in FILES:
            return self.send(404, b"Not found")
        name, content_type = FILES[path]
        try:
            body = (DIST / name).read_bytes()
        except OSError:
            return self.send(500, b'Run "python build.py" first')
        self.send(200, body, content_type)

    do_HEAD = do_GET

    def do_POST(self):
        if self.path.split("?")[0] != "/webhook":
            return self.send(404, b"Not found")
        got = self.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if not BOT_TOKEN or not hmac.compare_digest(got.encode(), SECRET.encode()):
            return self.send(401)
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 0 <= length <= 1_000_000:
                return self.send(413)
            update = json.loads(self.rfile.read(length))
            if not isinstance(update, dict):
                raise ValueError("not an object")
        except ValueError:
            return self.send(400)
        self.send(200, b"ok")
        safe_handle(update)


def poll():
    print("Bot running in polling mode", flush=True)
    offset = 0
    while True:
        try:
            for update in telegram("getUpdates", {"offset": offset, "timeout": 30}, 40):
                offset = update["update_id"] + 1
                safe_handle(update)
        except Exception as error:
            print(error, flush=True)
            time.sleep(3)


def start_bot():
    setup = [
        ("setMyName", {"name": BOT_NAME}),
        ("setMyShortDescription", {"short_description":
            "Paste a video link: watch online, download, or open in Nova Player."}),
        ("setMyDescription", {"description":
            f"{BOT_NAME}\n\nPaste a direct video link to get Watch Online and Download buttons, "
            "with subtitle support and Nova Video Player.\n\nPress START."}),
        ("setMyCommands", {"commands": [
            {"command": "start", "description": "Welcome message"},
            {"command": "help", "description": "How to use"},
        ]}),
    ]
    for method, payload in setup:
        try:
            telegram(method, payload)
        except Exception as error:
            print(f"Warning: {error}", flush=True)
    if PUBLIC_URL:
        telegram("setWebhook", {"url": f"{PUBLIC_URL}/webhook", "secret_token": SECRET,
                                "allowed_updates": ["message"]})
        print("Webhook set", flush=True)
    else:
        telegram("deleteWebhook")
        poll()


def run_bot():
    try:
        start_bot()
    except Exception as error:
        print(f"Bot start failed: {error}", flush=True)
        os._exit(1)  # let the host restart the service


def main():
    # Exit cleanly on "docker stop" and host restarts.
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Listening on port {PORT}", flush=True)
    if BOT_TOKEN:
        threading.Thread(target=run_bot, daemon=True).start()
    else:
        print("BOT_TOKEN missing: web player only", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
