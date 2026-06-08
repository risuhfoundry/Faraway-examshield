from __future__ import annotations

import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .events import sse_bytes, stream_text
from .llm import NvidiaClient
from .planner import ToolPlanner
from .responses import conversation_messages, grounded_messages
from .settings import Settings, load_settings
from .store import EvidenceStore
from .tools import ExamshieldToolRegistry


class ExamshieldAiHandler(BaseHTTPRequestHandler):
    server_version = "ExamshieldAi/0.1"
    settings: Settings
    store: EvidenceStore
    registry: ExamshieldToolRegistry
    client: NvidiaClient

    def do_OPTIONS(self) -> None:
        self._send_empty(204)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send_json(
                {
                    "status": "ok",
                    "service": "examshield-ai",
                    "model": self.settings.model,
                    "nimConfigured": self.client.configured,
                    "tools": self.registry.names(),
                    "uploadRoot": str(self.settings.upload_root),
                    "registryPath": str(self.settings.registry_path),
                }
            )
            return
        if self.path == "/tools":
            self._send_json({"tools": self.registry.schemas()})
            return
        self._send_json({"error": "Not found"}, status=404)

    def do_POST(self) -> None:
        if self.path != "/chat":
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
            text = self.client.chat_text(
                model=self.settings.model,
                messages=conversation_messages(prompt, history),
            )
            if text:
                stream_text(write_event, text)
            else:
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
            text = self.client.chat_text(
                model=self.settings.model,
                messages=grounded_messages(prompt, history, execution.model_context),
            )
        except Exception as exc:
            write_event({"type": "error", "message": f"NIM response failed: {exc}"})
            text = ""
        if text:
            stream_text(write_event, text)
        else:
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

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_empty(self, status: int) -> None:
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", self.settings.cors_origin)
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
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
    return ConfiguredExamshieldAiHandler


def main() -> None:
    settings = load_settings()
    handler = build_handler(settings)
    server = ThreadingHTTPServer((settings.host, settings.port), handler)
    print(f"EXAMSHIELD AI service listening on http://{settings.host}:{settings.port}")
    server.serve_forever()
