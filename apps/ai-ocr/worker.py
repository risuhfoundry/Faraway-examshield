from __future__ import annotations

import json
import os
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
        text_run = run_tesseract(temp_path, ["stdout", "-l", "eng", "--oem", "1", "--psm", "6"])
        if text_run.returncode != 0:
            return failed_result(text_run.stderr.strip(), started)

        raw_text = normalize_text(text_run.stdout)
        confidence = read_confidence(temp_path)

        return {
            "status": "completed",
            "confidence": confidence if raw_text else 0,
            "text": raw_text,
            "processingTimeMs": elapsed_ms(started),
            "message": "Text extracted" if raw_text else "No Exam Content Detected",
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


def read_confidence(image_path: Path) -> int:
    tsv_run = run_tesseract(image_path, ["stdout", "-l", "eng", "--oem", "1", "--psm", "6", "tsv"])
    if tsv_run.returncode != 0:
        return 0

    values: list[float] = []
    lines = [line for line in tsv_run.stdout.splitlines() if line.strip()]
    if not lines:
        return 0

    headers = lines[0].split("\t")
    try:
        conf_index = headers.index("conf")
    except ValueError:
        return 0

    for line in lines[1:]:
        columns = line.split("\t")
        if conf_index >= len(columns):
            continue
        try:
            value = float(columns[conf_index])
        except ValueError:
            continue
        if value >= 0:
            values.append(value)

    if not values:
        return 0

    return round(sum(values) / len(values))


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
