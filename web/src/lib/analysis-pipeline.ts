import {
  completeAnalysisJob,
  createCriticalAlertIfNeeded,
  failAnalysisJob,
  getEvidenceAsset,
  markAnalysisJobProcessing,
  recordEvidenceActivity,
  runAttributionForEvidence,
} from "./evidence-store";
import type { AnalysisJobResponse, EvidenceActivityEvent } from "./evidence-types";
import { runOcrWorker } from "./ocr-worker-client";

export async function runAnalysisJob(jobId: string): Promise<AnalysisJobResponse> {
  const timeline: EvidenceActivityEvent[] = [];
  let evidenceId: string | null = null;

  try {
    const processing = await markAnalysisJobProcessing(jobId);
    evidenceId = processing.job.evidenceId;
    timeline.push(processing.activity);

    const analysisStarted = await recordEvidenceActivity({
      type: "analysis-started",
      title: "Analysis Started",
      evidenceId,
      jobId,
      timestamp: processing.activity.timestamp,
    });
    timeline.push(analysisStarted);

    const asset = await getEvidenceAsset(evidenceId);
    if (!asset) {
      throw new Error("Evidence file was not found.");
    }

    const ocrResult = await runOcrWorker(asset);
    const completed = await completeAnalysisJob(jobId, ocrResult);
    timeline.push(...completed.activity);

    const attribution = await runAttributionForEvidence(
      completed.evidence.evidenceId,
      completed.evidence.ocrText ?? "",
      completed.evidence.ocrConfidence,
    );
    timeline.push(...attribution.activity);

    const analysisCompleted = await recordEvidenceActivity({
      type: "analysis-completed",
      title: "Analysis Completed",
      evidenceId: completed.evidence.evidenceId,
      jobId,
      timestamp: addMilliseconds(attribution.forensicReport.timestamp, 4),
      detail: attribution.forensicReport.status === "investigation-complete"
        ? `${attribution.forensicReport.finalConfidence}% final confidence`
        : "No registry match",
    });
    timeline.push(analysisCompleted);

    const alert = await createCriticalAlertIfNeeded(
      attribution.forensicReport,
      attribution.attribution,
    );
    if (alert.activity) {
      timeline.push(alert.activity);
    }

    return {
      message: "Analysis Complete",
      evidence: completed.evidence,
      job: completed.job,
      attribution: attribution.attribution,
      watermark: attribution.watermark,
      forensicReport: attribution.forensicReport,
      alert: alert.alert,
      activity: timeline,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed.";

    try {
      const failed = await failAnalysisJob(jobId, message);
      return {
        message: "Analysis Failed",
        evidence: failed.evidence,
        job: failed.job,
        activity: [...timeline, ...failed.activity],
      };
    } catch {
      throw new Error(evidenceId ? message : "Analysis job not found.");
    }
  }
}

function addMilliseconds(timestamp: string, milliseconds: number) {
  const date = new Date(timestamp);
  date.setMilliseconds(date.getMilliseconds() + milliseconds);
  return date.toISOString();
}
