from __future__ import annotations

import json
import time
from cgi import FieldStorage
from io import BytesIO
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .detect import is_suspicious, scan_text
from .events import sse_bytes
from .llm import NvidiaClient
from .ocr import SUPPORTED_TYPES, analyze_image
from .planner import ToolPlanner
from .responses import conversation_messages, grounded_messages
from .settings import Settings, load_settings
from .store import EvidenceStore, UploadedFile, normalize_telegram_timestamp
from .telegram import TelegramWebhook
from .tools import ExamshieldToolRegistry

class ExamshieldAiHandler(BaseHTTPRequestHandler):
    server_version = "ExamshieldAi/0.1"
    settings: Settings
    store: EvidenceStore
    registry: ExamshieldToolRegistry
    client: NvidiaClient
    telegram: TelegramWebhook

    def do_OPTIONS(self) -> None:
        self._send_empty(204)

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
                    },
                    "uploadRoot": str(self.settings.upload_root),
                    "registryPath": str(self.settings.registry_path),
                    "storage": "supabase" if self.store.supabase_enabled else "local-json",
                    "telegramWebhookConfigured": self.telegram.configured,
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
        if path == "/telegram/groups":
            self._add_monitored_group()
            return
        if path == "/demo/reset":
            self._send_json(self.store.reset_demo_environment())
            return

        if path != "/chat":
            self._send_json({"error": "Not found"}, status=404)
            return

        payload = self._read_json()
        prompt = str(payload.get("prompt") or "").strip()
        if not prompt:
            self._send_json({"error": "Prompt is required."}, status=400)
            return

        self.send_response(200)
        self._cors_headers()
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "close")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        def write_event(event: dict[str, Any]) -> None:
            self.wfile.write(sse_bytes(event))
            self.wfile.flush()

        started = time.perf_counter()
        try:
            self._run_chat(payload, prompt, write_event)
        except Exception as exc:
            write_event({"type": "error", "message": f"{type(exc).__name__}: {exc}"})
        finally:
            write_event({"type": "done", "latencyMs": round((time.perf_counter() - started) * 1000)})
            self.close_connection = True

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
        if not evidence_id:
            self._send_json({"error": "evidenceId is required."}, status=400)
            return
        try:
            queued = self.store.create_analysis_job(evidence_id)
            self._send_json(
                {
                    "message": "Analysis Queued",
                    "evidence": self.store.get_evidence_by_id(evidence_id),
                    "job": queued["job"],
                    "activity": [queued["activity"]],
                }
            )
        except LookupError as exc:
            self._send_json({"error": str(exc)}, status=404)
        except Exception as exc:
            self._send_json({"error": str(exc) or "Analysis failed."}, status=400)

    def _process_analysis_job(self, job_id: str) -> None:
        try:
            self._send_json(self.store.run_analysis_job(job_id, analyze_image))
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

            created = self.store.create_telegram_event(
                message_id=message_id,
                chat_id=chat_id,
                timestamp=timestamp,
                text=text,
                file=uploaded,
                detection=scan_text(text),
            )
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
                        "detection": {
                            "score": scan_text(text)["score"],
                            "categories": scan_text(text)["categories"],
                            "isSuspicious": is_suspicious(scan_text(text)),
                        },
                    },
                    status=202,
                )
                return
            # Skip OCR analysis for text-only evidence (fileType text/plain)
            if created["evidence"].get("fileType") == "text/plain":
                self._send_json(
                    {
                        "message": "Suspicious Text Captured",
                        "telegramEvent": created["telegramEvent"],
                        "evidence": created["evidence"],
                        "detection": {
                            "score": scan_text(text)["score"],
                            "categories": scan_text(text)["categories"],
                            "isSuspicious": is_suspicious(scan_text(text)),
                        },
                        "activity": created["activity"],
                    },
                    status=201,
                )
                return
            queued = self.store.create_analysis_job(created["evidence"]["evidenceId"])
            analysis = self.store.run_analysis_job(queued["job"]["jobId"], analyze_image)
            self._send_json(
                {
                    "message": "Telegram Evidence Processed",
                    "telegramEvent": created["telegramEvent"],
                    "evidence": analysis["evidence"],
                    "job": analysis["job"],
                    "attribution": analysis.get("attribution"),
                    "watermark": analysis.get("watermark"),
                    "forensicReport": analysis.get("forensicReport"),
                    "alert": analysis.get("alert"),
                    "activity": [*created["activity"], queued["activity"], *analysis["activity"]],
                },
                status=201,
            )
        except Exception as exc:
            self._send_json({"error": str(exc) or "Telegram event ingestion failed."}, status=400)

    def _ingest_telegram_webhook(self) -> None:
        secret = self.headers.get("X-Telegram-Bot-Api-Secret-Token")
        if not self.telegram.validate_secret(secret):
            self._send_json({"error": "Invalid Telegram webhook secret."}, status=401)
            return
        try:
            self._send_json(self.telegram.process_update(self._read_json(), self.store, analyze_image))
        except Exception as exc:
            self._send_json({"error": str(exc) or "Telegram webhook failed."}, status=400)

    def _run_chat(self, payload: dict[str, Any], prompt: str, write_event) -> None:
        history = payload.get("messages") if isinstance(payload.get("messages"), list) else []
        current_evidence_id = payload.get("currentEvidenceId")
        current_evidence_id = str(current_evidence_id) if current_evidence_id else None
        write_event(
            {
                "type": "meta",
                "model": self.settings.model,
                "provider": "nvidia-nim" if self.client.configured else "local-fallback",
            }
        )

        if not self.client.configured:
            write_event({"type": "error", "message": "NVIDIA_API_KEY is required for natural EXAMSHIELD AI replies."})
            return

        try:
            command = ToolPlanner(self.client, self.registry).plan(prompt, current_evidence_id, history)
        except Exception as exc:
            write_event({"type": "stage", "message": f"Tool planner unavailable: {type(exc).__name__}. Continuing with natural chat."})
            command = None
        if not command:
            try:
                emitted = self.client.stream_chat(
                    model=self.settings.model,
                    messages=conversation_messages(prompt, history),
                    on_token=lambda token: write_event({"type": "token", "token": token}),
                )
            except Exception as exc:
                write_event({"type": "error", "message": f"NIM stream failed: {exc}"})
                emitted = False
            if not emitted:
                write_event({"type": "error", "message": "Model stream returned no text."})
            return

        execution = self.registry.execute(command["tool"], command.get("arguments") or {})
        write_event(
            {
                "type": "stage",
                "message": f"Using {execution.result['tool']}() with live EXAMSHIELD data.",
            }
        )
        write_event({"type": "tool", "tool": execution.result["tool"], "result": execution.result})

        try:
            emitted = self.client.stream_chat(
                model=self.settings.model,
                messages=grounded_messages(prompt, history, execution.model_context),
                on_token=lambda token: write_event({"type": "token", "token": token}),
            )
        except Exception as exc:
            write_event({"type": "error", "message": f"NIM stream failed: {exc}"})
            emitted = False
        if not emitted:
            write_event({"type": "error", "message": "Model stream returned no grounded answer."})

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
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

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

    ConfiguredExamshieldAiHandler.settings = settings
    ConfiguredExamshieldAiHandler.store = EvidenceStore(settings)
    ConfiguredExamshieldAiHandler.registry = ExamshieldToolRegistry(ConfiguredExamshieldAiHandler.store)
    ConfiguredExamshieldAiHandler.client = NvidiaClient(settings)
    ConfiguredExamshieldAiHandler.telegram = TelegramWebhook(settings)
    return ConfiguredExamshieldAiHandler


def main() -> None:
    settings = load_settings()
    handler = build_handler(settings)
    try:
        handler.telegram.register()
    except Exception as exc:
        print(f"Telegram webhook registration failed: {exc}")
    server = ThreadingHTTPServer((settings.host, settings.port), handler)
    print(f"EXAMSHIELD AI service listening on http://{settings.host}:{settings.port}")
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
