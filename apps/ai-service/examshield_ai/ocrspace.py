from __future__ import annotations

import base64
import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from pathlib import Path
from typing import Any
from uuid import uuid4

logger = logging.getLogger(__name__)

OCR_SPACE_API_KEY = os.environ.get("OCR_SPACE_API_KEY", "").strip()
OCR_SPACE_API_URL = os.environ.get("OCR_SPACE_API_URL", "https://api.ocr.space/parse/image").strip()
OCR_SPACE_LANGUAGE = os.environ.get("OCR_SPACE_LANGUAGE", "eng").strip() or "eng"
OCR_SPACE_ENGINE = os.environ.get("OCR_SPACE_ENGINE", "2").strip() or "2"
OCR_SPACE_SCALE = os.environ.get("OCR_SPACE_SCALE", "1").strip().lower() in {"1", "true", "yes", "on"}
OCR_SPACE_DETECT_ORIENTATION = os.environ.get("OCR_SPACE_DETECT_ORIENTATION", "1").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
OCR_SPACE_TIMEOUT_SECONDS = int(os.environ.get("OCR_SPACE_TIMEOUT_SECONDS", "45"))
OCR_SPACE_MAX_BYTES = int(os.environ.get("OCR_SPACE_MAX_BYTES", "900000"))
OCR_SPACE_USER_AGENT = os.environ.get("OCR_SPACE_USER_AGENT", "ExamShield-OCR/1.0").strip()


def ocrspace_configured() -> bool:
    return bool(OCR_SPACE_API_KEY)


def ocrspace_status() -> dict[str, Any]:
    return {
        "configured": ocrspace_configured(),
        "apiUrl": OCR_SPACE_API_URL,
        "language": OCR_SPACE_LANGUAGE,
        "engine": OCR_SPACE_ENGINE,
        "scale": OCR_SPACE_SCALE,
        "detectOrientation": OCR_SPACE_DETECT_ORIENTATION,
        "timeoutSeconds": OCR_SPACE_TIMEOUT_SECONDS,
        "maxBytes": OCR_SPACE_MAX_BYTES,
    }


def run_ocrspace_ocr(image_path: Path, *, timeout: int | None = None) -> dict[str, Any]:
    """Run OCR through the OCR.space HTTP API."""
    from .ocr import estimate_confidence_from_text, normalize_text, score_ocr_quality

    if not ocrspace_configured():
        return _failed_candidate("OCR_SPACE_API_KEY is not configured.")

    call_timeout = timeout or OCR_SPACE_TIMEOUT_SECONDS
    try:
        payload = _call_ocrspace(image_path, timeout=call_timeout)
    except FuturesTimeoutError:
        return _failed_candidate(f"OCR.space timed out after {call_timeout}s")
    except urllib.error.HTTPError as exc:
        return _failed_candidate(_format_http_error(exc))
    except urllib.error.URLError as exc:
        return _failed_candidate(f"OCR.space network error: {exc.reason}")
    except Exception as exc:
        return _failed_candidate(f"OCR.space error: {type(exc).__name__}: {exc}")

    if payload.get("IsErroredOnProcessing"):
        message = _extract_error_message(payload)
        return _failed_candidate(message or "OCR.space processing failed.")

    exit_code = int(payload.get("OCRExitCode") or 0)
    if exit_code not in {1, 2}:
        message = _extract_error_message(payload) or f"OCR.space exit code {exit_code}"
        return _failed_candidate(message)

    raw_text = normalize_text(_extract_parsed_text(payload))
    if not raw_text:
        return {
            "status": "completed",
            "engine": "ocrspace",
            "psm": "ocrspace",
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
    confidence = estimate_confidence_from_text(raw_text, words)
    quality_report = score_ocr_quality(raw_text, confidence, words)
    return {
        "status": "completed",
        "engine": "ocrspace",
        "psm": "ocrspace",
        "text": raw_text,
        "confidence": confidence,
        **quality_report,
    }


def _call_ocrspace(image_path: Path, *, timeout: int) -> dict[str, Any]:
    def _request() -> dict[str, Any]:
        image_bytes, filetype, content_type = _prepare_upload_bytes(image_path)
        fields = {
            "language": OCR_SPACE_LANGUAGE,
            "OCREngine": OCR_SPACE_ENGINE,
            "filetype": filetype,
            "scale": "true" if OCR_SPACE_SCALE else "false",
            "detectOrientation": "true" if OCR_SPACE_DETECT_ORIENTATION else "false",
            "isOverlayRequired": "false",
        }

        try:
            return _post_multipart_file(image_bytes, filetype, content_type, fields, timeout=timeout)
        except urllib.error.HTTPError as exc:
            if exc.code != 403:
                raise
            logger.warning("OCR.space file upload returned 403; retrying with base64Image")
            return _post_base64_image(image_bytes, content_type, fields, timeout=timeout)

    with ThreadPoolExecutor(max_workers=1, thread_name_prefix="ocrspace") as executor:
        future = executor.submit(_request)
        return future.result(timeout=timeout)


def _prepare_upload_bytes(image_path: Path) -> tuple[bytes, str, str]:
    raw = image_path.read_bytes()
    suffix = image_path.suffix.lower().lstrip(".") or "jpg"
    filetype = "PNG" if suffix == "png" else "JPG"
    content_type = "image/png" if filetype == "PNG" else "image/jpeg"
    if len(raw) <= OCR_SPACE_MAX_BYTES:
        return raw, filetype, content_type

    try:
        import cv2
        import numpy as np

        decoded = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        if decoded is None:
            return raw, filetype, content_type

        quality = 90
        while quality >= 50:
            ok, encoded = cv2.imencode(
                ".jpg",
                decoded,
                [int(cv2.IMWRITE_JPEG_QUALITY), quality],
            )
            if ok and len(encoded) <= OCR_SPACE_MAX_BYTES:
                logger.info(
                    "Compressed OCR.space upload from %sKB to %sKB (quality=%s)",
                    len(raw) // 1024,
                    len(encoded) // 1024,
                    quality,
                )
                return encoded.tobytes(), "JPG", "image/jpeg"
            quality -= 10

        scale = 0.85
        while scale >= 0.4:
            resized = cv2.resize(
                decoded,
                (max(1, int(decoded.shape[1] * scale)), max(1, int(decoded.shape[0] * scale))),
                interpolation=cv2.INTER_AREA,
            )
            ok, encoded = cv2.imencode(".jpg", resized, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if ok and len(encoded) <= OCR_SPACE_MAX_BYTES:
                logger.info(
                    "Downscaled OCR.space upload to %sx%s (%sKB)",
                    resized.shape[1],
                    resized.shape[0],
                    len(encoded) // 1024,
                )
                return encoded.tobytes(), "JPG", "image/jpeg"
            scale -= 0.1
    except Exception as exc:
        logger.warning("OCR.space upload compression skipped: %s", exc)

    return raw, filetype, content_type


def _request_headers() -> dict[str, str]:
    return {
        "apikey": OCR_SPACE_API_KEY,
        "User-Agent": OCR_SPACE_USER_AGENT,
    }


def _post_multipart_file(
    image_bytes: bytes,
    filetype: str,
    content_type: str,
    fields: dict[str, str],
    *,
    timeout: int,
) -> dict[str, Any]:
    suffix = "png" if filetype == "PNG" else "jpg"
    body, content_type_header = _encode_multipart(
        fields,
        {
            "file": (
                f"evidence.{suffix}",
                image_bytes,
                content_type,
            )
        },
    )
    request = urllib.request.Request(
        OCR_SPACE_API_URL,
        data=body,
        headers={**_request_headers(), "Content-Type": content_type_header},
        method="POST",
    )
    return _read_json_response(request, timeout=timeout)


def _post_base64_image(
    image_bytes: bytes,
    content_type: str,
    fields: dict[str, str],
    *,
    timeout: int,
) -> dict[str, Any]:
    encoded = base64.b64encode(image_bytes).decode("ascii")
    payload = {
        **fields,
        "base64Image": f"data:{content_type};base64,{encoded}",
    }
    body = urllib.parse.urlencode(payload).encode("utf-8")
    request = urllib.request.Request(
        OCR_SPACE_API_URL,
        data=body,
        headers={
            **_request_headers(),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    return _read_json_response(request, timeout=timeout)


def _read_json_response(request: urllib.request.Request, *, timeout: int) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace").strip()
        if body:
            try:
                payload = json.loads(body)
                message = _extract_error_message(payload) or body
                raise urllib.error.HTTPError(
                    exc.url,
                    exc.code,
                    message,
                    exc.headers,
                    None,
                ) from exc
            except json.JSONDecodeError:
                raise urllib.error.HTTPError(
                    exc.url,
                    exc.code,
                    body,
                    exc.headers,
                    None,
                ) from exc
        raise
    return json.loads(raw)


def _format_http_error(exc: urllib.error.HTTPError) -> str:
    if exc.code == 403:
        detail = str(exc.reason or "").strip()
        if detail and detail != "Forbidden":
            return f"OCR.space HTTP 403: {detail}"
        return (
            "OCR.space HTTP 403: rate limited or invalid API key. "
            "Verify OCR_SPACE_API_KEY on Render and check your OCR.space quota."
        )
    return f"OCR.space HTTP {exc.code}: {exc.reason}"


def _encode_multipart(
    fields: dict[str, str],
    files: dict[str, tuple[str, bytes, str]],
) -> tuple[bytes, str]:
    boundary = f"----examshield{uuid4().hex}"
    body = bytearray()
    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.extend(value.encode())
        body.extend(b"\r\n")
    for name, (filename, data, content_type) in files.items():
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
        )
        body.extend(f"Content-Type: {content_type}\r\n\r\n".encode())
        body.extend(data)
        body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode())
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def _extract_parsed_text(payload: dict[str, Any]) -> str:
    parsed_results = payload.get("ParsedResults") or []
    chunks: list[str] = []
    for item in parsed_results:
        if not isinstance(item, dict):
            continue
        text = str(item.get("ParsedText") or "").strip()
        if text:
            chunks.append(text)
    return "\n".join(chunks)


def _extract_error_message(payload: dict[str, Any]) -> str:
    for key in ("ErrorMessage", "ErrorDetails", "error"):
        value = payload.get(key)
        if isinstance(value, list):
            joined = "; ".join(str(item).strip() for item in value if str(item).strip())
            if joined:
                return joined
        if value:
            return str(value).strip()
    parsed_results = payload.get("ParsedResults") or []
    for item in parsed_results:
        if isinstance(item, dict) and item.get("ErrorMessage"):
            return str(item["ErrorMessage"]).strip()
    return ""


def _failed_candidate(error: str) -> dict[str, Any]:
    return {
        "status": "failed",
        "engine": "ocrspace",
        "psm": "ocrspace",
        "text": "",
        "confidence": 0,
        "qualityScore": 0,
        "error": error,
    }
