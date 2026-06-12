export type EvidenceStatus =
  | "pending-analysis"
  | "analyzing"
  | "completed"
  | "analysis-failed"
  | "investigating"
  | "resolved";
export type EvidenceRiskLevel = "unknown" | "low" | "medium" | "high" | "critical";
export type EvidenceSource = "manual-upload" | "telegram";
export type OcrStatus = "not-started" | "queued" | "processing" | "completed" | "failed" | "not-applicable";
export type AnalysisJobStatus = "queued" | "processing" | "completed" | "failed";
export type WatermarkStatus = "not-detected" | "detected" | "invalid";
export type AttributionStatus =
  | "registered"
  | "in_transit"
  | "received"
  | "compromised"
  | "investigating"
  | "no-match";

export type EvidenceRecord = {
  evidenceId: string;
  filename: string;
  fileType: string;
  source: EvidenceSource;
  uploadedAt: string;
  status: EvidenceStatus;
  riskLevel: EvidenceRiskLevel;
  telegramMessageId: string | null;
  telegramChatId: string | null;
  telegramTimestamp: string | null;
  ocrStatus: OcrStatus;
  ocrText: string | null;
  ocrConfidence: number | null;
  ocrProcessingTimeMs: number | null;
  analysisStartedAt: string | null;
  analysisCompletedAt: string | null;
  detectionScore: number | null;
  detectionMaxScore: number | null;
  detectionCategories: string[];
  detectionSeverity: EvidenceRiskLevel | null;
  detectionMatches: DetectionMatch[];
  telegramAlertSent: boolean;
};

export type TelegramEvent = {
  eventId: string;
  messageId: string;
  chatId: string;
  timestamp: string;
  evidenceId: string | null;
  text: string | null;
  filename: string | null;
  fileType: string | null;
  receivedAt: string;
  detectionScore?: number | null;
  detectionMaxScore?: number | null;
  detectionCategories?: string[];
  detectionSeverity?: EvidenceRiskLevel | null;
  detectionMatches?: DetectionMatch[];
  alertSent?: boolean;
};

export type DetectionMatch = {
  type: string | null;
  text: string | null;
  category: string | null;
  description: string | null;
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

export type AttributionRecord = {
  attributionId: string;
  evidenceId: string;
  matchedPaperId: string | null;
  matchedExam: string | null;
  matchedSet: string | null;
  confidence: number;
  centerCode: string | null;
  printerId: string | null;
  batchId: string | null;
  status: AttributionStatus;
  matchedWatermarkId: string | null;
  centerName: string | null;
  city: string | null;
  state: string | null;
  ocrConfidence: number | null;
  watermarkConfidence: number | null;
  finalConfidence: number;
  createdAt: string;
};

export type WatermarkExtractionRecord = {
  extractionId: string;
  evidenceId: string;
  watermarkId: string | null;
  confidence: number;
  status: WatermarkStatus;
  extractedAt: string;
};

export type ForensicReport = {
  reportId: string;
  evidenceId: string;
  paperIdentified: string | null;
  watermarkId: string | null;
  centerCode: string | null;
  printerId: string | null;
  batchId: string | null;
  centerName?: string | null;
  city?: string | null;
  state?: string | null;
  riskLevel: string | null;
  status: "investigation-complete" | "no-match";
  ocrConfidence: number | null;
  watermarkConfidence: number | null;
  finalConfidence: number;
  timestamp: string;
};

export type AlertRecord = {
  alertId: string;
  evidenceId: string;
  paperId: string | null;
  centerCode: string | null;
  watermarkId: string | null;
  confidence: number;
  risk: string;
  createdAt: string;
  status: "open";
  detectionScore?: number | null;
  detectionMaxScore?: number | null;
};

export type EvidenceActivityEvent = {
  eventId: string;
  type:
    | "evidence-uploaded"
    | "telegram-message-detected"
    | "evidence-created"
    | "analysis-queued"
    | "analysis-started"
    | "analysis-completed"
    | "ocr-started"
    | "ocr-complete"
    | "watermark-extraction-started"
    | "watermark-found"
    | "attribution-started"
    | "paper-matched"
    | "source-identified"
    | "attribution-complete"
    | "investigation-completed"
    | "critical-alert-generated"
    | "detection-alert-generated"
    | "text-evidence-created"
    | "text-evidence-completed"
    | "analysis-failed"
    | "results-stored";
  title:
    | "Upload Received"
    | "Evidence Uploaded"
    | "Telegram Message Detected"
    | "Evidence Created"
    | "Analysis Queued"
    | "Analysis Started"
    | "Analysis Completed"
    | "OCR Started"
    | "OCR Complete"
    | "Watermark Extraction Started"
    | "Watermark Found"
    | "Attribution Started"
    | "Paper Matched"
    | "Source Identified"
    | "Attribution Complete"
    | "Investigation Completed"
    | "Critical Alert Generated"
    | "Detection Alert Generated"
    | "Suspicious Text Detected"
    | "Text Evidence Completed"
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
  attributions: AttributionRecord[];
  watermarks: WatermarkExtractionRecord[];
  forensicReports: ForensicReport[];
  telegramEvents: TelegramEvent[];
  alerts: AlertRecord[];
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
  attribution?: AttributionRecord | null;
  watermark?: WatermarkExtractionRecord | null;
  forensicReport?: ForensicReport | null;
  alert?: AlertRecord | null;
  activity: EvidenceActivityEvent[];
};
