from __future__ import annotations

import json
import mimetypes
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable

from .detect import is_suspicious, scan_text
from .settings import Settings
from .store import EvidenceStore, JsonObject, UploadedFile, normalize_telegram_timestamp


class TelegramWebhook:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @property
    def configured(self) -> bool:
        return bool(self.settings.telegram_bot_token and self.settings.public_url)

    @property
    def _base_api(self) -> str:
        return f"https://api.telegram.org/bot{self.settings.telegram_bot_token}"

    def register(self) -> None:
        if not self.configured:
            return
        payload: JsonObject = {
            "url": f"{self.settings.public_url}/telegram/webhook",
            "allowed_updates": ["message", "edited_message", "channel_post", "edited_channel_post"],
            "drop_pending_updates": False,
        }
        if self.settings.telegram_webhook_secret:
            payload["secret_token"] = self.settings.telegram_webhook_secret
        self._api("setWebhook", payload)

    def validate_secret(self, received: str | None) -> bool:
        expected = self.settings.telegram_webhook_secret
        return not expected or received == expected

    def process_update(
        self,
        update: JsonObject,
        store: EvidenceStore,
        ocr_runner: Callable[[bytes, str], JsonObject],
    ) -> JsonObject:
        message = next(
            (
                update.get(name)
                for name in ("message", "edited_message", "channel_post", "edited_channel_post")
                if isinstance(update.get(name), dict)
            ),
            None,
        )
        if not isinstance(message, dict):
            return {"message": "Telegram update ignored", "processed": False}

        chat = message.get("chat") if isinstance(message.get("chat"), dict) else {}
        chat_id = str(chat.get("id") or "")
        message_id = str(message.get("message_id") or "")
        if not chat_id or not message_id:
            return {"message": "Telegram update ignored", "processed": False}

        # Multi-group monitoring: check if group is monitored
        if not store.is_monitored_group(chat_id):
            # Fallback: add primary chat_id as monitored if not yet in registry
            if chat_id == self.settings.telegram_chat_id:
                store.add_monitored_group(chat_id, name="Primary")
            else:
                return {
                    "message": "Group not monitored",
                    "processed": False,
                    "chatId": chat_id,
                }

        # Extract text and run leak detection
        text = _extract_text(message)
        detection = scan_text(text)

        # Download media if any
        uploaded = self._download_media(message)

        created = store.create_telegram_event(
            message_id=message_id,
            chat_id=chat_id,
            timestamp=normalize_telegram_timestamp(message.get("date")),
            text=text,
            file=uploaded,
            detection=detection if not uploaded else None,
        )

        if created["duplicate"] or not created["evidence"]:
            return {
                "message": "Telegram update accepted",
                "processed": True,
                "duplicate": created["duplicate"],
                "evidence": created["evidence"],
                "detection": {
                    "score": detection["score"],
                    "categories": detection["categories"],
                    "isSuspicious": is_suspicious(detection),
                } if not uploaded else None,
                "alertSent": False,
            }

        # Text-only evidence: skip OCR, just send alert if suspicious
        if created["evidence"].get("fileType") == "text/plain":
            alert_result = None
            if is_suspicious(detection):
                try:
                    alert_result = self._send_alert(created, {}, detection, text, chat_id, message)
                except Exception:
                    alert_result = {"status": "failed"}
            return {
                "message": "Suspicious text captured",
                "processed": True,
                "duplicate": False,
                "evidence": created["evidence"],
                "detection": {
                    "score": detection["score"],
                    "categories": detection["categories"],
                    "isSuspicious": True,
                },
                "alertSent": alert_result is not None and alert_result.get("status") != "failed",
                "activity": created["activity"],
            }

        # Media evidence: run OCR analysis
        queued = store.create_analysis_job(created["evidence"]["evidenceId"])
        analysis = store.run_analysis_job(queued["job"]["jobId"], ocr_runner)

        # Send alert if leak detected (wrapped in try/except so failures don't kill the request)
        should_alert = _should_send_alert(analysis, detection)
        alert_result = None
        if should_alert:
            try:
                alert_result = self._send_alert(created, analysis, detection, text, chat_id, message)
            except Exception:
                alert_result = {"status": "failed"}

        return {
            "message": "Telegram evidence processed",
            "processed": True,
            "duplicate": False,
            "evidence": analysis["evidence"],
            "job": analysis["job"],
            "attribution": analysis.get("attribution"),
            "watermark": analysis.get("watermark"),
            "forensicReport": analysis.get("forensicReport"),
            "alert": analysis.get("alert"),
            "detection": {
                "score": detection["score"],
                "categories": detection["categories"],
                "isSuspicious": is_suspicious(detection),
            },
            "alertSent": should_alert,
            "activity": [*created["activity"], queued["activity"], *analysis["activity"]],
        }

    def _download_media(self, message: JsonObject) -> UploadedFile | None:
        media = self._pick_media(message)
        if not media:
            return None
        file_info = self._api("getFile", {"file_id": media["fileId"]})
        file_path = str(file_info.get("file_path") or "")
        if not file_path:
            raise RuntimeError("Telegram did not return a file path.")
        request = urllib.request.Request(
            f"https://api.telegram.org/file/bot{self.settings.telegram_bot_token}/{file_path}"
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read()
        return UploadedFile(
            filename=media["filename"],
            content_type=media["contentType"],
            data=data,
        )

    def _pick_media(self, message: JsonObject) -> JsonObject | None:
        photos = message.get("photo")
        if isinstance(photos, list) and photos:
            photo = photos[-1]
            if isinstance(photo, dict) and photo.get("file_id"):
                return {
                    "fileId": str(photo["file_id"]),
                    "filename": f"telegram-{message.get('message_id')}.jpg",
                    "contentType": "image/jpeg",
                }

        document = message.get("document")
        if not isinstance(document, dict) or not document.get("file_id"):
            return None
        content_type = str(document.get("mime_type") or "application/octet-stream")
        if content_type not in {"image/jpeg", "image/png", "application/pdf"}:
            return None
        filename = Path(str(document.get("file_name") or "")).name
        if not filename:
            extension = mimetypes.guess_extension(content_type) or ""
            filename = f"telegram-{message.get('message_id')}{extension}"
        return {
            "fileId": str(document["file_id"]),
            "filename": filename,
            "contentType": content_type,
        }

    def _api(self, method: str, payload: JsonObject) -> JsonObject:
        request = urllib.request.Request(
            f"{self._base_api}/{method}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            body = json.loads(response.read().decode("utf-8"))
        if not body.get("ok"):
            raise RuntimeError(str(body.get("description") or f"Telegram {method} failed."))
        result = body.get("result")
        return result if isinstance(result, dict) else {}

    # ------------------------------------------------------------------
    # Alert backchannel
    # ------------------------------------------------------------------
    def _send_alert(self, created: JsonObject, analysis: JsonObject, detection: JsonObject, text: str, chat_id: str, message: JsonObject) -> JsonObject:
        """Send an alert to the admin chat when a leak is detected."""
        if not self.settings.telegram_admin_chat_id:
            return {"status": "skipped", "reason": "no_admin_chat_id"}

        evidence = created["evidence"]
        report = analysis.get("forensicReport") or {}
        alert_type = "LEAK DETECTED" if report.get("status") == "investigation-complete" else "SUSPICIOUS ACTIVITY"
        score = report.get("finalConfidence") or detection.get("score") or 0

        # Build alert message
        lines = [
            f"🚨 <b>{alert_type}</b>",
            "",
            f"<b>Group:</b> {chat_id}",
            f"<b>Sender:</b> {_extract_sender(message)}",
        ]
        if text:
            preview = text[:200].replace("<", "&lt;").replace(">", "&gt;")
            lines.append(f"<b>Message Preview:</b> {preview}")
        if evidence:
            lines.append(f"<b>Evidence ID:</b> {evidence.get('evidenceId', 'N/A')}")
        if report.get("status") == "investigation-complete":
            lines.extend([
                f"<b>Paper:</b> {report.get('paperIdentified', 'N/A')}",
                f"<b>Center:</b> {report.get('centerCode', 'N/A')}",
                f"<b>Confidence:</b> {report.get('finalConfidence', 'N/A')}%",
            ])
        else:
            lines.append(f"<b>Detection Score:</b> {detection.get('score', 0)}/50")
            if detection.get("matches"):
                keywords = ", ".join(set(m.get("text", "") for m in detection["matches"][:5]))
                lines.append(f"<b>Matched Keywords:</b> {keywords}")

        alert_text = "\n".join(lines)
        return self.send_message(self.settings.telegram_admin_chat_id, alert_text, parse_mode="HTML")

    def send_message(self, chat_id: str, text: str, *, parse_mode: str = "HTML") -> JsonObject:
        """Send a raw text message to a Telegram chat."""
        return self._api("sendMessage", {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": parse_mode,
        })


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _extract_text(message: JsonObject) -> str | None:
    """Extract text/caption from a Telegram message."""
    for key in ("caption", "text"):
        if isinstance(message.get(key), str):
            return str(message[key]).strip()
        if message.get(key):
            return str(message[key])
    return None


def _extract_sender(message: JsonObject) -> str:
    """Extract sender display name from a Telegram message."""
    from_user = message.get("from") if isinstance(message.get("from"), dict) else {}
    if from_user:
        username = from_user.get("username")
        first_name = from_user.get("first_name", "")
        last_name = from_user.get("last_name", "")
        if username:
            return f"@{username}"
        return f"{first_name} {last_name}".strip() or "Unknown User"
    return "Unknown User"


def _should_send_alert(analysis: JsonObject, detection: JsonObject) -> bool:
    """Determine if an alert should be sent based on analysis and detection results."""
    report = analysis.get("forensicReport") or {}
    if report.get("status") == "investigation-complete":
        return True
    if is_suspicious(detection):
        return True
    return False
