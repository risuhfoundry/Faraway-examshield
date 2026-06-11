from __future__ import annotations

from examshield_ai.store import EvidenceStore

from tests.conftest import make_image_upload


def test_analysis_job_snapshot_reports_failed_status(store: EvidenceStore):
    created = store.create_evidence(make_image_upload())
    evidence_id = created["evidence"]["evidenceId"]
    queued = store.create_analysis_job(evidence_id)
    job_id = queued["job"]["jobId"]
    store.fail_analysis_job(job_id, "OCR timed out")

    snapshot = store.analysis_job_snapshot(job_id)

    assert snapshot["message"] == "Analysis Failed"
    assert snapshot["job"]["status"] == "failed"
