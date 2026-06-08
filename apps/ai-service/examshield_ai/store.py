from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .settings import Settings


JsonObject = dict[str, Any]


class EvidenceStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.root = settings.upload_root

    def list_evidence(self) -> JsonObject:
        evidence = sorted(
            (self._to_evidence_record(record) for record in self._read_json_dir("records")),
            key=lambda item: _time_sort_key(item.get("uploadedAt")),
            reverse=True,
        )
        activity = sorted(
            self._read_activity(),
            key=lambda item: _time_sort_key(item.get("timestamp")),
            reverse=True,
        )
        jobs = sorted(
            self._read_json_dir("jobs"),
            key=lambda item: _time_sort_key(item.get("createdAt")),
            reverse=True,
        )
        attributions = sorted(
            self._read_json_dir("attributions"),
            key=lambda item: _time_sort_key(item.get("createdAt")),
            reverse=True,
        )
        watermarks = sorted(
            self._read_json_dir("watermarks"),
            key=lambda item: _time_sort_key(item.get("extractedAt")),
            reverse=True,
        )
        reports = sorted(
            self._read_json_dir("reports"),
            key=lambda item: _time_sort_key(item.get("timestamp")),
            reverse=True,
        )
        telegram_events = sorted(
            self._read_json_dir("telegram-events"),
            key=lambda item: _time_sort_key(item.get("timestamp")),
            reverse=True,
        )
        alerts = sorted(
            self._read_json_dir("alerts"),
            key=lambda item: _time_sort_key(item.get("createdAt")),
            reverse=True,
        )

        return {
            "evidence": evidence,
            "activity": activity,
            "jobs": jobs,
            "attributions": attributions,
            "watermarks": watermarks,
            "forensicReports": reports,
            "telegramEvents": telegram_events,
            "alerts": alerts,
            "stats": {
                "totalEvidence": len(evidence),
                "pendingAnalysis": len([item for item in evidence if item.get("status") == "pending-analysis"]),
                "processing": len([item for item in evidence if item.get("status") == "analyzing"]),
                "completed": len([item for item in evidence if item.get("status") == "completed"]),
                "failed": len([item for item in evidence if item.get("status") == "analysis-failed"]),
            },
        }

    def get_bundle(self, evidence_id: str) -> JsonObject | None:
        data = self.list_evidence()
        evidence = next((item for item in data["evidence"] if item.get("evidenceId") == evidence_id), None)
        if not evidence:
            return None

        return {
            "evidence": evidence,
            "activity": [item for item in data["activity"] if item.get("evidenceId") == evidence_id],
            "jobs": [item for item in data["jobs"] if item.get("evidenceId") == evidence_id],
            "attribution": _first(data["attributions"], evidence_id),
            "attributions": [item for item in data["attributions"] if item.get("evidenceId") == evidence_id],
            "watermark": _first(data["watermarks"], evidence_id),
            "watermarks": [item for item in data["watermarks"] if item.get("evidenceId") == evidence_id],
            "forensicReport": _first(data["forensicReports"], evidence_id),
            "forensicReports": [item for item in data["forensicReports"] if item.get("evidenceId") == evidence_id],
            "telegramEvents": [item for item in data["telegramEvents"] if item.get("evidenceId") == evidence_id],
            "alert": _first(data["alerts"], evidence_id),
            "alerts": [item for item in data["alerts"] if item.get("evidenceId") == evidence_id],
        }

    def read_registry(self) -> list[JsonObject]:
        try:
            raw = self.settings.registry_path.read_text(encoding="utf-8")
            parsed = json.loads(raw)
        except (OSError, json.JSONDecodeError):
            return []
        return parsed if isinstance(parsed, list) else []

    def _read_json_dir(self, name: str) -> list[JsonObject]:
        directory = self.root / name
        try:
            entries = list(directory.iterdir())
        except OSError:
            return []

        records: list[JsonObject] = []
        for path in entries:
            if not path.is_file() or path.suffix.lower() != ".json":
                continue
            try:
                parsed = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if isinstance(parsed, dict):
                records.append(parsed)
        return records

    def _read_activity(self) -> list[JsonObject]:
        path = self.root / "activity.json"
        try:
            parsed = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        return parsed if isinstance(parsed, list) else []

    @staticmethod
    def _to_evidence_record(record: JsonObject) -> JsonObject:
        return {
            "evidenceId": record.get("evidenceId"),
            "filename": record.get("filename"),
            "fileType": record.get("fileType"),
            "source": record.get("source") or "manual-upload",
            "uploadedAt": record.get("uploadedAt"),
            "status": record.get("status"),
            "riskLevel": record.get("riskLevel"),
            "telegramMessageId": record.get("telegramMessageId"),
            "telegramChatId": record.get("telegramChatId"),
            "telegramTimestamp": record.get("telegramTimestamp"),
            "ocrStatus": record.get("ocrStatus") or "not-started",
            "ocrText": record.get("ocrText"),
            "ocrConfidence": record.get("ocrConfidence"),
            "ocrProcessingTimeMs": record.get("ocrProcessingTimeMs"),
            "analysisStartedAt": record.get("analysisStartedAt"),
            "analysisCompletedAt": record.get("analysisCompletedAt"),
        }


def _first(items: list[JsonObject], evidence_id: str) -> JsonObject | None:
    return next((item for item in items if item.get("evidenceId") == evidence_id), None)


def _time_sort_key(value: Any) -> float:
    if not value:
        return 0
    text = str(value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text).timestamp()
    except ValueError:
        return 0


def is_today(value: str | None) -> bool:
    if not value:
        return False
    try:
        date = datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return False
    return date.date() == datetime.now(timezone.utc).date()
