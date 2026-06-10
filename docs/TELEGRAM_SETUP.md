# Telegram Bot Setup Guide for EXAMSHIELD

---

## Step 1: Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Start a chat and send: `/newbot`
3. Follow the prompts:
   - **Name:** `ExamShieldBot` (or whatever you want)
   - **Username:** `examshield_bot` (must end in `bot`)
4. **BotFather will reply with your token** — copy it immediately:
   ```
   Use this token to access the HTTP API:
   1234567890:ABCdefGHIjklmNOPqrstUVwxyz-1234567
   ```

---

## Step 2: Get Your Chat ID

1. Search for your new bot in Telegram (e.g., `@examshield_bot`)
2. Send it a message: `/start`
3. Search for **@userinfobot** in Telegram
4. Send it any message — it will reply with your info including:
   ```
   Id: 123456789
   ```
   That number is your **Chat ID**

---

## Step 3: Generate a Webhook Secret

This is just a random string for security. Create one:

```
my-super-secret-webhook-token-2024
```

Or generate one on the command line:

```bash
python -c "import secrets; print(secrets.token_hex(16))"
# Example output: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

---

## Step 4: Set up the Bot to Monitor a Channel/Group

**If you want EXAMSHIELD to watch a Telegram channel or group:**

1. Add your bot as an **admin** to the channel/group
2. Get the channel/group Chat ID:
   - Forward a message from the channel to **@getidsbot**
   - It will show the Chat ID (usually starts with `-100`)

---

## Step 5: Set Environment Variables

### Local Development

```bash
set TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklmNOPqrstUVwxyz-1234567
set TELEGRAM_WEBHOOK_SECRET=my-super-secret-webhook-token-2024
set TELEGRAM_CHAT_ID=123456789
```

### Vercel (if needed for frontend — not required)
> These env vars are **only needed on the backend (Render/local)**, not Vercel

### Render Dashboard

Set these in your Render service's **Environment Variables**:

| Variable | Example Value |
|----------|---------------|
| `TELEGRAM_BOT_TOKEN` | `1234567890:ABCdefGHIjklmNOPqrstUVwxyz-1234567` |
| `TELEGRAM_WEBHOOK_SECRET` | `a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6` |
| `TELEGRAM_CHAT_ID` | `123456789` |

---

## Step 6: Configure the Bot Webhook (Automatic)

When you restart the EXAMSHIELD unified API with these env vars set, it will **automatically register the webhook** with Telegram on startup (see `server.py:415`):

```python
handler.telegram.register()  # Called automatically
```

You'll see this in the startup logs:

```
Telegram webhook registration failed: ...
```

If it errors, check that:
- The bot token is correct
- The webhook secret matches between your env var and Telegram config
- Your server is **publicly accessible** (Render URL) — Telegram needs to reach `/telegram/webhook`
- Or use polling mode instead (see below)

---

## Alternative: Polling Mode (No Public URL Needed)

If you don't want a public webhook, just call this endpoint manually:

```
POST /telegram/events
```

With body:
```json
{
  "chatId": "123456789",
  "text": "suspicious message",
  "filename": "paper.pdf",
  "timestamp": "2026-06-10T12:00:00Z"
}
```

---

## Verification

Test if your setup works:

```bash
curl http://localhost:8790/health
```

Look for:
```json
"telegramWebhookConfigured": true
```

When it says `true`, Telegram is fully linked and active.

---

## Quick Reference

```
@BotFather          → Create bot, get token
@userinfobot        → Get your personal Chat ID
@getidsbot          → Get Channel/Group Chat ID
```

Need help creating the Telegram bot? Just let me know and I can walk through it step by step.
