from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any

from .settings import Settings
from .store import JsonObject


TokenWriter = Callable[[str], None]


class NvidiaClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @property
    def configured(self) -> bool:
        return bool(self.settings.api_key)

    def chat_json(
        self,
        *,
        model: str,
        messages: list[JsonObject],
        tools: list[JsonObject] | None = None,
        max_tokens: int = 240,
        timeout: float | None = None,
    ) -> JsonObject:
        payload: JsonObject = {
            "model": model,
            "temperature": 0,
            "top_p": 0.7,
            "max_tokens": max_tokens,
            "messages": messages,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        return self._request_json_with_fallbacks(payload, model, timeout or self.settings.stream_timeout_seconds)

    def stream_chat(
        self,
        *,
        model: str,
        messages: list[JsonObject],
        on_token: TokenWriter,
    ) -> bool:
        payload = {
            "model": model,
            "temperature": 0,
            "top_p": 0.7,
            "max_tokens": 260,
            "stream": True,
            "messages": messages,
        }
        request = self._request(payload)
        emitted = False
        with urllib.request.urlopen(request, timeout=self.settings.stream_timeout_seconds) as response:
            for raw_line in response:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data or data == "[DONE]":
                    continue
                try:
                    parsed = json.loads(data)
                except json.JSONDecodeError:
                    continue
                token = parsed.get("choices", [{}])[0].get("delta", {}).get("content") or ""
                if token:
                    emitted = True
                    on_token(str(token))
        return emitted

    def chat_text(
        self,
        *,
        model: str,
        messages: list[JsonObject],
        max_tokens: int = 260,
        timeout: float | None = None,
    ) -> str:
        payload = self.chat_json(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            timeout=timeout or self.settings.stream_timeout_seconds,
        )
        return str(payload.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()

    def _request_json(self, payload: JsonObject, timeout: float) -> JsonObject:
        request = self._request(payload)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")[:240]
            raise RuntimeError(f"NVIDIA NIM returned {exc.code}: {details}") from exc
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}

    def _request_json_with_fallbacks(self, payload: JsonObject, model: str, timeout: float) -> JsonObject:
        errors: list[str] = []
        for candidate in self._candidate_models(model):
            candidate_payload = dict(payload)
            candidate_payload["model"] = candidate
            try:
                return self._request_json(candidate_payload, timeout)
            except Exception as exc:
                errors.append(f"{candidate}: {type(exc).__name__}: {exc}")
        raise RuntimeError("NVIDIA NIM chat request failed for all configured models: " + " | ".join(errors))

    def _candidate_models(self, primary: str) -> tuple[str, ...]:
        models: list[str] = []
        for model in (primary, *self.settings.fallback_models):
            cleaned = str(model or "").strip()
            if cleaned and cleaned not in models:
                models.append(cleaned)
        return tuple(models)

    def _request(self, payload: JsonObject) -> urllib.request.Request:
        return urllib.request.Request(
            f"{self.settings.base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.settings.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
