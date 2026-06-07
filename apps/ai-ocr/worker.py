from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


HOST = os.environ.get("OCR_HOST", "127.0.0.1")
PORT = int(os.environ.get("OCR_PORT", "8765"))
TESSERACT_CMD = os.environ.get("TESSERACT_CMD", "tesseract")
SUPPORTED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
}
OCR_PSMS = ("6", "4", "11")
MIN_ACCEPTED_QUALITY_SCORE = 58
EXAM_TERMS = {
    "question",
    "questions",
    "answer",
    "answers",
    "solve",
    "define",
    "explain",
    "describe",
    "marks",
    "mark",
    "section",
    "choose",
    "write",
    "paper",
    "exam",
}


class OcrHandler(BaseHTTPRequestHandler):
    server_version = "ExamshieldOcr/0.1"

    def do_POST(self) -> None:
        if self.path != "/analyze":
            self._send_json({"status": "failed", "error": "Not found"}, status=404)
            return

        content_type = (self.headers.get("Content-Type") or "").split(";")[0].lower()
        if content_type not in SUPPORTED_TYPES:
            self._send_json(
                {
                    "status": "failed",
                    "error": "Only image/jpeg and image/png are supported by the OCR worker.",
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
        result = analyze_image(image_bytes, SUPPORTED_TYPES[content_type])
        self._send_json(result)

    def log_message(self, format: str, *args: Any) -> None:
        print("%s - %s" % (self.address_string(), format % args))

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def analyze_image(image_bytes: bytes, suffix: str) -> dict[str, Any]:
    started = time.perf_counter()
    temp_path = write_temp_image(image_bytes, suffix)

    try:
        candidates = [read_ocr_candidate(temp_path, psm) for psm in OCR_PSMS]
        failed = [candidate for candidate in candidates if candidate["status"] == "failed"]
        passed = [candidate for candidate in candidates if candidate["status"] == "completed"]

        if not passed:
            error = failed[0].get("error") if failed else "OCR failed."
            return failed_result(str(error), started)

        best = max(passed, key=lambda candidate: candidate["qualityScore"])
        raw_text = str(best["text"])
        confidence = int(best["confidence"])
        quality_score = int(best["qualityScore"])

        if not is_acceptable_ocr(best):
            return {
                "status": "completed",
                "confidence": 0,
                "text": "",
                "processingTimeMs": elapsed_ms(started),
                "message": "No Exam Content Detected",
                "qualityScore": quality_score,
            }

        return {
            "status": "completed",
            "confidence": confidence if raw_text else 0,
            "text": raw_text,
            "processingTimeMs": elapsed_ms(started),
            "message": "Text extracted" if raw_text else "No Exam Content Detected",
            "qualityScore": quality_score,
        }
    except FileNotFoundError:
        return failed_result("Tesseract executable was not found.", started)
    except subprocess.TimeoutExpired:
        return failed_result("OCR worker timed out.", started)
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass


def write_temp_image(image_bytes: bytes, suffix: str) -> Path:
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        temp_file.write(image_bytes)
        return Path(temp_file.name)
    finally:
        temp_file.close()


def run_tesseract(image_path: Path, args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [TESSERACT_CMD, str(image_path), *args],
        capture_output=True,
        text=True,
        timeout=60,
    )


def read_ocr_candidate(image_path: Path, psm: str) -> dict[str, Any]:
    text_run = run_tesseract(image_path, ["stdout", "-l", "eng", "--oem", "1", "--psm", psm])
    if text_run.returncode != 0:
        return {
            "status": "failed",
            "psm": psm,
            "text": "",
            "confidence": 0,
            "qualityScore": 0,
            "error": text_run.stderr.strip(),
        }

    raw_text = normalize_text(text_run.stdout)
    word_confidences, words = read_word_confidences(image_path, psm)
    confidence = round(sum(word_confidences) / len(word_confidences)) if word_confidences else 0
    quality_report = score_ocr_quality(raw_text, confidence, words)

    return {
        "status": "completed",
        "psm": psm,
        "text": raw_text,
        "confidence": confidence,
        **quality_report,
    }


def read_word_confidences(image_path: Path, psm: str) -> tuple[list[float], list[str]]:
    tsv_run = run_tesseract(image_path, ["stdout", "-l", "eng", "--oem", "1", "--psm", psm, "tsv"])
    if tsv_run.returncode != 0:
        return [], []

    values: list[float] = []
    words: list[str] = []
    lines = [line for line in tsv_run.stdout.splitlines() if line.strip()]
    if not lines:
        return values, words

    headers = lines[0].split("\t")
    try:
        conf_index = headers.index("conf")
        text_index = headers.index("text")
    except ValueError:
        return values, words

    for line in lines[1:]:
        columns = line.split("\t")
        if conf_index >= len(columns):
            continue
        word = columns[text_index].strip() if text_index < len(columns) else ""
        try:
            value = float(columns[conf_index])
        except ValueError:
            continue
        if value >= 0 and word:
            values.append(value)
            words.append(word)

    return values, words


def score_ocr_quality(text: str, confidence: int, words: list[str]) -> dict[str, Any]:
    normalized_words = [normalize_token(word) for word in words]
    meaningful_words = [
        word
        for word in normalized_words
        if len(word) >= 3 and has_vowel(word) and not is_keyboard_noise(word)
    ]
    exam_hits = sum(1 for word in normalized_words if word in EXAM_TERMS)
    numbered_lines = len(re.findall(r"(?im)^\s*(question\s*)?\d+\s*[\).:-]", text))
    q_labels = len(re.findall(r"(?i)\bq\s*\.?\s*\d+\b|\bquestion\s+\d+\b", text))
    lines = [line for line in text.splitlines() if line.strip()]

    printable_chars = [char for char in text if not char.isspace()]
    clean_chars = [char for char in printable_chars if char.isalnum() or char in ".,:;!?()[]+-/%'\""]
    clean_ratio = len(clean_chars) / len(printable_chars) if printable_chars else 0

    alpha_count = sum(1 for char in text if char.isalpha())
    punctuation_count = sum(1 for char in printable_chars if not char.isalnum())
    punctuation_ratio = punctuation_count / len(printable_chars) if printable_chars else 0
    short_line_ratio = (
        sum(1 for line in lines if len(line.strip()) <= 4) / len(lines)
        if lines
        else 1
    )

    word_count = len([word for word in normalized_words if word])
    meaningful_ratio = len(meaningful_words) / word_count if word_count else 0
    exam_signal = min(100, exam_hits * 22 + numbered_lines * 18 + q_labels * 18)
    language_score = min(100, meaningful_ratio * 100)
    structure_score = min(100, len(lines) * 12 + word_count * 4)
    cleanliness_score = max(0, min(100, clean_ratio * 100 - punctuation_ratio * 45))
    penalties = 0

    if short_line_ratio > 0.55:
        penalties += 18
    if alpha_count < 12:
        penalties += 25
    if word_count < 4:
        penalties += 22
    if confidence < 35:
        penalties += 18

    quality_score = round(
        confidence * 0.38
        + language_score * 0.24
        + structure_score * 0.16
        + cleanliness_score * 0.12
        + exam_signal * 0.10
        - penalties
    )
    quality_score = max(0, min(100, quality_score))

    return {
        "qualityScore": quality_score,
        "quality": {
            "wordCount": word_count,
            "meaningfulWordCount": len(meaningful_words),
            "examSignal": exam_signal,
            "cleanRatio": round(clean_ratio, 2),
            "punctuationRatio": round(punctuation_ratio, 2),
            "shortLineRatio": round(short_line_ratio, 2),
        },
    }


def is_acceptable_ocr(candidate: dict[str, Any]) -> bool:
    text = str(candidate["text"]).strip()
    if not text:
        return False

    quality = candidate.get("quality", {})
    confidence = int(candidate["confidence"])
    quality_score = int(candidate["qualityScore"])
    exam_signal = int(quality.get("examSignal", 0))
    word_count = int(quality.get("wordCount", 0))
    meaningful_word_count = int(quality.get("meaningfulWordCount", 0))

    if quality_score >= MIN_ACCEPTED_QUALITY_SCORE and confidence >= 45:
        return True
    if exam_signal >= 35 and confidence >= 35 and meaningful_word_count >= 4:
        return True
    if confidence >= 72 and meaningful_word_count >= 8 and word_count >= 8:
        return True

    return False


def normalize_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def has_vowel(value: str) -> bool:
    return any(char in "aeiou" for char in value)


def is_keyboard_noise(value: str) -> bool:
    if len(value) <= 2:
        return True
    unique = len(set(value))
    if unique <= 2 and len(value) >= 4:
        return True
    return bool(re.fullmatch(r"[bcdfghjklmnpqrstvwxyz]{4,}", value))


def normalize_text(value: str) -> str:
    lines = [" ".join(line.strip().split()) for line in value.splitlines()]
    return "\n".join(line for line in lines if line).strip()


def failed_result(error: str, started: float) -> dict[str, Any]:
    return {
        "status": "failed",
        "confidence": 0,
        "text": "",
        "processingTimeMs": elapsed_ms(started),
        "error": error or "OCR failed.",
    }


def elapsed_ms(started: float) -> int:
    return round((time.perf_counter() - started) * 1000)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), OcrHandler)
    print(f"EXAMSHIELD OCR worker listening on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
