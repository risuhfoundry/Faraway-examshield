from __future__ import annotations

import json
import logging
import os
import threading
import time
from cgi import FieldStorage
from dataclasses import replace
from io import BytesIO
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .chat import ChatSession
from .detect import is_suspicious, scan_text
from .events import sse_bytes
from .llm import NvidiaClient
from .ocr import SUPPORTED_TYPES, analyze_image, ocr_runtime_status
from .pipeline import EvidencePipeline
from .planner import ToolPlanner
from .responses import conversation_messages, grounded_messages
from .settings import Settings, load_settings
from .store import EvidenceStore, UploadedFile, normalize_telegram_timestamp
from .telegram import TelegramWebhook
from .tools import ExamshieldToolRegistry
from .workers import AnalysisTask, AnalysisWorkerPool

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

class ExamshieldAiHandler(BaseHTTPRequestHandler):
    server_version = "ExamshieldAi/0.1"
    settings: Settings
    store: EvidenceStore
    registry: ExamshieldToolRegistry
    client: NvidiaClient
    telegram: TelegramWebhook
    workers: AnalysisWorkerPool
    pipeline: EvidencePipeline

    def do_OPTIONS(self) -> None:
        self._send_empty(204)

    def do_HEAD(self) -> None:
        path = urlparse(self.path).path
        if path in {"/health", "/"}:
            self.send_response(200)
            self._cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        parts = [part for part in path.split("/") if part]
        if path == "/health":
            self._send_json(
                {
                    "status": "ok",
                    "service": "examshield-ai",
                    "model": self.settings.model,
                    "nimConfigured": self.client.configured,
                    "tools": self.registry.names(),
                    "ocr": {
                        "endpoint": "/ocr/analyze",
                        "supportedTypes": sorted(SUPPORTED_TYPES.keys()),
                        "runtime": ocr_runtime_status(),
                        "workers": self.workers.stats(),
                    },
                    "uploadRoot": str(self.settings.upload_root),
                    "registryPath": str(self.settings.registry_path),
                    "storage": "supabase" if self.store.supabase_enabled else "local-json",
                    "telegram": {
                        "webhookConfigured": self.telegram.configured,
                        "botTokenSet": bool(self.settings.telegram_bot_token),
                        "publicUrl": self.settings.public_url or "NOT SET",
                        "chatId": self.settings.telegram_chat_id or "NOT SET",
                        "adminChatId": self.settings.telegram_admin_chat_id or "NOT SET",
                    },
                    "ocrWorkers": self.workers.stats(),
                }
            )
            return
        if path == "/tools":
            self._send_json({"tools": self.registry.schemas()})
            return
        if path == "/evidence":
            self._send_json(self.store.list_evidence())
            return
        if len(parts) == 2 and parts[0] == "evidence":
            bundle = self.store.get_bundle(parts[1])
            self._send_json(bundle if bundle else {"error": "Evidence not found."}, status=200 if bundle else 404)
            return
        if path == "/alerts":
            self._send_json({"alerts": self.store.list_evidence()["alerts"]})
            return
        # Monitored Telegram groups
        if path == "/telegram/groups":
            self._send_json({"groups": self.store.list_monitored_groups()})
            return
        if path == "/telegram/status":
            self._get_telegram_status()
            return
        if len(parts) == 3 and parts[0] == "analysis" and parts[1] == "jobs":
            try:
                self._send_json(self.store.analysis_job_snapshot(parts[2]))
            except LookupError as exc:
                self._send_json({"error": str(exc)}, status=404)
            return
        self._send_json({"error": "Not found"}, status=404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        parts = [part for part in path.split("/") if part]

        if path in {"/ocr/analyze", "/analyze"}:
            self._run_ocr()
            return

        if path == "/evidence/upload":
            self._upload_evidence()
            return
        if path == "/analysis/jobs":
            self._create_analysis_job()
            return
        if len(parts) == 4 and parts[0] == "analysis" and parts[1] == "jobs" and parts[3] == "process":
            self._process_analysis_job(parts[2])
            return
        if path == "/telegram/events":
            self._ingest_telegram_event()
            return
        if path == "/telegram/webhook":
            self._ingest_telegram_webhook()
            return
        if path == "/telegram/register":
            self._register_telegram_webhook()
            return
        if path == "/telegram/groups":
            self._add_monitored_group()
            return
        if path == "/demo/reset":
            self._send_json(self.store.reset_demo_environment())
            return

        if path == "/plan":
            self._run_plan()
            return

        if path == "/chat":
            self._run_chat()
            return

        self._send_json({"error": "Not found"}, status=404)

    def _run_ocr(self) -> None:
        content_type = (self.headers.get("Content-Type") or "").split(";")[0].lower()
        suffix = SUPPORTED_TYPES.get(content_type)
        if not suffix:
            self._send_json(
                {
                    "status": "failed",
                    "error": "Only image/jpeg and image/png are supported by the unified OCR endpoint.",
                },
                status=200,
            )
            return

        try:
            content_length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            content_length = 0

        if content_length <= 0:
            self._send_json({"status": "failed", "error": "Image payload is required."}, status=400)
            return

        image_bytes = self.rfile.read(content_length)
        self._send_json(analyze_image(image_bytes, suffix))

    def _upload_evidence(self) -> None:
        try:
            uploaded = self._read_multipart_file("file")
            created = self.store.create_evidence(uploaded)
            self._send_json({"message": "Evidence Created", **created}, status=201)
        except Exception as exc:
            self._send_json({"error": str(exc) or "Evidence upload failed."}, status=400)

    def _create_analysis_job(self) -> None:
        payload = self._read_json()
        evidence_id = str(payload.get("evidenceId") or "").strip()
        async_mode = bool(payload.get("async"))
        if not evidence_id:
            self._send_json({"error": "evidenceId is required."}, status=400)
            return
        try:
            evidence = self.store.get_evidence_by_id(evidence_id)
            if not evidence:
                raise LookupError("Evidence not found.")
            if evidence.get("fileType") == "text/plain":
                self._send_json({"error": "Text-only evidence does not require OCR."}, status=400)
                return

            existing_job = self.store.get_active_job_for_evidence(evidence_id)
            if existing_job:
                self._send_json(
                    {
                        "message": "Analysis Already Queued",
                        "evidence": evidence,
                        "job": existing_job,
                    }
                )
                return

            queued = self.store.create_analysis_job(evidence_id)
            job = queued["job"]
            if async_mode:
                submitted = self.pipeline.queue_media_analysis(
                    created={"evidence": evidence, "activity": [queued["activity"]]},
                    detection={"score": 0, "categories": []},
                    text=None,
                    chat_id=str(evidence.get("telegramChatId") or ""),
                    message={},
                    ocr_runner=analyze_image,
                    job=job,
                )
                if not submitted:
                    submitted = job
                self._send_json(
                    {
                        "message": "Analysis Queued",
                        "evidence": evidence,
                        "job": submitted,
                        "activity": [queued["activity"]],
                        "async": True,
                    },
                    status=202,
                )
                return

            self._send_json(
                {
                    "message": "Analysis Queued",
                    "evidence": evidence,
                    "job": job,
                    "activity": [queued["activity"]],
                }
            )
        except LookupError as exc:
            self._send_json({"error": str(exc)}, status=404)
        except Exception as exc:
            self._send_json({"error": str(exc) or "Analysis failed."}, status=400)

    def _process_analysis_job(self, job_id: str) -> None:
        try:
            job = self.store.get_analysis_job(job_id)
            if not job:
                self._send_json({"error": "Analysis job not found."}, status=404)
                return
            if job.get("status") == "completed":
                self._send_json(self.store.analysis_job_snapshot(job_id))
                return
            if job.get("status") == "failed":
                self._send_json(self.store.analysis_job_snapshot(job_id))
                return
            if job.get("status") == "processing" or self.workers.is_job_active(job_id):
                snapshot = self.store.analysis_job_snapshot(job_id)
                snapshot["message"] = "Analysis In Progress"
                self._send_json(snapshot, status=202)
                return

            evidence_id = str(job.get("evidenceId") or "")
            if self.workers.is_evidence_active(evidence_id):
                snapshot = self.store.analysis_job_snapshot(job_id)
                snapshot["message"] = "Analysis In Progress"
                self._send_json(snapshot, status=202)
                return

            def on_complete(_analysis: dict[str, Any], error: Exception | None) -> None:
                if not error:
                    return
                try:
                    self.store.fail_analysis_job(job_id, str(error) or "Background OCR failed")
                except Exception as fail_exc:
                    logger.error("Failed to mark job %s failed: %s", job_id, fail_exc)

            submitted = self.workers.submit(
                self.store,
                AnalysisTask(job_id=job_id, evidence_id=evidence_id),
                analyze_image,
                on_complete=on_complete,
            )
            if submitted is None:
                snapshot = self.store.analysis_job_snapshot(job_id)
                snapshot["message"] = "Analysis In Progress"
                self._send_json(snapshot, status=202)
                return

            snapshot = self.store.analysis_job_snapshot(job_id)
            snapshot["message"] = "Analysis In Progress"
            self._send_json(snapshot, status=202)
        except LookupError as exc:
            self._send_json({"error": str(exc)}, status=404)
        except Exception as exc:
            self._send_json({"error": str(exc) or "Analysis failed."}, status=400)

    def _ingest_telegram_event(self) -> None:
        try:
            content_type = self.headers.get("Content-Type") or ""
            if "multipart/form-data" in content_type:
                fields = self._read_multipart()
                file_field = fields.get("file")
                uploaded = file_field if isinstance(file_field, UploadedFile) else None
                message_id = require_text(fields, "messageId")
                chat_id = require_text(fields, "chatId")
                timestamp = normalize_telegram_timestamp(fields.get("timestamp"))
                text = optional_text(fields.get("text"))
            else:
                payload = self._read_json()
                message_id = str(payload.get("messageId") or "").strip()
                chat_id = str(payload.get("chatId") or "").strip()
                if not message_id or not chat_id:
                    raise ValueError("messageId and chatId are required.")
                timestamp = normalize_telegram_timestamp(payload.get("timestamp"))
                text = optional_text(payload.get("text"))
                uploaded = None

            detection = scan_text(text)
            created = self.store.create_telegram_event(
                message_id=message_id,
                chat_id=chat_id,
                timestamp=timestamp,
                text=text,
                file=uploaded,
                detection=detection,
            )
            detection_payload = {
                "score": detection["score"],
                "categories": detection["categories"],
                "isSuspicious": is_suspicious(detection),
            }
            if created["duplicate"]:
                self._send_json(
                    {
                        "message": "Telegram Event Already Processed",
                        "telegramEvent": created["telegramEvent"],
                        "evidence": created["evidence"],
                        "activity": created["activity"],
                    }
                )
                return
            if not created["evidence"]:
                self._send_json(
                    {
                        "message": "Telegram Event Stored",
                        "telegramEvent": created["telegramEvent"],
                        "evidence": None,
                        "activity": created["activity"],
                        "detection": detection_payload,
                    },
                    status=202,
                )
                return

            message = {"message_id": message_id, "chat": {"id": chat_id}, "text": text}
            if created["evidence"].get("fileType") == "text/plain":
                alert_sent = self.pipeline.process_text_only_alert(
                    created, detection, text, chat_id, message
                )
                latest_evidence = (
                    self.store.get_evidence_by_id(str(created["evidence"].get("evidenceId")))
                    or created["evidence"]
                )
                self._send_json(
                    {
                        "message": "Suspicious Text Captured",
                        "telegramEvent": created["telegramEvent"],
                        "evidence": latest_evidence,
                        "detection": detection_payload,
                        "alertSent": alert_sent,
                        "activity": created["activity"],
                    },
                    status=201,
                )
                return

            job = self.pipeline.queue_media_analysis(
                created=created,
                detection=detection,
                text=text,
                chat_id=chat_id,
                message=message,
                ocr_runner=analyze_image,
            )
            self._send_json(
                {
                    "message": "Telegram Evidence Queued For Analysis",
                    "telegramEvent": created["telegramEvent"],
                    "evidence": created["evidence"],
                    "job": job,
                    "detection": detection_payload,
                    "async": True,
                    "activity": created["activity"],
                },
                status=202,
            )
        except Exception as exc:
            self._send_json({"error": str(exc) or "Telegram event ingestion failed."}, status=400)

    def _ingest_telegram_webhook(self) -> None:
        secret = self.headers.get("X-Telegram-Bot-Api-Secret-Token")
        if not self.telegram.validate_secret(secret):
            logger.warning(f"Webhook secret mismatch: expected={'SET' if self.telegram.settings.telegram_webhook_secret else 'NONE'}, received={'SET' if secret else 'NONE'}")
            self._send_json({"error": "Invalid Telegram webhook secret."}, status=401)
            return
        try:
            update = self._read_json()
            logger.info(f"Webhook received: keys={list(update.keys())}")
            result = self.telegram.process_update(
                update, self.store, analyze_image, pipeline=self.pipeline
            )
            logger.info(f"Webhook processed: {result.get('message')}, processed={result.get('processed')}")
            self._send_json(result)
        except Exception as exc:
            logger.error(f"Webhook processing failed: {type(exc).__name__}: {exc}", exc_info=True)
            self._send_json({"error": str(exc) or "Telegram webhook failed."}, status=400)

    def _register_telegram_webhook(self) -> None:
        payload = self._read_json()
        url_override = str(payload.get("url") or "").strip()
        try:
            if url_override:
                from .settings import Settings
                self.telegram = TelegramWebhook(replace(self.settings, public_url=url_override))
            self.telegram.register()
            self._send_json({
                "message": "Telegram webhook registered",
                "configured": self.telegram.configured,
                "publicUrl": self.telegram.settings.public_url or "NOT SET",
                "botTokenSet": bool(self.telegram.settings.telegram_bot_token),
            })
        except Exception as exc:
            self._send_json({"error": str(exc) or "Webhook registration failed."}, status=400)

    def _get_telegram_status(self) -> None:
        try:
            info = self.telegram._api("getWebhookInfo", {})
            self._send_json({
                "configured": self.telegram.configured,
                "publicUrl": self.settings.public_url or "NOT SET",
                "botTokenSet": bool(self.settings.telegram_bot_token),
                "webhookUrl": info.get("url", "NOT SET"),
                "hasCustomCertificate": info.get("has_custom_certificate", False),
                "pendingUpdateCount": info.get("pending_update_count", 0),
                "lastErrorDate": info.get("last_error_date"),
                "lastErrorMessage": info.get("last_error_message"),
            })
        except Exception as exc:
            self._send_json({"error": str(exc) or "Failed to get Telegram status."}, status=400)

    def _run_chat(self) -> None:
        payload = self._read_json()
        prompt = str(payload.get("prompt") or "").strip()
        if not prompt:
            self._send_json({"error": "Prompt is required."}, status=400)
            return

        history = payload.get("messages") if isinstance(payload.get("messages"), list) else []
        current_evidence_id = payload.get("currentEvidenceId")
        current_evidence_id = str(current_evidence_id) if current_evidence_id else None

        self.send_response(200)
        self._cors_headers()
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        def write_event(event: dict[str, Any]) -> None:
            self.wfile.write(sse_bytes(event))
            self.wfile.flush()

        session = ChatSession(client=self.client, registry=self.registry, write=write_event)
        try:
            session.run(prompt, history, current_evidence_id)
        except Exception as exc:
            logger.error("Chat stream failed: %s", exc, exc_info=True)
            write_event({"type": "error", "message": str(exc) or "Chat failed."})
            write_event({"type": "done"})

    def _run_plan(self) -> None:
        payload = self._read_json()
        prompt = str(payload.get("prompt") or "").strip()
        if not prompt:
            self._send_json({"error": "Prompt is required."}, status=400)
            return

        history = payload.get("messages") if isinstance(payload.get("messages"), list) else []
        current_evidence_id = payload.get("currentEvidenceId")
        current_evidence_id = str(current_evidence_id) if current_evidence_id else None

        if not self.client.configured:
            self._send_json({"tool": None, "error": "NVIDIA_API_KEY is not configured."})
            return

        try:
            command = ToolPlanner(self.client, self.registry).plan(prompt, current_evidence_id, history)
        except Exception as exc:
            self._send_json({"tool": None, "error": f"Tool planner unavailable: {type(exc).__name__}."})
            return

        if not command:
            self._send_json({"tool": None})
            return

        execution = self.registry.execute(command["tool"], command.get("arguments") or {})
        self._send_json({
            "tool": execution.result["tool"],
            "result": execution.result,
            "model_context": execution.model_context,
        })

    def _read_json(self) -> dict[str, Any]:
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            length = 0
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}

    def _read_multipart_file(self, field_name: str) -> UploadedFile:
        fields = self._read_multipart()
        value = fields.get(field_name)
        if not isinstance(value, UploadedFile):
            raise ValueError("Evidence file is required.")
        return value

    def _read_multipart(self) -> dict[str, str | UploadedFile]:
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            length = 0
        body = self.rfile.read(length)
        content_type = self.headers.get("Content-Type") or ""
        form = FieldStorage(
            fp=BytesIO(body),
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": content_type,
                "CONTENT_LENGTH": str(length),
            },
            keep_blank_values=True,
        )
        values: dict[str, str | UploadedFile] = {}
        for key in form.keys():
            field = form[key]
            item = field[0] if isinstance(field, list) else field
            if item.filename:
                values[key] = UploadedFile(
                    filename=Path(item.filename).name,
                    content_type=item.type or "application/octet-stream",
                    data=item.file.read(),
                )
            else:
                values[key] = str(item.value)
        return values

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(status)
            self._cors_headers()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            logger.warning("Client disconnected before JSON response completed")

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        parts = [part for part in path.split("/") if part]
        if len(parts) == 3 and parts[0] == "telegram" and parts[1] == "groups":
            self._remove_monitored_group(parts[2])
            return
        self._send_json({"error": "Not found"}, status=404)

    def _add_monitored_group(self) -> None:
        try:
            payload = self._read_json()
            chat_id = str(payload.get("chatId") or "").strip()
            if not chat_id:
                self._send_json({"error": "chatId is required."}, status=400)
                return
            name = optional_text(payload.get("name")) or str(chat_id)
            result = self.store.add_monitored_group(chat_id, name=name, added_by="api")
            self._send_json(result, status=201 if result.get("created") else 200)
        except Exception as exc:
            self._send_json({"error": str(exc) or "Failed to add group."}, status=400)

    def _remove_monitored_group(self, chat_id: str) -> None:
        try:
            result = self.store.remove_monitored_group(chat_id)
            self._send_json(result)
        except Exception as exc:
            self._send_json({"error": str(exc) or "Failed to remove group."}, status=400)

    def _send_empty(self, status: int) -> None:
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", self.settings.cors_origin)
        self.send_header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def log_message(self, format: str, *args: Any) -> None:
        print("%s - %s" % (self.address_string(), format % args))


def build_handler(settings: Settings):
    class ConfiguredExamshieldAiHandler(ExamshieldAiHandler):
        pass

    store = EvidenceStore(settings)
    telegram = TelegramWebhook(settings)
    workers = AnalysisWorkerPool()
    pipeline = EvidencePipeline(store, telegram, workers)

    ConfiguredExamshieldAiHandler.settings = settings
    ConfiguredExamshieldAiHandler.store = store
    ConfiguredExamshieldAiHandler.registry = ExamshieldToolRegistry(store)
    ConfiguredExamshieldAiHandler.client = NvidiaClient(settings)
    ConfiguredExamshieldAiHandler.telegram = telegram
    ConfiguredExamshieldAiHandler.workers = workers
    ConfiguredExamshieldAiHandler.pipeline = pipeline
    return ConfiguredExamshieldAiHandler


def _start_stale_job_sweeper(store: EvidenceStore) -> None:
    interval_seconds = int(os.environ.get("EXAMSHIELD_STALE_JOB_SWEEP_SECONDS", "60"))
    max_age_seconds = int(os.environ.get("EXAMSHIELD_STALE_JOB_MAX_AGE_SECONDS", "120"))

    def sweep() -> None:
        while True:
            time.sleep(interval_seconds)
            try:
                cleaned = store.cleanup_stale_jobs(max_age_seconds=max_age_seconds)
                if cleaned:
                    logger.warning("Stale job sweeper cleaned %s stuck job(s)", cleaned)
            except Exception as exc:
                logger.error("Stale job sweeper failed: %s", exc)

    threading.Thread(target=sweep, daemon=True, name="stale-job-sweeper").start()


def main() -> None:
    settings = load_settings()
    handler = build_handler(settings)
    logger.info(f"EXAMSHIELD AI starting - telegramBotToken={'SET' if settings.telegram_bot_token else 'NOT SET'}, publicUrl={settings.public_url or 'NOT SET'}, chatId={settings.telegram_chat_id or 'NOT SET'}, adminChatId={settings.telegram_admin_chat_id or 'NOT SET'}")
    try:
        handler.telegram.register()
        if handler.telegram.configured:
            logger.info(f"Telegram webhook registered to {settings.public_url}/telegram/webhook")
        else:
            logger.warning("Telegram webhook NOT registered - set EXAMSHIELD_PUBLIC_URL in Render to enable")
    except Exception as exc:
        logger.error(f"Telegram webhook registration failed: {exc}")
    try:
        cleaned = handler.store.cleanup_stale_jobs(max_age_seconds=300)
        if cleaned:
            logger.info(f"Cleaned up {cleaned} stale analysis job(s) on startup")
    except Exception as exc:
        logger.error(f"Stale job cleanup failed: {exc}")
    try:
        handler.store.warmup_cache()
        logger.info("Evidence cache warmed on startup")
    except Exception as exc:
        logger.warning("Evidence cache warmup skipped: %s", exc)
    _start_stale_job_sweeper(handler.store)
    server = ThreadingHTTPServer((settings.host, settings.port), handler)
    logger.info(f"EXAMSHIELD AI service listening on http://{settings.host}:{settings.port}")
    try:
        recovered = handler.pipeline.recover_interrupted_jobs(analyze_image)
        if recovered:
            logger.info("Re-queued %s interrupted OCR job(s) after restart", recovered)
    except Exception as exc:
        logger.warning("Interrupted job recovery skipped: %s", exc)
    server.serve_forever()


def optional_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def require_text(fields: dict[str, str | UploadedFile], name: str) -> str:
    value = fields.get(name)
    if isinstance(value, UploadedFile) or value is None or not str(value).strip():
        raise ValueError(f"{name} is required.")
    return str(value).strip()
