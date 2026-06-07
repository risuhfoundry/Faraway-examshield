import type { AnalysisJobStatus, EvidenceStatus, OcrStatus } from "./evidence-types";

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
