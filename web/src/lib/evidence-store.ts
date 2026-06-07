import { randomUUID } from "crypto";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type {
  AnalysisJob,
  AttributionRecord,
  EvidenceActivityEvent,
  EvidenceListResponse,
  EvidenceRecord,
  ForensicReport,
  WatermarkExtractionRecord,
} from "./evidence-types";
import { matchPaperFromOcr } from "./paper-matcher";
import { extractWatermarkFromText } from "./watermark-extractor";

const UPLOAD_ROOT = path.resolve(process.cwd(), "..", "apps", "api", "uploads", "evidence");
const FILES_DIR = path.join(UPLOAD_ROOT, "files");
const RECORDS_DIR = path.join(UPLOAD_ROOT, "records");
const JOBS_DIR = path.join(UPLOAD_ROOT, "jobs");
const ATTRIBUTIONS_DIR = path.join(UPLOAD_ROOT, "attributions");
const WATERMARKS_DIR = path.join(UPLOAD_ROOT, "watermarks");
const REPORTS_DIR = path.join(UPLOAD_ROOT, "reports");
const ACTIVITY_FILE = path.join(UPLOAD_ROOT, "activity.json");

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".pdf"]);

type StoredEvidenceRecord = EvidenceRecord & {
  storageId: string;
  originalFilename: string;
  storedFilename: string;
  storedAt: string;
};

export async function ensureEvidenceStorage() {
  await mkdir(FILES_DIR, { recursive: true });
  await mkdir(RECORDS_DIR, { recursive: true });
  await mkdir(JOBS_DIR, { recursive: true });
  await mkdir(ATTRIBUTIONS_DIR, { recursive: true });
  await mkdir(WATERMARKS_DIR, { recursive: true });
  await mkdir(REPORTS_DIR, { recursive: true });
}

export function validateEvidenceFile(file: File) {
  const extension = path.extname(file.name).toLowerCase();
  if (!ALLOWED_TYPES.has(file.type) || !ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("Only JPG, JPEG, PNG, and PDF evidence files are supported.");
  }
}

export async function createEvidence(file: File): Promise<{
  evidence: EvidenceRecord;
  activity: EvidenceActivityEvent;
}> {
  await ensureEvidenceStorage();
  validateEvidenceFile(file);

  const storageId = randomUUID();
  const evidenceId = await getNextEvidenceId();
  const extension = path.extname(file.name).toLowerCase();
  const storedFilename = `${storageId}${extension}`;
  const uploadedAt = new Date().toISOString();

  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(FILES_DIR, storedFilename), bytes);

  const evidence: EvidenceRecord = {
    evidenceId,
    filename: file.name,
    fileType: file.type,
    source: "manual-upload",
    uploadedAt,
    status: "pending-analysis",
    riskLevel: "unknown",
    ocrStatus: "not-started",
    ocrText: null,
    ocrConfidence: null,
    ocrProcessingTimeMs: null,
    analysisStartedAt: null,
    analysisCompletedAt: null,
  };

  const storedRecord: StoredEvidenceRecord = {
    ...evidence,
    storageId,
    originalFilename: file.name,
    storedFilename,
    storedAt: uploadedAt,
  };

  await writeFile(
    path.join(RECORDS_DIR, `${storageId}.json`),
    JSON.stringify(storedRecord, null, 2),
    "utf8",
  );

  const activity: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "evidence-uploaded",
    title: "Upload Received",
    evidenceId,
    timestamp: uploadedAt,
    detail: file.name,
  };

  await appendActivity(activity);

  return { evidence, activity };
}

export async function listEvidence(): Promise<EvidenceListResponse> {
  const records = await readStoredRecords();
  const evidence = records
    .map(toEvidenceRecord)
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  const activity = await readActivity();
  const jobs = await readAnalysisJobs();
  const attributions = await readAttributions();
  const watermarks = await readWatermarks();
  const forensicReports = await readForensicReports();

  return {
    evidence,
    activity,
    jobs,
    attributions,
    watermarks,
    forensicReports,
    stats: {
      totalEvidence: evidence.length,
      pendingAnalysis: evidence.filter((item) => item.status === "pending-analysis").length,
      processing: evidence.filter((item) => item.status === "analyzing").length,
      completed: evidence.filter((item) => item.status === "completed").length,
      failed: evidence.filter((item) => item.status === "analysis-failed").length,
    },
  };
}

export async function getEvidenceById(evidenceId: string): Promise<EvidenceRecord | null> {
  const records = await readStoredRecords();
  const record = records.find((item) => item.evidenceId === evidenceId);
  return record ? toEvidenceRecord(record) : null;
}

export async function getEvidenceBundle(evidenceId: string) {
  const evidence = await getEvidenceById(evidenceId);

  if (!evidence) {
    return null;
  }

  const activity = (await readActivity()).filter((event) => event.evidenceId === evidenceId);
  const jobs = (await readAnalysisJobs()).filter((job) => job.evidenceId === evidenceId);
  const attributions = (await readAttributions()).filter(
    (attribution) => attribution.evidenceId === evidenceId,
  );
  const attribution = attributions[0] ?? null;
  const watermarks = (await readWatermarks()).filter((watermark) => watermark.evidenceId === evidenceId);
  const watermark = watermarks[0] ?? null;
  const forensicReports = (await readForensicReports()).filter((report) => report.evidenceId === evidenceId);
  const forensicReport = forensicReports[0] ?? null;

  return {
    evidence,
    activity,
    jobs,
    attribution,
    attributions,
    watermark,
    watermarks,
    forensicReport,
    forensicReports,
  };
}

export async function getEvidenceAsset(evidenceId: string) {
  const records = await readStoredRecords();
  const record = records.find((item) => item.evidenceId === evidenceId);

  if (!record) {
    return null;
  }

  return {
    evidence: toEvidenceRecord(record),
    filePath: path.join(FILES_DIR, record.storedFilename),
    fileType: record.fileType,
    filename: record.filename,
  };
}

export async function createAnalysisJob(evidenceId: string) {
  const evidence = await getEvidenceById(evidenceId);

  if (!evidence) {
    throw new Error("Evidence not found.");
  }

  const now = new Date().toISOString();
  const job: AnalysisJob = {
    jobId: randomUUID(),
    evidenceId,
    type: "ocr",
    status: "queued",
    createdAt: now,
    startedAt: null,
    completedAt: null,
    confidence: null,
    processingTimeMs: null,
    error: null,
  };

  await writeAnalysisJob(job);
  await updateEvidenceRecord(evidenceId, (record) => ({
    ...record,
    status: "analyzing",
    ocrStatus: "queued",
    ocrText: null,
    ocrConfidence: null,
    ocrProcessingTimeMs: null,
    analysisStartedAt: null,
    analysisCompletedAt: null,
  }));

  const activity: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "analysis-queued",
    title: "Analysis Queued",
    evidenceId,
    jobId: job.jobId,
    timestamp: now,
  };
  await appendActivity(activity);

  return { job, activity };
}

export async function markAnalysisJobProcessing(jobId: string) {
  const job = await getAnalysisJob(jobId);

  if (!job) {
    throw new Error("Analysis job not found.");
  }

  const now = new Date().toISOString();
  const updatedJob: AnalysisJob = {
    ...job,
    status: "processing",
    startedAt: now,
  };

  await writeAnalysisJob(updatedJob);
  await updateEvidenceRecord(job.evidenceId, (record) => ({
    ...record,
    status: "analyzing",
    ocrStatus: "processing",
    analysisStartedAt: now,
  }));

  const activity: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "ocr-started",
    title: "OCR Started",
    evidenceId: job.evidenceId,
    jobId,
    timestamp: now,
  };
  await appendActivity(activity);

  return { job: updatedJob, activity };
}

export async function completeAnalysisJob(
  jobId: string,
  result: { text: string; confidence: number; processingTimeMs: number },
) {
  const job = await getAnalysisJob(jobId);

  if (!job) {
    throw new Error("Analysis job not found.");
  }

  const now = new Date().toISOString();
  const updatedJob: AnalysisJob = {
    ...job,
    status: "completed",
    completedAt: now,
    confidence: result.confidence,
    processingTimeMs: result.processingTimeMs,
    error: null,
  };

  await writeAnalysisJob(updatedJob);
  const evidence = await updateEvidenceRecord(job.evidenceId, (record) => ({
    ...record,
    status: "completed",
    ocrStatus: "completed",
    ocrText: result.text,
    ocrConfidence: result.confidence,
    ocrProcessingTimeMs: result.processingTimeMs,
    analysisCompletedAt: now,
  }));

  const completedEvent: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "ocr-complete",
    title: "OCR Complete",
    evidenceId: job.evidenceId,
    jobId,
    timestamp: now,
    detail: result.text.trim() ? "Text extracted" : "No Exam Content Detected",
  };
  const storedEvent: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "results-stored",
    title: "Results Stored",
    evidenceId: job.evidenceId,
    jobId,
    timestamp: addMilliseconds(now, 1),
  };

  await appendActivity(completedEvent);
  await appendActivity(storedEvent);

  return { evidence, job: updatedJob, activity: [completedEvent, storedEvent] };
}

export async function runAttributionForEvidence(
  evidenceId: string,
  ocrText: string,
  ocrConfidence: number | null,
) {
  const now = new Date().toISOString();
  const watermarkExtractedAt = addMilliseconds(now, 1);
  const attributionStartedAt = addMilliseconds(now, 2);
  const attributionCreatedAt = addMilliseconds(now, 3);
  const watermarkStartedEvent: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "watermark-extraction-started",
    title: "Watermark Extraction Started",
    evidenceId,
    timestamp: now,
  };
  await appendActivity(watermarkStartedEvent);

  const watermarkResult = extractWatermarkFromText(ocrText);
  const watermark: WatermarkExtractionRecord = {
    extractionId: getWatermarkExtractionId(evidenceId),
    evidenceId,
    watermarkId: watermarkResult.watermarkId,
    confidence: watermarkResult.confidence,
    status: watermarkResult.status,
    extractedAt: watermarkExtractedAt,
  };
  await writeWatermark(watermark);

  const watermarkActivity: EvidenceActivityEvent[] = [watermarkStartedEvent];
  if (watermark.status === "detected" && watermark.watermarkId) {
    const watermarkFoundEvent: EvidenceActivityEvent = {
      eventId: randomUUID(),
      type: "watermark-found",
      title: "Watermark Found",
      evidenceId,
      timestamp: watermark.extractedAt,
      detail: `${watermark.watermarkId} at ${watermark.confidence}% confidence`,
    };
    await appendActivity(watermarkFoundEvent);
    watermarkActivity.push(watermarkFoundEvent);
  }

  const startedEvent: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "attribution-started",
    title: "Attribution Started",
    evidenceId,
    timestamp: attributionStartedAt,
  };
  await appendActivity(startedEvent);

  const paperMatch = matchPaperFromOcr(ocrText);
  const registryRecord = watermarkResult.status === "detected" ? watermarkResult.registryRecord : null;
  const match = registryRecord
    ? {
        matchedPaperId: registryRecord.paperId,
        matchedExam: `${registryRecord.exam} ${registryRecord.year}`,
        matchedSet: registryRecord.paperSet,
        confidence: paperMatch?.confidence ?? 0,
        centerCode: registryRecord.centerCode,
        printerId: registryRecord.printerId,
        batchId: registryRecord.printBatch,
        status: registryRecord.status,
        matchedWatermarkId: registryRecord.watermarkId,
        centerName: registryRecord.centerName,
      }
    : paperMatch;

  if (!match) {
    const finalConfidence = 0;
    const attribution: AttributionRecord = {
      attributionId: getAttributionId(evidenceId),
      evidenceId,
      matchedPaperId: null,
      matchedExam: null,
      matchedSet: null,
      confidence: 0,
      centerCode: null,
      printerId: null,
      batchId: null,
      status: "no-match",
      matchedWatermarkId: null,
      centerName: null,
      ocrConfidence,
      watermarkConfidence: watermark.confidence,
      finalConfidence,
      createdAt: attributionCreatedAt,
    };

    await writeAttribution(attribution);
    const report = await writeForensicReport({
      reportId: getReportId(evidenceId),
      evidenceId,
      paperIdentified: null,
      watermarkId: watermark.watermarkId,
      centerCode: null,
      printerId: null,
      batchId: null,
      riskLevel: null,
      status: "no-match",
      ocrConfidence,
      watermarkConfidence: watermark.confidence,
      finalConfidence,
      timestamp: attribution.createdAt,
    });
    const completedEvent: EvidenceActivityEvent = {
      eventId: randomUUID(),
      type: "attribution-complete",
      title: "Attribution Complete",
      evidenceId,
      timestamp: addMilliseconds(attribution.createdAt, 1),
      detail: ocrText.trim() ? "No registry match found" : "No OCR text available",
    };
    await appendActivity(completedEvent);

    return {
      attribution,
      watermark,
      forensicReport: report,
      activity: [...watermarkActivity, startedEvent, completedEvent],
    };
  }

  const finalConfidence = getFinalConfidence(ocrConfidence, match.confidence, watermark.confidence);
  const attribution: AttributionRecord = {
    attributionId: getAttributionId(evidenceId),
    evidenceId,
    matchedPaperId: match.matchedPaperId,
    matchedExam: match.matchedExam,
    matchedSet: match.matchedSet,
    confidence: match.confidence,
    centerCode: match.centerCode,
    printerId: match.printerId,
    batchId: match.batchId,
    status: match.status,
    matchedWatermarkId: match.matchedWatermarkId,
    centerName: match.centerName,
    ocrConfidence,
    watermarkConfidence: watermark.confidence,
    finalConfidence,
    createdAt: attributionCreatedAt,
  };

  await writeAttribution(attribution);
  const report = await writeForensicReport({
    reportId: getReportId(evidenceId),
    evidenceId,
    paperIdentified: match.matchedPaperId,
    watermarkId: watermark.watermarkId ?? match.matchedWatermarkId,
    centerCode: match.centerCode,
    printerId: match.printerId,
    batchId: match.batchId,
    riskLevel: match.status === "compromised" ? "critical" : match.status,
    status: "investigation-complete",
    ocrConfidence,
    watermarkConfidence: watermark.confidence,
    finalConfidence,
    timestamp: attribution.createdAt,
  });

  const matchedEvent: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "paper-matched",
    title: "Paper Matched",
    evidenceId,
    timestamp: attribution.createdAt,
    detail: `${match.matchedPaperId} at ${match.confidence}% confidence`,
  };
  const sourceEvent: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "source-identified",
    title: "Source Identified",
    evidenceId,
    timestamp: addMilliseconds(attribution.createdAt, 1),
    detail: `${match.centerCode} / ${match.printerId} / ${match.batchId}`,
  };
  const completedEvent: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "attribution-complete",
    title: "Attribution Complete",
    evidenceId,
    timestamp: addMilliseconds(attribution.createdAt, 2),
    detail: match.status.toUpperCase(),
  };
  const investigationCompletedEvent: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "investigation-completed",
    title: "Investigation Completed",
    evidenceId,
    timestamp: addMilliseconds(attribution.createdAt, 3),
    detail: `${finalConfidence}% final confidence`,
  };

  await appendActivity(matchedEvent);
  await appendActivity(sourceEvent);
  await appendActivity(completedEvent);
  await appendActivity(investigationCompletedEvent);

  return {
    attribution,
    watermark,
    forensicReport: report,
    activity: [
      ...watermarkActivity,
      startedEvent,
      matchedEvent,
      sourceEvent,
      completedEvent,
      investigationCompletedEvent,
    ],
  };
}

export async function failAnalysisJob(jobId: string, message: string) {
  const job = await getAnalysisJob(jobId);

  if (!job) {
    throw new Error("Analysis job not found.");
  }

  const now = new Date().toISOString();
  const updatedJob: AnalysisJob = {
    ...job,
    status: "failed",
    completedAt: now,
    error: message,
  };

  await writeAnalysisJob(updatedJob);
  const evidence = await updateEvidenceRecord(job.evidenceId, (record) => ({
    ...record,
    status: "analysis-failed",
    ocrStatus: "failed",
    analysisCompletedAt: now,
  }));

  const activity: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "analysis-failed",
    title: "Analysis Failed",
    evidenceId: job.evidenceId,
    jobId,
    timestamp: now,
    detail: message,
  };

  await appendActivity(activity);

  return { evidence, job: updatedJob, activity: [activity] };
}

async function getNextEvidenceId() {
  const records = await readStoredRecords();
  const maxNumber = records.reduce((max, record) => {
    const match = /^EV-(\d+)$/.exec(record.evidenceId);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `EV-${String(maxNumber + 1).padStart(3, "0")}`;
}

async function readStoredRecords(): Promise<StoredEvidenceRecord[]> {
  await ensureEvidenceStorage();

  const entries = await readdir(RECORDS_DIR, { withFileTypes: true });
  const records = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const raw = await readFile(path.join(RECORDS_DIR, entry.name), "utf8");
        return JSON.parse(raw) as StoredEvidenceRecord;
      }),
  );

  return records;
}

async function updateEvidenceRecord(
  evidenceId: string,
  updater: (record: StoredEvidenceRecord) => StoredEvidenceRecord,
) {
  const records = await readStoredRecords();
  const record = records.find((item) => item.evidenceId === evidenceId);

  if (!record) {
    throw new Error("Evidence not found.");
  }

  const updatedRecord = updater(normalizeStoredRecord(record));
  await writeStoredRecord(updatedRecord);
  return toEvidenceRecord(updatedRecord);
}

async function writeStoredRecord(record: StoredEvidenceRecord) {
  await ensureEvidenceStorage();
  await writeFile(
    path.join(RECORDS_DIR, `${record.storageId}.json`),
    JSON.stringify(record, null, 2),
    "utf8",
  );
}

async function readAnalysisJobs(): Promise<AnalysisJob[]> {
  await ensureEvidenceStorage();

  const entries = await readdir(JOBS_DIR, { withFileTypes: true });
  const jobs = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const raw = await readFile(path.join(JOBS_DIR, entry.name), "utf8");
        return JSON.parse(raw) as AnalysisJob;
      }),
  );

  return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function readAttributions(): Promise<AttributionRecord[]> {
  await ensureEvidenceStorage();

  const entries = await readdir(ATTRIBUTIONS_DIR, { withFileTypes: true });
  const attributions = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const raw = await readFile(path.join(ATTRIBUTIONS_DIR, entry.name), "utf8");
        return JSON.parse(raw) as AttributionRecord;
      }),
  );

  return attributions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

async function readWatermarks(): Promise<WatermarkExtractionRecord[]> {
  await ensureEvidenceStorage();

  const entries = await readdir(WATERMARKS_DIR, { withFileTypes: true });
  const watermarks = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const raw = await readFile(path.join(WATERMARKS_DIR, entry.name), "utf8");
        return JSON.parse(raw) as WatermarkExtractionRecord;
      }),
  );

  return watermarks.sort(
    (a, b) => new Date(b.extractedAt).getTime() - new Date(a.extractedAt).getTime(),
  );
}

async function readForensicReports(): Promise<ForensicReport[]> {
  await ensureEvidenceStorage();

  const entries = await readdir(REPORTS_DIR, { withFileTypes: true });
  const reports = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const raw = await readFile(path.join(REPORTS_DIR, entry.name), "utf8");
        return JSON.parse(raw) as ForensicReport;
      }),
  );

  return reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

async function getAnalysisJob(jobId: string): Promise<AnalysisJob | null> {
  await ensureEvidenceStorage();

  try {
    const raw = await readFile(path.join(JOBS_DIR, `${jobId}.json`), "utf8");
    return JSON.parse(raw) as AnalysisJob;
  } catch {
    return null;
  }
}

async function writeAnalysisJob(job: AnalysisJob) {
  await ensureEvidenceStorage();
  await writeFile(path.join(JOBS_DIR, `${job.jobId}.json`), JSON.stringify(job, null, 2), "utf8");
}

async function writeAttribution(attribution: AttributionRecord) {
  await ensureEvidenceStorage();
  await writeFile(
    path.join(ATTRIBUTIONS_DIR, `${attribution.evidenceId}.json`),
    JSON.stringify(attribution, null, 2),
    "utf8",
  );
}

async function writeWatermark(watermark: WatermarkExtractionRecord) {
  await ensureEvidenceStorage();
  await writeFile(
    path.join(WATERMARKS_DIR, `${watermark.evidenceId}.json`),
    JSON.stringify(watermark, null, 2),
    "utf8",
  );
}

async function writeForensicReport(report: ForensicReport) {
  await ensureEvidenceStorage();
  await writeFile(
    path.join(REPORTS_DIR, `${report.evidenceId}.json`),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  return report;
}

async function readActivity(): Promise<EvidenceActivityEvent[]> {
  await ensureEvidenceStorage();

  try {
    const raw = await readFile(ACTIVITY_FILE, "utf8");
    return (JSON.parse(raw) as EvidenceActivityEvent[]).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  } catch {
    return [];
  }
}

async function appendActivity(activity: EvidenceActivityEvent) {
  const existing = await readActivity();
  await writeFile(
    ACTIVITY_FILE,
    JSON.stringify([activity, ...existing].slice(0, 50), null, 2),
    "utf8",
  );
}

function toEvidenceRecord(record: StoredEvidenceRecord): EvidenceRecord {
  const normalized = normalizeStoredRecord(record);

  return {
    evidenceId: normalized.evidenceId,
    filename: normalized.filename,
    fileType: normalized.fileType,
    source: normalized.source,
    uploadedAt: normalized.uploadedAt,
    status: normalized.status,
    riskLevel: normalized.riskLevel,
    ocrStatus: normalized.ocrStatus,
    ocrText: normalized.ocrText,
    ocrConfidence: normalized.ocrConfidence,
    ocrProcessingTimeMs: normalized.ocrProcessingTimeMs,
    analysisStartedAt: normalized.analysisStartedAt,
    analysisCompletedAt: normalized.analysisCompletedAt,
  };
}

function normalizeStoredRecord(record: StoredEvidenceRecord): StoredEvidenceRecord {
  return {
    ...record,
    ocrStatus: record.ocrStatus ?? "not-started",
    ocrText: record.ocrText ?? null,
    ocrConfidence: record.ocrConfidence ?? null,
    ocrProcessingTimeMs: record.ocrProcessingTimeMs ?? null,
    analysisStartedAt: record.analysisStartedAt ?? null,
    analysisCompletedAt: record.analysisCompletedAt ?? null,
  };
}

function getAttributionId(evidenceId: string) {
  const suffix = evidenceId.replace(/^EV-/, "");
  return `ATTR-${suffix}`;
}

function getWatermarkExtractionId(evidenceId: string) {
  const suffix = evidenceId.replace(/^EV-/, "");
  return `WMX-${suffix}`;
}

function getReportId(evidenceId: string) {
  const suffix = evidenceId.replace(/^EV-/, "");
  return `FR-${suffix}`;
}

function addMilliseconds(timestamp: string, milliseconds: number) {
  const date = new Date(timestamp);
  date.setMilliseconds(date.getMilliseconds() + milliseconds);
  return date.toISOString();
}

function getFinalConfidence(
  ocrConfidence: number | null,
  paperConfidence: number | null,
  watermarkConfidence: number | null,
) {
  if (watermarkConfidence !== null && watermarkConfidence > 0) {
    const ocrComponent = paperConfidence ?? ocrConfidence ?? 0;
    return Math.round(ocrComponent * 0.4 + watermarkConfidence * 0.6);
  }

  return paperConfidence ?? ocrConfidence ?? 0;
}
