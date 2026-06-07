const token = process.env.TELEGRAM_BOT_TOKEN;
const webUrl = process.env.EXAMSHIELD_WEB_URL ?? "http://localhost:3000";
const allowedChatId = process.env.TELEGRAM_CHAT_ID ?? null;
const pollMs = Number(process.env.TELEGRAM_POLL_MS ?? 1500);

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is required.");
  process.exit(1);
}

let offset = 0;

console.log("EXAMSHIELD Telegram Agent listening");
console.log(`Forwarding events to ${webUrl}/telegram/events`);

while (true) {
  try {
    const updates = await telegram("getUpdates", {
      offset,
      timeout: 25,
      allowed_updates: ["message", "channel_post"],
    });

    for (const update of updates) {
      offset = Math.max(offset, update.update_id + 1);
      const message = update.message ?? update.channel_post;
      if (!message) {
        continue;
      }

      if (allowedChatId && String(message.chat?.id) !== allowedChatId) {
        continue;
      }

      await forwardMessage(message);
    }
  } catch (error) {
    console.error("Telegram poll failed:", error instanceof Error ? error.message : error);
    await sleep(3000);
  }

  await sleep(pollMs);
}

async function forwardMessage(message) {
  const chatId = String(message.chat.id);
  const messageId = String(message.message_id);
  const timestamp = new Date((message.date ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();
  const text = message.caption ?? message.text ?? "";
  const media = pickMedia(message);

  if (!media) {
    await postJson({
      messageId,
      chatId,
      timestamp,
      text,
    });
    console.log(`Stored text Telegram event ${chatId}/${messageId}`);
    return;
  }

  const fileInfo = await telegram("getFile", { file_id: media.fileId });
  const fileUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`;
  const fileResponse = await fetch(fileUrl);
  if (!fileResponse.ok) {
    throw new Error(`Failed to download Telegram file: ${fileResponse.status}`);
  }

  const bytes = await fileResponse.arrayBuffer();
  const formData = new FormData();
  formData.append("messageId", messageId);
  formData.append("chatId", chatId);
  formData.append("timestamp", timestamp);
  formData.append("text", text);
  formData.append("file", new Blob([bytes], { type: media.mimeType }), media.filename);

  const response = await fetch(`${webUrl}/telegram/events`, {
    method: "POST",
    body: formData,
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error ?? `EXAMSHIELD ingestion failed: ${response.status}`);
  }

  console.log(`Processed Telegram evidence ${chatId}/${messageId}: ${body.evidence?.evidenceId ?? "no evidence"}`);
}

function pickMedia(message) {
  const photo = Array.isArray(message.photo) ? message.photo.at(-1) : null;
  if (photo) {
    return {
      fileId: photo.file_id,
      filename: `telegram-${message.message_id}.jpg`,
      mimeType: "image/jpeg",
    };
  }

  const document = message.document;
  if (!document) {
    return null;
  }

  const mimeType = document.mime_type ?? "application/octet-stream";
  const supported = new Set(["image/jpeg", "image/png", "application/pdf"]);
  if (!supported.has(mimeType)) {
    console.log(`Ignoring unsupported Telegram document ${mimeType}`);
    return null;
  }

  return {
    fileId: document.file_id,
    filename: document.file_name ?? `telegram-${message.message_id}`,
    mimeType,
  };
}

async function postJson(payload) {
  const response = await fetch(`${webUrl}/telegram/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error ?? `EXAMSHIELD ingestion failed: ${response.status}`);
  }
}

async function telegram(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();

  if (!body.ok) {
    throw new Error(body.description ?? `Telegram ${method} failed`);
  }

  return body.result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
