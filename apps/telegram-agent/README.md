# EXAMSHIELD Telegram Agent

Tiny listener for a single Telegram bot/group.

## Environment

```txt
TELEGRAM_BOT_TOKEN=123456:bot-token
EXAMSHIELD_WEB_URL=http://localhost:3000
TELEGRAM_CHAT_ID=-1001234567890
```

`TELEGRAM_CHAT_ID` is optional, but recommended for demo mode so the agent only accepts one group.

## Run

```txt
npm start
```

The agent only listens to Telegram and forwards events to EXAMSHIELD. OCR, attribution, reports, and alerts remain inside the existing web pipeline.
