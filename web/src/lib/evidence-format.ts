import type {
  AnalysisJobStatus,
  EvidenceRecord,
  EvidenceSource,
  EvidenceStatus,
  OcrStatus,
} from "./evidence-types";

export function isTextEvidence(evidence: Pick<EvidenceRecord, "fileType"> | null | undefined) {
  return evidence?.fileType === "text/plain";
}

export function formatDetectionScore(
  score: number | null | undefined,
  maxScore: number | null | undefined,
) {
  if (score === null || score === undefined || !maxScore) {
    return "Pending";
  }
  return `${score}/${maxScore}`;
}

export function detectionPercent(
  score: number | null | undefined,
  maxScore: number | null | undefined,
) {
  if (score === null || score === undefined || !maxScore) {
    return null;
  }
  return Math.round((score / maxScore) * 100);
}

export function formatEvidenceStatus(status: EvidenceStatus) {
  const labels: Record<EvidenceStatus, string> = {
    "pending-analysis": "Pending Analysis",
    analyzing: "Analyzing",
    completed: "Completed",
    "analysis-failed": "Analysis Failed",
    investigating: "Investigating",
    resolved: "Resolved",
  };

  return labels[status];
}

export function formatOcrStatus(status: OcrStatus) {
  const labels: Record<OcrStatus, string> = {
    "not-started": "Not Started",
    queued: "Queued",
    processing: "Processing",
    completed: "Completed",
    failed: "Failed",
    "not-applicable": "Not Applicable",
  };

  return labels[status];
}

export function formatAnalysisJobStatus(status: AnalysisJobStatus) {
  const labels: Record<AnalysisJobStatus, string> = {
    queued: "Queued",
    processing: "Processing",
    completed: "Completed",
    failed: "Failed",
  };

  return labels[status];
}

export function formatEvidenceSource(source: EvidenceSource) {
  const labels: Record<EvidenceSource, string> = {
    "manual-upload": "Manual Upload",
    telegram: "Telegram",
  };

  return labels[source];
}

export function formatEvidenceTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

export function formatEvidenceDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}
