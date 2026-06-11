from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from examshield_ai.ocr import (
    analyze_image,
    has_vowel,
    is_keyboard_noise,
    normalize_text,
    normalize_token,
    read_ocr_candidates_parallel,
    read_ocr_candidates_sequential,
    score_ocr_quality,
)


class TestOcrHelpers:
    def test_normalize_text_collapses_whitespace(self):
        assert normalize_text("  hello   world \n\n foo ") == "hello world\nfoo"

    def test_normalize_token_strips_punctuation(self):
        assert normalize_token("Hello!") == "hello"

    def test_has_vowel(self):
        assert has_vowel("exam")
        assert not has_vowel("xyz")

    def test_is_keyboard_noise(self):
        assert is_keyboard_noise("ab")
        assert is_keyboard_noise("bcdfg")
        assert not is_keyboard_noise("paper")

    def test_score_ocr_quality_meaningful_text(self):
        text = "NEET 2026 question paper section A\nAnswer all questions"
        words = text.split()
        report = score_ocr_quality(text, confidence=80, words=words)
        assert report["qualityScore"] > 40
        assert report["quality"]["wordCount"] == len(words)


class TestParallelPsm:
    def test_read_ocr_candidates_parallel_collects_all_psms(self, tmp_path: Path):
        image_path = tmp_path / "sample.jpg"
        image_path.write_bytes(b"fake-image")

        def fake_candidate(path: Path, psm: str) -> dict:
            return {
                "status": "completed",
                "psm": psm,
                "text": f"text-{psm}",
                "confidence": int(psm),
                "qualityScore": int(psm) * 10,
            }

        with patch("examshield_ai.ocr.read_ocr_candidate", side_effect=fake_candidate):
            candidates = read_ocr_candidates_parallel(image_path)

        assert len(candidates) == 2
        psms = {candidate["psm"] for candidate in candidates}
        assert psms == {"6", "4"}

    def test_read_ocr_candidates_parallel_handles_failures(self, tmp_path: Path):
        image_path = tmp_path / "sample.jpg"
        image_path.write_bytes(b"fake-image")

        def fake_candidate(path: Path, psm: str) -> dict:
            if psm == "4":
                raise RuntimeError("boom")
            return {
                "status": "completed",
                "psm": psm,
                "text": "ok",
                "confidence": 70,
                "qualityScore": 70,
            }

        with patch("examshield_ai.ocr.read_ocr_candidate", side_effect=fake_candidate):
            candidates = read_ocr_candidates_parallel(image_path)

        failed = [candidate for candidate in candidates if candidate["status"] == "failed"]
        passed = [candidate for candidate in candidates if candidate["status"] == "completed"]
        assert len(failed) == 1
        assert len(passed) == 1


class TestSequentialPsm:
    def test_read_ocr_candidates_sequential_stops_on_quality(self, tmp_path: Path):
        image_path = tmp_path / "sample.jpg"
        image_path.write_bytes(b"fake-image")
        calls: list[str] = []

        def fake_candidate(path: Path, psm: str) -> dict:
            calls.append(psm)
            return {
                "status": "completed",
                "psm": psm,
                "text": f"text-{psm}",
                "confidence": 80,
                "qualityScore": 80 if psm == "6" else 20,
            }

        with patch("examshield_ai.ocr.read_ocr_candidate", side_effect=fake_candidate):
            candidates = read_ocr_candidates_sequential(image_path)

        assert calls == ["6"]
        assert len(candidates) == 1


class TestAnalyzeImage:
    def test_analyze_image_uses_paddle_first(self):
        paddle_candidate = {
            "status": "completed",
            "engine": "paddle",
            "text": "paddle extracted text",
            "confidence": 88,
            "qualityScore": 88,
        }

        with patch("examshield_ai.ocr.prepare_ocr_image", return_value=Path("/tmp/x.jpg")), patch(
            "examshield_ai.ocr.OCR_CHAIN",
            ("paddle", "tesseract"),
        ), patch("examshield_ai.paddle_ocr.run_paddle_ocr", return_value=paddle_candidate), patch(
            "examshield_ai.ocr.run_tesseract_best_candidate"
        ) as tess_mock, patch("pathlib.Path.unlink"):
            result = analyze_image(b"img", ".jpg")

        assert result["status"] == "completed"
        assert result["engine"] == "paddle"
        assert result["text"] == "paddle extracted text"
        tess_mock.assert_not_called()

    def test_analyze_image_falls_back_to_tesseract(self):
        tesseract_candidate = {
            "status": "completed",
            "engine": "tesseract",
            "text": "best text",
            "confidence": 90,
            "qualityScore": 92,
        }

        with patch("examshield_ai.ocr.prepare_ocr_image", return_value=Path("/tmp/x.jpg")), patch(
            "examshield_ai.ocr.OCR_CHAIN",
            ("paddle", "tesseract"),
        ), patch(
            "examshield_ai.paddle_ocr.run_paddle_ocr",
            return_value={"status": "failed", "error": "paddle failed"},
        ), patch(
            "examshield_ai.ocr.run_tesseract_best_candidate",
            return_value=tesseract_candidate,
        ), patch("pathlib.Path.unlink"):
            result = analyze_image(b"img", ".jpg")

        assert result["status"] == "completed"
        assert result["engine"] == "tesseract"
        assert result["text"] == "best text"

    def test_analyze_image_retries_when_all_engines_fail(self):
        with patch("examshield_ai.ocr.prepare_ocr_image", return_value=Path("/tmp/x.jpg")), patch(
            "examshield_ai.ocr.OCR_CHAIN",
            ("tesseract",),
        ), patch(
            "examshield_ai.ocr.run_tesseract_best_candidate",
            return_value={"status": "failed", "error": "bad"},
        ), patch("examshield_ai.ocr.OCR_MAX_RETRIES", 1), patch("pathlib.Path.unlink"):
            result = analyze_image(b"img", ".jpg")

        assert result["status"] == "failed"
        assert "bad" in result["error"]

    def test_analyze_image_uses_paddle_timeout_not_tesseract_timeout(self):
        with patch("examshield_ai.ocr.prepare_ocr_image", return_value=Path("/tmp/x.jpg")), patch(
            "examshield_ai.ocr.OCR_CHAIN",
            ("paddle",),
        ), patch("examshield_ai.ocr.OCR_TIMEOUT_SECONDS", 25), patch(
            "examshield_ai.paddle_ocr.PADDLE_TIMEOUT_SECONDS",
            60,
        ), patch(
            "examshield_ai.paddle_ocr.run_paddle_ocr",
            return_value={"status": "failed", "error": "paddle failed"},
        ) as paddle_mock, patch("pathlib.Path.unlink"):
            analyze_image(b"img", ".jpg")

        assert paddle_mock.call_args.kwargs["timeout"] == 60
