# Mraprguild Media Player Bot

Paste a direct video link into Telegram and get **Watch Online** and **Download** buttons.
Links are pasted only in Telegram. Includes a static web watch page (audio track and subtitle selection) and **Nova Video Player** support.
No npm dependencies. Needs Node.js 20.12 or newer.

## 1. Create the bot
1. Open [@BotFather](https://t.me/BotFather) and send `/newbot`.
2. Name: `Mraprguild Media Player Bot`. Choose a username ending in `bot`.
3. Copy the token. Never commit it to GitHub.

## 2. Push to GitHub
Create an empty repository, then in this folder:

    git init
    git add .
    git commit -m "Mraprguild Media Player Bot"
    git branch -M main
    git remote add origin https://github.com/YOUR_NAME/YOUR_REPO.git
    git push -u origin main

## 3. Deploy on Render
1. Render dashboard: **New > Blueprint**, then select your repository (`render.yaml` is read automatically).
2. Enter `BOT_TOKEN` when asked, then apply.
3. When the deploy is live, send `/start` to your bot.

The webhook is set automatically from Render's `RENDER_EXTERNAL_URL`.

**Free plan:** the service sleeps after about 15 minutes without traffic, and waking takes about a minute,
so the first reply can be slow. A paid instance avoids this.

## Run locally

    cp .env.example .env     # add BOT_TOKEN and WEB_URL
    npm test
    npm run build
    npm start

Without `PUBLIC_URL` the bot uses polling, which **removes the webhook**: use a separate test bot
if the main one is live. Bot buttons need a public `WEB_URL` (your deployed player).
Without `BOT_TOKEN` only the web player runs: http://localhost:3000/#v=VIDEO_URL

## Static web only
`npm run build` creates `dist/`, which can be hosted on any static host
(Render Static Site: build command `npm run build`, publish directory `dist`).
Set `WEB_URL` to that address if the bot should link to it.

## Playback support
| Feature | Online player | Nova Video Player |
|---|---|---|
| MP4 (H.264/AAC), WebM | Yes | Yes |
| HLS `.m3u8` | Yes (host must allow CORS) | Depends on the stream |
| MKV / AVI, AC3 / DTS | Often not | Yes (passthrough depends on hardware) |
| Multiple audio tracks | HLS; other files only if the browser exposes them | Yes |
| Subtitles | SRT / VTT (link or device file), HLS subtitles | SRT, ASS, SUB and more, including embedded |

Notes:
- The bot creates a player page for the link. Video files are not transcoded.
- Download goes straight to the original host. Some browsers play the video instead of saving it.
- Subtitle links need CORS on their host; otherwise add the file from your device.
- The Nova button opens the video link only; load external subtitles inside Nova.
- Telegram file uploads and web page links (YouTube etc.) are not supported.
- Share only content you have the right to use.
