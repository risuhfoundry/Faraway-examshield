export type EvidenceStatus =
  | "pending-analysis"
  | "analyzing"
  | "completed"
  | "analysis-failed"
  | "investigating"
  | "resolved";
export type EvidenceRiskLevel = "unknown";
export type OcrStatus = "not-started" | "queued" | "processing" | "completed" | "failed";
export type AnalysisJobStatus = "queued" | "processing" | "completed" | "failed";

export type EvidenceRecord = {
  evidenceId: string;
  filename: string;
  fileType: string;
  source: "manual-upload";
  uploadedAt: string;
  status: EvidenceStatus;
  riskLevel: EvidenceRiskLevel;
  ocrStatus: OcrStatus;
  ocrText: string | null;
  ocrConfidence: number | null;
  ocrProcessingTimeMs: number | null;
  analysisStartedAt: string | null;
  analysisCompletedAt: string | null;
};

export type AnalysisJob = {
  jobId: string;
  evidenceId: string;
  type: "ocr";
  status: AnalysisJobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  confidence: number | null;
  processingTimeMs: number | null;
  error: string | null;
};

export type EvidenceActivityEvent = {
  eventId: string;
  type:
    | "evidence-uploaded"
    | "analysis-queued"
    | "ocr-started"
    | "ocr-complete"
    | "analysis-failed"
    | "results-stored";
  title:
    | "Upload Received"
    | "Evidence Uploaded"
    | "Analysis Queued"
    | "OCR Started"
    | "OCR Complete"
    | "Analysis Failed"
    | "Results Stored";
  evidenceId: string;
  jobId?: string;
  timestamp: string;
  detail?: string;
};

export type EvidenceListResponse = {
  evidence: EvidenceRecord[];
  activity: EvidenceActivityEvent[];
  jobs: AnalysisJob[];
  stats: {
    totalEvidence: number;
    pendingAnalysis: number;
    processing: number;
    completed: number;
    failed: number;
  };
};

export type EvidenceUploadResponse = {
  message: "Evidence Created";
  evidence: EvidenceRecord;
  activity: EvidenceActivityEvent;
};

export type AnalysisJobResponse = {
  message: "Analysis Queued" | "Analysis Complete" | "Analysis Failed";
  evidence: EvidenceRecord;
  job: AnalysisJob;
  activity: EvidenceActivityEvent[];
};
