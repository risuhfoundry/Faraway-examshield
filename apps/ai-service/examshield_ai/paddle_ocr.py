from __future__ import annotations

import inspect
import logging
import os
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from pathlib import Path
from typing import Any

# PaddlePaddle 3.3+ can crash on CPU when OneDNN/PIR is enabled (Paddle#77340).
os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT", "0")

logger = logging.getLogger(__name__)

_paddle_engine: Any | None = None
_paddle_lock = threading.Lock()
_paddle_init_error: str | None = None
_paddle_warmup_done = False

PADDLE_LANG = os.environ.get("EXAMSHIELD_PADDLE_LANG", "en").strip() or "en"
PADDLE_DET_MODEL = os.environ.get("EXAMSHIELD_PADDLE_DET_MODEL", "PP-OCRv5_mobile_det").strip()
PADDLE_REC_MODEL = os.environ.get("EXAMSHIELD_PADDLE_REC_MODEL", "PP-OCRv5_mobile_rec").strip()
PADDLE_USE_ANGLE_CLS = os.environ.get("EXAMSHIELD_PADDLE_USE_ANGLE_CLS", "1").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
PADDLE_WARMUP_ENABLED = os.environ.get("EXAMSHIELD_PADDLE_WARMUP", "1").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
PADDLE_ENABLE_MKLDNN = os.environ.get("EXAMSHIELD_PADDLE_ENABLE_MKLDNN", "0").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
PADDLE_TIMEOUT_SECONDS = int(os.environ.get("EXAMSHIELD_PADDLE_TIMEOUT_SECONDS", "45"))
PADDLE_INIT_TIMEOUT_SECONDS = int(os.environ.get("EXAMSHIELD_PADDLE_INIT_TIMEOUT_SECONDS", "300"))


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
        "warmupDone": _paddle_warmup_done,
        "lang": PADDLE_LANG,
        "detModel": PADDLE_DET_MODEL or None,
        "recModel": PADDLE_REC_MODEL or None,
        "useAngleCls": PADDLE_USE_ANGLE_CLS,
        "enableMkldnn": PADDLE_ENABLE_MKLDNN,
        "timeoutSeconds": PADDLE_TIMEOUT_SECONDS,
        "initTimeoutSeconds": PADDLE_INIT_TIMEOUT_SECONDS,
        "initError": _paddle_init_error,
    }


def warmup_paddle_engine(timeout: int | None = None) -> bool:
    """Download and initialize Paddle models before the first OCR job."""
    global _paddle_warmup_done
    if not paddle_importable():
        logger.info("PaddleOCR not importable; warmup skipped")
        return False
    if _paddle_engine is not None:
        _paddle_warmup_done = True
        return True

    init_timeout = timeout or PADDLE_INIT_TIMEOUT_SECONDS
    logger.info(
        "PaddleOCR warmup starting (det=%s, rec=%s, timeout=%ss)",
        PADDLE_DET_MODEL or "default",
        PADDLE_REC_MODEL or "default",
        init_timeout,
    )
    try:
        with ThreadPoolExecutor(max_workers=1, thread_name_prefix="paddle-warmup") as executor:
            future = executor.submit(_warmup_paddle_runtime)
            future.result(timeout=init_timeout)
        _paddle_warmup_done = True
        logger.info("PaddleOCR warmup complete")
        return True
    except FuturesTimeoutError:
        logger.error("PaddleOCR warmup timed out after %ss", init_timeout)
        return False
    except Exception as exc:
        logger.warning("PaddleOCR warmup failed: %s", exc)
        return False


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
            _paddle_engine = _create_paddle_engine()
            logger.info("PaddleOCR engine initialized (lang=%s)", PADDLE_LANG)
            return _paddle_engine
        except Exception as exc:
            _paddle_init_error = f"{type(exc).__name__}: {exc}"
            logger.warning("PaddleOCR unavailable: %s", _paddle_init_error)
            raise RuntimeError(_paddle_init_error) from exc


def _apply_mkldnn_setting(kwargs: dict[str, Any], params: set[str]) -> None:
    if "enable_mkldnn" in params:
        kwargs["enable_mkldnn"] = PADDLE_ENABLE_MKLDNN


def _paddle_init_kwargs(params: set[str]) -> dict[str, Any]:
    kwargs: dict[str, Any] = {}
    if "lang" in params:
        kwargs["lang"] = PADDLE_LANG
    if PADDLE_DET_MODEL and "text_detection_model_name" in params:
        kwargs["text_detection_model_name"] = PADDLE_DET_MODEL
    if PADDLE_REC_MODEL and "text_recognition_model_name" in params:
        kwargs["text_recognition_model_name"] = PADDLE_REC_MODEL
    if "device" in params:
        kwargs["device"] = "cpu"
    if "use_textline_orientation" in params:
        kwargs["use_textline_orientation"] = PADDLE_USE_ANGLE_CLS
    if "use_doc_orientation_classify" in params:
        kwargs["use_doc_orientation_classify"] = False
    if "use_doc_unwarping" in params:
        kwargs["use_doc_unwarping"] = False
    _apply_mkldnn_setting(kwargs, params)
    return kwargs


def _warmup_paddle_runtime() -> None:
    engine = get_paddle_engine()
    image_path = _write_smoke_test_image()
    try:
        _run_paddle_engine(engine, image_path)
    finally:
        image_path.unlink(missing_ok=True)


def _write_smoke_test_image() -> Path:
    import cv2
    import numpy as np

    image = np.full((64, 160, 3), 255, dtype=np.uint8)
    cv2.putText(image, "EXAMSHIELD", (8, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    try:
        if not cv2.imwrite(temp_file.name, image):
            raise RuntimeError("Failed to write Paddle smoke-test image.")
        return Path(temp_file.name)
    finally:
        temp_file.close()


def _create_paddle_engine() -> Any:
    from paddleocr import PaddleOCR

    params = set(inspect.signature(PaddleOCR.__init__).parameters) - {"self"}
    attempts: list[dict[str, Any]] = [_paddle_init_kwargs(params)]

    if "use_gpu" in params:
        legacy = {
            "lang": PADDLE_LANG,
            "use_angle_cls": PADDLE_USE_ANGLE_CLS,
            "use_gpu": False,
            "show_log": False,
            "enable_mkldnn": PADDLE_ENABLE_MKLDNN,
        }
        attempts.append(legacy)

    fallback = {"lang": PADDLE_LANG}
    _apply_mkldnn_setting(fallback, params)
    attempts.append(fallback)

    errors: list[str] = []
    for attempt in attempts:
        filtered = {key: value for key, value in attempt.items() if key in params}
        try:
            engine = PaddleOCR(**filtered)
            logger.info("PaddleOCR init kwargs: %s", sorted(filtered))
            return engine
        except Exception as exc:
            errors.append(f"{filtered}: {type(exc).__name__}: {exc}")

    raise RuntimeError("PaddleOCR init failed: " + " | ".join(errors))


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

    lines, confidences = _extract_paddle_lines(raw_result)
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


def _extract_paddle_lines(raw_result: Any) -> tuple[list[str], list[float]]:
    lines: list[str] = []
    confidences: list[float] = []

    if raw_result is None:
        return lines, confidences

    if isinstance(raw_result, dict):
        raw_result = [raw_result]

    if isinstance(raw_result, list) and raw_result and isinstance(raw_result[0], dict):
        for page in raw_result:
            texts = page.get("rec_texts") or page.get("texts") or []
            scores = page.get("rec_scores") or page.get("scores") or []
            for index, text in enumerate(texts):
                cleaned = str(text or "").strip()
                if not cleaned:
                    continue
                score = scores[index] if index < len(scores) else 0.75
                lines.append(cleaned)
                confidences.append(_normalize_confidence(score))
        return lines, confidences

    for block in raw_result:
        if not block:
            continue
        if isinstance(block, dict):
            nested_lines, nested_scores = _extract_paddle_lines(block)
            lines.extend(nested_lines)
            confidences.extend(nested_scores)
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
            lines.append(text)
            confidences.append(_normalize_confidence(text_conf[1]))

    return lines, confidences


def _normalize_confidence(value: Any) -> float:
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return 0.0
    return confidence * 100 if confidence <= 1 else confidence


def _run_paddle_engine(engine: Any, image_path: Path) -> Any:
    path = str(image_path)
    if hasattr(engine, "predict"):
        try:
            return engine.predict(path)
        except TypeError:
            return engine.predict(input=path)
    if hasattr(engine, "ocr"):
        try:
            return engine.ocr(path, cls=PADDLE_USE_ANGLE_CLS)
        except TypeError:
            return engine.ocr(path)
    raise RuntimeError("PaddleOCR engine has no predict() or ocr() method.")


def _invoke_paddle(image_path: Path, *, timeout: int) -> Any:
    def _call() -> Any:
        return _run_paddle_engine(get_paddle_engine(), image_path)

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
