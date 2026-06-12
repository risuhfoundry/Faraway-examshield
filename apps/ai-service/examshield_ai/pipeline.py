from __future__ import annotations

import logging

from .detect import is_suspicious, scan_text
from .store import EvidenceStore, JsonObject
from .telegram import TelegramWebhook, _should_send_alert
from .workers import AnalysisTask, AnalysisWorkerPool, OcrRunner

logger = logging.getLogger(__name__)


class EvidencePipeline:
    """Coordinates Telegram ingestion, OCR workers, and post-analysis alerts."""

    def __init__(
        self,
        store: EvidenceStore,
        telegram: TelegramWebhook,
        workers: AnalysisWorkerPool,
    ) -> None:
        self.store = store
        self.telegram = telegram
        self.workers = workers

    def queue_media_analysis(
        self,
        *,
        created: JsonObject,
        detection: JsonObject,
        text: str | None,
        chat_id: str,
        message: JsonObject,
        ocr_runner: OcrRunner,
        job: JsonObject | None = None,
    ) -> JsonObject | None:
        """Queue OCR for media evidence. Returns the queued job or None if skipped."""
        evidence = created.get("evidence")
        if not evidence:
            return None

        evidence_id = str(evidence["evidenceId"])
        existing_job = self.store.get_active_job_for_evidence(evidence_id)
        if existing_job and (not job or existing_job["jobId"] != job.get("jobId")):
            logger.info(
                "Evidence %s already has active job %s",
                evidence_id,
                existing_job["jobId"],
            )
            return existing_job

        if self.workers.is_evidence_active(evidence_id):
            logger.info("Evidence %s already processing in worker pool", evidence_id)
            return existing_job or job

        if job:
            queued_job = job
        else:
            queued = self.store.create_analysis_job(evidence_id)
            queued_job = queued["job"]

        job_id = str(queued_job["jobId"])
        self._submit_job(
            job_id=job_id,
            evidence_id=evidence_id,
            created=created,
            detection=detection,
            text=text,
            chat_id=chat_id,
            message=message,
            ocr_runner=ocr_runner,
        )
        return queued_job

    def _submit_job(
        self,
        *,
        job_id: str,
        evidence_id: str,
        created: JsonObject,
        detection: JsonObject,
        text: str | None,
        chat_id: str,
        message: JsonObject,
        ocr_runner: OcrRunner,
    ) -> None:
        def on_complete(analysis: JsonObject, error: Exception | None) -> None:
            if error:
                try:
                    self.store.fail_analysis_job(job_id, str(error) or "Background OCR failed")
                except Exception as fail_exc:
                    logger.error("Failed to mark job %s failed: %s", job_id, fail_exc)
                return
            combined_detection = self._combined_detection(detection, text, analysis)
            if evidence_id:
                try:
                    self.store._update_evidence_record(
                        evidence_id,
                        lambda record: {**record, **self._detection_fields(combined_detection)},
                    )
                    self.store._update_telegram_event_for_evidence(
                        evidence_id,
                        lambda event: {**event, **self._detection_event_fields(combined_detection)},
                    )
                except Exception as meta_exc:
                    logger.warning("Failed to persist detection metadata for %s: %s", evidence_id, meta_exc)
            if _should_send_alert(analysis, combined_detection):
                try:
                    result = self.telegram._send_alert(
                        created,
                        analysis,
                        combined_detection,
                        text or "",
                        chat_id,
                        message,
                        store=self.store,
                    )
                    alert_sent = bool(result and result.get("status") == "ok")
                    self.store._update_evidence_record(
                        evidence_id,
                        lambda record: {**record, "telegramAlertSent": alert_sent},
                    )
                    self.store._update_telegram_event_for_evidence(
                        evidence_id,
                        lambda event: {**event, "alertSent": alert_sent},
                    )
                except Exception as alert_exc:
                    logger.error("Alert failed for evidence %s: %s", evidence_id, alert_exc)

        self.workers.submit(
            self.store,
            AnalysisTask(job_id=job_id, evidence_id=evidence_id),
            ocr_runner,
            on_complete=on_complete,
        )
        logger.info("Queued OCR job %s for evidence %s", job_id, evidence_id)

    def recover_interrupted_jobs(self, ocr_runner: OcrRunner) -> int:
        """Re-submit OCR jobs that were mid-flight when the service restarted."""
        jobs = self.store.reset_interrupted_processing_jobs()
        recovered = 0
        for job in jobs:
            job_id = str(job["jobId"])
            evidence_id = str(job["evidenceId"])

            def on_complete(
                _analysis: JsonObject,
                error: Exception | None,
                *,
                recovered_job_id: str = job_id,
            ) -> None:
                if not error:
                    return
                try:
                    self.store.fail_analysis_job(recovered_job_id, str(error) or "Background OCR failed")
                except Exception as fail_exc:
                    logger.error("Failed to mark recovered job %s failed: %s", recovered_job_id, fail_exc)

            if self.workers.submit(
                self.store,
                AnalysisTask(job_id=job_id, evidence_id=evidence_id),
                ocr_runner,
                on_complete=on_complete,
            ):
                recovered += 1
                logger.info("Recovered OCR job %s for evidence %s", job_id, evidence_id)
        return recovered

    def process_text_only_alert(
        self,
        created: JsonObject,
        detection: JsonObject,
        text: str | None,
        chat_id: str,
        message: JsonObject,
    ) -> bool:
        evidence = created.get("evidence") or {}
        evidence_id = str(evidence.get("evidenceId") or "")
        analysis: JsonObject = {}
        alert_activity = None
        if evidence_id:
            try:
                self.store._update_evidence_record(
                    evidence_id,
                    lambda record: {
                        **record,
                        "status": "analyzing",
                        "analysisStartedAt": record.get("analysisStartedAt") or record.get("uploadedAt"),
                    },
                )
                evidence = self.store.get_evidence_by_id(evidence_id)
                analysis = self.store.run_attribution_for_evidence(
                    evidence_id,
                    text or "",
                    evidence.get("ocrConfidence") if evidence else None,
                )
                report = analysis.get("forensicReport")
                if report and report.get("status") == "investigation-complete":
                    alert_result = self.store.create_critical_alert_if_needed(report, analysis.get("attribution"))
                else:
                    alert_result = self.store.create_detection_alert_if_needed(evidence_id, detection, report)
                alert_activity = alert_result.get("activity")
            except Exception as exc:
                logger.warning("Text-only attribution failed for %s: %s", evidence_id, exc)

        report = analysis.get("forensicReport") if isinstance(analysis.get("forensicReport"), dict) else None

        if not is_suspicious(detection):
            if evidence_id:
                self.store.complete_text_evidence(
                    evidence_id,
                    detection,
                    alert_sent=False,
                    forensic_report=report,
                )
            return False

        alert_sent = False
        try:
            result = self.telegram._send_alert(
                created,
                analysis,
                detection,
                text or "",
                chat_id,
                message,
                store=self.store,
            )
            alert_sent = bool(result and result.get("status") == "ok")
        except Exception:
            alert_sent = False

        if evidence_id:
            try:
                completed = self.store.complete_text_evidence(
                    evidence_id,
                    detection,
                    alert_sent=alert_sent,
                    forensic_report=report,
                )
                activities = [completed["activity"]]
                if alert_activity:
                    activities.append(alert_activity)
                completed["activity"] = activities
            except Exception as exc:
                logger.warning("Failed to complete text evidence %s: %s", evidence_id, exc)
        return alert_sent

    @staticmethod
    def _combined_detection(
        detection: JsonObject,
        caption_text: str | None,
        analysis: JsonObject,
    ) -> JsonObject:
        evidence = analysis.get("evidence") if isinstance(analysis.get("evidence"), dict) else {}
        ocr_text = evidence.get("ocrText") if isinstance(evidence, dict) else None
        combined = "\n".join(
            value.strip()
            for value in (caption_text or "", str(ocr_text or ""))
            if value and value.strip()
        )
        if not combined:
            return detection
        rescanned = scan_text(combined)
        return rescanned if rescanned.get("score", 0) >= detection.get("score", 0) else detection

    @staticmethod
    def _detection_fields(detection: JsonObject) -> JsonObject:
        from .store import detection_record_fields

        return detection_record_fields(detection)

    @staticmethod
    def _detection_event_fields(detection: JsonObject) -> JsonObject:
        from .store import detection_event_fields

        return detection_event_fields(detection)
