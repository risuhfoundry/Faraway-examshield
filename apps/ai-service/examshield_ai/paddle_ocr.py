from __future__ import annotations

import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_paddle_engine: Any | None = None
_paddle_lock = threading.Lock()
_paddle_init_error: str | None = None

PADDLE_LANG = os.environ.get("EXAMSHIELD_PADDLE_LANG", "en").strip() or "en"
PADDLE_USE_ANGLE_CLS = os.environ.get("EXAMSHIELD_PADDLE_USE_ANGLE_CLS", "1").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
PADDLE_TIMEOUT_SECONDS = int(os.environ.get("EXAMSHIELD_PADDLE_TIMEOUT_SECONDS", "40"))


def paddle_importable() -> bool:
    try:
        import paddleocr  # noqa: F401

        return True
    except ImportError:
        return False


def paddle_available() -> bool:
    return _paddle_engine is not None and _paddle_init_error is None


def paddle_status() -> dict[str, Any]:
    return {
        "importable": paddle_importable(),
        "initialized": _paddle_engine is not None,
        "available": paddle_available(),
        "lang": PADDLE_LANG,
        "useAngleCls": PADDLE_USE_ANGLE_CLS,
        "timeoutSeconds": PADDLE_TIMEOUT_SECONDS,
        "initError": _paddle_init_error,
    }


def get_paddle_engine() -> Any:
    global _paddle_engine, _paddle_init_error
    if _paddle_engine is not None:
        return _paddle_engine
    if _paddle_init_error:
        raise RuntimeError(_paddle_init_error)

    with _paddle_lock:
        if _paddle_engine is not None:
            return _paddle_engine
        if _paddle_init_error:
            raise RuntimeError(_paddle_init_error)
        try:
            from paddleocr import PaddleOCR

            _paddle_engine = PaddleOCR(
                use_angle_cls=PADDLE_USE_ANGLE_CLS,
                lang=PADDLE_LANG,
                use_gpu=False,
                show_log=False,
                enable_mkldnn=False,
            )
            logger.info("PaddleOCR engine initialized (lang=%s)", PADDLE_LANG)
            return _paddle_engine
        except Exception as exc:
            _paddle_init_error = f"{type(exc).__name__}: {exc}"
            logger.warning("PaddleOCR unavailable: %s", _paddle_init_error)
            raise RuntimeError(_paddle_init_error) from exc


def run_paddle_ocr(image_path: Path, *, timeout: int | None = None) -> dict[str, Any]:
    """Run PaddleOCR and return a candidate-shaped result dict."""
    from .ocr import estimate_confidence_from_text, normalize_text, score_ocr_quality

    call_timeout = timeout or PADDLE_TIMEOUT_SECONDS
    try:
        raw_result = _invoke_paddle(image_path, timeout=call_timeout)
    except FuturesTimeoutError:
        return _failed_candidate(f"PaddleOCR timed out after {call_timeout}s")
    except RuntimeError as exc:
        return _failed_candidate(str(exc))
    except Exception as exc:
        return _failed_candidate(f"PaddleOCR error: {type(exc).__name__}: {exc}")

    lines: list[str] = []
    confidences: list[float] = []
    for block in raw_result or []:
        if not block:
            continue
        for item in block:
            if not item or len(item) < 2:
                continue
            text_conf = item[1]
            if not isinstance(text_conf, (list, tuple)) or len(text_conf) < 2:
                continue
            text = str(text_conf[0] or "").strip()
            if not text:
                continue
            try:
                confidence = float(text_conf[1])
            except (TypeError, ValueError):
                confidence = 0.0
            lines.append(text)
            confidences.append(confidence * 100 if confidence <= 1 else confidence)

    raw_text = normalize_text("\n".join(lines))
    if not raw_text:
        return {
            "status": "completed",
            "engine": "paddle",
            "psm": "paddle",
            "text": "",
            "confidence": 0,
            "qualityScore": 0,
            "quality": {
                "wordCount": 0,
                "meaningfulWordCount": 0,
                "cleanRatio": 0,
                "punctuationRatio": 0,
                "shortLineRatio": 1,
            },
        }

    words = [word for word in raw_text.split() if word.strip()]
    confidence = (
        round(sum(confidences) / len(confidences))
        if confidences
        else estimate_confidence_from_text(raw_text, words)
    )
    quality_report = score_ocr_quality(raw_text, int(confidence), words)
    return {
        "status": "completed",
        "engine": "paddle",
        "psm": "paddle",
        "text": raw_text,
        "confidence": int(confidence),
        **quality_report,
    }


def _invoke_paddle(image_path: Path, *, timeout: int) -> Any:
    def _call() -> Any:
        engine = get_paddle_engine()
        return engine.ocr(str(image_path), cls=PADDLE_USE_ANGLE_CLS)

    with ThreadPoolExecutor(max_workers=1, thread_name_prefix="paddle-ocr") as executor:
        future = executor.submit(_call)
        return future.result(timeout=timeout)


def _failed_candidate(error: str) -> dict[str, Any]:
    return {
        "status": "failed",
        "engine": "paddle",
        "psm": "paddle",
        "text": "",
        "confidence": 0,
        "qualityScore": 0,
        "error": error,
    }
