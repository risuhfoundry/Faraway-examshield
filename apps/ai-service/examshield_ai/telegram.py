from __future__ import annotations

import json
import logging
import mimetypes
import re
import urllib.parse
import urllib.request
from html import escape
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable
from uuid import uuid4

from .detect import is_suspicious, scan_text
from .llm import NvidiaClient
from .settings import Settings
from .store import EvidenceStore, JsonObject, UploadedFile, normalize_telegram_timestamp

if TYPE_CHECKING:
    from .pipeline import EvidencePipeline

logger = logging.getLogger(__name__)


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
        pipeline: EvidencePipeline | None = None,
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

        # Check if this is a private/direct message (chat type "private")
        chat_type = str(chat.get("type") or "").lower()
        is_private = chat_type == "private"

        # NEVER reply in groups — only monitor silently
        if not is_private:
            if not store.is_monitored_group(chat_id):
                if chat_id == self.settings.telegram_chat_id:
                    store.add_monitored_group(chat_id, name="Primary")
                else:
                    return {
                        "message": "Group not monitored",
                        "processed": False,
                        "chatId": chat_id,
                    }
            # Group message — process detection but NEVER send chat reply
            text = _extract_text(message)
            detection = scan_text(text)
            uploaded = self._download_media(message)
            created = store.create_telegram_event(
                message_id=message_id,
                chat_id=chat_id,
                timestamp=normalize_telegram_timestamp(message.get("date")),
                text=text,
                file=uploaded,
                detection=detection,
            )
            # Return early for group messages — no chat reply ever
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
                    },
                    "alertSent": False,
                }
            if created["evidence"].get("fileType") == "text/plain":
                alert_sent = False
                if pipeline:
                    alert_sent = pipeline.process_text_only_alert(
                        created, detection, text, chat_id, message
                    )
                elif is_suspicious(detection):
                    try:
                        alert_result = self._send_alert(created, {}, detection, text, chat_id, message, store=store)
                        alert_sent = _is_alert_sent(alert_result)
                        store.complete_text_evidence(
                            str(created["evidence"]["evidenceId"]),
                            detection,
                            alert_sent=alert_sent,
                            forensic_report=None,
                        )
                    except Exception:
                        alert_sent = False
                latest_evidence = store.get_evidence_by_id(str(created["evidence"]["evidenceId"])) or created["evidence"]
                return {
                    "message": "Suspicious text captured",
                    "processed": True,
                    "duplicate": False,
                    "evidence": latest_evidence,
                    "detection": {
                        "score": detection["score"],
                        "categories": detection["categories"],
                        "isSuspicious": is_suspicious(detection),
                    },
                    "alertSent": alert_sent,
                    "activity": created["activity"],
                }
            if not pipeline:
                raise RuntimeError("EvidencePipeline is required for media Telegram updates.")
            existing_job = store.get_active_job_for_evidence(created["evidence"]["evidenceId"])
            if existing_job:
                return {
                    "message": "Telegram evidence already queued for analysis",
                    "processed": True,
                    "duplicate": False,
                    "evidence": created["evidence"],
                    "job": existing_job,
                    "detection": {
                        "score": detection["score"],
                        "categories": detection["categories"],
                        "isSuspicious": is_suspicious(detection),
                    },
                    "alertSent": False,
                    "activity": created["activity"],
                }
            job = pipeline.queue_media_analysis(
                created=created,
                detection=detection,
                text=text,
                chat_id=chat_id,
                message=message,
                ocr_runner=ocr_runner,
            )
            return {
                "message": "Telegram evidence queued for analysis",
                "processed": True,
                "duplicate": False,
                "evidence": created["evidence"],
                "job": job,
                "detection": {
                    "score": detection["score"],
                    "categories": detection["categories"],
                    "isSuspicious": is_suspicious(detection),
                },
                "alertSent": False,
                "activity": created["activity"],
            }

        # --- PRIVATE / DM messages only from here ---
        text = _extract_text(message)

        # Handle private chat messages with real data
        if text:
            self._handle_chat_message(chat_id, message, text, store)

        detection = scan_text(text)

        # Download media if any
        uploaded = self._download_media(message)

        created = store.create_telegram_event(
            message_id=message_id,
            chat_id=chat_id,
            timestamp=normalize_telegram_timestamp(message.get("date")),
            text=text,
            file=uploaded,
            detection=detection,
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
                },
                "alertSent": False,
            }

        # Text-only evidence: skip OCR, just send alert if suspicious
        if created["evidence"].get("fileType") == "text/plain":
            alert_sent = False
            if pipeline:
                alert_sent = pipeline.process_text_only_alert(
                    created, detection, text, chat_id, message
                )
            elif is_suspicious(detection):
                try:
                    alert_result = self._send_alert(created, {}, detection, text, chat_id, message, store=store)
                    alert_sent = _is_alert_sent(alert_result)
                    store.complete_text_evidence(
                        str(created["evidence"]["evidenceId"]),
                        detection,
                        alert_sent=alert_sent,
                        forensic_report=None,
                    )
                except Exception:
                    alert_sent = False
            latest_evidence = store.get_evidence_by_id(str(created["evidence"]["evidenceId"])) or created["evidence"]
            return {
                "message": "Suspicious text captured",
                "processed": True,
                "duplicate": False,
                "evidence": latest_evidence,
                "detection": {
                    "score": detection["score"],
                    "categories": detection["categories"],
                    "isSuspicious": is_suspicious(detection),
                },
                "alertSent": alert_sent,
                "activity": created["activity"],
            }

        if not pipeline:
            raise RuntimeError("EvidencePipeline is required for media Telegram updates.")

        existing_job = store.get_active_job_for_evidence(created["evidence"]["evidenceId"])
        if existing_job:
            logger.info(
                "Evidence %s already has active job %s",
                created["evidence"]["evidenceId"],
                existing_job["jobId"],
            )
            return {
                "message": "Telegram evidence already queued for analysis",
                "processed": True,
                "duplicate": False,
                "evidence": created["evidence"],
                "job": existing_job,
                "detection": {
                    "score": detection["score"],
                    "categories": detection["categories"],
                    "isSuspicious": is_suspicious(detection),
                },
                "alertSent": False,
                "activity": created["activity"],
            }

        job = pipeline.queue_media_analysis(
            created=created,
            detection=detection,
            text=text,
            chat_id=chat_id,
            message=message,
            ocr_runner=ocr_runner,
        )
        if not job:
            return {
                "message": "Telegram evidence already processing",
                "processed": True,
                "duplicate": False,
                "evidence": created["evidence"],
                "detection": {
                    "score": detection["score"],
                    "categories": detection["categories"],
                    "isSuspicious": is_suspicious(detection),
                },
                "alertSent": False,
                "activity": created["activity"],
            }

        return {
            "message": "Telegram evidence queued for analysis",
            "processed": True,
            "duplicate": False,
            "evidence": created["evidence"],
            "job": job,
            "detection": {
                "score": detection["score"],
                "categories": detection["categories"],
                "isSuspicious": is_suspicious(detection),
            },
            "alertSent": False,
            "activity": created["activity"],
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
    def _send_alert(
        self,
        created: JsonObject,
        analysis: JsonObject,
        detection: JsonObject,
        text: str,
        chat_id: str,
        message: JsonObject,
        *,
        store: EvidenceStore | None = None,
    ) -> JsonObject:
        """Send an alert to the admin/private chat only — never to the source group."""

        evidence = created["evidence"]
        alert_text = self._compose_alert(created, analysis, detection, text, chat_id, message)
        admin_chat_id = str(self.settings.telegram_admin_chat_id or "").strip()

        # Only send to admin chat (private DM), never to the source group
        message_targets: list[str] = []
        if admin_chat_id:
            message_targets.append(admin_chat_id)

        message_results: list[JsonObject] = []
        for target in message_targets:
            message_results.append(
                {
                    "chatId": target,
                    "result": self.send_message(target, alert_text, parse_mode="HTML"),
                }
            )

        file_results: list[JsonObject] = []
        if store and evidence and evidence.get("fileType") != "text/plain" and admin_chat_id:
            try:
                file_result = self._send_evidence_file(
                    store,
                    str(evidence.get("evidenceId") or ""),
                    admin_chat_id,
                )
                file_results.append({"chatId": admin_chat_id, **file_result})
            except Exception as exc:
                logger.warning(
                    "Failed to attach evidence file %s to Telegram chat %s: %s",
                    evidence.get("evidenceId"),
                    admin_chat_id,
                    exc,
                )

        if not message_results and not file_results:
            return {"status": "skipped", "reason": "no_destination_chat"}

        return {
            "status": "ok",
            "messages": message_results,
            "files": file_results,
        }

    def _compose_alert(
        self,
        created: JsonObject,
        analysis: JsonObject,
        detection: JsonObject,
        text: str,
        chat_id: str,
        message: JsonObject,
    ) -> str:
        llm = NvidiaClient(self.settings)
        context = _alert_context(created, analysis, detection, text, chat_id, message)
        if llm.configured:
            try:
                generated = llm.chat_text(
                    model=self.settings.model,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are an ExamShield security analyst reporting a potential exam leak. "
                                "Write a natural, conversational alert message like you're texting a colleague. "
                                "Use casual but professional tone. Include the actual message that was flagged. "
                                "Mention key details naturally. Use Telegram HTML formatting: <b>, <i>, <code>. "
                                "Keep it under 800 characters. Be human, not robotic. "
                                "Example style: 'Heads up team - just caught something suspicious in group -XXXXX. "
                                "Someone posted: \"[message preview]\". Score is X/50. Looking into it.'"
                            ),
                        },
                        {
                            "role": "user",
                            "content": json.dumps(context, ensure_ascii=False),
                        },
                    ],
                    max_tokens=300,
                    timeout=12,
                )
                cleaned = _clean_telegram_html(generated)
                if cleaned:
                    return cleaned
            except Exception as exc:
                logger.warning("LLM Telegram alert composition failed; using fallback: %s", exc)
        return _fallback_alert_text(context)

    def _send_evidence_file(self, store: EvidenceStore, evidence_id: str, chat_id: str) -> JsonObject:
        if not evidence_id:
            return {"status": "skipped", "reason": "missing_evidence_id"}
        asset = store.get_asset_bytes(evidence_id)
        if not asset or not asset.get("data"):
            return {"status": "skipped", "reason": "asset_not_found"}
        content_type = str(asset.get("fileType") or "application/octet-stream")
        filename = str(asset.get("filename") or asset.get("storedFilename") or f"{evidence_id}")
        caption = f"<b>Evidence File:</b> <code>{escape(evidence_id)}</code>"
        method = "sendPhoto" if content_type in {"image/jpeg", "image/png"} else "sendDocument"
        field_name = "photo" if method == "sendPhoto" else "document"
        result = self._api_multipart(
            method,
            fields={
                "chat_id": chat_id,
                "caption": caption,
                "parse_mode": "HTML",
            },
            file_field=field_name,
            filename=filename,
            data=asset["data"],
            content_type=content_type,
        )
        return {"status": "ok", "result": result}

    def send_message(self, chat_id: str, text: str, *, parse_mode: str = "HTML") -> JsonObject:
        """Send a raw text message to a Telegram chat."""
        return self._api("sendMessage", {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": parse_mode,
        })

    def _handle_chat_message(self, chat_id: str, message: JsonObject, text: str, store: EvidenceStore | None = None) -> JsonObject | None:
        """Handle private/direct messages using LLM with real data from the store."""
        llm = NvidiaClient(self.settings)
        if not llm.configured or not text:
            return None

        sender = _extract_sender(message)
        lower_text = text.lower().strip()

        # Gather real data from store to give actual answers
        data_context = _build_chat_data_context(store, lower_text)

        system_prompt = (
            "You are ExamShield AI, an exam security assistant chatting in a private Telegram DM. "
            "You are friendly, casual, and helpful — like a knowledgeable colleague. "
            "Use the REAL DATA provided below to answer questions. "
            "Do NOT make up numbers, evidence IDs, or threat counts. "
            "If the data shows something, report it naturally. "
            "If there's nothing relevant, say so honestly. "
            "Keep responses concise (under 300 characters). "
            "Use Telegram HTML: <b>, <i>, <code>. "
            "Be conversational and human-like, not robotic."
        )

        user_prompt = (
            f"Data context:\n{data_context}\n\n"
            f"User ({sender}) says: {text}"
        )

        try:
            response = llm.chat_text(
                model=self.settings.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=300,
                timeout=12,
            )
            cleaned = _clean_telegram_html(response)
            if cleaned:
                return self.send_message(chat_id, cleaned, parse_mode="HTML")
        except Exception as exc:
            logger.warning("LLM chat response failed: %s", exc)

        return None

    def _api_multipart(
        self,
        method: str,
        *,
        fields: dict[str, str],
        file_field: str,
        filename: str,
        data: bytes,
        content_type: str,
    ) -> JsonObject:
        boundary = f"ExamshieldBoundary{uuid4().hex}"
        chunks: list[bytes] = []
        for key, value in fields.items():
            chunks.extend(
                [
                    f"--{boundary}\r\n".encode("utf-8"),
                    f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"),
                    str(value).encode("utf-8"),
                    b"\r\n",
                ]
            )
        safe_filename = Path(filename).name or "evidence"
        chunks.extend(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                (
                    f'Content-Disposition: form-data; name="{file_field}"; '
                    f'filename="{safe_filename}"\r\n'
                ).encode("utf-8"),
                f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"),
                data,
                b"\r\n",
                f"--{boundary}--\r\n".encode("utf-8"),
            ]
        )
        request = urllib.request.Request(
            f"{self._base_api}/{method}",
            data=b"".join(chunks),
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            body = json.loads(response.read().decode("utf-8"))
        if not body.get("ok"):
            raise RuntimeError(str(body.get("description") or f"Telegram {method} failed."))
        result = body.get("result")
        return result if isinstance(result, dict) else {}


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


def _alert_context(
    created: JsonObject,
    analysis: JsonObject,
    detection: JsonObject,
    text: str,
    chat_id: str,
    message: JsonObject,
) -> JsonObject:
    evidence = created.get("evidence") or {}
    report = analysis.get("forensicReport") or {}
    matches = detection.get("matches") if isinstance(detection.get("matches"), list) else []
    return {
        "alertType": "LEAK DETECTED" if report.get("status") == "investigation-complete" else "SUSPICIOUS ACTIVITY",
        "group": chat_id,
        "sender": _extract_sender(message),
        "messagePreview": (text or "")[:300],
        "evidence": {
            "id": evidence.get("evidenceId"),
            "filename": evidence.get("filename"),
            "fileType": evidence.get("fileType"),
            "source": evidence.get("source"),
        },
        "detection": {
            "score": detection.get("score") or 0,
            "maxScore": detection.get("max_score") or 50,
            "categories": detection.get("categories") or [],
            "matches": [
                {
                    "text": item.get("text"),
                    "category": item.get("category"),
                    "description": item.get("description"),
                }
                for item in matches[:6]
                if isinstance(item, dict)
            ],
        },
        "forensicReport": {
            "status": report.get("status"),
            "paper": report.get("paperIdentified"),
            "center": report.get("centerCode"),
            "confidence": report.get("finalConfidence"),
            "risk": report.get("riskLevel"),
        },
    }


def _fallback_alert_text(context: JsonObject) -> str:
    evidence = context.get("evidence") or {}
    detection = context.get("detection") or {}
    report = context.get("forensicReport") or {}
    alert_type = str(context.get("alertType") or "SUSPICIOUS ACTIVITY")
    group = str(context.get("group") or "Unknown")
    sender = str(context.get("sender") or "Unknown")
    preview = str(context.get("messagePreview") or "").strip()
    
    lines = [
        f"<b>Hey team,</b>",
        f"",
        f"Just spotted something <b>suspicious</b> in group <code>{escape(group)}</code>.",
    ]
    
    if preview:
        lines.append(f"")
        lines.append(f"User <b>{escape(sender)}</b> posted:")
        lines.append(f"<i>\"{escape(preview[:200])}\"</i>")
    
    if evidence.get("id"):
        lines.append(f"")
        lines.append(f"Evidence logged: <code>{escape(str(evidence.get('id')))}</code>")
    
    if report.get("status") == "investigation-complete":
        paper = str(report.get("paper") or "Unknown")
        center = str(report.get("center") or "Unknown")
        confidence = str(report.get("confidence") or "N/A")
        lines.append(f"")
        lines.append(f"<b>Investigation complete:</b> Paper: {escape(paper)} | Center: {escape(center)} | Confidence: {escape(confidence)}%")
    else:
        score = str(detection.get("score") or 0)
        max_score = str(detection.get("maxScore") or 50)
        lines.append(f"")
        lines.append(f"Detection score: <b>{escape(score)}/{escape(max_score)}</b>")
        matches = detection.get("matches") if isinstance(detection.get("matches"), list) else []
        keywords = ", ".join(
            dict.fromkeys(str(item.get("text") or "") for item in matches if isinstance(item, dict) and item.get("text"))
        )
        if keywords:
            lines.append(f"Keywords found: <b>{escape(keywords[:150])}</b>")
    
    lines.append(f"")
    lines.append(f"Working on it. Will update soon.")
    
    return "\n".join(lines)


def _clean_telegram_html(value: str) -> str:
    cleaned = str(value or "").strip()
    cleaned = re.sub(r"^```(?:html)?", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    allowed = {"b", "/b", "i", "/i", "code", "/code"}

    def replace_tag(match: re.Match[str]) -> str:
        tag = match.group(1).strip().lower()
        return f"<{tag}>" if tag in allowed else escape(match.group(0))

    cleaned = re.sub(r"<\s*([^>]+?)\s*>", replace_tag, cleaned)
    return cleaned[:3500].strip()

def _is_alert_sent(result: JsonObject | None) -> bool:
    return bool(result and result.get("status") == "ok")


def _should_send_alert(analysis: JsonObject, detection: JsonObject) -> bool:
    """Determine if an alert should be sent based on analysis and detection results."""
    report = analysis.get("forensicReport") or {}
    if report.get("status") == "investigation-complete":
        return True
    if is_suspicious(detection):
        return True
    return False


def _build_chat_data_context(store: EvidenceStore | None, user_query: str) -> str:
    """Build a data context string from real store data for the LLM to reference."""
    if not store:
        return "No store data available."

    try:
        data = store.list_evidence()
    except Exception:
        return "Failed to load store data."

    evidence_list = data.get("evidence") or []
    alerts = data.get("alerts") or []
    activity = data.get("activity") or []
    stats = data.get("stats") or {}

    lines: list[str] = []

    # Always include summary stats
    lines.append(f"Total evidence items: {stats.get('totalEvidence', len(evidence_list))}")
    lines.append(f"Total alerts: {stats.get('totalAlerts', len(alerts))}")

    # If asking about threats/alerts/recent activity, include details
    threat_keywords = ("threat", "alert", "suspicious", "leak", "detect", "risk", "incident", "danger")
    evidence_keywords = ("evidence", "file", "upload", "document", "ocr", "scan")
    recent_keywords = ("recent", "latest", "history", "activity", "log", "timeline")

    want_threats = any(kw in user_query for kw in threat_keywords)
    want_evidence = any(kw in user_query for kw in evidence_keywords)
    want_recent = any(kw in user_query for kw in recent_keywords)

    if want_threats and alerts:
        lines.append("")
        lines.append("Recent alerts:")
        for alert in alerts[:5]:
            eid = alert.get("evidenceId") or alert.get("id") or "?"
            score = alert.get("score") or alert.get("detectionScore") or "?"
            risk = alert.get("riskLevel") or alert.get("level") or "unknown"
            created = alert.get("createdAt") or alert.get("timestamp") or ""
            lines.append(f"- <code>{eid}</code> | score: {score} | risk: {risk} | {created[:16]}")

    if want_evidence and evidence_list:
        lines.append("")
        lines.append("Recent evidence:")
        for ev in evidence_list[:5]:
            eid = ev.get("evidenceId") or "?"
            ftype = ev.get("fileType") or "?"
            status = ev.get("status") or "unknown"
            source = ev.get("source") or ""
            lines.append(f"- <code>{eid}</code> | type: {ftype} | status: {status} | source: {source}")

    if want_recent and activity:
        lines.append("")
        lines.append("Recent activity:")
        for act in activity[:5]:
            act_type = act.get("type") or act.get("action") or "?"
            desc = act.get("description") or act.get("message") or ""
            ts = act.get("timestamp") or ""
            lines.append(f"- {act_type}: {desc[:120]} | {ts[:16]}")

    if not (want_threats or want_evidence or want_recent):
        # Generic summary
        if evidence_list:
            suspicious = [e for e in evidence_list if e.get("detectionScore", 0) > 7]
            lines.append(f"Suspicious items: {len(suspicious)}")
            if suspicious:
                top = suspicious[0]
                lines.append(f"Latest suspicious: <code>{top.get('evidenceId', '?')}</code> score {top.get('detectionScore', '?')}")

    return "\n".join(lines) if lines else "No data available yet."
