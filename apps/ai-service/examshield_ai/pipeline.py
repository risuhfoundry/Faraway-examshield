from __future__ import annotations

import logging

from .detect import is_suspicious
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
            if _should_send_alert(analysis, detection):
                try:
                    self.telegram._send_alert(
                        created,
                        analysis,
                        detection,
                        text or "",
                        chat_id,
                        message,
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
        if not is_suspicious(detection):
            return False
        try:
            result = self.telegram._send_alert(created, {}, detection, text or "", chat_id, message)
            return result is not None and result.get("status") != "failed"
        except Exception:
            return False
