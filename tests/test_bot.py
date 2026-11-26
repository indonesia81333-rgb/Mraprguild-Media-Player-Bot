import sys
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bot import extract_links, reply_for  # noqa: E402

WEB = "https://example.onrender.com"


def msg(text, kind="private"):
    return {"chat": {"id": 1, "type": kind}, "from": {"first_name": "<A&B>"}, "text": text}


class BotTests(unittest.TestCase):
    def test_welcome(self):
        text = reply_for(msg("/start"), WEB)["text"]
        self.assertIn("Mraprguild Media Player Bot", text)
        self.assertIn("&lt;A&amp;B&gt;", text)
        self.assertLess(len(text), 4096)

    def test_buttons(self):
        reply = reply_for(msg("see https://a.com/m.mp4?x=1&y=2 https://a.com/m.srt"), WEB)
        watch, download = reply["reply_markup"]["inline_keyboard"][0]
        params = parse_qs(urlsplit(watch["url"]).fragment)
        self.assertEqual(params["v"], ["https://a.com/m.mp4?x=1&y=2"])
        self.assertEqual(params["s"], ["https://a.com/m.srt"])
        self.assertEqual(download["url"], "https://a.com/m.mp4?x=1&y=2")

    def test_bad_input(self):
        self.assertEqual(extract_links("javascript:alert(1)"), (None, None))
        self.assertEqual(extract_links("http://[bad http://a.com:abc/x"), (None, None))
        self.assertIsNone(reply_for(msg("hello", "group"), WEB))
        self.assertIn("direct video link", reply_for(msg("hello"), WEB)["text"])


if __name__ == "__main__":
    unittest.main()
