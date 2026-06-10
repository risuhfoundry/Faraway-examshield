from __future__ import annotations

import json
import shutil
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from .settings import Settings


JsonObject = dict[str, Any]

ALLOWED_TYPES = {
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
    "application/pdf": {".pdf"},
}


@dataclass(frozen=True)
class UploadedFile:
    filename: str
    content_type: str
    data: bytes


class EvidenceStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.root = settings.upload_root
        self.supabase_enabled = bool(settings.supabase_url and settings.supabase_service_role_key)

    def ensure_storage(self) -> None:
        for name in (
            "files",
            "records",
            "jobs",
            "attributions",
            "watermarks",
            "reports",
            "telegram-events",
            "alerts",
            "monitored-groups",
        ):
            (self.root / name).mkdir(parents=True, exist_ok=True)

    def reset_demo_environment(self) -> JsonObject:
        self.ensure_storage()
        if self.supabase_enabled:
            for name in (
                "records",
                "jobs",
                "attributions",
                "watermarks",
                "reports",
                "telegram-events",
                "alerts",
                "activity",
            ):
                self._delete_collection(name)
            self.ensure_registry_seed()
            return {
                "message": "Demo Environment Reset",
                "cleared": [
                    "evidence",
                    "alerts",
                    "reports",
                    "timeline",
                    "telegram-events",
                    "analysis-jobs",
                ],
                "restored": ["core-registry-seed"],
            }
        for name in (
            "files",
            "records",
            "jobs",
            "attributions",
            "watermarks",
            "reports",
            "telegram-events",
            "alerts",
        ):
            self._clear_runtime_directory(self.root / name)
        try:
            (self.root / "activity.json").unlink()
        except OSError:
            pass
        self.ensure_registry_seed()
        return {
            "message": "Demo Environment Reset",
            "cleared": [
                "evidence",
                "alerts",
                "reports",
                "timeline",
                "telegram-events",
                "analysis-jobs",
            ],
            "restored": ["core-registry-seed"],
        }

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

    def get_evidence_by_id(self, evidence_id: str) -> JsonObject | None:
        record = self._stored_record_for_evidence(evidence_id)
        return self._to_evidence_record(record) if record else None

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

    def create_evidence(self, uploaded: UploadedFile, *, source: str = "manual-upload", telegram: JsonObject | None = None) -> JsonObject:
        self.ensure_storage()
        self.validate_upload(uploaded)
        storage_id = str(uuid4())
        evidence_id = self._next_evidence_id()
        extension = Path(uploaded.filename).suffix.lower()
        stored_filename = f"{storage_id}{extension}"
        uploaded_at = utc_now()
        safe_name = Path(uploaded.filename).name or stored_filename
        record = {
            "evidenceId": evidence_id,
            "filename": safe_name,
            "fileType": uploaded.content_type,
            "source": source,
            "uploadedAt": uploaded_at,
            "status": "pending-analysis",
            "riskLevel": "unknown",
            "telegramMessageId": (telegram or {}).get("messageId"),
            "telegramChatId": (telegram or {}).get("chatId"),
            "telegramTimestamp": (telegram or {}).get("timestamp"),
            "ocrStatus": "not-started",
            "ocrText": None,
            "ocrConfidence": None,
            "ocrProcessingTimeMs": None,
            "analysisStartedAt": None,
            "analysisCompletedAt": None,
            "storageId": storage_id,
            "originalFilename": safe_name,
            "storedFilename": stored_filename,
            "storedAt": uploaded_at,
        }
        self._write_file_bytes(stored_filename, uploaded.data, uploaded.content_type)
        self._write_stored_record(record)
        activity = self.record_activity(
            {
                "type": "evidence-uploaded",
                "title": "Evidence Created" if source == "telegram" else "Upload Received",
                "evidenceId": evidence_id,
                "timestamp": uploaded_at,
                "detail": f"Telegram evidence: {safe_name}" if source == "telegram" else safe_name,
            }
        )
        return {"evidence": self._to_evidence_record(record), "activity": activity}

    def validate_upload(self, uploaded: UploadedFile) -> None:
        if len(uploaded.data) > self.settings.max_upload_bytes:
            raise ValueError("Evidence file is larger than the configured upload limit.")
        extension = Path(uploaded.filename).suffix.lower()
        if uploaded.content_type not in ALLOWED_TYPES or extension not in ALLOWED_TYPES[uploaded.content_type]:
            raise ValueError("Only JPG, JPEG, PNG, and PDF evidence files are supported.")

    def get_asset(self, evidence_id: str) -> JsonObject | None:
        record = self._stored_record_for_evidence(evidence_id)
        if not record:
            return None
        return {
            "evidence": self._to_evidence_record(record),
            "filePath": str(self.root / "files" / str(record.get("storedFilename"))),
            "storedFilename": record.get("storedFilename"),
            "fileType": record.get("fileType"),
            "filename": record.get("filename"),
        }

    def create_analysis_job(self, evidence_id: str) -> JsonObject:
        evidence = self.get_evidence_by_id(evidence_id)
        if not evidence:
            raise LookupError("Evidence not found.")
        now = utc_now()
        job = {
            "jobId": str(uuid4()),
            "evidenceId": evidence_id,
            "type": "ocr",
            "status": "queued",
            "createdAt": now,
            "startedAt": None,
            "completedAt": None,
            "confidence": None,
            "processingTimeMs": None,
            "error": None,
        }
        self._write_json("jobs", f"{job['jobId']}.json", job)
        self._update_evidence_record(
            evidence_id,
            lambda record: {
                **record,
                "status": "analyzing",
                "ocrStatus": "queued",
                "ocrText": None,
                "ocrConfidence": None,
                "ocrProcessingTimeMs": None,
                "analysisStartedAt": None,
                "analysisCompletedAt": None,
            },
        )
        activity = self.record_activity(
            {
                "type": "analysis-queued",
                "title": "Analysis Queued",
                "evidenceId": evidence_id,
                "jobId": job["jobId"],
                "timestamp": now,
            }
        )
        return {"job": job, "activity": activity}

    def run_analysis_job(self, job_id: str, ocr_runner: Callable[[bytes, str], JsonObject]) -> JsonObject:
        timeline: list[JsonObject] = []
        evidence_id: str | None = None
        try:
            processing = self.mark_analysis_job_processing(job_id)
            evidence_id = str(processing["job"]["evidenceId"])
            timeline.append(processing["activity"])
            timeline.append(
                self.record_activity(
                    {
                        "type": "analysis-started",
                        "title": "Analysis Started",
                        "evidenceId": evidence_id,
                        "jobId": job_id,
                        "timestamp": processing["activity"]["timestamp"],
                    }
                )
            )
            asset = self.get_asset(evidence_id)
            if not asset:
                raise LookupError("Evidence file was not found.")
            if asset["fileType"] == "application/pdf":
                raise ValueError("OCR currently accepts image evidence. Convert PDFs to JPG or PNG before analysis.")
            image_bytes = self._read_file_bytes(str(asset["storedFilename"]))
            suffixes = ALLOWED_TYPES.get(str(asset["fileType"]), set())
            suffix = sorted(suffixes)[0] if suffixes else ""
            ocr_result = ocr_runner(image_bytes, suffix)
            if ocr_result.get("status") == "failed":
                raise RuntimeError(str(ocr_result.get("error") or "OCR failed."))
            completed = self.complete_analysis_job(
                job_id,
                {
                    "text": str(ocr_result.get("text") or ""),
                    "confidence": int(ocr_result.get("confidence") or 0),
                    "processingTimeMs": int(ocr_result.get("processingTimeMs") or 0),
                },
            )
            timeline.extend(completed["activity"])
            attribution = self.run_attribution_for_evidence(
                str(completed["evidence"]["evidenceId"]),
                str(completed["evidence"].get("ocrText") or ""),
                completed["evidence"].get("ocrConfidence"),
            )
            timeline.extend(attribution["activity"])
            report = attribution["forensicReport"]
            completed_event = self.record_activity(
                {
                    "type": "analysis-completed",
                    "title": "Analysis Completed",
                    "evidenceId": completed["evidence"]["evidenceId"],
                    "jobId": job_id,
                    "timestamp": add_milliseconds(str(report["timestamp"]), 4),
                    "detail": f"{report['finalConfidence']}% final confidence"
                    if report["status"] == "investigation-complete"
                    else "No registry match",
                }
            )
            timeline.append(completed_event)
            alert = self.create_critical_alert_if_needed(report, attribution["attribution"])
            if alert["activity"]:
                timeline.append(alert["activity"])
            return {
                "message": "Analysis Complete",
                "evidence": completed["evidence"],
                "job": completed["job"],
                "attribution": attribution["attribution"],
                "watermark": attribution["watermark"],
                "forensicReport": report,
                "alert": alert["alert"],
                "activity": timeline,
            }
        except Exception as exc:
            message = str(exc) or "Analysis failed."
            failed = self.fail_analysis_job(job_id, message)
            return {
                "message": "Analysis Failed",
                "evidence": failed["evidence"],
                "job": failed["job"],
                "activity": [*timeline, *failed["activity"]],
            }

    def mark_analysis_job_processing(self, job_id: str) -> JsonObject:
        job = self._read_json_file("jobs", f"{job_id}.json")
        if not job:
            raise LookupError("Analysis job not found.")
        now = utc_now()
        updated = {**job, "status": "processing", "startedAt": now}
        self._write_json("jobs", f"{job_id}.json", updated)
        self._update_evidence_record(
            str(job["evidenceId"]),
            lambda record: {**record, "status": "analyzing", "ocrStatus": "processing", "analysisStartedAt": now},
        )
        activity = self.record_activity(
            {
                "type": "ocr-started",
                "title": "OCR Started",
                "evidenceId": job["evidenceId"],
                "jobId": job_id,
                "timestamp": now,
            }
        )
        return {"job": updated, "activity": activity}

    def complete_analysis_job(self, job_id: str, result: JsonObject) -> JsonObject:
        job = self._read_json_file("jobs", f"{job_id}.json")
        if not job:
            raise LookupError("Analysis job not found.")
        now = utc_now()
        updated_job = {
            **job,
            "status": "completed",
            "completedAt": now,
            "confidence": result["confidence"],
            "processingTimeMs": result["processingTimeMs"],
            "error": None,
        }
        self._write_json("jobs", f"{job_id}.json", updated_job)
        evidence = self._update_evidence_record(
            str(job["evidenceId"]),
            lambda record: {
                **record,
                "status": "completed",
                "ocrStatus": "completed",
                "ocrText": result["text"],
                "ocrConfidence": result["confidence"],
                "ocrProcessingTimeMs": result["processingTimeMs"],
                "analysisCompletedAt": now,
            },
        )
        completed_event = self.record_activity(
            {
                "type": "ocr-complete",
                "title": "OCR Complete",
                "evidenceId": job["evidenceId"],
                "jobId": job_id,
                "timestamp": now,
                "detail": "Text extracted" if str(result["text"]).strip() else "No Exam Content Detected",
            }
        )
        stored_event = self.record_activity(
            {
                "type": "results-stored",
                "title": "Results Stored",
                "evidenceId": job["evidenceId"],
                "jobId": job_id,
                "timestamp": add_milliseconds(now, 1),
            }
        )
        return {"evidence": evidence, "job": updated_job, "activity": [completed_event, stored_event]}

    def fail_analysis_job(self, job_id: str, message: str) -> JsonObject:
        job = self._read_json_file("jobs", f"{job_id}.json")
        if not job:
            raise LookupError("Analysis job not found.")
        now = utc_now()
        updated_job = {**job, "status": "failed", "completedAt": now, "error": message}
        self._write_json("jobs", f"{job_id}.json", updated_job)
        evidence = self._update_evidence_record(
            str(job["evidenceId"]),
            lambda record: {**record, "status": "analysis-failed", "ocrStatus": "failed", "analysisCompletedAt": now},
        )
        activity = self.record_activity(
            {
                "type": "analysis-failed",
                "title": "Analysis Failed",
                "evidenceId": job["evidenceId"],
                "jobId": job_id,
                "timestamp": now,
                "detail": message,
            }
        )
        return {"evidence": evidence, "job": updated_job, "activity": [activity]}

    def create_telegram_event(self, *, message_id: str, chat_id: str, timestamp: str, text: str | None, file: UploadedFile | None, detection: dict[str, Any] | None = None) -> JsonObject:
        self.ensure_storage()
        existing = self.find_telegram_event(chat_id, message_id)
        if existing:
            return {
                "telegramEvent": existing,
                "evidence": self.get_evidence_by_id(str(existing["evidenceId"])) if existing.get("evidenceId") else None,
                "activity": [],
                "duplicate": True,
            }
        if not file:
            evidence_id = None
            activity: list[JsonObject] = []
            # Create text evidence for suspicious messages without files
            if text and detection and detection.get("score", 0) >= 7.0:
                created = self.create_text_evidence(
                    text,
                    source="telegram",
                    telegram={"messageId": str(message_id), "chatId": str(chat_id), "timestamp": timestamp},
                )
                evidence_id = created["evidence"]["evidenceId"]
                activity.append(created["activity"])
            event = self._write_telegram_event(
                {
                    "eventId": telegram_event_id(chat_id, message_id),
                    "messageId": str(message_id),
                    "chatId": str(chat_id),
                    "timestamp": timestamp,
                    "evidenceId": evidence_id,
                    "text": text,
                    "filename": None,
                    "fileType": None,
                    "receivedAt": utc_now(),
                }
            )
            return {"telegramEvent": event, "evidence": self.get_evidence_by_id(evidence_id) if evidence_id else None, "activity": activity, "duplicate": False}

        created = self.create_evidence(
            file,
            source="telegram",
            telegram={"messageId": str(message_id), "chatId": str(chat_id), "timestamp": timestamp},
        )
        detected = self.record_activity(
            {
                "type": "telegram-message-detected",
                "title": "Telegram Message Detected",
                "evidenceId": created["evidence"]["evidenceId"],
                "timestamp": timestamp,
                "detail": text.strip() if text and text.strip() else f"Message {message_id} from {chat_id}",
            }
        )
        event = self._write_telegram_event(
            {
                "eventId": telegram_event_id(chat_id, message_id),
                "messageId": str(message_id),
                "chatId": str(chat_id),
                "timestamp": timestamp,
                "evidenceId": created["evidence"]["evidenceId"],
                "text": text,
                "filename": file.filename,
                "fileType": file.content_type,
                "receivedAt": created["evidence"]["uploadedAt"],
            }
        )
        return {
            "telegramEvent": event,
            "evidence": created["evidence"],
            "activity": [detected, created["activity"]],
            "duplicate": False,
        }

    def find_telegram_event(self, chat_id: str, message_id: str) -> JsonObject | None:
        normalized_chat_id = str(chat_id)
        normalized_message_id = str(message_id)
        for event in self._read_json_dir("telegram-events"):
            if event.get("chatId") == normalized_chat_id and event.get("messageId") == normalized_message_id:
                return event
        return None

    # ------------------------------------------------------------------
    # Monitored groups (multi-group monitoring)
    # ------------------------------------------------------------------
    def list_monitored_groups(self) -> list[JsonObject]:
        return self._read_json_dir("monitored-groups")

    def is_monitored_group(self, chat_id: str) -> bool:
        return any(
            str(g.get("chatId")) == str(chat_id) and g.get("isActive") is not False
            for g in self.list_monitored_groups()
        )

    def add_monitored_group(self, chat_id: str, name: str | None = None, added_by: str | None = None) -> JsonObject:
        self.ensure_storage()
        existing = self._read_json_file("monitored-groups", f"{chat_id}.json")
        if existing and existing.get("isActive") is not False:
            return {"group": existing, "created": False, "message": "Group already monitored."}
        group = {
            "chatId": str(chat_id),
            "name": name or str(chat_id),
            "addedBy": added_by,
            "addedAt": utc_now(),
            "isActive": True,
        }
        self._write_json("monitored-groups", f"{chat_id}.json", group)
        return {"group": group, "created": True}

    def remove_monitored_group(self, chat_id: str) -> JsonObject:
        existing = self._read_json_file("monitored-groups", f"{chat_id}.json")
        if not existing:
            return {"message": "Group not found."}
        existing["isActive"] = False
        existing["removedAt"] = utc_now()
        self._write_json("monitored-groups", f"{chat_id}.json", existing)
        return {"message": "Group removed from monitoring.", "group": existing}

    # ------------------------------------------------------------------
    # Text-only evidence (for suspicious messages without files)
    # ------------------------------------------------------------------
    def create_text_evidence(self, text: str, *, source: str = "telegram", telegram: JsonObject | None = None) -> JsonObject:
        self.ensure_storage()
        evidence_id = self._next_evidence_id()
        stored_filename = f"{evidence_id}.txt"
        uploaded_at = utc_now()
        # Store text as a .txt file to fit the existing pipeline
        self._write_file_bytes(stored_filename, text.encode("utf-8"), "text/plain")
        record = {
            "evidenceId": evidence_id,
            "filename": stored_filename,
            "fileType": "text/plain",
            "source": source,
            "uploadedAt": uploaded_at,
            "status": "detected",
            "riskLevel": "unknown",
            "telegramMessageId": (telegram or {}).get("messageId"),
            "telegramChatId": (telegram or {}).get("chatId"),
            "telegramTimestamp": (telegram or {}).get("timestamp"),
            "ocrStatus": "not-applicable",
            "ocrText": text,
            "ocrConfidence": None,
            "ocrProcessingTimeMs": None,
            "analysisStartedAt": None,
            "analysisCompletedAt": None,
            "storageId": evidence_id,
            "originalFilename": stored_filename,
            "storedFilename": stored_filename,
            "storedAt": uploaded_at,
        }
        self._write_stored_record(record)
        activity = self.record_activity(
            {
                "type": "text-evidence-created",
                "title": "Suspicious Text Detected",
                "evidenceId": evidence_id,
                "timestamp": uploaded_at,
                "detail": text[:120],
            }
        )
        return {"evidence": self._to_evidence_record(record), "activity": activity}

    def run_attribution_for_evidence(self, evidence_id: str, ocr_text: str, ocr_confidence: int | None) -> JsonObject:
        now = utc_now()
        watermark_extracted_at = add_milliseconds(now, 1)
        attribution_started_at = add_milliseconds(now, 2)
        attribution_created_at = add_milliseconds(now, 3)
        watermark_started = self.record_activity(
            {
                "type": "watermark-extraction-started",
                "title": "Watermark Extraction Started",
                "evidenceId": evidence_id,
                "timestamp": now,
            }
        )
        watermark_result = self.extract_watermark(ocr_text)
        watermark = {
            "extractionId": prefixed_id("WMX", evidence_id),
            "evidenceId": evidence_id,
            "watermarkId": watermark_result.get("watermarkId"),
            "confidence": watermark_result.get("confidence"),
            "status": watermark_result.get("status"),
            "extractedAt": watermark_extracted_at,
        }
        self._write_json("watermarks", f"{evidence_id}.json", watermark)
        watermark_activity = [watermark_started]
        if watermark["status"] == "detected" and watermark["watermarkId"]:
            watermark_activity.append(
                self.record_activity(
                    {
                        "type": "watermark-found",
                        "title": "Watermark Found",
                        "evidenceId": evidence_id,
                        "timestamp": watermark_extracted_at,
                        "detail": f"{watermark['watermarkId']} at {watermark['confidence']}% confidence",
                    }
                )
            )

        attribution_started = self.record_activity(
            {
                "type": "attribution-started",
                "title": "Attribution Started",
                "evidenceId": evidence_id,
                "timestamp": attribution_started_at,
            }
        )
        registry_record = watermark_result.get("registryRecord")
        match = self.match_paper_from_ocr(ocr_text) if not registry_record else None
        if registry_record:
            match = {
                "matchedPaperId": registry_record["paperId"],
                "matchedExam": f"{registry_record['exam']} {registry_record['year']}",
                "matchedSet": registry_record["paperSet"],
                "confidence": 100,
                "centerCode": registry_record["centerCode"],
                "printerId": registry_record["printerId"],
                "batchId": registry_record["printBatch"],
                "status": registry_record["status"],
                "matchedWatermarkId": registry_record["watermarkId"],
                "centerName": registry_record["centerName"],
            }

        if not match:
            attribution = {
                "attributionId": prefixed_id("ATTR", evidence_id),
                "evidenceId": evidence_id,
                "matchedPaperId": None,
                "matchedExam": None,
                "matchedSet": None,
                "confidence": 0,
                "centerCode": None,
                "printerId": None,
                "batchId": None,
                "status": "no-match",
                "matchedWatermarkId": None,
                "centerName": None,
                "ocrConfidence": ocr_confidence,
                "watermarkConfidence": watermark["confidence"],
                "finalConfidence": 0,
                "createdAt": attribution_created_at,
            }
            self._write_json("attributions", f"{evidence_id}.json", attribution)
            report = self._write_report(
                {
                    "reportId": prefixed_id("FR", evidence_id),
                    "evidenceId": evidence_id,
                    "paperIdentified": None,
                    "watermarkId": watermark["watermarkId"],
                    "centerCode": None,
                    "printerId": None,
                    "batchId": None,
                    "riskLevel": None,
                    "status": "no-match",
                    "ocrConfidence": ocr_confidence,
                    "watermarkConfidence": watermark["confidence"],
                    "finalConfidence": 0,
                    "timestamp": attribution_created_at,
                }
            )
            completed = self.record_activity(
                {
                    "type": "attribution-complete",
                    "title": "Attribution Complete",
                    "evidenceId": evidence_id,
                    "timestamp": add_milliseconds(attribution_created_at, 1),
                    "detail": "No registry match found" if ocr_text.strip() else "No OCR text available",
                }
            )
            return {
                "attribution": attribution,
                "watermark": watermark,
                "forensicReport": report,
                "activity": [*watermark_activity, attribution_started, completed],
            }

        final_confidence = final_confidence_score(ocr_confidence, match.get("confidence"), watermark.get("confidence"))
        attribution = {
            "attributionId": prefixed_id("ATTR", evidence_id),
            "evidenceId": evidence_id,
            "matchedPaperId": match["matchedPaperId"],
            "matchedExam": match["matchedExam"],
            "matchedSet": match["matchedSet"],
            "confidence": match["confidence"],
            "centerCode": match["centerCode"],
            "printerId": match["printerId"],
            "batchId": match["batchId"],
            "status": match["status"],
            "matchedWatermarkId": match["matchedWatermarkId"],
            "centerName": match["centerName"],
            "ocrConfidence": ocr_confidence,
            "watermarkConfidence": watermark["confidence"],
            "finalConfidence": final_confidence,
            "createdAt": attribution_created_at,
        }
        self._write_json("attributions", f"{evidence_id}.json", attribution)
        report = self._write_report(
            {
                "reportId": prefixed_id("FR", evidence_id),
                "evidenceId": evidence_id,
                "paperIdentified": match["matchedPaperId"],
                "watermarkId": watermark["watermarkId"] or match["matchedWatermarkId"],
                "centerCode": match["centerCode"],
                "printerId": match["printerId"],
                "batchId": match["batchId"],
                "riskLevel": "critical" if match["status"] == "compromised" else match["status"],
                "status": "investigation-complete",
                "ocrConfidence": ocr_confidence,
                "watermarkConfidence": watermark["confidence"],
                "finalConfidence": final_confidence,
                "timestamp": attribution_created_at,
            }
        )
        matched = self.record_activity(
            {
                "type": "paper-matched",
                "title": "Paper Matched",
                "evidenceId": evidence_id,
                "timestamp": attribution_created_at,
                "detail": f"{match['matchedPaperId']} at {match['confidence']}% confidence",
            }
        )
        source = self.record_activity(
            {
                "type": "source-identified",
                "title": "Source Identified",
                "evidenceId": evidence_id,
                "timestamp": add_milliseconds(attribution_created_at, 1),
                "detail": f"{match['centerCode']} / {match['printerId']} / {match['batchId']}",
            }
        )
        completed = self.record_activity(
            {
                "type": "attribution-complete",
                "title": "Attribution Complete",
                "evidenceId": evidence_id,
                "timestamp": add_milliseconds(attribution_created_at, 2),
                "detail": str(match["status"]).upper(),
            }
        )
        investigation_completed = self.record_activity(
            {
                "type": "investigation-completed",
                "title": "Investigation Completed",
                "evidenceId": evidence_id,
                "timestamp": add_milliseconds(attribution_created_at, 3),
                "detail": f"{final_confidence}% final confidence",
            }
        )
        return {
            "attribution": attribution,
            "watermark": watermark,
            "forensicReport": report,
            "activity": [
                *watermark_activity,
                attribution_started,
                matched,
                source,
                completed,
                investigation_completed,
            ],
        }

    def create_critical_alert_if_needed(self, report: JsonObject | None, attribution: JsonObject | None) -> JsonObject:
        if not report or report.get("status") != "investigation-complete" or int(report.get("finalConfidence") or 0) <= 80:
            return {"alert": None, "activity": None}
        existing = self.find_alert_by_evidence_id(str(report["evidenceId"]))
        if existing:
            return {"alert": existing, "activity": None}
        created_at = add_milliseconds(str(report["timestamp"]), 5)
        alert = {
            "alertId": prefixed_id("ALERT", str(report["evidenceId"])),
            "evidenceId": report["evidenceId"],
            "paperId": report.get("paperIdentified"),
            "centerCode": report.get("centerCode"),
            "watermarkId": report.get("watermarkId") or (attribution or {}).get("matchedWatermarkId"),
            "confidence": report.get("finalConfidence"),
            "risk": str(report.get("riskLevel") or "critical").lower(),
            "createdAt": created_at,
            "status": "open",
        }
        self._write_json("alerts", f"{report['evidenceId']}.json", alert)
        activity = self.record_activity(
            {
                "type": "critical-alert-generated",
                "title": "Critical Alert Generated",
                "evidenceId": report["evidenceId"],
                "timestamp": created_at,
                "detail": f"{alert['paperId'] or 'Unknown paper'} / {alert['centerCode'] or 'Unknown center'} / {alert['confidence']}%",
            }
        )
        return {"alert": alert, "activity": activity}

    def find_alert_by_evidence_id(self, evidence_id: str) -> JsonObject | None:
        for alert in self._read_json_dir("alerts"):
            if alert.get("evidenceId") == evidence_id:
                return alert
        return None

    def extract_watermark(self, text: str) -> JsonObject:
        candidates = extract_watermark_candidates(text)
        if not candidates:
            return {"status": "not-detected", "watermarkId": None, "confidence": 0, "registryRecord": None}
        watermark_id = candidates[0]
        record = self.find_registry_record_by_watermark(watermark_id)
        if not record:
            return {"status": "invalid", "watermarkId": watermark_id, "confidence": 70, "registryRecord": None}
        return {"status": "detected", "watermarkId": watermark_id, "confidence": 100, "registryRecord": record}

    def match_paper_from_ocr(self, text: str) -> JsonObject | None:
        query_tokens = tokenize(text)
        if len(query_tokens) < 3:
            return None
        ranked: list[tuple[int, JsonObject]] = []
        for record in self.read_registry():
            registry_text = " ".join(str(record.get(field) or "") for field in ("paperId", "exam", "paperSet", "centerCode", "centerName", "city", "state"))
            registry_tokens = tokenize(registry_text)
            if not registry_tokens:
                continue
            overlap = len(query_tokens.intersection(registry_tokens))
            confidence = round((overlap / max(len(registry_tokens), 1)) * 100)
            if confidence > 0:
                ranked.append((confidence, record))
        ranked.sort(key=lambda item: item[0], reverse=True)
        if not ranked or ranked[0][0] < 55:
            return None
        confidence, record = ranked[0]
        return {
            "matchedPaperId": record["paperId"],
            "matchedExam": f"{record['exam']} {record['year']}",
            "matchedSet": record["paperSet"],
            "confidence": min(96, confidence),
            "centerCode": record["centerCode"],
            "printerId": record["printerId"],
            "batchId": record["printBatch"],
            "status": record["status"],
            "matchedWatermarkId": record["watermarkId"],
            "centerName": record["centerName"],
        }

    def find_registry_record_by_watermark(self, watermark_id: str) -> JsonObject | None:
        normalized = normalize_watermark_id(watermark_id)
        return next((record for record in self.read_registry() if record.get("watermarkId") == normalized), None)

    def read_registry(self) -> list[JsonObject]:
        self.ensure_registry_seed()
        if self.supabase_enabled:
            document = self._read_document("registry", "papers") or {}
            records = document.get("items")
            return records if isinstance(records, list) else []
        try:
            raw = self.settings.registry_path.read_text(encoding="utf-8")
            parsed = json.loads(raw)
        except (OSError, json.JSONDecodeError):
            return []
        return parsed if isinstance(parsed, list) else []

    def ensure_registry_seed(self) -> None:
        if self.supabase_enabled:
            if self._read_document("registry", "papers"):
                return
            self._write_document("registry", "papers", {"items": generate_registry_seed()})
            return
        if self.settings.registry_path.exists():
            return
        self.settings.registry_path.parent.mkdir(parents=True, exist_ok=True)
        records = generate_registry_seed()
        self.settings.registry_path.write_text(json.dumps(records, indent=2), encoding="utf-8")

    def record_activity(self, activity: JsonObject) -> JsonObject:
        event = {**activity, "eventId": activity.get("eventId") or str(uuid4())}
        existing = self._read_activity()
        payload = [event, *existing][:200]
        if self.supabase_enabled:
            self._write_document("activity", "activity", {"items": payload})
        else:
            (self.root / "activity.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return event

    def _read_json_dir(self, name: str) -> list[JsonObject]:
        self.ensure_storage()
        if self.supabase_enabled:
            rows = self._supabase_json(
                "GET",
                f"/rest/v1/{self.settings.supabase_document_table}?collection=eq.{urllib.parse.quote(name)}&select=payload",
            )
            if not isinstance(rows, list):
                return []
            return [
                row["payload"]
                for row in rows
                if isinstance(row, dict) and isinstance(row.get("payload"), dict)
            ]
        directory = self.root / name
        records: list[JsonObject] = []
        for path in directory.iterdir():
            if not path.is_file() or path.suffix.lower() != ".json":
                continue
            try:
                parsed = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if isinstance(parsed, dict):
                records.append(parsed)
        return records

    def _read_json_file(self, directory: str, filename: str) -> JsonObject | None:
        if self.supabase_enabled:
            return self._read_document(directory, filename)
        try:
            parsed = json.loads((self.root / directory / filename).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        return parsed if isinstance(parsed, dict) else None

    def _write_json(self, directory: str, filename: str, payload: JsonObject) -> JsonObject:
        self.ensure_storage()
        if self.supabase_enabled:
            self._write_document(directory, filename, payload)
            return payload
        path = self.root / directory / filename
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return payload

    def _write_report(self, report: JsonObject) -> JsonObject:
        return self._write_json("reports", f"{report['evidenceId']}.json", report)

    def _write_telegram_event(self, event: JsonObject) -> JsonObject:
        return self._write_json("telegram-events", f"{event['eventId']}.json", event)

    def _read_activity(self) -> list[JsonObject]:
        if self.supabase_enabled:
            document = self._read_document("activity", "activity") or {}
            items = document.get("items")
            return items if isinstance(items, list) else []
        path = self.root / "activity.json"
        try:
            parsed = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        return parsed if isinstance(parsed, list) else []

    def _stored_record_for_evidence(self, evidence_id: str) -> JsonObject | None:
        return next((item for item in self._read_json_dir("records") if item.get("evidenceId") == evidence_id), None)

    def _write_stored_record(self, record: JsonObject) -> None:
        self._write_json("records", f"{record['storageId']}.json", record)

    def _update_evidence_record(self, evidence_id: str, updater: Callable[[JsonObject], JsonObject]) -> JsonObject:
        record = self._stored_record_for_evidence(evidence_id)
        if not record:
            raise LookupError("Evidence not found.")
        updated = updater(self._normalize_stored_record(record))
        self._write_stored_record(updated)
        return self._to_evidence_record(updated)

    def _next_evidence_id(self) -> str:
        maximum = 0
        for record in self._read_json_dir("records"):
            text = str(record.get("evidenceId") or "")
            if text.startswith("EV-") and text[3:].isdigit():
                maximum = max(maximum, int(text[3:]))
        return f"EV-{maximum + 1:03d}"

    def _clear_runtime_directory(self, directory: Path) -> None:
        directory.mkdir(parents=True, exist_ok=True)
        for entry in directory.iterdir():
            if entry.name == ".gitkeep":
                continue
            if entry.is_dir():
                shutil.rmtree(entry)
            else:
                entry.unlink(missing_ok=True)

    def _write_file_bytes(self, stored_filename: str, data: bytes, content_type: str) -> None:
        if self.supabase_enabled:
            encoded = urllib.parse.quote(stored_filename)
            self._supabase_bytes(
                "POST",
                f"/storage/v1/object/{self.settings.supabase_storage_bucket}/{encoded}",
                data,
                content_type=content_type,
                extra_headers={"x-upsert": "true"},
            )
            return
        (self.root / "files" / stored_filename).write_bytes(data)

    def _read_file_bytes(self, stored_filename: str) -> bytes:
        if self.supabase_enabled:
            encoded = urllib.parse.quote(stored_filename)
            return self._supabase_bytes(
                "GET",
                f"/storage/v1/object/{self.settings.supabase_storage_bucket}/{encoded}",
            )
        return (self.root / "files" / stored_filename).read_bytes()

    def _write_document(self, collection: str, document_key: str, payload: JsonObject) -> None:
        self._supabase_json(
            "POST",
            f"/rest/v1/{self.settings.supabase_document_table}?on_conflict=collection,document_key",
            {
                "collection": collection,
                "document_key": document_key,
                "payload": payload,
            },
            extra_headers={"Prefer": "resolution=merge-duplicates"},
        )

    def _read_document(self, collection: str, document_key: str) -> JsonObject | None:
        encoded_collection = urllib.parse.quote(collection)
        encoded_key = urllib.parse.quote(document_key)
        rows = self._supabase_json(
            "GET",
            f"/rest/v1/{self.settings.supabase_document_table}?collection=eq.{encoded_collection}&document_key=eq.{encoded_key}&select=payload&limit=1",
        )
        if not isinstance(rows, list) or not rows:
            return None
        payload = rows[0].get("payload") if isinstance(rows[0], dict) else None
        return payload if isinstance(payload, dict) else None

    def _delete_collection(self, collection: str) -> None:
        encoded_collection = urllib.parse.quote(collection)
        self._supabase_json(
            "DELETE",
            f"/rest/v1/{self.settings.supabase_document_table}?collection=eq.{encoded_collection}",
            extra_headers={"Prefer": "return=minimal"},
        )

    def _supabase_json(
        self,
        method: str,
        path: str,
        payload: JsonObject | None = None,
        *,
        extra_headers: dict[str, str] | None = None,
    ) -> Any:
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        body = self._supabase_bytes(
            method,
            path,
            data,
            content_type="application/json",
            extra_headers=extra_headers,
        )
        if not body:
            return None
        return json.loads(body.decode("utf-8"))

    def _supabase_bytes(
        self,
        method: str,
        path: str,
        data: bytes | None = None,
        *,
        content_type: str | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> bytes:
        headers = {
            "apikey": self.settings.supabase_service_role_key,
            "Authorization": f"Bearer {self.settings.supabase_service_role_key}",
        }
        if content_type:
            headers["Content-Type"] = content_type
        if extra_headers:
            headers.update(extra_headers)
        request = urllib.request.Request(
            f"{self.settings.supabase_url}{path}",
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase {method} {path} failed: HTTP {exc.code} {detail}") from exc

    @staticmethod
    def _normalize_stored_record(record: JsonObject) -> JsonObject:
        return {
            **record,
            "source": record.get("source") or "manual-upload",
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

    @staticmethod
    def _to_evidence_record(record: JsonObject) -> JsonObject:
        normalized = EvidenceStore._normalize_stored_record(record)
        return {
            "evidenceId": normalized.get("evidenceId"),
            "filename": normalized.get("filename"),
            "fileType": normalized.get("fileType"),
            "source": normalized.get("source"),
            "uploadedAt": normalized.get("uploadedAt"),
            "status": normalized.get("status"),
            "riskLevel": normalized.get("riskLevel"),
            "telegramMessageId": normalized.get("telegramMessageId"),
            "telegramChatId": normalized.get("telegramChatId"),
            "telegramTimestamp": normalized.get("telegramTimestamp"),
            "ocrStatus": normalized.get("ocrStatus"),
            "ocrText": normalized.get("ocrText"),
            "ocrConfidence": normalized.get("ocrConfidence"),
            "ocrProcessingTimeMs": normalized.get("ocrProcessingTimeMs"),
            "analysisStartedAt": normalized.get("analysisStartedAt"),
            "analysisCompletedAt": normalized.get("analysisCompletedAt"),
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


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def add_milliseconds(timestamp: str, milliseconds: int) -> str:
    parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    return datetime.fromtimestamp(parsed.timestamp() + milliseconds / 1000, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def prefixed_id(prefix: str, evidence_id: str) -> str:
    suffix = evidence_id[3:] if evidence_id.startswith("EV-") else evidence_id
    return f"{prefix}-{suffix}"


def telegram_event_id(chat_id: str, message_id: str) -> str:
    return f"TG-{safe_identifier(chat_id)}-{safe_identifier(message_id)}"


def safe_identifier(value: str) -> str:
    cleaned = "".join(char if char.isalnum() or char == "-" else "_" for char in str(value))
    return cleaned or "unknown"


def normalize_telegram_timestamp(value: Any) -> str:
    if value is None or value == "":
        return utc_now()
    text = str(value).strip()
    if text.isdigit() and len(text) <= 10:
        return datetime.fromtimestamp(int(text), timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    return parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def tokenize(value: str) -> set[str]:
    tokens: set[str] = set()
    current: list[str] = []
    for char in value.lower():
        if char.isalnum():
            current.append(char)
        elif current:
            token = "".join(current)
            if len(token) >= 3:
                tokens.add(token)
            current = []
    if current:
        token = "".join(current)
        if len(token) >= 3:
            tokens.add(token)
    return tokens


def normalize_watermark_id(value: str) -> str:
    compact = "".join(char for char in str(value).upper() if char.isalnum())
    if compact.startswith("WMK") and compact[3:].isdigit():
        return f"WMK-{int(compact[3:]):03d}"
    return str(value).strip().upper()


def extract_watermark_candidates(text: str) -> list[str]:
    found: list[str] = []
    for token in text.replace("_", "-").split():
        normalized = normalize_watermark_id(token)
        if normalized.startswith("WMK-") and normalized[4:].isdigit() and normalized not in found:
            found.append(normalized)
    return found


def final_confidence_score(ocr_confidence: int | None, paper_confidence: int | None, watermark_confidence: int | None) -> int:
    if watermark_confidence is not None and watermark_confidence > 0:
        ocr_component = paper_confidence if paper_confidence is not None else ocr_confidence or 0
        return round(ocr_component * 0.4 + watermark_confidence * 0.6)
    return paper_confidence if paper_confidence is not None else ocr_confidence or 0


def generate_registry_seed() -> list[JsonObject]:
    exams = [
        ("NEET", ["A", "B", "C", "D"], 30),
        ("JEE", ["A", "B", "C"], 25),
        ("UPSC", ["A", "B"], 20),
        ("GATE", ["A", "B", "C", "D", "E", "F", "G", "H"], 15),
        ("CBSE", ["Math", "Chem", "Phy"], 20),
    ]
    centers = [
        ("DEL", "New Delhi", "Delhi", "Delhi Public School - Sector 42"),
        ("MUM", "Mumbai", "Maharashtra", "Bombay Scottish School - Mahim"),
        ("BLR", "Bangalore", "Karnataka", "Bishop Cotton Boys' School"),
        ("CHN", "Chennai", "Tamil Nadu", "Chettinad Vidyashram"),
        ("KOL", "Kolkata", "West Bengal", "La Martiniere for Boys"),
        ("LKO", "Lucknow", "Uttar Pradesh", "La Martiniere College"),
        ("AMD", "Ahmedabad", "Gujarat", "Delhi Public School - Bopal"),
        ("JPR", "Jaipur", "Rajasthan", "Delhi Public School - Jaipur"),
        ("HYD", "Hyderabad", "Telangana", "The Hyderabad Public School - Begumpet"),
        ("KOC", "Kochi", "Kerala", "Choice School - Tripunithura"),
        ("CHD", "Chandigarh", "Punjab", "Sacred Heart Senior Secondary School"),
        ("GGN", "Gurugram", "Haryana", "Shiv Nadar School"),
    ]
    records: list[JsonObject] = []
    watermark_counter = 1
    for exam, sets, center_count in exams:
        for index in range(center_count):
            code, city, state, center_name = centers[index % len(centers)]
            paper_set = sets[index % len(sets)]
            risk, status = risk_and_status(index, exam)
            records.append(
                {
                    "watermarkId": f"WMK-{watermark_counter:03d}",
                    "paperId": f"{exam}-2026-{paper_set}",
                    "exam": exam,
                    "year": 2026,
                    "paperSet": paper_set,
                    "questionFingerprint": f"{watermark_counter:08x}"[-8:],
                    "centerCode": f"{code}-{(index % 50) + 1:02d}",
                    "centerName": center_name,
                    "city": city,
                    "state": state,
                    "printBatch": f"PB-{(index // 5) + 1:02d}",
                    "printerId": f"PR-{(index % 12) + 1:02d}",
                    "printedAt": "2026-05-15T00:00:00.000Z",
                    "distributedAt": "2026-06-01T00:00:00.000Z",
                    "riskLevel": risk,
                    "status": status,
                }
            )
            watermark_counter += 1
    return records


def risk_and_status(index: int, exam: str) -> tuple[str, str]:
    seed = (index * 7 + ord(exam[0])) % 100
    if seed < 8:
        return "critical", "compromised"
    if seed < 20:
        return "high", "investigating"
    if seed < 50:
        return "medium", "in_transit"
    if seed < 85:
        return "low", "registered"
    return "low", "received"
