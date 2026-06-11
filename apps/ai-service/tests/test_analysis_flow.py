from __future__ import annotations

import shutil
import subprocess
from unittest.mock import patch

import pytest

from examshield_ai.ocr import analyze_image, prepare_ocr_image


def _make_exam_jpeg() -> bytes:
    import cv2
    import numpy as np

    image = np.full((480, 720, 3), 255, dtype=np.uint8)
    cv2.putText(
        image,
        "MATHEMATICS EXAM 2026",
        (24, 72),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.0,
        (0, 0, 0),
        2,
    )
    cv2.putText(
        image,
        "Question 1: Solve for x",
        (24, 160),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.9,
        (0, 0, 0),
        2,
    )
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    return encoded.tobytes()


def tesseract_available() -> bool:
    try:
        subprocess.run(["tesseract", "--version"], capture_output=True, check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False


class TestAnalysisFlow:
    def test_prepare_ocr_image_accepts_real_jpeg(self, tmp_path):
        image_path = prepare_ocr_image(_make_exam_jpeg(), ".jpg")
        try:
            assert image_path.exists()
            assert image_path.stat().st_size > 0
        finally:
            image_path.unlink(missing_ok=True)

    @pytest.mark.skipif(not tesseract_available(), reason="tesseract not installed")
    def test_analyze_image_on_real_generated_exam_photo(self):
        with patch("examshield_ai.ocr.OCR_CHAIN", ("tesseract",)):
            result = analyze_image(_make_exam_jpeg(), ".jpg")

        assert result["status"] == "completed"
        text = str(result.get("text") or "").upper()
        assert "MATHEMATICS" in text or "QUESTION" in text or "EXAM" in text

    def test_analyze_image_real_jpeg_with_mock_tesseract(self):
        tesseract_candidate = {
            "status": "completed",
            "engine": "tesseract",
            "text": "MATHEMATICS EXAM 2026 Question 1",
            "confidence": 88,
            "qualityScore": 88,
        }

        with patch("examshield_ai.ocr.OCR_CHAIN", ("paddle", "tesseract")), patch(
            "examshield_ai.paddle_ocr.run_paddle_ocr",
            return_value={"status": "failed", "error": "paddle unavailable"},
        ), patch(
            "examshield_ai.ocr.run_tesseract_best_candidate",
            return_value=tesseract_candidate,
        ):
            result = analyze_image(_make_exam_jpeg(), ".jpg")

        assert result["status"] == "completed"
        assert "MATHEMATICS" in result["text"]
