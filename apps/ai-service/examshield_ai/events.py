from __future__ import annotations

import json
from collections.abc import Callable, Iterable
from typing import Any


EventWriter = Callable[[dict[str, Any]], None]


def sse_bytes(event: dict[str, Any]) -> bytes:
    return f"data: {json.dumps(event, ensure_ascii=False, separators=(',', ':'))}\n\n".encode("utf-8")


def tokenize_for_streaming(value: str, chunk_size: int = 24) -> Iterable[str]:
    text = str(value or "")
    size = max(1, int(chunk_size))
    for index in range(0, len(text), size):
        yield text[index:index + size]


def stream_text(write_event: EventWriter, text: str) -> None:
    for token in tokenize_for_streaming(text):
        write_event({"type": "token", "token": token})
